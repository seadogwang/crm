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
import java.util.*;

/**
 * 京东 SPI Handler — JOS (京东开放服务平台) Webhook 接口。
 *
 * <p>京东 SDK 验签方式：MD5(AppSecret + Body)
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
public class JdSpiHandler implements ChannelSpiHandler {

    private static final Logger log = LoggerFactory.getLogger(JdSpiHandler.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    private final EventInboxRepository inboxRepo;

    public JdSpiHandler(EventInboxRepository inboxRepo) { this.inboxRepo = inboxRepo; }

    @Override public String getChannelCode() { return "JD"; }

    @Override
    public boolean verifySignature(HttpServletRequest request, byte[] rawBody, ChannelAdapterConfig config) {
        try {
            String signHeader = request.getHeader("X-Jd-Signature");
            if (signHeader == null) return false;

            Map<String, Object> auth = config.getAuthConfig();
            String appSecret = auth != null ? String.valueOf(auth.getOrDefault("app_secret", "")) : "";

            // JD 签名: MD5(appSecret + body + appSecret)
            String body = new String(rawBody, StandardCharsets.UTF_8);
            String toSign = appSecret + body + appSecret;
            String computed = md5(toSign);

            return MessageDigest.isEqual(
                    computed.getBytes(StandardCharsets.UTF_8),
                    signHeader.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.error("[JdSpi] 验签异常", e);
            return false;
        }
    }

    @Override
    public Object handleAction(String action, String programCode, byte[] rawBody, ChannelAdapterConfig config) {
        try {
            String bodyStr = new String(rawBody, StandardCharsets.UTF_8);
            Map<String, Object> payload = mapper.readValue(bodyStr, Map.class);
            String idemKey = programCode + ":JD:" + action + ":" + System.currentTimeMillis();

            if (inboxRepo.findByIdempotencyKey(idemKey).isPresent()) {
                return jdResponse("SUCCESS", "ok (idempotent)");
            }

            inboxRepo.save(EventInbox.builder()
                    .programCode(programCode).sourceChannel("JD")
                    .sourceEventId("JD-" + System.currentTimeMillis())
                    .idempotencyKey(idemKey).payloadHash(md5(bodyStr))
                    .payload(payload).signatureVerified(true)
                    .status("RECEIVED").retryCount(0).maxRetry(3)
                    .firstSeenAt(LocalDateTime.now()).build());

            return jdResponse("SUCCESS", "ok");
        } catch (Exception e) {
            log.error("[JdSpi] 处理失败", e);
            throw new RuntimeException(e);
        }
    }

    @Override public Object buildErrorResponse(Exception e) {
        return jdResponse("ERR_PROCESS_FAILED", e.getMessage());
    }

    private Map<String, Object> jdResponse(String code, String msg) {
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("code", code); r.put("message", msg);
        return r;
    }

    private String md5(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] h = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) { return ""; }
    }
}