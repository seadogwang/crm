package com.loyalty.saas.domain.enums;

/**
 * 积分流水状态枚举。
 *
 * <p>用于标识 account_transaction 表中每条流水的生命周期状态。
 * 余额通过 {@code SUM(remaining_amount)} 实时计算，不依赖独立余额字段。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public enum TransactionStatus {

    /**
     * 活跃状态：remaining_amount > 0 且未过期，可被 FIFO 核销。
     */
    ACTIVE,

    /**
     * 已耗尽：remaining_amount = 0，已被 FIFO 核销完或碎片合并后标记。
     */
    EXHAUSTED,

    /**
     * 已过期：expires_at 已过，remaining_amount 清零，不再参与余额计算。
     */
    EXPIRED,

    /**
     * 已还清：透支记录对应的债务已通过后续入账填平。
     */
    SETTLED
}