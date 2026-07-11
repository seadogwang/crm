# 事件驱动营销（Event-Driven Marketing）能力补全设计
> **版本**：1.0\
> **变更类型**：新增功能\
> **核心定位**：补齐 Campaign Tools 在**实时触发式营销**（Trigger-based Marketing）场景下的能力缺口
***
## 一、当前设计的缺口分析
### 1.1 已有的能力（批处理营销）
| 能力      | 说明                          |
| ------- | --------------------------- |
| 受众筛选    | 基于静态属性 + 统计条件筛选用户           |
| 定时/手动执行 | 用户点击“启动”或定时任务触发             |
| 画布编排    | 支持 DAG 流程（人群筛选 → 条件分支 → 发送） |
### 1.2 缺失的能力（事件驱动营销）
| 场景                     | 当前能否支持？         |
| ---------------------- | --------------- |
| **用户下单后立即发送感谢邮件**      | ❌ 无法实时响应        |
| **用户放弃购物车 30 分钟后发送提醒** | ❌ 无法监听事件 + 延迟执行 |
| **用户等级变更后发送专属权益通知**    | ❌ 无法监听等级变更事件    |
| **用户连续登录 7 天触发奖励**     | ❌ 无法基于累计行为触发    |
| **用户浏览特定商品页面后推送优惠**    | ❌ 无法监听浏览事件      |
### 1.3 根本原因
当前设计是 **“拉模式”（Pull）**：用户点击 → 拉取数据 → 执行流程。\
事件驱动营销需要 **“推模式”（Push）**：事件发生 → 推送触发 → 执行流程。
***
## 二、事件驱动营销核心架构
### 2.1 整体设计思路
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                      事件驱动营销架构                                        │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Loyalty EventBridge (已有)                       │   │
│  │                     Kafka Topics: loyalty.event.*                    │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────────────┐ │   │
│  │  │ OrderCreated │ │ CartAbandoned│ │ TierChanged │ BehaviorEvent │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────┘ ──────────── │ │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ 消费事件                              │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                 Campaign Event Listener (新增)                      │   │
│  │  1. 匹配事件类型 → 查找绑定的 Campaign                             │   │
│  │  2. 时间窗口去重检查（如：24小时内同用户只触发1次）                 │   │
│  │  3. 调用 Zeebe 触发流程                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                 Zeebe 消息启动事件 (Message Start Event)             │   │
│  │  · 每个事件驱动的 Campaign 部署时自动注册消息订阅                   │   │
│  │  · 事件到达 → 自动创建流程实例                                      │   │
│  │  · 事件 payload 作为流程变量传递                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                 Campaign 执行 (复用现有 Workers)                     │   │
│  │  · 无需人群筛选（用户已由事件携带）                                 │   │
│  │  · 直接执行动作：发送消息、发放积分、变更等级                       │   │
│  │  · 支持延迟节点（如：30分钟后发送提醒）                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 2.2 与现有设计的融合
| 现有组件                    | 事件驱动如何复用                                 |
| ----------------------- | ---------------------------------------- |
| **Zeebe**               | 使用 **Message Start Event**，替代 API 调用创建实例 |
| **Canvas**              | 新增 `EVENT_TRIGGER` 节点类型，替换 `START` 节点    |
| **Workers**             | 完全复用现有 Workers（发送邮件、发放积分等）               |
| **EventBridge + Kafka** | 作为事件源，新增 Campaign Event Consumer         |
| **第6章事件系统**             | 事件驱动的 Campaign 本身也会产生事件                  |
***
## 三、数据模型设计（新增）
### 3.1 事件触发器配置表（campaign\_event\_trigger）
```sql
-- ============================================================
-- 事件触发器配置（定义事件与 Campaign 的绑定关系）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_event_trigger (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,                     -- 关联的 Campaign Plan
    workspace_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    
    -- ===== 事件定义 =====
    event_type VARCHAR(128) NOT NULL,                  -- 如：ORDER_CREATED, CART_ABANDONED, TIER_CHANGED
    event_source VARCHAR(64),                          -- loyalty_event / custom_webhook / kafka_topic
    event_topic VARCHAR(128),                          -- Kafka Topic 名称
    
    -- ===== 事件过滤（可选） =====
    event_filter JSONB,                                -- 仅当事件满足条件时才触发
    -- 示例：{"field": "order_amount", "operator": "gt", "value": 100}
    
    -- ===== 去重与防抖 =====
    dedup_window_minutes INT DEFAULT 60,               -- 时间窗口内相同用户只触发1次
    dedup_key_fields JSONB,                            -- 组合 key：["member_id", "event_type"]
    
    -- ===== 触发控制 =====
    enabled BOOLEAN DEFAULT TRUE,
    start_time TIMESTAMPTZ,                            -- 生效时间范围（可选）
    end_time TIMESTAMPTZ,
    
    -- ===== 元数据 =====
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cet_plan ON campaign_event_trigger(plan_id);
CREATE INDEX idx_cet_event ON campaign_event_trigger(event_type, enabled);
CREATE INDEX idx_cet_program ON campaign_event_trigger(program_code);
```
### 3.2 事件触发日志表（campaign\_event\_trigger\_log）
```sql
-- ============================================================
-- 事件触发日志（用于审计和去重）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_event_trigger_log (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    trigger_id VARCHAR(64) NOT NULL,
    
    -- ===== 事件信息 =====
    event_id VARCHAR(128),                            -- 原始事件ID
    event_type VARCHAR(128),
    member_id VARCHAR(64),
    
    -- ===== 触发结果 =====
    triggered BOOLEAN DEFAULT FALSE,
    skip_reason VARCHAR(64),                          -- DUPLICATE / FILTER_NOT_MATCH / DISABLED / OUT_OF_WINDOW
    process_instance_key BIGINT,                      -- Zeebe 流程实例 Key
    
    -- ===== 去重指纹 =====
    dedup_key VARCHAR(255),                           -- 用于去重的组合 key
    
    -- ===== 时间 =====
    event_time TIMESTAMPTZ,
    trigger_time TIMESTAMPTZ DEFAULT NOW(),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cetl_plan ON campaign_event_trigger_log(plan_id);
CREATE INDEX idx_cetl_member ON campaign_event_trigger_log(member_id);
CREATE INDEX idx_cetl_dedup ON campaign_event_trigger_log(dedup_key);
CREATE INDEX idx_cetl_trigger_time ON campaign_event_trigger_log(trigger_time DESC);
```
### 3.3 扩展 campaign\_plan 表
```sql
-- ============================================================
-- 扩展 campaign_plan 表
-- ============================================================
ALTER TABLE campaign_plan ADD COLUMN trigger_type VARCHAR(32) DEFAULT 'MANUAL';
COMMENT ON COLUMN campaign_plan.trigger_type IS 'MANUAL / EVENT_TRIGGERED / SCHEDULED';
ALTER TABLE campaign_plan ADD COLUMN trigger_config_id VARCHAR(64);
COMMENT ON COLUMN campaign_plan.trigger_config_id IS '关联 campaign_event_trigger.id';
```
***
## 四、后端 Service 详细设计
### 4.1 事件监听器（Event Listener）
```java
package com.loyalty.platform.campaign.event.trigger;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
@Slf4j
@Component
@RequiredArgsConstructor
public class CampaignEventTriggerListener {
    private final CampaignEventTriggerService triggerService;
    private final ObjectMapper objectMapper;
    /**
     * 监听 Loyalty 事件（复用已有 Kafka Topic）
     */
    @KafkaListener(
        topics = {
            "loyalty.event.order",
            "loyalty.event.cart",
            "loyalty.event.tier",
            "loyalty.event.behavior"
        },
        groupId = "campaign-event-trigger"
    )
    public void onLoyaltyEvent(String message) {
        try {
            JsonNode event = objectMapper.readTree(message);
            String eventType = event.path("eventType").asText();
            String memberId = event.path("memberId").asText();
            JsonNode payload = event.path("payload");
            log.debug("Received loyalty event: type={}, memberId={}", eventType, memberId);
            // 路由到触发器服务
            triggerService.processEvent(eventType, memberId, payload);
        } catch (Exception e) {
            log.error("Failed to process loyalty event: {}", e.getMessage(), e);
        }
    }
    /**
     * 监听自定义 Webhook 事件（对外暴露的 HTTP 端点）
     * POST /api/campaign/event/webhook/{programCode}/{eventType}
     */
    @KafkaListener(topics = "campaign.custom.webhook", groupId = "campaign-event-trigger")
    public void onCustomWebhook(String message) {
        // 处理自定义事件
    }
}
```
### 4.2 事件触发核心服务
```java
package com.loyalty.platform.campaign.event.trigger;
import com.fasterxml.jackson.databind.JsonNode;
import io.camunda.zeebe.client.ZeebeClient;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
@Slf4j
@Service
@RequiredArgsConstructor
public class CampaignEventTriggerService {
    private final EventTriggerRepository triggerRepository;
    private final EventTriggerLogRepository logRepository;
    private final CampaignPlanRepository planRepository;
    private final ZeebeClient zeebeClient;
    private final DedupService dedupService;
    /**
     * 处理事件 → 匹配触发器 → 触发 Campaign
     */
    @Transactional
    public void processEvent(String eventType, String memberId, JsonNode payload) {
        // 1. 查找匹配的事件触发器
        List<EventTrigger> triggers = triggerRepository.findActiveByEventType(eventType);
        if (triggers.isEmpty()) {
            log.debug("No active trigger found for eventType: {}", eventType);
            return;
        }
        // 2. 遍历匹配的触发器
        for (EventTrigger trigger : triggers) {
            // 2a. 检查启用状态
            if (!trigger.isEnabled()) continue;
            // 2b. 检查时间范围
            if (!isWithinTimeWindow(trigger)) continue;
            // 2c. 检查事件过滤条件
            if (!matchesFilter(trigger.getEventFilter(), payload)) continue;
            // 2d. 去重检查
            String dedupKey = buildDedupKey(trigger, memberId);
            if (!dedupService.checkAndMark(dedupKey, trigger.getDedupWindowMinutes())) {
                log.debug("Event dedup skipped: dedupKey={}", dedupKey);
                logDedup(trigger, memberId, eventType, "DUPLICATE", null);
                continue;
            }
            // 2e. 触发 Campaign
            try {
                Long processInstanceKey = triggerCampaign(trigger, memberId, payload);
                logDedup(trigger, memberId, eventType, "TRIGGERED", processInstanceKey);
                log.info("Event triggered campaign: triggerId={}, planId={}, memberId={}",
                        trigger.getId(), trigger.getPlanId(), memberId);
            } catch (Exception e) {
                log.error("Failed to trigger campaign: triggerId={}, error={}",
                        trigger.getId(), e.getMessage(), e);
                logDedup(trigger, memberId, eventType, "FAILED", null);
            }
        }
    }
    /**
     * 通过 Zeebe Message Start Event 触发 Campaign
     * 
     * 核心：使用 zeebeClient.newPublishMessageCommand()
     * 绑定到 BPMN 中定义的 Message Start Event
     */
    private Long triggerCampaign(EventTrigger trigger, String memberId, JsonNode payload) {
        CampaignPlan plan = planRepository.findById(trigger.getPlanId())
                .orElseThrow(() -> new RuntimeException("Plan not found"));
        if (plan.getZeebeProcessId() == null) {
            throw new IllegalStateException("Plan not deployed");
        }
        // 构建流程变量
        Map<String, Object> variables = new HashMap<>();
        variables.put("planId", plan.getId());
        variables.put("triggerId", trigger.getId());
        variables.put("memberId", memberId);
        variables.put("eventType", trigger.getEventType());
        variables.put("eventPayload", payload);
        variables.put("triggerTime", Instant.now().toString());
        // 使用 Zeebe Message 触发（而非 Create Instance）
        // 消息名称 = "campaign_trigger_" + plan.getId() + "_" + trigger.getEventType()
        String messageName = "campaign_trigger_" + plan.getId() + "_" + trigger.getEventType();
        // 使用 memberId 作为 correlationKey，确保同一个用户的相同消息不重复消费
        String correlationKey = memberId + "_" + trigger.getEventType();
        Long processInstanceKey = zeebeClient.newPublishMessageCommand()
                .messageName(messageName)
                .correlationKey(correlationKey)
                .timeToLive(java.time.Duration.ofMinutes(5))  // 消息有效期5分钟
                .variables(variables)
                .send()
                .join()
                .getProcessInstanceKey();
        return processInstanceKey;
    }
    /**
     * 构建去重 Key
     */
    private String buildDedupKey(EventTrigger trigger, String memberId) {
        return trigger.getPlanId() + ":" + trigger.getEventType() + ":" + memberId;
    }
    /**
     * 检查事件过滤条件
     */
    private boolean matchesFilter(JsonNode filter, JsonNode payload) {
        if (filter == null || filter.isNull() || filter.isEmpty()) {
            return true;
        }
        // 实现过滤逻辑（如：order_amount > 100）
        // 具体实现略
        return true;
    }
    /**
     * 检查时间窗口
     */
    private boolean isWithinTimeWindow(EventTrigger trigger) {
        Instant now = Instant.now();
        if (trigger.getStartTime() != null && now.isBefore(trigger.getStartTime())) return false;
        if (trigger.getEndTime() != null && now.isAfter(trigger.getEndTime())) return false;
        return true;
    }
    /**
     * 记录触发日志
     */
    private void logDedup(EventTrigger trigger, String memberId, String eventType,
                          String status, Long processInstanceKey) {
        EventTriggerLog log = EventTriggerLog.builder()
                .id(UUID.randomUUID().toString())
                .planId(trigger.getPlanId())
                .triggerId(trigger.getId())
                .eventType(eventType)
                .memberId(memberId)
                .triggered("TRIGGERED".equals(status))
                .skipReason("DUPLICATE".equals(status) ? "DUPLICATE" :
                           "FILTER_NOT_MATCH".equals(status) ? "FILTER_NOT_MATCH" : null)
                .processInstanceKey(processInstanceKey)
                .eventTime(Instant.now())
                .triggerTime(Instant.now())
                .dedupKey(buildDedupKey(trigger, memberId))
                .build();
        logRepository.save(log);
    }
}
```
### 4.3 去重服务
```java
package com.loyalty.platform.campaign.event.trigger;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
@Component
public class DedupService {
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    @Autowired
    private EventTriggerLogRepository logRepository;
    /**
     * 检查并标记去重（原子操作）
     * 
     * @return true: 首次触发，false: 重复触发
     */
    public boolean checkAndMark(String dedupKey, int windowMinutes) {
        // 1. 先查 Redis（快速路径）
        String cacheKey = "dedup:" + dedupKey;
        Boolean existed = redisTemplate.opsForValue()
                .setIfAbsent(cacheKey, "1", Duration.ofMinutes(windowMinutes));
        if (Boolean.FALSE.equals(existed)) {
            // Redis 中存在 → 重复
            return false;
        }
        // 2. 再查数据库（防止 Redis 丢失数据）
        // 检查最近 windowMinutes 内是否有相同 dedupKey 的记录
        boolean existsInDb = logRepository.existsByDedupKeyAndTriggerTimeAfter(
                dedupKey, Instant.now().minus(windowMinutes, ChronoUnit.MINUTES)
        );
        if (existsInDb) {
            // 数据库中有记录 → 重复，回滚 Redis
            redisTemplate.delete(cacheKey);
            return false;
        }
        return true;
    }
}
```
### 4.4 BPMN 模板增强（支持 Message Start Event）
xml
运行
```
<!-- ============================================================
     BPMN 模板：支持事件触发启动
     编译器在检测到 Canvas 中使用 EVENT_TRIGGER 节点时，自动生成此结构
     ============================================================ -->
<bpmn:process id="campaign_event_driven" isExecutable="true">
  
  <!-- 消息启动事件（替代 Start Event） -->
  <bpmn:startEvent id="StartEvent_1">
    <bpmn:messageEventDefinition>
      <!-- 消息名称由编译器动态生成 -->
      <bpmn:message id="Message_1" name="campaign_trigger_plan_001_ORDER_CREATED" />
    </bpmn:messageEventDefinition>
  </bpmn:startEvent>
  
  <!-- 接收事件 payload -->
  <bpmn:serviceTask id="Activity_1" name="接收事件数据" zeebe:taskType="campaign-event-receiver">
    <!-- 将 eventPayload 中的字段提取为流程变量 -->
  </bpmn:serviceTask>
  
  <!-- 条件分支（基于事件数据） -->
  <bpmn:exclusiveGateway id="Gateway_1" name="金额判断">
    <bpmn:conditionExpression>= eventPayload.order_amount > 100</bpmn:conditionExpression>
  </bpmn:exclusiveGateway>
  
  <!-- 发送邮件 -->
  <bpmn:serviceTask id="Activity_2" name="发送邮件" zeebe:taskType="campaign-send-email">
    <bpmn:extensionElements>
      <zeebe:taskDefinition type="campaign-send-email" />
      <!-- memberId 由事件携带 -->
    </bpmn:extensionElements>
  </bpmn:serviceTask>
  
  <!-- 延迟等待（事件驱动特有） -->
  <bpmn:intermediateCatchEvent id="Timer_1" name="延迟30分钟">
    <bpmn:timerEventDefinition>
      <bpmn:timeDuration>PT30M</bpmn:timeDuration>
    </bpmn:timerEventDefinition>
  </bpmn:intermediateCatchEvent>
  
  <bpmn:endEvent id="EndEvent_1" />
  
  <!-- 连线 -->
  <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_1" />
  <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_1" targetRef="Gateway_1" />
  <bpmn:sequenceFlow id="Flow_3" sourceRef="Gateway_1" targetRef="Activity_2">
    <bpmn:conditionExpression>order_amount > 100</bpmn:conditionExpression>
  </bpmn:sequenceFlow>
  <bpmn:sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Timer_1">
    <bpmn:conditionExpression>order_amount <= 100</bpmn:conditionExpression>
  </bpmn:sequenceFlow>
  <bpmn:sequenceFlow id="Flow_5" sourceRef="Timer_1" targetRef="Activity_2" />
  <bpmn:sequenceFlow id="Flow_6" sourceRef="Activity_2" targetRef="EndEvent_1" />
  
</bpmn:process>
```
***
## 五、Canvas 节点类型扩展
### 5.1 新增 `EVENT_TRIGGER` 节点
在画布中，`EVENT_TRIGGER` 节点替换传统 `START` 节点：
```text
┌─ 节点配置：EVENT_TRIGGER ─────────────────────────────────────────────────┐
│                                                                           │
│  节点名称: [ 订单创建触发器                ]                               │
│                                                                           │
│  ┌─ 事件定义 ───────────────────────────────────────────────────────────┐ │
│  │  事件来源: [Loyalty EventBridge ▼]                                   │ │
│  │  事件类型: [ORDER_CREATED ▼]                                         │ │
│  │  Kafka Topic: [loyalty.event.order]                                  │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ 事件过滤（可选） ───────────────────────────────────────────────────┐ │
│  │  过滤条件: [订单金额] [>] [100]                                      │ │
│  │  [+ 添加条件]                                                        │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ 防抖设置 ───────────────────────────────────────────────────────────┐ │
│  │  时间窗口: [60] 分钟内，同一用户只触发 [1] 次                         │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  ┌─ 生效时间 ───────────────────────────────────────────────────────────┐ │
│  │  [2026-01-01] ~ [2026-12-31]                                        │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                           │
│  [保存] [取消]                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```
### 5.2 节点配置数据结构
```typescript
// types/canvas.d.ts
interface EventTriggerNodeConfig {
  // ---- 事件源 ----
  eventSource: 'loyalty_event' | 'kafka_topic' | 'custom_webhook';
  eventType: string;                          // ORDER_CREATED, CART_ABANDONED, ...
  kafkaTopic?: string;                       // 如果 eventSource 是 kafka_topic
  
  // ---- 事件过滤 ----
  eventFilters?: {
    field: string;
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
    value: any;
  }[];
  
  // ---- 防抖 ----
  dedup: {
    enabled: boolean;
    windowMinutes: number;                    // 60
    maxCount: number;                         // 1
    keyFields: string[];                     // ["member_id", "event_type"]
  };
  
  // ---- 生效时间 ----
  validFrom?: string;                        // 2026-01-01
  validTo?: string;                          // 2026-12-31
}
```
***
## 六、前端页面设计
### 6.1 事件营销 Campaign 列表
```text
┌─ 营销活动列表 ──────────────────────────────────────────────────────────────┐
│  [+ 新建活动]  [筛选: 全部 ▼]  [搜索...]                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 活动卡片（事件驱动） ───────────────────────────────────────────────┐ │
│  │  🔴 实时                    订单创建触发 · 运行中                   │ │
│  │  名称: 新订单感谢邮件                                                │ │
│  │  触发器: 订单创建 (ORDER_CREATED)                                    │ │
│  │  触发次数: 1,234 次   |  处理用户: 1,234                           │ │
│  │  状态: ● 运行中  |  生效时间: 2026-01-01 ~ 2026-12-31              │ │
│  │  [编辑] [暂停] [查看执行]                                           │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 活动卡片（批处理） ─────────────────────────────────────────────────┐ │
│  │  🔵 批处理                   定时执行                               │ │
│  │  名称: 618大促会员召回                                              │ │
│  │  类型: 手动触发   |  人群: 高价值会员                               │ │
│  │  状态: ○ 待执行                                                    │ │
│  │  [编辑] [启动] [查看执行]                                           │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 6.2 事件驱动画布模板
```text
┌─ 画布编辑器 ──────────────────────────────────────────────────────────────┐
│  [保存] [部署] [启动]                              触发类型: ● 事件 ○ 手动 │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐                                                        │
│  │  节点库       │   ┌──────────────────────────────────────────────────┐ │
│  │ ┌──────────┐ │   │  [EVENT_TRIGGER]                                │ │
│  │ │🔴事件触发  │ │   │  订单创建                                      │ │
│  │ ├──────────┤ │   │       │                                          │ │
│  │ │👥人群筛选  │ │   │       ▼                                          │ │
│  │ ├──────────┤ │   │  [条件分支]                                     │ │
│  │ │🔀条件分支  │ │   │  金额判断                                      │ │
│  │ ├──────────┤ │   │   │               │                              │ │
│  │ │⏰延迟等待  │ │   │   ▼               ▼                              │ │
│  │ ├──────────┤ │   │  [发送邮件]      [延迟30分钟]                    │ │
│  │ │✉️发送邮件  │ │   │  感谢邮件         │                              │ │
│  │ ├──────────┤ │   │   │               ▼                              │ │
│  │ │⭐发放积分  │ │   │   ▼          [发送邮件]                        │ │
│  │ └──────────┘ │   │  [结束]        提醒邮件                         │ │
│  └──────────────┘   │                   │                              │ │
│                      │                   ▼                              │ │
│                      │                 [结束]                          │ │
│                      └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 七、事件驱动营销的典型场景
| 场景         | 事件类型                | 延迟    | 动作            |
| ---------- | ------------------- | ----- | ------------- |
| **订单感谢**   | `ORDER_CREATED`     | 0 分钟  | 发送感谢邮件 + 发放积分 |
| **购物车挽回**  | `CART_ABANDONED`    | 30 分钟 | 发送提醒邮件 + 优惠券  |
| **等级祝贺**   | `TIER_CHANGED`      | 0 分钟  | 发送等级权益通知      |
| **活跃会员奖励** | `LOGIN_7_DAYS` (累计) | 0 分钟  | 发送连续登录奖励      |
| **退款挽留**   | `ORDER_REFUNDED`    | 0 分钟  | 发送挽回问卷 + 专属客服 |
| **生日祝福**   | `BIRTHDAY` (定时)     | 0 分钟  | 发送生日祝福 + 专属优惠 |
***
## 八、与原设计的集成说明
### 8.1 兼容性
| 项目              | 说明                                                  |
| --------------- | --------------------------------------------------- |
| **现有 Campaign** | 不受影响，继续使用 `START` 节点和手动触发                           |
| **新 Campaign**  | 可选择 `EVENT_TRIGGER` 节点实现事件驱动                        |
| **编译器**         | 检测到 `EVENT_TRIGGER` 节点时，生成 Message Start Event BPMN |
| **Workers**     | 完全复用，无需修改                                           |
| **事件系统**        | 复用第6章的 EventBridge + Kafka                          |
### 8.2 切换方式
```text
┌─ 新建活动 ──────────────────────────────────────────────────────────────────┐
│  活动类型:                                                                  │
│  ○ 批处理营销  (定时/手动触发 + 人群筛选)                                  │
│  ● 事件驱动营销 (实时触发 + 用户由事件携带)                                │
│                                                                             │
│  [确认] [取消]                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 8.3 开发实施检查清单
* 创建 `campaign_event_trigger` 表
* 创建 `campaign_event_trigger_log` 表
* 扩展 `campaign_plan` 表（`trigger_type`, `trigger_config_id`）
* 实现 `CampaignEventTriggerListener`（Kafka 消费者）
* 实现 `CampaignEventTriggerService`（核心触发逻辑）
* 实现 `DedupService`（Redis + DB 双层去重）
* 修改 `CanvasToBpmnCompiler`，支持 `EVENT_TRIGGER` 节点生成 Message Start Event
* 前端新增 `EVENT_TRIGGER` 节点类型
* 前端新增事件触发器配置面板
* 前端新增活动列表“事件驱动”标识
* 编写单元测试和集成测试
***
## 九、总结
| 维度               | 补全前       | 补全后                     |
| ---------------- | --------- | ----------------------- |
| **触发方式**         | 仅手动/定时    | 手动/定时 + 事件实时触发          |
| **用户来源**         | 人群筛选（拉取）  | 事件携带（推送）                |
| **响应延迟**         | 分钟\~小时级   | **毫秒\~秒级**              |
| **典型场景**         | 大促活动、批量营销 | **实时互动、自动化营销**          |
| **与 Loyalty 集成** | 通过数据同步    | **通过 EventBridge 实时事件** |
**事件驱动营销是 Campaign Tools 从“批处理营销工具”升级为“实时营销自动化平台”的关键能力。** 本设计完全复用现有架构（Zeebe、Workers、EventBridge），新增的是**事件监听 + 消息触发**环节，对现有功能零侵入。
