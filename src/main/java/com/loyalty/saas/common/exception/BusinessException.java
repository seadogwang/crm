package com.loyalty.saas.common.exception;

/**
 * 业务异常 —— 用于 API 层返回 HTTP 200 + 业务错误码。
 *
 * <p>例如：积分不足（ERR_INSUFFICIENT_POINTS）、规则冲突（RULE_CONFLICT）等。
 * 由 {@link GlobalExceptionHandler} 统一拦截并封装为 {@code ApiResponse}。
 */
public class BusinessException extends RuntimeException {

    private final String code;

    public BusinessException(String code, String message) {
        super(message);
        this.code = code;
    }

    public BusinessException(String code, String message, Throwable cause) {
        super(message, cause);
        this.code = code;
    }

    public String getCode() { return code; }
}