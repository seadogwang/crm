package com.loyalty.saas.accounting;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.common.event.EventBridge;
import com.loyalty.saas.common.exception.BusinessException;
import com.loyalty.saas.domain.entity.AccountTransaction;
import com.loyalty.saas.domain.entity.MemberAccount;
import com.loyalty.saas.domain.entity.RedemptionAllocation;
import com.loyalty.saas.domain.repository.AccountTransactionRepository;
import com.loyalty.saas.domain.repository.MemberAccountRepository;
import com.loyalty.saas.domain.repository.RedemptionAllocationRepository;
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
 * 积分核销服务 —— FIFO 先进先出兑换引擎（含惰性过期与批次溯源）。
 *
 * <p>按设计文档 4.3 节实现。核销遵循严格的 FIFO 原则：
 * <ol>
 *   <li>实时汇总 {@code SUM(remaining_amount)} 校验可用余额（含信用额度）</li>
 *   <li>{@code SELECT ... FOR UPDATE} 按过期时间升序锁定所有 ACTIVE 批次</li>
 *   <li>遍历批次，惰性检查过期（已过期 → 跳过 + 标记 EXPIRED）</li>
 *   <li>逐笔扣减 remaining_amount，生成 {@link RedemptionAllocation} 分摊记录</li>
 *   <li>自有余额不足时从信用额度透支</li>
 * </ol>
 *
 * <p><b>FIFO 排序</b>：过期时间升序（先过期先消耗）→ 创建时间升序（同过期时间按时间先后）。
 *
 * <p><b>线程安全</b>：同一会员的积分操作由消息队列按 memberId 分区串行化。
 * 悲观锁 {@code FOR UPDATE} 确保同一批次不会被并发扣减。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Service
public class PointRedeemService {

    private static final Logger log = LoggerFactory.getLogger(PointRedeemService.class);

    private final AccountTransactionRepository txRepo;
    private final MemberAccountRepository accountRepo;
    private final RedemptionAllocationRepository allocationRepo;
    private final EventBridge eventBridge;

    private static final int SCALE = 4;

    public PointRedeemService(AccountTransactionRepository txRepo,
                               MemberAccountRepository accountRepo,
                               RedemptionAllocationRepository allocationRepo,
                               @Autowired(required = false) EventBridge eventBridge) {
        this.txRepo = txRepo;
        this.accountRepo = accountRepo;
        this.allocationRepo = allocationRepo;
        this.eventBridge = eventBridge;
    }

