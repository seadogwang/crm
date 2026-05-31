package com.loyalty.saas.common.exception;

import com.loyalty.saas.common.dto.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.UUID;

/**
 * 全局异常处理器 —— 符合设计文档第 10.4 节规范。
 *
 * <p>核心约束：<b>禁止在 API 层返回 HTTP 500</b>。
 * 即使发生业务失败（如"积分不足"），HTTP 状态码也应返回 200，
 * 并在 Body 中返回具体的业务错误码。
 *
 * <p>HTTP 状态码约定：
 * <ul>
 *   <li>400: 参数校验错误</li>
 *   <li>401: 认证失效</li>
 *   <li>403: 租户隔离拦截或权限不足</li>
 *   <li>429: 请求频率过高</li>
 *   <li>200: 业务失败（Body 中返回业务错误码）</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /** 业务异常 → HTTP 200 + 业务错误码 */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusiness(BusinessException e, HttpServletRequest request) {
        log.warn("[API] 业务异常: code={}, message={}, path={}", e.getCode(), e.getMessage(), request.getRequestURI());
        return ResponseEntity.ok(ApiResponse.error(e.getCode(), e.getMessage()));
    }

    /** 参数校验异常 → HTTP 400 */
    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidation(MethodArgumentNotValidException e, HttpServletRequest request) {
        String msg = e.getBindingResult().getFieldErrors().stream()
                .map(f -> f.getField() + ": " + f.getDefaultMessage())
                .reduce((a, b) -> a + "; " + b).orElse("参数校验失败");
        log.warn("[API] 参数校验失败: path={}, errors={}", request.getRequestURI(), msg);
        return ResponseEntity.badRequest().body(ApiResponse.error("ERR_VALIDATION", msg));
    }

    /** 非法参数 → HTTP 400 */
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<ApiResponse<Void>> handleIllegalArg(IllegalArgumentException e, HttpServletRequest request) {
        log.warn("[API] 非法参数: path={}, message={}", request.getRequestURI(), e.getMessage());
        return ResponseEntity.badRequest().body(ApiResponse.error("ERR_BAD_REQUEST", e.getMessage()));
    }

    /** 租户上下文缺失 → HTTP 403 */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<ApiResponse<Void>> handleTenantMissing(IllegalStateException e, HttpServletRequest request) {
        log.error("[API] 租户上下文异常: path={}, message={}", request.getRequestURI(), e.getMessage());
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(ApiResponse.error("ERR_TENANT_REQUIRED", e.getMessage()));
    }

    /** 未分类异常 → HTTP 200（兜底，避免 P0 事故） */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnknown(Exception e, HttpServletRequest request) {
        log.error("[API] 未捕获异常: path={}", request.getRequestURI(), e);
        // 【关键】即使是未知异常，也返回 HTTP 200，避免触发第三方熔断
        return ResponseEntity.ok(ApiResponse.error("ERR_INTERNAL", "系统繁忙，请稍后重试"));
    }
}