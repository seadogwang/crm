package com.loyalty.saas.common.annotation;

import java.lang.annotation.*;

/**
 * 幂等性注解 —— 标记在需要幂等保护的 Controller 方法上。
 *
 * <p>强制要求前端传入 {@code X-Idempotency-Key}（UUID）。
 * 后端利用 Redis 存储该 Key 及其处理结果，过期时间 24 小时。
 *
 * <p>使用方式：
 * <pre>{@code
 * @PostMapping("/grant-points")
 * @Idempotent
 * public ApiResponse<Void> grantPoints(@RequestBody GrantRequest req) { ... }
 * }</pre>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Idempotent {

    /** 幂等键过期时间（秒），默认 86400（24小时） */
    long ttlSeconds() default 86400;

    /** 是否必须携带 X-Idempotency-Key，默认 true */
    boolean required() default true;
}