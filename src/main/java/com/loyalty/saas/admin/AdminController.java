package com.loyalty.saas.admin;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.common.dto.ApiResponse;
import com.loyalty.saas.domain.entity.EventInbox;
import com.loyalty.saas.rules.AiRuleGenerationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 管理后台 Admin Controller — 死信重放、AI 规则生成、越权审计查询。
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);

    @PersistenceContext private EntityManager em;
    private final AiRuleGenerationService aiRuleGen;

    public AdminController(AiRuleGenerationService aiRuleGen) { this.aiRuleGen = aiRuleGen; }

    // ========== Ch7.5.3 死信重放 ==========

    @PostMapping("/events/{id}/replay")
    public ResponseEntity<ApiResponse<Map<String, Object>>> replayDeadEvent(@PathVariable Long id) {
        String pc = TenantContext.getRequired();
        EventInbox event = em.find(EventInbox.class, id);
        if (event == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "事件不存在"));
        }
        if (!"DEAD".equals(event.getStatus()) && !"FAILED".equals(event.getStatus())) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID_STATUS", "仅死信或失败事件可重放"));
        }
        event.setStatus("RECEIVED");
        event.setRetryCount(0);
        event.setErrorMessage(null);
        event.setNextRetryAt(null);
        em.merge(event);
        log.info("[Admin] 死信重放: id={}, program={}", id, pc);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", id, "new_status", "RECEIVED")));
    }

    // ========== Ch6.2 AI 规则生成 ==========

    @PostMapping("/rules/generate")
    public ResponseEntity<ApiResponse<AiRuleGenerationService.GenerateResult>> generateRule(
            @RequestBody Map<String, String> body) {
        String programCode = TenantContext.getRequired();
        String prompt = body.get("prompt");
        String apiKey = body.get("api_key");
        if (prompt == null || prompt.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_EMPTY_PROMPT", "自然语言描述不能为空"));
        }
        var result = aiRuleGen.generate(new AiRuleGenerationService.GenerateRequest(programCode, prompt, apiKey));
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ========== Ch9.3 越权访问审计 ==========

    @GetMapping("/audit/unauthorized-access")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getUnauthorizedAccessLogs(
            @RequestParam(defaultValue = "50") int limit) {
        String pc = TenantContext.getRequired();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> logs = (List<Map<String, Object>>) (List<?>) em.createNativeQuery(
                "SELECT id, program_code, action, request_id, created_at "
                        + "FROM audit_log WHERE program_code = ? AND action = 'UNAUTHORIZED_ACCESS' "
                        + "ORDER BY created_at DESC LIMIT ?")
                .setParameter(1, pc).setParameter(2, limit)
                .getResultList();
        return ResponseEntity.ok(ApiResponse.success(logs));
    }

    // ========== Ch6.4 强制放行 ==========

    @PostMapping("/rules/{ruleId}/force-publish")
    public ResponseEntity<ApiResponse<Map<String, Object>>> forcePublishRule(
            @PathVariable String ruleId, @RequestBody Map<String, String> body) {
        String pc = TenantContext.getRequired();
        String reason = body.get("override_reason");
        if (reason == null || reason.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_OVERRIDE_REASON_REQUIRED",
                    "强制放行必须提供 override_reason"));
        }
        // 标记规则为 ACTIVE 并记录强制放行审计
        em.createNativeQuery(
                "UPDATE rule_definition SET status = 'ACTIVE', updated_at = NOW() "
                        + "WHERE program_code = ? AND rule_code = ?")
                .setParameter(1, pc).setParameter(2, ruleId).executeUpdate();

        // 审计日志
        em.createNativeQuery(
                "INSERT INTO audit_log (program_code, action, detail, created_at) VALUES (?,?,?::jsonb,?)")
                .setParameter(1, pc).setParameter(2, "FORCE_OVERRIDE")
                .setParameter(3, "{\"rule_code\":\"" + ruleId + "\",\"reason\":\"" + reason + "\"}")
                .setParameter(4, LocalDateTime.now())
                .executeUpdate();

        log.warn("[Admin] 规则强制放行: rule={}, reason={}", ruleId, reason);
        return ResponseEntity.ok(ApiResponse.success(Map.of("rule_code", ruleId, "status", "ACTIVE", "overridden", true)));
    }
}