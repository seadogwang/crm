package com.loyalty.saas.spi;

import com.loyalty.saas.domain.entity.ChannelAdapterConfig;
import jakarta.servlet.http.HttpServletRequest;

/**
 * 渠道 SPI 处理器策略接口。
 *
 * <p>每个外部渠道（天猫、京东、抖音、微信）实现自己的 Handler，
 * 通过 {@link SpiHandlerFactory} 按 {@code channel} 动态调度。
 *
 * <p>三个核心职责：
 * <ol>
 *   <li>{@link #verifySignature} — 验签：解析 Header/Body，用渠道 AppSecret 验证签名</li>
 *   <li>{@link #handleAction} — 核心处理：将原始报文转换为标准事件并落库/投递</li>
 *   <li>{@link #buildErrorResponse} — 构建渠道特定的错误格式（必须 HTTP 200）</li>
 * </ol>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public interface ChannelSpiHandler {

    /**
     * 渠道标识，如 "TMALL", "JD", "DOUYIN", "WECHAT_MINI"。
     */
    String getChannelCode();

    /**
     * 验签：解析 Header 和 Body，利用渠道配置 (AppSecret) 验证签名。
     *
     * @param request  HTTP 原始请求
     * @param rawBody  原始请求体字节数组
     * @param config   渠道适配器配置（含 auth_config）
     * @return true 验签通过
     */
    boolean verifySignature(HttpServletRequest request, byte[] rawBody, ChannelAdapterConfig config);

    /**
     * 报文转换与核心处理。
     *
     * <p>实现方必须负责：
     * <ul>
     *   <li>将 rawBody 解析为内部标准格式</li>
     *   <li>幂等校验（基于 request_id / idempotency_key）</li>
     *   <li>插入 event_inbox 表</li>
     * </ul>
     *
     * @param action       操作类型（如 "order.paid", "member.enroll"）
     * @param programCode  租户计划代码
     * @param rawBody      原始请求体
     * @param config       渠道适配器配置
     * @return 渠道要求的特定 JSON 响应结构
     */
    Object handleAction(String action, String programCode, byte[] rawBody, ChannelAdapterConfig config);

    /**
     * 构建渠道特定的错误格式响应。
     * 必须确保对外 HTTP 响应码为 200（第三方平台规约）。
     *
     * @param e 业务异常
     * @return 渠道错误格式响应体
     */
    Object buildErrorResponse(Exception e);
}