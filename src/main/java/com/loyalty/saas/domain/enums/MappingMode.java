package com.loyalty.saas.domain.enums;

/**
 * 渠道适配器映射模式枚举。
 *
 * <p>定义 {@code channel_adapter_config} 表中外部渠道数据的转换策略：
 * <ul>
 *   <li>{@code VISUAL}：通过可视化配置（JSON Path 映射）完成字段映射，无需编写代码。</li>
 *   <li>{@code SCRIPT}：通过 GraalVM JavaScript 脚本进行复杂转换，适用于异构 API 结构。</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public enum MappingMode {

    /** 可视化字段映射模式 */
    VISUAL,

    /** 脚本转换模式（GraalVM Polyglot） */
    SCRIPT
}