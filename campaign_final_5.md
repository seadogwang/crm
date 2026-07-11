## 第5章：Campaign Execution Engine（营销活动执行引擎）详细设计
Campaign Execution Engine 是 Campaign Tools 的**“营销执行操作系统（Marketing Runtime OS）”**，它把 Campaign Plan（DAG）变成**可控、可恢复、可追踪**的分布式执行流程。
***
## 5.0 模块概述
### 5.0.1 本质定义
Execution Engine 是**流程调度与任务执行层**，负责将编译后的 BPMN 流程（由第9章 Compiler 生成）在 Zeebe 中实例化，通过 Worker 集群执行具体营销动作，并实时追踪执行状态。
### 5.0.2 核心设计原则（与 Loyalty 融合）
| 原则                  | 说明                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------- |
| **引擎分工明确**          | **LiteFlow** 继续服务 Loyalty 核心事件处理（幂等、标准化、One-ID）；**Zeebe** 统一执行所有 Campaign 流程，两者独立共存                 |
| **完全复用 Loyalty 能力** | Workers 内部调用 Loyalty 现有服务（`PointGrantService`、`ChannelService`、`CouponService`、`TierService`），不重复建设 |
| **执行可观测**           | 通过 Zeebe Operate 和自定义日志表，实时查看流程状态、节点执行明细、失败堆栈                                                       |
| **幂等与容错**           | 基于 Zeebe 内置重试 + 业务去重表，保证 `Exactly-Once` 语义                                                          |
### 5.0.3 系统架构图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Campaign Execution Engine                            │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Canvas → BPMN Compiler (第9章)                       ││
│  │                        生成 .bpmn XML                                  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Zeebe Deploy Service                                 ││
│  │             部署 BPMN 到 Zeebe (deployResource)                        ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Zeebe Workflow Engine (Zeebe 8.5)                   ││
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     ││
│  │  │ Start   │→ │ Node 1  │→ │ Gateway │→ │ Node 2  │→ │ End     │     ││
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Zeebe Workers (Job Worker 集群)                     ││
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐     ││
│  │  │ Audience    │ │ AI Score    │ │ Send Email  │ │ Offer       │     ││
│  │  │ Worker      │ │ Worker      │ │ Worker      │ │ Points      │     ││
│  │  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                                      ▼                                      │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                    Loyalty 能力层 (完全复用)                            ││
│  │  · PointGrantService  · ChannelService  · CouponService  · TierService ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 5.1 执行引擎策略（确认）
### 5.1.1 Zeebe vs LiteFlow 分工（最终版）
| 引擎           | 职责范围           | 说明                                                |
| ------------ | -------------- | ------------------------------------------------- |
| **LiteFlow** | Loyalty 核心事件处理 | 幂等检查、数据标准化、One-ID 匹配、规则引擎（Drools）、动作执行，**完全保持不变** |
| **Zeebe**    | Campaign 流程执行  | 所有 Campaign 相关流程（含审批、长时等待、状态查询、Saga 补偿），**新增**    |
### 5.1.2 为什么选择 Zeebe（回顾）
| 能力          | LiteFlow | Zeebe           | Campaign 需求 |
| ----------- | -------- | --------------- | ----------- |
| 状态持久化       | ❌        | ✅ 事件溯源          | 流程中断后可恢复    |
| 人工审批节点      | ❌        | ✅ User Task     | 内容审批、预算审批   |
| 长时等待（定时/事件） | ⚠️ 需自建   | ✅ Timer/Message | 延迟发送、等待事件   |
| 流程状态查询      | ❌        | ✅ Operate UI    | 运营查看执行进度    |
| 失败补偿/Saga   | ⚠️ 需自建   | ✅ 原生支持          | 部分失败回滚      |
| 分布式高可用      | ⚠️ 需自建   | ✅ 原生支持          | 大规模并发执行     |
***
## 5.2 数据模型设计
### 5.2.1 扩展 campaign\_plan 表（增加 Zeebe 字段）
sql
```
-- 扩展 campaign_plan 表
ALTER TABLE campaign_plan ADD COLUMN zeebe_process_id VARCHAR(100);
ALTER TABLE campaign_plan ADD COLUMN zeebe_version INT;
ALTER TABLE campaign_plan ADD COLUMN zeebe_instance_key BIGINT;
ALTER TABLE campaign_plan ADD COLUMN zeebe_deploy_time TIMESTAMPTZ;
CREATE INDEX idx_cpl_zeebe_instance ON campaign_plan(zeebe_instance_key);
```
### 5.2.2 Zeebe 执行实例表（campaign\_zeebe\_instance）
存储每次流程实例的运行时信息。
sql
```
CREATE TABLE campaign_zeebe_instance (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    process_instance_key BIGINT NOT NULL UNIQUE,
    bpmn_process_id VARCHAR(100),
    version INT,
    status VARCHAR(32) NOT NULL,                     -- CREATED / RUNNING / COMPLETED / FAILED / CANCELLED / PAUSED
    variables JSONB,                                 -- 流程变量快照
    error_message TEXT,
    start_time TIMESTAMPTZ NOT NULL,
    end_time TIMESTAMPTZ,
    duration_ms BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_czi_plan ON campaign_zeebe_instance(plan_id);
CREATE INDEX idx_czi_key ON campaign_zeebe_instance(process_instance_key);
CREATE INDEX idx_czi_status ON campaign_zeebe_instance(status);
CREATE INDEX idx_czi_start ON campaign_zeebe_instance(start_time DESC);
```
### 5.2.3 Zeebe 任务执行明细表（campaign\_zeebe\_task）
记录每个 Job 的执行详情。
sql
```
CREATE TABLE campaign_zeebe_task (
    id VARCHAR(64) PRIMARY KEY,
    instance_id VARCHAR(64) NOT NULL,
    plan_id VARCHAR(64) NOT NULL,
    job_key BIGINT NOT NULL,
    task_type VARCHAR(64) NOT NULL,                  -- 对应 Worker 类型
    task_name VARCHAR(255),
    node_id VARCHAR(64),                             -- Canvas 节点 ID
    status VARCHAR(32) NOT NULL,                     -- CREATED / COMPLETED / FAILED / RETRY
    input_variables JSONB,
    output_variables JSONB,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    worker_id VARCHAR(64),                           -- 执行该任务的 Worker 实例标识
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    duration_ms BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_czt_instance ON campaign_zeebe_task(instance_id);
CREATE INDEX idx_czt_plan ON campaign_zeebe_task(plan_id);
CREATE INDEX idx_czt_job ON campaign_zeebe_task(job_key);
CREATE INDEX idx_czt_status ON campaign_zeebe_task(status);
CREATE INDEX idx_czt_type ON campaign_zeebe_task(task_type);
```
### 5.2.4 执行去重表（campaign\_execution\_dedup）
保证幂等性，防止重复发送/发放。
sql
```
CREATE TABLE campaign_execution_dedup (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64),
    user_id VARCHAR(64),
    channel VARCHAR(32),
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    ttl TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days')  -- 7天自动过期
);
CREATE INDEX idx_ced_plan ON campaign_execution_dedup(plan_id);
CREATE INDEX idx_ced_user ON campaign_execution_dedup(user_id);
CREATE INDEX idx_ced_ttl ON campaign_execution_dedup(ttl);
```
***
## 5.3 后端 Service 详细设计
### 5.3.1 Zeebe 环境配置
#### 依赖配置（pom.xml）
xml
运行
```
<!-- Zeebe Spring Boot Starter -->
<dependency>
    <groupId>io.camunda</groupId>
    <artifactId>spring-boot-starter-camunda</artifactId>
    <version>8.5.0</version>
</dependency>
<dependency>
    <groupId>io.camunda</groupId>
    <artifactId>zeebe-client-java</artifactId>
    <version>8.5.0</version>
</dependency>
<!-- 嵌入式 Zeebe（开发环境） -->
<dependency>
    <groupId>io.camunda</groupId>
    <artifactId>zeebe-embedded</artifactId>
    <version>8.5.0</version>
    <scope>runtime</scope>
</dependency>
```
#### application.yml 配置
```yaml
# ===== Zeebe 配置（开发环境 - 嵌入式） =====
zeebe:
  client:
    broker:
      gateway-address: localhost:26500
    security:
      plaintext: true
    default-request-timeout: 30s
  embedded:
    enabled: true
    container:
      port: 26500
    data:
      directory: ./zeebe-data
    # 开启 Operate（Web UI 监控）
    operate:
      enabled: true
      port: 8082
# ===== Zeebe 配置（生产环境 - 独立集群） =====
# zeebe:
#   client:
#     broker:
#       gateway-address: zeebe-gateway:26500
#     security:
#       plaintext: false
#       certificate-path: /certs/zeebe.crt
#   embedded:
#     enabled: false
# ===== Zeebe Worker 配置 =====
zeebe.worker:
  default:
    timeout: 30000           # 默认超时 30s
    max-jobs-active: 32      # 每个 Worker 同时处理的最大 Job 数
    poll-interval: 100ms
    fetch-variables:
      - planId
      - programCode
      - memberIds
      - campaignName
```
#### Zeebe 客户端配置（Java）
```java
package com.loyalty.platform.campaign.config;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.worker.JobWorker;
import io.camunda.zeebe.embedded.EmbeddedZeebe;
import io.camunda.zeebe.embedded.EmbeddedZeebeConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import java.time.Duration;
@Slf4j
@Configuration
public class ZeebeConfig {
    @Value("${zeebe.client.broker.gateway-address:localhost:26500}")
    private String gatewayAddress;
    /**
     * 开发环境：嵌入式 Zeebe
     */
    @Bean
    @Profile("dev")
    public EmbeddedZeebe embeddedZeebe() {
        log.info("Starting embedded Zeebe...");
        EmbeddedZeebeConfig config = EmbeddedZeebeConfig.builder()
                .setPort(26500)
                .setDataDirectory("./zeebe-data")
                .build();
        EmbeddedZeebe zeebe = EmbeddedZeebe.start(config);
        log.info("Embedded Zeebe started on port 26500");
        return zeebe;
    }
    /**
     * Zeebe Client（开发 + 生产共用）
     */
    @Bean
    public ZeebeClient zeebeClient(
            @Value("${zeebe.client.security.plaintext:true}") boolean plaintext) {
        
        log.info("Creating Zeebe client, gateway: {}", gatewayAddress);
        
        var builder = ZeebeClient.newClientBuilder()
                .gatewayAddress(gatewayAddress)
                .defaultRequestTimeout(Duration.ofSeconds(30));
        
        if (plaintext) {
            builder.usePlaintext();
        }
        
        ZeebeClient client = builder.build();
        log.info("Zeebe client created successfully");
        return client;
    }
    /**
     * 优雅关闭：关闭 Zeebe Client
     */
    @Bean(destroyMethod = "close")
    public ZeebeClient zeebeClientCloseable(ZeebeClient zeebeClient) {
        return zeebeClient;
    }
}
```
### 5.3.2 流程部署服务（ZeebeDeployService）
```java
package com.loyalty.platform.campaign.execution.service;
import com.fasterxml.jackson.databind.JsonNode;
import com.loyalty.platform.campaign.compiler.CanvasToBpmnCompiler;
import com.loyalty.platform.campaign.execution.repository.CampaignPlanRepository;
import com.loyalty.platform.campaign.execution.repository.ZeebeInstanceRepository;
import com.loyalty.platform.campaign.model.CampaignPlan;
import com.loyalty.platform.campaign.model.ZeebeInstance;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.response.DeploymentEvent;
import io.camunda.zeebe.client.api.response.Process;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.UUID;
@Slf4j
@Service
@RequiredArgsConstructor
public class ZeebeDeployService {
    private final ZeebeClient zeebeClient;
    private final CanvasToBpmnCompiler compiler;
    private final CampaignPlanRepository planRepository;
    private final ZeebeInstanceRepository instanceRepository;
    /**
     * 部署 Campaign 流程到 Zeebe
     *
     * 伪代码：
     * 1. 从 campaign_plan 获取 graph_json
     * 2. 调用 Compiler 编译为 BPMN XML
     * 3. 调用 Zeebe deployResourceCommand 部署
     * 4. 保存 processId 和 version 到 campaign_plan
     * 5. 返回 processId
     */
    @Transactional
    public String deployPlan(String planId) {
        log.info("Deploying campaign plan: {}", planId);
        // 1. 获取 Plan
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));
        // 2. 获取 Canvas Graph
        JsonNode graph = plan.getGraphJson();
        if (graph == null || graph.isNull()) {
            throw new IllegalStateException("Plan graph_json is empty, please generate campaign first");
        }
        // 3. 编译为 BPMN XML
        String bpmnXml = compiler.compile(plan.getCanvasId(), graph);
        String bpmnFileName = "campaign_" + planId + ".bpmn";
        log.debug("BPMN compiled, size: {} chars", bpmnXml.length());
        // 4. 部署到 Zeebe
        DeploymentEvent deployment;
        try {
            deployment = zeebeClient.newDeployResourceCommand()
                    .addResourceString(bpmnXml, bpmnFileName)
                    .send()
                    .join();  // 同步等待部署完成
        } catch (Exception e) {
            log.error("Zeebe deploy failed for plan {}: {}", planId, e.getMessage(), e);
            throw new RuntimeException("Zeebe deploy failed: " + e.getMessage(), e);
        }
        // 5. 提取 Process 信息
        Process deployedProcess = deployment.getProcesses().get(0);
        String processId = deployedProcess.getBpmnProcessId();
        int version = deployedProcess.getVersion();
        log.info("Deployment successful: planId={}, processId={}, version={}, key={}",
                planId, processId, version, deployedProcess.getProcessDefinitionKey());
        // 6. 更新 Plan
        plan.setZeebeProcessId(processId);
        plan.setZeebeVersion(version);
        plan.setZeebeDeployTime(Instant.now());
        planRepository.save(plan);
        return processId;
    }
}
```
### 5.3.3 流程执行服务（ZeebeExecutionService）
```java
package com.loyalty.platform.campaign.execution.service;
import com.loyalty.platform.campaign.execution.repository.CampaignPlanRepository;
import com.loyalty.platform.campaign.execution.repository.ZeebeInstanceRepository;
import com.loyalty.platform.campaign.execution.repository.ZeebeTaskRepository;
import com.loyalty.platform.campaign.model.CampaignPlan;
import com.loyalty.platform.campaign.model.ZeebeInstance;
import com.loyalty.platform.campaign.model.ZeebeTask;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.response.ProcessInstanceEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
@Slf4j
@Service
@RequiredArgsConstructor
public class ZeebeExecutionService {
    private final ZeebeClient zeebeClient;
    private final CampaignPlanRepository planRepository;
    private final ZeebeInstanceRepository instanceRepository;
    private final ZeebeTaskRepository taskRepository;
    /**
     * 启动 Campaign 流程实例
     *
     * 伪代码：
     * 1. 检查 Plan 是否已部署
     * 2. 构建流程变量（planId, programCode, 用户列表等）
     * 3. 调用 Zeebe createInstanceCommand 启动
     * 4. 保存 ZeebeInstance 记录
     * 5. 更新 Plan 状态为 RUNNING
     * 6. 返回 processInstanceKey
     */
    @Transactional
    public Long startExecution(String planId) {
        log.info("Starting execution for plan: {}", planId);
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found: " + planId));
        // 1. 校验是否已部署
        if (plan.getZeebeProcessId() == null) {
            throw new IllegalStateException("Plan not deployed, please call deploy first");
        }
        // 2. 校验状态
        if ("RUNNING".equals(plan.getStatus()) || "COMPLETED".equals(plan.getStatus())) {
            throw new IllegalStateException("Plan is already " + plan.getStatus());
        }
        // 3. 准备流程变量
        Map<String, Object> variables = new HashMap<>();
        variables.put("planId", planId);
        variables.put("programCode", plan.getProgramCode());
        variables.put("campaignName", plan.getName());
        variables.put("totalBudget", plan.getTotalBudget() != null ? plan.getTotalBudget().doubleValue() : 0);
        variables.put("startTime", plan.getStartTime() != null ? plan.getStartTime().toString() : null);
        variables.put("endTime", plan.getEndTime() != null ? plan.getEndTime().toString() : null);
        // 将 Canvas 节点配置也作为变量传入（Worker 可以读取）
        if (plan.getGraphJson() != null) {
            variables.put("canvasNodes", plan.getGraphJson().path("nodes"));
            variables.put("canvasEdges", plan.getGraphJson().path("edges"));
        }
        // 4. 启动 Zeebe 流程实例
        ProcessInstanceEvent instance;
        try {
            instance = zeebeClient.newCreateInstanceCommand()
                    .bpmnProcessId(plan.getZeebeProcessId())
                    .latestVersion()
                    .variables(variables)
                    .send()
                    .join();
        } catch (Exception e) {
            log.error("Zeebe start failed for plan {}: {}", planId, e.getMessage(), e);
            throw new RuntimeException("Zeebe start failed: " + e.getMessage(), e);
        }
        long processInstanceKey = instance.getProcessInstanceKey();
        log.info("Process instance started: planId={}, processInstanceKey={}",
                planId, processInstanceKey);
        // 5. 保存 ZeebeInstance 记录
        ZeebeInstance zeebeInstance = ZeebeInstance.builder()
                .id(UUID.randomUUID().toString())
                .planId(planId)
                .processInstanceKey(processInstanceKey)
                .bpmnProcessId(plan.getZeebeProcessId())
                .version(plan.getZeebeVersion())
                .status("RUNNING")
                .variables(variables)
                .startTime(Instant.now())
                .build();
        instanceRepository.save(zeebeInstance);
        // 6. 更新 Plan
        plan.setZeebeInstanceKey(processInstanceKey);
        plan.setStatus("RUNNING");
        planRepository.save(plan);
        return processInstanceKey;
    }
    /**
     * 获取流程执行状态
     */
    public ExecutionStatus getExecutionStatus(String planId) {
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found"));
        if (plan.getZeebeInstanceKey() == null) {
            return ExecutionStatus.builder()
                    .planId(planId)
                    .status("NOT_STARTED")
                    .build();
        }
        // 从数据库查询 Instance 状态
        ZeebeInstance instance = instanceRepository
                .findByPlanId(planId)
                .orElse(null);
        if (instance == null) {
            return ExecutionStatus.builder()
                    .planId(planId)
                    .status("UNKNOWN")
                    .build();
        }
        // 查询最近的任务执行记录
        List<ZeebeTask> recentTasks = taskRepository
                .findTop10ByPlanIdOrderByStartTimeDesc(planId);
        return ExecutionStatus.builder()
                .planId(planId)
                .processInstanceKey(instance.getProcessInstanceKey())
                .status(instance.getStatus())
                .startTime(instance.getStartTime())
                .endTime(instance.getEndTime())
                .durationMs(instance.getDurationMs())
                .errorMessage(instance.getErrorMessage())
                .recentTasks(recentTasks)
                .build();
    }
    /**
     * 暂停流程（通过修改流程变量触发暂停网关）
     */
    public void pauseExecution(String planId, String reason) {
        log.info("Pausing execution for plan: {}, reason: {}", planId, reason);
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found"));
        if (!"RUNNING".equals(plan.getStatus())) {
            throw new IllegalStateException("Only RUNNING plan can be paused");
        }
        // 设置暂停变量（BPMN 中预埋的暂停网关会检测此变量）
        zeebeClient.newSetVariablesCommand(plan.getZeebeInstanceKey())
                .variables(Map.of(
                        "pauseRequested", true,
                        "pauseReason", reason,
                        "pauseTimestamp", Instant.now().toString()
                ))
                .send()
                .join();
        plan.setStatus("PAUSED");
        planRepository.save(plan);
        // 更新 Instance 状态
        instanceRepository.updateStatusByPlanId(planId, "PAUSED");
    }
    /**
     * 恢复执行
     */
    public void resumeExecution(String planId) {
        log.info("Resuming execution for plan: {}", planId);
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found"));
        if (!"PAUSED".equals(plan.getStatus())) {
            throw new IllegalStateException("Only PAUSED plan can be resumed");
        }
        // 清除暂停标志
        zeebeClient.newSetVariablesCommand(plan.getZeebeInstanceKey())
                .variables(Map.of("pauseRequested", false))
                .send()
                .join();
        plan.setStatus("RUNNING");
        planRepository.save(plan);
        instanceRepository.updateStatusByPlanId(planId, "RUNNING");
    }
    /**
     * 取消执行（终止）
     */
    public void cancelExecution(String planId) {
        log.info("Cancelling execution for plan: {}", planId);
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found"));
        if (plan.getZeebeInstanceKey() == null) {
            throw new IllegalStateException("No running instance found");
        }
        // 调用 Zeebe 取消
        zeebeClient.newCancelInstanceCommand(plan.getZeebeInstanceKey())
                .send()
                .join();
        plan.setStatus("CANCELLED");
        planRepository.save(plan);
        instanceRepository.updateStatusByPlanId(planId, "CANCELLED");
    }
}
```
### 5.3.4 Worker 基类与具体实现
#### Worker 基类（BaseCampaignWorker）
```java
package com.loyalty.platform.campaign.execution.worker;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import lombok.extern.slf4j.Slf4j;
import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;
@Slf4j
public abstract class BaseCampaignWorker {
    protected final ObjectMapper objectMapper = new ObjectMapper();
    /**
     * Worker 类型名称（子类实现）
     */
    protected abstract String getWorkerType();
    /**
     * 核心业务逻辑（子类实现）
     */
    protected abstract Map<String, Object> doExecute(Map<String, Object> variables) throws Exception;
    /**
     * Zeebe Job 处理入口
     */
    public void handle(JobClient client, ActivatedJob job) {
        long processInstanceKey = job.getProcessInstanceKey();
        String workerType = getWorkerType();
        long jobKey = job.getKey();
        log.info("Worker {} started: jobKey={}, processInstanceKey={}",
                workerType, jobKey, processInstanceKey);
        Map<String, Object> variables;
        try {
            variables = job.getVariablesAsMap();
        } catch (Exception e) {
            log.error("Worker {} failed to parse variables: {}", workerType, e.getMessage());
            failJob(client, job, e.getMessage());
            return;
        }
        try {
            // 执行业务逻辑
            Map<String, Object> result = doExecute(variables);
            // 添加执行元数据
            result.put("__worker", workerType);
            result.put("__jobKey", jobKey);
            result.put("__executedAt", Instant.now().toString());
            // 完成 Job
            client.newCompleteCommand(jobKey)
                    .variables(result)
                    .send()
                    .join();
            log.info("Worker {} completed: jobKey={}, processInstanceKey={}",
                    workerType, jobKey, processInstanceKey);
        } catch (Exception e) {
            log.error("Worker {} failed: jobKey={}, error={}",
                    workerType, jobKey, e.getMessage(), e);
            // 判断是否可重试
            boolean retryable = isRetryable(e);
            if (retryable && job.getRetries() > 1) {
                // Zeebe 自动重试
                client.newFailCommand(jobKey)
                        .retries(job.getRetries() - 1)
                        .errorMessage(e.getMessage())
                        .send()
                        .join();
            } else {
                failJob(client, job, e.getMessage());
            }
        }
    }
    protected void failJob(JobClient client, ActivatedJob job, String errorMessage) {
        client.newFailCommand(job.getKey())
                .retries(0)  // 不再重试
                .errorMessage(errorMessage)
                .send()
                .join();
    }
    protected boolean isRetryable(Exception e) {
        // 网络超时、临时服务不可用等为可重试
        return e instanceof java.net.SocketTimeoutException ||
                e instanceof org.springframework.dao.DataAccessResourceFailureException;
    }
    // ---- 工具方法 ----
    protected String getString(Map<String, Object> vars, String key) {
        Object val = vars.get(key);
        return val != null ? String.valueOf(val) : null;
    }
    protected Integer getInt(Map<String, Object> vars, String key) {
        Object val = vars.get(key);
        if (val == null) return null;
        if (val instanceof Number) return ((Number) val).intValue();
        return Integer.parseInt(String.valueOf(val));
    }
    protected BigDecimal getDecimal(Map<String, Object> vars, String key) {
        Object val = vars.get(key);
        if (val == null) return null;
        if (val instanceof BigDecimal) return (BigDecimal) val;
        if (val instanceof Number) return BigDecimal.valueOf(((Number) val).doubleValue());
        return new BigDecimal(String.valueOf(val));
    }
    @SuppressWarnings("unchecked")
    protected List<String> getStringList(Map<String, Object> vars, String key) {
        Object val = vars.get(key);
        if (val == null) return Collections.emptyList();
        if (val instanceof List) {
            return ((List<?>) val).stream()
                    .map(String::valueOf)
                    .collect(Collectors.toList());
        }
        return Collections.emptyList();
    }
}
```
#### 人群筛选 Worker（AudienceFilterWorker）
```java
package com.loyalty.platform.campaign.execution.worker;
import com.loyalty.platform.campaign.planning.repository.CampaignMemberDimRepository;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
@RequiredArgsConstructor
public class AudienceFilterWorker extends BaseCampaignWorker {
    private final CampaignMemberDimRepository memberDimRepository;
    @Override
    protected String getWorkerType() {
        return "campaign-audience-filter";
    }
    @JobWorker(type = "campaign-audience-filter", timeout = 30000, maxJobsActive = 10)
    public void handleJob(JobClient client, ActivatedJob job) {
        handle(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) throws Exception {
        String programCode = getString(variables, "programCode");
        String segmentCode = getString(variables, "segmentCode");
        Integer maxCount = getInt(variables, "maxCount");
        if (maxCount == null) maxCount = 10000;
        log.info("AudienceFilterWorker: programCode={}, segmentCode={}, maxCount={}",
                programCode, segmentCode, maxCount);
        // 从 Campaign 宽表查询会员
        List<String> memberIds = memberDimRepository.findMemberIdsByProgramAndSegment(
                programCode, segmentCode, maxCount
        );
        log.info("AudienceFilterWorker: found {} members", memberIds.size());
        Map<String, Object> result = new HashMap<>();
        result.put("memberIds", memberIds);
        result.put("count", memberIds.size());
        result.put("segmentCode", segmentCode);
        result.put("filteredAt", LocalDateTime.now().toString());
        return result;
    }
}
```
#### 发送邮件 Worker（SendEmailWorker）—— 调用 Loyalty ChannelService
```java
package com.loyalty.platform.campaign.execution.worker;
import com.loyalty.platform.loyalty.channel.ChannelService;   // Loyalty 服务
import com.loyalty.platform.loyalty.member.MemberService;     // Loyalty 服务
import com.loyalty.platform.campaign.content.ContentService;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
@Slf4j
@Component
@RequiredArgsConstructor
public class SendEmailWorker extends BaseCampaignWorker {
    private final ChannelService channelService;      // Loyalty 服务
    private final MemberService memberService;        // Loyalty 服务
    private final ContentService contentService;
    @Override
    protected String getWorkerType() {
        return "campaign-send-email";
    }
    @JobWorker(type = "campaign-send-email", timeout = 60000, maxJobsActive = 20)
    public void handleJob(JobClient client, ActivatedJob job) {
        handle(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) throws Exception {
        List<String> memberIds = getStringList(variables, "memberIds");
        String assetId = getString(variables, "assetId");
        String planId = getString(variables, "planId");
        String programCode = getString(variables, "programCode");
        if (memberIds == null || memberIds.isEmpty()) {
            log.warn("SendEmailWorker: no memberIds provided");
            return Map.of("successCount", 0, "failCount", 0, "totalCount", 0);
        }
        log.info("SendEmailWorker: sending {} emails, assetId={}", memberIds.size(), assetId);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);
        // 批量发送（每条处理）
        memberIds.parallelStream().forEach(memberId -> {
            try {
                // 1. 获取会员信息（调用 Loyalty MemberService）
                Member member = memberService.findByMemberId(memberId);
                if (member == null || member.getEmail() == null) {
                    log.warn("Member {} has no email", memberId);
                    failCount.incrementAndGet();
                    return;
                }
                // 2. 幂等检查
                String idempotencyKey = buildIdempotencyKey(planId, "SEND_EMAIL", memberId);
                if (isDuplicate(idempotencyKey)) {
                    log.debug("Duplicate email skipped: {}", idempotencyKey);
                    return;
                }
                // 3. 渲染内容（调用 ContentService）
                String content = contentService.renderContent(assetId, member);
                // 4. 发送邮件（调用 Loyalty ChannelService）
                channelService.sendEmail(member.getEmail(), content);
                // 5. 记录幂等
                markIdempotent(idempotencyKey);
                successCount.incrementAndGet();
            } catch (Exception e) {
                log.error("Send email failed for member {}: {}", memberId, e.getMessage());
                failCount.incrementAndGet();
            }
        });
        log.info("SendEmailWorker completed: success={}, fail={}",
                successCount.get(), failCount.get());
        Map<String, Object> result = new HashMap<>();
        result.put("successCount", successCount.get());
        result.put("failCount", failCount.get());
        result.put("totalCount", memberIds.size());
        result.put("sentAt", Instant.now().toString());
        return result;
    }
    private String buildIdempotencyKey(String planId, String nodeType, String memberId) {
        return planId + ":" + nodeType + ":" + memberId;
    }
    private boolean isDuplicate(String key) {
        // 查询 campaign_execution_dedup 表
        return dedupRepository.existsById(key);
    }
    private void markIdempotent(String key) {
        // 插入 dedup 表
        dedupRepository.save(new ExecutionDedup(key, Instant.now()));
    }
}
```
#### 发放积分 Worker（OfferPointsWorker）—— 调用 Loyalty PointGrantService
```java
package com.loyalty.platform.campaign.execution.worker;
import com.loyalty.platform.loyalty.point.PointGrantService;   // Loyalty 服务
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
@Slf4j
@Component
@RequiredArgsConstructor
public class OfferPointsWorker extends BaseCampaignWorker {
    private final PointGrantService pointGrantService;   // Loyalty 服务
    @Override
    protected String getWorkerType() {
        return "campaign-offer-points";
    }
    @JobWorker(type = "campaign-offer-points", timeout = 30000, maxJobsActive = 20)
    public void handleJob(JobClient client, ActivatedJob job) {
        handle(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) throws Exception {
        List<String> memberIds = getStringList(variables, "memberIds");
        String pointType = getString(variables, "pointType");
        BigDecimal pointsAmount = getDecimal(variables, "pointsAmount");
        String programCode = getString(variables, "programCode");
        String planId = getString(variables, "planId");
        if (memberIds == null || memberIds.isEmpty()) {
            return Map.of("successCount", 0, "failCount", 0);
        }
        log.info("OfferPointsWorker: granting {} points to {} members, type={}",
                pointsAmount, memberIds.size(), pointType);
        AtomicInteger successCount = new AtomicInteger(0);
        AtomicInteger failCount = new AtomicInteger(0);
        memberIds.parallelStream().forEach(memberId -> {
            try {
                // 1. 幂等检查
                String idempotencyKey = buildIdempotencyKey(planId, "OFFER_POINTS", memberId);
                if (isDuplicate(idempotencyKey)) {
                    return;
                }
                // 2. 调用 Loyalty 积分发放服务
                pointGrantService.grantPoints(
                        programCode,
                        memberId,
                        pointType != null ? pointType : "CAMPAIGN_BONUS",
                        pointsAmount != null ? pointsAmount : BigDecimal.ZERO,
                        "CAMPAIGN_" + planId,
                        null  // ruleSnapshotId
                );
                markIdempotent(idempotencyKey);
                successCount.incrementAndGet();
            } catch (Exception e) {
                log.error("Grant points failed for member {}: {}", memberId, e.getMessage());
                failCount.incrementAndGet();
            }
        });
        log.info("OfferPointsWorker completed: success={}, fail={}",
                successCount.get(), failCount.get());
        Map<String, Object> result = new HashMap<>();
        result.put("successCount", successCount.get());
        result.put("failCount", failCount.get());
        result.put("totalCount", memberIds.size());
        result.put("pointsType", pointType);
        result.put("pointsAmount", pointsAmount);
        return result;
    }
}
```
#### AI 评分 Worker（AIScoreWorker）
```java
package com.loyalty.platform.campaign.execution.worker;
import com.loyalty.platform.campaign.opportunity.MLScoringClient;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
@Slf4j
@Component
@RequiredArgsConstructor
public class AIScoreWorker extends BaseCampaignWorker {
    private final MLScoringClient mlScoringClient;
    private final CampaignMemberDimRepository memberDimRepository;
    @Override
    protected String getWorkerType() {
        return "campaign-ai-score";
    }
    @JobWorker(type = "campaign-ai-score", timeout = 60000, maxJobsActive = 10)
    public void handleJob(JobClient client, ActivatedJob job) {
        handle(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) throws Exception {
        List<String> memberIds = getStringList(variables, "memberIds");
        String modelType = getString(variables, "modelType");
        if (modelType == null) modelType = "churn";
        log.info("AIScoreWorker: scoring {} members, model={}", memberIds.size(), modelType);
        // 获取会员特征
        List<MemberFeature> features = memberDimRepository.findFeaturesByMemberIds(memberIds);
        // 调用 ML 服务
        List<MLScoreResult> scores = mlScoringClient.predictBatch(features, modelType);
        // 构建评分结果
        List<Map<String, Object>> scoredMembers = scores.stream().map(s -> {
            Map<String, Object> item = new HashMap<>();
            item.put("memberId", s.getMemberId());
            item.put("score", s.getScore());
            item.put("confidence", s.getConfidence());
            item.put("churnProbability", s.getChurnProbability());
            item.put("upliftScore", s.getUpliftScore());
            return item;
        }).collect(Collectors.toList());
        // 计算平均分和阈值
        double avgScore = scores.stream()
                .mapToDouble(MLScoreResult::getScore)
                .average()
                .orElse(0.5);
        Map<String, Object> result = new HashMap<>();
        result.put("scoredMembers", scoredMembers);
        result.put("modelType", modelType);
        result.put("avgScore", avgScore);
        result.put("scoredAt", Instant.now().toString());
        result.put("count", scoredMembers.size());
        return result;
    }
}
```
***
## 5.4 前端界面设计
### 5.4.1 执行监控仪表板
```text
┌─ 执行监控 ──────────────────────────────────────────────────────────────────┐
│  [< 返回计划列表]                                                          │
│  计划: Q2 高价值会员召回 (RUNNING)                                         │
│  流程实例: 2251799813685249  |  启动时间: 2026-06-26 10:00:00             │
│                                                                             │
│  ┌─ 执行概览 ─────────────────────────────────────────────────────────────┐ │
│  │  总节点: 8   已完成: 5  运行中: 1  失败: 0  待执行: 2                │ │
│  │  ████████████████████████░░░░░░░░░░░░░░░░░░░░ 62%                     │ │
│  │  预计剩余: 2分30秒                                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 流程执行可视化（Zeebe Operate 风格） ────────────────────────────────┐ │
│  │                                                                         │ │
│  │  [START] ──► [人群筛选] ──► [AI评分] ──► [条件分支]                   │ │
│  │              ✅已完成        ✅已完成        🔄运行中 (处理 1,234人)    │ │
│  │                                              │                         │ │
│  │                                              ├──► [发送邮件] ──► [END] │ │
│  │                                              │    ⏳待执行              │ │
│  │                                              └──► [发放积分] ──► [END] │ │
│  │                                                   ⏳待执行              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 执行日志 ─────────────────────────────────────────────────────────────┐ │
│  │  时间          │ 节点        │ 状态    │ 详情                        │ │
│  │  10:05:23     │ 人群筛选    │ ✅ 完成 │ 筛选出 12,345 人            │ │
│  │  10:05:45     │ AI评分      │ ✅ 完成 │ 平均分 0.72                 │ │
│  │  10:06:12     │ 条件分支    │ 🔄 运行 │ 高价值: 6,789  低价值: 5,556│ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [⏸️ 暂停] [▶️ 恢复] [⏹️ 取消] [📊 查看报告]                             │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.4.2 执行历史列表
```text
┌─ 执行历史 ──────────────────────────────────────────────────────────────────┐
│  计划: [全部 ▼]  状态: [全部 ▼]  日期: [ ██████ ]                         │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 执行记录 ─────────────────────────────────────────────────────────────┐ │
│  │ 实例ID    │ 计划名称         │ 状态      │ 开始时间   │ 耗时   │ 操作  │ │
│  ├───────────┼──────────────────┼───────────┼────────────┼────────┼───────┤ │
│  │ 225179... │ Q2会员召回       │ ✅ 完成   │ 06-26 10:00│ 5分32秒│ [查看]│ │
│  │ 225179... │ 新会员促活       │ 🔄 运行中 │ 06-26 11:30│ 2分10秒│ [查看]│ │
│  │ 225179... │ 会员升级激励     │ ❌ 失败   │ 06-25 16:00│ -      │ [查看]│ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 5.5 前后端 JSON 交互
### 5.5.1 部署 Plan
**Request:**
```json
POST /api/campaign/execution/deploy
{
    "planId": "plan_001"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "planId": "plan_001",
        "zeebeProcessId": "campaign_plan_001",
        "version": 1,
        "deployTime": "2026-06-26T10:00:00Z"
    }
}
```
### 5.5.2 启动执行
**Request:**
```json
POST /api/campaign/execution/start
{
    "planId": "plan_001"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "planId": "plan_001",
        "processInstanceKey": 2251799813685249,
        "status": "RUNNING",
        "startTime": "2026-06-26T10:00:00Z"
    }
}
```
### 5.5.3 获取执行状态
**Request:**
```json
GET /api/campaign/execution/status/plan_001
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "planId": "plan_001",
        "processInstanceKey": 2251799813685249,
        "status": "RUNNING",
        "startTime": "2026-06-26T10:00:00Z",
        "endTime": null,
        "durationMs": 125000,
        "progress": 62.5,
        "nodeSummary": {
            "total": 8,
            "completed": 5,
            "running": 1,
            "failed": 0,
            "pending": 2
        },
        "recentTasks": [
            {
                "taskType": "campaign-audience-filter",
                "status": "COMPLETED",
                "startTime": "2026-06-26T10:00:05Z",
                "endTime": "2026-06-26T10:00:23Z",
                "durationMs": 18000,
                "outputVariables": {
                    "count": 12345
                }
            },
            {
                "taskType": "campaign-ai-score",
                "status": "RUNNING",
                "startTime": "2026-06-26T10:00:25Z",
                "endTime": null,
                "durationMs": null
            }
        ]
    }
}
```
***
## 5.6 前端复杂逻辑伪代码
### 5.6.1 执行状态实时更新（WebSocket/SSE）
```typescript
// hooks/useExecutionMonitor.ts
import { useState, useEffect } from 'react';
import { EventSourcePolyfill } from 'event-source-polyfill';
interface ExecutionStatus {
  planId: string;
  status: string;
  progress: number;
  nodeSummary: {
    total: number;
    completed: number;
    running: number;
    failed: number;
    pending: number;
  };
  recentTasks: Task[];
}
export const useExecutionMonitor = (planId: string) => {
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    if (!planId) return;
    // 使用 SSE 接收实时更新
    const eventSource = new EventSourcePolyfill(
      `/api/campaign/execution/stream?planId=${planId}`,
      { heartbeatTimeout: 30000 }
    );
    eventSource.onopen = () => {
      setConnected(true);
      console.log('SSE connected');
    };
    eventSource.addEventListener('status-update', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      setStatus(data);
    });
    eventSource.addEventListener('node-completed', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      setStatus((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          nodeSummary: {
            ...prev.nodeSummary,
            completed: prev.nodeSummary.completed + 1,
            running: prev.nodeSummary.running - 1
          },
          recentTasks: [data.task, ...prev.recentTasks.slice(0, 9)]
        };
      });
    });
    eventSource.addEventListener('execution-completed', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      setStatus((prev) => prev ? { ...prev, status: 'COMPLETED' } : null);
      eventSource.close();
    });
    eventSource.addEventListener('execution-failed', (event: MessageEvent) => {
      const data = JSON.parse(event.data);
      setStatus((prev) => prev ? { ...prev, status: 'FAILED' } : null);
      eventSource.close();
    });
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setConnected(false);
      // 自动重连（EventSource 会自动重连）
    };
    return () => {
      eventSource.close();
    };
  }, [planId]);
  return { status, connected };
};
```
### 5.6.2 执行控制按钮组件
```tsx
// components/ExecutionControls.tsx
import React from 'react';
import { useExecutionControl } from '../hooks/useExecutionControl';
interface ExecutionControlsProps {
  planId: string;
  currentStatus: string;
}
export const ExecutionControls: React.FC<ExecutionControlsProps> = ({
  planId,
  currentStatus
}) => {
  const { deploy, start, pause, resume, cancel, isLoading } = useExecutionControl(planId);
  const renderActions = () => {
    switch (currentStatus) {
      case 'DRAFT':
      case 'GENERATED':
        return (
          <>
            <button onClick={() => deploy()} disabled={isLoading}>
              📦 部署
            </button>
            <button onClick={() => start()} disabled={isLoading} className="primary">
              ▶ 启动
            </button>
          </>
        );
      case 'RUNNING':
        return (
          <>
            <button onClick={() => pause()} disabled={isLoading} className="warning">
              ⏸️ 暂停
            </button>
            <button onClick={() => cancel()} disabled={isLoading} className="danger">
              ⏹️ 取消
            </button>
          </>
        );
      case 'PAUSED':
        return (
          <>
            <button onClick={() => resume()} disabled={isLoading} className="primary">
              ▶ 恢复
            </button>
            <button onClick={() => cancel()} disabled={isLoading} className="danger">
              ⏹️ 取消
            </button>
          </>
        );
      case 'COMPLETED':
        return <span className="badge-success">✅ 已完成</span>;
      case 'FAILED':
        return <span className="badge-danger">❌ 执行失败</span>;
      default:
        return null;
    }
  };
  return <div className="execution-controls">{renderActions()}</div>;
};
```
***
## 5.7 异常处理与容错策略
### 5.7.1 业务异常枚举
```java
public enum ExecutionErrorCode {
    PLAN_NOT_FOUND("E001", "Campaign plan not found"),
    PLAN_NOT_DEPLOYED("E002", "Plan not deployed, please deploy first"),
    PLAN_ALREADY_RUNNING("E003", "Plan is already running"),
    PLAN_ALREADY_COMPLETED("E004", "Plan already completed"),
    ZEEBE_DEPLOY_FAILED("E005", "Zeebe deployment failed"),
    ZEEBE_START_FAILED("E006", "Zeebe start failed"),
    WORKER_EXECUTION_FAILED("E007", "Worker execution failed"),
    IDEMPOTENCY_VIOLATION("E008", "Duplicate execution detected");
}
```
### 5.7.2 Zeebe 重试与超时策略
```yaml
# application.yml 中配置 Worker 默认值
zeebe:
  worker:
    default:
      timeout: 30000          # 30s 超时
      max-jobs-active: 32
      poll-interval: 100ms
    # 各 Worker 定制
    override:
      campaign-send-email:
        timeout: 60000        # 邮件发送超时 60s
        max-jobs-active: 20
      campaign-ai-score:
        timeout: 120000       # AI 评分超时 120s
        max-jobs-active: 10
```
### 5.7.3 幂等保证机制
```java
@Component
public class IdempotencyManager {
    @Autowired
    private ExecutionDedupRepository dedupRepository;
    /**
     * 检查并标记幂等 Key
     * @return true: 首次执行, false: 重复执行
     */
    @Transactional
    public boolean checkAndMark(String planId, String nodeId, String userId, String channel) {
        String key = buildKey(planId, nodeId, userId, channel);
        
        // 使用 INSERT IGNORE 或 SELECT FOR UPDATE 保证原子性
        if (dedupRepository.existsById(key)) {
            return false;
        }
        
        ExecutionDedup dedup = ExecutionDedup.builder()
                .idempotencyKey(key)
                .planId(planId)
                .nodeId(nodeId)
                .userId(userId)
                .channel(channel)
                .executedAt(Instant.now())
                .ttl(Instant.now().plus(7, ChronoUnit.DAYS))
                .build();
        dedupRepository.save(dedup);
        return true;
    }
    private String buildKey(String planId, String nodeId, String userId, String channel) {
        return planId + ":" + nodeId + ":" + userId + ":" + (channel != null ? channel : "N/A");
    }
}
```
***
## 5.8 与 Loyalty 系统的集成点总结
| 集成点             | Loyalty 能力                        | Worker 调用方式                             |
| --------------- | --------------------------------- | --------------------------------------- |
| **会员查询**        | `MemberService.findByMemberId()`  | 在 SendEmailWorker、OfferPointsWorker 中调用 |
| **邮件发送**        | `ChannelService.sendEmail()`      | SendEmailWorker 中调用                     |
| **短信发送**        | `ChannelService.sendSMS()`        | SendSMSWorker 中调用                       |
| **积分发放**        | `PointGrantService.grantPoints()` | OfferPointsWorker 中调用                   |
| **优惠券发放**       | `CouponService.issueCoupon()`     | OfferCouponWorker 中调用                   |
| **等级变更**        | `TierService.upgrade()`           | TierUpgradeWorker 中调用                   |
| **规则引擎**        | `RuleEngineService.evaluate()`    | ConditionWorker 中调用（可选）                 |
| **EventBridge** | 事件发布                              | 执行完成后发布 `CAMPAIGN_NODE_EXECUTED` 等事件    |
***
## 5.9 开发实施检查清单
* 添加 Zeebe Maven 依赖（`spring-boot-starter-camunda`, `zeebe-client-java`）
* 配置 `application.yml`（嵌入式/独立模式）
* 创建 `ZeebeConfig`（Client Bean）
* 创建 `campaign_zeebe_instance` 表
* 创建 `campaign_zeebe_task` 表
* 创建 `campaign_execution_dedup` 表
* 扩展 `campaign_plan` 表（添加 Zeebe 字段）
* 实现 `ZeebeDeployService`
* 实现 `ZeebeExecutionService`
* 实现 `BaseCampaignWorker` 基类
* 实现 `AudienceFilterWorker`
* 实现 `AIScoreWorker`
* 实现 `SendEmailWorker`（调用 Loyalty ChannelService）
* 实现 `SendSMSWorker`
* 实现 `OfferPointsWorker`（调用 Loyalty PointGrantService）
* 实现 `OfferCouponWorker`（调用 Loyalty CouponService）
* 实现 `IdempotencyManager`
* 实现前端执行监控仪表板
* 实现前端执行控制组件（部署/启动/暂停/恢复/取消）
* 集成 SSE/WebSocket 实时状态推送
* 编写单元测试和集成测试（覆盖率 > 80%）