    /**
     * FIFO 核销积分。
     *
     * @param programCode     租户计划代码
     * @param memberId        会员 ID
     * @param accountType     账户类型
     * @param pointsToRedeem  拟核销积分（正数，内部会转负）
     * @throws BusinessException 如果余额不足（含信用额度）或参数非法
     */
    @Transactional(rollbackFor = Exception.class)
    public void redeemPoints(String programCode, Long memberId, String accountType,
                              BigDecimal pointsToRedeem) {
        // ---- 前置校验 ----
        if (programCode == null || programCode.isBlank()) {
            throw new BusinessException("ERR_INVALID_PARAM", "programCode is required");
        }
        if (memberId == null) {
            throw new BusinessException("ERR_INVALID_PARAM", "memberId is required");
        }
        if (pointsToRedeem == null || pointsToRedeem.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("ERR_INVALID_AMOUNT", "pointsToRedeem must be > 0");
        }
        pointsToRedeem = pointsToRedeem.setScale(SCALE, RoundingMode.HALF_UP);

        log.info("[Redeem] 核销开始: member={}, type={}, amount={}", memberId, accountType, pointsToRedeem);

        // ---- Step 1: 获取本账户和 CREDIT 账户风控参数 ----
        MemberAccount account = accountRepo.findByMemberIdAndTypeForUpdate(
                        programCode, memberId, accountType)
                .orElseThrow(() -> new BusinessException("ERR_ACCOUNT_NOT_FOUND",
                        "MemberAccount not found: " + programCode + "/" + memberId + "/" + accountType));

        // 冻结检查
        if ("FROZEN_ALL".equals(account.getFrozenStatus()) || "FROZEN_REDEMPTION".equals(account.getFrozenStatus())) {
            throw new BusinessException("ERR_ACCOUNT_FROZEN", "账户已被冻结兑换权限");
        }

        // 加载 CREDIT 账户（信用额度在独立账户上）
        MemberAccount creditAccount = accountRepo.findByMemberIdAndTypeForUpdate(
                programCode, memberId, "CREDIT").orElse(null);

        final Long accountId = account.getAccountId();

        // ---- Step 2: 实时汇总可用余额 ----
        BigDecimal availableBalance = txRepo.sumAvailableBalance(programCode, memberId, accountType);

        // 计算信用可用额度 = CREDIT 账户的 credit_limit - credit_used
        BigDecimal creditAvailable = BigDecimal.ZERO;
        if (creditAccount != null) {
            creditAvailable = creditAccount.getCreditLimit().subtract(creditAccount.getCreditUsed());
            if (creditAvailable.compareTo(BigDecimal.ZERO) < 0) creditAvailable = BigDecimal.ZERO;
        }
        BigDecimal totalAvailable = availableBalance.add(creditAvailable);

        if (totalAvailable.compareTo(pointsToRedeem) < 0) {
            throw new BusinessException("ERR_INSUFFICIENT_POINTS",
                    String.format("积分不足: 需要=%s, 可用=%s(自有)+%s(信用)",
                            pointsToRedeem.toPlainString(),
                            availableBalance.toPlainString(),
                            creditAvailable.toPlainString()));
        }

        log.debug("[Redeem] 余额校验通过: available={}, credit={}, need={}",
                availableBalance, creditAvailable, pointsToRedeem);

        // ---- Step 3: FOR UPDATE 锁定所有有效批次（FIFO 排序） ----
        List<AccountTransaction> validBatches = txRepo.findActiveBatchesForUpdate(
                programCode, memberId, accountType);

        BigDecimal remainingToRedeem = pointsToRedeem;

        // R-PTS-05: 追踪实际核销金额（批次扣减 + 信用透支）
        BigDecimal actuallyRedeemed = BigDecimal.ZERO;

        // ---- Step 4: 生成总负向 REDEMPTION 流水 ----
        AccountTransaction redemptionTx = insertRedemptionTransaction(
                programCode, memberId, accountType, accountId, pointsToRedeem.negate());
        log.debug("[Redeem] REDEMPTION 流水已生成: txId={}", redemptionTx.getId());

        int allocationOrder = 0;

        // ---- Step 5: 遍历可用批次，逐笔扣减 + 惰性过期检查 ----
        for (AccountTransaction batch : validBatches) {
            if (remainingToRedeem.compareTo(BigDecimal.ZERO) <= 0) break;

            // 【惰性过期检查】双重保险：遍历时再校验一次过期
            if (batch.getExpiresAt() != null && batch.getExpiresAt().isBefore(LocalDateTime.now())) {
                markAsExpired(programCode, memberId, accountType, batch);
                continue;
            }

            BigDecimal batchAvailable = batch.getRemainingAmount();
            if (batchAvailable == null || batchAvailable.compareTo(BigDecimal.ZERO) <= 0) {
                continue;
            }

            BigDecimal allocateAmount = remainingToRedeem.min(batchAvailable);

            // 扣减批次剩余额度
            BigDecimal newRemaining = batchAvailable.subtract(allocateAmount);
            batch.setRemainingAmount(newRemaining);
            if (newRemaining.compareTo(BigDecimal.ZERO) == 0) {
                batch.setStatus("EXHAUSTED");
            }
            txRepo.save(batch);

            // 【核心】写入核销分摊明细
            RedemptionAllocation allocation = RedemptionAllocation.builder()
                    .programCode(programCode)
                    .redemptionTransactionId(redemptionTx.getId())
                    .accrualTransactionId(batch.getId())
                    .allocatedAmount(allocateAmount)
                    .allocationOrder(++allocationOrder)
                    .createdAt(LocalDateTime.now())
                    .build();
            allocationRepo.save(allocation);

            remainingToRedeem = remainingToRedeem.subtract(allocateAmount);
            actuallyRedeemed = actuallyRedeemed.add(allocateAmount);

            log.debug("[Redeem] 扣减批次: batchId={}, allocated={}, batchRemaining={}, leftToRedeem={}",
                    batch.getId(), allocateAmount, newRemaining, remainingToRedeem);
        }

        // ---- Step 6: 自有余额不足 → 信用额度透支（CREDIT 账户） ----
        if (remainingToRedeem.compareTo(BigDecimal.ZERO) > 0 && creditAccount != null) {
            BigDecimal creditDrawn = processCreditDrawdown(programCode, memberId, creditAccount,
                    redemptionTx, remainingToRedeem);
            actuallyRedeemed = actuallyRedeemed.add(creditDrawn);
        }

        // ---- Step 7: 更新累计统计 ----
        // R-PTS-05: totalRedeemed 只统计实际扣减金额（批次 + 信用），非请求金额
        account.setTotalRedeemed(account.getTotalRedeemed().add(actuallyRedeemed));
        accountRepo.save(account);

        log.info("[Redeem] 核销完成: member={}, type={}, requested={}, actuallyRedeemed={}, totalRedeemed={}",
                memberId, accountType, pointsToRedeem, actuallyRedeemed, account.getTotalRedeemed());
    }

