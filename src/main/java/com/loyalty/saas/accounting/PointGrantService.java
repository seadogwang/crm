package com.loyalty.saas.accounting;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.common.event.EventBridge;
import com.loyalty.saas.common.exception.BusinessException;
import com.loyalty.saas.domain.entity.AccountTransaction;
import com.loyalty.saas.domain.entity.MemberAccount;
import com.loyalty.saas.domain.entity.PointTypeDefinition;
import com.loyalty.saas.domain.repository.AccountTransactionRepository;
import com.loyalty.saas.domain.repository.MemberAccountRepository;
import com.loyalty.saas.domain.repository.PointTypeDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 积分发放服务 —— 瀑布流冲抵引擎（Waterfall Offset Engine）。
 *
 * <p>按设计文档 4.2.2 节实现。积分入账不是简单的 {@code UPDATE balance = balance + X}，
 * 而是经过三级瀑布流冲抵：
 *
 * <pre>
 *                            pointsToGrant
 *                                 │
 *                    ┌────────────▼────────────┐
 *                    │  Step 1: 补天窗          │
 *                    │  偿还被动透支 OVERDRAFT   │
 *                    │  (remainingAmount < 0)   │
 *                    └────────────┬────────────┘
 *                          剩余积分 > 0 ?
 *                                 │ YES
 *                    ┌────────────▼────────────┐
 *                    │  Step 2: 还信用          │
 *                    │  偿还主动信用额度使用     │
 *                    │  (creditUsed > 0)        │
 *                    └────────────┬────────────┘
 *                          剩余积分 > 0 ?
 *                                 │ YES
 *                    ┌────────────▼────────────┐
 *                    │  Step 3: 真实入账        │
 *                    │  生成 ACCRUAL 正向批次   │
 *                    │  (带过期时间)            │
 *                    └─────────────────────────┘
 * </pre>
 *
 * <p><b>线程安全</b>：同一会员的积分操作由消息队列按 memberId 分区串行化（Chapter 2.2），
 * 不依赖分布式锁。信用额度扣减使用 member_account.version 乐观锁。
 *
 * <p><b>BigDecimal 规范</b>：所有金额使用 {@link BigDecimal#compareTo} 比较，
 * 禁止使用 {@link BigDecimal#equals}（{@code 2.0 != 2.00}）。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Service
public class PointGrantService {

    private static final Logger log = LoggerFactory.getLogger(PointGrantService.class);

    private final MemberAccountRepository accountRepo;
    private final AccountTransactionRepository txRepo;
    private final EventBridge eventBridge;
    private final PointTypeDefinitionRepository pointTypeRepo;

    /** BigDecimal 精度：4 位小数，四舍五入 */
    private static final int SCALE = 4;

    public PointGrantService(MemberAccountRepository accountRepo,
                             AccountTransactionRepository txRepo,
                             PointTypeDefinitionRepository pointTypeRepo,
                             @Autowired(required = false) EventBridge eventBridge) {
        this.accountRepo = accountRepo;
        this.txRepo = txRepo;
        this.pointTypeRepo = pointTypeRepo;
        this.eventBridge = eventBridge;
    }

    /**
     * 瀑布流发分 —— 先补天窗，再还信用，最后入账。
     *
     * @param programCode    租户计划代码
     * @param memberId       会员 ID
     * @param accountType    账户类型（如 "REWARD_POINTS", "TIER_POINTS"）
     * @param pointsToGrant  拟发放积分（正数）
     * @param ruleCode       产生该积分的规则代码
     * @param ruleSnapshotId 规则版本快照 ID
     * @throws BusinessException 如果 pointsToGrant <= 0 或账户不存在
     */
    @Transactional(rollbackFor = Exception.class)
    public void grantPoints(String programCode, Long memberId, String accountType,
                            BigDecimal pointsToGrant, String ruleCode, String ruleSnapshotId) {
        // ---- 前置校验 ----
        if (programCode == null || programCode.isBlank()) {
            throw new BusinessException("ERR_INVALID_PARAM", "programCode is required");
        }
        if (memberId == null) {
            throw new BusinessException("ERR_INVALID_PARAM", "memberId is required");
        }
        if (pointsToGrant == null || pointsToGrant.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("ERR_INVALID_AMOUNT", "pointsToGrant must be > 0, got: " + pointsToGrant);
        }
        pointsToGrant = pointsToGrant.setScale(SCALE, RoundingMode.HALF_UP);

        log.info("[Grant] 发分开始: member={}, type={}, amount={}, rule={}",
                memberId, accountType, pointsToGrant, ruleCode);

        // 1. 悲观锁获取账户（仅用于风控参数，不操作实时余额）
        MemberAccount account = accountRepo.findByMemberIdAndTypeForUpdate(
                        programCode, memberId, accountType)
                .orElseThrow(() -> new BusinessException("ERR_ACCOUNT_NOT_FOUND",
                        "MemberAccount not found: " + programCode + "/" + memberId + "/" + accountType));

        // 冻结状态检查
        if ("FROZEN_ALL".equals(account.getFrozenStatus())) {
            throw new BusinessException("ERR_ACCOUNT_FROZEN", "账户已被冻结");
        }

        final Long accountId = account.getAccountId();

        BigDecimal remainingToGrant = pointsToGrant;

        // ==================== Step 1: 补天窗——偿还被动透支 ====================
        // 透支体现为 account_transaction 中存在 remaining_amount < 0 的 OVERDRAFT 记录
        List<AccountTransaction> overdraftBatches = txRepo.findOverdraftBatchesForUpdate(
                programCode, memberId, accountType);

        for (AccountTransaction overdraft : overdraftBatches) {
            if (remainingToGrant.compareTo(BigDecimal.ZERO) <= 0) break;

            BigDecimal debt = overdraft.getRemainingAmount().abs(); // 透支金额（取绝对值）
            BigDecimal offsetAmount = remainingToGrant.min(debt);   // 本次冲抵额

            // 生成 REPAYMENT 还款流水（正向入账，冲抵透支）
            insertTransaction(programCode, memberId, accountType, accountId, "REPAYMENT",
                    offsetAmount, null, ruleCode, ruleSnapshotId, overdraft.getReferenceEventId());

            // 减少透支额度（remainingAmount 从负数向 0 靠近）
            BigDecimal newOverdraft = overdraft.getRemainingAmount().add(offsetAmount);
            overdraft.setRemainingAmount(newOverdraft);
            if (newOverdraft.compareTo(BigDecimal.ZERO) == 0) {
                overdraft.setStatus("SETTLED"); // 透支已还清
            }
            txRepo.save(overdraft);

            remainingToGrant = remainingToGrant.subtract(offsetAmount);
            log.debug("[Grant] 补天窗冲抵: debt={}, offset={}, remainingOverdraft={}, grantLeft={}",
                    debt, offsetAmount, newOverdraft, remainingToGrant);
        }

        // ==================== Step 2: 跨账户还信用——用当前资产偿还 CREDIT 账户欠款 ====================
        // 设计文档 4.2.2: 信用欠款记录在独立的 CREDIT 账户上，需跨账户查询
        if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0) {
            MemberAccount creditAccount = accountRepo.findByMemberIdAndTypeForUpdate(
                    programCode, memberId, "CREDIT").orElse(null);

            if (creditAccount != null && creditAccount.getCreditUsed().compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal creditDebt = creditAccount.getCreditUsed();
                BigDecimal offsetAmount = remainingToGrant.min(creditDebt);

                // 在 CREDIT 账户生成 CREDIT_REPAY 流水（正向入账，偿还信用）
                insertTransaction(programCode, memberId, "CREDIT", creditAccount.getAccountId(),
                        "CREDIT_REPAY", offsetAmount, null, ruleCode, ruleSnapshotId, null);

                // 扣减 CREDIT 账户的信用已用额度（乐观锁 version 保护）
                creditAccount.setCreditUsed(creditAccount.getCreditUsed().subtract(offsetAmount));

                // R-PTS-08: 信用还清且冻结状态为 FROZEN_REDEMPTION 时自动解冻
                if (creditAccount.getCreditUsed().compareTo(BigDecimal.ZERO) == 0
                        && "FROZEN_REDEMPTION".equals(creditAccount.getFrozenStatus())) {
                    creditAccount.setFrozenStatus("ACTIVE");
                    log.info("[Grant] 信用已还清，自动解冻兑换权限: member={}", memberId);
                }

                accountRepo.save(creditAccount);

                remainingToGrant = remainingToGrant.subtract(offsetAmount);
                log.debug("[Grant] 跨账户信用还款: creditDebt={}, offset={}, creditUsedLeft={}, grantLeft={}",
                        creditDebt, offsetAmount, creditAccount.getCreditUsed(), remainingToGrant);
            }
        }

        // ==================== Step 3: 真实入账——生成 ACCRUAL 正向批次 ====================
        if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0) {
            LocalDateTime expiry = calculateExpiryDate(programCode, accountType);
            insertTransaction(programCode, memberId, accountType, accountId, "ACCRUAL",
                    remainingToGrant, expiry, ruleCode, ruleSnapshotId, null);
            log.debug("[Grant] ACCRUAL 入账: amount={}, expiresAt={}", remainingToGrant, expiry);
        } else if (remainingToGrant.compareTo(BigDecimal.ZERO) == 0) {
            log.info("[Grant] 发分完全用于冲抵，无正向入账: member={}, original={}",
                    memberId, pointsToGrant);
        }

        // ==================== Step 4: 更新累计统计 ====================
        // R-PTS-06: totalAccrued 只统计实际入账部分（remainingToGrant），不含冲抵透支/信用的部分
        account.setTotalAccrued(account.getTotalAccrued().add(remainingToGrant.compareTo(BigDecimal.ZERO) > 0 ? remainingToGrant : BigDecimal.ZERO));
        accountRepo.save(account);

        log.info("[Grant] 发分完成: member={}, type={}, originalRequest={}, actualAccrued={}, totalAccrued={}",
                memberId, accountType, pointsToGrant, remainingToGrant, account.getTotalAccrued());
    }

    // ==================== 辅助方法 ====================

    /**
     * 插入积分流水。
     *
     * @param amount    变动金额（正数为入账，负数为出账）
     * @param expiresAt 过期时间（ACCRUAL 类型必填，其他类型为 null）
     */
    private AccountTransaction insertTransaction(String programCode, Long memberId,
                                                  String accountType, Long accountId,
                                                  String transactionType,
                                                  BigDecimal amount, LocalDateTime expiresAt,
                                                  String ruleCode, String ruleSnapshotId,
                                                  String referenceEventId) {
        AccountTransaction tx = AccountTransaction.builder()
                .accountId(accountId)
                .programCode(programCode)
                .memberId(memberId)
                .accountType(accountType)
                .transactionType(transactionType)
                .amount(amount.setScale(SCALE, RoundingMode.HALF_UP))
                .remainingAmount(amount.setScale(SCALE, RoundingMode.HALF_UP))
                .expiresAt(expiresAt)
                .ruleCode(ruleCode)
                .ruleSnapshotId(ruleSnapshotId)
                .referenceEventId(referenceEventId)
                .operationKey(programCode + ":" + transactionType + ":" + memberId + ":" + System.currentTimeMillis())
                .status("ACTIVE")
                .createdAt(LocalDateTime.now())
                .build();
        return txRepo.save(tx);
    }

    /**
     * 计算积分过期时间（默认 365 天，从 Program 配置读取）。
     */
    /**
     * 计算积分过期时间，根据积分类型配置的过期模式和值。
     *
     * <p>支持三种过期模式：
     * <ul>
     *   <li>{@code FIXED_DAYS}：从当前时间起 + N 天</li>
     *   <li>{@code CALENDAR_MONTHS}：N 个完整自然月后的月末最后一天<br>
     *       例如：5月 + 12个月 = 次年6月30日</li>
     *   <li>{@code CALENDAR_YEARS}：N 个完整自然年后的年末最后一天<br>
     *       例如：2025年 + 1年 = 2026年12月31日</li>
     * </ul>
     * 如果值为 0，表示永不过期，返回 null。
     */
    private LocalDateTime calculateExpiryDate(String programCode, String accountType) {
        // 查找积分类型配置
        PointTypeDefinition pt = pointTypeRepo
                .findByProgramCodeAndTypeCode(programCode, accountType)
                .orElse(null);

        String expiryMode = (pt != null && pt.getExpiryMode() != null) ? pt.getExpiryMode() : "FIXED_DAYS";
        Integer expiryValue = (pt != null && pt.getExpiryValue() != null) ? pt.getExpiryValue() : 365;

        // 值为 0 表示永不过期
        if (expiryValue == 0) {
            log.debug("[Grant] 积分永不过期: type={}", accountType);
            return null;
        }

        LocalDateTime now = LocalDateTime.now();
        switch (expiryMode) {
            case "CALENDAR_MONTHS":
                // N 个完整自然月后，月末最后一天
                LocalDateTime monthEnd = now.plusMonths(expiryValue);
                monthEnd = monthEnd.withDayOfMonth(monthEnd.toLocalDate().lengthOfMonth());
                monthEnd = monthEnd.withHour(23).withMinute(59).withSecond(59);
                log.debug("[Grant] 自然月过期: type={}, months={}, expiresAt={}", accountType, expiryValue, monthEnd);
                return monthEnd;

            case "CALENDAR_YEARS":
                // N 个完整自然年后，年末最后一天
                LocalDateTime yearEnd = now.plusYears(expiryValue);
                yearEnd = yearEnd.withMonth(12).withDayOfMonth(31);
                yearEnd = yearEnd.withHour(23).withMinute(59).withSecond(59);
                log.debug("[Grant] 自然年过期: type={}, years={}, expiresAt={}", accountType, expiryValue, yearEnd);
                return yearEnd;

            case "FIXED_DAYS":
            default:
                LocalDateTime fixed = now.plusDays(expiryValue);
                log.debug("[Grant] 固定天数过期: type={}, days={}, expiresAt={}", accountType, expiryValue, fixed);
                return fixed;
        }
    }

    /**
     * 授信额度授予 — 设计文档 4.4。
     * 不通过发分流水，直接修改 CREDIT 账户的 credit_limit。
     * 若用户尚无 CREDIT 账户则自动创建。
     */
    @Transactional(rollbackFor = Exception.class)
    public void setCreditLimit(String programCode, Long memberId, BigDecimal newLimit) {
        if (newLimit == null || newLimit.compareTo(BigDecimal.ZERO) < 0) {
            throw new BusinessException("ERR_INVALID_CREDIT", "授信额度不能为负数");
        }
        MemberAccount creditAccount = accountRepo.findByMemberIdAndTypeForUpdate(
                programCode, memberId, "CREDIT").orElse(null);

        if (creditAccount == null) {
            creditAccount = MemberAccount.builder()
                    .programCode(programCode)
                    .memberId(memberId)
                    .accountType("CREDIT")
                    .creditLimit(BigDecimal.ZERO)
                    .creditUsed(BigDecimal.ZERO)
                    .overdraftLimit(BigDecimal.ZERO)
                    .totalAccrued(BigDecimal.ZERO)
                    .totalRedeemed(BigDecimal.ZERO)
                    .totalExpired(BigDecimal.ZERO)
                    .build();
            creditAccount = accountRepo.save(creditAccount);
            log.info("[Credit] CREDIT 账户已创建: member={}, accountId={}", memberId, creditAccount.getAccountId());
        }
        creditAccount.setCreditLimit(newLimit);
        accountRepo.save(creditAccount);
        log.info("[Credit] 授信额度已设置: member={}, creditLimit={}", memberId, newLimit);
    }
}