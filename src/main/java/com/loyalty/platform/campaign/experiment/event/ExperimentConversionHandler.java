package com.loyalty.platform.campaign.experiment.event;

import com.loyalty.platform.common.event.DomainEventHandler;
import com.loyalty.platform.domain.entity.campaign.Experiment;
import com.loyalty.platform.domain.entity.campaign.ExperimentAssignment;
import com.loyalty.platform.domain.repository.campaign.ExperimentAssignmentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentVariantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * 实验转化事件处理器 — 监听用户行为事件，自动更新实验转化指标。
 *
 * <p>监听 Topic: {@code loyalty.event.user}
 *
 * <p>处理逻辑：
 * <ol>
 *   <li>查找用户在该实验中的分流记录</li>
 *   <li>检查事件类型是否匹配实验目标指标</li>
 *   <li>更新分流记录的转化状态</li>
 *   <li>递增变体的事件计数</li>
 * </ol>
 *
 * <p><b>幂等性</b>: 如果分流记录已标记为 converted，则跳过（防止重复计数）。
 */
@Component
public class ExperimentConversionHandler implements DomainEventHandler<ExperimentConversionEvent> {

    private static final Logger log = LoggerFactory.getLogger(ExperimentConversionHandler.class);

    private final ExperimentAssignmentRepository assignmentRepository;
    private final ExperimentRepository experimentRepository;
    private final ExperimentVariantRepository variantRepository;

    public ExperimentConversionHandler(ExperimentAssignmentRepository assignmentRepository,
                                       ExperimentRepository experimentRepository,
                                       ExperimentVariantRepository variantRepository) {
        this.assignmentRepository = assignmentRepository;
        this.experimentRepository = experimentRepository;
        this.variantRepository = variantRepository;
    }

    @Override
    public String getTopic() {
        return ExperimentConversionEvent.TOPIC;
    }

    @Override
    public Class<ExperimentConversionEvent> getEventType() {
        return ExperimentConversionEvent.class;
    }

    @Override
    public void handle(ExperimentConversionEvent event) {
        String experimentId = event.getExperimentId();
        String memberId = event.getMemberId();

        // 1. 查找分流记录
        ExperimentAssignment assignment = assignmentRepository
                .findByExperimentIdAndMemberId(experimentId, memberId)
                .orElse(null);
        if (assignment == null) {
            log.debug("No assignment found for conversion: experimentId={}, memberId={}",
                    experimentId, memberId);
            return;
        }

        // 2. 获取实验配置，检查事件类型是否匹配目标指标
        Experiment experiment = experimentRepository.findById(experimentId).orElse(null);
        if (experiment == null) {
            log.warn("Experiment not found for conversion: experimentId={}", experimentId);
            return;
        }

        if (!isTargetEvent(experiment.getObjectiveMetric(), event.getConversionType())) {
            log.debug("Event type {} does not match experiment objective metric {}",
                    event.getConversionType(), experiment.getObjectiveMetric());
            return;
        }

        // 3. 幂等检查 — 已转化则跳过
        if (assignment.isConverted()) {
            log.debug("Assignment already converted: experimentId={}, memberId={}",
                    experimentId, memberId);
            return;
        }

        // 4. 更新转化状态
        assignment.setConverted(true);
        assignment.setConvertedAt(Instant.now());
        if (event.getConversionValue() != null) {
            assignment.setConversionValue(event.getConversionValue());
        }
        assignmentRepository.save(assignment);

        // 5. 递增变体事件计数
        variantRepository.incrementEventCount(assignment.getVariantId());

        log.info("Experiment conversion recorded: experimentId={}, memberId={}, variantId={}, type={}, value={}",
                experimentId, memberId, assignment.getVariantId(),
                event.getConversionType(), event.getConversionValue());
    }

    /**
     * 检查转化事件类型是否匹配实验的目标指标。
     */
    private boolean isTargetEvent(String objectiveMetric,
                                  ExperimentConversionEvent.ConversionType conversionType) {
        return switch (objectiveMetric) {
            case "CLICK_RATE" -> conversionType == ExperimentConversionEvent.ConversionType.CLICK;
            case "CONVERSION_RATE" ->
                    conversionType == ExperimentConversionEvent.ConversionType.CONVERSION
                            || conversionType == ExperimentConversionEvent.ConversionType.PURCHASE;
            case "REVENUE_PER_USER" ->
                    conversionType == ExperimentConversionEvent.ConversionType.PURCHASE;
            case "OPEN_RATE" -> conversionType == ExperimentConversionEvent.ConversionType.OPEN;
            default -> false;
        };
    }
}
