## 第6章：Event System + Feedback Loop（事件系统与智能闭环）详细设计
Event System + Feedback Loop 是 Campaign Tools 的**“全链路行为事实记录层 + 学习数据底座”**。它让每一次营销执行都成为系统“变聪明”的养料，形成**执行 → 采集 → 学习 → 优化**的完整闭环。
***
## 6.0 模块概述
### 6.0.1 本质定义
Event System 是一个**统一的事件采集与分发管道**，记录从 Planning 到 Execution 全链路的关键事件；Feedback Loop 是一套**“预测-实际”偏差检测与模型更新机制**，让 AI/ML 模型从执行结果中持续学习。
### 6.0.2 核心设计原则（与 Loyalty 融合）
| 原则                           | 说明                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------- |
| **完全复用 Loyalty EventBridge** | 不新建事件系统，直接复用 Loyalty 的 `EventBridge` + `Kafka` + `event_inbox` 表                 |
| **新增 Campaign 事件类型**         | 在现有事件枚举中扩展 Campaign 相关类型，不修改 Loyalty 核心逻辑                                        |
| **三层反馈结构**                   | Execution Feedback（CTR/转化率）→ Model Feedback（ROI偏差校正）→ Strategy Feedback（预算/策略调整） |
| **异步解耦**                     | 事件生产与消费通过 Kafka 解耦，不影响主执行链路性能                                                    |
### 6.0.3 系统架构图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Campaign Execution Engine                           │
│                    (Zeebe Workers / 各节点执行)                             │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ 发布事件
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Loyalty EventBridge（完全复用）                          │
│                        统一事件网关 + Kafka                                │
│  Topics:                                                                   │
│  · loyalty.event.campaign  (Campaign 事件)                                 │
│  · loyalty.event.user      (用户行为事件)                                   │
│  · loyalty.event.system    (系统事件)                                       │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼ (Kafka Consumer Group)
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Campaign Event Processor                                 │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────────┐ │
│  │  Event Handler  │→ │  Feature        │→ │  Feedback Loop              │ │
│  │  (分类/清洗)     │  │  Updater       │  │  (偏差检测/模型校正)         │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────────┘ │
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 数据层（复用）                               │
│  · event_inbox（事件明细表）                                                │
│  · 会员/订单/积分表（自动更新）                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (反馈)
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI/ML 优化触发                                           │
│  · 模型漂移检测 → 触发重训练                                                │
│  · ROI偏差校正 → 调整 Simulation 参数                                      │
│  · 策略效果分析 → 优化 Decision Engine 权重                                │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 6.1 数据模型设计
### 6.1.1 复用 Loyalty event\_inbox（已有表）
Campaign 事件直接写入 Loyalty 的 `event_inbox` 表，**不新建独立的 Campaign 事件表**。
sql
```
-- Loyalty 已有表结构（参考）
-- event_inbox (
--     event_id VARCHAR(64) PRIMARY KEY,
--     event_type VARCHAR(64),
--     program_code VARCHAR(32),
--     user_id VARCHAR(64),
--     event_time TIMESTAMPTZ,
--     payload JSONB,
--     status VARCHAR(32),
--     created_at TIMESTAMPTZ
-- )
```
**新增 Campaign 事件类型**（在 Loyalty 事件枚举中扩展）：
| event\_type               | 说明          | 触发时机            |
| ------------------------- | ----------- | --------------- |
| `CAMPAIGN_PLAN_GENERATED` | 计划生成        | AI Planner 完成生成 |
| `CAMPAIGN_APPROVED`       | 计划审批通过      | 审批流程完成          |
| `CAMPAIGN_DEPLOYED`       | 流程部署到 Zeebe | 部署成功            |
| `CAMPAIGN_STARTED`        | 执行开始        | 启动流程实例          |
| `CAMPAIGN_NODE_EXECUTED`  | 节点执行完成      | 每个 Worker 完成    |
| `CAMPAIGN_USER_EXPOSED`   | 用户曝光        | 用户收到营销消息        |
| `CAMPAIGN_USER_ENGAGED`   | 用户互动        | 用户打开/点击         |
| `CAMPAIGN_CONVERTED`      | 用户转化        | 用户完成购买/注册       |
| `CAMPAIGN_COMPLETED`      | 执行完成        | 流程实例结束          |
| `CAMPAIGN_PAUSED`         | 执行暂停        | 人工或系统暂停         |
| `CAMPAIGN_CANCELLED`      | 执行取消        | 人工取消            |
| `CAMPAIGN_NODE_FAILED`    | 节点失败        | Worker 执行失败     |
| `CAMPAIGN_FEEDBACK_ROI`   | ROI 反馈      | 实际 ROI 计算完成     |
### 6.1.2 Campaign 反馈指标表（campaign\_feedback\_metrics）
存储聚合后的反馈指标，用于模型学习和策略优化。
sql
```
CREATE TABLE campaign_feedback_metrics (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    initiative_id VARCHAR(64),
    goal_id VARCHAR(64),
    -- 预测值（来自 Simulation）
    predicted_roi DECIMAL(10,4),
    predicted_conversion DECIMAL(10,4),
    predicted_revenue DECIMAL(18,4),
    -- 实际值（来自执行结果）
    actual_roi DECIMAL(10,4),
    actual_conversion DECIMAL(10,4),
    actual_revenue DECIMAL(18,4),
    actual_cost DECIMAL(18,4),
    -- 偏差
    roi_deviation DECIMAL(10,4),           -- 实际 - 预测
    conversion_deviation DECIMAL(10,4),
    -- 执行统计
    total_exposures BIGINT,
    total_engagements BIGINT,
    total_conversions BIGINT,
    unique_users BIGINT,
    -- 渠道明细
    channel_breakdown JSONB,
    -- 时间段
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,
    -- 元数据
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cfm_plan ON campaign_feedback_metrics(plan_id);
CREATE INDEX idx_cfm_calculated ON campaign_feedback_metrics(calculated_at DESC);
```
### 6.1.3 模型漂移记录表（campaign\_model\_drift）
记录模型预测偏差检测结果，用于触发模型重训练。
sql
```
CREATE TABLE campaign_model_drift (
    id VARCHAR(64) PRIMARY KEY,
    model_name VARCHAR(64) NOT NULL,              -- churn_model / uplift_model / conversion_model
    model_version VARCHAR(32),
    -- 检测结果
    drift_detected BOOLEAN DEFAULT FALSE,
    drift_score DECIMAL(10,4),                    -- 漂移程度（0~1）
    threshold DECIMAL(10,4),                      -- 触发阈值
    -- 样本统计
    sample_size INT,
    mean_predicted DECIMAL(10,4),
    mean_actual DECIMAL(10,4),
    mae DECIMAL(10,4),                            -- 平均绝对误差
    rmse DECIMAL(10,4),                           -- 均方根误差
    -- 受影响的特征
    affected_features TEXT[],
    -- 元数据
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    retrained_at TIMESTAMPTZ,
    status VARCHAR(32) DEFAULT 'PENDING'          -- PENDING / RETRAINED / IGNORED
);
CREATE INDEX idx_cmd_model ON campaign_model_drift(model_name);
CREATE INDEX idx_cmd_detected ON campaign_model_drift(detected_at DESC);
```
### 6.1.4 策略调整记录表（campaign\_strategy\_adjustment）
记录 Feedback Loop 触发的策略调整。
sql
```
CREATE TABLE campaign_strategy_adjustment (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64),
    workspace_id VARCHAR(64) NOT NULL,
    adjustment_type VARCHAR(32) NOT NULL,         -- BUDGET_REALLOC / CHANNEL_REWEIGHT / AUDIENCE_REFINE
    trigger_event VARCHAR(64),                    -- 触发调整的事件类型
    -- 调整前后对比
    before_config JSONB,
    after_config JSONB,
    reason TEXT,
    -- 预期效果
    expected_improvement DECIMAL(10,4),
    -- 元数据
    status VARCHAR(32) DEFAULT 'PENDING',         -- PENDING / APPLIED / REJECTED
    created_by VARCHAR(64),                       -- SYSTEM 或 人工
    created_at TIMESTAMPTZ DEFAULT NOW(),
    applied_at TIMESTAMPTZ
);
CREATE INDEX idx_csa_workspace ON campaign_strategy_adjustment(workspace_id);
CREATE INDEX idx_csa_plan ON campaign_strategy_adjustment(plan_id);
```
***
## 6.2 后端 Service 详细设计
### 6.2.1 CampaignEventPublisher（事件发布器）
直接复用 Loyalty EventBridge，发布 Campaign 事件。
```java
package com.loyalty.platform.campaign.event;
import com.loyalty.platform.common.event.EventBridge;       // Loyalty 已有
import com.loyalty.platform.common.event.EventType;         // Loyalty 已有枚举
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
@Slf4j
@Component
@RequiredArgsConstructor
public class CampaignEventPublisher {
    private final EventBridge eventBridge;      // 复用 Loyalty EventBridge
    /**
     * 发布 Campaign 事件到 Loyalty EventBridge
     */
    public void publish(String eventType, Map<String, Object> payload) {
        String eventId = UUID.randomUUID().toString();
        String programCode = (String) payload.getOrDefault("programCode", "UNKNOWN");
        String userId = (String) payload.getOrDefault("userId", null);
        // 构建事件对象
        Map<String, Object> event = new HashMap<>();
        event.put("eventId", eventId);
        event.put("eventType", eventType);
        event.put("programCode", programCode);
        event.put("userId", userId);
        event.put("eventTime", Instant.now().toString());
        event.put("payload", payload);
        event.put("source", "campaign-tools");
        event.put("version", "1.0");
        // 调用 Loyalty EventBridge 发布
        eventBridge.publish("campaign-events", eventId, event);
        log.info("Campaign event published: type={}, eventId={}, program={}",
                eventType, eventId, programCode);
    }
    // ---- 便捷方法 ----
    public void publishPlanGenerated(String planId, String workspaceId, String goalId) {
        Map<String, Object> payload = Map.of(
                "planId", planId,
                "workspaceId", workspaceId,
                "goalId", goalId,
                "timestamp", Instant.now().toString()
        );
        publish("CAMPAIGN_PLAN_GENERATED", payload);
    }
    public void publishPlanDeployed(String planId, String processId, int version) {
        Map<String, Object> payload = Map.of(
                "planId", planId,
                "zeebeProcessId", processId,
                "version", version,
                "deployTime", Instant.now().toString()
        );
        publish("CAMPAIGN_DEPLOYED", payload);
    }
    public void publishExecutionStarted(String planId, Long processInstanceKey) {
        Map<String, Object> payload = Map.of(
                "planId", planId,
                "processInstanceKey", processInstanceKey,
                "startTime", Instant.now().toString()
        );
        publish("CAMPAIGN_STARTED", payload);
    }
    public void publishNodeExecuted(String planId, String nodeId, String nodeType,
                                    Map<String, Object> input, Map<String, Object> output,
                                    long durationMs, String status) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("planId", planId);
        payload.put("nodeId", nodeId);
        payload.put("nodeType", nodeType);
        payload.put("input", input);
        payload.put("output", output);
        payload.put("durationMs", durationMs);
        payload.put("status", status);
        payload.put("timestamp", Instant.now().toString());
        publish("CAMPAIGN_NODE_EXECUTED", payload);
    }
    public void publishUserExposed(String planId, String nodeId, String userId,
                                   String channel, String templateId) {
        Map<String, Object> payload = Map.of(
                "planId", planId,
                "nodeId", nodeId,
                "userId", userId,
                "channel", channel,
                "templateId", templateId,
                "timestamp", Instant.now().toString()
        );
        publish("CAMPAIGN_USER_EXPOSED", payload);
    }
    public void publishUserConverted(String planId, String nodeId, String userId,
                                     String conversionType, BigDecimal amount) {
        Map<String, Object> payload = Map.of(
                "planId", planId,
                "nodeId", nodeId,
                "userId", userId,
                "conversionType", conversionType,   // PURCHASE / REGISTER / SUBSCRIBE
                "amount", amount,
                "timestamp", Instant.now().toString()
        );
        publish("CAMPAIGN_CONVERTED", payload);
    }
    public void publishExecutionCompleted(String planId, Long processInstanceKey,
                                          long durationMs, long totalConversions) {
        Map<String, Object> payload = Map.of(
                "planId", planId,
                "processInstanceKey", processInstanceKey,
                "durationMs", durationMs,
                "totalConversions", totalConversions,
                "completeTime", Instant.now().toString()
        );
        publish("CAMPAIGN_COMPLETED", payload);
    }
    public void publishNodeFailed(String planId, String nodeId, String nodeType,
                                  String errorMessage, int retryCount) {
        Map<String, Object> payload = Map.of(
                "planId", planId,
                "nodeId", nodeId,
                "nodeType", nodeType,
                "errorMessage", errorMessage,
                "retryCount", retryCount,
                "timestamp", Instant.now().toString()
        );
        publish("CAMPAIGN_NODE_FAILED", payload);
    }
}
```
### 6.2.2 CampaignEventProcessor（事件处理器）
监听 Loyalty Kafka Topic，处理 Campaign 事件。
```java
package com.loyalty.platform.campaign.event;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
@Slf4j
@Component
@RequiredArgsConstructor
public class CampaignEventProcessor {
    private final ObjectMapper objectMapper;
    private final FeatureStoreService featureStoreService;
    private final FeedbackLoopService feedbackLoopService;
    private final CampaignFeedbackMetricsRepository metricsRepository;
    // 用于统计节点执行时间（临时缓存）
    private final Map<String, Long> nodeStartTimes = new ConcurrentHashMap<>();
    /**
     * 消费 Loyalty Kafka Topic 中的 Campaign 事件
     */
    @KafkaListener(topics = "loyalty.event.campaign", groupId = "campaign-processor")
    public void processCampaignEvent(String message) {
        try {
            JsonNode event = objectMapper.readTree(message);
            String eventType = event.path("eventType").asText();
            JsonNode payload = event.path("payload");
            log.debug("Processing campaign event: type={}", eventType);
            switch (eventType) {
                case "CAMPAIGN_NODE_EXECUTED":
                    handleNodeExecuted(payload);
                    break;
                case "CAMPAIGN_USER_EXPOSED":
                    handleUserExposed(payload);
                    break;
                case "CAMPAIGN_USER_ENGAGED":
                    handleUserEngaged(payload);
                    break;
                case "CAMPAIGN_CONVERTED":
                    handleUserConverted(payload);
                    break;
                case "CAMPAIGN_COMPLETED":
                    handleCampaignCompleted(payload);
                    break;
                case "CAMPAIGN_NODE_FAILED":
                    handleNodeFailed(payload);
                    break;
                default:
                    log.debug("Unhandled event type: {}", eventType);
            }
        } catch (Exception e) {
            log.error("Failed to process campaign event: {}", e.getMessage(), e);
        }
    }
    /**
     * 处理节点执行事件 → 更新特征存储
     */
    private void handleNodeExecuted(JsonNode payload) {
        String planId = payload.path("planId").asText();
        String nodeId = payload.path("nodeId").asText();
        String nodeType = payload.path("nodeType").asText();
        String status = payload.path("status").asText();
        long durationMs = payload.path("durationMs").asLong(0);
        // 更新特征存储
        featureStoreService.updateNodeExecutionMetric(planId, nodeId, nodeType, status, durationMs);
        log.debug("Node executed: planId={}, nodeType={}, status={}, duration={}ms",
                planId, nodeType, status, durationMs);
    }
    /**
     * 处理用户曝光事件 → 更新用户特征（RFM、Engagement）
     */
    private void handleUserExposed(JsonNode payload) {
        String userId = payload.path("userId").asText();
        String channel = payload.path("channel").asText();
        String planId = payload.path("planId").asText();
        // 更新用户曝光计数
        featureStoreService.incrementUserExposure(userId, channel);
        // 更新 campaign_member_dim 中的 engagement_score（可异步）
        featureStoreService.updateUserEngagementScore(userId, 0.01);  // 小幅提升
        log.debug("User exposed: userId={}, channel={}", userId, channel);
    }
    /**
     * 处理用户互动事件（打开/点击）
     */
    private void handleUserEngaged(JsonNode payload) {
        String userId = payload.path("userId").asText();
        String engagementType = payload.path("engagementType").asText(); // OPEN / CLICK
        featureStoreService.incrementUserEngagement(userId, engagementType);
        featureStoreService.updateUserEngagementScore(userId, 0.05);  // 明显提升
        log.debug("User engaged: userId={}, type={}", userId, engagementType);
    }
    /**
     * 处理用户转化事件 → 更新 RFM、LTV
     */
    private void handleUserConverted(JsonNode payload) {
        String userId = payload.path("userId").asText();
        String conversionType = payload.path("conversionType").asText();
        BigDecimal amount = new BigDecimal(payload.path("amount").asText("0"));
        // 更新用户转化数据
        featureStoreService.recordUserConversion(userId, conversionType, amount);
        // 更新 campaign_member_dim 汇总
        featureStoreService.updateUserRFM(userId, amount);
        log.info("User converted: userId={}, type={}, amount={}", userId, conversionType, amount);
    }
    /**
     * 处理 Campaign 完成事件 → 触发 Feedback Loop
     */
    private void handleCampaignCompleted(JsonNode payload) {
        String planId = payload.path("planId").asText();
        long durationMs = payload.path("durationMs").asLong(0);
        long totalConversions = payload.path("totalConversions").asLong(0);
        log.info("Campaign completed: planId={}, duration={}ms, conversions={}",
                planId, durationMs, totalConversions);
        // 触发 Feedback Loop 计算 ROI 偏差
        feedbackLoopService.calculateFeedback(planId);
    }
    /**
     * 处理节点失败事件 → 告警
     */
    private void handleNodeFailed(JsonNode payload) {
        String planId = payload.path("planId").asText();
        String nodeId = payload.path("nodeId").asText();
        String nodeType = payload.path("nodeType").asText();
        String errorMessage = payload.path("errorMessage").asText();
        log.error("Node failed: planId={}, nodeType={}, error={}",
                planId, nodeType, errorMessage);
        // 可触发告警通知
        // alertService.sendAlert("CAMPAIGN_NODE_FAILED", payload);
    }
}
```
### 6.2.3 FeatureStoreService（特征存储更新服务）
```java
package com.loyalty.platform.campaign.event;
import com.loyalty.platform.loyalty.member.MemberService;      // Loyalty 服务
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.math.BigDecimal;
import java.util.concurrent.ConcurrentHashMap;
@Slf4j
@Service
@RequiredArgsConstructor
public class FeatureStoreService {
    private final CampaignMemberDimRepository memberDimRepository;
    private final MemberService memberService;          // Loyalty 服务
    // 本地缓存（生产环境应使用 Redis）
    private final Map<String, UserFeatureCache> featureCache = new ConcurrentHashMap<>();
    /**
     * 增加用户曝光计数
     */
    public void incrementUserExposure(String userId, String channel) {
        // 更新 campaign_member_dim 表
        memberDimRepository.incrementExposureCount(userId, 1);
        // 更新 Redis 缓存
        updateCache(userId, "exposureCount", +1);
    }
    /**
     * 增加用户互动计数
     */
    public void incrementUserEngagement(String userId, String engagementType) {
        memberDimRepository.incrementEngagementCount(userId, engagementType, 1);
        updateCache(userId, "engagementCount", +1);
    }
    /**
     * 更新用户 Engagement 分数
     */
    public void updateUserEngagementScore(String userId, double delta) {
        memberDimRepository.updateEngagementScore(userId, delta);
        updateCache(userId, "engagementScore", delta);
    }
    /**
     * 记录用户转化
     */
    public void recordUserConversion(String userId, String conversionType, BigDecimal amount) {
        memberDimRepository.incrementConversionCount(userId, conversionType, 1);
        memberDimRepository.incrementTotalOrderAmount(userId, amount);
        // 调用 Loyalty MemberService 更新会员统计
        memberService.updateMemberStatistics(userId, amount);
    }
    /**
     * 更新用户 RFM 指标
     */
    public void updateUserRFM(String userId, BigDecimal amount) {
        // recency: 更新 last_order_date
        memberDimRepository.updateLastOrderDate(userId, LocalDate.now());
        // frequency: 增加订单数
        memberDimRepository.incrementOrderCount(userId, 1);
        // monetary: 增加总金额
        memberDimRepository.incrementTotalOrderAmount(userId, amount);
    }
    /**
     * 更新节点执行指标
     */
    public void updateNodeExecutionMetric(String planId, String nodeId, String nodeType,
                                          String status, long durationMs) {
        // 更新 campaign_zeebe_task 表已由 Worker 完成
        // 此处可更新聚合指标到 Redis
    }
    // ---- 缓存辅助方法 ----
    private void updateCache(String userId, String field, double delta) {
        featureCache.computeIfAbsent(userId, k -> new UserFeatureCache());
        featureCache.get(userId).update(field, delta);
    }
    @Data
    private static class UserFeatureCache {
        private int exposureCount = 0;
        private int engagementCount = 0;
        private double engagementScore = 0.3;
        public void update(String field, double delta) {
            switch (field) {
                case "exposureCount":
                    this.exposureCount += (int) delta;
                    break;
                case "engagementCount":
                    this.engagementCount += (int) delta;
                    break;
                case "engagementScore":
                    this.engagementScore = Math.min(Math.max(this.engagementScore + delta, 0), 1);
                    break;
            }
        }
    }
}
```
### 6.2.4 FeedbackLoopService（反馈闭环核心）
```java
package com.loyalty.platform.campaign.event;
import com.loyalty.platform.campaign.execution.repository.CampaignPlanRepository;
import com.loyalty.platform.campaign.simulation.SimulationEngine;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
@Slf4j
@Service
@RequiredArgsConstructor
public class FeedbackLoopService {
    private final CampaignPlanRepository planRepository;
    private final CampaignFeedbackMetricsRepository metricsRepository;
    private final CampaignModelDriftRepository driftRepository;
    private final CampaignStrategyAdjustmentRepository adjustmentRepository;
    private final SimulationEngine simulationEngine;
    private final CampaignEventPublisher eventPublisher;
    private static final double ROI_DRIFT_THRESHOLD = 0.3;        // 30% 偏差触发
    private static final double CONVERSION_DRIFT_THRESHOLD = 0.2; // 20% 偏差触发
    private static final int MIN_SAMPLE_SIZE = 100;
    /**
     * 计算反馈指标（Campaign 完成后调用）
     *
     * 伪代码：
     * 1. 获取 Plan 的预测值（来自 Simulation 结果）
     * 2. 获取实际执行数据（从 ZeebeInstance 和 Event 聚合）
     * 3. 计算 ROI、转化率偏差
     * 4. 保存 FeedbackMetrics
     * 5. 检测漂移，触发模型更新或策略调整
     */
    @Transactional
    public void calculateFeedback(String planId) {
        log.info("Calculating feedback for plan: {}", planId);
        // 1. 获取 Plan
        CampaignPlan plan = planRepository.findById(planId)
                .orElseThrow(() -> new RuntimeException("Plan not found"));
        // 2. 获取预测值（从 forecast_json）
        JsonNode forecast = plan.getForecastJson();
        if (forecast == null || forecast.isNull()) {
            log.warn("Plan {} has no forecast data, skipping feedback", planId);
            return;
        }
        BigDecimal predictedROI = getDecimal(forecast, "predictedRoi");
        BigDecimal predictedConversion = getDecimal(forecast, "predictedConversion");
        BigDecimal predictedRevenue = getDecimal(forecast, "predictedRevenue");
        // 3. 获取实际值（从 Zeebe 执行统计和事件聚合）
        ActualExecutionStats stats = aggregateExecutionStats(planId);
        // 4. 计算偏差
        BigDecimal roiDeviation = stats.getActualROI().subtract(predictedROI);
        BigDecimal conversionDeviation = stats.getActualConversion().subtract(predictedConversion);
        // 5. 保存反馈指标
        CampaignFeedbackMetrics metrics = CampaignFeedbackMetrics.builder()
                .id(UUID.randomUUID().toString())
                .planId(planId)
                .initiativeId(plan.getInitiativeId())
                .goalId(plan.getGoalId())
                .predictedRoi(predictedROI)
                .predictedConversion(predictedConversion)
                .predictedRevenue(predictedRevenue)
                .actualRoi(stats.getActualROI())
                .actualConversion(stats.getActualConversion())
                .actualRevenue(stats.getActualRevenue())
                .actualCost(stats.getActualCost())
                .roiDeviation(roiDeviation)
                .conversionDeviation(conversionDeviation)
                .totalExposures(stats.getTotalExposures())
                .totalEngagements(stats.getTotalEngagements())
                .totalConversions(stats.getTotalConversions())
                .uniqueUsers(stats.getUniqueUsers())
                .channelBreakdown(stats.getChannelBreakdown())
                .periodStart(plan.getStartTime())
                .periodEnd(plan.getEndTime())
                .calculatedAt(Instant.now())
                .build();
        metrics = metricsRepository.save(metrics);
        log.info("Feedback saved: planId={}, predictedROI={}, actualROI={}, deviation={}",
                planId, predictedROI, stats.getActualROI(), roiDeviation);
        // 6. 检测漂移
        detectAndHandleDrift(plan, metrics);
        // 7. 发布反馈事件
        eventPublisher.publishFeedbackROI(planId, predictedROI, stats.getActualROI());
    }
    /**
     * 聚合执行统计数据
     */
    private ActualExecutionStats aggregateExecutionStats(String planId) {
        ActualExecutionStats stats = new ActualExecutionStats();
        // 从 ZeebeInstance 获取执行信息
        ZeebeInstance instance = instanceRepository.findByPlanId(planId).orElse(null);
        if (instance == null) {
            return stats;
        }
        // 从 campaign_zeebe_task 聚合节点执行数据
        List<ZeebeTask> tasks = taskRepository.findByPlanId(planId);
        long totalExposures = tasks.stream()
                .filter(t -> "campaign-send-email".equals(t.getTaskType()) ||
                             "campaign-send-sms".equals(t.getTaskType()))
                .mapToLong(t -> {
                    JsonNode output = t.getOutputVariables();
                    return output.path("successCount").asLong(0);
                })
                .sum();
        // 从事件系统获取转化数据
        long totalConversions = eventRepository.countByPlanIdAndEventType(
                planId, "CAMPAIGN_CONVERTED"
        );
        // 获取唯一用户数
        long uniqueUsers = eventRepository.countDistinctUsersByPlanId(planId);
        // 计算实际 ROI
        double actualRevenue = eventRepository.sumConversionAmountByPlanId(planId);
        double actualCost = totalExposures * 0.5;  // 简化：人均 0.5 元
        BigDecimal actualROI = actualCost > 0 ?
                BigDecimal.valueOf((actualRevenue - actualCost) / actualCost) :
                BigDecimal.ZERO;
        stats.setActualROI(actualROI.setScale(2, RoundingMode.HALF_UP));
        stats.setActualConversion(BigDecimal.valueOf((double) totalConversions / uniqueUsers));
        stats.setActualRevenue(BigDecimal.valueOf(actualRevenue));
        stats.setActualCost(BigDecimal.valueOf(actualCost));
        stats.setTotalExposures(totalExposures);
        stats.setTotalConversions(totalConversions);
        stats.setUniqueUsers(uniqueUsers);
        return stats;
    }
    /**
     * 检测并处理漂移
     */
    private void detectAndHandleDrift(CampaignPlan plan, CampaignFeedbackMetrics metrics) {
        // 1. ROI 漂移检测
        double roiDeviation = metrics.getRoiDeviation().doubleValue();
        double absDeviation = Math.abs(roiDeviation);
        if (absDeviation > ROI_DRIFT_THRESHOLD) {
            log.warn("ROI drift detected: planId={}, deviation={}",
                    plan.getId(), roiDeviation);
            // 记录漂移
            CampaignModelDrift drift = CampaignModelDrift.builder()
                    .id(UUID.randomUUID().toString())
                    .modelName("roi_prediction")
                    .driftDetected(true)
                    .driftScore((float) absDeviation)
                    .threshold(ROI_DRIFT_THRESHOLD)
                    .sampleSize(metrics.getUniqueUsers().intValue())
                    .meanPredicted(metrics.getPredictedRoi())
                    .meanActual(metrics.getActualRoi())
                    .mae(BigDecimal.valueOf(absDeviation))
                    .detectedAt(Instant.now())
                    .status("PENDING")
                    .build();
            driftRepository.save(drift);
            // 触发策略调整
            triggerStrategyAdjustment(plan, metrics, "ROI_DRIFT");
        }
        // 2. 转化率漂移检测
        double conversionDeviation = metrics.getConversionDeviation().doubleValue();
        if (Math.abs(conversionDeviation) > CONVERSION_DRIFT_THRESHOLD) {
            log.warn("Conversion drift detected: planId={}, deviation={}",
                    plan.getId(), conversionDeviation);
            CampaignModelDrift drift = CampaignModelDrift.builder()
                    .id(UUID.randomUUID().toString())
                    .modelName("conversion_prediction")
                    .driftDetected(true)
                    .driftScore((float) Math.abs(conversionDeviation))
                    .threshold(CONVERSION_DRIFT_THRESHOLD)
                    .sampleSize(metrics.getUniqueUsers().intValue())
                    .meanPredicted(metrics.getPredictedConversion())
                    .meanActual(metrics.getActualConversion())
                    .mae(BigDecimal.valueOf(Math.abs(conversionDeviation)))
                    .detectedAt(Instant.now())
                    .status("PENDING")
                    .build();
            driftRepository.save(drift);
        }
    }
    /**
     * 触发策略调整
     */
    private void triggerStrategyAdjustment(CampaignPlan plan, CampaignFeedbackMetrics metrics,
                                           String triggerType) {
        // 计算调整建议
        String adjustmentType;
        JsonNode beforeConfig;
        JsonNode afterConfig;
        if ("ROI_DRIFT".equals(triggerType)) {
            if (metrics.getActualRoi().compareTo(metrics.getPredictedRoi()) < 0) {
                // ROI 低于预期 → 需要重新分配预算或调整渠道
                adjustmentType = "BUDGET_REALLOC";
                beforeConfig = plan.getAllocationJson();
                // 调用优化引擎重新计算
                // 简化：调高高ROI Initiative 的预算
                afterConfig = reallocateBudget(plan, metrics);
            } else {
                // ROI 高于预期 → 扩大规模
                adjustmentType = "SCALE_UP";
                beforeConfig = plan.getAllocationJson();
                afterConfig = scaleUpBudget(plan, metrics);
            }
        } else {
            // 转化率漂移 → 调整受众或内容
            adjustmentType = "AUDIENCE_REFINE";
            beforeConfig = plan.getStrategyJson();
            afterConfig = refineAudience(plan, metrics);
        }
        // 保存调整记录
        CampaignStrategyAdjustment adjustment = CampaignStrategyAdjustment.builder()
                .id(UUID.randomUUID().toString())
                .planId(plan.getId())
                .workspaceId(plan.getWorkspaceId())
                .adjustmentType(adjustmentType)
                .triggerEvent(triggerType)
                .beforeConfig(beforeConfig)
                .afterConfig(afterConfig)
                .reason(String.format("Drift detected: predicted=%.2f, actual=%.2f",
                        metrics.getPredictedRoi(), metrics.getActualRoi()))
                .expectedImprovement(BigDecimal.valueOf(0.1))
                .status("PENDING")
                .createdBy("SYSTEM")
                .createdAt(Instant.now())
                .build();
        adjustmentRepository.save(adjustment);
        log.info("Strategy adjustment triggered: planId={}, type={}",
                plan.getId(), adjustmentType);
        // 可选：自动应用调整
        // if (shouldAutoApply(adjustment)) {
        //     applyAdjustment(adjustment);
        // }
    }
    /**
     * 重新分配预算
     */
    private JsonNode reallocateBudget(CampaignPlan plan, CampaignFeedbackMetrics metrics) {
        // 简化实现：将预算从低ROI Initiative 转移到高ROI Initiative
        Map<String, Object> newAllocation = new HashMap<>();
        // ... 具体逻辑
        return JsonUtil.toJsonNode(newAllocation);
    }
}
```
***
## 6.3 前端界面设计
### 6.3.1 事件监控面板
```text
┌─ 事件监控 ──────────────────────────────────────────────────────────────────┐
│  实时事件流                            [筛选: 全部 ▼] [⏸️ 暂停] [▶️ 继续] │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 事件统计 ─────────────────────────────────────────────────────────────┐ │
│  │  总事件: 156,789  │  今日: 12,345  │  错误: 23  │  处理延迟: 120ms   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 实时事件日志 ─────────────────────────────────────────────────────────┐ │
│  │  时间          │ 类型                    │ 用户    │ 计划    │ 状态    │ │
│  ├───────────────┼─────────────────────────┼─────────┼─────────┼─────────┤ │
│  │ 10:05:23.456  │ CAMPAIGN_USER_EXPOSED   │ M_12345 │ plan_001│ ✅      │ │
│  │ 10:05:23.789  │ CAMPAIGN_USER_ENGAGED   │ M_23456 │ plan_001│ ✅      │ │
│  │ 10:05:24.012  │ CAMPAIGN_CONVERTED      │ M_12345 │ plan_001│ ✅      │ │
│  │ 10:05:24.345  │ CAMPAIGN_NODE_FAILED    │ -       │ plan_002│ ❌      │ │
│  │ 10:05:25.678  │ CAMPAIGN_STARTED        │ -       │ plan_003│ 🔄      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [查看全部]                                                                │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 6.3.2 反馈分析仪表板
```text
┌─ 反馈闭环分析 ──────────────────────────────────────────────────────────────┐
│  计划: Q2会员召回  │  状态: COMPLETED  │  执行时间: 2026-06-26 10:00:00   │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 预测 vs 实际对比 ─────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  ROI:  预测 ████████████████░░ 2.3x                                    │ │
│  │        实际 ██████████████████ 2.1x  偏差: -8.7%                       │ │
│  │                                                                         │ │
│  │  转化率:预测 ████████████████░░ 18.7%                                  │ │
│  │         实际 ██████████████████ 17.2%  偏差: -8.0%                     │ │
│  │                                                                         │ │
│  │  总收入:预测 ¥234,567                                                 │ │
│  │         实际 ¥210,123  偏差: -10.4%                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 漂移检测 ─────────────────────────────────────────────────────────────┐ │
│  │  🟡 ROI 模型漂移: 偏差 8.7% (阈值 5%)                                 │ │
│  │  ✅ 转化模型: 偏差 2.1% (正常)                                        │ │
│  │  ✅ 受众模型: 偏差 1.5% (正常)                                        │ │
│  │                                                                         │ │
│  │  [查看详情] [触发重训练]                                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 策略调整建议 ─────────────────────────────────────────────────────────┐ │
│  │  💡 基于 ROI 偏差，建议将预算从 SMS 渠道转移至 EMAIL 渠道             │ │
│  │     预期提升: +12% ROI                                                │ │
│  │                                                                         │ │
│  │  [应用调整] [忽略] [编辑]                                              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 6.4 前后端 JSON 交互
### 6.4.1 获取反馈指标
**Request:**
```json
GET /api/campaign/feedback/plan_001
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "planId": "plan_001",
        "predicted": {
            "roi": 2.3,
            "conversion": 18.7,
            "revenue": 234567
        },
        "actual": {
            "roi": 2.1,
            "conversion": 17.2,
            "revenue": 210123,
            "cost": 100000
        },
        "deviation": {
            "roi": -0.087,
            "conversion": -0.08,
            "revenue": -0.104
        },
        "statistics": {
            "totalExposures": 12345,
            "totalEngagements": 8234,
            "totalConversions": 2469,
            "uniqueUsers": 14352
        },
        "drifts": [
            {
                "modelName": "roi_prediction",
                "driftDetected": true,
                "driftScore": 0.087,
                "threshold": 0.05
            }
        ],
        "strategyAdjustments": [
            {
                "type": "BUDGET_REALLOC",
                "status": "PENDING",
                "expectedImprovement": 0.12,
                "reason": "ROI drift detected"
            }
        ]
    }
}
```
***
## 6.5 前端复杂逻辑伪代码
### 6.5.1 实时事件流监听（WebSocket）
```typescript
// hooks/useEventStream.ts
import { useEffect, useState } from 'react';
interface CampaignEvent {
  eventId: string;
  eventType: string;
  userId: string;
  planId: string;
  timestamp: string;
  payload: Record<string, any>;
}
export const useEventStream = (filters?: { planId?: string; type?: string }) => {
  const [events, setEvents] = useState<CampaignEvent[]>([]);
  const [connected, setConnected] = useState(false);
  const [stats, setStats] = useState({ total: 0, today: 0, errors: 0 });
  useEffect(() => {
    const ws = new WebSocket('/api/campaign/events/stream');
    ws.onopen = () => {
      setConnected(true);
      console.log('WebSocket connected');
    };
    ws.onmessage = (message) => {
      const event: CampaignEvent = JSON.parse(message.data);
      
      // 应用筛选
      if (filters?.planId && event.planId !== filters.planId) return;
      if (filters?.type && event.eventType !== filters.type) return;
      setEvents(prev => [event, ...prev].slice(0, 1000));
      updateStats(event);
    };
    ws.onclose = () => {
      setConnected(false);
      // 自动重连
      setTimeout(() => {
        if (!ws.connected) {
          // 重连逻辑
        }
      }, 3000);
    };
    return () => ws.close();
  }, [filters]);
  const updateStats = (event: CampaignEvent) => {
    setStats(prev => ({
      total: prev.total + 1,
      today: prev.today + 1,
      errors: event.eventType.includes('FAILED') ? prev.errors + 1 : prev.errors
    }));
  };
  return { events, stats, connected };
};
```
***
## 6.6 异常处理与业务规则
### 6.6.1 业务异常枚举
```java
public enum EventErrorCode {
    EVENT_PUBLISH_FAILED("EV001", "Event publish failed"),
    EVENT_PROCESS_FAILED("EV002", "Event processing failed"),
    FEEDBACK_CALCULATION_FAILED("EV003", "Feedback calculation failed"),
    DRIFT_DETECTION_FAILED("EV004", "Drift detection failed"),
    STRATEGY_ADJUSTMENT_FAILED("EV005", "Strategy adjustment failed");
}
```
### 6.6.2 事件重试机制
```java
@Component
public class EventRetryHandler {
    
    @Retryable(value = {Exception.class}, maxAttempts = 3, backoff = @Backoff(delay = 1000))
    public void publishWithRetry(String eventType, Map<String, Object> payload) {
        // 重试逻辑
    }
}
```
***
## 6.7 与 Loyalty 系统的集成点
| 集成点                    | Loyalty 能力 | 使用方式                                                  |
| ---------------------- | ---------- | ----------------------------------------------------- |
| **EventBridge**        | 统一事件网关     | `CampaignEventPublisher` 直接调用 `eventBridge.publish()` |
| **event\_inbox 表**     | 事件存储       | 写入 Loyalty 已有表，新增 Campaign 事件类型                       |
| **Kafka**              | 消息队列       | 消费 `loyalty.event.campaign` Topic                     |
| **MemberService**      | 会员数据       | 在 FeatureStore 中调用更新会员统计                              |
| **AccountTransaction** | 订单/积分      | 转化事件关联 Loyalty 订单数据                                   |
***
## 6.8 开发实施检查清单
* 确认 Loyalty EventBridge 可用，扩展事件类型枚举
* 确认 `event_inbox` 表结构支持 Campaign 事件
* 实现 `CampaignEventPublisher`（复用 EventBridge）
* 实现 `CampaignEventProcessor`（Kafka Listener）
* 创建 `campaign_feedback_metrics` 表
* 创建 `campaign_model_drift` 表
* 创建 `campaign_strategy_adjustment` 表
* 实现 `FeatureStoreService`
* 实现 `FeedbackLoopService`
* 实现前端事件监控面板（实时流）
* 实现前端反馈分析仪表板
* 配置 Kafka Consumer Group
* 实现漂移检测定时任务
* 编写单元测试和集成测试
