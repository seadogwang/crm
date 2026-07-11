package com.loyalty.platform.campaign.experiment;

import com.loyalty.platform.campaign.experiment.event.ExperimentCompletedEvent;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.common.event.EventBridge;
import com.loyalty.platform.domain.entity.campaign.Experiment;
import com.loyalty.platform.domain.entity.campaign.ExperimentAssignment;
import com.loyalty.platform.domain.entity.campaign.ExperimentLearning;
import com.loyalty.platform.domain.entity.campaign.ExperimentVariant;
import com.loyalty.platform.domain.repository.campaign.ExperimentAssignmentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentLearningRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentRepository;
import com.loyalty.platform.domain.repository.campaign.ExperimentVariantRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
@RequestMapping("/api/campaign/experiment")
public class ExperimentController {

    private static final Logger log = LoggerFactory.getLogger(ExperimentController.class);

    private final ExperimentRepository experimentRepository;
    private final ExperimentVariantRepository variantRepository;
    private final ExperimentAssignmentRepository assignmentRepository;
    private final ExperimentStatisticsEngine statsEngine;
    private final EventBridge eventBridge;
    private final ExperimentSampleSizeCalculator sampleSizeCalculator;
    private final ExperimentLearningRepository learningRepository;

    public ExperimentController(ExperimentRepository experimentRepository,
                                 ExperimentVariantRepository variantRepository,
                                 ExperimentAssignmentRepository assignmentRepository,
                                 ExperimentStatisticsEngine statsEngine,
                                 EventBridge eventBridge,
                                 ExperimentSampleSizeCalculator sampleSizeCalculator,
                                 ExperimentLearningRepository learningRepository) {
        this.experimentRepository = experimentRepository;
        this.variantRepository = variantRepository;
        this.assignmentRepository = assignmentRepository;
        this.statsEngine = statsEngine;
        this.eventBridge = eventBridge;
        this.sampleSizeCalculator = sampleSizeCalculator;
        this.learningRepository = learningRepository;
    }

    // ========================================================================
    // 实验 CRUD
    // ========================================================================

    /** 创建实验 */
    @PostMapping
    public ResponseEntity<ApiResponse<Experiment>> create(@RequestBody Experiment experiment) {
        if (experiment.getId() == null) experiment.setId(UUID.randomUUID().toString());
        experiment = experimentRepository.save(experiment);
        log.info("Experiment created: id={}, name={}", experiment.getId(), experiment.getName());
        return ResponseEntity.ok(ApiResponse.success(experiment));
    }

    /** 查询计划下的实验 */
    @GetMapping("/plan/{planId}")
    public ResponseEntity<ApiResponse<List<Experiment>>> getByPlan(@PathVariable String planId) {
        return ResponseEntity.ok(ApiResponse.success(experimentRepository.findByPlanId(planId)));
    }

    /** 查询实验详情 */
    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getDetail(@PathVariable String id) {
        Experiment exp = experimentRepository.findById(id).orElse(null);
        if (exp == null) return ResponseEntity.ok(ApiResponse.success(null));
        List<ExperimentVariant> variants = variantRepository.findByExperimentId(id);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("experiment", exp);
        detail.put("variants", variants);
        return ResponseEntity.ok(ApiResponse.success(detail));
    }

    /** 启动实验 */
    @PostMapping("/{id}/start")
    public ResponseEntity<ApiResponse<Experiment>> start(@PathVariable String id) {
        Experiment exp = experimentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Experiment not found"));
        exp.setStatus("RUNNING");
        exp.setStartedAt(Instant.now());
        experimentRepository.save(exp);
        log.info("Experiment started: id={}", id);
        return ResponseEntity.ok(ApiResponse.success(exp));
    }

    /** 暂停实验 */
    @PostMapping("/{id}/pause")
    public ResponseEntity<ApiResponse<Experiment>> pause(@PathVariable String id) {
        Experiment exp = experimentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Experiment not found"));
        exp.setStatus("PAUSED");
        experimentRepository.save(exp);
        return ResponseEntity.ok(ApiResponse.success(exp));
    }

    /** 完成实验 */
    @PostMapping("/{id}/complete")
    public ResponseEntity<ApiResponse<Experiment>> complete(@PathVariable String id) {
        Experiment exp = experimentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Experiment not found"));
        List<ExperimentVariant> variants = variantRepository.findByExperimentId(id);
        exp.setStatus("COMPLETED");
        exp.setCompletedAt(Instant.now());

        List<ExperimentAssignment> assignments = assignmentRepository.findByExperimentId(id);
        ExperimentStatisticsEngine.ExperimentStats stats =
                statsEngine.calculate(exp, variants, assignments);

        if (stats.getOverallWinnerId() != null) {
            exp.setWinningVariantId(stats.getOverallWinnerId());
            for (ExperimentVariant v : variants) {
                v.setWinner(stats.getSignificantVariants().contains(v.getId()));
                variantRepository.save(v);
            }
        }
        experimentRepository.save(exp);

        // 发布实验完成事件
        try {
            eventBridge.publish(
                    ExperimentCompletedEvent.TOPIC,
                    exp.getWorkspaceId(),
                    new ExperimentCompletedEvent(
                            exp.getProgramCode(), exp.getId(), exp.getName(),
                            exp.getWinningVariantId(), exp.getPlanId(),
                            exp.getWorkspaceId(), stats.getOverallImprovement()));
        } catch (Exception e) {
            log.warn("Failed to publish experiment completed event: id={}, error={}",
                    id, e.getMessage());
        }

        return ResponseEntity.ok(ApiResponse.success(exp));
    }

