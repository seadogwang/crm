package com.loyalty.saas.accounting;

import com.loyalty.saas.common.event.EventBridge;
import com.loyalty.saas.domain.entity.AccountTransaction;
import com.loyalty.saas.domain.repository.AccountTransactionRepository;
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
 * 积分碎片整理服务 (Compaction)。
 *
 * <p>当会员 ACTIVE 流水批次超过阈值时，低峰期将多个非即将过期的同类型批次合并为一条，
 * 减少 FIFO 核销时 {@code SELECT FOR UPDATE} 的行锁范围和扫描开销。
 *
 * <p><b>合并规则</b>：
 * <ul>
 *   <li>只合并 expiresAt > 30天后 或无过期时间的批次</li>
 *   <li>合并后新批次 remainingAmount = SUM(原批次 remainingAmount)</li>
 *   <li>原批次标记为 EXHAUSTED</li>
 * </ul>
 *
 * <p><b>约束</b>：合并操作必须在会员维度串行化（消息队列按 memberId 分区已保证）。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Service
public class CompactionService {

    private static final Logger log = LoggerFactory.getLogger(CompactionService.class);

    private final AccountTransactionRepository txRepo;

    /** 触发合并的 ACTIVE 批次阈值 */
    private static final long COMPACTION_THRESHOLD = 50;

    /** 仅合并不在 30 天内过期的批次 */
    private static final int MIN_DAYS_BEFORE_EXPIRY = 30;

    public CompactionService(AccountTransactionRepository txRepo) {
        this.txRepo = txRepo;
    }

    /**
     * 碎片整理——将多个非即将过期批次合并为一条。
     *
     * @param programCode 租户计划代码
     * @param memberId    会员 ID
     * @param accountType 账户类型
     * @return 合并的批次数量（0 表示无需合并）
     */
    @Transactional
    public int compact(String programCode, Long memberId, String accountType) {
        long activeCount = txRepo.countActiveBatches(programCode, memberId, accountType);
        if (activeCount < COMPACTION_THRESHOLD) {
            log.debug("[Compaction] 无需合并: member={}, activeBatches={}, threshold={}",
                    memberId, activeCount, COMPACTION_THRESHOLD);
            return 0;
        }

        // 只取非即将过期的批次
        LocalDateTime threshold = LocalDateTime.now().plusDays(MIN_DAYS_BEFORE_EXPIRY);
        List<AccountTransaction> batches = txRepo.findCompactableBatches(
                programCode, memberId, accountType, threshold);

        if (batches.size() < 2) {
            log.debug("[Compaction] 可合并批次不足: member={}, compactable={}", memberId, batches.size());
            return 0;
        }

        // SUM 所有可合并批次的 remainingAmount
        BigDecimal totalRemaining = BigDecimal.ZERO;
        LocalDateTime earliestExpiry = null;

        for (AccountTransaction batch : batches) {
            if (batch.getRemainingAmount() != null) {
                totalRemaining = totalRemaining.add(batch.getRemainingAmount());
            }
            if (batch.getExpiresAt() != null
                    && (earliestExpiry == null || batch.getExpiresAt().isBefore(earliestExpiry))) {
                earliestExpiry = batch.getExpiresAt();
            }
            // 标记原批次为 EXHAUSTED
            batch.setRemainingAmount(BigDecimal.ZERO);
            batch.setStatus("EXHAUSTED");
            txRepo.save(batch);
        }

        // 创建合并后的新批次
        AccountTransaction merged = AccountTransaction.builder()
                .programCode(programCode)
                .memberId(memberId)
                .accountType(accountType)
                .transactionType("ACCRUAL")
                .amount(totalRemaining.setScale(4, RoundingMode.HALF_UP))
                .remainingAmount(totalRemaining.setScale(4, RoundingMode.HALF_UP))
                .expiresAt(earliestExpiry) // 取最早过期时间
                .status("ACTIVE")
                .ruleCode("COMPACTION")
                .operationKey(programCode + ":COMPACTION:" + memberId + ":" + System.currentTimeMillis())
                .createdAt(LocalDateTime.now())
                .build();
        txRepo.save(merged);

        log.info("[Compaction] 合并完成: member={}, type={}, {} batches → 1, totalRemaining={}",
                memberId, accountType, batches.size(), totalRemaining);

        return batches.size();
    }

    /**
     * 定时任务入口：扫描 ACTIVE 批次过多的会员并触发合并。
     * 由外部调度器（XXL-JOB / @Scheduled）在低峰期调用。
     */
    public void scheduledCompaction() {
        log.info("[Compaction] 定时碎片整理任务启动，扫描阈值={}", COMPACTION_THRESHOLD);
        // 实际实现需从 member_account 或 account_transaction 表中
        // 查询 (programCode, memberId, accountType) 分组，HAVING COUNT(*) > 50 的会员列表
        // 逐会员处理（保证串行化）
        // 此处为骨架，具体实现依赖 DB 的分组查询
    }
}