package com.loyalty.platform.campaign.consent;

import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.ConsentChangeLog;
import com.loyalty.platform.domain.entity.campaign.GdprRequest;
import com.loyalty.platform.domain.entity.campaign.UserConsent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalTime;
import java.util.*;

/**
 * 用户偏好管理 REST API。
 *
 * <p>提供偏好查询/更新、退订链接处理、GDPR 删除请求等端点。
 */
@RestController
@RequestMapping("/api/campaign/consent")
public class ConsentController {

    private static final Logger log = LoggerFactory.getLogger(ConsentController.class);

    private final ConsentService consentService;

    public ConsentController(ConsentService consentService) {
        this.consentService = consentService;
    }

    // ========================================================================
    // 偏好查询
    // ========================================================================

    /** 获取用户偏好 */
    @GetMapping("/{memberId}")
    public ResponseEntity<ApiResponse<UserConsent>> getConsent(@PathVariable String memberId) {
        UserConsent consent = consentService.getConsent(memberId);
        return ResponseEntity.ok(ApiResponse.success(consent));
    }

    /** 获取用户变更日志 */
    @GetMapping("/{memberId}/logs")
    public ResponseEntity<ApiResponse<List<ConsentChangeLog>>> getChangeLogs(
            @PathVariable String memberId) {
        return ResponseEntity.ok(ApiResponse.success(consentService.getChangeLogs(memberId)));
    }

    // ========================================================================
    // 偏好更新
    // ========================================================================

    /** 更新用户偏好（批量） */
    @PutMapping("/{memberId}")
    public ResponseEntity<ApiResponse<UserConsent>> updatePreference(
            @PathVariable String memberId,
            @RequestBody UpdatePreferenceRequest request) {

        String source = request.source != null ? request.source : "WEB_UI";

        // 渠道偏好
        if (request.channelOptIns != null) {
            for (Map.Entry<String, Boolean> entry : request.channelOptIns.entrySet()) {
                consentService.updateChannelOptIn(memberId, entry.getKey(), entry.getValue(), source);
            }
        }
        // 品类偏好
        if (request.categoryPreferences != null) {
            consentService.updateCategoryPreference(
                    memberId,
                    request.categoryPreferences.getIncluded(),
                    request.categoryPreferences.getExcluded(),
                    source);
        }
        // 静默时段
        if (request.quietHours != null) {
            consentService.updateQuietHours(
                    memberId,
                    request.quietHours.isEnabled(),
                    request.quietHours.getStart(),
                    request.quietHours.getEnd(),
                    request.quietHours.getTimezone(),
                    source);
        }
        // 全局退订
        if (Boolean.TRUE.equals(request.globalUnsubscribe)) {
            consentService.updateGlobalUnsubscribe(memberId,
                    request.unsubscribeReason != null ? request.unsubscribeReason : "USER_REQUEST",
                    request.unsubscribeChannel, source);
        }
        // 重新订阅
        if (Boolean.FALSE.equals(request.globalUnsubscribe) && request.globalUnsubscribe != null) {
            consentService.reSubscribe(memberId, source);
        }

        UserConsent updated = consentService.getConsent(memberId);
        return ResponseEntity.ok(ApiResponse.success(updated));
    }

    // ========================================================================
    // 退订链接处理（邮件中的退订链接）
    // ========================================================================

    /**
     * GET /api/campaign/consent/unsubscribe?token={token}
     * <p>处理邮件中的退订链接，解析 token 后自动更新偏好。
     */
    @GetMapping("/unsubscribe")
    public ResponseEntity<ApiResponse<Map<String, String>>> handleUnsubscribe(
            @RequestParam String token) {
        // 简化实现：token 格式为 base64(memberId:type:channel)
        try {
            String decoded = new String(Base64.getDecoder().decode(token));
            String[] parts = decoded.split(":");
            String memberId = parts[0];
            String type = parts.length > 1 ? parts[1] : "GLOBAL";
            String channel = parts.length > 2 ? parts[2] : "EMAIL";

            if ("GLOBAL".equalsIgnoreCase(type)) {
                consentService.updateGlobalUnsubscribe(memberId, "CLICKED_UNSUBSCRIBE_LINK",
                        channel, "EMAIL_LINK");
            } else {
                consentService.updateChannelOptIn(memberId, channel, false, "EMAIL_LINK");
            }

            return ResponseEntity.ok(ApiResponse.success(Map.of(
                    "message", "退订成功",
                    "memberId", memberId,
                    "type", type
            )));
        } catch (Exception e) {
            return ResponseEntity.badRequest().body(
                    ApiResponse.error("INVALID_TOKEN", "无效的退订令牌"));
        }
    }

    // ========================================================================
    // 检查发送权限（内部服务调用 + 调试）
    // ========================================================================

    /** 检查是否可以发送 */
    @GetMapping("/check")
    public ResponseEntity<ApiResponse<ConsentService.SendCheckResult>> checkSend(
            @RequestParam String memberId,
            @RequestParam(defaultValue = "EMAIL") String channel,
            @RequestParam(required = false) String category) {
        return ResponseEntity.ok(ApiResponse.success(
                consentService.canSend(memberId, channel, category)));
    }

    // ========================================================================
    // GDPR
    // ========================================================================

    /** 提交 GDPR 删除请求 */
    @PostMapping("/gdpr/delete")
    public ResponseEntity<ApiResponse<Map<String, Object>>> submitGdprDelete(
            @RequestBody GdprDeleteRequest request) {
        GdprRequest gdpr = consentService.submitGdprRequest(
                request.memberId, request.programCode,
                "DELETE", request.reason, "API");
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "requestId", gdpr.getId(),
                "status", gdpr.getStatus(),
                "message", "Data deletion request accepted"
        )));
    }

    /** 获取 GDPR 请求列表 */
    @GetMapping("/gdpr/requests/{memberId}")
    public ResponseEntity<ApiResponse<List<GdprRequest>>> getGdprRequests(
            @PathVariable String memberId) {
        return ResponseEntity.ok(ApiResponse.success(consentService.getGdprRequests(memberId)));
    }

    /** 获取待处理 GDPR 请求数 */
    @GetMapping("/gdpr/pending-count")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getPendingGdprCount() {
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "pendingCount", consentService.getPendingGdprCount()
        )));
    }

    // ========================================================================
    // Request DTOs
    // ========================================================================

    @lombok.Data
    public static class UpdatePreferenceRequest {
        private Map<String, Boolean> channelOptIns;
        private CategoryPreference categoryPreferences;
        private QuietHours quietHours;
        private Boolean globalUnsubscribe;
        private String unsubscribeReason;
        private String unsubscribeChannel;
        private String source;
    }

    @lombok.Data
    public static class CategoryPreference {
        private List<String> included;
        private List<String> excluded;
    }

    @lombok.Data
    public static class QuietHours {
        private boolean enabled;
        private LocalTime start;
        private LocalTime end;
        private String timezone;
    }

    @lombok.Data
    public static class GdprDeleteRequest {
        private String memberId;
        private String programCode;
        private String reason;
    }
}
