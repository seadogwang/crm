package com.loyalty.platform.rules;

import com.loyalty.platform.domain.entity.Member;
import com.loyalty.platform.domain.entity.MemberAccount;
import com.loyalty.platform.domain.repository.MemberAccountRepository;
import com.loyalty.platform.domain.repository.MemberRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
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

    public MemberVariableService(MemberRepository memberRepo, MemberAccountRepository accountRepo) {
        this.memberRepo = memberRepo;
        this.accountRepo = accountRepo;
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
     * 获取会员等级积分（TIER 账户余额）。
     *
     * <p>TIER_POINTS = totalAccrued - totalRedeemed - totalExpired
     *
     * @param programCode 租户代码
     * @param memberId    会员 ID
     * @return 等级积分余额
     */
    public BigDecimal getTierPoints(String programCode, Long memberId) {
        MemberAccount tierAccount = accountRepo.findByMemberIdAndType(programCode, memberId, "TIER_POINTS")
                .orElse(null);

        if (tierAccount == null) {
            log.debug("[Variable] TIER 账户不存在: member={}", memberId);
            return BigDecimal.ZERO;
        }

        BigDecimal accrued = tierAccount.getTotalAccrued() != null ? tierAccount.getTotalAccrued() : BigDecimal.ZERO;
        BigDecimal redeemed = tierAccount.getTotalRedeemed() != null ? tierAccount.getTotalRedeemed() : BigDecimal.ZERO;
        BigDecimal expired = tierAccount.getTotalExpired() != null ? tierAccount.getTotalExpired() : BigDecimal.ZERO;

        BigDecimal balance = accrued.subtract(redeemed).subtract(expired);
        log.debug("[Variable] TIER_POINTS: member={}, accrued={}, redeemed={}, expired={}, balance={}",
                memberId, accrued, redeemed, expired, balance);
        return balance;
    }

    /**
     * 获取评估维度的实际值 — 统一入口，供规则引擎使用。
     *
     * @param dimension 评估维度代码 (TIER_POINTS / ORDER_COUNT / TOTAL_AMOUNT 等)
     * @return 维度值
     */
    public BigDecimal getDimensionValue(String programCode, Long memberId, String dimension) {
        switch (dimension) {
            case "TIER_POINTS":
                return getTierPoints(programCode, memberId);
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
}