    /** 手动推全胜者 — 将实验胜者变体标记为已推全 */
    @PostMapping("/{id}/promote")
    public ResponseEntity<ApiResponse<Experiment>> promote(@PathVariable String id) {
        Experiment exp = experimentRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Experiment not found"));
        if (!"COMPLETED".equals(exp.getStatus())) {
            throw new RuntimeException("Only COMPLETED experiments can be promoted");
        }
        if (exp.getWinningVariantId() == null) {
            throw new RuntimeException("No winning variant to promote");
        }
        if (exp.isPromoted()) {
            return ResponseEntity.ok(ApiResponse.success(exp)); // 幂等
        }

        exp.setPromoted(true);
        exp.setPromotedAt(Instant.now());
        experimentRepository.save(exp);

        variantRepository.findById(exp.getWinningVariantId()).ifPresent(winner ->
                log.info("Winner manually promoted: experimentId={}, variant={} ({}), experiment={}",
                        exp.getId(), winner.getVariantCode(), winner.getVariantName(), exp.getName()));

        // 发布推全事件
        try {
            eventBridge.publish(
                    "campaign.experiment.promoted",
                    exp.getWorkspaceId(),
                    new ExperimentCompletedEvent(
                            exp.getProgramCode(), exp.getId(), exp.getName(),
                            exp.getWinningVariantId(), exp.getPlanId(),
                            exp.getWorkspaceId(), 0));
        } catch (Exception e) {
            log.warn("Failed to publish promotion event: id={}", id);
        }

        return ResponseEntity.ok(ApiResponse.success(exp));
    }

    // ========================================================================
    // 实验学习记录
    // ========================================================================

    /** 获取实验的学习记录 */
    @GetMapping("/{id}/learnings")
    public ResponseEntity<ApiResponse<List<ExperimentLearning>>> getLearnings(
            @PathVariable String id) {
        return ResponseEntity.ok(ApiResponse.success(
                learningRepository.findByExperimentId(id)));
    }

    // ========================================================================
    // 样本量估算
    // ========================================================================

    /** 估算实验所需样本量 */
    @PostMapping("/estimate-sample-size")
    public ResponseEntity<ApiResponse<ExperimentSampleSizeCalculator.SampleSizeResponse>> estimateSampleSize(
            @RequestBody ExperimentSampleSizeCalculator.SampleSizeRequest request) {
        ExperimentSampleSizeCalculator.SampleSizeResponse result =
                sampleSizeCalculator.calculate(request);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ========================================================================
    // 变体管理
    // ========================================================================

    /** 获取实验的变体列表 */
    @GetMapping("/{experimentId}/variants")
    public ResponseEntity<ApiResponse<List<ExperimentVariant>>> getVariants(
            @PathVariable String experimentId) {
        return ResponseEntity.ok(ApiResponse.success(
                variantRepository.findByExperimentIdOrderByVariantCodeAsc(experimentId)));
    }

    /** 添加变体 */
    @PostMapping("/{experimentId}/variants")
    public ResponseEntity<ApiResponse<ExperimentVariant>> addVariant(
            @PathVariable String experimentId,
            @RequestBody ExperimentVariant variant) {
        variant.setId(UUID.randomUUID().toString());
        variant.setExperimentId(experimentId);
        variant = variantRepository.save(variant);
        return ResponseEntity.ok(ApiResponse.success(variant));
    }

    // ========================================================================
    // 统计与结果
    // ========================================================================

    /** 获取实验统计 */
    @GetMapping("/{id}/stats")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getStats(@PathVariable String id) {
        Experiment exp = experimentRepository.findById(id).orElse(null);
        if (exp == null) return ResponseEntity.ok(ApiResponse.success(null));

        List<ExperimentVariant> variants = variantRepository.findByExperimentId(id);
        List<ExperimentAssignment> assignments = assignmentRepository.findByExperimentId(id);
        ExperimentStatisticsEngine.ExperimentStats stats =
                statsEngine.calculate(exp, variants, assignments);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("experimentId", id);
        result.put("totalAssignments", assignments.size());
        result.put("winnerId", stats.getOverallWinnerId());
        result.put("overallImprovement", stats.getOverallImprovement());
        result.put("significantVariants", stats.getSignificantVariants());
        result.put("metricValues", stats.getMetricValues());
        result.put("variants", variants);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 获取用户分流记录 */
    @GetMapping("/{experimentId}/assignments")
    public ResponseEntity<ApiResponse<List<ExperimentAssignment>>> getAssignments(
            @PathVariable String experimentId) {
        return ResponseEntity.ok(ApiResponse.success(
                assignmentRepository.findByExperimentId(experimentId)));
    }
}
