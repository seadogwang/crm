package com.loyalty.platform.rules;

import com.loyalty.platform.domain.entity.Member;
import com.loyalty.platform.domain.entity.MemberAccount;
import com.loyalty.platform.domain.entity.PointTypeDefinition;
import com.loyalty.platform.domain.repository.AccountTransactionRepository;
import com.loyalty.platform.domain.repository.MemberAccountRepository;
import com.loyalty.platform.domain.repository.MemberRepository;
import com.loyalty.platform.domain.repository.PointTypeDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 会员动态变量服务 — 供等级规则引擎读取评估维度值。
 *
 * <p>评估维度来源（设计文档 §4.2）：
 * <ul>
 *   <li>{@code TIER_POINTS} — member_account TIER 账户余额</li>
 *   <li>{@code ORDER_COUNT} / {@code ORDER_COUNT_DAYS} / {@code TOTAL_AMOUNT}
 *       / {@code CONTINUOUS_DAYS} / {@code LAST_ORDER_DAYS} — member.ext_attributes 动态变量</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.8.0
 */
@Service
public class MemberVariableService {

    private static final Logger log = LoggerFactory.getLogger(MemberVariableService.class);

    private final MemberRepository memberRepo;
    private final MemberAccountRepository accountRepo;
    private final PointTypeDefinitionRepository pointTypeRepo;
    private final AccountTransactionRepository txRepo;

    public MemberVariableService(MemberRepository memberRepo, MemberAccountRepository accountRepo,
                                  PointTypeDefinitionRepository pointTypeRepo,
                                  AccountTransactionRepository txRepo) {
        this.memberRepo = memberRepo;
        this.accountRepo = accountRepo;
        this.pointTypeRepo = pointTypeRepo;
        this.txRepo = txRepo;
    }

    /**
     * 获取会员动态变量值（从 ext_attributes 读取）。
     *
     * @param programCode 租户代码
     * @param memberId    会员 ID
     * @param variableName 变量名 (如 order_count_total, total_amount 等)
     * @return 变量值（数值型），不存在或为 null 时返回 BigDecimal.ZERO
     */
    public BigDecimal getVariable(String programCode, Long memberId, String variableName) {
        Member member = memberRepo.findByMemberId(programCode, memberId).orElse(null);
        if (member == null || member.getExtAttributes() == null) {
            log.debug("[Variable] 会员或 ext_attributes 不存在: member={}, var={}", memberId, variableName);
            return BigDecimal.ZERO;
        }

        Object value = member.getExtAttributes().get(variableName);
        if (value == null) {
            return BigDecimal.ZERO;
        }

        try {
            if (value instanceof Number) {
                return new BigDecimal(value.toString());
            }
            return new BigDecimal(String.valueOf(value));
        } catch (NumberFormatException e) {
            log.warn("[Variable] 变量值非数值: member={}, var={}, value={}", memberId, variableName, value);
            return BigDecimal.ZERO;
        }
    }

    /**
     * 获取可用兑换积分 — 汇总所有 isRedeemable=true 的积分类型，过滤有效期。
     */
    public BigDecimal getRedeemableBalance(String programCode, Long memberId) {
        List<PointTypeDefinition> redeemableTypes = pointTypeRepo.findByProgramCodeAndStatus(programCode, "ACTIVE")
                .stream()
                .filter(pt -> Boolean.TRUE.equals(pt.getIsRedeemable()))
                .toList();

        if (redeemableTypes.isEmpty()) {
            return BigDecimal.ZERO;
        }

        BigDecimal total = BigDecimal.ZERO;
        for (PointTypeDefinition pt : redeemableTypes) {
            BigDecimal balance = txRepo.sumAvailableBalance(programCode, memberId, pt.getTypeCode());
            total = total.add(balance != null ? balance : BigDecimal.ZERO);
        }
        log.debug("[Variable] 可用兑换积分汇总: member={}, total={}", memberId, total);
        return total;
    }

    /**
     * 获取等级积分 — 按积分类型单独汇总，不再混合。
     * 每个 isTierCalc=true 的积分类型独立计算，供规则引擎按维度使用。
     */
    public BigDecimal getTierBalanceByType(String programCode, Long memberId, String accountType) {
        BigDecimal balance = txRepo.sumAvailableBalance(programCode, memberId, accountType);
        return balance != null ? balance : BigDecimal.ZERO;
    }

    /**
     * 获取指定类型的累计值（发分或核销），实时查流水表。
     */
    public BigDecimal getAccruedByType(String programCode, Long memberId, String accountType) {
        BigDecimal sum = txRepo.sumByType(programCode, memberId, accountType, "ACCRUAL");
        return sum != null ? sum : BigDecimal.ZERO;
    }

    public BigDecimal getRedeemedByType(String programCode, Long memberId, String accountType) {
        BigDecimal sum = txRepo.sumByType(programCode, memberId, accountType, "REDEMPTION");
        return sum != null ? sum : BigDecimal.ZERO;
    }

    /**
     * 获取评估维度的实际值 — 统一入口，供规则引擎使用。
     *
     * @param dimension 评估维度代码 (TIER_POINTS / ORDER_COUNT / TOTAL_AMOUNT 等)
     * @return 维度值
     */
    public BigDecimal getDimensionValue(String programCode, Long memberId, String dimension, Integer windowDays) {
        // 先检查是否是已知的积分类型代码（如 TIER, PURCHASE_COUNT, BEHAVIOR_POINTS）
        PointTypeDefinition pt = pointTypeRepo.findByProgramCodeAndTypeCode(programCode, dimension).orElse(null);
        if (pt != null && Boolean.TRUE.equals(pt.getIsTierCalc())) {
            return getPointTypeAccrualInWindow(programCode, memberId, dimension, windowDays);
        }

        switch (dimension) {
            case "TIER_POINTS":
                return getTierBalanceByType(programCode, memberId, "TIER");
            case "ORDER_COUNT":
                return getVariable(programCode, memberId, "order_count_total");
            case "ORDER_COUNT_DAYS":
                return getVariable(programCode, memberId, "order_count_90days");
            case "TOTAL_AMOUNT":
                return getVariable(programCode, memberId, "total_amount");
            case "CONTINUOUS_DAYS":
                return getVariable(programCode, memberId, "continuous_login_days");
            case "LAST_ORDER_DAYS":
                return getVariable(programCode, memberId, "last_order_days");
            default:
                log.warn("[Variable] 未知评估维度: {}", dimension);
                return BigDecimal.ZERO;
        }
    }

    /**
     * 获取指定积分类型在时间窗口内的 ACCRUAL 累计值。
     * 查询 account_transaction 流水表，按评估周期过滤。
     */
    private BigDecimal getPointTypeAccrualInWindow(String programCode, Long memberId, String accountType, Integer windowDays) {
        LocalDateTime since = windowDays != null && windowDays > 0
                ? LocalDateTime.now().minusDays(windowDays)
                : LocalDateTime.of(2000, 1, 1, 0, 0); // 无窗口限制则查全部
        BigDecimal sum = txRepo.sumAccrualSince(programCode, memberId, accountType, since);
        log.debug("[Variable] 积分类型 {} 在{}天内的累计: {}", accountType, windowDays, sum);
        return sum;
    }

    // 保留原有方法（兼容无窗口参数调用）
    public BigDecimal getDimensionValue(String programCode, Long memberId, String dimension) {
        return getDimensionValue(programCode, memberId, dimension, null);
    }
}
