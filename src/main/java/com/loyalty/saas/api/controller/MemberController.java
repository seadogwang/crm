package com.loyalty.saas.api.controller;

import com.loyalty.saas.accounting.PointGrantService;
import com.loyalty.saas.accounting.PointRedeemService;
import com.loyalty.saas.api.service.MemberService;
import com.loyalty.saas.api.service.SchemaService;
import com.loyalty.saas.common.annotation.Idempotent;
import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.common.dto.ApiResponse;
import com.loyalty.saas.domain.entity.*;
import com.loyalty.saas.domain.repository.*;
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

@RestController
@RequestMapping("/api/members")
public class MemberController {

    private static final Logger log = LoggerFactory.getLogger(MemberController.class);

    @PersistenceContext private EntityManager em;
    private final MemberService memberService;
    private final MemberRepository memberRepo;
    private final PointGrantService pointGrantService;
    private final PointRedeemService pointRedeemService;
    private final SchemaService schemaService;
    private final AccountTransactionRepository txRepo;

    public MemberController(MemberService memberService, MemberRepository memberRepo,
                            PointGrantService pointGrantService, PointRedeemService pointRedeemService,
                            SchemaService schemaService, AccountTransactionRepository txRepo) {
        this.memberService = memberService;
        this.memberRepo = memberRepo;
        this.pointGrantService = pointGrantService;
        this.pointRedeemService = pointRedeemService;
        this.schemaService = schemaService;
        this.txRepo = txRepo;
    }

    // ==================== 查询 ====================

    @GetMapping("/search")
    public ResponseEntity<ApiResponse<Map<String, Object>>> search(@RequestParam String keyword) {
        String pc = TenantContext.getRequired();
        Long memberId;
        try { memberId = Long.valueOf(keyword.trim()); }
        catch (NumberFormatException e) {
            // 非数字，尝试唯一键表搜索
            var keys = em.createQuery(
                "SELECT k FROM MemberUniqueKey k WHERE k.programCode=:pc AND k.keyValue=:kv",
                MemberUniqueKey.class)
                .setParameter("pc", pc).setParameter("kv", keyword).getResultList();
            memberId = keys.isEmpty() ? null : keys.get(0).getMemberId();
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
        return ResponseEntity.ok(ApiResponse.success(toFullVO(opt.get(), pc)));
    }

    @PostMapping
    @Idempotent
    public ResponseEntity<ApiResponse<Member>> create(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        @SuppressWarnings("unchecked")
        Map<String, Object> ext = (Map<String, Object>) body.getOrDefault("ext_attributes", Map.of());
        Member m = memberService.createMember(pc,
            body.containsKey("member_id") ? Long.valueOf(body.get("member_id").toString()) : null,
            (String) body.getOrDefault("tier_code", "BASE"), ext);
        return ResponseEntity.ok(ApiResponse.success("创建成功", m));
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

        if (typeFilter != null && !typeFilter.isEmpty()) {
            jpql.append(" AND t.transactionType IN (:types)");
            cnt.append(" AND t.transactionType IN (:types)");
        }
        if (dateFrom != null) { jpql.append(" AND t.createdAt >= :dateFrom"); cnt.append(" AND t.createdAt >= :dateFrom"); }
        if (dateTo != null) { jpql.append(" AND t.createdAt <= :dateTo"); cnt.append(" AND t.createdAt <= :dateTo"); }
        jpql.append(" ORDER BY t.createdAt DESC");

        var q = em.createQuery(jpql.toString(), AccountTransaction.class).setParameter("pc", pc).setParameter("mid", mid);
        var cq = em.createQuery(cnt.toString(), Long.class).setParameter("pc", pc).setParameter("mid", mid);

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
        List<MemberUniqueKey> keys = em.createQuery(
            "FROM MemberUniqueKey k WHERE k.programCode=:pc AND k.memberId=:mid",
            MemberUniqueKey.class).setParameter("pc", pc).setParameter("mid", memberId).getResultList();

        List<Map<String, Object>> result = keys.stream().map(k -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("keyCombination", k.getKeyCombination());
            m.put("keyValue", mask(k.getKeyValue()));
            return m;
        }).collect(Collectors.toList());
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    // ==================== 操作 ====================

    @PutMapping("/{memberId}")
    public ResponseEntity<ApiResponse<Member>> update(@PathVariable Long memberId, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        @SuppressWarnings("unchecked")
        Map<String, Object> ext = (Map<String, Object>) body.getOrDefault("ext_attributes", Map.of());
        return ResponseEntity.ok(ApiResponse.success("更新成功", memberService.updateMember(pc, memberId, ext)));
    }

    @PostMapping("/{memberId}/points/adjust")
    @Transactional
    public ResponseEntity<ApiResponse<Void>> adjustPoints(@PathVariable Long memberId, @RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String type = (String) body.getOrDefault("accountType", "REWARD");
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
    public ResponseEntity<ApiResponse<Void>> freeze(@PathVariable Long memberId) {
        String pc = TenantContext.getRequired();
        Optional<Member> opt = memberRepo.findByMemberId(pc, memberId);
        if (opt.isEmpty()) return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "会员不存在"));
        opt.get().setStatus("FROZEN_REDEMPTION");
        memberRepo.save(opt.get());
        return ResponseEntity.ok(ApiResponse.success("已冻结", null));
    }

