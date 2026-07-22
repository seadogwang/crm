package com.loyalty.platform.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("PlatformRole + OperationPermission 角色权限映射测试")
class PlatformRolePermissionTest {

    @Test @DisplayName("SUPER_ADMIN — 拥有所有权限")
    void superAdminAllPermissions() {
        Set<OperationPermission> perms = OperationPermission.getPermissionsForRole(PlatformRole.SUPER_ADMIN);
        assertEquals(OperationPermission.values().length, perms.size());
    }

    @Test @DisplayName("TENANT_ADMIN — 除跨租户外拥有大部分权限")
    void tenantAdminPermissions() {
        Set<OperationPermission> perms = OperationPermission.getPermissionsForRole(PlatformRole.TENANT_ADMIN);
        assertTrue(perms.contains(OperationPermission.MEMBER_READ));
        assertTrue(perms.contains(OperationPermission.MEMBER_WRITE));
        assertTrue(perms.contains(OperationPermission.MEMBER_DELETE));
        assertTrue(perms.contains(OperationPermission.POINTS_GRANT));
        assertTrue(perms.contains(OperationPermission.POINTS_REDEEM));
        assertTrue(perms.contains(OperationPermission.RULE_PUBLISH));
        assertTrue(perms.contains(OperationPermission.AUDIT_EXPORT));
        assertTrue(perms.contains(OperationPermission.SYSTEM_WRITE));
        assertTrue(perms.contains(OperationPermission.SYSTEM_DELETE));
        assertTrue(perms.contains(OperationPermission.CAMPAIGN_WRITE));
        assertFalse(perms.contains(OperationPermission.TENANT_WRITE),
                "TENANT_ADMIN 不应有租户管理权限（这些是 SUPER_ADMIN 专有）");
    }

    @Test @DisplayName("STORE_MANAGER — 仅有查询和有限积分权限")
    void storeManagerPermissions() {
        Set<OperationPermission> perms = OperationPermission.getPermissionsForRole(PlatformRole.STORE_MANAGER);
        assertTrue(perms.contains(OperationPermission.MEMBER_READ));
        assertTrue(perms.contains(OperationPermission.POINTS_GRANT));
        assertTrue(perms.contains(OperationPermission.POINTS_REDEEM));
        assertFalse(perms.contains(OperationPermission.MEMBER_WRITE));
        assertFalse(perms.contains(OperationPermission.MEMBER_DELETE));
        assertFalse(perms.contains(OperationPermission.RULE_WRITE));
        assertFalse(perms.contains(OperationPermission.RULE_PUBLISH));
    }

    @Test @DisplayName("FINANCE_AUDITOR — 只读 + 审计导出")
    void financeAuditorReadOnly() {
        Set<OperationPermission> perms = OperationPermission.getPermissionsForRole(PlatformRole.FINANCE_AUDITOR);
        assertTrue(perms.contains(OperationPermission.AUDIT_READ));
        assertTrue(perms.contains(OperationPermission.AUDIT_EXPORT));
        assertTrue(perms.contains(OperationPermission.MEMBER_READ));
        assertFalse(perms.contains(OperationPermission.MEMBER_WRITE));
        assertFalse(perms.contains(OperationPermission.POINTS_GRANT));
        assertFalse(perms.contains(OperationPermission.RULE_WRITE));
    }

    @Test @DisplayName("OPERATOR — 运营权限无审计和租户管理")
    void operatorPermissions() {
        Set<OperationPermission> perms = OperationPermission.getPermissionsForRole(PlatformRole.OPERATOR);
        assertTrue(perms.contains(OperationPermission.MEMBER_READ));
        assertTrue(perms.contains(OperationPermission.MEMBER_WRITE));
        assertTrue(perms.contains(OperationPermission.RULE_READ));
        assertTrue(perms.contains(OperationPermission.RULE_WRITE));
        assertTrue(perms.contains(OperationPermission.CHANNEL_READ));
        assertTrue(perms.contains(OperationPermission.CHANNEL_WRITE));
        assertTrue(perms.contains(OperationPermission.SCHEMA_READ));
        assertTrue(perms.contains(OperationPermission.SCHEMA_WRITE));
        assertTrue(perms.contains(OperationPermission.CAMPAIGN_WRITE));
        assertTrue(perms.contains(OperationPermission.MASTER_DATA_WRITE));
        assertFalse(perms.contains(OperationPermission.AUDIT_EXPORT));
        assertFalse(perms.contains(OperationPermission.TENANT_WRITE));
    }

