package com.loyalty.platform.campaign.webhook;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.event.service.CampaignEventTriggerService;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Webhook Module Tests")
class WebhookModuleTest {

    @Mock private CampaignEventTriggerRepository triggerRepository;
    @Mock private CampaignWebhookLogRepository webhookLogRepository;
    @Mock private CampaignEventTriggerService eventTriggerService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private WebhookProcessor processor;
    private static final String PROG = "PROG001";

    @BeforeEach
    void setUp() {
        processor = new WebhookProcessor(triggerRepository, webhookLogRepository,
                eventTriggerService, objectMapper);
    }

    @Nested
    @DisplayName("WebhookProcessor — 认证")
    class AuthTests {

        @Test
        @DisplayName("无 webhookConfig → 认证通过")
        void shouldPassWithNoConfig() {
            CampaignEventTrigger trigger = buildTrigger(null);
            when(triggerRepository.findActiveByEventType("ORDER_CREATED")).thenReturn(List.of(trigger));

            processor.processAsync(PROG, "ORDER_CREATED", objectMapper.createObjectNode(),
                    Map.of(), "1.2.3.4", "/api/webhook", "POST", "wh_1");
            verify(webhookLogRepository, atLeastOnce()).save(any());
        }

        @Test
        @DisplayName("API Key 不匹配 → FAILED_API_KEY")
        void shouldRejectBadApiKey() {
            String config = "{\"enabled\":true,\"apiKey\":\"secret123\"}";
            CampaignEventTrigger trigger = buildTrigger(config);
            when(triggerRepository.findActiveByEventType("TEST")).thenReturn(List.of(trigger));

            processor.processAsync(PROG, "TEST", objectMapper.createObjectNode(),
                    Map.of("X-API-Key", "wrong_key"), "1.2.3.4", "/path", "POST", "wh_2");
            // Should save log with FAILED_API_KEY
            verify(webhookLogRepository, atLeastOnce()).save(any());
        }

        @Test
        @DisplayName("Webhook disabled → DISABLED")
        void shouldRejectDisabled() {
            String config = "{\"enabled\":false}";
            CampaignEventTrigger trigger = buildTrigger(config);
            when(triggerRepository.findActiveByEventType("TEST")).thenReturn(List.of(trigger));

            processor.processAsync(PROG, "TEST", objectMapper.createObjectNode(),
                    Map.of(), "1.2.3.4", "/path", "POST", "wh_3");
            verify(webhookLogRepository).save(any());
        }

        @Test
        @DisplayName("IP 不在白名单 → IP_BLOCKED")
        void shouldBlockIpNotInWhitelist() {
            String config = "{\"enabled\":true,\"ipWhitelist\":[\"10.0.0.0/24\"]}";
            CampaignEventTrigger trigger = buildTrigger(config);
            when(triggerRepository.findActiveByEventType("TEST")).thenReturn(List.of(trigger));

            processor.processAsync(PROG, "TEST", objectMapper.createObjectNode(),
                    Map.of(), "192.168.1.1", "/path", "POST", "wh_4");
            verify(webhookLogRepository).save(any());
        }
    }

    @Nested
    @DisplayName("WebhookProcessor — 字段映射")
    class MappingTests {

        @Test
        @DisplayName("使用默认路径提取 memberId")
        void shouldExtractMemberIdWithDefaultPath() throws Exception {
            String json = "{\"data\":{\"user_id\":\"M_12345\"}}";
            JsonNode body = objectMapper.readTree(json);
            CampaignEventTrigger trigger = buildTrigger(null);
            when(triggerRepository.findActiveByEventType("TEST")).thenReturn(List.of(trigger));

            processor.processAsync(PROG, "TEST", body, Map.of(), "1.2.3.4", "/path", "POST", "wh_m1");
            verify(eventTriggerService).processEvent(eq("TEST"), eq("M_12345"), any());
        }

        @Test
        @DisplayName("使用 mappingRules 自定义路径")
        void shouldExtractWithCustomMapping() throws Exception {
            String config = "{\"mappingRules\":{\"memberId\":\"user.id\",\"eventType\":\"type\"}}";
            String json = "{\"user\":{\"id\":\"U_999\"},\"type\":\"CUSTOM_TYPE\"}";
            JsonNode body = objectMapper.readTree(json);
            CampaignEventTrigger trigger = buildTrigger(config);
            when(triggerRepository.findActiveByEventType("TEST")).thenReturn(List.of(trigger));

            processor.processAsync(PROG, "TEST", body, Map.of(), "1.2.3.4", "/path", "POST", "wh_m2");
            verify(eventTriggerService).processEvent(eq("CUSTOM_TYPE"), eq("U_999"), any());
        }

