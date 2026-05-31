package com.loyalty.saas.domain.enums;

/**
 * 积分交易类型枚举。
 *
 * <p>定义了 account_transaction 表中所有可能的交易类型，
 * 涵盖正向入账、逆向扣减、冲抵平账等完整生命周期。
 *
 * <p>金额符号约定：
 * <ul>
 *   <li>正向交易（ACCRUAL、REPAYMENT、CREDIT_REPAY、REFUND）：amount &gt; 0</li>
 *   <li>负向交易（REDEMPTION、EXPIRATION、OVERDRAFT、CREDIT_DRAWDOWN、CASCADE_DEDUCT）：amount &lt; 0</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public enum TransactionType {

    /**
     * 积分发放（正向入账），由规则引擎触发或手动调整产生。
     */
    ACCRUAL,

    /**
     * 积分兑换核销（负向出账），遵循 FIFO 先进先出原则扣减可用批次。
     */
    REDEMPTION,

    /**
     * 积分过期（负向出账），由惰性过期检查触发。
     */
    EXPIRATION,

    /**
     * 透支还款（天窗填补），正向入账冲抵历史透支。
     */
    REPAYMENT,

    /**
     * 信用额度还款，正向入账归还已使用的信用积分。
     */
    CREDIT_REPAY,

    /**
     * 信用额度提用（负向出账），当自有余额不足时从信用额度中扣除。
     */
    CREDIT_DRAWDOWN,

    /**
     * 被动透支（负向出账），退款扣减超出余额时触发的透支记录。
     */
    OVERDRAFT,

    /**
     * 退款退还积分（正向入账），取消兑换后还原原始发分批次额度。
     */
    REFUND,

    /**
     * 级联重算扣减（负向出账），因历史退款导致等级重算后多发的积分被追回。
     */
    CASCADE_DEDUCT
}