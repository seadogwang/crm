package com.loyalty.platform.campaign.experiment;

import com.loyalty.platform.campaign.experiment.event.ExperimentCompletedEvent;
import com.loyalty.platform.common.event.EventBridge;
import com.loyalty.platform.domain.entity.campaign.Experiment;
import com.loyalty.platform.domain.entity.campaign.ExperimentAssignment;
import com.loyalty.platform.domain.entity.campaign.ExperimentVariant;
import com.loyalty.platform.domain.repository.campaign.ExperimentAssignmentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentVariantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;

/**
 * 实验状态自动调度 — 检查运行中的实验，自动完成和推全。
 *
 * <p>完成实验后通过 {@link EventBridge} 发布
 * {@link ExperimentCompletedEvent} 通知下游系统。
 */
@Component
public class ExperimentScheduler {

    private static final Logger log = LoggerFactory.getLogger(ExperimentScheduler.class);

    private final ExperimentRepository experimentRepository;
    private final ExperimentVariantRepository variantRepository;
    private final ExperimentAssignmentRepository assignmentRepository;
    private final ExperimentStatisticsEngine statsEngine;
    private final EventBridge eventBridge;

    public ExperimentScheduler(ExperimentRepository experimentRepository,
                                ExperimentVariantRepository variantRepository,
                                ExperimentAssignmentRepository assignmentRepository,
                                ExperimentStatisticsEngine statsEngine,
                                EventBridge eventBridge) {
        this.experimentRepository = experimentRepository;
        this.variantRepository = variantRepository;
        this.assignmentRepository = assignmentRepository;
        this.statsEngine = statsEngine;
        this.eventBridge = eventBridge;
    }

    /**
     * 每分钟检查运行中的实验状态。
     */
    @Scheduled(fixedDelay = 60000)
    @Transactional
    public void checkExperiments() {
        List<Experiment> running = experimentRepository.findByStatus("RUNNING");
        if (running.isEmpty()) return;

        for (Experiment exp : running) {
            try {
                processExperiment(exp);
            } catch (Exception e) {
                log.error("Failed to process experiment {}: {}", exp.getId(), e.getMessage());
            }
        }
    }

    private void processExperiment(Experiment exp) {
        long totalExposures = assignmentRepository.countByExperimentId(exp.getId());
        List<ExperimentVariant> variants = variantRepository.findByExperimentId(exp.getId());

        // 1. 达到样本量 → 完成实验
        if (exp.getTotalSampleSize() != null && totalExposures >= exp.getTotalSampleSize()) {
            completeExperiment(exp, variants);
            return;
        }

        // 2. 超过30天 → 自动结束
        if (exp.getStartedAt() != null &&
                Instant.now().isAfter(exp.getStartedAt().plus(30, ChronoUnit.DAYS))) {
            completeExperiment(exp, variants);
            return;
        }

        // 3. 样本量达到1000 → 实时计算统计但不结束
        if (totalExposures >= 1000 && totalExposures % 100 == 0) {
            updateStats(exp, variants);
        }
    }

    private void updateStats(Experiment exp, List<ExperimentVariant> variants) {
        List<ExperimentAssignment> assignments =
                assignmentRepository.findByExperimentId(exp.getId());
        ExperimentStatisticsEngine.ExperimentStats stats =
                statsEngine.calculate(exp, variants, assignments);

        for (ExperimentVariant variant : variants) {
            variant.setWinner(stats.getSignificantVariants().contains(variant.getId()));
            variantRepository.save(variant);
        }
        log.debug("Stats updated for experiment {}", exp.getId());
    }

