package com.loyalty.platform.campaign.sharing;

import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/campaign/sharing")
public class SharingController {

    private final SharingPolicyService sharingService;

    public SharingController(SharingPolicyService sharingService) {
        this.sharingService = sharingService;
    }

    /** 获取可访问Program列表 */
    @GetMapping("/accessible-programs")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getAccessiblePrograms(
            @RequestParam String programCode,
            @RequestParam(defaultValue = "ASSET") String resourceType) {
        Set<String> programs = sharingService.getAccessiblePrograms(programCode, resourceType);
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "sourceProgram", programCode,
                "accessiblePrograms", programs,
                "resourceType", resourceType)));
    }

    /** 获取Program的共享策略 */
    @GetMapping("/policies/{programCode}")
    public ResponseEntity<ApiResponse<List<SharingPolicy>>> getPolicies(
            @PathVariable String programCode) {
        return ResponseEntity.ok(ApiResponse.success(sharingService.getPolicies(programCode)));
    }

    /** 创建共享策略 */
    @PostMapping("/policy")
    public ResponseEntity<ApiResponse<SharingPolicy>> createPolicy(
            @RequestBody SharingPolicy policy) {
        return ResponseEntity.ok(ApiResponse.success(sharingService.savePolicy(policy)));
    }

    /** 检查黑名单 */
    @GetMapping("/blacklist/check")
    public ResponseEntity<ApiResponse<Map<String, Object>>> checkBlacklist(
            @RequestParam String memberId) {
        return ResponseEntity.ok(ApiResponse.success(Map.of(
                "memberId", memberId,
                "isBlacklisted", sharingService.isGloballyBlacklisted(memberId))));
    }

    /** 添加黑名单 */
    @PostMapping("/blacklist")
    public ResponseEntity<ApiResponse<GlobalBlacklist>> addBlacklist(
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(ApiResponse.success(sharingService.addBlacklist(
                body.get("memberId"), body.get("programCode"), body.get("reason"))));
    }

    /** 获取Campaign的跨Program关联 */
    @GetMapping("/relations/{planId}")
    public ResponseEntity<ApiResponse<List<CrossProgramRelation>>> getRelations(
            @PathVariable String planId) {
        return ResponseEntity.ok(ApiResponse.success(sharingService.getRelations(planId)));
    }
}
