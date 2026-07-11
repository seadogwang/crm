## 第14章：Human Override & Intervention System（人工干预与覆盖系统）详细设计
Human Override & Intervention System 是 Campaign Tools 的**“紧急制动与方向盘”**系统，允许业务决策者（CMO/营销经理/运营人员）在 Campaign 运行时**中断、调整或终止**执行流程。它让 AI 不再是“黑盒独裁者”，而是可被人类监督和修正的智能助手。
***
## 14.0 模块概述
### 14.0.1 本质定义
Intervention System 是一个**运行时状态篡改（State Mutation）+ 审计追踪（Audit Trail）+ 优先级抢占（Priority Preemption）**系统，提供以下核心能力：
* **运行时干预**：暂停/恢复/取消正在运行的 Campaign 流程
* **节点级控制**：跳过失败节点、强制重试、动态修改节点配置
* **全局紧急制动**：在突发舆情或合规风险时，快速限流或终止所有活动
* **完整审计**：所有干预操作记录在案，支持事后追溯和合规审查
### 14.0.2 核心设计原则（与 Loyalty 融合）
| 原则               | 说明                                                                             |
| ---------------- | ------------------------------------------------------------------------------ |
| **强制审计**         | 所有干预操作必须记录 `intervention_command`，包含操作人、时间、原因、前后状态快照                           |
| **Worker 侧防护**   | 所有 Channel Worker 在执行前必须检查干预状态，防止“漏网之鱼”                                        |
| **权限分级**         | 不同角色拥有不同干预权限（查看/暂停/取消/修改配置）                                                    |
| **与 Zeebe 深度集成** | 通过 Zeebe 的 `setVariables`、`cancelInstance`、`modifyProcessInstance` API 实现运行时控制 |
| **可恢复性**         | 暂停的流程可以恢复，修改配置的节点在恢复后使用新配置                                                     |
### 14.0.3 系统架构图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Human Override & Intervention System                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Frontend UI (干预控制台)                         │   │
│  │  · Campaign 列表 (含运行状态)                                       │   │
│  │  · 干预操作面板 (暂停/恢复/取消/跳过)                               │   │
│  │  · 干预历史查询                                                     │   │
│  │  · 紧急限流开关 (Kill Switch)                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    InterventionService (核心)                        │   │
│  │  · pauseCampaign() / resumeCampaign() / cancelCampaign()           │   │
│  │  · skipNode() / retryNode() / overrideNodeConfig()                 │   │
│  │  · emergencyThrottle() / emergencyStop()                           │   │
│  │  · 干预记录与审计                                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                    ┌───────────────┼───────────────┐                       │
│                    ▼               ▼               ▼                       │
│  ┌─────────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐  │
│  │  Zeebe Client       │ │  Redis/Event    │ │  Intervention           │  │
│  │  (流程控制)         │ │  (全局信号)     │ │  Repository             │  │
│  │  · setVariables     │ │  · throttle     │ │  (审计存储)             │  │
│  │  · cancelInstance   │ │  · pause signal │ │                         │  │
│  │  · modifyInstance   │ │  · kill switch  │ │                         │  │
│  └─────────────────────┘ └─────────────────┘ └─────────────────────────┘  │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Worker 防护层 (所有 Channel Workers)              │   │
│  │  · 执行前检查 isPaused(campaignId)                                  │   │
│  │  · 执行前检查 isThrottled(tenantId)                                 │   │
│  │  · 执行前检查 isKillSwitchActive()                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 14.1 数据模型设计
### 14.1.1 干预指令表（campaign\_intervention\_command）
存储所有人工干预操作的完整记录。
```sql
CREATE TABLE campaign_intervention_command (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,              -- 关联 Loyalty Program
    campaign_id VARCHAR(64),                        -- 关联的 Campaign Plan（可为空）
    target_node_id VARCHAR(64),                     -- 目标节点 ID（可为空）
    command_type VARCHAR(32) NOT NULL,              -- PAUSE / RESUME / CANCEL / SKIP_NODE / RETRY_NODE / UPDATE_CONFIG / EMERGENCY_THROTTLE / EMERGENCY_STOP
    severity VARCHAR(32) DEFAULT 'WARNING',         -- INFO / WARNING / CRITICAL / EMERGENCY
    -- 操作人
    operator_id VARCHAR(64) NOT NULL,
    operator_name VARCHAR(255),
    operator_role VARCHAR(64),
    -- 原因
    reason TEXT NOT NULL,                           -- 操作原因（强制填写）
    -- 状态快照（用于审计和回滚）
    previous_state_snapshot JSONB,                  -- 干预前的完整状态快照
    new_config_snapshot JSONB,                      -- 如果是 UPDATE_CONFIG，存新值
    -- 执行状态
    status VARCHAR(32) DEFAULT 'PENDING',           -- PENDING / EXECUTING / COMPLETED / FAILED / REVOKED
    error_message TEXT,
    -- 执行结果
    executed_at TIMESTAMPTZ,
    executed_by VARCHAR(64),                        -- 实际执行的系统/用户
    -- 时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cic_campaign ON campaign_intervention_command(campaign_id);
CREATE INDEX idx_cic_node ON campaign_intervention_command(target_node_id);
CREATE INDEX idx_cic_type ON campaign_intervention_command(command_type);
CREATE INDEX idx_cic_operator ON campaign_intervention_command(operator_id);
CREATE INDEX idx_cic_created ON campaign_intervention_command(created_at DESC);
CREATE INDEX idx_cic_status ON campaign_intervention_command(status);
```
### 14.1.2 干预审批表（campaign\_intervention\_approval）
对于高风险操作（如取消、紧急停止），可能需要二级审批。
```sql
CREATE TABLE campaign_intervention_approval (
    id VARCHAR(64) PRIMARY KEY,
    command_id VARCHAR(64) NOT NULL,                -- 关联干预指令
    approver_id VARCHAR(64) NOT NULL,
    action VARCHAR(32) NOT NULL,                    -- APPROVED / REJECTED
    comment TEXT,
    approved_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cia_command ON campaign_intervention_approval(command_id);
CREATE INDEX idx_cia_approver ON campaign_intervention_approval(approver_id);
```
### 14.1.3 全局控制状态表（campaign\_global\_control）
存储租户级别的全局控制状态（紧急限流、Kill Switch 等）。
```sql
CREATE TABLE campaign_global_control (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL UNIQUE,
    -- 限流控制
    throttle_enabled BOOLEAN DEFAULT FALSE,
    throttle_factor DECIMAL(3,2) DEFAULT 1.0,       -- 0.0 ~ 1.0，1.0 表示无限流
    throttle_until TIMESTAMPTZ,
    -- Kill Switch
    kill_switch_enabled BOOLEAN DEFAULT FALSE,
    kill_switch_activated_at TIMESTAMPTZ,
    kill_switch_activated_by VARCHAR(64),
    kill_switch_reason TEXT,
    -- 元数据
    updated_by VARCHAR(64),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cgc_program ON campaign_global_control(program_code);
```
***
## 14.2 执行状态机扩展
在原有状态机中增加人工干预状态：
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Campaign Execution State Machine                         │
│                                                                             │
│                              ┌─────────────────┐                           │
│                              │    CREATED      │                           │
│                              └────────┬────────┘                           │
│                                       │                                     │
│                                       ▼                                     │
│                              ┌─────────────────┐                           │
│                              │    DEPLOYED     │                           │
│                              └────────┬────────┘                           │
│                                       │                                     │
│                                       ▼                                     │
│                              ┌─────────────────┐                           │
│                          ┌──│    RUNNING      │──┐                        │
│                          │  └─────────────────┘  │                        │
│                          │          │            │                        │
│                          │          │ 人工干预   │                        │
│                          ▼          ▼            ▼                        │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐             │
│  │ PAUSED_BY_USER  │ │  NODE_SKIPPED   │ │  OVERRIDDEN     │             │
│  │  (可恢复)        │ │  (节点跳过)     │ │  (配置覆盖)     │             │
│  └────────┬────────┘ └─────────────────┘ └─────────────────┘             │
│           │                                                                │
│           │ 恢复                                                           │
│           ▼                                                                │
│  ┌─────────────────┐                                                      │
│  │    RUNNING      │                                                      │
│  └────────┬────────┘                                                      │
│           │                                                                │
│           ▼                                                                │
│  ┌─────────────────┐                                                      │
│  │   COMPLETED     │    ←── 正常完成                                      │
│  └─────────────────┘                                                      │
│                                                                             │
│  任意状态 ──取消──▶ ┌─────────────────┐                                   │
│                    │   CANCELLED     │   ←── 不可恢复                     │
│                    └─────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 14.3 后端 Service 详细设计
### 14.3.1 核心干预服务（InterventionService）
```java
package com.loyalty.platform.campaign.intervention;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.loyalty.platform.campaign.execution.model.CampaignPlan;
import com.loyalty.platform.campaign.execution.model.ZeebeInstance;
import com.loyalty.platform.campaign.execution.repository.CampaignPlanRepository;
import com.loyalty.platform.campaign.execution.repository.ZeebeInstanceRepository;
import com.loyalty.platform.campaign.intervention.model.InterventionCommand;
import com.loyalty.platform.campaign.intervention.model.InterventionCommandStatus;
import com.loyalty.platform.campaign.intervention.repository.InterventionCommandRepository;
import com.loyalty.platform.campaign.intervention.repository.GlobalControlRepository;
import io.camunda.zeebe.client.ZeebeClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
@Slf4j
@Service
@RequiredArgsConstructor
public class InterventionService {
    private final ZeebeClient zeebeClient;
    private final RedisTemplate<String, Object> redisTemplate;
    private final CampaignPlanRepository planRepository;
    private final ZeebeInstanceRepository instanceRepository;
    private final InterventionCommandRepository commandRepository;
    private final GlobalControlRepository globalControlRepository;
    private final CampaignEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    private static final String PAUSE_SIGNAL_KEY = "campaign:pause:";
    private static final String THROTTLE_KEY = "campaign:throttle:";
    private static final String KILL_SWITCH_KEY = "campaign:kill:";
    // ==================== Campaign 级干预 ====================
    /**
     * 暂停 Campaign 执行
     * 
     * 伪代码：
     * 1. 校验 Campaign 状态（只有 RUNNING 可暂停）
     * 2. 记录干预命令
     * 3. 设置 Zeebe 流程变量 pauseRequested = true
     * 4. 在 Redis 中设置暂停信号（Worker 检查用）
     * 5. 更新 Campaign 状态为 PAUSED_BY_USER
     */
    @Transactional
    public InterventionCommand pauseCampaign(String planId, String operatorId, String reason) {
        log.info("Pausing campaign: planId={}, operator={}, reason={}", planId, operatorId, reason);
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));
        if (!"RUNNING".equals(plan.getStatus())) {
            throw new IllegalStateException("Only RUNNING campaign can be paused, current: " + plan.getStatus());
        }
        // 1. 记录干预命令
        InterventionCommand command = buildCommand(planId, null, "PAUSE", operatorId, reason);
        command = commandRepository.save(command);
        // 2. 设置 Zeebe 暂停变量（BPMN 中预埋的暂停网关会检测此变量）
        if (plan.getZeebeInstanceKey() != null) {
            try {
                zeebeClient.newSetVariablesCommand(plan.getZeebeInstanceKey())
                        .variables(Map.of(
                                "pauseRequested", true,
                                "pauseReason", reason,
                                "pauseTimestamp", Instant.now().toString(),
                                "pauseCommandId", command.getId()
                        ))
                        .send()
                        .join();
            } catch (Exception e) {
                log.error("Failed to set Zeebe pause variable: {}", e.getMessage());
                command.setStatus("FAILED");
                command.setErrorMessage(e.getMessage());
                commandRepository.save(command);
                throw new RuntimeException("Zeebe pause failed: " + e.getMessage(), e);
            }
        }
        // 3. 设置 Redis 暂停信号（Worker 防护）
        redisTemplate.opsForValue().set(PAUSE_SIGNAL_KEY + planId, "true", Duration.ofHours(24));
        // 4. 更新 Plan 状态
        plan.setStatus("PAUSED_BY_USER");
        planRepository.save(plan);
        // 5. 更新 ZeebeInstance 状态
        instanceRepository.updateStatusByPlanId(planId, "PAUSED_BY_USER");
        // 6. 更新命令状态
        command.setStatus("COMPLETED");
        command.setExecutedAt(Instant.now());
        command.setExecutedBy(operatorId);
        commandRepository.save(command);
        // 7. 发布事件
        eventPublisher.publishCampaignPaused(planId, operatorId, reason);
        log.info("Campaign paused: planId={}, commandId={}", planId, command.getId());
        return command;
    }
    /**
     * 恢复 Campaign 执行
     */
    @Transactional
    public InterventionCommand resumeCampaign(String planId, String operatorId, String reason) {
        log.info("Resuming campaign: planId={}, operator={}", planId, operatorId);
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));
        if (!"PAUSED_BY_USER".equals(plan.getStatus())) {
            throw new IllegalStateException("Only PAUSED_BY_USER campaign can be resumed, current: " + plan.getStatus());
        }
        // 1. 记录干预命令
        InterventionCommand command = buildCommand(planId, null, "RESUME", operatorId, reason);
        command = commandRepository.save(command);
        // 2. 清除 Zeebe 暂停变量
        if (plan.getZeebeInstanceKey() != null) {
            try {
                zeebeClient.newSetVariablesCommand(plan.getZeebeInstanceKey())
                        .variables(Map.of("pauseRequested", false))
                        .send()
                        .join();
            } catch (Exception e) {
                log.error("Failed to clear Zeebe pause variable: {}", e.getMessage());
                command.setStatus("FAILED");
                command.setErrorMessage(e.getMessage());
                commandRepository.save(command);
                throw new RuntimeException("Zeebe resume failed: " + e.getMessage(), e);
            }
        }
        // 3. 清除 Redis 暂停信号
        redisTemplate.delete(PAUSE_SIGNAL_KEY + planId);
        // 4. 更新 Plan 状态
        plan.setStatus("RUNNING");
        planRepository.save(plan);
        // 5. 更新 ZeebeInstance 状态
        instanceRepository.updateStatusByPlanId(planId, "RUNNING");
        // 6. 更新命令状态
        command.setStatus("COMPLETED");
        command.setExecutedAt(Instant.now());
        command.setExecutedBy(operatorId);
        commandRepository.save(command);
        // 7. 发布事件
        eventPublisher.publishCampaignResumed(planId, operatorId);
        log.info("Campaign resumed: planId={}", planId);
        return command;
    }
    /**
     * 取消 Campaign 执行（不可恢复）
     */
    @Transactional
    public InterventionCommand cancelCampaign(String planId, String operatorId, String reason) {
        log.info("Cancelling campaign: planId={}, operator={}, reason={}", planId, operatorId, reason);
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));
        if ("COMPLETED".equals(plan.getStatus()) || "CANCELLED".equals(plan.getStatus())) {
            throw new IllegalStateException("Campaign already " + plan.getStatus());
        }
        // 1. 记录干预命令（含完整状态快照）
        InterventionCommand command = buildCommand(planId, null, "CANCEL", operatorId, reason);
        command.setPreviousStateSnapshot(JsonUtil.toJsonNode(plan));
        command = commandRepository.save(command);
        // 2. 调用 Zeebe 取消
        if (plan.getZeebeInstanceKey() != null) {
            try {
                zeebeClient.newCancelInstanceCommand(plan.getZeebeInstanceKey())
                        .send()
                        .join();
            } catch (Exception e) {
                log.error("Failed to cancel Zeebe instance: {}", e.getMessage());
                command.setStatus("FAILED");
                command.setErrorMessage(e.getMessage());
                commandRepository.save(command);
                throw new RuntimeException("Zeebe cancel failed: " + e.getMessage(), e);
            }
        }
        // 3. 清除 Redis 信号
        redisTemplate.delete(PAUSE_SIGNAL_KEY + planId);
        // 4. 更新 Plan 状态
        plan.setStatus("CANCELLED");
        planRepository.save(plan);
        // 5. 更新 ZeebeInstance 状态
        instanceRepository.updateStatusByPlanId(planId, "CANCELLED");
        // 6. 更新命令状态
        command.setStatus("COMPLETED");
        command.setExecutedAt(Instant.now());
        command.setExecutedBy(operatorId);
        commandRepository.save(command);
        // 7. 发布事件
        eventPublisher.publishCampaignCancelled(planId, operatorId, reason);
        log.info("Campaign cancelled: planId={}", planId);
        return command;
    }
    /**
     * 跳过节点
     */
    @Transactional
    public InterventionCommand skipNode(String planId, String nodeId, String operatorId, String reason) {
        log.info("Skipping node: planId={}, nodeId={}, operator={}", planId, nodeId, operatorId);
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));
        // 1. 记录干预命令
        InterventionCommand command = buildCommand(planId, nodeId, "SKIP_NODE", operatorId, reason);
        command = commandRepository.save(command);
        // 2. 通过 Zeebe 修改流程实例，跳过指定节点
        if (plan.getZeebeInstanceKey() != null) {
            try {
                // 使用 Zeebe Modify Process Instance API
                zeebeClient.newModifyProcessInstanceCommand(plan.getZeebeInstanceKey())
                        .activateElement(nodeId)  // 或跳过该元素
                        .send()
                        .join();
            } catch (Exception e) {
                log.error("Failed to skip node via Zeebe: {}", e.getMessage());
                command.setStatus("FAILED");
                command.setErrorMessage(e.getMessage());
                commandRepository.save(command);
                throw new RuntimeException("Skip node failed: " + e.getMessage(), e);
            }
        }
        // 3. 更新命令状态
        command.setStatus("COMPLETED");
        command.setExecutedAt(Instant.now());
        command.setExecutedBy(operatorId);
        commandRepository.save(command);
        // 4. 发布事件
        eventPublisher.publishNodeSkipped(planId, nodeId, operatorId);
        log.info("Node skipped: planId={}, nodeId={}", planId, nodeId);
        return command;
    }
    /**
     * 动态修改节点配置（运行时覆盖）
     */
    @Transactional
    public InterventionCommand overrideNodeConfig(String planId, String nodeId,
                                                   Map<String, Object> newConfig,
                                                   String operatorId, String reason) {
        log.info("Overriding node config: planId={}, nodeId={}, operator={}", planId, nodeId, operatorId);
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));
        // 1. 记录干预命令（包含旧配置和新配置）
        InterventionCommand command = buildCommand(planId, nodeId, "UPDATE_CONFIG", operatorId, reason);
        // 获取当前配置
        JsonNode currentConfig = getNodeConfigFromGraph(plan, nodeId);
        command.setPreviousStateSnapshot(currentConfig);
        command.setNewConfigSnapshot(JsonUtil.toJsonNode(newConfig));
        command = commandRepository.save(command);
        // 2. 通过 Zeebe 更新节点配置变量
        if (plan.getZeebeInstanceKey() != null) {
            try {
                zeebeClient.newSetVariablesCommand(plan.getZeebeInstanceKey())
                        .variables(Map.of(
                                "node_" + nodeId + "_config", newConfig,
                                "node_" + nodeId + "_overridden", true,
                                "node_" + nodeId + "_override_time", Instant.now().toString()
                        ))
                        .send()
                        .join();
            } catch (Exception e) {
                log.error("Failed to override node config via Zeebe: {}", e.getMessage());
                command.setStatus("FAILED");
                command.setErrorMessage(e.getMessage());
                commandRepository.save(command);
                throw new RuntimeException("Override config failed: " + e.getMessage(), e);
            }
        }
        // 3. 更新命令状态
        command.setStatus("COMPLETED");
        command.setExecutedAt(Instant.now());
        command.setExecutedBy(operatorId);
        commandRepository.save(command);
        // 4. 发布事件
        eventPublisher.publishNodeConfigOverridden(planId, nodeId, operatorId, newConfig);
        log.info("Node config overridden: planId={}, nodeId={}", planId, nodeId);
        return command;
    }
    // ==================== 全局干预 ====================
    /**
     * 紧急全局限流（突发舆情时快速限流）
     */
    @Transactional
    public InterventionCommand emergencyThrottle(String programCode, double factor,
                                                  String operatorId, String reason, int durationHours) {
        log.info("Emergency throttle: programCode={}, factor={}, operator={}", 
                programCode, factor, operatorId);
        if (factor < 0 || factor > 1) {
            throw new IllegalArgumentException("Throttle factor must be between 0 and 1");
        }
        // 1. 记录干预命令
        InterventionCommand command = buildGlobalCommand(programCode, "EMERGENCY_THROTTLE", operatorId, reason);
        command.setNewConfigSnapshot(JsonUtil.toJsonNode(Map.of("factor", factor, "durationHours", durationHours)));
        command = commandRepository.save(command);
        // 2. 更新全局控制表
        GlobalControl control = globalControlRepository.findByProgramCode(programCode)
                .orElseGet(() -> GlobalControl.builder()
                        .id(UUID.randomUUID().toString())
                        .programCode(programCode)
                        .build());
        control.setThrottleEnabled(true);
        control.setThrottleFactor(BigDecimal.valueOf(factor));
        control.setThrottleUntil(Instant.now().plus(durationHours, ChronoUnit.HOURS));
        control.setUpdatedBy(operatorId);
        control.setUpdatedAt(Instant.now());
        globalControlRepository.save(control);
        // 3. 发布到 Redis（Worker 实时读取）
        redisTemplate.opsForValue().set(THROTTLE_KEY + programCode, factor, Duration.ofHours(durationHours + 1));
        // 4. 更新命令状态
        command.setStatus("COMPLETED");
        command.setExecutedAt(Instant.now());
        command.setExecutedBy(operatorId);
        commandRepository.save(command);
        // 5. 发布事件
        eventPublisher.publishEmergencyThrottle(programCode, factor, operatorId);
        log.info("Emergency throttle activated: programCode={}, factor={}", programCode, factor);
        return command;
    }
    /**
     * 紧急停止（Kill Switch）—— 立即终止所有 Campaign
     */
    @Transactional
    public InterventionCommand emergencyStop(String programCode, String operatorId, String reason) {
        log.warn("EMERGENCY STOP triggered: programCode={}, operator={}, reason={}", 
                programCode, operatorId, reason);
        // 1. 记录干预命令
        InterventionCommand command = buildGlobalCommand(programCode, "EMERGENCY_STOP", operatorId, reason);
        command.setSeverity("EMERGENCY");
        command = commandRepository.save(command);
        // 2. 更新全局控制表
        GlobalControl control = globalControlRepository.findByProgramCode(programCode)
                .orElseGet(() -> GlobalControl.builder()
                        .id(UUID.randomUUID().toString())
                        .programCode(programCode)
                        .build());
        control.setKillSwitchEnabled(true);
        control.setKillSwitchActivatedAt(Instant.now());
        control.setKillSwitchActivatedBy(operatorId);
        control.setKillSwitchReason(reason);
        control.setUpdatedBy(operatorId);
        control.setUpdatedAt(Instant.now());
        globalControlRepository.save(control);
        // 3. 发布 Kill Switch 信号到 Redis（所有 Worker 立即生效）
        redisTemplate.opsForValue().set(KILL_SWITCH_KEY + programCode, "true", Duration.ofHours(24));
        // 4. 查找所有 RUNNING Campaign，自动取消
        List<CampaignPlan> runningPlans = planRepository.findByProgramCodeAndStatus(programCode, "RUNNING");
        for (CampaignPlan plan : runningPlans) {
            try {
                // 调用取消逻辑
                this.cancelCampaign(plan.getId(), "SYSTEM", "Emergency stop: " + reason);
            } catch (Exception e) {
                log.error("Failed to auto-cancel campaign {} during emergency stop: {}", plan.getId(), e.getMessage());
            }
        }
        // 5. 更新命令状态
        command.setStatus("COMPLETED");
        command.setExecutedAt(Instant.now());
        command.setExecutedBy(operatorId);
        commandRepository.save(command);
        // 6. 发布事件
        eventPublisher.publishEmergencyStop(programCode, operatorId, reason);
        log.warn("Emergency stop completed: programCode={}, cancelled {} campaigns", 
                programCode, runningPlans.size());
        return command;
    }
    /**
     * 解除紧急停止
     */
    @Transactional
    public InterventionCommand releaseEmergencyStop(String programCode, String operatorId, String reason) {
        log.info("Releasing emergency stop: programCode={}, operator={}", programCode, operatorId);
        InterventionCommand command = buildGlobalCommand(programCode, "RELEASE_EMERGENCY_STOP", operatorId, reason);
        command = commandRepository.save(command);
        // 更新全局控制表
        GlobalControl control = globalControlRepository.findByProgramCode(programCode)
                .orElseThrow(() -> new RuntimeException("Global control not found: " + programCode));
        control.setKillSwitchEnabled(false);
        control.setUpdatedBy(operatorId);
        control.setUpdatedAt(Instant.now());
        globalControlRepository.save(control);
        // 清除 Redis 信号
        redisTemplate.delete(KILL_SWITCH_KEY + programCode);
        command.setStatus("COMPLETED");
        command.setExecutedAt(Instant.now());
        command.setExecutedBy(operatorId);
        commandRepository.save(command);
        log.info("Emergency stop released: programCode={}", programCode);
        return command;
    }
    // ==================== 状态查询 ====================
    /**
     * 检查 Campaign 是否被暂停（Worker 防护）
     */
    public boolean isPaused(String planId) {
        // 先查 Redis 缓存（快速路径）
        String paused = (String) redisTemplate.opsForValue().get(PAUSE_SIGNAL_KEY + planId);
        if (paused != null) {
            return "true".equals(paused);
        }
        // 查数据库
        CampaignPlan plan = planRepository.findById(planId).orElse(null);
        if (plan == null) return false;
        return "PAUSED_BY_USER".equals(plan.getStatus());
    }
    /**
     * 检查是否有限流
     */
    public double getThrottleFactor(String programCode) {
        // 先查 Redis
        Double factor = (Double) redisTemplate.opsForValue().get(THROTTLE_KEY + programCode);
        if (factor != null) {
            return factor;
        }
        // 查数据库
        GlobalControl control = globalControlRepository.findByProgramCode(programCode).orElse(null);
        if (control == null || !control.isThrottleEnabled()) {
            return 1.0;
        }
        if (control.getThrottleUntil() != null && control.getThrottleUntil().isBefore(Instant.now())) {
            // 已过期
            return 1.0;
        }
        return control.getThrottleFactor().doubleValue();
    }
    /**
     * 检查 Kill Switch 是否激活
     */
    public boolean isKillSwitchActive(String programCode) {
        // 先查 Redis
        String kill = (String) redisTemplate.opsForValue().get(KILL_SWITCH_KEY + programCode);
        if (kill != null) {
            return "true".equals(kill);
        }
        GlobalControl control = globalControlRepository.findByProgramCode(programCode).orElse(null);
        return control != null && control.isKillSwitchEnabled();
    }
    // ==================== 干预历史查询 ====================
    public List<InterventionCommand> getInterventionHistory(String planId) {
        return commandRepository.findByCampaignIdOrderByCreatedAtDesc(planId);
    }
    public InterventionCommand getInterventionDetail(String commandId) {
        return commandRepository.findById(commandId)
                .orElseThrow(() -> new RuntimeException("Command not found: " + commandId));
    }
    // ==================== 私有方法 ====================
    private InterventionCommand buildCommand(String planId, String nodeId, String commandType,
                                              String operatorId, String reason) {
        return InterventionCommand.builder()
                .id(UUID.randomUUID().toString())
                .campaignId(planId)
                .targetNodeId(nodeId)
                .commandType(commandType)
                .operatorId(operatorId)
                .operatorName(getOperatorName(operatorId))
                .operatorRole(getOperatorRole(operatorId))
                .reason(reason)
                .status("PENDING")
                .createdAt(Instant.now())
                .build();
    }
    private InterventionCommand buildGlobalCommand(String programCode, String commandType,
                                                    String operatorId, String reason) {
        return InterventionCommand.builder()
                .id(UUID.randomUUID().toString())
                .programCode(programCode)
                .commandType(commandType)
                .operatorId(operatorId)
                .operatorName(getOperatorName(operatorId))
                .operatorRole(getOperatorRole(operatorId))
                .reason(reason)
                .severity("CRITICAL")
                .status("PENDING")
                .createdAt(Instant.now())
                .build();
    }
    private JsonNode getNodeConfigFromGraph(CampaignPlan plan, String nodeId) {
        JsonNode graph = plan.getGraphJson();
        if (graph == null) return objectMapper.createObjectNode();
        JsonNode nodes = graph.path("nodes");
        if (!nodes.isArray()) return objectMapper.createObjectNode();
        for (JsonNode node : nodes) {
            if (node.path("id").asText().equals(nodeId)) {
                return node.path("config");
            }
        }
        return objectMapper.createObjectNode();
    }
    private String getOperatorName(String operatorId) {
        // 调用 Loyalty UserService 获取用户名
        return operatorId; // 简化实现
    }
    private String getOperatorRole(String operatorId) {
        // 调用 Loyalty 权限服务获取角色
        return "OPERATOR"; // 简化实现
    }
}
```
### 14.3.2 Worker 防护拦截器
```java
package com.loyalty.platform.campaign.execution.worker;
import com.loyalty.platform.campaign.intervention.InterventionService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkerGuard {
    private final InterventionService interventionService;
    /**
     * Worker 执行前防护检查
     * 
     * 检查项：
     * 1. Campaign 是否被暂停
     * 2. 是否触发 Kill Switch
     * 3. 是否有限流（返回限流因子）
     */
    public GuardResult check(String planId, String programCode) {
        // 1. Kill Switch 检查（最高优先级）
        if (interventionService.isKillSwitchActive(programCode)) {
            log.warn("Kill switch active: programCode={}", programCode);
            return GuardResult.killSwitch();
        }
        // 2. 暂停检查
        if (interventionService.isPaused(planId)) {
            log.debug("Campaign paused: planId={}", planId);
            return GuardResult.paused();
        }
        // 3. 限流检查
        double throttleFactor = interventionService.getThrottleFactor(programCode);
        if (throttleFactor < 1.0) {
            log.debug("Throttle active: programCode={}, factor={}", programCode, throttleFactor);
            return GuardResult.throttled(throttleFactor);
        }
        return GuardResult.pass();
    }
    @Data
    @Builder
    public static class GuardResult {
        private boolean blocked;
        private String reason;
        private double throttleFactor;
        public static GuardResult pass() {
            return GuardResult.builder().blocked(false).throttleFactor(1.0).build();
        }
        public static GuardResult paused() {
            return GuardResult.builder().blocked(true).reason("CAMPAIGN_PAUSED").throttleFactor(1.0).build();
        }
        public static GuardResult killSwitch() {
            return GuardResult.builder().blocked(true).reason("KILL_SWITCH_ACTIVE").throttleFactor(1.0).build();
        }
        public static GuardResult throttled(double factor) {
            return GuardResult.builder().blocked(false).reason("THROTTLED").throttleFactor(factor).build();
        }
        public boolean shouldSkip() {
            return blocked;
        }
    }
}
```
### 14.3.3 增强版 Channel Worker（集成防护）
```java
@Slf4j
@Component
@RequiredArgsConstructor
public class SendEmailWorker extends BaseCampaignWorker {
    private final WorkerGuard workerGuard;
    private final ChannelService channelService;
    // ... 其他依赖
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) throws Exception {
        String planId = getString(variables, "planId");
        String programCode = getString(variables, "programCode");
        List<String> memberIds = getStringList(variables, "memberIds");
        // ===== 防护检查（必须执行） =====
        GuardResult guard = workerGuard.check(planId, programCode);
        if (guard.shouldSkip()) {
            log.warn("Worker execution skipped due to guard: planId={}, reason={}", planId, guard.getReason());
            return Map.of(
                "status", "SKIPPED",
                "reason", guard.getReason(),
                "skippedAt", Instant.now().toString()
            );
        }
        // 限流处理
        if (guard.getThrottleFactor() < 1.0) {
            // 按比例抽样发送
            double factor = guard.getThrottleFactor();
            int sendCount = (int) (memberIds.size() * factor);
            memberIds = memberIds.stream().limit(sendCount).collect(Collectors.toList());
            log.info("Throttle applied: planId={}, original={}, throttled={}", 
                    planId, memberIds.size() + (int)(memberIds.size() * (1 - factor)), memberIds.size());
        }
        // 正常执行发送逻辑...
        // ...
    }
}
```
***
## 14.4 前端界面设计
### 14.4.1 干预控制台（Campaign 详情页）
```text
┌─ 执行监控 ──────────────────────────────────────────────────────────────────┐
│  计划: Q2高价值会员召回                                                    │
│  状态: 🔄 运行中  │  执行ID: exec_003  │  已运行: 5分32秒                │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 干预控制 ─────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  [⏸️ 暂停执行]  [▶️ 恢复执行]  [⏹️ 取消执行]  [⚙️ 紧急限流]           │ │
│  │                                                                         │ │
│  │  当前干预状态: 无                                                       │ │
│  │  历史干预: 2 次  |  最近: 10:05 暂停 (李四)                            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 节点级控制 ───────────────────────────────────────────────────────────┐ │
│  │  节点列表:                                                             │ │
│  │  ├─ [✅] 人群筛选 (已完成)      [重试] [跳过]                         │ │
│  │  ├─ [✅] AI评分 (已完成)        [重试] [跳过]                         │ │
│  │  ├─ [🔄] 条件分支 (运行中)      [重试] [跳过] [修改配置]              │ │
│  │  └─ [⏳] 发送邮件 (待执行)      [重试] [跳过]                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 干预历史 ─────────────────────────────────────────────────────────────┐ │
│  │  时间          │ 操作人  │ 操作类型   │ 原因          │ 状态         │ │
│  │  10:05:23      │ 李四    │ PAUSE      │ 预算需确认    │ ✅ 已完成   │ │
│  │  10:08:45      │ 李四    │ RESUME     │ 已确认        │ ✅ 已完成   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 14.4.2 全局紧急控制面板
```text
┌─ 全局紧急控制 ──────────────────────────────────────────────────────────────┐
│  ⚠️ 紧急操作区 (仅限管理员)                                                │
│                                                                             │
│  ┌─ 全局限流 ─────────────────────────────────────────────────────────────┐ │
│  │  限流比例: [██████░░░░░░] 60%  持续时间: [2 小时]                     │ │
│  │  说明: 将 Campaign 发送量限制为原来的 60%                              │ │
│  │                                                                         │ │
│  │  [🔴 启用限流]                                                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 紧急停止 (Kill Switch) ──────────────────────────────────────────────┐ │
│  │  ⚠️ 此操作将立即终止当前 Program 下的所有 Campaign                     │ │
│  │                                                                         │ │
│  │  原因: [________________________________]                              │ │
│  │                                                                         │ │
│  │  [🚨 紧急停止]  [需要二级审批]                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 当前状态 ─────────────────────────────────────────────────────────────┐ │
│  │  Kill Switch: 关闭  |  限流: 100% (正常)                              │ │
│  │  最后操作: 2026-06-26 10:00:00 (王五)                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 14.5 前后端 JSON 交互
### 14.5.1 暂停 Campaign
**Request:**
```json
POST /api/campaign/intervention/pause
{
    "planId": "plan_001",
    "operatorId": "user_001",
    "reason": "预算需要重新确认"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "commandId": "cmd_001",
        "planId": "plan_001",
        "commandType": "PAUSE",
        "status": "COMPLETED",
        "operatorId": "user_001",
        "reason": "预算需要重新确认",
        "executedAt": "2026-06-26T10:05:00Z"
    }
}
```
### 14.5.2 紧急停止
**Request:**
```json
POST /api/campaign/intervention/emergency-stop
{
    "programCode": "BRAND_A",
    "operatorId": "admin_001",
    "reason": "突发舆情事件，紧急停止所有营销活动"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "commandId": "cmd_002",
        "programCode": "BRAND_A",
        "commandType": "EMERGENCY_STOP",
        "severity": "EMERGENCY",
        "status": "COMPLETED",
        "cancelledCampaigns": 3,
        "affectedCampaignIds": ["plan_001", "plan_002", "plan_003"],
        "executedAt": "2026-06-26T10:10:00Z"
    }
}
```
***
## 14.6 前端复杂逻辑伪代码
### 14.6.1 干预操作 Hook
```typescript
// hooks/useIntervention.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
export const useIntervention = (planId: string) => {
  const queryClient = useQueryClient();
  const pause = useMutation({
    mutationFn: async (reason: string) => {
      return api.post('/api/campaign/intervention/pause', { planId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution-status', planId] });
      queryClient.invalidateQueries({ queryKey: ['intervention-history', planId] });
    }
  });
  const resume = useMutation({
    mutationFn: async (reason?: string) => {
      return api.post('/api/campaign/intervention/resume', { planId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution-status', planId] });
    }
  });
  const cancel = useMutation({
    mutationFn: async (reason: string) => {
      return api.post('/api/campaign/intervention/cancel', { planId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution-status', planId] });
    }
  });
  const skipNode = useMutation({
    mutationFn: async ({ nodeId, reason }: { nodeId: string; reason: string }) => {
      return api.post('/api/campaign/intervention/skip-node', { planId, nodeId, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution-steps', planId] });
    }
  });
  const overrideConfig = useMutation({
    mutationFn: async ({ nodeId, config, reason }: { 
      nodeId: string; config: Record<string, any>; reason: string 
    }) => {
      return api.post('/api/campaign/intervention/override-config', { planId, nodeId, config, reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['execution-steps', planId] });
    }
  });
  const { data: history } = useQuery({
    queryKey: ['intervention-history', planId],
    queryFn: () => api.get(`/api/campaign/intervention/history/${planId}`),
    enabled: !!planId
  });
  return { pause, resume, cancel, skipNode, overrideConfig, history };
};
```
### 14.6.2 紧急停止确认对话框
```tsx
// components/intervention/EmergencyStopDialog.tsx
import React, { useState } from 'react';
interface EmergencyStopDialogProps {
  programCode: string;
  onConfirm: (reason: string) => Promise<void>;
  onCancel: () => void;
}
export const EmergencyStopDialog: React.FC<EmergencyStopDialogProps> = ({
  programCode,
  onConfirm,
  onCancel
}) => {
  const [reason, setReason] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const handleConfirm = async () => {
    if (confirmText !== 'EMERGENCY STOP') {
      alert('请输入 "EMERGENCY STOP" 确认');
      return;
    }
    setIsLoading(true);
    try {
      await onConfirm(reason);
    } finally {
      setIsLoading(false);
    }
  };
  return (
    <div className="emergency-stop-dialog">
      <div className="dialog-overlay">
        <div className="dialog-content danger">
          <h2>🚨 紧急停止</h2>
          <p className="warning-text">
            此操作将立即终止 <strong>{programCode}</strong> 下所有正在运行的 Campaign。
            已发送的消息无法撤回。
          </p>
          <div className="form-group">
            <label>停止原因 *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请详细说明停止原因（用于审计）"
              rows={3}
            />
          </div>
          <div className="form-group">
            <label>请输入 "EMERGENCY STOP" 确认</label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="输入 EMERGENCY STOP"
            />
          </div>
          <div className="dialog-actions">
            <button onClick={onCancel} className="btn-secondary" disabled={isLoading}>
              取消
            </button>
            <button 
              onClick={handleConfirm} 
              className="btn-danger"
              disabled={isLoading || !reason || confirmText !== 'EMERGENCY STOP'}
            >
              {isLoading ? '执行中...' : '🚨 确认紧急停止'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```
