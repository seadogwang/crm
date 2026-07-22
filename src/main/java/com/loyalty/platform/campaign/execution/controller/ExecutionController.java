package com.loyalty.platform.campaign.execution.controller;

import com.loyalty.platform.campaign.execution.service.WorkerRegistry;
import com.loyalty.platform.campaign.execution.service.ZeebeDeployService;
import com.loyalty.platform.campaign.execution.service.ZeebeExecutionService;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.CampaignPlan;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Campaign 执行引擎 REST API。
 */
@RestController
@RequestMapping("/api/campaign/execution")
public class ExecutionController {

    private final ZeebeDeployService deployService;
    private final ZeebeExecutionService executionService;
    private final WorkerRegistry workerRegistry;

    public ExecutionController(ZeebeDeployService deployService,
                                ZeebeExecutionService executionService,
                                WorkerRegistry workerRegistry) {
        this.deployService = deployService;
        this.executionService = executionService;
        this.workerRegistry = workerRegistry;
    }

    // ========================================================================
    // 部署与启动
    // ========================================================================

    @PostMapping("/deploy")
    public ResponseEntity<ApiResponse<CampaignPlan>> deploy(@RequestBody Map<String, String> body) {
        CampaignPlan plan = deployService.deploy(body.get("planId"));
        return ResponseEntity.ok(ApiResponse.success(plan));
    }

    @PostMapping("/{planId}/deploy")
    public ResponseEntity<ApiResponse<CampaignPlan>> deployByPath(@PathVariable String planId) {
        CampaignPlan plan = deployService.deploy(planId);
        return ResponseEntity.ok(ApiResponse.success(plan));
    }

    @PostMapping("/start")
    public ResponseEntity<ApiResponse<ZeebeExecutionService.ProcessInstance>> start(
            @RequestBody Map<String, String> body) {
        ZeebeExecutionService.ProcessInstance instance = executionService.createInstance(body.get("planId"));
        return ResponseEntity.ok(ApiResponse.success(instance));
    }

    @PostMapping("/{planId}/start")
    public ResponseEntity<ApiResponse<ZeebeExecutionService.ProcessInstance>> startByPath(
            @PathVariable String planId) {
        ZeebeExecutionService.ProcessInstance instance = executionService.createInstance(planId);
        return ResponseEntity.ok(ApiResponse.success(instance));
    }

    // ========================================================================
    // 执行节点（调试接口 — 仅允许已知 worker 类型）
    // ========================================================================

    private static final Set<String> ALLOWED_JOB_TYPES = Set.of(
            "campaign-audience-filter", "campaign-content-generate",
            "campaign-decision", "campaign-notification", "campaign-webhook");

    @PostMapping("/instance/{instanceKey}/execute/{jobType}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> executeNode(
            @PathVariable long instanceKey,
            @PathVariable String jobType,
            @RequestBody(required = false) Map<String, Object> variables) {
        if (!ALLOWED_JOB_TYPES.contains(jobType)) {
            return ResponseEntity.badRequest()
                    .body(ApiResponse.error("ERR_INVALID_JOB_TYPE", "Unknown job type: " + jobType));
        }
        // 校验 variables 中的 programCode
        if (variables != null && variables.containsKey("programCode")) {
            String pc = (String) variables.get("programCode");
            if (pc != null && !pc.matches("^[A-Za-z0-9_*-]+$")) {
                return ResponseEntity.badRequest()
                        .body(ApiResponse.error("ERR_INVALID_INPUT", "Invalid programCode"));
            }
        }
        Map<String, Object> result = executionService.executeNode(instanceKey, jobType, variables);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ========================================================================
    // 生命周期控制
    // ========================================================================

    @PostMapping("/instance/{instanceKey}/complete")
    public ResponseEntity<ApiResponse<ZeebeExecutionService.ProcessInstance>> complete(
            @PathVariable long instanceKey) {
        return ResponseEntity.ok(ApiResponse.success(executionService.completeInstance(instanceKey)));
    }

    @PostMapping("/instance/{instanceKey}/cancel")
    public ResponseEntity<ApiResponse<ZeebeExecutionService.ProcessInstance>> cancel(
            @PathVariable long instanceKey) {
        return ResponseEntity.ok(ApiResponse.success(executionService.cancelInstance(instanceKey)));
    }

    @PostMapping("/{planId}/pause")
    public ResponseEntity<ApiResponse<ZeebeExecutionService.ProcessInstance>> pause(
            @PathVariable String planId) {
        return ResponseEntity.ok(ApiResponse.success(executionService.pauseExecution(planId)));
    }

    @PostMapping("/{planId}/resume")
    public ResponseEntity<ApiResponse<ZeebeExecutionService.ProcessInstance>> resume(
            @PathVariable String planId) {
        return ResponseEntity.ok(ApiResponse.success(executionService.resumeExecution(planId)));
    }

    // ========================================================================
    // 查询
    // ========================================================================

    @GetMapping("/instance/{instanceKey}")
    public ResponseEntity<ApiResponse<ZeebeExecutionService.ProcessInstance>> getInstance(
            @PathVariable long instanceKey) {
        return ResponseEntity.ok(ApiResponse.success(executionService.getInstance(instanceKey)));
    }

    @GetMapping("/{planId}/instance")
    public ResponseEntity<ApiResponse<ZeebeExecutionService.ProcessInstance>> getInstanceByPlan(
            @PathVariable String planId) {
        return ResponseEntity.ok(ApiResponse.success(executionService.getInstanceByPlan(planId)));
    }

    @GetMapping("/status/{planId}")
    public ResponseEntity<ApiResponse<ZeebeExecutionService.ExecutionStatus>> getStatus(
            @PathVariable String planId) {
        return ResponseEntity.ok(ApiResponse.success(executionService.getExecutionStatus(planId)));
    }

    @GetMapping("/workers")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getWorkers() {
        return ResponseEntity.ok(ApiResponse.success(workerRegistry.getWorkerInfo()));
    }

    @GetMapping("/job-types")
    public ResponseEntity<ApiResponse<List<String>>> getJobTypes() {
        return ResponseEntity.ok(ApiResponse.success(workerRegistry.getAllJobTypes()));
    }

    @GetMapping("/deploy-count")
    public ResponseEntity<ApiResponse<Map<String, Integer>>> getDeployCount() {
        return ResponseEntity.ok(ApiResponse.success(Map.of("count", deployService.getDeployCount())));
    }
}
