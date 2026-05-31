package com.loyalty.saas.spi.handler;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.saas.domain.entity.ChannelAdapterConfig;
import com.loyalty.saas.domain.entity.EventInbox;
import com.loyalty.saas.domain.repository.EventInboxRepository;
import com.loyalty.saas.spi.ChannelSpiHandler;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 天猫会员通 SPI Handler 示例实现。
 *
 * <p>天猫 SPI 要求：
 * <ul>
 *   <li>验签方式：HMAC-SHA256，签名放在 Header 的 X-Tmall-Signature</li>
 *   <li>业务失败也必须返回 HTTP 200，错误信息写在 JSON body 的 code/message 字段</li>
 *   <li>幂等键：X-Tmall-Request-Id（每次重试保持不变）</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
public class TmallSpiHandler implements ChannelSpiHandler {

    private static final Logger log = LoggerFactory.getLogger(TmallSpiHandler.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    private final EventInboxRepository eventInboxRepo;

    public TmallSpiHandler(EventInboxRepository eventInboxRepo) {
        this.eventInboxRepo = eventInboxRepo;
    }

    @Override
    public String getChannelCode() { return "TMALL"; }

    @Override
    public boolean verifySignature(HttpServletRequest request, byte[] rawBody, ChannelAdapterConfig config) {
        try {
            String signHeader = request.getHeader("X-Tmall-Signature");
            if (signHeader == null || signHeader.isBlank()) {
                log.warn("[TmallSpi] 缺少签名 Header");
                return false;
            }
            // 从 auth_config 中取 AppSecret
            Map<String, Object> auth = config.getAuthConfig();
            if (auth == null || !auth.containsKey("app_secret")) {
                log.warn("[TmallSpi] 渠道配置缺少 app_secret");
                return false;
            }
            String appSecret = String.valueOf(auth.get("app_secret"));

            // HMAC-SHA256 计算签名
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] computed = mac.doFinal(rawBody);
            String computedSign = Base64.getEncoder().encodeToString(computed);

            // 恒定时间比较防时序攻击
            boolean valid = MessageDigest.isEqual(
                    computedSign.getBytes(StandardCharsets.UTF_8),
                    signHeader.getBytes(StandardCharsets.UTF_8));
            log.debug("[TmallSpi] 验签结果: {}", valid ? "PASS" : "FAIL");
            return valid;
        } catch (Exception e) {
            log.error("[TmallSpi] 验签异常", e);
            return false;
        }
    }

    @Override
    public Object handleAction(String action, String programCode, byte[] rawBody, ChannelAdapterConfig config) {
        try {
            String requestId = "TMALL-" + System.currentTimeMillis();
            String idempotencyKey = programCode + ":TMALL:" + action + ":" + requestId;
            String bodyStr = new String(rawBody, StandardCharsets.UTF_8);
            Map<String, Object> payload = objectMapper.readValue(bodyStr, Map.class);

            // 幂等检查
            if (eventInboxRepo.findByIdempotencyKey(idempotencyKey).isPresent()) {
                log.info("[TmallSpi] 幂等拦截: idempotencyKey={}", idempotencyKey);
                return Map.of("code", "SUCCESS", "message", "ok (idempotent)");
            }

            // 插入 event_inbox，状态 RECEIVED
            EventInbox inbox = EventInbox.builder()
                    .programCode(programCode)
                    .sourceChannel("TMALL")
                    .sourceEventId(requestId)
                    .idempotencyKey(idempotencyKey)
                    .payloadHash(sha256(bodyStr))
                    .payload(payload)
                    .signatureVerified(true)
                    .status("RECEIVED")
                    .retryCount(0)
                    .maxRetry(3)
                    .firstSeenAt(LocalDateTime.now())
                    .build();
            eventInboxRepo.save(inbox);

            log.info("[TmallSpi] 事件已入库: id={}, action={}, idempotencyKey={}", inbox.getId(), action, idempotencyKey);

            // 返回天猫标准成功响应
            Map<String, Object> response = new LinkedHashMap<>();
            response.put("code", "SUCCESS");
            response.put("message", "ok");
            response.put("request_id", requestId);
            return response;

        } catch (Exception e) {
            log.error("[TmallSpi] 处理失败: action={}", action, e);
            throw new RuntimeException("Tmall handler error: " + e.getMessage(), e);
        }
    }

    @Override
    public Object buildErrorResponse(Exception e) {
        Map<String, Object> errorResp = new LinkedHashMap<>();
        errorResp.put("code", "ERR_TMALL_PROCESS_FAILED");
        errorResp.put("message", e.getMessage() != null ? e.getMessage() : "unknown error");
        return errorResp;
    }

    private String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : hash) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            return "";
        }
    }
}