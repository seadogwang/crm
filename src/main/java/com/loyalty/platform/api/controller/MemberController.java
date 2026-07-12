package com.loyalty.platform.api.controller;

import com.loyalty.platform.member.MemberMergeService;
import com.loyalty.platform.master.MasterDataRenderService;
import com.loyalty.platform.accounting.PointGrantService;
import com.loyalty.platform.accounting.PointRedeemService;
import com.loyalty.platform.api.service.MemberService;
import com.loyalty.platform.api.service.PageLayoutService;
import com.loyalty.platform.api.service.LayoutToFormilyConverter;
import com.loyalty.platform.api.service.ProgramSchemaService;
import com.loyalty.platform.api.dto.FormilySchema;
import com.loyalty.platform.campaign.consent.TermsService;
import com.loyalty.platform.common.annotation.Idempotent;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.domain.entity.*;
import com.loyalty.platform.domain.entity.PageLayout;
import com.loyalty.platform.domain.repository.*;
import com.loyalty.platform.domain.repository.PointTypeDefinitionRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/members")
public class MemberController {

    private static final Logger log = LoggerFactory.getLogger(MemberController.class);

    @PersistenceContext private EntityManager em;
    private final MemberService memberService;
    private final TermsService termsService;
    private final MemberRepository memberRepo;
    private final PointGrantService pointGrantService;
    private final PointRedeemService pointRedeemService;
    private final ProgramSchemaService programSchemaService;
    private final AccountTransactionRepository txRepo;
    private final MergeTaskRepository mergeTaskRepo;
    private final TierDefinitionRepository tierDefRepo;
    private final PointTypeDefinitionRepository pointTypeRepo;
    private final MemberMergeService memberMergeService;
    private final MasterDataRenderService masterDataService;
    private final PageLayoutService layoutService;
    private final LayoutToFormilyConverter layoutConverter;

    public MemberController(MemberService memberService, TermsService termsService,
                            MemberRepository memberRepo,
                            PointGrantService pointGrantService, PointRedeemService pointRedeemService,
                            ProgramSchemaService programSchemaService, AccountTransactionRepository txRepo,
                            MergeTaskRepository mergeTaskRepo,
                            TierDefinitionRepository tierDefRepo,
                            MemberMergeService memberMergeService,
                            MasterDataRenderService masterDataService,
                            PointTypeDefinitionRepository pointTypeRepo,
                            PageLayoutService layoutService,
                            LayoutToFormilyConverter layoutConverter) {
        this.memberService = memberService;
        this.termsService = termsService;
        this.memberRepo = memberRepo;
        this.pointGrantService = pointGrantService;
        this.pointRedeemService = pointRedeemService;
        this.programSchemaService = programSchemaService;
        this.txRepo = txRepo;
        this.mergeTaskRepo = mergeTaskRepo;
        this.tierDefRepo = tierDefRepo;
        this.memberMergeService = memberMergeService;
        this.masterDataService = masterDataService;
        this.pointTypeRepo = pointTypeRepo;
        this.layoutService = layoutService;
        this.layoutConverter = layoutConverter;
    }

    // ==================== 查询 ====================

    @GetMapping("/search")
    public ResponseEntity<ApiResponse<Map<String, Object>>> search(@RequestParam String keyword) {
        String pc = TenantContext.getRequired();
        Long memberId = null;

        // 1. 先按唯一键搜索（手机号、邮箱等）— §3.4.4 member_unique_key
        var keys = em.createQuery(
            "SELECT k FROM MemberUniqueKey k WHERE k.programCode=:pc AND k.keyValue=:kv",
            MemberUniqueKey.class)
            .setParameter("pc", pc).setParameter("kv", keyword.trim()).getResultList();
        if (!keys.isEmpty()) {
            memberId = keys.get(0).getMemberId();
        } else {
            // 2. 唯一键未命中，尝试解析为 memberId
            try { memberId = Long.valueOf(keyword.trim()); }
            catch (NumberFormatException ignored) {}
        }

        if (memberId == null) return ResponseEntity.ok(ApiResponse.success("未找到会员", null));

        Optional<Member> opt = memberRepo.findByMemberId(pc, memberId);
        if (opt.isEmpty()) return ResponseEntity.ok(ApiResponse.success("未找到会员", null));

        return ResponseEntity.ok(ApiResponse.success(toFullVO(opt.get(), pc)));
    }

