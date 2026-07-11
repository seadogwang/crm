## 缺失项 6（P1）：入站 Webhook（外部事件接收）详细设计
> **优先级**：P1（重要）\
> **原因**：当前事件驱动营销仅支持 Loyalty 内部 Kafka 事件。企业实际业务中，大量营销触发信号来自外部系统（如：第三方 CRM 的“用户注册”、电商平台的“订单支付”、线下 POS 的“到店核销”、客服系统的“投诉提交”等）。无 Webhook 接入能力，事件驱动营销的适用场景将严重受限。\
> **对应章节**：第6章（Event System）扩展 + 事件驱动补全设计（第14章扩展）\
> **设计原则**：**完全复用现有事件处理链路**。Webhook 仅作为“外部事件接入层”，将外部 HTTP 请求标准化后，无缝注入现有的 `CampaignEventTriggerService.processEvent()` 流程，复用去重、频控、Zeebe 触发等全部能力。
## 一、设计目标
1. **标准化接入**：提供统一的 HTTP 端点，接收来自任意外部系统的事件。
2. **安全可靠**：支持 API Key 认证、HMAC 签名验签、IP 白名单，防止伪造事件。
3. **灵活映射**：外部 JSON 结构可配置映射为内部标准事件格式（`eventType`、`memberId`、`payload`）。
4. **异步解耦**：Webhook 接收后立即返回 `202 Accepted`，异步处理，防止外部调用超时。
5. **完全复用**：标准化后的事件直接流入现有 `CampaignEventTriggerService.processEvent()`，复用去重、防抖、Zeebe 触发逻辑。
6. **可观测**：记录所有 Webhook 请求日志，监控调用量、成功率、延迟。
## 二、与现有功能的集成点
| 现有功能                                           | 如何与 Webhook 集成                                                    |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| **campaign\_event\_trigger（事件驱动补全）**           | 扩展 `event_source` 枚举，新增 `WEBHOOK` 类型；新增 `webhook_config` 字段存储安全配置 |
| **CampaignEventTriggerService.processEvent()** | Webhook 标准化后**直接调用**此方法，复用所有现有逻辑（去重、过滤、触发）                        |
| **Zeebe Message Start Event**                  | 完全复用，无需修改                                                         |
| **DedupService（去重）**                           | 完全复用，外部事件也受防抖窗口控制                                                 |
| **Event System（第6章）**                          | Webhook 调用记录作为事件发布，便于审计                                           |
| **Intervention（第14章）**                         | Webhook 触发的 Campaign 同样支持人工干预                                     |
## 三、数据模型设计（最小化扩展）
### 3.1 扩展 `campaign_event_trigger` 表
```sql
-- ============================================================
-- 扩展 campaign_event_trigger 表，支持 Webhook 配置
-- ============================================================
-- 新增 webhook_config 字段（JSONB）
ALTER TABLE campaign_event_trigger ADD COLUMN webhook_config JSONB;
COMMENT ON COLUMN campaign_event_trigger.webhook_config IS 'Webhook 配置：认证方式、签名秘钥、字段映射等';
-- 修改 event_source 字段注释，明确支持 WEBHOOK
COMMENT ON COLUMN campaign_event_trigger.event_source IS 'loyalty_event / custom_webhook / kafka_topic / WEBHOOK';
-- 新增 webhook 专用索引（按 API Key 查询）
CREATE INDEX idx_cet_api_key ON campaign_event_trigger 
    ((webhook_config->>'api_key')) 
    WHERE event_source = 'WEBHOOK';
```
**`webhook_config` 结构示例**：
```json
{
    "enabled": true,
    "apiKey": "wk_abc123def456",
    "signingSecret": "sk_98765xyz",
    "signingMethod": "HMAC_SHA256",
    "ipWhitelist": ["192.168.1.0/24", "10.0.0.0/8"],
    "mappingRules": {
        "memberId": "data.user_id",
        "eventType": "event_name",
        "payload": "data.attributes"
    },
    "defaultEventType": "CUSTOM_EVENT",
    "timeoutMs": 5000
}
```
### 3.2 Webhook 请求日志表（campaign\_webhook\_log）
> 独立存储 Webhook 原始请求，用于审计和问题排查。
```sql
-- ============================================================
-- Webhook 请求日志（审计 + 重放）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_webhook_log (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    trigger_id VARCHAR(64),                           -- 关联 campaign_event_trigger.id
    -- ===== 请求信息 =====
    request_path VARCHAR(255),
    request_method VARCHAR(16),
    request_headers JSONB,
    request_body TEXT,
    request_ip INET,
    -- ===== 认证结果 =====
    auth_status VARCHAR(32),                          -- SUCCESS / FAILED_API_KEY / FAILED_SIGNATURE / IP_BLOCKED
    auth_error TEXT,
    -- ===== 处理结果 =====
    mapped_event_type VARCHAR(128),
    mapped_member_id VARCHAR(64),
    mapped_payload JSONB,
    triggered_campaign BOOLEAN DEFAULT FALSE,
    skip_reason VARCHAR(64),                          -- DUPLICATE / FILTER_NOT_MATCH / NO_TRIGGER
    -- ===== 响应 =====
    response_status INT,
    response_body TEXT,
    -- ===== 耗时 =====
    processing_time_ms BIGINT,
    -- ===== 时间 =====
    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);
CREATE INDEX idx_cwl_trigger ON campaign_webhook_log(trigger_id);
CREATE INDEX idx_cwl_program ON campaign_webhook_log(program_code);
CREATE INDEX idx_cwl_received ON campaign_webhook_log(received_at DESC);
CREATE INDEX idx_cwl_ip ON campaign_webhook_log(request_ip);
```
### 3.3 数据清理策略（已有 `campaign_webhook_log`）
```sql
-- 定期清理（保留 30 天）
COMMENT ON TABLE campaign_webhook_log IS '保留周期：30 天，由定时任务清理';
```
## 四、后端 Service 设计
### 4.1 Webhook 入口 Controller
```java
package com.loyalty.platform.campaign.webhook;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import java.util.UUID;
@Slf4j
@RestController
@RequestMapping("/api/campaign/webhook")
@RequiredArgsConstructor
public class WebhookController {
    private final WebhookProcessor webhookProcessor;
    private final ObjectMapper objectMapper;
    /**
     * 统一 Webhook 入口
     * 
     * 路径参数：
     *   - programCode: 租户/品牌标识
     *   - eventType:  外部事件类型（可选，也可从 mappingRules 提取）
     * 
     * 请求体：任意 JSON 结构（由 mappingRules 解析）
     */
    @PostMapping("/{programCode}/{eventType}")
    public ResponseEntity<Map<String, Object>> receiveWebhook(
            @PathVariable String programCode,
            @PathVariable String eventType,
            @RequestBody JsonNode requestBody,
            HttpServletRequest request) {
        log.info("Webhook received: programCode={}, eventType={}, bodySize={}",
                 programCode, eventType, requestBody.toString().length());
        // 1. 构建 Webhook 上下文
        WebhookContext context = WebhookContext.builder()
                .webhookId(UUID.randomUUID().toString())
                .programCode(programCode)
                .eventType(eventType)
                .requestBody(requestBody)
                .requestHeaders(getHeaders(request))
                .requestIp(getClientIp(request))
                .requestPath(request.getRequestURI())
                .requestMethod(request.getMethod())
                .receivedAt(Instant.now())
                .build();
        // 2. 异步处理（立即返回 202）
        webhookProcessor.processAsync(context);
        return ResponseEntity.accepted()
                .body(Map.of("status", "accepted", "webhookId", context.getWebhookId()));
    }
    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isEmpty()) {
            return xff.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
    private Map<String, String> getHeaders(HttpServletRequest request) {
        // 提取关键 Header（用于日志和签名验证）
        Map<String, String> headers = new HashMap<>();
        headers.put("X-Signature", request.getHeader("X-Campaign-Signature"));
        headers.put("X-Request-Id", request.getHeader("X-Request-Id"));
        headers.put("X-Timestamp", request.getHeader("X-Timestamp"));
        headers.put("User-Agent", request.getHeader("User-Agent"));
        return headers;
    }
}
```
### 4.2 Webhook 处理器（核心）
```java
package com.loyalty.platform.campaign.webhook;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.event.trigger.CampaignEventTriggerService;
import com.loyalty.platform.campaign.event.trigger.EventTriggerRepository;
import com.loyalty.platform.campaign.event.trigger.model.EventTrigger;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Service
@RequiredArgsConstructor
public class WebhookProcessor {
    private final EventTriggerRepository triggerRepository;
    private final WebhookLogRepository webhookLogRepository;
    private final CampaignEventTriggerService eventTriggerService;
    private final ObjectMapper objectMapper;
    private static final String SIGNATURE_HEADER = "X-Campaign-Signature";
    /**
     * 异步处理 Webhook 请求
     */
    @Async("webhookExecutor")
    public void processAsync(WebhookContext context) {
        long startTime = System.currentTimeMillis();
        try {
            // 1. 根据 programCode + eventType 查找匹配的触发器
            EventTrigger trigger = triggerRepository
                    .findByProgramCodeAndEventType(context.getProgramCode(), context.getEventType())
                    .orElse(null);
            if (trigger == null) {
                log.warn("No trigger found for webhook: programCode={}, eventType={}",
                         context.getProgramCode(), context.getEventType());
                saveLog(context, null, "NO_TRIGGER", null, "No matching trigger found");
                return;
            }
            // 2. 安全校验（API Key / 签名 / IP 白名单）
            AuthResult authResult = authenticate(context, trigger);
            if (!authResult.isSuccess()) {
                log.warn("Webhook authentication failed: programCode={}, reason={}",
                         context.getProgramCode(), authResult.getError());
                saveLog(context, trigger.getId(), authResult.getStatus(), 
                        null, authResult.getError());
                return;
            }
            // 3. 字段映射（将外部 JSON 转为内部标准事件）
            Map<String, Object> mappedEvent = mapFields(context, trigger);
            String memberId = (String) mappedEvent.get("memberId");
            String mappedEventType = (String) mappedEvent.get("eventType");
            JsonNode payload = (JsonNode) mappedEvent.get("payload");
            if (memberId == null || memberId.isEmpty()) {
                log.warn("Webhook missing memberId: programCode={}, eventType={}",
                         context.getProgramCode(), context.getEventType());
                saveLog(context, trigger.getId(), "SUCCESS", null, 
                        "Missing memberId in mapped event");
                return;
            }
            // 4. 复用现有事件处理逻辑（去重、过滤、触发 Zeebe）
            //    直接调用 CampaignEventTriggerService.processEvent()
            eventTriggerService.processEvent(
                mappedEventType != null ? mappedEventType : context.getEventType(),
                memberId,
                payload
            );
            // 5. 记录日志
            saveLog(context, trigger.getId(), "SUCCESS", mappedEventType, null);
            long durationMs = System.currentTimeMillis() - startTime;
            log.info("Webhook processed successfully: programCode={}, eventType={}, duration={}ms",
                     context.getProgramCode(), context.getEventType(), durationMs);
        } catch (Exception e) {
            log.error("Webhook processing error: programCode={}, error={}",
                      context.getProgramCode(), e.getMessage(), e);
            saveLog(context, null, "ERROR", null, "Processing error: " + e.getMessage());
        }
    }
    /**
     * 安全认证
     */
    private AuthResult authenticate(WebhookContext context, EventTrigger trigger) {
        JsonNode config = trigger.getWebhookConfig();
        if (config == null || config.isNull()) {
            return AuthResult.fail("CONFIG_MISSING", "Webhook config not found");
        }
        // 1. 检查是否启用
        if (!config.path("enabled").asBoolean(true)) {
            return AuthResult.fail("DISABLED", "Webhook is disabled");
        }
        String apiKey = config.path("apiKey").asText();
        String signingSecret = config.path("signingSecret").asText(null);
        String signingMethod = config.path("signingMethod").asText("HMAC_SHA256");
        JsonNode ipWhitelist = config.path("ipWhitelist");
        // 2. API Key 校验（与路径中的 API Key 比较，或其他方式）
        //    这里假设 API Key 通过路径或 Header 传递
        //    示例：从 Header X-API-Key 获取
        String providedApiKey = context.getRequestHeaders().get("X-API-Key");
        if (apiKey != null && !apiKey.equals(providedApiKey)) {
            return AuthResult.fail("INVALID_API_KEY", "Invalid API Key");
        }
        // 3. IP 白名单校验
        if (ipWhitelist != null && ipWhitelist.isArray()) {
            String clientIp = context.getRequestIp();
            boolean allowed = false;
            for (JsonNode ip : ipWhitelist) {
                if (isIpInRange(clientIp, ip.asText())) {
                    allowed = true;
                    break;
                }
            }
            if (!allowed) {
                return AuthResult.fail("IP_BLOCKED", 
                    "IP " + clientIp + " not in whitelist");
            }
        }
        // 4. HMAC 签名校验（可选）
        if (signingSecret != null && !signingSecret.isEmpty()) {
            String providedSignature = context.getRequestHeaders().get(SIGNATURE_HEADER);
            if (providedSignature == null || providedSignature.isEmpty()) {
                return AuthResult.fail("MISSING_SIGNATURE", "Signature header missing");
            }
            // 构建签名内容：method + path + timestamp + body
            String payload = context.getRequestMethod() + 
                             context.getRequestPath() +
                             context.getRequestHeaders().getOrDefault("X-Timestamp", "") +
                             context.getRequestBody().toString();
            String expectedSignature = generateHmacSignature(payload, signingSecret, signingMethod);
            if (!providedSignature.equals(expectedSignature)) {
                return AuthResult.fail("INVALID_SIGNATURE", "Signature verification failed");
            }
        }
        return AuthResult.success();
    }
    /**
     * 字段映射
     */
    private Map<String, Object> mapFields(WebhookContext context, EventTrigger trigger) {
        Map<String, Object> result = new HashMap<>();
        JsonNode config = trigger.getWebhookConfig();
        JsonNode mappingRules = config.path("mappingRules");
        JsonNode requestBody = context.getRequestBody();
        // 获取 memberId
        String memberIdPath = mappingRules.path("memberId").asText();
        String memberId = extractValueByPath(requestBody, memberIdPath);
        result.put("memberId", memberId);
        // 获取 eventType（优先使用映射，否则使用路径参数）
        String eventTypePath = mappingRules.path("eventType").asText();
        if (eventTypePath != null && !eventTypePath.isEmpty()) {
            String mappedType = extractValueByPath(requestBody, eventTypePath);
            result.put("eventType", mappedType != null ? mappedType : context.getEventType());
        } else {
            result.put("eventType", context.getEventType());
        }
        // 获取 payload（整个 body 或指定路径）
        String payloadPath = mappingRules.path("payload").asText();
        if (payloadPath != null && !payloadPath.isEmpty()) {
            JsonNode payload = extractJsonByPath(requestBody, payloadPath);
            result.put("payload", payload != null ? payload : requestBody);
        } else {
            result.put("payload", requestBody);
        }
        // 额外字段（用于扩展）
        result.put("rawEventType", context.getEventType());
        result.put("webhookId", context.getWebhookId());
        result.put("source", "WEBHOOK");
        return result;
    }
    /**
     * 根据 JSONPath 提取字符串值
     */
    private String extractValueByPath(JsonNode root, String path) {
        if (path == null || path.isEmpty()) return null;
        String[] segments = path.split("\\.");
        JsonNode current = root;
        for (String seg : segments) {
            if (current == null || !current.isObject()) return null;
            current = current.path(seg);
        }
        return current != null && !current.isNull() ? current.asText() : null;
    }
    /**
     * 根据 JSONPath 提取 JSON 节点
     */
    private JsonNode extractJsonByPath(JsonNode root, String path) {
        if (path == null || path.isEmpty()) return root;
        String[] segments = path.split("\\.");
        JsonNode current = root;
        for (String seg : segments) {
            if (current == null || !current.isObject()) return null;
            current = current.path(seg);
        }
        return current != null && !current.isNull() ? current : null;
    }
    /**
     * HMAC 签名生成
     */
    private String generateHmacSignature(String payload, String secret, String method) {
        try {
            Mac mac = Mac.getInstance(method);
            SecretKeySpec keySpec = new SecretKeySpec(
                secret.getBytes(StandardCharsets.UTF_8), method
            );
            mac.init(keySpec);
            byte[] hmacBytes = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(hmacBytes);
        } catch (NoSuchAlgorithmException | InvalidKeyException e) {
            throw new RuntimeException("HMAC signing failed", e);
        }
    }
    /**
     * IP 范围匹配（支持 CIDR）
     */
    private boolean isIpInRange(String ip, String cidr) {
        try {
            SubnetUtils utils = new SubnetUtils(cidr);
            return utils.getInfo().isInRange(ip);
        } catch (Exception e) {
            return ip.equals(cidr);
        }
    }
    /**
     * 保存日志
     */
    private void saveLog(WebhookContext context, String triggerId, 
                         String authStatus, String mappedEventType, String error) {
        WebhookLog log = WebhookLog.builder()
                .id(UUID.randomUUID().toString())
                .programCode(context.getProgramCode())
                .triggerId(triggerId)
                .requestPath(context.getRequestPath())
                .requestMethod(context.getRequestMethod())
                .requestHeaders(JsonUtil.toJsonNode(context.getRequestHeaders()))
                .requestBody(context.getRequestBody().toString())
                .requestIp(context.getRequestIp())
                .authStatus(authStatus)
                .authError(error)
                .mappedEventType(mappedEventType)
                .mappedMemberId(mappedEventType != null ? "EXTRACTED" : null)
                .mappedPayload(JsonUtil.toJsonNode(context.getRequestBody()))
                .triggeredCampaign(authStatus != null && authStatus.equals("SUCCESS"))
                .skipReason(error != null && error.contains("duplicate") ? "DUPLICATE" : null)
                .receivedAt(context.getReceivedAt())
                .processedAt(Instant.now())
                .build();
        webhookLogRepository.save(log);
    }
}
```
### 4.3 配置 Webhook 触发器（集成到现有事件触发器配置）
#### 复用现有 `EventTriggerService` 配置接口
```java
// 在现有 EventTriggerService 中新增 createWebhookTrigger 方法
@Service
public class EventTriggerService {
    // 现有方法保持不变 ...
    @Transactional
    public EventTrigger createWebhookTrigger(CreateWebhookTriggerRequest request) {
        EventTrigger trigger = EventTrigger.builder()
                .id(UUID.randomUUID().toString())
                .planId(request.getPlanId())
                .workspaceId(request.getWorkspaceId())
                .programCode(request.getProgramCode())
                .eventType(request.getEventType())      // 外部事件类型
                .eventSource("WEBHOOK")
                .enabled(true)
                .eventFilter(request.getEventFilter())  // 现有过滤条件
                .dedupWindowMinutes(request.getDedupWindowMinutes())
                .webhookConfig(buildWebhookConfig(request)) // 新增
                .createdBy(SecurityContext.getCurrentUserId())
                .createdAt(Instant.now())
                .build();
        return triggerRepository.save(trigger);
    }
    private JsonNode buildWebhookConfig(CreateWebhookTriggerRequest request) {
        Map<String, Object> config = new HashMap<>();
        config.put("enabled", true);
        config.put("apiKey", generateApiKey());
        config.put("signingSecret", request.getSigningSecret());
        config.put("signingMethod", request.getSigningMethod());
        config.put("ipWhitelist", request.getIpWhitelist());
        config.put("mappingRules", request.getMappingRules());
        return JsonUtil.toJsonNode(config);
    }
    private String generateApiKey() {
        return "wk_" + UUID.randomUUID().toString().replace("-", "");
    }
}
```
## 五、前端界面设计
### 5.1 事件触发器配置（Webhook 模式）
在画布 `EVENT_TRIGGER` 节点配置面板中，选择事件来源为 `Webhook`：
```text
┌─ 事件触发器配置 ────────────────────────────────────────────────────────────┐
│  事件来源: [Webhook (HTTP) ▼]                                              │
│  事件类型: [ order.paid ]                                                   │
│  Webhook URL: [https://campaign.loyalty.com/api/campaign/webhook/BRAND_A/order.paid] │
│              (只读，自动生成)                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 安全配置 ─────────────────────────────────────────────────────────────┐ │
│  │  API Key: [wk_a1b2c3d4e5f6 ]  [🔄 重新生成]                           │ │
│  │  ⚠️ 请将 API Key 配置到您的系统中，用于请求认证                         │ │
│  │                                                                         │ │
│  │  签名方式: [HMAC_SHA256 ▼]  签名密钥: [______________]  [🔄 生成]     │ │
│  │  说明：系统将使用此密钥验证请求签名，防止伪造事件                        │ │
│  │                                                                         │ │
│  │  IP 白名单:                                                             │ │
│  │  [192.168.1.0/24   ]  [x]                                              │ │
│  │  [10.0.0.0/8       ]  [x]                                              │ │
│  │  [+ 添加IP段]                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 字段映射 ─────────────────────────────────────────────────────────────┐ │
│  │  外部字段 → 内部字段                                                   │ │
│  │  [data.user.id      ] → [memberId  ]  [✓]                             │ │
│  │  [event_name        ] → [eventType ]  [✓]                             │ │
│  │  [data.attributes   ] → [payload   ]  [✓]                             │ │
│  │  [+ 添加映射]                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 测试工具 ─────────────────────────────────────────────────────────────┐ │
│  │  [📤 发送测试请求]  示例 JSON:                                         │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │ { "data": { "user": { "id": "M_12345" }, "event_name": "order.paid", ... } } │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  │  测试结果: ✅ 映射成功 → memberId=M_12345, eventType=order.paid     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 事件过滤（复用现有） ────────────────────────────────────────────────┐ │
│  │  过滤条件: [订单金额] [>] [100]                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 防抖设置（复用现有） ────────────────────────────────────────────────┐ │
│  │  时间窗口: [60] 分钟内，同一用户只触发 [1] 次                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [保存] [取消]                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.2 Webhook 监控仪表板
```text
┌─ Webhook 监控 ──────────────────────────────────────────────────────────────┐
│  总请求: 12,345  │  成功: 11,234 (91%)  │  失败: 1,111  │  平均延迟: 234ms │
│  [🔍 搜索]  [筛选: 全部状态 ▼]  [时间: 最近24小时 ▼]                      │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 实时日志 ─────────────────────────────────────────────────────────────┐ │
│  │  时间          │ IP          │ 事件类型  │ 状态   │ 耗时  │ 操作    │ │
│  ├───────────────┼─────────────┼───────────┼────────┼───────┼─────────┤ │
│  │  10:23:45.123 │ 192.168.1.1 │ order.paid│ ✅ 成功│ 156ms │ [详情]  │ │
│  │  10:23:12.456 │ 10.0.0.5    │ user.reg  │ ❌ 签名 │ 12ms  │ [详情]  │ │
│  │  10:22:50.789 │ 192.168.1.2 │ order.paid│ ⏭ 去重 │ 89ms  │ [详情]  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [📊 导出报告]  [🔄 刷新]                                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 六、API 设计（外部调用方视角）
### 6.1 发送 Webhook 事件
**Endpoint**:
```text
POST /api/campaign/webhook/{programCode}/{eventType}
```
**Headers**:
```text
X-API-Key: wk_a1b2c3d4e5f6
X-Campaign-Signature: base64_hmac_signature
X-Timestamp: 2026-06-28T10:00:00Z
X-Request-Id: req_abc123
Content-Type: application/```json
**Body（任意 JSON）**:
```json
{
    "data": {
        "user": {
            "id": "M_12345",
            "name": "张三"
        },
        "event_name": "order.paid",
        "attributes": {
            "order_id": "ORD_001",
            "amount": 299.00,
            "items": ["item_001", "item_002"]
        },
        "timestamp": "2026-06-28T10:00:00Z"
    }
}
```
**Response (202 Accepted)**:
```json
{
    "status": "accepted",
    "webhookId": "wh_abc123def456",
    "message": "Event accepted for processing"
}
```
**Error Response (401 Unauthorized)**:
```json
{
    "code": "AUTH_FAILED",
    "message": "Invalid API Key or signature",
    "webhookId": "wh_fail_001"
}
```
## 七、与现有模块的集成点总结
| 现有模块                                           | 集成方式                     | 变更点                        |
| ---------------------------------------------- | ------------------------ | -------------------------- |
| **campaign\_event\_trigger（事件驱动补全）**           | 新增 `webhook_config` 字段   | ALTER TABLE 添加列            |
| **CampaignEventTriggerService.processEvent()** | 完全复用                     | 无变更，直接调用                   |
| **DedupService**                               | 完全复用                     | 无变更                        |
| **Zeebe Message Start Event**                  | 完全复用                     | 无变更                        |
| **Event System（第6章）**                          | Webhook 处理结果发布事件         | 新增 `WEBHOOK_RECEIVED` 事件类型 |
| **Campaign Plan**                              | 关联 Plan 的 `trigger_type` | 无需变更                       |
| **Intervention（第14章）**                         | 自动生效                     | 无变更                        |
## 八、可观测性与告警（第12章扩展）
### 8.1 新增 Prometheus 指标
```java
@Component
public class WebhookMetrics {
    private final Counter webhookRequestsTotal = Counter.builder()
            .name("campaign_webhook_requests_total")
            .description("Total webhook requests")
            .tag("program_code", "")
            .tag("status", "")
            .register();
    private final Timer webhookProcessingTime = Timer.builder()
            .name("campaign_webhook_processing_duration_seconds")
            .description("Webhook processing duration")
            .register();
}
```
### 8.2 告警规则
yaml
```
# prometheus-rules.yaml 补充
- alert: WebhookFailureRate
  expr: rate(campaign_webhook_requests_total{status="FAILED"}[5m]) > 0.1
  for: 5m
  labels:
    severity: warning
    team: marketing
  annotations:
    summary: "Webhook 失败率过高"
    description: "Webhook 失败率 {{ $value }}% 在过去5分钟内"
- alert: WebhookHighLatency
  expr: histogram_quantile(0.95, campaign_webhook_processing_duration_seconds_bucket) > 5
  for: 5m
  labels:
    severity: warning
    team: infrastructure
  annotations:
    summary: "Webhook 处理延迟过高"
```
## 九、实施检查清单
* 执行 DDL：扩展 `campaign_event_trigger` 表（`webhook_config` JSONB）
* 执行 DDL：创建 `campaign_webhook_log` 表
* 实现 `WebhookController`（统一入口）
* 实现 `WebhookProcessor`（安全 + 映射 + 路由）
* 实现字段映射引擎（JSONPath 提取）
* 实现 HMAC 签名验证
* 实现 IP 白名单（CIDR 匹配）
* 前端：`EVENT_TRIGGER` 节点新增 Webhook 配置面板
* 前端：Webhook 监控仪表板
* 实现 Webhook 日志查询 API
* 配置异步线程池（`webhookExecutor`）
* 集成 Prometheus 指标
* 补充告警规则
* 编写单元测试和集成测试
* 编写外部调用方集成文档
## 十、总结
本设计为 Campaign Tools 补齐了**外部系统事件接入能力**：
| 能力         | 实现方式                                                   |
| ---------- | ------------------------------------------------------ |
| **统一接入端点** | `POST /api/campaign/webhook/{programCode}/{eventType}` |
| **安全认证**   | API Key + HMAC 签名 + IP 白名单                             |
| **字段映射**   | JSONPath 配置，灵活适配不同外部系统格式                               |
| **异步处理**   | 立即返回 202，后台处理，防止外部调用超时                                 |
| **完全复用**   | 标准化后直接调用 `processEvent()`，复用去重、频控、Zeebe 触发             |
| **可观测**    | 完整请求日志 + Prometheus 指标                                 |
| **测试工具**   | 前端提供测试请求发送和映射验证                                        |
**关键优势**：
1. **零业务逻辑侵入**：Webhook 仅作为“接入层”，所有业务处理完全复用现有事件驱动链路。
2. **配置驱动**：字段映射、安全策略均通过配置完成，无需为每个外部系统编写代码。
3. **安全可控**：多重安全机制防止伪造事件，IP 白名单支持内网调用。
4. **生产就绪**：异步处理、日志审计、监控告警、限流熔断可后续扩展。
