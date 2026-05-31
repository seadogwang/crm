package com.loyalty.saas.domain.enums;

/**
 * 等级变更原因枚举。
 *
 * <p>用于 tier_change_log 表的 change_reason 字段，
 * 记录等级变更的业务触发原因，支持级联重算时的等级时间线还原。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public enum TierChangeReason {

    /** 实时升级：累计成长值跨越更高门槛 */
    UPGRADE,

    /** 定时降级：固定周期不满足保级条件 */
    DOWNGRADE,

    /** 级联降级：因历史退款导致等级重算后调整 */
    CASCADE_DOWNGRADE,

    /** 合并取高：One-ID 合并时取两个账号中最高等级 */
    MERGE,

    /** 人工调整：运营后台手动修改 */
    MANUAL
}