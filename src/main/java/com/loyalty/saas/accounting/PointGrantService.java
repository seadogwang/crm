package com.loyalty.saas.accounting;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.common.event.EventBridge;
import com.loyalty.saas.common.exception.BusinessException;
import com.loyalty.saas.domain.entity.AccountTransaction;
import com.loyalty.saas.domain.entity.MemberAccount;
import com.loyalty.saas.domain.repository.AccountTransactionRepository;
import com.loyalty.saas.domain.repository.MemberAccountRepository;
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

    /** BigDecimal 精度：4 位小数，四舍五入 */
    private static final int SCALE = 4;

    public PointGrantService(MemberAccountRepository accountRepo,
                             AccountTransactionRepository txRepo,
                             @Autowired(required = false) EventBridge eventBridge) {
        this.accountRepo = accountRepo;
        this.txRepo = txRepo;
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
                    offsetAmount, null, ruleCode, overdraft.getReferenceEventId());

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

        // ==================== Step 2: 还信用——偿还主动信用欠款 ====================
        if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0
                && account.getCreditUsed().compareTo(BigDecimal.ZERO) > 0) {

            BigDecimal creditDebt = account.getCreditUsed();
            BigDecimal offsetAmount = remainingToGrant.min(creditDebt);

            insertTransaction(programCode, memberId, accountType, accountId, "CREDIT_REPAY",
                    offsetAmount, null, ruleCode, null);

            // 扣减信用已用额度（乐观锁 version 保护）
            account.setCreditUsed(account.getCreditUsed().subtract(offsetAmount));

            remainingToGrant = remainingToGrant.subtract(offsetAmount);
            log.debug("[Grant] 信用还款: debt={}, offset={}, creditUsedLeft={}, grantLeft={}",
                    creditDebt, offsetAmount, account.getCreditUsed(), remainingToGrant);
        }

        // ==================== Step 3: 真实入账——生成 ACCRUAL 正向批次 ====================
        if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0) {
            LocalDateTime expiry = calculateExpiryDate();
            insertTransaction(programCode, memberId, accountType, accountId, "ACCRUAL",
                    remainingToGrant, expiry, ruleCode, null);
            log.debug("[Grant] ACCRUAL 入账: amount={}, expiresAt={}", remainingToGrant, expiry);
        } else if (remainingToGrant.compareTo(BigDecimal.ZERO) == 0) {
            log.info("[Grant] 发分完全用于冲抵，无正向入账: member={}, original={}",
                    memberId, pointsToGrant);
        }

        // ==================== Step 4: 更新累计统计 ====================
        account.setTotalAccrued(account.getTotalAccrued().add(pointsToGrant));
        accountRepo.save(account);

        log.info("[Grant] 发分完成: member={}, type={}, granted={}, totalAccrued={}",
                memberId, accountType, pointsToGrant, account.getTotalAccrued());
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
                                                  String ruleCode, String referenceEventId) {
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
    private LocalDateTime calculateExpiryDate() {
        return LocalDateTime.now().plusDays(365);
    }
}