    // ==================== 辅助方法 ====================

    /**
     * 插入 REDEMPTION 负向流水。
     */
    private AccountTransaction insertRedemptionTransaction(String programCode, Long memberId,
                                                            String accountType, Long accountId,
                                                            BigDecimal amount) {
        AccountTransaction tx = AccountTransaction.builder()
                .accountId(accountId)
                .programCode(programCode)
                .memberId(memberId)
                .accountType(accountType)
                .transactionType("REDEMPTION")
                .amount(amount.setScale(SCALE, RoundingMode.HALF_UP))
                .remainingAmount(BigDecimal.ZERO) // 核销本身不保留余额
                .status("ACTIVE")
                .operationKey(programCode + ":REDEMPTION:" + memberId + ":" + System.currentTimeMillis())
                .createdAt(LocalDateTime.now())
                .build();
        return txRepo.save(tx);
    }

    /**
     * 惰性标记过期批次。
     *
     * <p>严禁批量 UPDATE。单行更新 + 发布事件。
     */
    private void markAsExpired(String programCode, Long memberId, String accountType,
                                AccountTransaction batch) {
        BigDecimal expiredAmount = batch.getRemainingAmount();
        batch.setStatus("EXPIRED");
        batch.setRemainingAmount(BigDecimal.ZERO);
        txRepo.save(batch);

        log.info("[Redeem] 惰性过期标记: batchId={}, expiredAmount={}", batch.getId(), expiredAmount);

        // 发布审计事件
        if (eventBridge != null) {
            eventBridge.publish("loyalty-point-events", String.valueOf(memberId),
                    new PointsExpiredEvent(programCode, memberId, expiredAmount, batch.getId(), accountType));
        }
    }

    /**
     * 信用额度透支——当自有余额已全部扣完，差额从 CREDIT 账户中扣除。
     * 设计文档 4.3.1 Step 6: 在 CREDIT 账户增加 credit_used，生成 CREDIT_DRAWDOWN 流水。
     *
     * @return 实际从信用额度透支的金额
     */
    private BigDecimal processCreditDrawdown(String programCode, Long memberId,
                                        MemberAccount creditAccount, AccountTransaction redemptionTx,
                                        BigDecimal shortfall) {
        BigDecimal creditRemaining = creditAccount.getCreditLimit().subtract(creditAccount.getCreditUsed());
        if (creditRemaining.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("ERR_CREDIT_EXHAUSTED",
                    "信用额度已用尽，无法完成核销。缺口: " + shortfall.toPlainString());
        }

        BigDecimal drawdownAmount = shortfall.min(creditRemaining);
        creditAccount.setCreditUsed(creditAccount.getCreditUsed().add(drawdownAmount));
        accountRepo.save(creditAccount);

        // 在 CREDIT 账户生成 CREDIT_DRAWDOWN 流水（负数，表示信用负债增加）
        AccountTransaction drawdownTx = AccountTransaction.builder()
                .accountId(creditAccount.getAccountId())
                .programCode(programCode)
                .memberId(memberId)
                .accountType("CREDIT")
                .transactionType("CREDIT_DRAWDOWN")
                .amount(drawdownAmount.negate().setScale(SCALE, RoundingMode.HALF_UP))
                .remainingAmount(BigDecimal.ZERO)
                .status("ACTIVE")
                .referenceEventId(String.valueOf(redemptionTx.getId()))
                .operationKey(programCode + ":DRAWDOWN:" + memberId + ":" + System.currentTimeMillis())
                .createdAt(LocalDateTime.now())
                .build();
        txRepo.save(drawdownTx);

        log.info("[Redeem] CREDIT 账户透支: amount={}, creditUsed={}/{}",
                drawdownAmount, creditAccount.getCreditUsed(), creditAccount.getCreditLimit());

        // 如有剩余缺口（超过信用额度），抛异常
        BigDecimal finalShortfall = shortfall.subtract(drawdownAmount);
        if (finalShortfall.compareTo(BigDecimal.ZERO) > 0) {
            throw new BusinessException("ERR_INSUFFICIENT_CREDIT",
                    "即使使用信用额度仍不足。总需: " + shortfall.toPlainString()
                            + ", 信用可用: " + creditRemaining.toPlainString()
                            + ", 缺口: " + finalShortfall.toPlainString());
        }
        return drawdownAmount;
    }
}