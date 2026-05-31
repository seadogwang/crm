package com.loyalty.saas.domain.enums;

/**
 * 会员状态枚举。
 *
 * <p>定义会员在忠诚度计划中的生命周期状态，所有状态变更均需记录审计日志。
 * 状态机转换规则：
 * <ul>
 *   <li>{@code ENROLLED} → {@code SUSPENDED}：风控冻结</li>
 *   <li>{@code ENROLLED} → {@code MERGED}：One-ID 合并后被标记为主账号</li>
 *   <li>{@code ENROLLED} → {@code DEACTIVATED}：会员主动注销</li>
 *   <li>{@code SUSPENDED} → {@code ENROLLED}：风控解除</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public enum MemberStatus {

    /**
     * 正常入会状态，可参与积分获取、兑换、升级等所有业务。
     */
    ENROLLED,

    /**
     * 暂停状态（通常因风控或欠款导致），
     * 禁止兑换但可继续获取积分以偿还透支。
     */
    SUSPENDED,

    /**
     * 已合并：该会员身份已合并至另一主账号，
     * 所有资产已转移，此账号不可再操作。
     */
    MERGED,

    /**
     * 已注销：会员主动退出计划，
     * 积分清零、等级失效，不可逆。
     */
    DEACTIVATED
}