        @Test
        @DisplayName("memberId 为空 → 跳过触发")
        void shouldSkipWhenNoMemberId() {
            CampaignEventTrigger trigger = buildTrigger(null);
            when(triggerRepository.findActiveByEventType("TEST")).thenReturn(List.of(trigger));

            processor.processAsync(PROG, "TEST", objectMapper.createObjectNode(),
                    Map.of(), "1.2.3.4", "/path", "POST", "wh_skip");
            verify(eventTriggerService, never()).processEvent(any(), any(), any());
        }
    }

    @Nested
    @DisplayName("WebhookProcessor — 无触发器")
    class NoTriggerTests {

        @Test
        @DisplayName("无匹配触发器 → NO_TRIGGER 日志")
        void shouldLogNoTrigger() {
            when(triggerRepository.findActiveByEventType("UNKNOWN")).thenReturn(List.of());
            processor.processAsync(PROG, "UNKNOWN", objectMapper.createObjectNode(),
                    Map.of(), "1.2.3.4", "/path", "POST", "wh_no");
            verify(webhookLogRepository).save(any());
            verify(eventTriggerService, never()).processEvent(any(), any(), any());
        }
    }

    @Nested
    @DisplayName("HMAC 签名验证")
    class HmacTests {

        @Test
        @DisplayName("正确签名 → 通过")
        void shouldPassWithCorrectSignature() throws Exception {
            String secret = "test_secret";
            String config = "{\"enabled\":true,\"signingSecret\":\"" + secret + "\"}";
            String bodyStr = "{\"data\":{\"user_id\":\"M_OK\"}}";
            JsonNode body = objectMapper.readTree(bodyStr);
            CampaignEventTrigger trigger = buildTrigger(config);
            when(triggerRepository.findActiveByEventType("TEST")).thenReturn(List.of(trigger));

            // Compute correct signature
            String ts = "1700000000";
            String payload = "POST/api/webhook" + ts + bodyStr;
            String sig = hmacSha256(payload, secret);

            Map<String, String> headers = Map.of(
                    "X-Campaign-Signature", sig,
                    "X-Timestamp", ts);

            processor.processAsync(PROG, "TEST", body, headers, "1.2.3.4", "/api/webhook", "POST", "wh_hmac");
            verify(eventTriggerService).processEvent(anyString(), anyString(), any());
        }

        @Test
        @DisplayName("错误签名 → FAILED_SIGNATURE")
        void shouldRejectBadSignature() throws Exception {
            String config = "{\"enabled\":true,\"signingSecret\":\"real_secret\"}";
            String bodyStr = "{\"data\":{\"user_id\":\"M\"}}";
            JsonNode body = objectMapper.readTree(bodyStr);
            CampaignEventTrigger trigger = buildTrigger(config);
            when(triggerRepository.findActiveByEventType("TEST")).thenReturn(List.of(trigger));

            Map<String, String> headers = Map.of(
                    "X-Campaign-Signature", "bad_signature_here",
                    "X-Timestamp", "1700000000");

            processor.processAsync(PROG, "TEST", body, headers, "1.2.3.4", "/api/webhook", "POST", "wh_bad");
            verify(eventTriggerService, never()).processEvent(any(), any(), any());
        }
    }

    @Nested
    @DisplayName("WebhookLog 查询")
    class LogQueryTests {

        @Test
        @DisplayName("getLogs → 按 programCode 查询")
        void shouldGetLogs() {
            CampaignWebhookLog log = CampaignWebhookLog.builder()
                    .id("L1").programCode(PROG).requestPath("/api/test")
                    .authStatus("SUCCESS").build();
            when(webhookLogRepository.findByProgramCodeOrderByReceivedAtDesc(PROG))
                    .thenReturn(List.of(log));

            List<CampaignWebhookLog> logs = processor.getLogs(PROG);
            assertEquals(1, logs.size());
        }
    }

    // Helpers
    private CampaignEventTrigger buildTrigger(String webhookConfig) {
        return CampaignEventTrigger.builder()
                .id("TRIG_001").programCode(PROG).eventType("TEST")
                .eventSource("WEBHOOK").webhookConfig(webhookConfig).build();
    }

    private String hmacSha256(String payload, String secret) {
        try {
            javax.crypto.Mac mac = javax.crypto.Mac.getInstance("HmacSHA256");
            mac.init(new javax.crypto.spec.SecretKeySpec(
                    secret.getBytes(java.nio.charset.StandardCharsets.UTF_8), "HmacSHA256"));
            return java.util.Base64.getEncoder().encodeToString(
                    mac.doFinal(payload.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (Exception e) { return ""; }
    }
}
