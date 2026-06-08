package com.loyalty.saas.admin;

import com.loyalty.saas.accounting.PointGrantService;
import com.loyalty.saas.common.cache.SystemCacheService;
import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.common.dto.ApiResponse;
import com.loyalty.saas.domain.entity.*;
import com.loyalty.saas.domain.repository.PointTypeDefinitionRepository;
import com.loyalty.saas.domain.repository.ProgramRepository;
import com.loyalty.saas.domain.repository.TierDefinitionRepository;
import com.loyalty.saas.rules.AiRuleGenerationService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;
import java.util.stream.Collectors;

/**
 * 管理后台 Admin Controller — Program管理、积分类型、等级阶梯、死信重放、AI规则生成、审计。
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private static final Logger log = LoggerFactory.getLogger(AdminController.class);

    @PersistenceContext private EntityManager em;
    private final AiRuleGenerationService aiRuleGen;
    private final ProgramRepository programRepo;
    private final PointTypeDefinitionRepository pointTypeRepo;
    private final TierDefinitionRepository tierRepo;
    private final PointGrantService pointGrantService;
    private final SystemCacheService cacheService;

    public AdminController(AiRuleGenerationService aiRuleGen,
                           ProgramRepository programRepo,
                           PointTypeDefinitionRepository pointTypeRepo,
                           TierDefinitionRepository tierRepo,
                           PointGrantService pointGrantService,
                           SystemCacheService cacheService) {
        this.aiRuleGen = aiRuleGen;
        this.programRepo = programRepo;
        this.pointTypeRepo = pointTypeRepo;
        this.tierRepo = tierRepo;
        this.pointGrantService = pointGrantService;
        this.cacheService = cacheService;
    }

    @GetMapping("/cache/enums")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getEnums() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("enums", cacheService.getEnums());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/cache/program-defs")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getProgramDefs() {
        String pc = TenantContext.get();
        return ResponseEntity.ok(ApiResponse.success(cacheService.getProgramDef(pc != null ? pc : "PROG001")));
    }

    @PostMapping("/cache/refresh")
    public ResponseEntity<ApiResponse<Void>> refresh() {
        cacheService.refresh();
        return ResponseEntity.ok(ApiResponse.success("缓存已刷新", null));
    }

    // ==================== Program 管理 ====================

    @GetMapping("/programs")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listPrograms(
            @RequestParam(defaultValue = "") String q) {
        String pc = TenantContext.getRequired();
        List<Program> programs;
        if (q != null && !q.isBlank()) {
            programs = em.createQuery(
                    "SELECT p FROM Program p WHERE p.code LIKE :q OR p.name LIKE :q",
                    Program.class)
                    .setParameter("q", "%" + q + "%")
                    .getResultList();
        } else {
            programs = em.createQuery("SELECT p FROM Program p ORDER BY p.createdAt DESC",
                    Program.class).getResultList();
        }
        List<Map<String, Object>> result = programs.stream().map(p -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("programCode", p.getCode());
            m.put("displayName", p.getName());
            m.put("status", p.getStatus());
            m.put("createdAt", p.getCreatedAt() != null ? p.getCreatedAt().toString() : null);
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @PostMapping("/programs")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createProgram(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String programCode = (String) body.get("programCode");
        String displayName = (String) body.get("displayName");
        String description = (String) body.get("description");
        String status = (String) body.getOrDefault("status", "ACTIVE");

        if (programCode == null || programCode.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "programCode 不能为空"));
        }
        if (displayName == null || displayName.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "displayName 不能为空"));
        }

        // 检查是否已存在
        if (programRepo.findById(programCode).isPresent()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_DUPLICATE", "Program 已存在: " + programCode));
        }

        Program program = Program.builder()
                .code(programCode)
                .tenantId(1L) // 默认租户，后续多租户时动态获取
                .name(displayName)
                .status(status)
                .configJson(new LinkedHashMap<>())
                .createdBy(1L)
                .build();

        // 描述存入 configJson
        if (description != null && !description.isBlank()) {
            program.getConfigJson().put("description", description);
        }

        programRepo.save(program);
        log.info("[Admin] Program 创建: code={}, name={}", programCode, displayName);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("programCode", programCode);
        result.put("displayName", displayName);
        result.put("status", status);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/programs/{code}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getProgram(@PathVariable String code) {
        return programRepo.findById(code)
                .map(p -> {
                    Map<String, Object> m = new LinkedHashMap<>();
                    m.put("programCode", p.getCode());
                    m.put("displayName", p.getName());
                    m.put("status", p.getStatus());
                    m.put("description", p.getConfigJson().getOrDefault("description", ""));
                    m.put("configJson", p.getConfigJson());
                    m.put("createdAt", p.getCreatedAt() != null ? p.getCreatedAt().toString() : null);
                    return ResponseEntity.ok(ApiResponse.success(m));
                })
                .orElse(ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "Program 不存在")));
    }

    @PutMapping("/programs/{code}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateProgram(
            @PathVariable String code, @RequestBody Map<String, Object> body) {
        return programRepo.findById(code).map(program -> {
            if (body.containsKey("displayName")) program.setName((String) body.get("displayName"));
            if (body.containsKey("status")) program.setStatus((String) body.get("status"));
            if (body.containsKey("description")) {
                program.getConfigJson().put("description", body.get("description"));
            }
            // 保存积分类型
            if (body.containsKey("pointTypes")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> pts = (List<Map<String, Object>>) body.get("pointTypes");
                savePointTypes(code, pts);
            }
            // 保存等级
            if (body.containsKey("tiers")) {
                @SuppressWarnings("unchecked")
                List<Map<String, Object>> tiers = (List<Map<String, Object>>) body.get("tiers");
                saveTiers(code, tiers);
            }
            program.setUpdatedAt(LocalDateTime.now());
            programRepo.save(program);
            log.info("[Admin] Program 更新: code={}", code);
            Map<String, Object> r1 = new LinkedHashMap<>(); r1.put("programCode", code); r1.put("updated", true);
            return ResponseEntity.ok(ApiResponse.success(r1));
        }).orElse(ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "Program 不存在")));
    }

    @DeleteMapping("/programs/{code}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteProgram(@PathVariable String code) {
        return programRepo.findById(code).map(p -> {
            programRepo.delete(p);
            log.info("[Admin] Program 删除: code={}", code);
            Map<String, Object> r2 = new LinkedHashMap<>(); r2.put("programCode", code); r2.put("deleted", true);
            return ResponseEntity.ok(ApiResponse.success(r2));
        }).orElse(ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "Program 不存在")));
    }

    @PostMapping("/programs/{code}/copy")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> copyProgram(@PathVariable String code) {
        return programRepo.findById(code).map(src -> {
            Program copy = Program.builder()
                    .code(code + "-COPY-" + System.currentTimeMillis() % 10000)
                    .tenantId(src.getTenantId())
                    .name(src.getName() + " (副本)")
                    .status("DRAFT")
                    .configJson(new LinkedHashMap<>(src.getConfigJson()))
                    .build();
            programRepo.save(copy);
            log.info("[Admin] Program 复制: {} -> {}", code, copy.getCode());
            Map<String, Object> r3 = new LinkedHashMap<>(); r3.put("programCode", copy.getCode()); r3.put("copied", true);
            return ResponseEntity.ok(ApiResponse.success(r3));
        }).orElse(ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "Program 不存在")));
    }

    // ==================== 积分类型 + 等级阶梯 ====================

    @PutMapping("/tiers")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> saveTiersAndPointTypes(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();

        // 保存积分类型
        if (body.containsKey("pointTypes")) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> pts = (List<Map<String, Object>>) body.get("pointTypes");
            savePointTypes(pc, pts);
        }

        // 保存等级
        if (body.containsKey("tiers")) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> tiers = (List<Map<String, Object>>) body.get("tiers");
            saveTiers(pc, tiers);
        }

        log.info("[Admin] 积分类型/等级已保存: program={}", pc);
        Map<String, Object> saved = new LinkedHashMap<>(); saved.put("saved", true);
        return ResponseEntity.ok(ApiResponse.success(saved));
    }

    @GetMapping("/tiers")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTiersAndPointTypes() {
        String pc = TenantContext.getRequired();
        List<TierDefinition> tiers = tierRepo.findByProgramCodeOrderBySequenceAsc(pc);
        List<PointTypeDefinition> pts = pointTypeRepo.findActiveByProgramCode(pc);

        List<Map<String, Object>> tierList = tiers.stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("tierCode", t.getTierCode());
            m.put("tierName", t.getTierName());
            m.put("sequence", t.getSequence());
            if (t.getUpgradeCriteria() != null) m.put("minPoints", t.getUpgradeCriteria().get("min_points"));
            if (t.getUpgradeCriteria() != null) m.put("maxPoints", t.getUpgradeCriteria().get("max_points"));
            return m;
        }).collect(Collectors.toList());

        List<Map<String, Object>> ptList = pts.stream().map(this::pointTypeToMap).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tiers", tierList);
        result.put("pointTypes", ptList);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ==================== 授信额度管理 (Ch4.4) ====================

    @PostMapping("/members/{memberId}/credit-limit")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> setCreditLimit(
            @PathVariable Long memberId, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        BigDecimal newLimit = toBigDecimal(body.get("creditLimit"));
        pointGrantService.setCreditLimit(pc, memberId, newLimit);
        log.info("[Admin] 授信额度设置: member={}, limit={}", memberId, newLimit);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("memberId", memberId);
        r.put("creditLimit", newLimit);
        return ResponseEntity.ok(ApiResponse.success(r));
    }

    // ==================== 死信重放 ====================

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

    // ==================== AI 规则生成 ====================

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

    // ==================== 越权访问审计 ====================

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

    // ==================== 强制放行 ====================

    @PostMapping("/rules/{ruleId}/force-publish")
    public ResponseEntity<ApiResponse<Map<String, Object>>> forcePublishRule(
            @PathVariable String ruleId, @RequestBody Map<String, String> body) {
        String pc = TenantContext.getRequired();
        String reason = body.get("override_reason");
        if (reason == null || reason.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_OVERRIDE_REASON_REQUIRED",
                    "强制放行必须提供 override_reason"));
        }
        em.createNativeQuery(
                "UPDATE rule_definition SET status = 'ACTIVE', updated_at = NOW() "
                        + "WHERE program_code = ? AND rule_code = ?")
                .setParameter(1, pc).setParameter(2, ruleId).executeUpdate();

        em.createNativeQuery(
                "INSERT INTO audit_log (program_code, action, detail, created_at) VALUES (?,?,?::jsonb,?)")
                .setParameter(1, pc).setParameter(2, "FORCE_OVERRIDE")
                .setParameter(3, "{\"rule_code\":\"" + ruleId + "\",\"reason\":\"" + reason + "\"}")
                .setParameter(4, LocalDateTime.now())
                .executeUpdate();

        log.warn("[Admin] 规则强制放行: rule={}, reason={}", ruleId, reason);
        return ResponseEntity.ok(ApiResponse.success(Map.of("rule_code", ruleId, "status", "ACTIVE", "overridden", true)));
    }

    // ==================== 私有方法 ====================

    private void savePointTypes(String programCode, List<Map<String, Object>> pts) {
        for (Map<String, Object> pt : pts) {
            String typeCode = (String) pt.get("typeCode");
            if (typeCode == null || typeCode.isBlank()) continue;

            PointTypeDefinition entity = pointTypeRepo
                    .findByProgramCodeAndTypeCode(programCode, typeCode)
                    .orElse(PointTypeDefinition.builder()
                            .programCode(programCode)
                            .typeCode(typeCode)
                            .build());

            if (pt.containsKey("name")) entity.setTypeName((String) pt.get("name"));
            if (pt.containsKey("redeemable")) entity.setIsRedeemable((Boolean) pt.get("redeemable"));
            if (pt.containsKey("tierRelevant")) entity.setIsTierCalc((Boolean) pt.get("tierRelevant"));
            if (pt.containsKey("transferable")) entity.setIsTransferable((Boolean) pt.get("transferable"));
            if (pt.containsKey("allowNegative")) entity.setAllowNegative((Boolean) pt.get("allowNegative"));

            // 新增字段
            if (pt.containsKey("expiryMode")) entity.setExpiryMode((String) pt.get("expiryMode"));
            if (pt.containsKey("expiryValue")) entity.setExpiryValue(toInt(pt.get("expiryValue")));
            if (pt.containsKey("visible")) entity.setIsVisible((Boolean) pt.get("visible"));
            if (pt.containsKey("overdraftLimit")) entity.setOverdraftLimit(toBigDecimal(pt.get("overdraftLimit")));
            if (pt.containsKey("creditLimit")) entity.setCreditLimit(toBigDecimal(pt.get("creditLimit")));

            pointTypeRepo.save(entity);
        }
    }

    private void saveTiers(String programCode, List<Map<String, Object>> tiers) {
        for (Map<String, Object> t : tiers) {
            String tierCode = (String) t.get("tierCode");
            if (tierCode == null || tierCode.isBlank()) continue;

            TierDefinition tier = tierRepo.findById(tierCode)
                    .orElse(TierDefinition.builder()
                            .tierCode(tierCode)
                            .programCode(programCode)
                            .build());

            tier.setTierName((String) t.getOrDefault("tierName", tierCode));
            tier.setSequence(toInt(t.getOrDefault("sequence", (t.containsKey("sequence") ? t.get("sequence") : 99))));

            // 升级/降级标准
            Map<String, Object> upgrade = new LinkedHashMap<>();
            if (t.containsKey("minPoints")) upgrade.put("min_points", toBigDecimal(t.get("minPoints")));
            if (t.containsKey("maxPoints")) upgrade.put("max_points", toBigDecimal(t.get("maxPoints")));
            if (!upgrade.isEmpty()) tier.setUpgradeCriteria(upgrade);

            tier.setUpdatedAt(LocalDateTime.now());
            tierRepo.save(tier);
        }
    }

    private Map<String, Object> pointTypeToMap(PointTypeDefinition pt) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("typeCode", pt.getTypeCode());
        m.put("name", pt.getTypeName());
        m.put("redeemable", pt.getIsRedeemable());
        m.put("tierRelevant", pt.getIsTierCalc());
        m.put("transferable", pt.getIsTransferable());
        m.put("allowNegative", pt.getAllowNegative());
        m.put("expiryMode", pt.getExpiryMode());
        m.put("expiryValue", pt.getExpiryValue());
        m.put("visible", pt.getIsVisible());
        m.put("overdraftLimit", pt.getOverdraftLimit());
        m.put("creditLimit", pt.getCreditLimit());
        m.put("status", pt.getStatus());
        return m;
    }

    private int toInt(Object v) {
        if (v instanceof Number) return ((Number) v).intValue();
        if (v instanceof String) try { return Integer.parseInt((String) v); } catch (NumberFormatException e) { return 0; }
        return 0;
    }

    private BigDecimal toBigDecimal(Object v) {
        if (v instanceof BigDecimal) return (BigDecimal) v;
        if (v instanceof Number) return BigDecimal.valueOf(((Number) v).doubleValue());
        if (v instanceof String) try { return new BigDecimal((String) v); } catch (NumberFormatException e) { return BigDecimal.ZERO; }
        return BigDecimal.ZERO;
    }
}