***
## 14.7 异常处理与业务规则
### 14.7.1 异常枚举
```java
public enum InterventionErrorCode {
    CAMPAIGN_NOT_RUNNING("I001", "Campaign is not in RUNNING state"),
    CAMPAIGN_ALREADY_PAUSED("I002", "Campaign is already paused"),
    CAMPAIGN_ALREADY_CANCELLED("I003", "Campaign already cancelled"),
    NODE_NOT_FOUND("I004", "Node not found in campaign graph"),
    NODE_ALREADY_COMPLETED("I005", "Node already completed"),
    NODE_ALREADY_FAILED("I006", "Node already failed"),
    INSUFFICIENT_PERMISSION("I007", "Insufficient permission for this operation"),
    INTERVENTION_NOT_FOUND("I008", "Intervention command not found"),
    INTERVENTION_ALREADY_PROCESSED("I009", "Intervention already processed"),
    EMERGENCY_STOP_REQUIRES_APPROVAL("I010", "Emergency stop requires secondary approval"),
    THROTTLE_FACTOR_INVALID("I011", "Throttle factor must be between 0 and 1");
}
```
### 14.7.2 权限控制
```java
@PreAuthorize("hasRole('ADMIN') or hasRole('MARKETING_MANAGER')")
public InterventionCommand pauseCampaign(String planId, String operatorId, String reason) {
    // 只有 ADMIN 和 MARKETING_MANAGER 可以暂停
}
@PreAuthorize("hasRole('ADMIN')")
public InterventionCommand emergencyStop(String programCode, String operatorId, String reason) {
    // 只有 ADMIN 可以紧急停止
}
```
### 14.7.3 审计合规
所有干预操作自动记录审计日志，包含：
* 操作人、时间、IP
* 操作类型、原因
* 前后状态快照
* 操作结果
```java
@Aspect
@Component
public class InterventionAuditAspect {
    
    @Around("@annotation(AuditableIntervention)")
    public Object audit(ProceedingJoinPoint joinPoint) throws Throwable {
        String operation = joinPoint.getSignature().getName();
        Object[] args = joinPoint.getArgs();
        
        // 记录开始
        log.info("Intervention started: operation={}, args={}", operation, args);
        
        long startTime = System.currentTimeMillis();
        try {
            Object result = joinPoint.proceed();
            long duration = System.currentTimeMillis() - startTime;
            log.info("Intervention completed: operation={}, duration={}ms", operation, duration);
            return result;
        } catch (Exception e) {
            log.error("Intervention failed: operation={}, error={}", operation, e.getMessage());
            throw e;
        }
    }
}
```
***
## 14.8 与 Loyalty 系统的集成点
| 集成点             | Loyalty 能力      | 使用时机         |
| --------------- | --------------- | ------------ |
| **用户身份**        | 用户服务            | 获取操作人姓名、角色   |
| **权限管理**        | 权限服务            | 校验操作人是否有干预权限 |
| **EventBridge** | 事件发布            | 所有干预操作发布事件   |
| **操作日志**        | `operation_log` | 可复用记录审计日志    |
***
## 14.9 开发实施检查清单
* 创建 `campaign_intervention_command` 表
* 创建 `campaign_intervention_approval` 表
* 创建 `campaign_global_control` 表
* 实现 `InterventionService`（暂停/恢复/取消/跳过/改配）
* 实现全局干预功能（限流/Kill Switch）
* 实现 `WorkerGuard`（Worker 防护拦截器）
* 集成 `WorkerGuard` 到所有 Channel Worker
* 实现 Redis 信号机制（暂停/限流/Kill Switch）
* 实现前端干预控制台
* 实现前端紧急控制面板
* 实现前端干预历史查询
* 实现权限控制（RBAC）
* 实现审计日志
* 编写单元测试（覆盖率 > 80%）
* 编写集成测试（端到端干预场景）
