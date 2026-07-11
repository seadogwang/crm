## 第11章：End-to-End Execution Runtime（完整执行链路）详细设计
End-to-End Execution Runtime 是 Campaign Tools 的**“执行链路总成”**，将前面所有模块——Canvas（第8章）、Compiler（第9章）、Node System（第10章）、Zeebe Engine（第5章）、Event System（第6章）——串联成一条完整的、可观测的、可恢复的生产级执行流水线。
***
## 11.0 模块概述
### 11.0.1 本质定义
Execution Runtime 是**事件驱动 + 工作流驱动 + AI辅助决策的混合执行系统**。它将 Campaign Plan 从“蓝图”（Canvas DAG）转化为“现实”（真实的用户触达），并实时追踪、记录、反馈每一步的执行状态。
### 11.0.2 核心设计原则
| 原则         | 说明                              |
| ---------- | ------------------------------- |
| **端到端可追踪** | 从用户点击“启动”到最后一个用户收到消息，全链路可查询、可追溯 |
| **异步解耦**   | 各环节通过 Kafka/Zeebe 异步解耦，互不阻塞     |
| **最终一致性**  | 执行状态通过事件溯源保证最终一致，允许短暂的不一致       |
| **优雅降级**   | 任一环节失败不影响整体，通过重试、补偿、降级保证系统可用    |
| **生产就绪**   | 支持水平扩展、蓝绿部署、灰度发布                |
### 11.0.3 完整执行链路总图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         完整执行链路                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. 用户触发 (API / UI)                                            │   │
│  │     POST /api/campaign/execution/start                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  2. Execution Service (核心调度器)                                  │   │
│  │     · 加载 Campaign Plan + Canvas Graph                            │   │
│  │     · 调用 Compiler 生成 BPMN                                      │   │
│  │     · 调用 Zeebe Deploy                                            │   │
│  │     · 调用 Zeebe Create Instance                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  3. Zeebe Workflow Engine (流程编排)                               │   │
│  │     · Start Event → Service Task → Gateway → ... → End Event      │   │
│  │     · 状态持久化 (事件溯源)                                         │   │
│  │     · Timer / Message 事件管理                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  4. Zeebe Workers (任务执行)                                       │   │
│  │     · AudienceFilterWorker → AIScoreWorker → SendEmailWorker      │   │
│  │     · 每个 Worker 调用 NodeHandler + Loyalty 服务                  │   │
│  │     · 幂等检查 + 重试 + 超时控制                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  5. Event System (事件采集)                                        │   │
│  │     · 每个节点完成 → 发布事件到 Kafka                              │   │
│  │     · 用户曝光/互动/转化 → 发布事件到 Kafka                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  6. Feedback Loop (闭环学习)                                       │   │
│  │     · 事件处理 → Feature Store 更新                                │   │
│  │     · 偏差检测 → 模型漂移 → 策略调整                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  7. 状态同步 (实时监控)                                            │   │
│  │     · Redis 缓存执行状态 → WebSocket/SSE 推送前端                  │   │
│  │     · PostgreSQL 持久化执行历史                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 11.1 数据模型设计
### 11.1.1 执行主表（campaign\_execution\_master）
存储每次执行的整体信息，作为执行链路的“根记录”。
sql
```
CREATE TABLE campaign_execution_master (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64),
    -- 执行标识
    execution_key BIGINT UNIQUE,                    -- Zeebe Process Instance Key
    zeebe_process_id VARCHAR(100),
    zeebe_version INT,
    -- 状态
    status VARCHAR(32) NOT NULL,                    -- CREATED / DEPLOYING / DEPLOYED / STARTING / RUNNING / COMPLETED / FAILED / CANCELLED / PAUSED
    -- 统计
    total_nodes INT DEFAULT 0,
    completed_nodes INT DEFAULT 0,
    failed_nodes INT DEFAULT 0,
    total_users INT DEFAULT 0,
    processed_users INT DEFAULT 0,
    -- 时间
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_ms BIGINT,
    -- 元数据
    triggered_by VARCHAR(64),                       -- 触发人（SYSTEM 或 用户ID）
    trigger_source VARCHAR(32),                     -- API / SCHEDULED / MANUAL
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cem_plan ON campaign_execution_master(plan_id);
CREATE INDEX idx_cem_workspace ON campaign_execution_master(workspace_id);
CREATE INDEX idx_cem_status ON campaign_execution_master(status);
CREATE INDEX idx_cem_start ON campaign_execution_master(start_time DESC);
CREATE INDEX idx_cem_key ON campaign_execution_master(execution_key);
```
### 11.1.2 执行步骤表（campaign\_execution\_step）
记录每个节点/步骤的执行明细。
sql
```
CREATE TABLE campaign_execution_step (
    id VARCHAR(64) PRIMARY KEY,
    execution_id VARCHAR(64) NOT NULL,              -- 关联 execution_master
    plan_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,                   -- Canvas 节点 ID
    node_type VARCHAR(64) NOT NULL,
    node_name VARCHAR(255),
    -- 执行标识
    job_key BIGINT,                                 -- Zeebe Job Key
    worker_type VARCHAR(64),
    -- 输入输出
    input_snapshot JSONB,
    output_snapshot JSONB,
    -- 状态
    status VARCHAR(32) NOT NULL,                    -- PENDING / RUNNING / COMPLETED / FAILED / SKIPPED / RETRY
    error_message TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    -- 执行统计
    affected_users INT DEFAULT 0,
    success_count INT DEFAULT 0,
    fail_count INT DEFAULT 0,
    -- 时间
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_ms BIGINT,
    -- 元数据
    worker_host VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ces_execution ON campaign_execution_step(execution_id);
CREATE INDEX idx_ces_plan ON campaign_execution_step(plan_id);
CREATE INDEX idx_ces_node ON campaign_execution_step(node_id);
CREATE INDEX idx_ces_status ON campaign_execution_step(status);
CREATE INDEX idx_ces_start ON campaign_execution_step(start_time DESC);
```
### 11.1.3 用户级执行明细表（campaign\_execution\_user\_detail）
记录每个用户在每个节点的执行结果，用于精细化分析和问题排查。
sql
```
CREATE TABLE campaign_execution_user_detail (
    id VARCHAR(64) PRIMARY KEY,
    execution_id VARCHAR(64) NOT NULL,
    plan_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    -- 执行结果
    status VARCHAR(32) NOT NULL,                    -- SUCCESS / FAILED / SKIPPED
    channel VARCHAR(32),
    message_id VARCHAR(64),                         -- 渠道返回的消息ID
    error_message TEXT,
    -- 业务数据
    points_granted DECIMAL(18,4),
    coupon_issued VARCHAR(64),
    tier_upgraded VARCHAR(32),
    -- 时间
    executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ceud_execution ON campaign_execution_user_detail(execution_id);
CREATE INDEX idx_ceud_plan ON campaign_execution_user_detail(plan_id);
CREATE INDEX idx_ceud_user ON campaign_execution_user_detail(user_id);
CREATE INDEX idx_ceud_node ON campaign_execution_user_detail(node_id);
CREATE INDEX idx_ceud_status ON campaign_execution_user_detail(status);
```
***
## 11.2 后端 Service 详细设计
### 11.2.1 核心调度器：ExecutionRuntime
```java
package com.loyalty.platform.campaign.execution.runtime;
import com.fasterxml.jackson.databind.JsonNode;
import com.loyalty.platform.campaign.execution.compiler.CanvasToBpmnCompiler;
import com.loyalty.platform.campaign.execution.model.ExecutionMaster;
import com.loyalty.platform.campaign.execution.model.ExecutionStep;
import com.loyalty.platform.campaign.execution.repository.ExecutionMasterRepository;
import com.loyalty.platform.campaign.execution.repository.ExecutionStepRepository;
import com.loyalty.platform.campaign.execution.service.ZeebeDeployService;
import com.loyalty.platform.campaign.execution.service.ZeebeExecutionService;
import com.loyalty.platform.campaign.model.CampaignPlan;
import com.loyalty.platform.campaign.planning.repository.CampaignPlanRepository;
import io.camunda.zeebe.client.ZeebeClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.UUID;
@Slf4j
@Service
@RequiredArgsConstructor
public class ExecutionRuntime {
    private final CampaignPlanRepository planRepository;
    private final ExecutionMasterRepository masterRepository;
    private final ExecutionStepRepository stepRepository;
    private final CanvasToBpmnCompiler compiler;
    private final ZeebeDeployService deployService;
    private final ZeebeExecutionService executionService;
    private final ZeebeClient zeebeClient;
    private final CampaignEventPublisher eventPublisher;
    /**
     * 启动完整执行链路（核心入口）
     *
     * 伪代码：
     * 1. 加载 Plan + Canvas Graph
     * 2. 编译 BPMN
     * 3. 部署到 Zeebe
     * 4. 启动 Zeebe 流程实例
     * 5. 创建执行记录（Master + Steps）
     * 6. 发布执行开始事件
     * 7. 返回执行 ID
     */
    @Transactional
    public StartExecutionResult startExecution(String planId, String triggeredBy) {
        log.info("Starting execution runtime for plan: {}, triggeredBy: {}", planId, triggeredBy);
        // 1. 加载 Plan
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));
        // 2. 校验状态
        if ("RUNNING".equals(plan.getStatus()) || "COMPLETED".equals(plan.getStatus())) {
            throw new IllegalStateException("Plan is already " + plan.getStatus());
        }
        JsonNode graph = plan.getGraphJson();
        if (graph == null || graph.isNull()) {
            throw new IllegalStateException("Plan has no canvas graph");
        }
        // 3. 创建执行主记录
        String executionId = UUID.randomUUID().toString();
        ExecutionMaster master = ExecutionMaster.builder()
                .id(executionId)
                .planId(planId)
                .workspaceId(plan.getWorkspaceId())
                .goalId(plan.getGoalId())
                .status("CREATED")
                .totalNodes(countNodes(graph))
                .triggeredBy(triggeredBy)
                .triggerSource("API")
                .startTime(Instant.now())
                .build();
        master = masterRepository.save(master);
        log.info("Execution master created: id={}", executionId);
        // 4. 创建节点执行步骤记录（预创建，状态为 PENDING）
        List<ExecutionStep> steps = createSteps(executionId, planId, graph);
        stepRepository.saveAll(steps);
        log.info("Created {} execution steps", steps.size());
        // 5. 编译 BPMN
        String bpmnXml;
        try {
            bpmnXml = compiler.compile(plan.getCanvasId(), graph);
        } catch (Exception e) {
            log.error("Compilation failed for plan {}: {}", planId, e.getMessage());
            master.setStatus("FAILED");
            master.setErrorMessage("Compilation failed: " + e.getMessage());
            masterRepository.save(master);
            throw new RuntimeException("Compilation failed: " + e.getMessage(), e);
        }
        // 6. 部署到 Zeebe
        String processId;
        try {
            processId = deployService.deployWithBpmn(planId, bpmnXml);
            master.setZeebeProcessId(processId);
            master.setZeebeVersion(plan.getZeebeVersion());
            master.setStatus("DEPLOYED");
            masterRepository.save(master);
        } catch (Exception e) {
            log.error("Deploy failed for plan {}: {}", planId, e.getMessage());
            master.setStatus("FAILED");
            master.setErrorMessage("Deploy failed: " + e.getMessage());
            masterRepository.save(master);
            throw new RuntimeException("Deploy failed: " + e.getMessage(), e);
        }
        // 7. 启动 Zeebe 流程实例
        Long processInstanceKey;
        try {
            processInstanceKey = executionService.startProcessInstance(planId);
            master.setExecutionKey(processInstanceKey);
            master.setStatus("RUNNING");
            masterRepository.save(master);
        } catch (Exception e) {
            log.error("Start failed for plan {}: {}", planId, e.getMessage());
            master.setStatus("FAILED");
            master.setErrorMessage("Start failed: " + e.getMessage());
            masterRepository.save(master);
            throw new RuntimeException("Start failed: " + e.getMessage(), e);
        }
        // 8. 更新 Plan 状态
        plan.setStatus("RUNNING");
        plan.setZeebeInstanceKey(processInstanceKey);
        planRepository.save(plan);
        // 9. 发布事件
        eventPublisher.publishExecutionStarted(planId, processInstanceKey);
        log.info("Execution started successfully: executionId={}, processInstanceKey={}",
                executionId, processInstanceKey);
        return StartExecutionResult.builder()
                .executionId(executionId)
                .planId(planId)
                .processInstanceKey(processInstanceKey)
                .status("RUNNING")
                .startTime(master.getStartTime())
                .build();
    }
    /**
     * 获取执行状态（含实时缓存）
     */
    public ExecutionStatus getExecutionStatus(String executionId) {
        // 1. 查数据库
        ExecutionMaster master = masterRepository.findById(executionId)
                .orElseThrow(() -> new RuntimeException("Execution not found"));
        // 2. 查 Redis 缓存（实时状态）
        String cacheKey = "execution:status:" + executionId;
        ExecutionStatus cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            return cached;
        }
        // 3. 从 Zeebe 查询最新状态
        if (master.getExecutionKey() != null) {
            try {
                // 调用 Zeebe Operate API 或直接查询状态
                // 简化：从数据库统计
                List<ExecutionStep> steps = stepRepository.findByExecutionId(executionId);
                long completed = steps.stream().filter(s -> "COMPLETED".equals(s.getStatus())).count();
                long failed = steps.stream().filter(s -> "FAILED".equals(s.getStatus())).count();
                master.setCompletedNodes((int) completed);
                master.setFailedNodes((int) failed);
                masterRepository.save(master);
            } catch (Exception e) {
                log.warn("Failed to query Zeebe status: {}", e.getMessage());
            }
        }
        // 4. 构建返回结果
        ExecutionStatus status = ExecutionStatus.builder()
                .executionId(executionId)
                .planId(master.getPlanId())
                .processInstanceKey(master.getExecutionKey())
                .status(master.getStatus())
                .totalNodes(master.getTotalNodes())
                .completedNodes(master.getCompletedNodes())
                .failedNodes(master.getFailedNodes())
                .totalUsers(master.getTotalUsers())
                .processedUsers(master.getProcessedUsers())
                .startTime(master.getStartTime())
                .endTime(master.getEndTime())
                .durationMs(master.getDurationMs())
                .errorMessage(master.getErrorMessage())
                .build();
        // 5. 缓存到 Redis
        redisTemplate.opsForValue().set(cacheKey, status, Duration.ofSeconds(5));
        return status;
    }
    /**
     * 获取执行步骤列表
     */
    public List<ExecutionStep> getExecutionSteps(String executionId) {
        return stepRepository.findByExecutionIdOrderByStartTimeAsc(executionId);
    }
    /**
     * 取消执行
     */
    @Transactional
    public void cancelExecution(String executionId, String reason) {
        ExecutionMaster master = masterRepository.findById(executionId)
                .orElseThrow(() -> new RuntimeException("Execution not found"));
        if ("COMPLETED".equals(master.getStatus()) || "CANCELLED".equals(master.getStatus())) {
            throw new IllegalStateException("Execution already " + master.getStatus());
        }
        // 1. 取消 Zeebe 流程
        if (master.getExecutionKey() != null) {
            try {
                zeebeClient.newCancelInstanceCommand(master.getExecutionKey())
                        .send()
                        .join();
            } catch (Exception e) {
                log.warn("Failed to cancel Zeebe instance: {}", e.getMessage());
            }
        }
        // 2. 更新状态
        master.setStatus("CANCELLED");
        master.setEndTime(Instant.now());
        master.setErrorMessage("Cancelled by user: " + reason);
        masterRepository.save(master);
        // 3. 更新 Plan
        CampaignPlan plan = planRepository.findById(master.getPlanId()).orElse(null);
        if (plan != null) {
            plan.setStatus("CANCELLED");
            planRepository.save(plan);
        }
        // 4. 发布事件
        eventPublisher.publishExecutionCancelled(master.getPlanId(), reason);
        log.info("Execution cancelled: executionId={}, reason={}", executionId, reason);
    }
    // ---- 私有方法 ----
    private int countNodes(JsonNode graph) {
        JsonNode nodes = graph.path("nodes");
        return nodes.isArray() ? nodes.size() : 0;
    }
    private List<ExecutionStep> createSteps(String executionId, String planId, JsonNode graph) {
        List<ExecutionStep> steps = new ArrayList<>();
        JsonNode nodes = graph.path("nodes");
        if (nodes.isArray()) {
            for (JsonNode node : nodes) {
                String nodeId = node.path("id").asText();
                String nodeType = node.path("type").asText();
                String nodeName = node.has("name") ? node.path("name").asText() : nodeType;
                ExecutionStep step = ExecutionStep.builder()
                        .id(UUID.randomUUID().toString())
                        .executionId(executionId)
                        .planId(planId)
                        .nodeId(nodeId)
                        .nodeType(nodeType)
                        .nodeName(nodeName)
                        .inputSnapshot(node.path("config"))
                        .status("PENDING")
                        .maxRetries(3)
                        .build();
                steps.add(step);
            }
        }
        return steps;
    }
    /**
     * Zeebe Worker 回调：更新步骤状态
     */
    @Transactional
    public void updateStepStatus(String executionId, String nodeId, String status,
                                  Map<String, Object> output, String errorMessage) {
        ExecutionStep step = stepRepository.findByExecutionIdAndNodeId(executionId, nodeId)
                .orElseThrow(() -> new RuntimeException("Step not found"));
        step.setStatus(status);
        if (output != null) {
            step.setOutputSnapshot(JsonUtil.toJsonNode(output));
        }
        if (errorMessage != null) {
            step.setErrorMessage(errorMessage);
        }
        if ("COMPLETED".equals(status) || "FAILED".equals(status)) {
            step.setEndTime(Instant.now());
            step.setDurationMs(step.getStartTime() != null ?
                    Instant.now().toEpochMilli() - step.getStartTime().toEpochMilli() : 0);
        }
        stepRepository.save(step);
        // 更新主表统计
        updateMasterStatistics(executionId);
        // 清除缓存
        redisTemplate.delete("execution:status:" + executionId);
    }
    private void updateMasterStatistics(String executionId) {
        ExecutionMaster master = masterRepository.findById(executionId).orElse(null);
        if (master == null) return;
        List<ExecutionStep> steps = stepRepository.findByExecutionId(executionId);
        long completed = steps.stream().filter(s -> "COMPLETED".equals(s.getStatus())).count();
        long failed = steps.stream().filter(s -> "FAILED".equals(s.getStatus())).count();
        master.setCompletedNodes((int) completed);
        master.setFailedNodes((int) failed);
        // 如果所有节点都完成或失败，标记执行完成
        if (completed + failed >= master.getTotalNodes()) {
            master.setStatus(failed > 0 ? "PARTIAL_FAILED" : "COMPLETED");
            master.setEndTime(Instant.now());
            master.setDurationMs(master.getStartTime() != null ?
                    Instant.now().toEpochMilli() - master.getStartTime().toEpochMilli() : 0);
        }
        masterRepository.save(master);
        // 如果是最终状态，发布完成事件
        if ("COMPLETED".equals(master.getStatus()) || "PARTIAL_FAILED".equals(master.getStatus())) {
            eventPublisher.publishExecutionCompleted(
                    master.getPlanId(),
                    master.getExecutionKey(),
                    master.getDurationMs(),
                    master.getCompletedNodes()
            );
        }
    }
}
```
### 11.2.2 Zeebe Worker 回调适配器
```java
package com.loyalty.platform.campaign.execution.runtime;
import com.loyalty.platform.campaign.execution.node.NodeExecutionContext;
import com.loyalty.platform.campaign.execution.node.NodeExecutionResult;
import com.loyalty.platform.campaign.execution.node.NodeHandler;
import com.loyalty.platform.campaign.execution.node.NodeRegistry;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Component
@RequiredArgsConstructor
public class WorkerCallbackAdapter {
    private final NodeRegistry nodeRegistry;
    private final ExecutionRuntime executionRuntime;
    /**
     * 通用 Worker 执行适配器
     * 
     * 每个 Zeebe Worker 调用此方法，由 NodeRegistry 路由到具体的 NodeHandler
     */
    @JobWorker(type = "*", autoOpen = false)  // 不自动开启，由具体 Worker 类调用
    public void executeJob(JobClient client, ActivatedJob job) {
        Map<String, Object> variables = job.getVariablesAsMap();
        
        // 1. 提取执行上下文
        String executionId = (String) variables.get("executionId");
        String planId = (String) variables.get("planId");
        String nodeId = (String) variables.get("nodeId");
        String nodeType = (String) variables.get("nodeType");
        if (executionId == null || nodeId == null || nodeType == null) {
            log.error("Missing required variables: executionId={}, nodeId={}, nodeType={}",
                    executionId, nodeId, nodeType);
            client.newFailCommand(job.getKey())
                    .retries(0)
                    .errorMessage("Missing required variables")
                    .send()
                    .join();
            return;
        }
        log.info("Worker execution: executionId={}, nodeId={}, nodeType={}",
                executionId, nodeId, nodeType);
        // 2. 获取 NodeHandler
        NodeHandler handler;
        try {
            handler = nodeRegistry.getHandler(nodeType);
        } catch (Exception e) {
            log.error("Handler not found for nodeType: {}", nodeType);
            failJob(client, job, "Handler not found: " + nodeType);
            return;
        }
        // 3. 构建执行上下文
        NodeExecutionContext context = NodeExecutionContext.builder()
                .planId(planId)
                .nodeId(nodeId)
                .nodeType(nodeType)
                .config(JsonUtil.toJsonNode(variables.get("config")))
                .inputs(variables)
                .executionId(executionId)
                .processInstanceKey(job.getProcessInstanceKey())
                .build();
        // 4. 记录步骤开始
        executionRuntime.updateStepStart(executionId, nodeId, job.getKey());
        // 5. 执行 Node
        NodeExecutionResult result;
        try {
            result = handler.execute(context);
        } catch (Exception e) {
            log.error("Node execution error: {}", e.getMessage(), e);
            result = NodeExecutionResult.builder()
                    .nodeId(nodeId)
                    .status("FAILED")
                    .errorMessage(e.getMessage())
                    .build();
        }
        // 6. 更新步骤状态
        executionRuntime.updateStepStatus(
                executionId,
                nodeId,
                result.getStatus(),
                result.getOutputs(),
                result.getErrorMessage()
        );
        // 7. 完成 Zeebe Job
        if ("SUCCESS".equals(result.getStatus())) {
            Map<String, Object> variablesToComplete = new HashMap<>();
            if (result.getOutputs() != null) {
                variablesToComplete.putAll(result.getOutputs());
            }
            // 保留必要的上下文变量
            variablesToComplete.put("executionId", executionId);
            variablesToComplete.put("planId", planId);
            client.newCompleteCommand(job.getKey())
                    .variables(variablesToComplete)
                    .send()
                    .join();
            log.info("Job completed: executionId={}, nodeId={}", executionId, nodeId);
        } else {
            // 失败处理
            int retries = job.getRetries() - 1;
            if (retries > 0) {
                client.newFailCommand(job.getKey())
                        .retries(retries)
                        .errorMessage(result.getErrorMessage())
                        .send()
                        .join();
                log.warn("Job failed, retrying: executionId={}, nodeId={}, retries={}",
                        executionId, nodeId, retries);
            } else {
                client.newFailCommand(job.getKey())
                        .retries(0)
                        .errorMessage(result.getErrorMessage())
                        .send()
                        .join();
                log.error("Job failed, no more retries: executionId={}, nodeId={}",
                        executionId, nodeId);
            }
        }
    }
    private void failJob(JobClient client, ActivatedJob job, String message) {
        client.newFailCommand(job.getKey())
                .retries(0)
                .errorMessage(message)
                .send()
                .join();
    }
}
```
### 11.2.3 执行状态机
```java
package com.loyalty.platform.campaign.execution.runtime;
public enum ExecutionState {
    // 主流程状态
    CREATED("创建"),
    DEPLOYING("部署中"),
    DEPLOYED("已部署"),
    STARTING("启动中"),
    RUNNING("运行中"),
    PAUSED("已暂停"),
    COMPLETED("已完成"),
    PARTIAL_FAILED("部分失败"),
    FAILED("失败"),
    CANCELLED("已取消");
    private final String displayName;
    ExecutionState(String displayName) {
        this.displayName = displayName;
    }
    public String getDisplayName() {
        return displayName;
    }
    public boolean isFinal() {
        return this == COMPLETED || this == FAILED || this == CANCELLED || this == PARTIAL_FAILED;
    }
    public boolean isTerminal() {
        return this == COMPLETED || this == CANCELLED;
    }
    public boolean canTransitionTo(ExecutionState target) {
        switch (this) {
            case CREATED:
                return target == DEPLOYING || target == CANCELLED;
            case DEPLOYING:
                return target == DEPLOYED || target == FAILED || target == CANCELLED;
            case DEPLOYED:
                return target == STARTING || target == CANCELLED;
            case STARTING:
                return target == RUNNING || target == FAILED || target == CANCELLED;
            case RUNNING:
                return target == PAUSED || target == COMPLETED || target == PARTIAL_FAILED || target == FAILED || target == CANCELLED;
            case PAUSED:
                return target == RUNNING || target == CANCELLED;
            default:
                return false;
        }
    }
}
```
***
## 11.3 前端界面设计
### 11.3.1 执行启动入口（Plan 详情页）
```text
┌─ 计划详情: Q2高价值会员召回 ──────────────────────────────────────────────┐
│  状态: DRAFT  │  创建: 2026-06-26  │  版本: v3                           │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 执行控制 ─────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  当前状态: ⚪ 未执行                                                    │ │
│  │                                                                         │ │
│  │  [▶ 启动执行]  [📋 部署]  [🧪 模拟测试]                                │ │
│  │                                                                         │ │
│  │  ⚠️ 执行前确认:                                                         │ │
│  │  ✅ Canvas 已保存 (5个节点)                                             │ │
│  │  ✅ 所有素材已审批 (2个素材)                                            │ │
│  │  ⚠️ 预算: ¥100,000 (需确认)                                            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 执行历史 ─────────────────────────────────────────────────────────────┐ │
│  │  执行ID    │ 状态     │ 开始时间   │ 耗时   │ 节点   │ 操作          │ │
│  │  exec_003  │ ✅ 完成  │ 06-26 10:00│ 5m32s  │ 5/5   │ [查看]        │ │
│  │  exec_002  │ ❌ 失败  │ 06-25 16:00│ -      │ 3/5   │ [查看] [重试] │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 11.3.2 执行监控仪表板（实时）
```text
┌─ 执行监控 ──────────────────────────────────────────────────────────────────┐
│  执行ID: exec_003  │  计划: Q2高价值会员召回                              │
│  状态: 🔄 运行中  │  已运行: 5分32秒  │  预计剩余: 2分15秒               │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 执行概览 ─────────────────────────────────────────────────────────────┐ │
│  │  总节点: 5   已完成: 3  运行中: 1  失败: 0  待执行: 1                │ │
│  │  ████████████████████████░░░░░░░░░░░░░░░░░░░░ 60%                     │ │
│  │  处理用户: 12,345 / 12,345 (100%)                                     │ │
│  │  成功: 11,234  │  失败: 1,111                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 流程执行可视化 ──────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  [START] ──► [人群筛选] ──► [AI评分] ──► [条件分支] ──► [发送邮件]   │ │
│  │              ✅ 12,345人   ✅ 完成      🔄 运行中     ⏳ 待执行       │ │
│  │                              avg:0.72   处理:6,789人                   │ │
│  │                                              │                         │ │
│  │                                              └──► [发放积分] ──► [END] │ │
│  │                                                   ⏳ 待执行            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 实时日志 ─────────────────────────────────────────────────────────────┐ │
│  │  时间          │ 节点        │ 状态    │ 详情                        │ │
│  │  10:05:23.456  │ 人群筛选    │ ✅ 完成 │ 筛选 12,345 人             │ │
│  │  10:05:45.123  │ AI评分      │ ✅ 完成 │ 平均分 0.72                │ │
│  │  10:06:12.789  │ 条件分支    │ 🔄 运行 │ 高价值: 6,789 低: 5,556   │ │
│  │  10:06:15.012  │ 条件分支    │ ℹ️ 信息 │ 高价值用户占比 55%         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [⏸️ 暂停] [▶️ 恢复] [⏹️ 取消] [📊 导出报告] [🔔 设置告警]              │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 11.3.3 执行详情（节点明细）
```text
┌─ 节点执行详情 ──────────────────────────────────────────────────────────────┐
│  节点: 发送邮件 (N4)                                                        │
│  状态: ✅ 已完成  │  耗时: 2分34秒  │  Worker: worker-01                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 输入 ─────────────────────────────────────────────────────────────────┐ │
│  │  {                                                                     │ │
│  │    "memberIds": ["M_12345", "M_23456", ...],  共 6,789 个             │ │
│  │    "assetId": "asset_001",                                            │ │
│  │    "requireApproval": true,                                           │ │
│  │    "retryCount": 3                                                    │ │
│  │  }                                                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 输出 ─────────────────────────────────────────────────────────────────┐ │
│  │  {                                                                     │ │
│  │    "successCount": 6234,                                              │ │
│  │    "failCount": 555,                                                 │ │
│  │    "totalCount": 6789,                                               │ │
│  │    "sentAt": "2026-06-26T10:08:23Z"                                  │ │
│  │  }                                                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 用户明细 (Top 10) ───────────────────────────────────────────────────┐ │
│  │  用户ID    │ 状态     │ 消息ID             │ 时间                   │ │
│  │  M_12345  │ ✅ 成功  │ msg_001            │ 10:08:23.456          │ │
│  │  M_23456  │ ✅ 成功  │ msg_002            │ 10:08:23.789          │ │
│  │  M_34567  │ ❌ 失败  │ 邮箱无效           │ 10:08:24.012          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                              [查看全部]  [导出明细]                         │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 11.4 前后端 JSON 交互
### 11.4.1 启动执行
**Request:**
```json
POST /api/campaign/execution/start
{
    "planId": "plan_001",
    "triggeredBy": "user_001"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "executionId": "exec_003",
        "planId": "plan_001",
        "processInstanceKey": 2251799813685249,
        "status": "RUNNING",
        "startTime": "2026-06-26T10:00:00Z"
    }
}
```
### 11.4.2 获取执行状态（实时）
**Request:**
```json
GET /api/campaign/execution/exec_003/status
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "executionId": "exec_003",
        "planId": "plan_001",
        "processInstanceKey": 2251799813685249,
        "status": "RUNNING",
        "totalNodes": 5,
        "completedNodes": 3,
        "failedNodes": 0,
        "pendingNodes": 1,
        "runningNodes": 1,
        "progress": 60,
        "totalUsers": 12345,
        "processedUsers": 12345,
        "successCount": 11234,
        "failCount": 1111,
        "startTime": "2026-06-26T10:00:00Z",
        "estimatedRemaining": "2m15s",
        "steps": [
            {
                "nodeId": "N2",
                "nodeType": "AUDIENCE_FILTER",
                "nodeName": "人群筛选",
                "status": "COMPLETED",
                "startTime": "2026-06-26T10:00:05Z",
                "endTime": "2026-06-26T10:00:23Z",
                "durationMs": 18000,
                "output": { "count": 12345 }
            },
            {
                "nodeId": "N3",
                "nodeType": "AI_SCORE",
                "nodeName": "AI评分",
                "status": "COMPLETED",
                "startTime": "2026-06-26T10:00:25Z",
                "endTime": "2026-06-26T10:00:45Z",
                "durationMs": 20000,
                "output": { "avgScore": 0.72 }
            },
            {
                "nodeId": "N4",
                "nodeType": "CONDITION",
                "nodeName": "条件分支",
                "status": "RUNNING",
                "startTime": "2026-06-26T10:00:47Z",
                "endTime": null,
                "durationMs": null,
                "output": null
            }
        ]
    }
}
```
### 11.4.3 取消执行
**Request:**
```json
POST /api/campaign/execution/exec_003/cancel
{
    "reason": "预算变更，需重新规划"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "executionId": "exec_003",
        "status": "CANCELLED",
        "cancelledAt": "2026-06-26T10:15:00Z"
    }
}
```
***
## 11.5 前端复杂逻辑伪代码
### 11.5.1 执行状态实时订阅（WebSocket/SSE）
```typescript
// hooks/useExecutionMonitor.ts
import { useEffect, useState } from 'react';
import { EventSourcePolyfill } from 'event-source-polyfill';
interface ExecutionStatus {
  executionId: string;
  status: string;
  progress: number;
  totalNodes: number;
  completedNodes: number;
  failedNodes: number;
  steps: ExecutionStep[];
  totalUsers: number;
  processedUsers: number;
  successCount: number;
  failCount: number;
  startTime: string;
  estimatedRemaining: string;
}
export const useExecutionMonitor = (executionId: string) => {
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!executionId) return;
    // 使用 SSE 接收实时状态更新
    const eventSource = new EventSourcePolyfill(
      `/api/campaign/execution/${executionId}/stream`,
      {
        heartbeatTimeout: 30000,
        withCredentials: true
      }
    );
    eventSource.onopen = () => {
      setConnected(true);
      setError(null);
      console.log('SSE connected for execution:', executionId);
    };
    // 状态更新事件
    eventSource.addEventListener('status-update', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      setStatus(data);
    });
    // 节点完成事件（增量更新）
    eventSource.addEventListener('node-completed', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      setStatus((prev) => {
        if (!prev) return prev;
        const steps = prev.steps.map(s =>
          s.nodeId === data.nodeId ? { ...s, status: 'COMPLETED', ...data } : s
        );
        return {
          ...prev,
          steps,
          completedNodes: prev.completedNodes + 1,
          progress: ((prev.completedNodes + 1) / prev.totalNodes) * 100
        };
      });
    });
    // 执行完成事件
    eventSource.addEventListener('execution-completed', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      setStatus((prev) => prev ? { ...prev, status: 'COMPLETED' } : null);
      eventSource.close();
    });
    // 执行失败事件
    eventSource.addEventListener('execution-failed', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      setStatus((prev) => prev ? { ...prev, status: 'FAILED', errorMessage: data.error } : null);
      eventSource.close();
    });
    // 心跳检测
    eventSource.addEventListener('heartbeat', () => {
      // 保持连接
    });
    eventSource.onerror = (err) => {
      console.error('SSE error:', err);
      setConnected(false);
      // 自动重连（EventSource 会自动重连）
    };
    // 先拉取初始状态
    fetchInitialStatus(executionId);
    return () => {
      eventSource.close();
    };
  }, [executionId]);
  const fetchInitialStatus = async (id: string) => {
    try {
      const response = await api.get(`/api/campaign/execution/${id}/status`);
      setStatus(response.data);
    } catch (err) {
      setError(err.message);
    }
  };
  return { status, connected, error };
};
```
### 11.5.2 执行控制组件
```tsx
// components/execution/ExecutionControls.tsx
import React, { useState } from 'react';
interface ExecutionControlsProps {
  planId: string;
  currentStatus: string;
  onStatusChange: () => void;
}
export const ExecutionControls: React.FC<ExecutionControlsProps> = ({
  planId,
  currentStatus,
  onStatusChange
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const handleStart = async () => {
    setIsLoading(true);
    try {
      await api.post('/api/campaign/execution/start', { planId });
      onStatusChange();
    } catch (error) {
      alert('启动失败: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };
  const handleCancel = async (reason: string) => {
    setIsLoading(true);
    try {
      await api.post(`/api/campaign/execution/${planId}/cancel`, { reason });
      onStatusChange();
    } catch (error) {
      alert('取消失败: ' + error.message);
    } finally {
      setIsLoading(false);
      setShowConfirmDialog(false);
    }
  };
  const renderActions = () => {
    switch (currentStatus) {
      case 'DRAFT':
      case 'GENERATED':
      case 'DEPLOYED':
        return (
          <div className="actions">
            <button 
              onClick={handleStart} 
              disabled={isLoading}
              className="btn-primary btn-lg"
            >
              {isLoading ? '⏳ 启动中...' : '▶ 启动执行'}
            </button>
            <button className="btn-secondary">
              📋 部署（仅编译）
            </button>
          </div>
        );
      case 'RUNNING':
        return (
          <div className="actions">
            <button 
              onClick={() => setShowConfirmDialog(true)}
              className="btn-danger"
            >
              ⏹️ 取消执行
            </button>
            <button className="btn-warning">
              ⏸️ 暂停
            </button>
          </div>
        );
      case 'PAUSED':
        return (
          <div className="actions">
            <button className="btn-primary">
              ▶️ 恢复执行
            </button>
            <button 
              onClick={() => setShowConfirmDialog(true)}
              className="btn-danger"
            >
              ⏹️ 取消执行
            </button>
          </div>
        );
      case 'COMPLETED':
        return <span className="badge-success">✅ 执行已完成</span>;
      case 'FAILED':
        return (
          <div className="actions">
            <button className="btn-primary">
              🔄 重试执行
            </button>
            <button className="btn-secondary">
              📊 查看错误
            </button>
          </div>
        );
      default:
        return null;
    }
  };
  return (
    <div className="execution-controls">
      {renderActions()}
      
      {/* 取消确认对话框 */}
      {showConfirmDialog && (
        <ConfirmDialog
          title="确认取消执行"
          message="取消后执行将立即终止，已发送的消息无法撤回。是否继续？"
          onConfirm={(reason) => handleCancel(reason)}
          onCancel={() => setShowConfirmDialog(false)}
        />
      )}
    </div>
  );
};
```
### 11.5.3 执行进度可视化组件
```tsx
// components/execution/ExecutionProgress.tsx
import React from 'react';
interface ExecutionProgressProps {
  status: ExecutionStatus;
}
export const ExecutionProgress: React.FC<ExecutionProgressProps> = ({ status }) => {
  const progress = status.progress || 0;
  const color = progress >= 80 ? '#22c55e' : progress >= 50 ? '#eab308' : '#3b82f6';
  return (
    <div className="execution-progress">
      <div className="progress-header">
        <span className="progress-label">执行进度</span>
        <span className="progress-value">{progress.toFixed(0)}%</span>
      </div>
      
      <div className="progress-track">
        <div 
          className="progress-fill"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>
      
      <div className="progress-stats">
        <div className="stat-item">
          <span className="stat-label">已完成节点</span>
          <span className="stat-value">{status.completedNodes}</span>
          <span className="stat-total">/ {status.totalNodes}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">处理用户</span>
          <span className="stat-value">{status.processedUsers.toLocaleString()}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">成功率</span>
          <span className="stat-value">
            {status.totalUsers > 0 
              ? ((status.successCount / status.totalUsers) * 100).toFixed(1)
              : 0}%
          </span>
        </div>
        <div className="stat-item">
          <span className="stat-label">预计剩余</span>
          <span className="stat-value">{status.estimatedRemaining || '计算中...'}</span>
        </div>
      </div>
    </div>
  );
};
```
***
## 11.6 异常处理与业务规则
### 11.6.1 异常枚举
```java
public enum ExecutionRuntimeErrorCode {
    PLAN_NOT_FOUND("R001", "Campaign plan not found"),
    PLAN_ALREADY_RUNNING("R002", "Plan is already running"),
    PLAN_ALREADY_COMPLETED("R003", "Plan already completed"),
    COMPILATION_FAILED("R004", "BPMN compilation failed"),
    DEPLOY_FAILED("R005", "Zeebe deployment failed"),
    START_FAILED("R006", "Zeebe start failed"),
    EXECUTION_NOT_FOUND("R007", "Execution not found"),
    EXECUTION_ALREADY_COMPLETED("R008", "Execution already completed"),
    CANCEL_FAILED("R009", "Cancel execution failed"),
    NODE_HANDLER_NOT_FOUND("R010", "Node handler not found"),
    NODE_EXECUTION_FAILED("R011", "Node execution failed"),
    STEP_UPDATE_FAILED("R012", "Step status update failed");
}
```
### 11.6.2 超时与重试策略
```java
@Component
public class ExecutionTimeoutHandler {
    
    @Value("${execution.global.timeout.seconds:3600}")
    private int globalTimeoutSeconds;
    
    @Value("${execution.step.timeout.seconds:300}")
    private int stepTimeoutSeconds;
    
    @Scheduled(fixedDelay = 60000)  // 每分钟检查一次
    public void checkTimeoutExecutions() {
        // 1. 查找超时的执行
        List<ExecutionMaster> runningExecutions = masterRepository.findByStatus("RUNNING");
        Instant now = Instant.now();
        
        for (ExecutionMaster master : runningExecutions) {
            if (master.getStartTime() != null) {
                long runningSeconds = Duration.between(master.getStartTime(), now).getSeconds();
                if (runningSeconds > globalTimeoutSeconds) {
                    // 标记为超时失败
                    master.setStatus("FAILED");
                    master.setErrorMessage("Execution timeout after " + globalTimeoutSeconds + "s");
                    master.setEndTime(now);
                    masterRepository.save(master);
                    
                    // 取消 Zeebe 流程
                    if (master.getExecutionKey() != null) {
                        try {
                            zeebeClient.newCancelInstanceCommand(master.getExecutionKey())
                                    .send().join();
                        } catch (Exception e) {
                            log.warn("Failed to cancel timeout instance: {}", e.getMessage());
                        }
                    }
                    
                    log.warn("Execution timeout: executionId={}, runningSeconds={}",
                            master.getId(), runningSeconds);
                }
            }
        }
    }
}
```
### 11.6.3 执行恢复（断点续传）
```java
@Component
public class ExecutionRecoveryService {
    
    /**
     * 从断点恢复执行
     * 
     * 场景：Zeebe 集群重启或执行因异常中断后，恢复流程
     */
    public void recoverExecution(String executionId) {
        ExecutionMaster master = masterRepository.findById(executionId)
                .orElseThrow(() -> new RuntimeException("Execution not found"));
        
        if (!"RUNNING".equals(master.getStatus()) && !"PAUSED".equals(master.getStatus())) {
            throw new IllegalStateException("Execution cannot be recovered: " + master.getStatus());
        }
        
        // 1. 检查 Zeebe 流程是否还存在
        if (master.getExecutionKey() != null) {
            try {
                // 查询 Zeebe 流程状态
                // 如果流程已不存在，需要重新启动
            } catch (Exception e) {
                log.warn("Zeebe instance not found, restarting: {}", master.getExecutionKey());
                // 重新启动
                restartExecution(master);
            }
        }
        
        // 2. 恢复未完成的节点
        List<ExecutionStep> pendingSteps = stepRepository.findByExecutionIdAndStatusIn(
                executionId, List.of("PENDING", "RUNNING", "RETRY"));
        
        for (ExecutionStep step : pendingSteps) {
            // 重新触发执行
            // 通过 Zeebe 重新发布 Job
        }
    }
}
```
***
## 11.7 与 Loyalty 系统的集成点
| 集成点             | Loyalty 能力                            | 使用时机                 |
| --------------- | ------------------------------------- | -------------------- |
| **会员查询**        | `MemberService.findByMemberId()`      | 每个 Action Worker 执行时 |
| **积分发放**        | `PointGrantService.grantPoints()`     | OfferPoints 节点执行时    |
| **优惠券发放**       | `CouponService.issueCoupon()`         | OfferCoupon 节点执行时    |
| **消息发送**        | `ChannelService.sendEmail/SMS/Push()` | 渠道节点执行时              |
| **等级变更**        | `TierService.upgrade()`               | TierUpgrade 节点执行时    |
| **EventBridge** | 事件发布                                  | 执行生命周期各节点            |
| **Kafka**       | 事件消费                                  | 用户转化事件反馈             |
| **LiteFlow**    | 保持独立                                  | 不涉及，继续服务 Loyalty 核心  |
***
## 11.8 开发实施检查清单
* 创建 `campaign_execution_master` 表
* 创建 `campaign_execution_step` 表
* 创建 `campaign_execution_user_detail` 表
* 实现 `ExecutionRuntime` 核心调度器
* 实现 `WorkerCallbackAdapter`（Zeebe Worker 回调适配）
* 实现 `ExecutionState` 状态机
* 实现 `ExecutionTimeoutHandler` 超时检测
* 实现 `ExecutionRecoveryService` 断点恢复
* 实现 `ExecutionStatus` 缓存（Redis）
* 实现 SSE/WebSocket 实时状态推送
* 前端实现 `useExecutionMonitor` Hook
* 前端实现执行控制组件
* 前端实现执行进度可视化
* 前端实现节点详情面板
* 集成 EventBridge 发布执行事件
* 编写单元测试（覆盖率 > 80%）
* 编写集成测试（端到端：启动 → 执行 → 完成）
