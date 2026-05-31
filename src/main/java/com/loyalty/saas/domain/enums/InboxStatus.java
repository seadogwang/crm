package com.loyalty.saas.domain.enums;

/**
 * 事件收件箱状态枚举。
 *
 * <p>event_inbox 表记录 SPI 网关接收到的所有外部事件，
 * 此枚举定义了事件处理的完整生命周期。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public enum InboxStatus {

    /** 已接收：事件已落库，等待映射处理 */
    RECEIVED,

    /** 处理中：正在执行脚本转换或规则匹配 */
    PROCESSING,

    /** 处理成功：事件已转换为内部 EventFact 并派发 */
    PROCESSED,

    /** 处理失败：转换或校验出错，需要人工或自动重试 */
    FAILED
}