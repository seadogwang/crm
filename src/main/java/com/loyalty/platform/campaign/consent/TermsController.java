package com.loyalty.platform.campaign.consent;

import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.TermsAcceptance;
import com.loyalty.platform.domain.entity.campaign.TermsMaster;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 法律/服务同意（Terms & Conditions）REST API。
 *
 * <p>提供会员端（查看/接受条款）和管理员端（版本管理/审计）的端点。
 */
@RestController
@RequestMapping("/api/campaign/terms")
public class TermsController {

    private static final Logger log = LoggerFactory.getLogger(TermsController.class);

    private final TermsService termsService;

    public TermsController(TermsService termsService) {
        this.termsService = termsService;
    }

    // ========================================================================
    // 会员端
    // ========================================================================

    /** 检查会员是否已接受最新条款 */
    @GetMapping("/check")
    public ResponseEntity<ApiResponse<Map<String, Object>>> checkTerms(
            @RequestParam String memberId,
            @RequestParam(defaultValue = "CHARTER") String termsType) {
        boolean accepted = termsService.isLatestTermsAccepted(memberId, termsType);
        TermsMaster active = termsService.getActiveTerms(termsType);
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "accepted", accepted,
                "latestVersion", active != null ? active.getTermsVersion() : null,
                "termsType", termsType
        )));
    }

    /** 接受条款 */
    @PostMapping("/accept")
    public ResponseEntity<ApiResponse<TermsAcceptance>> acceptTerms(
            @RequestBody AcceptTermsRequest request,
            HttpServletRequest httpRequest) {
        String ip = getClientIp(httpRequest);
        String userAgent = httpRequest.getHeader("User-Agent");
        TermsAcceptance acceptance = termsService.acceptTerms(
                request.getMemberId(),
                request.getTermsType() != null ? request.getTermsType() : "CHARTER",
                request.getSource() != null ? request.getSource() : "WEB_APP",
                ip,
                userAgent);
        return ResponseEntity.ok(ApiResponse.success(acceptance));
    }

    /** 获取当前生效的条款内容（用于前端展示） */
    @GetMapping("/active")
    public ResponseEntity<ApiResponse<TermsMaster>> getActiveTerms(
            @RequestParam(defaultValue = "CHARTER") String termsType) {
        TermsMaster master = termsService.getActiveTerms(termsType);
        return ResponseEntity.ok(ApiResponse.success(master));
    }

    /** 获取会员的接受历史 */
    @GetMapping("/history/{memberId}")
    public ResponseEntity<ApiResponse<List<TermsAcceptance>>> getHistory(
            @PathVariable String memberId) {
        return ResponseEntity.ok(ApiResponse.success(termsService.getAcceptanceHistory(memberId)));
    }

    // ========================================================================
    // 管理员端
    // ========================================================================

    /** 查询条款版本列表 */
    @GetMapping("/admin/versions")
    public ResponseEntity<ApiResponse<List<TermsMaster>>> listVersions(
            @RequestParam(required = false) String termsType) {
        return ResponseEntity.ok(ApiResponse.success(termsService.getVersions(termsType)));
    }

    /** 创建新条款版本 */
    @PostMapping("/admin/versions")
    public ResponseEntity<ApiResponse<TermsMaster>> createVersion(
            @RequestBody TermsMaster termsMaster) {
        TermsMaster created = termsService.createTermsVersion(termsMaster);
        return ResponseEntity.ok(ApiResponse.success(created));
    }

    /** 停用条款版本 */
    @PostMapping("/admin/versions/{id}/deactivate")
    public ResponseEntity<ApiResponse<Void>> deactivateVersion(@PathVariable Long id) {
        termsService.deactivateTerms(id);
        return ResponseEntity.ok(ApiResponse.success(null));
    }

    /** 查询接受记录（管理员审计） */
    @GetMapping("/admin/acceptances")
    public ResponseEntity<ApiResponse<List<TermsAcceptance>>> getAcceptances(
            @RequestParam String termsType,
            @RequestParam String termsVersion) {
        return ResponseEntity.ok(ApiResponse.success(
                termsService.getAcceptanceRecords(termsType, termsVersion)));
    }

    // ========================================================================
    // 内部工具
    // ========================================================================

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    // ========================================================================
    // Request DTO
    // ========================================================================

    @lombok.Data
    public static class AcceptTermsRequest {
        private String memberId;
        private String termsType;
        private String source;
    }
}