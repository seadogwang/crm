package com.loyalty.platform.common.interceptor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.consent.TermsService;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.security.PlatformRole;
import com.loyalty.platform.security.SecurityContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 法律/服务同意拦截器 — 检查会员是否已接受最新章程。
 *
 * <p>在 RBAC 拦截器之后执行，利用其设置的 SecurityContext 获取当前会员ID。
 * 仅检查 CHARTER 类型（俱乐部章程），因为这是强制性的——不接受则无法使用服务。
 *
 * <p>放行规则：
 * <ul>
 *   <li>SUPER_ADMIN / TENANT_ADMIN — 管理员无需检查条款</li>
 *   <li>/api/campaign/terms/** — 条款相关 API 本身</li>
 *   <li>/api/auth/** — 认证相关</li>
 *   <li>/api/admin/** — 管理端 API</li>
 *   <li>/api/open/** — 开放接口</li>
 *   <li>/api/schemas/** — Schema 管理</li>
 *   <li>/api/programs — Program 管理</li>
 *   <li>无 SecurityContext 的请求</li>
 * </ul>
 */
@Component
public class TermsInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(TermsInterceptor.class);
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    private final TermsService termsService;

    public TermsInterceptor(TermsService termsService) {
        this.termsService = termsService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                              Object handler) throws Exception {

        String path = request.getRequestURI();

        // 1. 跳过管理端和系统 API
        if (path.startsWith("/api/campaign/terms/")) return true;
        if (path.startsWith("/api/auth/")) return true;
        if (path.startsWith("/api/admin/")) return true;
        if (path.startsWith("/api/open/")) return true;
        if (path.startsWith("/api/schemas")) return true;
        if (path.startsWith("/api/programs")) return true;
        if (path.startsWith("/api/channels")) return true;
        if (path.startsWith("/api/rules")) return true;
        if (path.startsWith("/actuator")) return true;
        if (path.startsWith("/error")) return true;

        // 2. 获取 SecurityContext（由 RBAC 拦截器设置）
        SecurityContext securityCtx = (SecurityContext) request.getAttribute("securityContext");
        if (securityCtx == null) {
            return true;
        }

        // 3. 管理员角色跳过检查（SUPER_ADMIN, TENANT_ADMIN）
        if (securityCtx.getRole() == PlatformRole.SUPER_ADMIN
                || securityCtx.getRole() == PlatformRole.TENANT_ADMIN) {
            return true;
        }

        // 4. 获取 memberId
        String memberId = securityCtx.getUserId() != null
                ? securityCtx.getUserId().toString()
                : securityCtx.getUsername();

        if (memberId == null || memberId.isBlank()) {
            return true;
        }

        // 5. 仅检查 CHARTER 类型（俱乐部章程是强制性的）
        if (!termsService.isLatestTermsAccepted(memberId, "CHARTER")) {
            log.warn("[Terms] 会员 {} 未接受最新章程，拦截请求: path={}", memberId, path);
            writeError(response, HttpStatus.FORBIDDEN,
                    "ERR_TERMS_NOT_ACCEPTED",
                    "您尚未接受最新版本的俱乐部章程，请先完成同意后再继续操作");
            return false;
        }

        return true;
    }

    private void writeError(HttpServletResponse response, HttpStatus status,
                             String code, String message) {
        try {
            response.setStatus(status.value());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(OBJECT_MAPPER.writeValueAsString(
                    ApiResponse.error(code, message)));
        } catch (Exception e) {
            log.error("[Terms] 写入错误响应失败", e);
        }
    }
}