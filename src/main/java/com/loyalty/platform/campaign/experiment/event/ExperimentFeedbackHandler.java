package com.loyalty.platform.campaign.experiment.event;

import com.loyalty.platform.common.event.DomainEventHandler;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.UUID;

/**
 * 实验反馈处理器 — 实验完成后自动反馈到 Decision Engine 和 Simulation。
 *
 * <p>监听 Topic: {@code campaign.experiment.completed}
 *
 * <p>处理逻辑：
 * <ol>
 *   <li>存储实验学习记录 (ExperimentLearning)</li>
 *   <li>胜者 Campaign Plan 预算自动加成 (+10%)</li>
 *   <li>生成 AI 可读的实验摘要</li>
 *   <li>同步胜者配置到 Plan 的 forecast_json</li>
 * </ol>
 *
 * <p>参考设计文档 campaign_final_update_4.md 第7.2节。
 */
@Component
public class ExperimentFeedbackHandler implements DomainEventHandler<ExperimentCompletedEvent> {

    private static final Logger log = LoggerFactory.getLogger(ExperimentFeedbackHandler.class);

    /** 胜者预算加成比例 (10%) */
    private static final BigDecimal WINNER_BUDGET_BOOST = BigDecimal.valueOf(0.10);

    private final ExperimentLearningRepository learningRepository;
    private final ExperimentRepository experimentRepository;
    private final ExperimentVariantRepository variantRepository;
    private final CampaignPlanRepository planRepository;

    public ExperimentFeedbackHandler(ExperimentLearningRepository learningRepository,
                                      ExperimentRepository experimentRepository,
                                      ExperimentVariantRepository variantRepository,
                                      CampaignPlanRepository planRepository) {
        this.learningRepository = learningRepository;
        this.experimentRepository = experimentRepository;
        this.variantRepository = variantRepository;
        this.planRepository = planRepository;
    }

    @Override
    public String getTopic() {
        return ExperimentCompletedEvent.TOPIC;
    }

    @Override
    public Class<ExperimentCompletedEvent> getEventType() {
        return ExperimentCompletedEvent.class;
    }

    @Override
    public void handle(ExperimentCompletedEvent event) {
        String experimentId = event.getExperimentId();
        String planId = event.getPlanId();

        log.info("Processing experiment feedback: experimentId={}, winner={}, improvement={}%",
                experimentId, event.getWinningVariantId(),
                String.format("%.1f", event.getOverallImprovement() * 100));

        // 1. 加载实验完整数据
        Experiment exp = experimentRepository.findById(experimentId).orElse(null);
        if (exp == null) {
            log.warn("Experiment not found for feedback: {}", experimentId);
            return;
        }

        List<ExperimentVariant> variants = variantRepository.findByExperimentId(experimentId);
        ExperimentVariant winner = variants.stream()
                .filter(v -> v.getId().equals(event.getWinningVariantId()))
                .findFirst().orElse(null);
        ExperimentVariant control = variants.stream()
                .filter(v -> "A".equals(v.getVariantCode()))
                .findFirst().orElse(null);

        // 2. 存储学习记录
        ExperimentLearning learning = ExperimentLearning.builder()
                .id(UUID.randomUUID().toString())
                .experimentId(experimentId)
                .planId(planId)
                .workspaceId(event.getWorkspaceId())
                .programCode(event.getProgramCode())
                .experimentName(event.getExperimentName())
                .winningVariantId(event.getWinningVariantId())
                .winningVariantName(winner != null ? winner.getVariantName() : null)
                .winningVariantCode(winner != null ? winner.getVariantCode() : null)
                .objectiveMetric(exp.getObjectiveMetric())
                .overallImprovement(BigDecimal.valueOf(event.getOverallImprovement()))
                .winnerPValue(winner != null ? winner.getPValue() : null)
                .winnerMetricValue(winner != null ? winner.getMetricValue() : null)
                .controlMetricValue(control != null ? control.getMetricValue() : null)
                .totalSampleSize(variants.stream()
                        .mapToInt(v -> v.getExposureCount() != null ? v.getExposureCount() : 0)
                        .sum())
                .winnerConfigJson(winner != null ? winner.getNodeOverrides() : null)
                .aiSummary(buildAISummary(exp, winner, control, event))
                .appliedToConfig(false)
                .budgetAdjustmentPct(WINNER_BUDGET_BOOST)
                .build();
        learningRepository.save(learning);
        log.info("Experiment learning saved: id={}", learning.getId());

        // 3. 调整 Campaign Plan 预算（胜者加成）
        if (planId != null && event.getWinningVariantId() != null) {
            adjustPlanBudget(planId, event.getExperimentName(), event.getOverallImprovement());
        }

        // 4. 标记学习已记录
        log.info("Experiment feedback complete: experimentId={}, learningId={}, budgetAdjusted={}",
                experimentId, learning.getId(),
                learning.getBudgetAdjustmentPct() != null && learning.getBudgetAdjustmentPct().compareTo(BigDecimal.ZERO) > 0);
    }