    @PostMapping("/{memberId}/unfreeze")
    public ResponseEntity<ApiResponse<Void>> unfreeze(@PathVariable Long memberId) {
        String pc = TenantContext.getRequired();
        Optional<Member> opt = memberRepo.findByMemberId(pc, memberId);
        if (opt.isEmpty()) return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "会员不存在"));
        opt.get().setStatus("ENROLLED");
        memberRepo.save(opt.get());
        return ResponseEntity.ok(ApiResponse.success("已解冻", null));
    }

    @PostMapping("/merge")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> merge(@RequestBody Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        Long mainId = Long.valueOf(body.get("mainMemberId").toString());
        Long dupId = Long.valueOf(body.get("duplicateMemberId").toString());
        Optional<Member> mainOpt = memberRepo.findByMemberId(pc, mainId);
        Optional<Member> dupOpt = memberRepo.findByMemberId(pc, dupId);
        if (mainOpt.isEmpty() || dupOpt.isEmpty()) return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", "会员不存在"));

        Member dup = dupOpt.get(); dup.setStatus("MERGED"); memberRepo.save(dup);
        em.createQuery("UPDATE MemberUniqueKey k SET k.memberId=:m WHERE k.memberId=:d AND k.programCode=:pc")
            .setParameter("m", mainId).setParameter("d", dupId).setParameter("pc", pc).executeUpdate();

        Map<String, Object> r = new LinkedHashMap<>();
        r.put("mainMemberId", mainId); r.put("mergedMemberId", dupId); r.put("status", "COMPLETED");
        return ResponseEntity.ok(ApiResponse.success("合并完成", r));
    }

    // ==================== 辅助 ====================

    private Map<String, Object> toFullVO(Member m, String pc) {
        Map<String, Object> vo = new LinkedHashMap<>();
        vo.put("memberId", String.valueOf(m.getMemberId()));
        vo.put("tierCode", m.getTierCode());
        vo.put("status", m.getStatus());
        vo.put("schemaVersion", m.getSchemaVersion());
        vo.put("createdAt", m.getCreatedAt());
        vo.put("extAttributes", m.getExtAttributes());
        String mid = String.valueOf(m.getMemberId());

        // 积分账户
        List<Map<String, Object>> accounts = new ArrayList<>();
        for (String type : new String[]{"REWARD", "TIER", "CREDIT"}) {
            Map<String, Object> acc = new LinkedHashMap<>();
            acc.put("accountType", type);
            BigDecimal balance = txRepo.sumAvailableBalance(pc, m.getMemberId(), type);
            acc.put("balance", balance != null ? balance : BigDecimal.ZERO);
            try {
                var mas = em.createQuery(
                    "FROM MemberAccount a WHERE a.programCode=:pc AND a.memberId=:mid AND a.accountType=:t",
                    MemberAccount.class).setParameter("pc", pc).setParameter("mid", m.getMemberId()).setParameter("t", type).getResultList();
                if (!mas.isEmpty()) {
                    MemberAccount ma = mas.get(0);
                    acc.put("totalAccrued", ma.getTotalAccrued());
                    acc.put("totalRedeemed", ma.getTotalRedeemed());
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
            Map<String, Object> schema = schemaService.getCurrentSchema(pc, "MEMBER");
            if (schema != null) vo.put("fieldSchema", schema.get("fieldSchema"));
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