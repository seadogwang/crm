package com.loyalty.platform.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/**
 * 多维度 RBAC 权限拦截器 — 四层防御体系的第一层增强版。
 *
 * <p>职责：
 * <ol>
 *   <li>解析 Authorization Header 中的 Bearer JWT Token</li>
 *   <li>提取用户角色（Role）和细粒度权限（Permission）</li>
 *   <li>隔离四种角色：SUPER_ADMIN / TENANT_ADMIN / STORE_MANAGER / FINANCE_AUDITOR</li>
 *   <li><b>租户绑定</b>：将 Token 中的 program_code 注入 TenantContext</li>
 *   <li>校验 API 路径对应的操作权限</li>
 * </ol>
 *
 * <p><b>安全对齐（Ch9 第九章 9.1 节）</b>：
 * 拦截器校验通过后，必须负责将 Token 中解出的 program_code 自动注入
 * 到 TenantContext 中，作为后续所有 SQL 自动拦截过滤的基石。
 *
 * <p>JWT Token Payload 格式：
 * <pre>
 * {
 *   "sub": "user_id",
 *   "username": "admin",
 *   "role": "TENANT_ADMIN",
 *   "program_code": "PROG001",
 *   "permissions": ["MEMBER_READ", "MEMBER_WRITE"],
 *   "exp": 1717200000
 * }
 * </pre>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
public class MultiTenantRbacInterceptor implements HandlerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(MultiTenantRbacInterceptor.class);

    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    /** JWT 签名密钥 — 从 application.yml 的 loyalty.security.jwt-secret 注入，须与 AuthService 一致 */
    private final String jwtSecret;

    public MultiTenantRbacInterceptor(@Value("${loyalty.security.jwt-secret}") String jwtSecret) {
        this.jwtSecret = jwtSecret;
    }
    private static final String TOKEN_PREFIX = "Bearer ";

    /** 白名单路径（无需鉴权） */
    private static final Set<String> WHITELIST_PATHS = Set.of(
            "/actuator/health",
            "/error",
            "/api/auth/login"
    );

    private static final Set<String> AUTHENTICATED_ONLY_PATHS = Set.of(
            "/api/auth/me"
    );

    /** API 路径 → 所需权限映射 */
    private static final Map<String, OperationPermission> PATH_PERMISSION_MAP = new LinkedHashMap<>();

    static {
        PATH_PERMISSION_MAP.put("/api/admin/system", OperationPermission.SYSTEM_READ);
        PATH_PERMISSION_MAP.put("/api/admin/audit", OperationPermission.AUDIT_READ);
        PATH_PERMISSION_MAP.put("/api/admin/one-id", OperationPermission.TENANT_READ);
        PATH_PERMISSION_MAP.put("/api/admin/llm-config", OperationPermission.SYSTEM_READ);
        PATH_PERMISSION_MAP.put("/api/admin/programs", OperationPermission.TENANT_READ);
        PATH_PERMISSION_MAP.put("/api/admin/rules", OperationPermission.RULE_READ);
        PATH_PERMISSION_MAP.put("/api/admin/channels", OperationPermission.CHANNEL_READ);
        PATH_PERMISSION_MAP.put("/api/admin", OperationPermission.TENANT_READ);
        PATH_PERMISSION_MAP.put("/api/campaign", OperationPermission.CAMPAIGN_READ);
        PATH_PERMISSION_MAP.put("/api/master-data", OperationPermission.MASTER_DATA_READ);
        PATH_PERMISSION_MAP.put("/api/point-types", OperationPermission.RULE_READ);
        PATH_PERMISSION_MAP.put("/api/variables", OperationPermission.RULE_READ);
        PATH_PERMISSION_MAP.put("/api/events", OperationPermission.RULE_READ);
        PATH_PERMISSION_MAP.put("/api/event-data", OperationPermission.RULE_READ);
        PATH_PERMISSION_MAP.put("/api/members", OperationPermission.MEMBER_READ);
        PATH_PERMISSION_MAP.put("/api/schemas", OperationPermission.SCHEMA_READ);
        PATH_PERMISSION_MAP.put("/api/programs", OperationPermission.TENANT_READ);
        PATH_PERMISSION_MAP.put("/api/rules", OperationPermission.RULE_READ);
        PATH_PERMISSION_MAP.put("/api/channels", OperationPermission.CHANNEL_READ);
        PATH_PERMISSION_MAP.put("/api/audit", OperationPermission.AUDIT_READ);
        PATH_PERMISSION_MAP.put("/api/entity-designer", OperationPermission.SCHEMA_READ);
        PATH_PERMISSION_MAP.put("/api/layouts", OperationPermission.SCHEMA_READ);
        PATH_PERMISSION_MAP.put("/api/spi", OperationPermission.TENANT_READ);
        PATH_PERMISSION_MAP.put("/api/open", OperationPermission.TENANT_READ);
    }

    // DELETE 需要删除权限（比写权限更严格）
    private static final Map<String, OperationPermission> DELETE_PERMISSION_MAP = new LinkedHashMap<>();

    static {
        DELETE_PERMISSION_MAP.put("/api/admin/system", OperationPermission.SYSTEM_DELETE);
        DELETE_PERMISSION_MAP.put("/api/admin", OperationPermission.TENANT_WRITE);
        DELETE_PERMISSION_MAP.put("/api/campaign", OperationPermission.CAMPAIGN_WRITE);
        DELETE_PERMISSION_MAP.put("/api/members", OperationPermission.MEMBER_DELETE);
    }

    // POST/PUT/DELETE 需要写权限
    private static final Map<String, OperationPermission> WRITE_PERMISSION_MAP = new LinkedHashMap<>();

    static {
        WRITE_PERMISSION_MAP.put("/api/admin/system", OperationPermission.SYSTEM_WRITE);
        WRITE_PERMISSION_MAP.put("/api/admin/audit", OperationPermission.AUDIT_EXPORT);
        WRITE_PERMISSION_MAP.put("/api/admin/one-id", OperationPermission.TENANT_WRITE);
        WRITE_PERMISSION_MAP.put("/api/admin/llm-config", OperationPermission.SYSTEM_WRITE);
        WRITE_PERMISSION_MAP.put("/api/admin/programs", OperationPermission.TENANT_WRITE);
        WRITE_PERMISSION_MAP.put("/api/admin/rules", OperationPermission.RULE_WRITE);
        WRITE_PERMISSION_MAP.put("/api/admin/channels", OperationPermission.CHANNEL_WRITE);
        WRITE_PERMISSION_MAP.put("/api/admin", OperationPermission.TENANT_WRITE);
        WRITE_PERMISSION_MAP.put("/api/campaign", OperationPermission.CAMPAIGN_WRITE);
        WRITE_PERMISSION_MAP.put("/api/master-data", OperationPermission.MASTER_DATA_WRITE);
        WRITE_PERMISSION_MAP.put("/api/point-types", OperationPermission.RULE_WRITE);
        WRITE_PERMISSION_MAP.put("/api/variables", OperationPermission.RULE_WRITE);
        WRITE_PERMISSION_MAP.put("/api/events", OperationPermission.RULE_WRITE);
        WRITE_PERMISSION_MAP.put("/api/event-data", OperationPermission.RULE_WRITE);
        WRITE_PERMISSION_MAP.put("/api/members", OperationPermission.MEMBER_WRITE);
        WRITE_PERMISSION_MAP.put("/api/schemas", OperationPermission.SCHEMA_WRITE);
        WRITE_PERMISSION_MAP.put("/api/rules", OperationPermission.RULE_WRITE);
        WRITE_PERMISSION_MAP.put("/api/channels", OperationPermission.CHANNEL_WRITE);
        WRITE_PERMISSION_MAP.put("/api/entity-designer", OperationPermission.SCHEMA_WRITE);
        WRITE_PERMISSION_MAP.put("/api/layouts", OperationPermission.SCHEMA_WRITE);
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response,
                              Object handler) throws Exception {

        String path = request.getRequestURI();
        String method = request.getMethod();

        // 1. 白名单路径放行
        if (isWhitelisted(path)) {
            return true;
        }

        // 1.1 SPI 路径：跳过 JWT 鉴权（SPI 使用渠道特定 HMAC 验签，由 SpiGatewayController 处理）
        //      TenantContext 由 TenantContextFilter（白名单放行）和 SpiGatewayController 协同维护
        if (path.startsWith("/api/open/spi/")) {
            log.debug("[RBAC] SPI 路径跳过 JWT 鉴权: path={}", path);
            return true;
        }

        // 2. 解析 Authorization Header
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.startsWith(TOKEN_PREFIX)) {
            log.warn("[RBAC] 缺少 Authorization Header: path={} method={}", path, method);
            writeError(response, HttpStatus.UNAUTHORIZED, "ERR_MISSING_TOKEN", "缺失 Authorization Token");
            return false;
        }

        String token = authHeader.substring(TOKEN_PREFIX.length());

        // 3. 解析并验证 JWT Token
        SecurityContext ctx;
        try {
            ctx = parseAndValidateToken(token);
        } catch (Exception e) {
            log.warn("[RBAC] Token 解析失败: path={}", path, e);
            writeError(response, HttpStatus.UNAUTHORIZED, "ERR_INVALID_TOKEN", "Token 无效或已过期");
            return false;
        }

        // 4. 检查 Token 过期
        if (ctx.isTokenExpired()) {
            log.warn("[RBAC] Token 已过期: user={}", ctx.getUsername());
            writeError(response, HttpStatus.UNAUTHORIZED, "ERR_TOKEN_EXPIRED", "Token 已过期");
            return false;
        }

        // 5. 【关键】租户绑定 — 将 program_code 注入 TenantContext
        // 5a. 校验 JWT program_code 与请求头 X-Program-Code 一致性
        //     SUPER_ADMIN (program_code='*') 允许跨租户访问，跳过一致性检查
        if (ctx.getProgramCode() != null && !ctx.getProgramCode().isBlank()
                && !"*".equals(ctx.getProgramCode())) {
            String headerProgramCode = TenantContext.get();
            if (headerProgramCode != null && !headerProgramCode.isBlank()
                    && !ctx.getProgramCode().equals(headerProgramCode)) {
                log.warn("[RBAC] 租户不匹配: JWT program_code={}, Header X-Program-Code={}, path={}",
                        ctx.getProgramCode(), headerProgramCode, path);
                writeError(response, HttpStatus.FORBIDDEN, "ERR_TENANT_MISMATCH",
                        "JWT program_code 与请求头 X-Program-Code 不匹配");
                return false;
            }
            TenantContext.set(ctx.getProgramCode());
        } else if (ctx.getProgramCode() != null && "*".equals(ctx.getProgramCode())) {
            // SUPER_ADMIN: 使用请求头中的租户代码，但保留访问权
            String headerProgramCode = TenantContext.get();
            if (headerProgramCode != null && !headerProgramCode.isBlank()) {
                TenantContext.set(headerProgramCode);
            } else {
                TenantContext.set(ctx.getProgramCode());
            }
        }

        // 6. 权限校验
        OperationPermission required = resolveRequiredPermission(path, method);
        if (required == null && !isAuthenticatedOnly(path)) {
            log.warn("[RBAC] 鏈槧灏勭殑 API 璺緞榛樿鎷掔粷: user={}, path={}, method={}",
                    ctx.getUsername(), path, method);
            writeError(response, HttpStatus.FORBIDDEN, "ERR_PERMISSION_UNMAPPED",
                    "API 鏉冮檺鏈厤缃? " + path);
            return false;
        }
        if (required != null && !ctx.hasPermission(required)) {
            log.warn("[RBAC] 权限不足: user={}, role={}, path={}, required={}",
                    ctx.getUsername(), ctx.getRole(), path, required);
            writeError(response, HttpStatus.FORBIDDEN, "ERR_FORBIDDEN",
                    "权限不足: 需要 " + required);
            return false;
        }

        // 7. 写入请求属性供后续使用
        request.setAttribute("securityContext", ctx);
        request.setAttribute("userId", ctx.getUserId());
        request.setAttribute("userRole", ctx.getRole().name());

        log.debug("[RBAC] 鉴权通过: user={}, role={}, program={}, path={}",
                ctx.getUsername(), ctx.getRole(), ctx.getProgramCode(), path);
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response,
                                  Object handler, Exception ex) {
        // TenantContext 由 TenantContextFilter 的 finally 统一清理
        // 这里只做审计日志
        if (ex != null) {
            log.error("[RBAC] 请求处理异常: path={}", request.getRequestURI(), ex);
        }
    }

    // ==================== 辅助方法 ====================

    /**
     * 解析并验证 JWT Token。
     * 简单实现：Base64 解码 payload + HMAC 验证签名。
     * 生产环境应使用 jjwt 或 nimbus-jose-jwt 库。
     */
    @SuppressWarnings("unchecked")
    SecurityContext parseAndValidateToken(String token) throws Exception {
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            throw new IllegalArgumentException("Invalid JWT format");
        }

        // 验证签名: HMAC-SHA256(header.payload, secret)
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(jwtSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] expectedSig = mac.doFinal((parts[0] + "." + parts[1]).getBytes(StandardCharsets.UTF_8));
        byte[] actualSig = Base64.getUrlDecoder().decode(parts[2]);

        if (!MessageDigest.isEqual(expectedSig, actualSig)) {
            throw new SecurityException("JWT signature verification failed");
        }

        // 解码 payload
        String payloadJson = new String(Base64.getUrlDecoder().decode(parts[1]), StandardCharsets.UTF_8);
        Map<String, Object> payload = OBJECT_MAPPER.readValue(payloadJson, Map.class);

        SecurityContext ctx = new SecurityContext();
        ctx.setUserId(payload.get("sub") != null ? Long.valueOf(payload.get("sub").toString()) : null);
        ctx.setUsername((String) payload.get("username"));
        ctx.setProgramCode((String) payload.get("program_code"));

        String roleStr = (String) payload.get("role");
        PlatformRole role = roleStr != null ? PlatformRole.fromString(roleStr) : PlatformRole.OPERATOR;
        ctx.setRole(role != null ? role : PlatformRole.OPERATOR);

        // 解析权限集
        List<String> permList = (List<String>) payload.get("permissions");
        if (permList != null) {
            Set<OperationPermission> perms = new HashSet<>();
            for (String p : permList) {
                try { perms.add(OperationPermission.valueOf(p)); } catch (Exception ignored) {}
            }
            // 合并角色默认权限 + Token 显式授权
            perms.addAll(OperationPermission.getPermissionsForRole(ctx.getRole()));
            ctx.setPermissions(perms);
        } else {
            ctx.setPermissions(OperationPermission.getPermissionsForRole(ctx.getRole()));
        }

        // 过期时间
        Object expObj = payload.get("exp");
        ctx.setTokenExpiry(expObj != null ? Long.parseLong(expObj.toString()) * 1000 : Long.MAX_VALUE);

        return ctx;
    }

    OperationPermission resolveRequiredPermission(String path, String method) {
        // 删除操作 — 需要更严格的权限
        if ("DELETE".equalsIgnoreCase(method)) {
            for (Map.Entry<String, OperationPermission> entry : DELETE_PERMISSION_MAP.entrySet()) {
                if (path.startsWith(entry.getKey())) return entry.getValue();
            }
            // 回退到写权限映射
            for (Map.Entry<String, OperationPermission> entry : WRITE_PERMISSION_MAP.entrySet()) {
                if (path.startsWith(entry.getKey())) return entry.getValue();
            }
        }
        // 写操作
        if ("POST".equalsIgnoreCase(method) || "PUT".equalsIgnoreCase(method)) {
            for (Map.Entry<String, OperationPermission> entry : WRITE_PERMISSION_MAP.entrySet()) {
                if (path.startsWith(entry.getKey())) return entry.getValue();
            }
        }
        // 默认读权限
        for (Map.Entry<String, OperationPermission> entry : PATH_PERMISSION_MAP.entrySet()) {
            if (path.startsWith(entry.getKey())) return entry.getValue();
        }
        return null; // 无特别要求 — 会被拒绝（默认拒绝策略）
    }

    boolean isAuthenticatedOnly(String path) {
        for (String authenticatedPath : AUTHENTICATED_ONLY_PATHS) {
            if (path.startsWith(authenticatedPath)) return true;
        }
        return false;
    }

    private boolean isWhitelisted(String path) {
        for (String w : WHITELIST_PATHS) {
            if (path.startsWith(w)) return true;
        }
        return false;
    }

    private void writeError(HttpServletResponse response, HttpStatus status,
                             String code, String message) {
        try {
            response.setStatus(status.value());
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write(OBJECT_MAPPER.writeValueAsString(
                    ApiResponse.error(code, message)));
        } catch (Exception e) {
            log.error("[RBAC] 写入错误响应失败", e);
        }
    }
}
