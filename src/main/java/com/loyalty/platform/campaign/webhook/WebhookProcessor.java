package com.loyalty.platform.campaign.webhook;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.event.service.CampaignEventTriggerService;
import com.loyalty.platform.domain.entity.campaign.CampaignEventTrigger;
import com.loyalty.platform.domain.entity.campaign.CampaignWebhookLog;
import com.loyalty.platform.domain.repository.campaign.CampaignEventTriggerRepository;
import com.loyalty.platform.domain.repository.campaign.CampaignWebhookLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.*;

@Service
public class WebhookProcessor {

    private static final Logger log = LoggerFactory.getLogger(WebhookProcessor.class);

    private final CampaignEventTriggerRepository triggerRepository;
    private final CampaignWebhookLogRepository webhookLogRepository;
    private final CampaignEventTriggerService eventTriggerService;
    private final ObjectMapper objectMapper;

    public WebhookProcessor(CampaignEventTriggerRepository triggerRepository,
                             CampaignWebhookLogRepository webhookLogRepository,
                             CampaignEventTriggerService eventTriggerService,
                             ObjectMapper objectMapper) {
        this.triggerRepository = triggerRepository;
        this.webhookLogRepository = webhookLogRepository;
        this.eventTriggerService = eventTriggerService;
        this.objectMapper = objectMapper;
    }

    @Async
    public void processAsync(String programCode, String eventType, JsonNode requestBody,
                              Map<String, String> headers, String requestIp,
                              String requestPath, String method, String webhookId) {
        long start = System.currentTimeMillis();
        Instant receivedAt = Instant.now();

        try {
            // 1. Find matching trigger
            List<CampaignEventTrigger> triggers = triggerRepository.findActiveByEventType(eventType);
            CampaignEventTrigger trigger = triggers.stream()
                    .filter(t -> programCode.equals(t.getProgramCode()))
                    .findFirst().orElse(null);

            if (trigger == null) {
                saveLog(webhookId, programCode, null, requestPath, method, headers,
                        requestBody.toString(), requestIp, "NO_TRIGGER", null, receivedAt, start);
                return;
            }

            // 2. Security authentication
            AuthResult auth = authenticate(headers, requestIp, requestBody.toString(),
                    requestPath, method, trigger);
            if (!auth.success) {
                saveLog(webhookId, programCode, trigger.getId(), requestPath, method, headers,
                        requestBody.toString(), requestIp, auth.status, auth.error, receivedAt, start);
                return;
            }

            // 3. Field mapping
            String memberId = extractField(requestBody, trigger, "memberId", "data.user_id");
            String mappedEventType = extractField(requestBody, trigger, "eventType", eventType);
            JsonNode payload = extractPayload(requestBody, trigger);

            if (memberId == null || memberId.isEmpty()) {
                saveLog(webhookId, programCode, trigger.getId(), requestPath, method, headers,
                        requestBody.toString(), requestIp, "SUCCESS", "Missing memberId", receivedAt, start);
                return;
            }

            // 4. Route to existing event trigger service
            eventTriggerService.processEvent(
                    mappedEventType != null ? mappedEventType : eventType,
                    memberId, payload);

            // 5. Log success
            saveLog(webhookId, programCode, trigger.getId(), requestPath, method, headers,
                    requestBody.toString(), requestIp, "SUCCESS", null, receivedAt, start);

        } catch (Exception e) {
            log.error("Webhook error: {}", e.getMessage(), e);
            saveLog(webhookId, programCode, null, requestPath, method, headers,
                    requestBody.toString(), requestIp, "ERROR", e.getMessage(), receivedAt, start);
        }
    }

