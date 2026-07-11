package com.loyalty.platform.campaign.execution.worker;

import com.loyalty.platform.campaign.experiment.event.ExperimentExposureEvent;
import com.loyalty.platform.campaign.intervention.service.InterventionService;
import com.loyalty.platform.common.event.EventBridge;
import com.loyalty.platform.domain.entity.campaign.Experiment;
import com.loyalty.platform.domain.entity.campaign.ExperimentAssignment;
import com.loyalty.platform.domain.entity.campaign.ExperimentVariant;
import com.loyalty.platform.domain.repository.campaign.ExperimentAssignmentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentVariantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.*;

/**
 * 实验分流 Worker — 确定性哈希将用户分配到不同变体。
 *
 * <p>核心算法：
 * <ol>
 *   <li>检查是否已有分配记录（确定性：同一用户永远返回相同变体）</li>
 *   <li>若无，基于 memberId + experimentId 计算 MD5 哈希</li>
 *   <li>哈希值 mod 10000 后按变体流量比例分配</li>
 *   <li>保存分配记录到 campaign_experiment_assignment</li>
 *   <li>发布 {@link ExperimentExposureEvent} 到事件总线</li>
 * </ol>
 */
@Component
public class ExperimentRouterWorker extends BaseCampaignWorker {

    private static final Logger log = LoggerFactory.getLogger(ExperimentRouterWorker.class);

    private final ExperimentRepository experimentRepository;
    private final ExperimentVariantRepository variantRepository;
    private final ExperimentAssignmentRepository assignmentRepository;
    private final EventBridge eventBridge;

    public ExperimentRouterWorker(InterventionService interventionService,
                                   ExperimentRepository experimentRepository,
                                   ExperimentVariantRepository variantRepository,
                                   ExperimentAssignmentRepository assignmentRepository,
                                   EventBridge eventBridge) {
        super(interventionService);
        this.experimentRepository = experimentRepository;
        this.variantRepository = variantRepository;
        this.assignmentRepository = assignmentRepository;
        this.eventBridge = eventBridge;
    }

    @Override
    public String getJobType() {
        return "campaign-experiment-router";
    }

