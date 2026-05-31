package com.loyalty.saas.common.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;

import java.time.Instant;
import java.util.UUID;

/**
 * 统一 API 响应协议 —— 符合设计文档第十章 10.1 节规范。
 *
 * <p>所有 API 必须采用此包裹结构，禁止直接返回数据实体：
 * <pre>
 * {
 *   "code": "SUCCESS",
 *   "message": "操作成功",
 *   "trace_id": "REQ-123",
 *   "data": { ... }
 * }
 * </pre>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Getter
@ToString
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ApiResponse<T> {

    /** 业务状态码 */
    private final String code;

    /** 用户可见提示 */
    private final String message;

    /** 全链路追踪 ID */
    private final String traceId;

    /** 业务数据 */
    private final T data;

    /** 响应时间戳 */
    private final Instant timestamp;

    private ApiResponse(String code, String message, String traceId, T data) {
        this.code = code;
        this.message = message;
        this.traceId = traceId;
        this.data = data;
        this.timestamp = Instant.now();
    }

    /** 成功响应 */
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>("SUCCESS", "操作成功", currentTraceId(), data);
    }

    /** 成功响应 + 自定义消息 */
    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<>("SUCCESS", message, currentTraceId(), data);
    }

    /** 业务失败（HTTP 200） */
    public static <T> ApiResponse<T> error(String code, String message) {
        return new ApiResponse<>(code, message, currentTraceId(), null);
    }

    /** 业务失败 + 数据 */
    public static <T> ApiResponse<T> error(String code, String message, T data) {
        return new ApiResponse<>(code, message, currentTraceId(), data);
    }

    private static String currentTraceId() {
        try {
            String tid = org.slf4j.MDC.get("traceId");
            return tid != null ? tid : UUID.randomUUID().toString().replace("-", "");
        } catch (Exception e) {
            return UUID.randomUUID().toString().replace("-", "");
        }
    }
}