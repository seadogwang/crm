package com.loyalty.saas.common.context;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 全局租户上下文持有器。
 *
 * <p>利用 {@link ThreadLocal} 在当前执行线程中维护 {@code program_code}，
 * 作为多租户隔离的起点。所有下游组件（ORM 拦截器、缓存键生成器、事件总线等）
 * 均从此处获取当前请求的租户上下文。
 *
 * <p><b>强制纪律</b>：
 * <ul>
 *   <li>每个 HTTP 请求进入时，{@link com.loyalty.saas.common.filter.TenantContextFilter}
 *       必须解析 Token/Header 获取 program_code 并放入 TenantContext。</li>
 *   <li>每个请求处理完毕（无论成功还是异常），必须在 {@code finally} 块中调用
 *       {@link #clear()}，防止线程复用时污染下一个租户的上下文。</li>
 *   <li>异步线程池 ({@code ExecutorService}) 必须使用装饰器模式传递 TenantContext，
 *       防止子线程丢失租户上下文。</li>
 * </ul>
 *
 * <p><b>线程安全性</b>：ThreadLocal 本身提供线程级别的隔离，
 * 但必须确保 {@code set()} 和 {@code clear()} 成对调用。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public final class TenantContext {

    private static final Logger log = LoggerFactory.getLogger(TenantContext.class);

    /**
     * 线程局部变量，存储当前线程的 program_code。
     */
    private static final ThreadLocal<String> CURRENT_TENANT = new ThreadLocal<>();

    private TenantContext() {
        // 工具类，禁止实例化
    }

    /**
     * 设置当前线程的租户代码。
     *
     * @param programCode 租户计划代码，不能为 null 或空白
     * @throws IllegalArgumentException 如果 programCode 为 null 或空白
     */
    public static void set(String programCode) {
        if (programCode == null || programCode.isBlank()) {
            throw new IllegalArgumentException("programCode must not be null or blank");
        }
        String existing = CURRENT_TENANT.get();
        if (existing != null && !existing.equals(programCode)) {
            log.warn("[TenantContext] 租户上下文被覆盖: {} -> {} (可能存在泄露)", existing, programCode);
        }
        CURRENT_TENANT.set(programCode);
    }

    /**
     * 获取当前线程的租户代码。
     *
     * @return 当前租户代码，如果没有设置则返回 null
     */
    public static String get() {
        return CURRENT_TENANT.get();
    }

    /**
     * 获取当前线程的租户代码，如果未设置则抛出异常。
     *
     * @return 当前租户代码
     * @throws IllegalStateException 如果租户上下文未设置
     */
    public static String getRequired() {
        String programCode = CURRENT_TENANT.get();
        if (programCode == null) {
            throw new IllegalStateException(
                    "[TenantContext] 租户上下文未设置！请确保请求经过了 TenantContextFilter 过滤。"
            );
        }
        return programCode;
    }

    /**
     * 清除当前线程的租户上下文。
     *
     * <p><b>必须在 finally 块中调用</b>，防止线程池复用导致租户污染。
     * 清除前执行租户污染检测审计。
     */
    public static void clear() {
        String programCode = CURRENT_TENANT.get();
        if (programCode != null) {
            log.debug("[TenantContext] 清理租户上下文: {}", programCode);
        }
        CURRENT_TENANT.remove();
    }

    /**
     * 检查当前线程是否已设置租户上下文。
     *
     * @return true 如果已设置
     */
    public static boolean isSet() {
        return CURRENT_TENANT.get() != null;
    }

    /**
     * 获取当前租户上下文，包装为 {@link TenantSnapshot} 用于跨线程传递。
     *
     * <p>使用示例：
     * <pre>{@code
     * TenantSnapshot snapshot = TenantContext.capture();
     * executorService.submit(() -> {
     *     snapshot.restore();
     *     try {
     *         // 业务逻辑
     *     } finally {
     *         TenantContext.clear();
     *     }
     * });
     * }</pre>
     *
     * @return 租户上下文快照
     */
    public static TenantSnapshot capture() {
        return new TenantSnapshot(CURRENT_TENANT.get());
    }

    /**
     * 租户上下文快照，用于跨线程传递租户信息。
     */
    public record TenantSnapshot(String programCode) {

        /**
         * 在当前线程恢复租户上下文。
         */
        public void restore() {
            if (programCode != null) {
                TenantContext.set(programCode);
            }
        }
    }
}