    private AuthResult authenticate(Map<String, String> headers, String ip, String body,
                                     String path, String method, CampaignEventTrigger trigger) {
        String webhookConfigStr = trigger.getWebhookConfig();
        if (webhookConfigStr == null) return AuthResult.ok();

        try {
            JsonNode config = objectMapper.readTree(webhookConfigStr);
            if (!config.path("enabled").asBoolean(true)) return AuthResult.fail("DISABLED", "Webhook disabled");

            // API Key
            String expectedKey = config.path("apiKey").asText();
            if (!expectedKey.isEmpty()) {
                String provided = headers.get("X-API-Key");
                if (provided == null) provided = headers.get("x-api-key");
                if (!expectedKey.equals(provided)) return AuthResult.fail("FAILED_API_KEY", "Invalid API Key");
            }

            // IP whitelist
            JsonNode ipList = config.path("ipWhitelist");
            if (ipList.isArray() && ipList.size() > 0) {
                boolean allowed = false;
                for (JsonNode cidr : ipList) {
                    if (cidr.asText().equals(ip) || ip.startsWith(cidr.asText().replace("/24", "").replace("/16", ""))) {
                        allowed = true; break;
                    }
                }
                if (!allowed) return AuthResult.fail("IP_BLOCKED", "IP not in whitelist");
            }

            // HMAC signature
            String secret = config.path("signingSecret").asText();
            if (!secret.isEmpty()) {
                String provided = headers.get("X-Campaign-Signature");
                if (provided == null) provided = headers.get("x-campaign-signature");
                String ts = headers.getOrDefault("X-Timestamp", "");
                String payload = method + path + ts + body;
                String expected = hmacSign(payload, secret);
                if (!expected.equals(provided)) return AuthResult.fail("FAILED_SIGNATURE", "Signature mismatch");
            }
        } catch (Exception e) {
            return AuthResult.fail("CONFIG_ERROR", e.getMessage());
        }
        return AuthResult.ok();
    }

    private String extractField(JsonNode body, CampaignEventTrigger trigger, String field, String defaultPath) {
        try {
            String configStr = trigger.getWebhookConfig();
            if (configStr != null) {
                JsonNode config = objectMapper.readTree(configStr);
                String path = config.path("mappingRules").path(field).asText();
                if (!path.isEmpty()) return jsonPath(body, path);
            }
        } catch (Exception ignored) {}
        return jsonPath(body, defaultPath);
    }

    private JsonNode extractPayload(JsonNode body, CampaignEventTrigger trigger) {
        try {
            String configStr = trigger.getWebhookConfig();
            if (configStr != null) {
                JsonNode config = objectMapper.readTree(configStr);
                String path = config.path("mappingRules").path("payload").asText();
                if (!path.isEmpty()) {
                    JsonNode node = jsonPathNode(body, path);
                    if (node != null) return node;
                }
            }
        } catch (Exception ignored) {}
        return body;
    }

    private String jsonPath(JsonNode root, String path) {
        if (path == null || path.isEmpty()) return null;
        JsonNode node = jsonPathNode(root, path);
        return node != null && !node.isNull() ? node.asText() : null;
    }

    private JsonNode jsonPathNode(JsonNode root, String path) {
        JsonNode cur = root;
        for (String seg : path.split("\\.")) {
            if (cur == null) return null;
            cur = cur.get(seg);
        }
        return cur;
    }

    private String hmacSign(String payload, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return Base64.getEncoder().encodeToString(mac.doFinal(payload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception e) {
            return "";
        }
    }

    private void saveLog(String id, String programCode, String triggerId, String path, String method,
                          Map<String, String> headers, String body, String ip,
                          String authStatus, String authError, Instant receivedAt, long start) {
        CampaignWebhookLog logEntry = CampaignWebhookLog.builder()
                .id(id).programCode(programCode).triggerId(triggerId)
                .requestPath(path).requestMethod(method)
                .requestHeaders(toJson(headers)).requestBody(body).requestIp(ip)
                .authStatus(authStatus).authError(authError)
                .triggeredCampaign("SUCCESS".equals(authStatus) && authError == null)
                .responseStatus("SUCCESS".equals(authStatus) ? 200 : 401)
                .processingTimeMs(System.currentTimeMillis() - start)
                .receivedAt(receivedAt).processedAt(Instant.now())
                .build();
        webhookLogRepository.save(logEntry);
    }

    private String toJson(Map<String, String> map) {
        try { return objectMapper.writeValueAsString(map); } catch (Exception e) { return "{}"; }
    }

    public List<CampaignWebhookLog> getLogs(String programCode) {
        return webhookLogRepository.findByProgramCodeOrderByReceivedAtDesc(programCode);
    }

    private record AuthResult(boolean success, String status, String error) {
        static AuthResult ok() { return new AuthResult(true, "SUCCESS", null); }
        static AuthResult fail(String s, String e) { return new AuthResult(false, s, e); }
    }
}