    @Override
    public Map<String, Object> handle(Map<String, Object> variables) {
        String memberId = getString(variables, "memberId");
        String experimentId = getString(variables, "experimentId");

        if (memberId == null || experimentId == null) {
            return errorResult("memberId and experimentId are required");
        }

        try {
            // 1. 获取实验（先查实验状态，判断是否已推全）
            Experiment experiment = experimentRepository.findById(experimentId)
                    .orElseThrow(() -> new RuntimeException("Experiment not found: " + experimentId));

            // 1a. 如果实验已推全，始终返回胜者变体（跳过所有分流逻辑）
            if (experiment.isPromoted() && experiment.getWinningVariantId() != null) {
                ExperimentVariant promotedVariant = variantRepository
                        .findById(experiment.getWinningVariantId()).orElse(null);
                log.debug("Experiment promoted: always routing to winner variant={}",
                        promotedVariant != null ? promotedVariant.getVariantCode() : "unknown");
                return buildResult(experiment.getWinningVariantId(),
                        promotedVariant != null ? promotedVariant.getVariantCode() : "WINNER",
                        promotedVariant != null ? promotedVariant.getNodeOverrides() : null);
            }

            // 2. 检查已有分配（确定性分流）
            Optional<ExperimentAssignment> existing =
                    assignmentRepository.findByExperimentIdAndMemberId(experimentId, memberId);
            if (existing.isPresent()) {
                ExperimentAssignment assignment = existing.get();
                ExperimentVariant variant = variantRepository.findById(assignment.getVariantId()).orElse(null);
                log.debug("Existing assignment: memberId={}, variant={}",
                        memberId, variant != null ? variant.getVariantCode() : "unknown");
                return buildResult(assignment.getVariantId(),
                        variant != null ? variant.getVariantCode() : "UNKNOWN",
                        variant != null ? variant.getNodeOverrides() : null);
            }

            if (!"RUNNING".equals(experiment.getStatus())) {
                return errorResult("Experiment not in RUNNING state: " + experiment.getStatus());
            }

            List<ExperimentVariant> variants =
                    variantRepository.findByExperimentIdOrderByVariantCodeAsc(experimentId);
            if (variants.isEmpty()) {
                return errorResult("No variants configured for experiment: " + experimentId);
            }

            // 3. 确定性哈希分流
            String bucketKey = memberId + ":" + experimentId;
            String assignedVariantCode = deterministicAssign(bucketKey, variants);
            String assignedVariantId = variants.stream()
                    .filter(v -> v.getVariantCode().equals(assignedVariantCode))
                    .findFirst()
                    .map(ExperimentVariant::getId)
                    .orElse(variants.get(0).getId());

            // 4. 保存分配记录
            ExperimentAssignment assignment = ExperimentAssignment.builder()
                    .id(UUID.randomUUID().toString())
                    .experimentId(experimentId)
                    .memberId(memberId)
                    .variantId(assignedVariantId)
                    .bucketKey(bucketKey)
                    .assignmentTime(Instant.now())
                    .exposed(false)
                    .build();
            assignmentRepository.save(assignment);

            // 5. 更新曝光计数
            variantRepository.incrementExposureCount(assignedVariantId);

            ExperimentVariant variant = variants.stream()
                    .filter(v -> v.getId().equals(assignedVariantId))
                    .findFirst().orElse(null);

            // 6. 发布曝光事件到事件总线（异步，不阻塞分流）
            try {
                eventBridge.publish(
                        ExperimentExposureEvent.TOPIC,
                        memberId,  // partitionKey — 保证同一用户事件有序
                        new ExperimentExposureEvent(
                                experiment.getProgramCode(),
                                experimentId,
                                memberId,
                                assignedVariantId,
                                assignedVariantCode,
                                experiment.getPlanId()));
            } catch (Exception e) {
                log.warn("Failed to publish exposure event: experimentId={}, memberId={}, error={}",
                        experimentId, memberId, e.getMessage());
                // 事件发布失败不影响分流结果
            }

            log.info("User assigned: memberId={}, experiment={}, variant={}",
                    memberId, experimentId, assignedVariantCode);

            return buildResult(assignedVariantId, assignedVariantCode,
                    variant != null ? variant.getNodeOverrides() : null);

        } catch (Exception e) {
            log.error("Experiment routing failed: memberId={}, experimentId={}, error={}",
                    memberId, experimentId, e.getMessage(), e);
            return errorResult(e.getMessage());
        }
    }

    private Map<String, Object> buildResult(String variantId, String variantCode, String nodeOverrides) {
        Map<String, Object> result = new HashMap<>();
        result.put("variantId", variantId);
        result.put("variantCode", variantCode);
        result.put("nodeOverrides", nodeOverrides);
        result.put("status", "COMPLETED");
        return result;
    }

    /**
     * 确定性哈希分流算法。
     * MD5 哈希 + 取模，保证同一 key 永远分到同一变体。
     */
    private String deterministicAssign(String bucketKey, List<ExperimentVariant> variants) {
        int hash = Math.abs(hashToInt(bucketKey) % 10000);
        int cumulative = 0;
        for (ExperimentVariant variant : variants) {
            int threshold = (int) (variant.getTrafficPercentage().doubleValue() * 100);
            cumulative += threshold;
            if (hash < cumulative) {
                return variant.getVariantCode();
            }
        }
        return variants.get(variants.size() - 1).getVariantCode();
    }

    private int hashToInt(String key) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(key.getBytes(StandardCharsets.UTF_8));
            return ((digest[0] & 0xFF) << 24) |
                   ((digest[1] & 0xFF) << 16) |
                   ((digest[2] & 0xFF) << 8) |
                   (digest[3] & 0xFF);
        } catch (NoSuchAlgorithmException e) {
            return key.hashCode();
        }
    }
}
