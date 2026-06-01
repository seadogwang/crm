package com.loyalty.saas.security;

import com.loyalty.saas.common.context.TenantContext;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 租户污染监控与越权访问审计 — Ch9.3 完整实现。
 *
 * <p>两个核心功能：
 * <ol>
 *   <li><b>防御审计</b>：在 TenantContext.clear() 前检查 ThreadLocal 是否残留非法租户数据</li>
 *   <li><b>越权访问追踪</b>：当 API 中因传入错误的 program_code 导致 404 时，
 *       异步记录审计日志："用户尝试访问跨租户资源"</li>
 * </ol>
 */
@Component
public class TenantAuditMonitor {

    private static final Logger auditLog = LoggerFactory.getLogger("TENANT_AUDIT");

    @PersistenceContext private EntityManager em;

    /**
     * 记录越权访问尝试。
     * 当 API 因 program_code 不匹配导致资源 404 时调用。
     *
     * @param requestTenant 请求中声称的租户
     * @param resourceTenant 资源实际归属的租户
     * @param path          请求路径
     */
    @Async
    public void recordUnauthorizedAccess(String requestTenant, String resourceTenant, String path) {
        String currentTenant = TenantContext.get();
        auditLog.warn("[TENANT_AUDIT] 越权访问: 请求租户 [{}] → 资源租户 [{}], path={}",
                requestTenant, resourceTenant, path);

        try {
            em.createNativeQuery(
                    "INSERT INTO audit_log (program_code, action, detail, created_at) "
                            + "VALUES (?,?,?::jsonb,?)")
                    .setParameter(1, currentTenant != null ? currentTenant : "UNKNOWN")
                    .setParameter(2, "UNAUTHORIZED_ACCESS")
                    .setParameter(3, "{\"request_tenant\":\"" + requestTenant
                            + "\",\"resource_tenant\":\"" + resourceTenant
                            + "\",\"path\":\"" + path + "\"}")
                    .setParameter(4, LocalDateTime.now())
                    .executeUpdate();
        } catch (Exception e) {
            auditLog.error("[TENANT_AUDIT] 审计日志写入失败", e);
        }
    }

    /**
     * 租户污染检测 —— 在 TenantContext 被清理前检查。
     * 如果发现残留的非标准 program_code，触发告警。
     */
    public void checkPollution() {
        String tenant = TenantContext.get();
        if (tenant != null) {
            // 检查是否为合法租户
            try {
                Number count = (Number) em.createNativeQuery(
                        "SELECT COUNT(*) FROM program WHERE code = ?")
                        .setParameter(1, tenant)
                        .getSingleResult();
                if (count.intValue() == 0) {
                    auditLog.error("[TENANT_AUDIT] 租户污染检测：无效租户代码 [{}]", tenant);
                }
            } catch (Exception ignored) {
                // 审计检查失败不应影响业务流程
            }
        }
    }
}