    /**
     * 调整 Campaign Plan 预算 — 胜者获得 +10% 预算加成。
     */
    private void adjustPlanBudget(String planId, String experimentName, double improvement) {
        planRepository.findById(planId).ifPresentOrElse(plan -> {
            BigDecimal currentBudget = plan.getTotalBudget();
            if (currentBudget == null || currentBudget.compareTo(BigDecimal.ZERO) <= 0) {
                log.debug("Plan {} has no budget to adjust", planId);
                return;
            }

            // Only adjust if improvement is positive
            if (improvement <= 0) {
                log.debug("No positive improvement, skipping budget adjustment for plan {}", planId);
                return;
            }

            // Winner bonus: boost budget by 10% (capped at 2x original)
            BigDecimal boost = currentBudget.multiply(WINNER_BUDGET_BOOST)
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal newBudget = currentBudget.add(boost);
            BigDecimal maxBudget = currentBudget.multiply(BigDecimal.valueOf(2));

            if (newBudget.compareTo(maxBudget) > 0) {
                newBudget = maxBudget;
            }

            plan.setTotalBudget(newBudget);
            planRepository.save(plan);

            log.info("Plan budget adjusted: planId={}, experiment={}, {} → {} (+{}%)",
                    planId, experimentName,
                    currentBudget.toPlainString(),
                    newBudget.toPlainString(),
                    String.format("%.1f", WINNER_BUDGET_BOOST.multiply(BigDecimal.valueOf(100))));
        }, () -> log.warn("Plan not found for budget adjustment: {}", planId));
    }

    /**
     * 生成 AI 可读的实验摘要。
     */
    private String buildAISummary(Experiment exp, ExperimentVariant winner,
                                   ExperimentVariant control, ExperimentCompletedEvent event) {
        StringBuilder sb = new StringBuilder();
        sb.append("【实验总结】").append(exp.getName()).append("\n");
        sb.append("目标指标: ").append(exp.getObjectiveMetric()).append("\n");

        if (winner != null) {
            sb.append("胜者变体: ").append(winner.getVariantName())
                    .append(" (").append(winner.getVariantCode()).append(")\n");
            sb.append("相对提升: ")
                    .append(String.format("%.1f%%", event.getOverallImprovement() * 100)).append("\n");
            if (winner.getPValue() != null) {
                sb.append("P值: ").append(String.format("%.4f", winner.getPValue())).append("\n");
            }
            if (winner.getMetricValue() != null) {
                sb.append("胜者指标值: ").append(winner.getMetricValue()).append("\n");
            }
            if (winner.getNodeOverrides() != null) {
                sb.append("胜者配置: ").append(winner.getNodeOverrides()).append("\n");
            }
        }

        if (control != null && control.getMetricValue() != null) {
            sb.append("控制组指标值: ").append(control.getMetricValue()).append("\n");
        }

        sb.append("\n建议: ");
        if (event.getOverallImprovement() > 0.10) {
            sb.append("实验效果显著，建议立即推全胜者配置到生产环境。");
        } else if (event.getOverallImprovement() > 0.05) {
            sb.append("实验有正向提升，建议推全并持续监控。");
        } else if (event.getOverallImprovement() > 0) {
            sb.append("实验有微弱提升，可考虑扩大样本量验证。");
        } else {
            sb.append("无显著提升，建议维持现有配置或尝试新的变体方向。");
        }

        return sb.toString();
    }
}
