package com.loyalty.saas.common.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.saas.common.annotation.Idempotent;
import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.common.dto.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.util.concurrent.TimeUnit;

/**
 * 幂等性 AOP 拦截器 —— 基于 Redis 的防重机制。
 *
 * <p>按设计文档第 10.3 节实现：
 * <ol>
 *   <li>从请求头 {@code X-Idempotency-Key} 提取幂等键</li>
 *   <li>Redis 检查：是否已处理过此幂等键</li>
 *   <li>已处理 → 直接返回缓存结果</li>
 *   <li>未处理 → 执行业务逻辑 → 缓存结果（24h TTL）</li>
 * </ol>
 *
 * <p><b>注意</b>：依赖 {@code created_at} 的 DB 唯一索引仅作为最后防线，
 * 不能替代 Redis 前置防重。原因：account_transaction 为分区表，
 * 唯一索引必须包含 created_at，同一条业务请求若在不同秒级时间写入，
 * created_at 可能不同，导致唯一索引失效。
 *
 * <p>Redis Key 格式：{@code idempotent:{programCode}:{idempotencyKey}}
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Aspect
@Component
public class IdempotentInterceptor {

    private static final Logger log = LoggerFactory.getLogger(IdempotentInterceptor.class);
    private static final ObjectMapper objectMapper = new ObjectMapper();

    /** Redis 缓存键前缀 */
    private static final String KEY_PREFIX = "idempotent:";

    @Autowired(required = false)
    private RedisTemplate<String, Object> redisTemplate;

    @Around("@annotation(idempotent)")
    public Object checkIdempotency(ProceedingJoinPoint joinPoint, Idempotent idempotent) throws Throwable {
        // 获取当前 HTTP 请求
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs == null) {
            return joinPoint.proceed(); // 非 HTTP 上下文，跳过
        }
        HttpServletRequest request = attrs.getRequest();
        String idempotencyKey = request.getHeader("X-Idempotency-Key");

        // 必须携带幂等键
        if (idempotent.required() && (idempotencyKey == null || idempotencyKey.isBlank())) {
            log.warn("[Idempotent] 请求缺失 X-Idempotency-Key: path={}", request.getRequestURI());
            return ApiResponse.error("ERR_MISSING_IDEMPOTENCY_KEY", "请求头缺失 X-Idempotency-Key");
        }

        // 非幂等请求直接放行
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            return joinPoint.proceed();
        }

        String programCode = TenantContext.get();
        if (programCode == null) {
            programCode = "unknown";
        }
        String cacheKey = KEY_PREFIX + programCode + ":" + idempotencyKey;

        // Redis 不可用时直接放行（降级策略）
        if (redisTemplate == null) {
            log.debug("[Idempotent] Redis 不可用，跳过幂等检查: key={}", idempotencyKey);
            return joinPoint.proceed();
        }

        try {
            // 1. 检查是否已处理过
            var cached = redisTemplate.opsForValue().get(cacheKey);
            if (cached != null) {
                log.info("[Idempotent] 幂等命中，返回缓存结果: key={}", idempotencyKey);
                return cached;
            }

            // 2. 执行目标方法
            Object result = joinPoint.proceed();

            // 3. 缓存处理结果（TTL 从注解读取）
            long ttl = idempotent.ttlSeconds();
            redisTemplate.opsForValue().set(cacheKey, result, ttl, TimeUnit.SECONDS);
            log.debug("[Idempotent] 结果已缓存: key={}, ttl={}s", idempotencyKey, ttl);

            return result;

        } catch (Exception e) {
            // Redis 异常不影响业务（降级）
            log.warn("[Idempotent] Redis 操作异常，放行请求: key={}", idempotencyKey, e);
            return joinPoint.proceed();
        }
    }
}