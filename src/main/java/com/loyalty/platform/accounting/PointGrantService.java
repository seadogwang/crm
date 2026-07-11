package com.loyalty.platform.accounting;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.event.EventBridge;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.common.util.ExpiryCalculator;
import com.loyalty.platform.domain.entity.AccountTransaction;
import com.loyalty.platform.domain.entity.MemberAccount;
import com.loyalty.platform.domain.entity.PointTypeDefinition;
import com.loyalty.platform.domain.entity.RepaymentAllocation;
import com.loyalty.platform.domain.repository.AccountTransactionRepository;
import com.loyalty.platform.domain.repository.MemberAccountRepository;
import com.loyalty.platform.domain.repository.PointTypeDefinitionRepository;
import com.loyalty.platform.domain.repository.RepaymentAllocationRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
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
    private final RepaymentAllocationRepository repayAllocRepo;

    /** BigDecimal 精度：4 位小数，四舍五入 */
    private static final int SCALE = 4;

    public PointGrantService(MemberAccountRepository accountRepo,
                             AccountTransactionRepository txRepo,
                             PointTypeDefinitionRepository pointTypeRepo,
                             RepaymentAllocationRepository repayAllocRepo,
                             @Autowired(required = false) EventBridge eventBridge) {
        this.accountRepo = accountRepo;
        this.txRepo = txRepo;
        this.pointTypeRepo = pointTypeRepo;
        this.repayAllocRepo = repayAllocRepo;
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

        // ==================== Step 2: 负债冲抵——偿还可冲抵积分 ====================
        // 设计文档 §4.3: 正式积分发放时，检查会员所有 allow_repay=true 的负债流水
        // 按 FEFO（过期时间从近到远）冲抵
        // 冲抵明细先占位 repaymentTxId=0L，在 Step 4 ACCRUAL 创建后回填真实 ID
        List<RepaymentAllocation> step2Allocations = new ArrayList<>();
        if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0) {
            PointTypeDefinition currentPt = pointTypeRepo
                    .findByProgramCodeAndTypeCode(programCode, accountType).orElse(null);
            if (currentPt == null || !Boolean.TRUE.equals(currentPt.getAllowRepay())) {
                // 当前积分类型不是负债积分，检查是否需要冲抵其他负债
                List<AccountTransaction> repayableTxList = txRepo.findRepayableForMember(
                        programCode, memberId);
                for (AccountTransaction repayableTx : repayableTxList) {
                    if (remainingToGrant.compareTo(BigDecimal.ZERO) <= 0) break;

                    // null-safe: 历史 DB 行的 remainingAmount/repaidAmount 可能为 null
                    BigDecimal availableDebt = repayableTx.getRemainingAmount() != null
                            ? repayableTx.getRemainingAmount() : BigDecimal.ZERO;
                    if (availableDebt.compareTo(BigDecimal.ZERO) <= 0) continue;

                    BigDecimal offsetAmount = remainingToGrant.min(availableDebt);

                    // 记录冲抵快照
                    BigDecimal snapshotBefore = availableDebt;

                    // 减少负债流水的 remainingAmount (null-safe)
                    BigDecimal newRemaining = availableDebt.subtract(offsetAmount);
                    repayableTx.setRemainingAmount(newRemaining);
                    BigDecimal currentRepaid = repayableTx.getRepaidAmount() != null
                            ? repayableTx.getRepaidAmount() : BigDecimal.ZERO;
                    repayableTx.setRepaidAmount(currentRepaid.add(offsetAmount));
                    if (newRemaining.compareTo(BigDecimal.ZERO) == 0) {
                        repayableTx.setStatus("REPAID");
                    }
                    txRepo.save(repayableTx);

                    // 记录冲抵明细 (repaymentTxId 占位，Step 4 后回填)
                    RepaymentAllocation alloc = RepaymentAllocation.builder()
                            .programCode(programCode)
                            .memberId(memberId)
                            .repaymentTxId(0L) // 占位：ACCRUAL 创建后回填真实 ID
                            .repayableTxId(repayableTx.getId())
                            .offsetAmount(offsetAmount)
                            .snapshotRemainingBefore(snapshotBefore)
                            .status("ACTIVE")
                            .build();
                    repayAllocRepo.save(alloc);
                    step2Allocations.add(alloc);

                    // 更新负债账户的 pending_repay_amount
                    try {
                        var repayAccount = accountRepo.findByMemberIdAndTypeForUpdate(
                                programCode, memberId, repayableTx.getAccountType()).orElse(null);
                        if (repayAccount != null) {
                            repayAccount.setPendingRepayAmount(
                                    repayAccount.getPendingRepayAmount().subtract(offsetAmount));
                            accountRepo.save(repayAccount);
                        }
                    } catch (Exception e) {
                        log.warn("[Grant] 更新 pending_repay_amount 失败: {}", e.getMessage());
                    }

                    remainingToGrant = remainingToGrant.subtract(offsetAmount);
                    log.info("[Grant] 负债冲抵: repayableTxId={}, debt={}, offset={}, remainingDebt={}, grantLeft={}",
                            repayableTx.getId(), snapshotBefore, offsetAmount,
                            newRemaining, remainingToGrant);
                }
            }
        }

        // ==================== Step 3: 跨账户还信用——用当前资产偿还信用账户欠款 ====================
        // 动态查找信用账户类型，不再硬编码 CREDIT
        String creditType = getCreditTypeCode(programCode);
        if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0 && creditType != null) {
            MemberAccount creditAccount = accountRepo.findByMemberIdAndTypeForUpdate(
                    programCode, memberId, creditType).orElse(null);

            if (creditAccount != null && creditAccount.getCreditUsed().compareTo(BigDecimal.ZERO) > 0) {
                BigDecimal creditDebt = creditAccount.getCreditUsed();
                BigDecimal offsetAmount = remainingToGrant.min(creditDebt);

                // 在信用账户生成 CREDIT_REPAY 流水
                insertTransaction(programCode, memberId, creditType, creditAccount.getAccountId(),
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

        // ==================== Step 4: 真实入账——生成 ACCRUAL 正向批次 ====================
        AccountTransaction accrualTx = null;
        if (remainingToGrant.compareTo(BigDecimal.ZERO) > 0) {
            LocalDateTime expiry = calculateExpiryDate(programCode, accountType);
            accrualTx = insertTransaction(programCode, memberId, accountType, accountId, "ACCRUAL",
                    remainingToGrant, expiry, ruleCode, ruleSnapshotId, null);
            // 如果是负债积分，标记为可冲抵
            PointTypeDefinition pt = pointTypeRepo
                    .findByProgramCodeAndTypeCode(programCode, accountType).orElse(null);
            if (pt != null && Boolean.TRUE.equals(pt.getAllowRepay())) {
                accrualTx.setRepayable(true);
                txRepo.save(accrualTx);
                // 更新账户的 pending_repay_amount
                try {
                    account.setPendingRepayAmount(
                            account.getPendingRepayAmount().add(remainingToGrant));
                    accountRepo.save(account);
                } catch (Exception e) {
                    log.warn("[Grant] 更新 pending_repay_amount 失败: {}", e.getMessage());
                }
            }
            log.debug("[Grant] ACCRUAL 入账: amount={}, expiresAt={}", remainingToGrant, expiry);
        } else if (remainingToGrant.compareTo(BigDecimal.ZERO) == 0) {
            log.info("[Grant] 发分完全用于冲抵，无正向入账: member={}, original={}",
                    memberId, pointsToGrant);
        }

        // ==================== 回填 Step 2 冲抵明细的 repaymentTxId ====================
        if (accrualTx != null && !step2Allocations.isEmpty()) {
            for (RepaymentAllocation alloc : step2Allocations) {
                alloc.setRepaymentTxId(accrualTx.getId());
                repayAllocRepo.save(alloc);
            }
            log.debug("[Grant] 回填冲抵明细 repaymentTxId: accrualId={}, allocs={}",
                    accrualTx.getId(), step2Allocations.size());
        }

        // ==================== Step 5: 更新累计统计（已废弃预计算，改为实时查询 account_transaction 表） ====================
        log.info("[Grant] 发分完成: member={}, type={}, request={}, actualAccrued={}",
                memberId, accountType, pointsToGrant, remainingToGrant);
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
                .repayable(false)
                .repaidAmount(BigDecimal.ZERO)
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
     * 委托给 {@link ExpiryCalculator} 确保与等级过期逻辑一致。
     *
     * <p>如果值为 0，表示永不过期，返回 null。
     */
    private LocalDateTime calculateExpiryDate(String programCode, String accountType) {
        // 查找积分类型配置
        PointTypeDefinition pt = pointTypeRepo
                .findByProgramCodeAndTypeCode(programCode, accountType)
                .orElse(null);

        String expiryMode = (pt != null && pt.getExpiryMode() != null) ? pt.getExpiryMode() : "FIXED_DAYS";
        Integer expiryValue = (pt != null && pt.getExpiryValue() != null) ? pt.getExpiryValue() : 365;

        LocalDateTime result = ExpiryCalculator.calculateExpiry(LocalDateTime.now(), expiryMode, expiryValue);
        if (result == null) {
            log.debug("[Grant] 积分永不过期: type={}", accountType);
        } else {
            log.debug("[Grant] 过期时间: type={}, mode={}, value={}, expiresAt={}",
                    accountType, expiryMode, expiryValue, result);
        }
        return result;
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
        String creditType = getCreditTypeCode(programCode);
        if (creditType == null) {
            throw new BusinessException("ERR_NO_CREDIT_TYPE", "未配置信用类型积分");
        }
        MemberAccount creditAccount = accountRepo.findByMemberIdAndTypeForUpdate(
                programCode, memberId, creditType).orElse(null);

        if (creditAccount == null) {
            creditAccount = MemberAccount.builder()
                    .programCode(programCode)
                    .memberId(memberId)
                    .accountType(creditType)
                    .creditLimit(BigDecimal.ZERO)
                    .creditUsed(BigDecimal.ZERO)
                    .overdraftLimit(BigDecimal.ZERO)
                    .build();
            creditAccount = accountRepo.save(creditAccount);
            log.info("[Credit] 信用账户已创建: member={}, accountId={}", memberId, creditAccount.getAccountId());
        }
        creditAccount.setCreditLimit(newLimit);
        accountRepo.save(creditAccount);
        log.info("[Credit] 授信额度已设置: member={}, creditLimit={}", memberId, newLimit);
    }

    /** 动态获取信用类型代码，不再硬编码 CREDIT */
    private String getCreditTypeCode(String programCode) {
        return pointTypeRepo.findByProgramCodeAndStatus(programCode, "ACTIVE").stream()
                .filter(pt -> Boolean.TRUE.equals(pt.getAllowNegative())
                        || (pt.getCreditLimit() != null && pt.getCreditLimit().compareTo(BigDecimal.ZERO) > 0))
                .findFirst()
                .map(PointTypeDefinition::getTypeCode)
                .orElse(null);
    }
}