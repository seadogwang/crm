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

@Component
public class DouyinSpiHandler implements ChannelSpiHandler {
    private static final Logger log = LoggerFactory.getLogger(DouyinSpiHandler.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    private final EventInboxRepository inboxRepo;
    public DouyinSpiHandler(EventInboxRepository inboxRepo) { this.inboxRepo = inboxRepo; }
    @Override public String getChannelCode() { return "DOUYIN"; }

    @Override
    public boolean verifySignature(HttpServletRequest request, byte[] rawBody, ChannelAdapterConfig config) {
        try {
            String signHeader = request.getHeader("X-Douyin-Signature");
            if (signHeader == null) return false;
            Map<String, Object> auth = config.getAuthConfig();
            String secret = auth != null ? String.valueOf(auth.getOrDefault("app_secret", "")) : "";
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String computed = Base64.getEncoder().encodeToString(mac.doFinal(rawBody));
            return MessageDigest.isEqual(computed.getBytes(), signHeader.getBytes());
        } catch (Exception e) { return false; }
    }

    @Override
    public Object handleAction(String action, String programCode, byte[] rawBody, ChannelAdapterConfig config) {
        try {
            String body = new String(rawBody, StandardCharsets.UTF_8);
            Map<String, Object> payload = mapper.readValue(body, Map.class);

            // 从请求体 JSON 中提取抖音 request_id 作为幂等键
            String requestId = payload.get("request_id") != null
                    ? String.valueOf(payload.get("request_id")) : null;
            if (requestId == null || requestId.isBlank()) {
                requestId = "DY-" + System.currentTimeMillis();
                log.warn("[DouyinSpi] 请求体中未找到 request_id，降级使用时间戳生成 idempotencyKey");
            }
            String idemKey = programCode + ":DOUYIN:" + action + ":" + requestId;
            if (inboxRepo.findByIdempotencyKey(programCode, idemKey).isPresent())
                return Map.of("err_no", 0, "message", "ok");
            inboxRepo.save(EventInbox.builder()
                    .programCode(programCode).sourceChannel("DOUYIN")
                    .sourceEventId(requestId)
                    .idempotencyKey(idemKey).payloadHash(sha256(body))
                    .payload(payload).signatureVerified(true)
                    .status("RECEIVED").retryCount(0).maxRetry(3)
                    .firstSeenAt(LocalDateTime.now()).build());
            return Map.of("err_no", 0, "message", "ok");
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    @Override public Object buildErrorResponse(Exception e) {
        return Map.of("err_no", -1, "message", e.getMessage());
    }

    private String sha256(String s) {
        try { return Base64.getEncoder().encodeToString(
                MessageDigest.getInstance("SHA-256").digest(s.getBytes())); } catch (Exception e) { return ""; }
    }
}