package com.loyalty.saas.domain.enums;

/**
 * 渠道适配器状态枚举。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public enum AdapterStatus {

    /** 草稿：尚未启用，可编辑 */
    DRAFT,

    /** 已激活：正在处理渠道数据 */
    ACTIVE,

    /** 已停用：暂不处理该渠道 */
    INACTIVE,

    /** 配置错误：需要人工介入修正 */
    ERROR
}