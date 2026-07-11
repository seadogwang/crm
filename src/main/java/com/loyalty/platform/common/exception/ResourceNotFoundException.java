package com.loyalty.platform.common.exception;

/**
 * 资源未找到异常 — 当请求的资源不存在时抛出。
 *
 * <p>由 {@link GlobalExceptionHandler} 统一拦截并封装为 {@code ApiResponse}。
 */
public class ResourceNotFoundException extends RuntimeException {

    public ResourceNotFoundException(String message) {
        super(message);
    }

    public ResourceNotFoundException(String message, Throwable cause) {
        super(message, cause);
    }
}
