package com.loyalty.platform.campaign.webhook;

import com.fasterxml.jackson.databind.JsonNode;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.CampaignWebhookLog;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/campaign/webhook")
public class WebhookController {

    private final WebhookProcessor processor;

    public WebhookController(WebhookProcessor processor) {
        this.processor = processor;
    }

    /** 统一 Webhook 入口 */
    @PostMapping("/{programCode}/{eventType}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> receive(
            @PathVariable String programCode,
            @PathVariable String eventType,
            @RequestBody JsonNode body,
            HttpServletRequest request) {
        String webhookId = "wh_" + UUID.randomUUID().toString().replace("-", "");
        Map<String, String> headers = new HashMap<>();
        headers.put("X-API-Key", request.getHeader("X-API-Key"));
        headers.put("X-Campaign-Signature", request.getHeader("X-Campaign-Signature"));
        headers.put("X-Timestamp", request.getHeader("X-Timestamp"));
        headers.put("X-Request-Id", request.getHeader("X-Request-Id"));

        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null) ip = request.getRemoteAddr();

        processor.processAsync(programCode, eventType, body, headers, ip,
                request.getRequestURI(), request.getMethod(), webhookId);

        Map<String, Object> resp = new LinkedHashMap<>();
        resp.put("status", "accepted");
        resp.put("webhookId", webhookId);
        resp.put("message", "Event accepted for processing");
        return ResponseEntity.accepted().body(ApiResponse.success(resp));
    }

    /** Webhook 日志查询 */
    @GetMapping("/logs")
    public ResponseEntity<ApiResponse<List<CampaignWebhookLog>>> getLogs(
            @RequestParam String programCode) {
        return ResponseEntity.ok(ApiResponse.success(processor.getLogs(programCode)));
    }
}
