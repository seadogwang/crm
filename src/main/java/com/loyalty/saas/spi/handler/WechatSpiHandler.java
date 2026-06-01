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

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.*;

@Component
public class WechatSpiHandler implements ChannelSpiHandler {
    private static final Logger log = LoggerFactory.getLogger(WechatSpiHandler.class);
    private static final ObjectMapper mapper = new ObjectMapper();
    private final EventInboxRepository inboxRepo;
    public WechatSpiHandler(EventInboxRepository inboxRepo) { this.inboxRepo = inboxRepo; }
    @Override public String getChannelCode() { return "WECHAT_MINI"; }

    @Override
    public boolean verifySignature(HttpServletRequest request, byte[] rawBody, ChannelAdapterConfig config) {
        try {
            // 微信验签：从 query string 取 signature + timestamp + nonce
            String signature = request.getParameter("signature");
            String timestamp = request.getParameter("timestamp");
            String nonce = request.getParameter("nonce");
            if (signature == null) return false;

            Map<String, Object> auth = config.getAuthConfig();
            String token = auth != null ? String.valueOf(auth.getOrDefault("token", "")) : "";
            // 字典排序: sha1(token + timestamp + nonce)
            String[] arr = {token, timestamp != null ? timestamp : "", nonce != null ? nonce : ""};
            Arrays.sort(arr);
            String raw = String.join("", arr);
            String computed = sha1(raw);

            return MessageDigest.isEqual(
                    computed.getBytes(StandardCharsets.UTF_8),
                    signature.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) { return false; }
    }

    @Override
    public Object handleAction(String action, String programCode, byte[] rawBody, ChannelAdapterConfig config) {
        try {
            String body = new String(rawBody, StandardCharsets.UTF_8);
            Map<String, Object> payload = body.startsWith("{") ? mapper.readValue(body, Map.class)
                    : Map.of("xml_data", body);
            String idemKey = programCode + ":WECHAT:" + action + ":" + System.currentTimeMillis();
            if (inboxRepo.findByIdempotencyKey(idemKey).isPresent())
                return wechatOk();

            inboxRepo.save(EventInbox.builder()
                    .programCode(programCode).sourceChannel("WECHAT_MINI")
                    .sourceEventId("WX-" + System.currentTimeMillis())
                    .idempotencyKey(idemKey).payloadHash(sha1(body))
                    .payload(payload).signatureVerified(true)
                    .status("RECEIVED").retryCount(0).maxRetry(3)
                    .firstSeenAt(LocalDateTime.now()).build());
            return wechatOk();
        } catch (Exception e) { throw new RuntimeException(e); }
    }

    @Override public Object buildErrorResponse(Exception e) {
        return Map.of("errcode", -1, "errmsg", e.getMessage());
    }

    private Map<String, Object> wechatOk() { return Map.of("errcode", 0, "errmsg", "ok"); }

    private String sha1(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] h = md.digest(s.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : h) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) { return ""; }
    }
}