    @GetMapping("/{memberId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> get(@PathVariable Long memberId) {
        String pc = TenantContext.getRequired();
        Optional<Member> opt = memberRepo.findByMemberId(pc, memberId);
        if (opt.isEmpty()) return ResponseEntity.ok(ApiResponse.error("ERR_MEMBER_NOT_FOUND", "会员不存在"));
        Map<String, Object> vo = toFullVO(opt.get(), pc);
        // 注入页面布局和 Formily Schema
        try {
            PageLayout layout = layoutService.getLayout(pc, "MEMBER", "DETAIL");
            vo.put("pageLayout", layout.getLayoutConfig());
            vo.put("pageLayoutId", layout.getId());
            vo.put("pageLayoutVersion", layout.getVersion());
            FormilySchema formilySchema = layoutConverter.convert(layout.getLayoutConfig());
            vo.put("formilySchema", formilySchema.getSchema());
        } catch (Exception e) {
            log.warn("[MemberController] 加载页面布局失败: {}", e.getMessage());
        }
        return ResponseEntity.ok(ApiResponse.success(vo));
    }

    @PostMapping
    @Idempotent
    public ResponseEntity<ApiResponse<Member>> create(@RequestBody Map<String, Object> body,
                                                       HttpServletRequest request) {
        String pc = TenantContext.getRequired();

        // § 注册流程：必须先通过"同意章程"检查，才能创建会员
        Boolean termsAccepted = body.containsKey("terms_accepted")
                ? Boolean.valueOf(body.get("terms_accepted").toString()) : false;
        if (!termsAccepted) {
            throw new BusinessException("ERR_TERMS_NOT_ACCEPTED",
                    "必须同意俱乐部章程才能注册");
        }

        @SuppressWarnings("unchecked")
        Map<String, Object> ext = (Map<String, Object>) body.getOrDefault("ext_attributes", Map.of());
        Member m = memberService.createMember(pc,
            body.containsKey("member_id") ? Long.valueOf(body.get("member_id").toString()) : null,
            (String) body.getOrDefault("tier_code", "BASE"), ext);

        // 记录同意记录（与会员创建在同一事务中，但需要独立 try-catch 防止回滚会员创建）
        try {
            String ip = getClientIp(request);
            String userAgent = request.getHeader("User-Agent");
            termsService.acceptTerms(m.getMemberId().toString(), "CHARTER", "WEB_APP", ip, userAgent);
        } catch (Exception e) {
            log.error("记录条款同意失败: memberId={}", m.getMemberId(), e);
            // 不阻断注册流程，但记录错误
        }

        return ResponseEntity.ok(ApiResponse.success("创建成功", m));
    }

    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isBlank()) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }

    // ==================== 交易流水 (transaction_event) ====================

    @GetMapping("/{memberId}/orders")
    public ResponseEntity<ApiResponse<Map<String, Object>>> orders(
            @PathVariable Long memberId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size) {
        String pc = TenantContext.getRequired();
        String jpql = "FROM TransactionEvent t WHERE t.programCode=:pc AND t.memberId=:mid AND t.eventType IN ('ORDER_PAID','ORDER_REFUND_FULL','ORDER_REFUND_PARTIAL') ORDER BY t.eventTime DESC";
        String cnt = "SELECT COUNT(t) FROM TransactionEvent t WHERE t.programCode=:pc AND t.memberId=:mid AND t.eventType IN ('ORDER_PAID','ORDER_REFUND_FULL','ORDER_REFUND_PARTIAL')";

        var q = em.createQuery(jpql, TransactionEvent.class).setParameter("pc", pc).setParameter("mid", memberId);
        var cq = em.createQuery(cnt, Long.class).setParameter("pc", pc).setParameter("mid", memberId);

        long total = cq.getSingleResult();
        var list = q.setFirstResult(page * size).setMaxResults(size).getResultList().stream().map(t -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("orderId", t.getIdempotencyKey());
            m.put("orderTime", t.getTradeTime());
            m.put("payTime", t.getPayTime());
            m.put("orderAmount", t.getOrderAmount());
            m.put("tradeStatus", t.getTradeStatus());
            m.put("eventType", t.getEventType());
            m.put("channel", t.getChannel());
            m.put("eventTime", t.getEventTime());
            m.put("createdAt", t.getCreatedAt());
            return m;
        }).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("data", list); result.put("total", total);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 订单明细（异步加载） */
    @GetMapping("/{memberId}/orders/detail")
    public ResponseEntity<ApiResponse<Map<String, Object>>> orderDetail(
            @PathVariable Long memberId, @RequestParam String orderId) {
        String pc = TenantContext.getRequired();
        List<TransactionEvent> events = em.createQuery(
            "FROM TransactionEvent t WHERE t.programCode=:pc AND t.memberId=:mid AND t.idempotencyKey=:oid",
            TransactionEvent.class)
            .setParameter("pc", pc).setParameter("mid", memberId).setParameter("oid", orderId)
            .getResultList();

        if (events.isEmpty()) return ResponseEntity.ok(ApiResponse.success(null));

        TransactionEvent t = events.get(0);
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("orderId", t.getIdempotencyKey());
        detail.put("orderTime", t.getTradeTime());
        detail.put("payTime", t.getPayTime());
        detail.put("orderAmount", t.getOrderAmount());
        detail.put("tradeStatus", t.getTradeStatus());
        detail.put("extAttributes", t.getExtAttributes());
        return ResponseEntity.ok(ApiResponse.success(detail));
    }

    // ==================== 交易流水 (account_transaction) ====================

    @GetMapping("/{memberId}/transactions")
    public ResponseEntity<ApiResponse<Map<String, Object>>> transactions(
            @PathVariable Long memberId,
            @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String typeFilter,
            @RequestParam(required = false) String dateFrom, @RequestParam(required = false) String dateTo) {
        String pc = TenantContext.getRequired();
        String mid = String.valueOf(memberId);

        StringBuilder jpql = new StringBuilder("FROM AccountTransaction t WHERE t.programCode=:pc AND t.memberId=:mid");
        StringBuilder cnt = new StringBuilder("SELECT COUNT(t) FROM AccountTransaction t WHERE t.programCode=:pc AND t.memberId=:mid");

        // 只显示可兑换类型的积分流水（排除记录型和纯算等级的类型）
        List<String> redeemableTypes = pointTypeRepo.findByProgramCodeAndIsRedeemableTrue(pc)
                .stream().map(PointTypeDefinition::getTypeCode).collect(Collectors.toList());
        if (!redeemableTypes.isEmpty()) {
            jpql.append(" AND t.accountType IN :redeemableTypes");
            cnt.append(" AND t.accountType IN :redeemableTypes");
        }

        if (typeFilter != null && !typeFilter.isEmpty()) {
            jpql.append(" AND t.transactionType IN (:types)");
            cnt.append(" AND t.transactionType IN (:types)");
        }
        if (dateFrom != null) { jpql.append(" AND t.createdAt >= :dateFrom"); cnt.append(" AND t.createdAt >= :dateFrom"); }
        if (dateTo != null) { jpql.append(" AND t.createdAt <= :dateTo"); cnt.append(" AND t.createdAt <= :dateTo"); }
        jpql.append(" ORDER BY t.createdAt DESC");

        var q = em.createQuery(jpql.toString(), AccountTransaction.class).setParameter("pc", pc).setParameter("mid", mid);
        var cq = em.createQuery(cnt.toString(), Long.class).setParameter("pc", pc).setParameter("mid", mid);

        if (!redeemableTypes.isEmpty()) {
            q.setParameter("redeemableTypes", redeemableTypes);
            cq.setParameter("redeemableTypes", redeemableTypes);
        }

        if (typeFilter != null && !typeFilter.isEmpty()) {
            String[] types = typeFilter.split(",");
            q.setParameter("types", Arrays.asList(types));
            cq.setParameter("types", Arrays.asList(types));
        }
        if (dateFrom != null) { q.setParameter("dateFrom", LocalDateTime.parse(dateFrom)); cq.setParameter("dateFrom", LocalDateTime.parse(dateFrom)); }
        if (dateTo != null) { q.setParameter("dateTo", LocalDateTime.parse(dateTo)); cq.setParameter("dateTo", LocalDateTime.parse(dateTo)); }

        long total = cq.getSingleResult();
        var list = q.setFirstResult(page * size).setMaxResults(size).getResultList().stream().map(this::txVO).collect(Collectors.toList());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("data", list); result.put("total", total); result.put("page", page); result.put("size", size);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    @GetMapping("/{memberId}/transactions/{txId}/allocation")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> allocation(@PathVariable Long memberId, @PathVariable Long txId) {
        String pc = TenantContext.getRequired();
        List<RedemptionAllocation> allocs = em.createQuery(
            "FROM RedemptionAllocation a WHERE a.programCode=:pc AND a.redemptionTransactionId=:txId",
            RedemptionAllocation.class).setParameter("pc", pc).setParameter("txId", txId).getResultList();

        List<Map<String, Object>> result = allocs.stream().map(a -> {
            Map<String, Object> m = new LinkedHashMap<>();
            AccountTransaction batch = em.find(AccountTransaction.class, a.getAccrualTransactionId());
            m.put("batchId", a.getAccrualTransactionId());
            m.put("batchCreatedAt", batch != null ? batch.getCreatedAt() : null);
            m.put("originalAmount", batch != null ? batch.getAmount() : null);
            m.put("allocatedAmount", a.getAllocatedAmount());
            m.put("remainingAmount", batch != null ? batch.getRemainingAmount() : null);
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ==================== 等级日志 ====================

    @GetMapping("/{memberId}/tier-logs")
    public ResponseEntity<ApiResponse<Map<String, Object>>> tierLogs(
            @PathVariable Long memberId, @RequestParam(defaultValue = "0") int page, @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String reasonFilter,
            @RequestParam(required = false) String dateFrom, @RequestParam(required = false) String dateTo) {
        String pc = TenantContext.getRequired();
        String mid = String.valueOf(memberId);

        StringBuilder jpql = new StringBuilder("FROM TierChangeLog t WHERE t.programCode=:pc AND t.memberId=:mid");
        StringBuilder cnt = new StringBuilder("SELECT COUNT(t) FROM TierChangeLog t WHERE t.programCode=:pc AND t.memberId=:mid");

        if (reasonFilter != null && !reasonFilter.isEmpty()) {
            jpql.append(" AND t.changeReason IN (:reasons)");
            cnt.append(" AND t.changeReason IN (:reasons)");
        }
        if (dateFrom != null) { jpql.append(" AND t.changedAt >= :df"); cnt.append(" AND t.changedAt >= :df"); }
        if (dateTo != null) { jpql.append(" AND t.changedAt <= :dt"); cnt.append(" AND t.changedAt <= :dt"); }
        jpql.append(" ORDER BY t.changedAt DESC");

        var q = em.createQuery(jpql.toString(), TierChangeLog.class).setParameter("pc", pc).setParameter("mid", mid);
        var cq = em.createQuery(cnt.toString(), Long.class).setParameter("pc", pc).setParameter("mid", mid);

        if (reasonFilter != null && !reasonFilter.isEmpty()) { q.setParameter("reasons", Arrays.asList(reasonFilter.split(","))); cq.setParameter("reasons", Arrays.asList(reasonFilter.split(","))); }
        if (dateFrom != null) { q.setParameter("df", LocalDateTime.parse(dateFrom)); cq.setParameter("df", LocalDateTime.parse(dateFrom)); }
        if (dateTo != null) { q.setParameter("dt", LocalDateTime.parse(dateTo)); cq.setParameter("dt", LocalDateTime.parse(dateTo)); }

        long total = cq.getSingleResult();
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("data", q.setFirstResult(page * size).setMaxResults(size).getResultList());
        result.put("total", total);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ==================== 渠道绑定 ====================

    @GetMapping("/{memberId}/channel-bindings")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> channels(@PathVariable Long memberId) {
        String pc = TenantContext.getRequired();
        List<MemberChannelBinding> bindings = em.createQuery(
            "FROM MemberChannelBinding b WHERE b.programCode=:pc AND b.memberId=:mid",
            MemberChannelBinding.class).setParameter("pc", pc).setParameter("mid", String.valueOf(memberId)).getResultList();

        List<Map<String, Object>> result = new ArrayList<>();
        for (MemberChannelBinding b : bindings) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("channel", b.getChannel());
            m.put("channelUserId", b.getChannelUserId());
            m.put("channelNickname", b.getChannelNickname());
            m.put("status", b.getStatus());
            m.put("authorizedAt", b.getAuthorizedAt());
            result.add(m);
        }
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ==================== 操作 ====================

    @PutMapping("/{memberId}")
    public ResponseEntity<ApiResponse<Member>> update(@PathVariable Long memberId, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        @SuppressWarnings("unchecked")
        Map<String, Object> ext = (Map<String, Object>) body.getOrDefault("ext_attributes", Map.of());
        Member updated = memberService.updateMember(pc, memberId, ext);

        // 处理固定字段更新
        if (body.containsKey("birthday") && body.get("birthday") != null) {
            try {
                java.time.LocalDate bd = java.time.LocalDate.parse(body.get("birthday").toString());
                updated.setBirthday(bd);
            } catch (Exception ignored) {}
        }
        if (body.containsKey("name")) updated.setName((String) body.get("name"));
        if (body.containsKey("gender")) updated.setGender((String) body.get("gender"));
        memberRepo.save(updated);

        return ResponseEntity.ok(ApiResponse.success("更新成功", updated));
    }

    @PostMapping("/{memberId}/points/adjust")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> adjustPoints(@PathVariable Long memberId, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        // 默认取第一个可兑换积分类型，不再硬编码 REWARD
        String type = (String) body.getOrDefault("accountType",
            pointTypeRepo.findByProgramCodeAndStatus(pc, "ACTIVE").stream()
                .filter(pt -> Boolean.TRUE.equals(pt.getIsRedeemable()))
                .findFirst().map(PointTypeDefinition::getTypeCode).orElse("REWARD"));
        BigDecimal amount = new BigDecimal(body.get("amount").toString());
        boolean incr = Boolean.TRUE.equals(body.getOrDefault("increase", true));
        if (incr) pointGrantService.grantPoints(pc, memberId, type, amount, "MANUAL_ADJUST", null);
        else pointRedeemService.redeemPoints(pc, memberId, type, amount);
        return ResponseEntity.ok(ApiResponse.success("调整成功", null));
    }

    @PostMapping("/{memberId}/tier/adjust")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> adjustTier(@PathVariable Long memberId, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String newTier = (String) body.get("newTier");
        Optional<Member> opt = memberRepo.findByMemberId(pc, memberId);
        if (opt.isEmpty()) return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "会员不存在"));

        // 校验等级有效性：newTier 必须在 tier_definition 表中存在（Bug B-02 修复）
        if (newTier == null || newTier.isBlank()) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID_TIER", "等级代码不能为空"));
        }
        boolean tierExists = tierDefRepo.findByProgramCodeAndTierCode(pc, newTier).isPresent();
        if (!tierExists) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID_TIER",
                    "无效的等级代码: " + newTier + "，请在等级定义中先创建该等级"));
        }

        Member m = opt.get();
        String old = m.getTierCode();
        m.setTierCode(newTier);
        memberRepo.save(m);

        TierChangeLog log = new TierChangeLog();
        log.setProgramCode(pc); log.setMemberId(memberId);
        log.setFromTier(old); log.setToTier(newTier);
        log.setChangeReason("MANUAL_ADJUSTMENT");
        log.setChangedAt(LocalDateTime.now());
        em.persist(log);
        return ResponseEntity.ok(ApiResponse.success("等级调整成功", null));
    }

    @PostMapping("/{memberId}/freeze")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> freeze(@PathVariable Long memberId) {
        String pc = TenantContext.getRequired();
        Optional<Member> opt = memberRepo.findByMemberId(pc, memberId);
        if (opt.isEmpty()) return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "会员不存在"));
        opt.get().setStatus("SUSPENDED");
        memberRepo.save(opt.get());
        return ResponseEntity.ok(ApiResponse.success("已冻结", null));
    }

    @PostMapping("/{memberId}/unfreeze")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> unfreeze(@PathVariable Long memberId) {
        String pc = TenantContext.getRequired();
        Optional<Member> opt = memberRepo.findByMemberId(pc, memberId);
        if (opt.isEmpty()) return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "会员不存在"));
        opt.get().setStatus("ENROLLED");
        memberRepo.save(opt.get());
        return ResponseEntity.ok(ApiResponse.success("已解冻", null));
    }

    @PostMapping("/merge")
    @Transactional(rollbackFor = Exception.class)
    public ResponseEntity<ApiResponse<Map<String, Object>>> merge(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        Long mainId = Long.valueOf(body.get("mainMemberId").toString());
        Long dupId = Long.valueOf(body.get("duplicateMemberId").toString());
        Optional<Member> mainOpt = memberRepo.findByMemberId(pc, mainId);
        Optional<Member> dupOpt = memberRepo.findByMemberId(pc, dupId);
        if (mainOpt.isEmpty() || dupOpt.isEmpty()) return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "会员不存在"));

        // 同步执行合并操作（Bug B-03 修复：确保合并立即生效，而非仅创建异步任务）
        memberMergeService.merge(pc, mainId, dupId);

        // 记录合并任务作为审计日志
        MergeTask task = new MergeTask();
        task.setProgramCode(pc);
        task.setMainMemberId(mainId);
        task.setDuplicateMemberId(dupId);
        task.setStatus("COMPLETED");
        task.setCreatedAt(LocalDateTime.now());
        task.setUpdatedAt(LocalDateTime.now());
        mergeTaskRepo.save(task);

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("taskId", task.getId());
        r.put("mainMemberId", mainId);
        r.put("duplicateMemberId", dupId);
        r.put("status", "COMPLETED");
        return ResponseEntity.ok(ApiResponse.success("会员合并成功", r));
    }

    // ==================== 辅助 ====================

    private Map<String, Object> toFullVO(Member m, String pc) {
        Map<String, Object> vo = new LinkedHashMap<>();
        vo.put("memberId", String.valueOf(m.getMemberId()));
        vo.put("name", m.getName());
        vo.put("gender", m.getGender());
        vo.put("birthday", m.getBirthday());
        vo.put("enroll_channel", m.getEnrollChannel());
        vo.put("tierCode", m.getTierCode());
        vo.put("tierEffectiveFrom", m.getTierEffectiveFrom());
        vo.put("tierExpiresAt", m.getTierExpiresAt());
        vo.put("status", m.getStatus());
        vo.put("schemaVersion", m.getSchemaVersion());
        vo.put("createdAt", m.getCreatedAt());
        vo.put("extAttributes", m.getExtAttributes());
        // 加载 MEMBER schema 并渲染主数据字段
        try {
            var memberSchema = em.createQuery(
                "FROM ProgramSchema p WHERE p.programCode=:pc AND p.entityType='MEMBER' AND p.status='PUBLISHED'",
                ProgramSchema.class).setParameter("pc", pc).getResultList().stream().findFirst();
            if (memberSchema.isPresent() && memberSchema.get().getFieldSchema() != null) {
                Map<String, Object> rendered = masterDataService.renderMemberFields(
                    m.getExtAttributes(), memberSchema.get().getFieldSchema());
                vo.put("extAttributes", rendered);
            }
        } catch (Exception e) {
            log.warn("[Member] 主数据渲染失败: {}", e.getMessage());
        }
        String mid = String.valueOf(m.getMemberId());

        // 积分账户 — 实时汇总 account_transaction 表
        List<Map<String, Object>> accounts = new ArrayList<>();
        List<PointTypeDefinition> pointTypes = em.createQuery(
            "FROM PointTypeDefinition p WHERE p.programCode=:pc AND p.status='ACTIVE'",
            PointTypeDefinition.class).setParameter("pc", pc).getResultList()
            .stream().filter(pt -> !"RECORD".equals(pt.getPointCategory()))
            .collect(Collectors.toList());

        for (PointTypeDefinition pt : pointTypes) {
            String type = pt.getTypeCode();
            Map<String, Object> acc = new LinkedHashMap<>();
            acc.put("accountType", type);
            acc.put("typeName", pt.getTypeName());
            // 实时余额
            BigDecimal balance = txRepo.sumAvailableBalance(pc, m.getMemberId(), type);
            acc.put("balance", balance != null ? balance : BigDecimal.ZERO);
            // 实时累计发分
            BigDecimal totalAccrued = txRepo.sumByType(pc, m.getMemberId(), type, "ACCRUAL");
            acc.put("totalAccrued", totalAccrued != null ? totalAccrued : BigDecimal.ZERO);
            // 实时累计核销
            BigDecimal totalRedeemed = txRepo.sumByType(pc, m.getMemberId(), type, "REDEMPTION");
            acc.put("totalRedeemed", totalRedeemed != null ? totalRedeemed : BigDecimal.ZERO);
            // 信用额度仍从 member_account 读取（配置项）
            try {
                var mas = em.createQuery(
                    "FROM MemberAccount a WHERE a.programCode=:pc AND a.memberId=:mid AND a.accountType=:t",
                    MemberAccount.class).setParameter("pc", pc).setParameter("mid", m.getMemberId()).setParameter("t", type).getResultList();
                if (!mas.isEmpty()) {
                    MemberAccount ma = mas.get(0);
                    acc.put("creditLimit", ma.getCreditLimit());
                    acc.put("creditUsed", ma.getCreditUsed());
                }
            } catch (Exception ignored) {}
            accounts.add(acc);
        }
        vo.put("accounts", accounts);

        // 最近交易
        vo.put("recentTransactions", em.createQuery(
            "FROM AccountTransaction t WHERE t.programCode=:pc AND t.memberId=:mid ORDER BY t.createdAt DESC",
            AccountTransaction.class).setParameter("pc", pc).setParameter("mid", mid).setMaxResults(10)
            .getResultList().stream().map(this::txVO).collect(Collectors.toList()));

        // 最近等级日志
        vo.put("recentTierLogs", em.createQuery(
            "FROM TierChangeLog l WHERE l.programCode=:pc AND l.memberId=:mid ORDER BY l.changedAt DESC",
            TierChangeLog.class).setParameter("pc", pc).setParameter("mid", mid).setMaxResults(5).getResultList());

        // 渠道
        vo.put("channels", em.createQuery(
            "FROM MemberUniqueKey k WHERE k.programCode=:pc AND k.memberId=:mid",
            MemberUniqueKey.class).setParameter("pc", pc).setParameter("mid", m.getMemberId())
            .getResultList().stream().map(k -> {
                Map<String, Object> km = new LinkedHashMap<>();
                km.put("keyCombination", k.getKeyCombination());
                km.put("keyValue", mask(k.getKeyValue()));
                return km;
            }).collect(Collectors.toList()));

        // 等级列表
        vo.put("tiers", em.createQuery(
            "FROM TierDefinition t WHERE t.programCode=:pc ORDER BY t.sequence",
            TierDefinition.class).setParameter("pc", pc).getResultList().stream().map(t -> {
                Map<String, Object> tm = new LinkedHashMap<>();
                tm.put("tierCode", t.getTierCode());
                tm.put("tierName", t.getTierName());
                tm.put("sequence", t.getSequence());
                tm.put("upgradeCriteria", t.getUpgradeCriteria());
                return tm;
            }).collect(Collectors.toList()));

        // Schema
        try {
            Map<String, Object> schema = programSchemaService.getCurrentSchema(pc, "MEMBER");
            if (schema != null) vo.put("fieldSchema", schema);
        } catch (Exception ignored) {}

        return vo;
    }

    private Map<String, Object> txVO(AccountTransaction tx) {
        Map<String, Object> vo = new LinkedHashMap<>();
        vo.put("id", tx.getId());
        vo.put("transactionType", tx.getTransactionType());
        vo.put("amount", tx.getAmount());
        vo.put("remainingAmount", tx.getRemainingAmount());
        vo.put("description", desc(tx.getTransactionType()));
        vo.put("orderId", tx.getOperationKey());
        vo.put("orderTime", tx.getOrderTime());
        vo.put("payTime", tx.getPayTime());
        vo.put("createdAt", tx.getCreatedAt());
        return vo;
    }

    private String desc(String type) {
        return switch (type != null ? type : "") {
            case "ACCRUAL" -> "积分发放"; case "REDEMPTION" -> "积分兑换";
            case "EXPIRATION" -> "积分过期"; case "REPAYMENT" -> "透支还款";
            case "CREDIT_REPAY" -> "信用还款"; case "CREDIT_DRAWDOWN" -> "信用提取";
            case "OVERDRAFT" -> "透支"; case "MANUAL_ADJUST" -> "人工调整";
            default -> type;
        };
    }

    private String mask(String v) {
        if (v == null) return "";
        if (v.length() >= 7) return v.substring(0, 3) + "****" + v.substring(v.length() - 4);
        return "***";
    }
}