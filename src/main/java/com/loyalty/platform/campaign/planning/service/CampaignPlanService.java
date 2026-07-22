package com.loyalty.platform.campaign.planning.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.canvas.dto.CanvasDag;
import com.loyalty.platform.campaign.canvas.service.AiDagGeneratorService;
import com.loyalty.platform.campaign.canvas.service.CanvasToBpmnCompiler;
import com.loyalty.platform.campaign.canvas.service.DagValidatorService;
import com.loyalty.platform.campaign.canvas.dto.GraphValidationResult;
import com.loyalty.platform.campaign.canvas.dto.AIRequest;
import com.loyalty.platform.common.exception.ResourceNotFoundException;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.domain.entity.campaign.CampaignPlan;
import com.loyalty.platform.domain.repository.campaign.CampaignPlanRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 活动计划管理服务 — 集成 Canvas DAG 生成、校验和 BPMN 编译。
 */
@Service
@Transactional
public class CampaignPlanService {

    private static final Logger log = LoggerFactory.getLogger(CampaignPlanService.class);

    private final CampaignPlanRepository planRepository;
    private final DagValidatorService dagValidator;
    private final CanvasToBpmnCompiler compiler;
    private final AiDagGeneratorService aiDagGenerator;
    private final ObjectMapper objectMapper;

    public CampaignPlanService(CampaignPlanRepository planRepository,
                                DagValidatorService dagValidator,
                                CanvasToBpmnCompiler compiler,
                                AiDagGeneratorService aiDagGenerator,
                                ObjectMapper objectMapper) {
        this.planRepository = planRepository;
        this.dagValidator = dagValidator;
        this.compiler = compiler;
        this.aiDagGenerator = aiDagGenerator;
        this.objectMapper = objectMapper;
    }

    /** 创建 Plan */
    public CampaignPlan createPlan(CampaignPlan plan) {
        if (plan.getId() == null) {
            plan.setId(UUID.randomUUID().toString());
        }
        // 租户隔离：从 TenantContext 注入 program_code
        String pc = TenantContext.get();
        if (pc != null && !pc.isBlank() && !"*".equals(pc)) {
            plan.setProgramCode(pc);
            plan.setOwnerProgramCode(pc);
        }
        // 默认触发类型
        if (plan.getTriggerType() == null) {
            plan.setTriggerType("MANUAL");
        }
        // 事件驱动 Plan 必须设置单次成本
        if ("EVENT_TRIGGERED".equals(plan.getTriggerType()) || "HYBRID".equals(plan.getTriggerType())) {
            if (plan.getCostPerTrigger() == null) {
                log.warn("Event-driven plan {} has no cost_per_trigger set", plan.getId());
            }
        }
        plan.setStatus("DRAFT");
        plan.setCreatedAt(LocalDateTime.now());
        plan = planRepository.save(plan);
        log.info("Campaign plan created: id={}, name={}, triggerType={}", plan.getId(), plan.getName(), plan.getTriggerType());
        return plan;
    }

    /** 获取 Plan */
    @Transactional(readOnly = true)
    public CampaignPlan getPlan(String planId) {
        return planRepository.findById(planId)
                .orElseThrow(() -> new ResourceNotFoundException("Plan not found: " + planId));
    }

    /** 获取 Workspace 下所有 Plan */
    @Transactional(readOnly = true)
    public List<CampaignPlan> getPlansByWorkspace(String workspaceId) {
        return planRepository.findByWorkspaceId(workspaceId);
    }

    /** 保存 Canvas DAG 到 Plan */
    public CampaignPlan saveCanvas(String planId, CanvasDag dag) {
        CampaignPlan plan = getPlan(planId);
        try {
            String graphJson = objectMapper.writeValueAsString(dag);
            plan.setGraphJson(graphJson);
            plan.setUpdatedAt(LocalDateTime.now());
            plan = planRepository.save(plan);
            log.info("Canvas DAG saved for plan: {}", planId);
        } catch (Exception e) {
            throw new RuntimeException("Failed to serialize canvas DAG", e);
        }
        return plan;
    }

    /** 读取 Canvas DAG */
    @Transactional(readOnly = true)
    public CanvasDag getCanvas(String planId) {
        CampaignPlan plan = getPlan(planId);
        if (plan.getGraphJson() == null) return null;
        try {
            return objectMapper.readValue(plan.getGraphJson(), CanvasDag.class);
        } catch (Exception e) {
            log.error("Failed to parse canvas DAG for plan: {}", planId, e);
            return null;
        }
    }

    /** 校验 Canvas DAG */
    public GraphValidationResult validateCanvas(String planId) {
        CanvasDag dag = getCanvas(planId);
        if (dag == null) {
            return GraphValidationResult.builder()
                    .valid(false).errors(List.of("Canvas DAG 为空"))
                    .warnings(List.of()).build();
        }
        return dagValidator.validate(dag);
    }

    /** 编译 Canvas → BPMN */
    public String compileToBpmn(String planId) {
        CampaignPlan plan = getPlan(planId);
        if (plan.getGraphJson() == null) {
            throw new IllegalArgumentException("Plan has no canvas DAG: " + planId);
        }
        String bpmnXml = compiler.compileFromJson(plan.getGraphJson());
        log.info("BPMN compiled for plan: {}", planId);
        return bpmnXml;
    }

    /** AI 生成 DAG */
    public CanvasDag generateDag(AIRequest request) {
        return aiDagGenerator.generate(request);
    }

    /** 更新 Plan 状态 */
    public CampaignPlan updateStatus(String planId, String status) {
        CampaignPlan plan = getPlan(planId);
        plan.setStatus(status);
        plan.setUpdatedAt(LocalDateTime.now());
        plan = planRepository.save(plan);
        log.info("Plan status updated: id={}, status={}", planId, status);
        return plan;
    }

    /** 提交审批 */
    public CampaignPlan submitForApproval(String planId) {
        return updateStatus(planId, "GENERATED");
    }

    /** 审批通过 */
    public CampaignPlan approve(String planId, String approvedBy) {
        CampaignPlan plan = getPlan(planId);
        plan.setStatus("APPROVED");
        plan.setApprovedBy(approvedBy);
        plan.setApprovedAt(LocalDateTime.now());
        plan.setUpdatedAt(LocalDateTime.now());
        plan = planRepository.save(plan);
        log.info("Plan approved: id={}, approver={}", planId, approvedBy);
        return plan;
    }
}
