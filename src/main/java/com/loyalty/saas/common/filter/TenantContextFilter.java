package com.loyalty.saas.common.filter;

import com.loyalty.saas.common.context.TenantContext;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.util.UUID;

/**
 * 租户上下文过滤器 —— 四层防御体系的第一层：入口防御。
 *
 * <p>每个 HTTP 请求进入时，此过滤器负责：
 * <ol>
 *   <li>从请求头 {@code X-Program-Code} 中提取租户代码并放入 {@link TenantContext}。</li>
 *   <li>从请求头 {@code X-Trace-Id} 中提取或生成链路追踪 ID 并放入 {@link MDC}。</li>
 *   <li>校验租户代码是否缺失，若缺失（且不是白名单路径）直接返回 403。</li>
 *   <li>在请求处理完毕后（无论成功还是异常），在 {@code finally} 块中严格清理
 *       {@link TenantContext} 和 {@link MDC}，防止线程池复用时污染下一个租户。</li>
 * </ol>
 *
 * <p><b>执行顺序</b>：使用 {@code Ordered.HIGHEST_PRECEDENCE + 10} 确保在所有业务过滤器之前执行。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class TenantContextFilter implements Filter {

    private static final Logger log = LoggerFactory.getLogger(TenantContextFilter.class);

    /** 租户代码请求头 */
    public static final String HEADER_PROGRAM_CODE = "X-Program-Code";

    /** 链路追踪 ID 请求头 */
    public static final String HEADER_TRACE_ID = "X-Trace-Id";

    /** MDC 中 Trace ID 的键名 */
    public static final String MDC_TRACE_ID = "traceId";

    /** MDC 中 Program Code 的键名 */
    public static final String MDC_PROGRAM_CODE = "programCode";

    /**
     * 不需要租户校验的路径前缀（如健康检查、静态资源等）。
     */
    private static final String[] WHITELIST_PATHS = {
            "/actuator/",
            "/health",
            "/swagger-ui",
            "/v3/api-docs",
            "/error"
    };

    @Override
    public void doFilter(ServletRequest request, ServletResponse response,
                         FilterChain chain) throws IOException, ServletException {

        HttpServletRequest httpRequest = (HttpServletRequest) request;
        HttpServletResponse httpResponse = (HttpServletResponse) response;

        String programCode = null;
        String traceId = null;

        try {
            // 1. 提取 Trace ID
            traceId = httpRequest.getHeader(HEADER_TRACE_ID);
            if (!StringUtils.hasText(traceId)) {
                traceId = UUID.randomUUID().toString().replace("-", "");
            }
            MDC.put(MDC_TRACE_ID, traceId);

            // 2. 提取 Program Code
            programCode = httpRequest.getHeader(HEADER_PROGRAM_CODE);
            String requestPath = httpRequest.getRequestURI();

            if (!StringUtils.hasText(programCode)) {
                // 检查是否为白名单路径
                if (isWhitelistedPath(requestPath)) {
                    log.debug("[TenantFilter] 白名单路径跳过租户校验: {} {}", httpRequest.getMethod(), requestPath);
                    chain.doFilter(request, response);
                    return;
                }

                // 缺失租户代码，直接拒绝（第一层防线）
                log.warn("[TenantFilter] 请求缺失 X-Program-Code 头: {} {} (IP: {})",
                        httpRequest.getMethod(), requestPath, getClientIp(httpRequest));
                httpResponse.setStatus(HttpServletResponse.SC_FORBIDDEN);
                httpResponse.setContentType("application/json;charset=UTF-8");
                httpResponse.getWriter().write(
                        "{\"code\":\"ERR_MISSING_PROGRAM_CODE\",\"message\":\"请求头缺失 X-Program-Code，禁止访问\",\"trace_id\":\"" + traceId + "\"}"
                );
                return;
            }

            // 3. 设置租户上下文
            TenantContext.set(programCode);
            MDC.put(MDC_PROGRAM_CODE, programCode);

            log.debug("[TenantFilter] 租户上下文已设置: programCode={}, traceId={}, path={}",
                    programCode, traceId, requestPath);

            // 4. 继续过滤链
            chain.doFilter(request, response);

        } catch (Exception e) {
            log.error("[TenantFilter] 请求处理异常: programCode={}, traceId={}", programCode, traceId, e);
            throw e;

        } finally {
            // 【核心防线】finally 块中严格清理 ThreadLocal，防止线程池复用污染
            TenantContext.clear();
            MDC.remove(MDC_TRACE_ID);
            MDC.remove(MDC_PROGRAM_CODE);
        }
    }

    /**
     * 判断请求路径是否在白名单中。
     */
    private boolean isWhitelistedPath(String path) {
        for (String whitelistPath : WHITELIST_PATHS) {
            if (path.startsWith(whitelistPath)) {
                return true;
            }
        }
        return false;
    }

    /**
     * 获取客户端真实 IP 地址。
     */
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (StringUtils.hasText(xForwardedFor)) {
            return xForwardedFor.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}