    @Test @DisplayName("PlatformRole.fromString — 有效解析")
    void fromStringValid() {
        assertEquals(PlatformRole.SUPER_ADMIN, PlatformRole.fromString("SUPER_ADMIN"));
        assertEquals(PlatformRole.TENANT_ADMIN, PlatformRole.fromString("tenant_admin"));
        assertEquals(PlatformRole.OPERATOR, PlatformRole.fromString("operator"));
    }

    @Test @DisplayName("PlatformRole.fromString — 无效/空值")
    void fromStringInvalid() {
        assertNull(PlatformRole.fromString(null));
        assertNull(PlatformRole.fromString("INVALID_ROLE"));
        assertNull(PlatformRole.fromString(""));
    }

    @Test @DisplayName("PlatformRole.isCrossTenant — 仅 SUPER_ADMIN")
    void crossTenantCheck() {
        assertTrue(PlatformRole.SUPER_ADMIN.isCrossTenant());
        assertFalse(PlatformRole.TENANT_ADMIN.isCrossTenant());
        assertFalse(PlatformRole.STORE_MANAGER.isCrossTenant());
        assertFalse(PlatformRole.FINANCE_AUDITOR.isCrossTenant());
        assertFalse(PlatformRole.OPERATOR.isCrossTenant());
    }

    @Test @DisplayName("PlatformRole.isReadOnly — 仅 FINANCE_AUDITOR")
    void readOnlyCheck() {
        assertTrue(PlatformRole.FINANCE_AUDITOR.isReadOnly());
        assertFalse(PlatformRole.SUPER_ADMIN.isReadOnly());
        assertFalse(PlatformRole.TENANT_ADMIN.isReadOnly());
        assertFalse(PlatformRole.STORE_MANAGER.isReadOnly());
        assertFalse(PlatformRole.OPERATOR.isReadOnly());
    }

    @Test @DisplayName("SecurityContext.hasPermission — SUPER_ADMIN 始终通过")
    void securityContextSuperAdminAlwaysPasses() {
        SecurityContext ctx = new SecurityContext();
        ctx.setRole(PlatformRole.SUPER_ADMIN);
        ctx.setPermissions(Set.of()); // 空权限集
        assertTrue(ctx.hasPermission(OperationPermission.TENANT_WRITE));
        assertTrue(ctx.hasPermission(OperationPermission.MEMBER_DELETE));
    }

    @Test @DisplayName("SecurityContext.hasPermission — 普通角色按权限集判断")
    void securityContextPermissionCheck() {
        SecurityContext ctx = new SecurityContext();
        ctx.setRole(PlatformRole.OPERATOR);
        ctx.setPermissions(Set.of(OperationPermission.MEMBER_READ, OperationPermission.RULE_READ));
        assertTrue(ctx.hasPermission(OperationPermission.MEMBER_READ));
        assertTrue(ctx.hasPermission(OperationPermission.RULE_READ));
        assertFalse(ctx.hasPermission(OperationPermission.MEMBER_WRITE));
        assertFalse(ctx.hasPermission(OperationPermission.AUDIT_EXPORT));
    }

    @Test @DisplayName("SecurityContext.isTokenExpired — 过期检测")
    void tokenExpiryCheck() {
        SecurityContext ctx = new SecurityContext();
        ctx.setTokenExpiry(System.currentTimeMillis() + 3600_000);
        assertFalse(ctx.isTokenExpired());
        ctx.setTokenExpiry(System.currentTimeMillis() - 1);
        assertTrue(ctx.isTokenExpired());
    }

    @Test @DisplayName("OperationPermission 枚举值数量")
    void permissionCount() {
        // 确保新增权限不会意外改变
        assertEquals(23, OperationPermission.values().length);
    }
}
