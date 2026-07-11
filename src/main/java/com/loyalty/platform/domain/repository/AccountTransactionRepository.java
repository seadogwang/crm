package com.loyalty.platform.domain.repository;

import com.loyalty.platform.common.repository.BaseRepository;
import com.loyalty.platform.domain.entity.AccountTransaction;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.jpa.repository.QueryHints;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import jakarta.persistence.LockModeType;
import jakarta.persistence.QueryHint;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AccountTransactionRepository extends BaseRepository<AccountTransaction, Long> {

    /**
     * 实时汇总会员可用余额（不支持透支/信用，纯正向 SUM）。
     * 只统计 status='ACTIVE' AND remainingAmount>0 AND expiresAt>NOW() 的流水。
     */
    @Query("SELECT COALESCE(SUM(t.remainingAmount), 0) FROM AccountTransaction t "
            + "WHERE t.programCode = :pc AND t.memberId = :mid AND t.accountType = :atype "
            + "AND t.status = 'ACTIVE' AND t.remainingAmount > 0 "
            + "AND (t.expiresAt IS NULL OR t.expiresAt > CURRENT_TIMESTAMP)")
    BigDecimal sumAvailableBalance(@Param("pc") String programCode,
                                    @Param("mid") Long memberId,
                                    @Param("atype") String accountType);

    /**
     * 悲观锁查询透支批次：remainingAmount < 0 且 status = 'OVERDRAFT'。
     * 用于瀑布流冲抵第一步"补天窗"。
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("SELECT t FROM AccountTransaction t WHERE t.programCode = :pc AND t.memberId = :mid "
            + "AND t.accountType = :atype AND t.remainingAmount < 0 AND t.status = 'OVERDRAFT' "
            + "ORDER BY t.createdAt ASC")
    List<AccountTransaction> findOverdraftBatchesForUpdate(@Param("pc") String programCode,
                                                            @Param("mid") Long memberId,
                                                            @Param("atype") String accountType);

    /**
     * 悲观锁查询所有有效可用批次（FIFO 核销用）。
     * 条件：status='ACTIVE' AND remainingAmount>0 AND expiresAt>NOW()
     * 排序：过期时间升序 → 创建时间升序（FIFO 原则）
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("SELECT t FROM AccountTransaction t WHERE t.programCode = :pc AND t.memberId = :mid "
            + "AND t.accountType = :atype AND t.status = 'ACTIVE' AND t.remainingAmount > 0 "
            + "AND (t.expiresAt IS NULL OR t.expiresAt > CURRENT_TIMESTAMP) "
            + "ORDER BY COALESCE(t.expiresAt, '2099-12-31') ASC, t.createdAt ASC")
    List<AccountTransaction> findActiveBatchesForUpdate(@Param("pc") String programCode,
                                                         @Param("mid") Long memberId,
                                                         @Param("atype") String accountType);

    /**
     * 统计会员 ACTIVE 批次数量（Compaction 阈值判断用）。
     */
    @Query("SELECT COUNT(t) FROM AccountTransaction t WHERE t.programCode = :pc AND t.memberId = :mid "
            + "AND t.accountType = :atype AND t.status = 'ACTIVE' AND t.remainingAmount > 0")
    long countActiveBatches(@Param("pc") String programCode,
                            @Param("mid") Long memberId,
                            @Param("atype") String accountType);

    /**
     * 查询可合并的非即将过期批次（expiresAt > 30天后 或 无过期时间）。
     */
    @Query("SELECT t FROM AccountTransaction t WHERE t.programCode = :pc AND t.memberId = :mid "
            + "AND t.accountType = :atype AND t.status = 'ACTIVE' AND t.remainingAmount > 0 "
            + "AND (t.expiresAt IS NULL OR t.expiresAt > :threshold) "
            + "ORDER BY COALESCE(t.expiresAt, '2099-12-31') ASC, t.createdAt ASC")
    List<AccountTransaction> findCompactableBatches(@Param("pc") String programCode,
                                                     @Param("mid") Long memberId,
                                                     @Param("atype") String accountType,
                                                     @Param("threshold") LocalDateTime threshold);

    /**
     * 级联重算：加载指定时间点之后的 ACCRUAL/REDEMPTION 流水（无锁，用于影子回放）。
     * 按创建时间升序，确保时间轴回放顺序正确。
     */
    @Query("SELECT t FROM AccountTransaction t WHERE t.programCode = :pc AND t.memberId = :mid "
            + "AND t.transactionType IN ('ACCRUAL', 'REDEMPTION') AND t.createdAt > :after "
            + "ORDER BY t.createdAt ASC")
    List<AccountTransaction> findTimelineAfter(@Param("pc") String programCode,
                                               @Param("mid") Long memberId,
                                               @Param("after") LocalDateTime after);

    /**
     * 查询可冲抵负债流水（FEFO：按过期时间从近到远）。
     * 条件：repayable=true, status='ACTIVE', remainingAmount>0, 未过期
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"))
    @Query("SELECT t FROM AccountTransaction t WHERE t.programCode = :pc AND t.memberId = :mid "
            + "AND t.repayable = true AND t.status = 'ACTIVE' AND t.remainingAmount > 0 "
            + "AND (t.expiresAt IS NULL OR t.expiresAt > CURRENT_TIMESTAMP) "
            + "ORDER BY t.expiresAt ASC NULLS LAST, t.createdAt ASC")
    List<AccountTransaction> findRepayableForMember(@Param("pc") String programCode,
                                                     @Param("mid") Long memberId);

    /** 实时汇总指定类型的累计值（发分/核销） */
    @Query("SELECT COALESCE(SUM(ABS(t.amount)), 0) FROM AccountTransaction t "
            + "WHERE t.programCode = :pc AND t.memberId = :mid AND t.accountType = :atype "
            + "AND t.transactionType = :ttype")
    BigDecimal sumByType(@Param("pc") String programCode,
                         @Param("mid") Long memberId,
                         @Param("atype") String accountType,
                         @Param("ttype") String transactionType);

    /**
     * 统计指定积分类型在时间窗口内的 ACCRUAL 累计值。
     */
    @Query("SELECT COALESCE(SUM(t.amount), 0) FROM AccountTransaction t "
            + "WHERE t.programCode = :pc AND t.memberId = :mid AND t.accountType = :atype "
            + "AND t.transactionType = 'ACCRUAL' AND t.status = 'ACTIVE' "
            + "AND t.createdAt >= :since")
    BigDecimal sumAccrualSince(@Param("pc") String programCode,
                               @Param("mid") Long memberId,
                               @Param("atype") String accountType,
                               @Param("since") LocalDateTime since);

    /**
     * 批量查询：按积分类型分组汇总 SUM 和 COUNT。
     * 用于变量计算服务的按需预加载（设计文档 §6.3）。
     *
     * @return Object[]{accountType, sum, count}
     */
    @Query("SELECT t.accountType, COALESCE(SUM(t.amount), 0), COUNT(t) "
            + "FROM AccountTransaction t "
            + "WHERE t.programCode = :pc AND t.memberId = :mid "
            + "AND t.accountType IN :types "
            + "AND t.transactionType = 'ACCRUAL' AND t.status = 'ACTIVE' "
            + "AND t.createdAt >= :since "
            + "GROUP BY t.accountType")
    List<Object[]> sumAndCountByMemberIdAndTypesAndTimeRange(@Param("pc") String programCode,
                                                              @Param("mid") Long memberId,
                                                              @Param("types") List<String> types,
                                                              @Param("since") LocalDateTime since);

    /**
     * 批量查询：按积分类型分组获取当前余额（考虑所有交易类型）。
     * 用于 balance() 函数。
     */
    @Query("SELECT t.accountType, COALESCE(SUM(t.amount), 0) "
            + "FROM AccountTransaction t "
            + "WHERE t.programCode = :pc AND t.memberId = :mid "
            + "AND t.accountType IN :types AND t.status = 'ACTIVE' "
            + "GROUP BY t.accountType")
    List<Object[]> balanceByMemberIdAndTypes(@Param("pc") String programCode,
                                              @Param("mid") Long memberId,
                                              @Param("types") List<String> types);
}