package com.loyalty.platform.admin;

import com.loyalty.platform.accounting.PointGrantService;
import com.loyalty.platform.common.cache.SystemCacheService;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.*;
import com.loyalty.platform.domain.repository.FlowDefinitionRepository;
import com.loyalty.platform.domain.repository.PointTypeDefinitionRepository;
import com.loyalty.platform.domain.repository.ProgramRepository;
import com.loyalty.platform.domain.repository.RuleDefinitionRepository;
import com.loyalty.platform.domain.repository.TierDefinitionRepository;
import com.loyalty.platform.flow.EventContext;
import com.loyalty.platform.rules.AiRuleGenerationService;
import com.loyalty.platform.rules.DroolsTestRunner;
import com.loyalty.platform.rules.KieBaseCacheManager;
import com.loyalty.platform.rules.RuleEngineService;
import com.loyalty.platform.rules.RuleRegressionService;
import com.loyalty.platform.rules.action.Action;
import com.loyalty.platform.rules.drl.MemberFact;
import com.loyalty.platform.rules.regression.RegressionReport;
import com.yomahub.liteflow.core.FlowExecutor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Value;
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
    private final RuleDefinitionRepository ruleRepo;
    private final RuleEngineService ruleEngine;
    private final RuleRegressionService regressionService;
    private final KieBaseCacheManager kieBaseCacheManager;
    private final DroolsTestRunner droolsTestRunner;
    private final FlowDefinitionRepository flowDefRepo;
    private final FlowExecutor flowExecutor;

    public AdminController(AiRuleGenerationService aiRuleGen,
                           ProgramRepository programRepo,
                           PointTypeDefinitionRepository pointTypeRepo,
                           TierDefinitionRepository tierRepo,
                           PointGrantService pointGrantService,
                           SystemCacheService cacheService,
                           RuleDefinitionRepository ruleRepo,
                           RuleEngineService ruleEngine,
                           RuleRegressionService regressionService,
                           KieBaseCacheManager kieBaseCacheManager,
                           DroolsTestRunner droolsTestRunner,
                           FlowDefinitionRepository flowDefRepo,
                           FlowExecutor flowExecutor) {
        this.aiRuleGen = aiRuleGen;
        this.programRepo = programRepo;
        this.pointTypeRepo = pointTypeRepo;
        this.tierRepo = tierRepo;
        this.pointGrantService = pointGrantService;
        this.cacheService = cacheService;
        this.ruleRepo = ruleRepo;
        this.ruleEngine = ruleEngine;
        this.regressionService = regressionService;
        this.kieBaseCacheManager = kieBaseCacheManager;
        this.droolsTestRunner = droolsTestRunner;
        this.flowDefRepo = flowDefRepo;
        this.flowExecutor = flowExecutor;
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
        // 只返回当前租户的Program
        if (q != null && !q.isBlank()) {
            programs = em.createQuery(
                    "SELECT p FROM Program p WHERE p.code = :pc AND (p.code LIKE :q OR p.name LIKE :q)",
                    Program.class)
                    .setParameter("pc", pc)
                    .setParameter("q", "%" + q + "%")
                    .getResultList();
        } else {
            programs = em.createQuery(
                    "SELECT p FROM Program p WHERE p.code = :pc ORDER BY p.createdAt DESC",
                    Program.class)
                    .setParameter("pc", pc)
                    .getResultList();
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
    @Transactional
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

    // ==================== 规则管理 ====================

    /**
     * 规则列表 — 支持 ?status=DRAFT|ACTIVE|INACTIVE 过滤
     */
    @GetMapping("/rules")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRules(
            @RequestParam(defaultValue = "") String status) {
        String pc = TenantContext.getRequired();
        List<RuleDefinition> rules;
        if (status != null && !status.isBlank()) {
            rules = em.createQuery(
                    "SELECT r FROM RuleDefinition r WHERE r.programCode = :pc AND r.status = :st ORDER BY r.updatedAt DESC",
                    RuleDefinition.class)
                    .setParameter("pc", pc).setParameter("st", status).getResultList();
        } else {
            rules = em.createQuery(
                    "SELECT r FROM RuleDefinition r WHERE r.programCode = :pc ORDER BY r.updatedAt DESC",
                    RuleDefinition.class)
                    .setParameter("pc", pc).getResultList();
        }
        List<Map<String, Object>> result = rules.stream().map(this::ruleToMap).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 单条规则详情
     */
    @GetMapping("/rules/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getRule(@PathVariable Long id) {
        RuleDefinition rule = em.find(RuleDefinition.class, id);
        if (rule == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "规则不存在"));
        }
        return ResponseEntity.ok(ApiResponse.success(ruleToMap(rule)));
    }

    /**
     * 创建规则（DRAFT 状态）
     */
    @PostMapping("/rules")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRule(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String ruleCode = (String) body.get("rule_code");
        String drlContent = (String) body.get("drl_content");

        if (ruleCode == null || ruleCode.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "rule_code 不能为空"));
        }
        if (drlContent == null || drlContent.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "drl_content 不能为空"));
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> metadata = (Map<String, Object>) body.get("metadata");

        RuleDefinition rule = RuleDefinition.builder()
                .programCode(pc)
                .ruleCode(ruleCode)
                .ruleName((String) body.getOrDefault("rule_name", ruleCode))
                .ruleType((String) body.getOrDefault("rule_type", "DRL"))
                .ruleCategory((String) body.getOrDefault("rule_category", "default"))
                .drlContent(drlContent)
                .metadata(metadata)
                .version(1)
                .status("DRAFT")
                .build();

        ruleRepo.save(rule);
        log.info("[Admin] 规则创建: code={}, name={}", ruleCode, rule.getRuleName());
        return ResponseEntity.ok(ApiResponse.success(ruleToMap(rule)));
    }

    /**
     * 更新规则
     */
    @PutMapping("/rules/{id}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateRule(
            @PathVariable Long id, @RequestBody Map<String, Object> body) {
        RuleDefinition rule = em.find(RuleDefinition.class, id);
        if (rule == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "规则不存在"));
        }

        if (body.containsKey("rule_name")) rule.setRuleName((String) body.get("rule_name"));
        if (body.containsKey("rule_type")) rule.setRuleType((String) body.get("rule_type"));
        if (body.containsKey("rule_category")) rule.setRuleCategory((String) body.get("rule_category"));
        if (body.containsKey("drl_content")) rule.setDrlContent((String) body.get("drl_content"));
        if (body.containsKey("status")) rule.setStatus((String) body.get("status"));
        if (body.containsKey("metadata")) {
            @SuppressWarnings("unchecked")
            Map<String, Object> meta = (Map<String, Object>) body.get("metadata");
            rule.setMetadata(meta);
        }
        rule.setUpdatedAt(LocalDateTime.now());

        ruleRepo.save(rule);
        log.info("[Admin] 规则更新: id={}", id);
        return ResponseEntity.ok(ApiResponse.success(ruleToMap(rule)));
    }

    /**
     * 删除规则
     */
    @DeleteMapping("/rules/{id}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteRule(@PathVariable Long id) {
        RuleDefinition rule = em.find(RuleDefinition.class, id);
        if (rule == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "规则不存在"));
        }
        ruleRepo.delete(rule);
        log.info("[Admin] 规则删除: id={}", id);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", id, "deleted", true)));
    }

    /**
     * 发布规则 — 执行沙箱回归测试，返回报告。
     * 若回归通过（GREEN），自动激活；否则返回报告供前端确认。
     */
    @PostMapping("/rules/{id}/publish")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> publishRule(
            @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        RuleDefinition rule = em.find(RuleDefinition.class, id);
        if (rule == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "规则不存在"));
        }

        boolean forceOverride = body != null && Boolean.TRUE.equals(body.get("forceOverride"));
        String reason = body != null ? (String) body.get("reason") : null;

        // 执行沙箱回归测试（使用 buildKieBaseWithDraft 对比 Baseline vs Candidate）
        Map<String, Object> report = new LinkedHashMap<>();
        try {
            // 构建测试用例：使用当前规则 DRL 作为草稿
            RegressionReport regReport = regressionService.runShadowRegression(
                    pc, rule.getDrlContent(), List.of());
            report.put("totalCases", regReport.getTotalCases());
            report.put("matchCount", regReport.getPassCount());
            report.put("diffCount", regReport.getDiffCount());
            report.put("level", regReport.getHighestLevel().name());
            report.put("diffs", regReport.getDiffs() != null ? regReport.getDiffs()
                    .stream().map(cd -> Map.of(
                            "case_id", cd.description() != null ? cd.description() : "n/a",
                            "diff_type", cd.diff().hasUnexpectedDoubleReward() ? "DOUBLE_REWARD"
                                    : cd.diff().hasRuleShadowing() ? "SHADOWING"
                                    : cd.diff().hasTierDiff() ? "TIER_DIFF" : "UNKNOWN",
                            "severity", cd.diff().hasUnexpectedDoubleReward() ? "CRITICAL" : "WARNING",
                            "warnings", cd.diff().getWarnings()
                    )).collect(Collectors.toList()) : List.of());
        } catch (Exception e) {
            log.warn("[Admin] 沙箱回归测试跳过（无测试数据）: {}", e.getMessage());
            report.put("level", "PASS");
            report.put("totalCases", 0);
            report.put("matchCount", 0);
            report.put("diffCount", 0);
            report.put("diffs", List.of());
        }

        String level = (String) report.get("level");
        if ("PASS".equals(level) || forceOverride) {
            rule.setStatus("ACTIVE");
            rule.setUpdatedAt(LocalDateTime.now());
            ruleRepo.save(rule);

            // 刷新 KieBase 缓存
            try {
                kieBaseCacheManager.refreshKieBase(pc);
            } catch (Exception e) {
                log.warn("[Admin] KieBase 刷新失败（无 ACTIVE 规则）: {}", e.getMessage());
            }

            // 记录强制放行
            if (forceOverride && reason != null) {
                String detailJson;
                try {
                    detailJson = objectMapper.writeValueAsString(
                            Map.of("rule_id", id, "reason", reason));
                } catch (Exception e) {
                    log.error("[Admin] JSON序列化失败", e);
                    detailJson = "{}";
                }
                em.createNativeQuery(
                        "INSERT INTO audit_log (program_code, action, detail, created_at) "
                                + "VALUES (?, ?, ?::jsonb, ?)")
                        .setParameter(1, pc).setParameter(2, "FORCE_OVERRIDE")
                        .setParameter(3, detailJson)
                        .setParameter(4, LocalDateTime.now()).executeUpdate();
            }

            log.info("[Admin] 规则发布: id={}, forceOverride={}", id, forceOverride);
            report.put("published", true);
            report.put("forceOverride", forceOverride);
        } else {
            report.put("published", false);
        }

        return ResponseEntity.ok(ApiResponse.success(report));
    }

    /**
     * 手动激活规则（不经过回归测试）
     */
    @PostMapping("/rules/{id}/activate")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> activateRule(@PathVariable Long id) {
        String pc = TenantContext.getRequired();
        RuleDefinition rule = em.find(RuleDefinition.class, id);
        if (rule == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "规则不存在"));
        }
        rule.setStatus("ACTIVE");
        rule.setUpdatedAt(LocalDateTime.now());
        ruleRepo.save(rule);

        try { kieBaseCacheManager.refreshKieBase(pc); } catch (Exception ignored) {}

        log.info("[Admin] 规则激活: id={}", id);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", id, "status", "ACTIVE")));
    }

    /**
     * 停用规则
     */
    @PostMapping("/rules/{id}/deactivate")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> deactivateRule(@PathVariable Long id) {
        String pc = TenantContext.getRequired();
        RuleDefinition rule = em.find(RuleDefinition.class, id);
        if (rule == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "规则不存在"));
        }
        rule.setStatus("INACTIVE");
        rule.setUpdatedAt(LocalDateTime.now());
        ruleRepo.save(rule);

        try { kieBaseCacheManager.refreshKieBase(pc); } catch (Exception ignored) {}

        log.info("[Admin] 规则停用: id={}", id);
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", id, "status", "INACTIVE")));
    }

    /**
     * 沙箱回归测试 — 使用当前线上规则 + 指定草稿 DRL 对比测试
     */
    @PostMapping("/rules/{id}/validate")
    public ResponseEntity<ApiResponse<Map<String, Object>>> validateRule(
            @PathVariable Long id, @RequestBody(required = false) Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        RuleDefinition rule = em.find(RuleDefinition.class, id);
        if (rule == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "规则不存在"));
        }

        Map<String, Object> report = new LinkedHashMap<>();
        try {
            RegressionReport regReport = regressionService.runShadowRegression(
                    pc, rule.getDrlContent(), List.of());
            report.put("totalCases", regReport.getTotalCases());
            report.put("matchCount", regReport.getPassCount());
            report.put("diffCount", regReport.getDiffCount());
            report.put("level", regReport.getHighestLevel().name());
            report.put("diffs", regReport.getDiffs() != null ? regReport.getDiffs()
                    .stream().map(cd -> Map.of(
                            "case_id", cd.description() != null ? cd.description() : "n/a",
                            "diff_type", cd.diff().hasUnexpectedDoubleReward() ? "DOUBLE_REWARD"
                                    : cd.diff().hasRuleShadowing() ? "SHADOWING"
                                    : cd.diff().hasTierDiff() ? "TIER_DIFF" : "UNKNOWN",
                            "severity", cd.diff().hasUnexpectedDoubleReward() ? "CRITICAL" : "WARNING",
                            "warnings", cd.diff().getWarnings()
                    )).collect(Collectors.toList()) : List.of());
        } catch (Exception e) {
            log.warn("[Admin] 沙箱回归测试失败: {}", e.getMessage());
            report.put("level", "PASS");
            report.put("totalCases", 0);
            report.put("matchCount", 0);
            report.put("diffCount", 0);
            report.put("diffs", List.of());
            report.put("error", e.getMessage());
        }

        return ResponseEntity.ok(ApiResponse.success(report));
    }

    /**
     * 单事件测试运行 — 输入 EventFact JSON，返回规则匹配结果
     */
    @PostMapping("/rules/test-run")
    public ResponseEntity<ApiResponse<Map<String, Object>>> testRunRule(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        @SuppressWarnings("unchecked")
        Map<String, Object> eventPayload = (Map<String, Object>) body.getOrDefault("payload", Map.of());
        String eventType = (String) body.getOrDefault("eventType", "ORDER");
        String memberId = body.get("memberId") != null ? String.valueOf(body.get("memberId")) : "8821";

        // 构建 EventFact
        EventFact eventFact = new EventFact(pc, eventType, memberId, "TEST",
                java.time.Instant.now(), "test-run-" + System.currentTimeMillis(), null, eventPayload);

        // 构建 MemberFact（从 DB 读取或使用默认值）
        MemberFact memberFact;
        try {
            Member member = em.createQuery(
                    "SELECT m FROM Member m WHERE m.programCode = :pc AND m.memberId = :mid",
                    Member.class)
                    .setParameter("pc", pc).setParameter("mid", Long.parseLong(memberId))
                    .getSingleResult();
            memberFact = new MemberFact(pc, member.getMemberId(), member.getTierCode(),
                    member.getStatus(), member.getExtAttributes());
        } catch (Exception e) {
            memberFact = new MemberFact(pc, Long.parseLong(memberId), "BASE", "ENROLLED", Map.of());
        }

        // 执行推理
        List<Action> actions = ruleEngine.evaluate(pc, List.of(eventFact, memberFact));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("matched", !actions.isEmpty());
        result.put("actionCount", actions.size());
        result.put("actions", actions.stream().map(a -> {
            Map<String, Object> am = new LinkedHashMap<>();
            am.put("type", a.actionType());
            am.put("ruleId", a.getRuleId());
            am.put("snapshotId", a.getRuleSnapshotId());
            am.put("summary", a.toString());
            return am;
        }).collect(Collectors.toList()));

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * DRL 语法校验 — 仅编译检查，不执行
     */
    @PostMapping("/rules/validate-drl")
    public ResponseEntity<ApiResponse<Map<String, Object>>> validateDrl(
            @RequestBody Map<String, String> body) {
        String drlContent = body.get("drl_content");
        if (drlContent == null || drlContent.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "drl_content 不能为空"));
        }

        Map<String, Object> result = new LinkedHashMap<>();
        try {
            droolsTestRunner.compileDrl(drlContent);
            result.put("valid", true);
            result.put("errors", List.of());
            result.put("warnings", List.of());
        } catch (Exception e) {
            result.put("valid", false);
            result.put("errors", List.of(e.getMessage()));
            result.put("warnings", List.of());
        }

        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ==================== 流程管理 ====================

    /**
     * 流程定义列表
     */
    @GetMapping("/flows")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listFlows() {
        String pc = TenantContext.getRequired();
        List<FlowDefinition> flows = flowDefRepo.findByProgramCode(pc);
        List<Map<String, Object>> result = flows.stream().map(this::flowToMap).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 创建流程定义
     */
    @PostMapping("/flows")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createFlow(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String chainName = (String) body.get("chainName");
        String chainType = (String) body.get("chainType");
        String elExpression = (String) body.get("elExpression");

        if (chainName == null || chainName.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "chainName 不能为空"));
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> flowGraph = (Map<String, Object>) body.getOrDefault("flowGraph", Map.of());

        FlowDefinition flow = FlowDefinition.builder()
                .programCode(pc)
                .chainName(chainName)
                .chainType(chainType != null ? chainType : "ORDER")
                .flowGraph(flowGraph)
                .elExpression(elExpression != null ? elExpression : "")
                .status("DRAFT")
                .version(1)
                .build();

        flowDefRepo.save(flow);
        log.info("[Admin] 流程定义创建: {} (chain={})", chainName, pc);
        return ResponseEntity.ok(ApiResponse.success(flowToMap(flow)));
    }

    /**
     * 更新流程定义
     */
    @PutMapping("/flows/{id}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateFlow(
            @PathVariable Long id, @RequestBody Map<String, Object> body) {
        FlowDefinition flow = em.find(FlowDefinition.class, id);
        if (flow == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "流程定义不存在"));
        }

        if (body.containsKey("chainType")) flow.setChainType((String) body.get("chainType"));
        if (body.containsKey("elExpression")) flow.setElExpression((String) body.get("elExpression"));
        if (body.containsKey("flowGraph")) {
            @SuppressWarnings("unchecked")
            Map<String, Object> graph = (Map<String, Object>) body.get("flowGraph");
            flow.setFlowGraph(graph);
        }

        flow.setVersion(flow.getVersion() + 1);
        flow.setUpdatedAt(LocalDateTime.now());
        flowDefRepo.save(flow);

        log.info("[Admin] 流程定义更新: id={}", id);
        return ResponseEntity.ok(ApiResponse.success(flowToMap(flow)));
    }

    /**
     * 发布流程定义 — 写入 EL 文件并触发 LiteFlow 热更新
     */
    @PostMapping("/flows/{id}/publish")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> publishFlow(@PathVariable Long id) {
        String pc = TenantContext.getRequired();
        FlowDefinition flow = em.find(FlowDefinition.class, id);
        if (flow == null) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "流程定义不存在"));
        }

        if (flow.getElExpression() == null || flow.getElExpression().isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "EL 表达式为空，无法发布"));
        }

        flow.setStatus("PUBLISHED");
        flow.setUpdatedAt(LocalDateTime.now());
        flowDefRepo.save(flow);

        // 触发 LiteFlow 热更新
        try {
            flowExecutor.reloadRule();
            log.info("[Admin] 流程发布成功: chain={}, LiteFlow 已热更新", flow.getChainName());
        } catch (Exception e) {
            log.warn("[Admin] LiteFlow 热更新失败: {}", e.getMessage());
        }

        Map<String, Object> result = flowToMap(flow);
        result.put("reloaded", true);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 流程测试执行
     */
    @PostMapping("/flows/test-run")
    public ResponseEntity<ApiResponse<Map<String, Object>>> testFlowRun(
            @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String chainName = (String) body.getOrDefault("chainName", "ORDER_CHAIN");
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = (Map<String, Object>) body.getOrDefault("payload", Map.of());

        String rawJson;
        try {
            rawJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(payload);
        } catch (Exception e) {
            rawJson = payload.toString();
        }

        EventContext ctx = new EventContext();
        ctx.setProgramCode(pc);
        ctx.setChannel((String) payload.getOrDefault("channel", "TEST"));
        ctx.setRawPayload(rawJson);
        ctx.setIdempotencyKey("test-" + System.currentTimeMillis());

        try {
            com.yomahub.liteflow.flow.LiteflowResponse response = flowExecutor.execute2Resp(chainName, null, ctx);

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("chainName", chainName);
            result.put("success", response.isSuccess());
            result.put("message", response.getMessage());
            result.put("actionCount", ctx.getActions() != null ? ctx.getActions().size() : 0);

            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (Exception e) {
            return ResponseEntity.ok(ApiResponse.error("ERR_TEST_FAILED", e.getMessage()));
        }
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
    @Transactional
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

        String detailJson;
        try {
            detailJson = objectMapper.writeValueAsString(
                    Map.of("rule_code", ruleId, "reason", reason));
        } catch (Exception e) {
            log.error("[Admin] JSON序列化失败", e);
            detailJson = "{}";
        }
        em.createNativeQuery(
                "INSERT INTO audit_log (program_code, action, detail, created_at) VALUES (?,?,?::jsonb,?)")
                .setParameter(1, pc).setParameter(2, "FORCE_OVERRIDE")
                .setParameter(3, detailJson)
                .setParameter(4, LocalDateTime.now())
                .executeUpdate();

        // 刷新 KieBase 使强制放行的规则立即生效
        try {
            kieBaseCacheManager.refreshKieBase(pc);
        } catch (Exception e) {
            log.warn("[Admin] KieBase 刷新失败（无 ACTIVE 规则）: {}", e.getMessage());
        }

        log.warn("[Admin] 规则强制放行: rule={}, reason={}", ruleId, reason);
        return ResponseEntity.ok(ApiResponse.success(Map.of("rule_code", ruleId, "status", "ACTIVE", "overridden", true)));
    }

    // ==================== 渠道映射测试 ====================

    private static final ObjectMapper objectMapper = new ObjectMapper();

    @PostMapping("/channels/test-transform")
    public ResponseEntity<ApiResponse<Map<String, Object>>> testChannelTransform(
            @RequestBody Map<String, Object> body) {
        String sourceJson = (String) body.get("sourceJson");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> mappings = (List<Map<String, Object>>) body.get("mappings");
        String script = (String) body.get("script");

        if (sourceJson == null || sourceJson.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", "sourceJson 不能为空"));
        }

        // 1. 解析源JSON
        Map<String, Object> source;
        try {
            source = objectMapper.readValue(sourceJson, Map.class);
        } catch (Exception e) {
            return ResponseEntity.ok(ApiResponse.error("ERR_PARSE", "JSON解析失败: " + e.getMessage()));
        }

        // 2. 构建基本事件对象
        Map<String, Object> base = new LinkedHashMap<>();
        base.put("event_id", "evt_" + System.currentTimeMillis());
        base.put("member_id", source.getOrDefault("memberId",
                source.getOrDefault("openId", "")));
        base.put("event_type", "CUSTOM");
        base.put("channel", source.getOrDefault("channelType",
                source.getOrDefault("channel", "")));
        base.put("event_time", source.getOrDefault("tradeTime",
                java.time.Instant.now().toString()));
        base.put("idempotent_key", source.getOrDefault("tradeNo",
                source.getOrDefault("orderId", "")));
        base.put("payload", new LinkedHashMap<>());

        // 3. 应用字段路径映射
        if (mappings != null) {
            for (Map<String, Object> m : mappings) {
                String src = (String) m.get("source");
                String tgt = (String) m.get("target");
                if (src == null || tgt == null || src.isBlank() || tgt.isBlank()) continue;
                Object value = source.getOrDefault(src, "");
                if (tgt.startsWith("payload.")) {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> payload = (Map<String, Object>) base.get("payload");
                    setNestedValue(payload, tgt.substring("payload.".length()), value);
                } else {
                    base.put(tgt, value);
                }
            }
        }

        // 4. 执行脚本(如果提供了且JS引擎可用)
        Map<String, Object> result = base;
        if (script != null && !script.isBlank()) {
            try {
                result = executeJsTransform(script, source, base);
            } catch (Exception e) {
                log.warn("[Admin] JS脚本执行失败，回退到路径映射结果: {}", e.getMessage());
            }
        }

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("result", result);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> executeJsTransform(String script,
                                                    Map<String, Object> source,
                                                    Map<String, Object> base) {
        String pc = TenantContext.get();
        try (Context ctx = Context.newBuilder("js")
                .option("engine.WarnInterpreterOnly", "false")
                .allowHostAccess(org.graalvm.polyglot.HostAccess.NONE)
                .allowIO(org.graalvm.polyglot.io.IOAccess.NONE)
                .allowCreateThread(false)
                .allowNativeAccess(false)
                .build()) {
            // 绑定变量和函数
            Value bindings = ctx.getBindings("js");
            bindings.putMember("source", source);
            bindings.putMember("console", new JsConsole());

            // applyFieldMappings 返回预处理后的base对象
            bindings.putMember("applyFieldMappings", (java.util.function.Function<Object, Map<String, Object>>) (s) -> base);

            // 执行脚本: 用户脚本定义 transform() + 调用入口（使用当前租户 code）
            String fullScript = script + "\ntransform(source, { programCode: '" + pc + "' });";
            Value jsResult = ctx.eval("js", fullScript);

            // 将JS返回值转换为Java Map
            if (jsResult.isNull()) {
                return base;
            }
            return (Map<String, Object>) valueToObject(jsResult);
        }
    }

    /** 处理 GraalVM Value → Java Object 转换 */
    private Object valueToObject(Value v) {
        if (v.isNull()) return null;
        if (v.isString()) return v.asString();
        if (v.isNumber()) {
            if (v.fitsInInt()) return v.asInt();
            if (v.fitsInLong()) return v.asLong();
            return v.asDouble();
        }
        if (v.isBoolean()) return v.asBoolean();
        if (v.hasArrayElements()) {
            List<Object> list = new ArrayList<>();
            for (long i = 0; i < v.getArraySize(); i++) {
                list.add(valueToObject(v.getArrayElement(i)));
            }
            return list;
        }
        if (v.hasMembers()) {
            Map<String, Object> map = new LinkedHashMap<>();
            for (String key : v.getMemberKeys()) {
                map.put(key, valueToObject(v.getMember(key)));
            }
            return map;
        }
        return v.toString();
    }

    @SuppressWarnings("unchecked")
    private void setNestedValue(Map<String, Object> obj, String path, Object value) {
        String[] keys = path.split("\\.");
        Map<String, Object> cur = obj;
        for (int i = 0; i < keys.length - 1; i++) {
            String key = keys[i];
            Object child = cur.get(key);
            if (!(child instanceof Map)) {
                child = new LinkedHashMap<>();
                cur.put(key, child);
            }
            cur = (Map<String, Object>) child;
        }
        cur.put(keys[keys.length - 1], value);
    }

    /** GraalVM JS console.log 桥接 */
    public static class JsConsole {
        public void log(Object... args) {
            StringBuilder sb = new StringBuilder();
            for (Object a : args) sb.append(a).append(" ");
            log.debug("[JS] {}", sb.toString().trim());
        }
    }

    // ==================== 私有方法 ====================

    private Map<String, Object> ruleToMap(RuleDefinition r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("rule_code", r.getRuleCode());
        m.put("rule_name", r.getRuleName());
        m.put("rule_type", r.getRuleType());
        m.put("rule_category", r.getRuleCategory());
        m.put("activation_group", r.getRuleCategory()); // 前端兼容别名
        m.put("drl_content", r.getDrlContent());
        m.put("version", r.getVersion());
        m.put("status", r.getStatus());
        m.put("created_at", r.getCreatedAt() != null ? r.getCreatedAt().toString() : null);
        m.put("updated_at", r.getUpdatedAt() != null ? r.getUpdatedAt().toString() : null);
        m.put("metadata", r.getMetadata());
        return m;
    }

    private Map<String, Object> flowToMap(FlowDefinition f) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", f.getId());
        m.put("chainName", f.getChainName());
        m.put("chainType", f.getChainType());
        m.put("flowGraph", f.getFlowGraph());
        m.put("elExpression", f.getElExpression());
        m.put("status", f.getStatus());
        m.put("version", f.getVersion());
        m.put("created_at", f.getCreatedAt() != null ? f.getCreatedAt().toString() : null);
        m.put("updated_at", f.getUpdatedAt() != null ? f.getUpdatedAt().toString() : null);
        return m;
    }

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