    private void completeExperiment(Experiment exp, List<ExperimentVariant> variants) {
        log.info("Completing experiment: id={}, name={}", exp.getId(), exp.getName());

        // 计算最终统计
        List<ExperimentAssignment> assignments =
                assignmentRepository.findByExperimentId(exp.getId());
        ExperimentStatisticsEngine.ExperimentStats stats =
                statsEngine.calculate(exp, variants, assignments);

        // 标记胜者
        if (stats.getOverallWinnerId() != null) {
            exp.setWinningVariantId(stats.getOverallWinnerId());
            variants.stream()
                    .filter(v -> v.getId().equals(stats.getOverallWinnerId()))
                    .findFirst()
                    .ifPresent(w -> {
                        w.setWinner(true);
                        variantRepository.save(w);
                    });
            log.info("Experiment winner: variantId={}, improvement={}%",
                    stats.getOverallWinnerId(),
                    String.format("%.1f", stats.getOverallImprovement() * 100));
        }

        // 更新所有变体统计
        for (ExperimentVariant variant : variants) {
            variantRepository.save(variant);
        }

        // 完成实验
        exp.setStatus("COMPLETED");
        exp.setCompletedAt(Instant.now());
        experimentRepository.save(exp);

        log.info("Experiment completed: id={}, winner={}", exp.getId(), exp.getWinningVariantId());

        // 发布实验完成事件（异步，不阻塞调度循环）
        try {
            eventBridge.publish(
                    ExperimentCompletedEvent.TOPIC,
                    exp.getWorkspaceId(),  // partitionKey — 按工作区分区
                    new ExperimentCompletedEvent(
                            exp.getProgramCode(),
                            exp.getId(),
                            exp.getName(),
                            exp.getWinningVariantId(),
                            exp.getPlanId(),
                            exp.getWorkspaceId(),
                            stats.getOverallImprovement()));
        } catch (Exception e) {
            log.warn("Failed to publish experiment completed event: experimentId={}, error={}",
                    exp.getId(), e.getMessage());
        }

        // 4. 如果启用自动推全，安排推全
        if (exp.isAutoPromoteWinner() && exp.getWinningVariantId() != null) {
            scheduleAutoPromotion(exp);
        }
    }

    /**
     * 检查已完成但未推全的实验，执行延迟推全。
     */
    @Scheduled(fixedDelay = 60000)
    @Transactional
    public void checkPromotions() {
        List<Experiment> completed = experimentRepository.findByStatus("COMPLETED");
        if (completed.isEmpty()) return;

        for (Experiment exp : completed) {
            if (!exp.isAutoPromoteWinner() || exp.isPromoted()) continue;
            if (exp.getWinningVariantId() == null) continue;

            try {
                int delayMinutes = exp.getAutoPromoteDelayMinutes() != null
                        ? exp.getAutoPromoteDelayMinutes() : 1440;
                Instant eligibleAt = exp.getCompletedAt() != null
                        ? exp.getCompletedAt().plus(delayMinutes, ChronoUnit.MINUTES)
                        : Instant.now();

                if (Instant.now().isAfter(eligibleAt)) {
                    doPromote(exp);
                }
            } catch (Exception e) {
                log.error("Failed to promote experiment {}: {}", exp.getId(), e.getMessage());
            }
        }
    }

    /**
     * 安排自动推全 — 如果延迟为0则立即推全，否则由 checkPromotions 延迟处理。
     */
    void scheduleAutoPromotion(Experiment exp) {
        int delayMinutes = exp.getAutoPromoteDelayMinutes() != null
                ? exp.getAutoPromoteDelayMinutes() : 1440;

        if (delayMinutes <= 0) {
            log.info("Auto-promoting winner immediately: experimentId={}, winner={}",
                    exp.getId(), exp.getWinningVariantId());
            doPromote(exp);
        } else {
            log.info("Auto-promotion scheduled: experimentId={}, winner={}, delay={}min",
                    exp.getId(), exp.getWinningVariantId(), delayMinutes);
            // 由 checkPromotions() 在延迟后执行
        }
    }

    /**
     * 执行推全 — 将胜者变体标记为已推全。
     *
     * <p>推全意味着：
     * <ol>
     *   <li>标记实验为已推全 (promoted=true, promotedAt=now)</li>
     *   <li>胜者变体的配置将成为画布中该实验节点的正式配置</li>
     *   <li>后续 BPMN 编译时，编译器将跳过实验分流直接使用胜者路径</li>
     * </ol>
     */
    void doPromote(Experiment exp) {
        log.info("Promoting winner: experimentId={}, winner={}",
                exp.getId(), exp.getWinningVariantId());

        exp.setPromoted(true);
        exp.setPromotedAt(Instant.now());
        experimentRepository.save(exp);

        // 查找胜者变体名称用于日志
        variantRepository.findById(exp.getWinningVariantId()).ifPresentOrElse(
                winner -> log.info("Experiment winner promoted: experimentId={}, variant={} ({}), experiment={}",
                        exp.getId(), winner.getVariantCode(), winner.getVariantName(), exp.getName()),
                () -> log.warn("Winner variant not found for promotion: {}", exp.getWinningVariantId()));

        // 推全事件可直接复用 ExperimentCompletedEvent（topic 不同，语义为 promoted）
        try {
            eventBridge.publish(
                    "campaign.experiment.promoted",
                    exp.getWorkspaceId(),
                    new ExperimentCompletedEvent(
                            exp.getProgramCode(), exp.getId(), exp.getName(),
                            exp.getWinningVariantId(), exp.getPlanId(),
                            exp.getWorkspaceId(), 0));
        } catch (Exception e) {
            log.warn("Failed to publish promotion event: experimentId={}", exp.getId());
        }
    }
}
