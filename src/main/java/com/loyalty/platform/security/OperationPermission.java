package com.loyalty.platform.security;

import java.util.Set;

/**
 * 操作权限枚举 — 细粒度 API 级别权限控制。
 */
public enum OperationPermission {

    MEMBER_READ, MEMBER_WRITE, MEMBER_DELETE,
    POINTS_GRANT, POINTS_REDEEM, POINTS_ADJUST,
    RULE_READ, RULE_WRITE, RULE_PUBLISH,
    CHANNEL_READ, CHANNEL_WRITE,
    SCHEMA_READ, SCHEMA_WRITE,
    AUDIT_READ, AUDIT_EXPORT,
    SYSTEM_READ, SYSTEM_WRITE, SYSTEM_DELETE,
    MASTER_DATA_READ, MASTER_DATA_WRITE,
    CAMPAIGN_READ, CAMPAIGN_WRITE,
    TENANT_READ, TENANT_WRITE;

    /**
     * 获取角色拥有的默认权限集。
     */
    public static Set<OperationPermission> getPermissionsForRole(PlatformRole role) {
        return switch (role) {
            case SUPER_ADMIN -> Set.of(values());
            case TENANT_ADMIN -> Set.of(
                    MEMBER_READ, MEMBER_WRITE, MEMBER_DELETE,
                    POINTS_GRANT, POINTS_REDEEM, POINTS_ADJUST,
                    RULE_READ, RULE_WRITE, RULE_PUBLISH,
                    CHANNEL_READ, CHANNEL_WRITE,
                    SCHEMA_READ, SCHEMA_WRITE,
                    AUDIT_READ, AUDIT_EXPORT,
                    SYSTEM_READ, SYSTEM_WRITE, SYSTEM_DELETE,
                    MASTER_DATA_READ, MASTER_DATA_WRITE,
                    CAMPAIGN_READ, CAMPAIGN_WRITE
            );
            case STORE_MANAGER -> Set.of(
                    MEMBER_READ, POINTS_GRANT, POINTS_REDEEM,
                    RULE_READ, CHANNEL_READ, AUDIT_READ,
                    CAMPAIGN_READ
            );
            case FINANCE_AUDITOR -> Set.of(
                    MEMBER_READ, RULE_READ, CAMPAIGN_READ,
                    AUDIT_READ, AUDIT_EXPORT, TENANT_READ
            );
            case OPERATOR -> Set.of(
                    MEMBER_READ, MEMBER_WRITE,
                    RULE_READ, RULE_WRITE,
                    CHANNEL_READ, CHANNEL_WRITE,
                    SCHEMA_READ, SCHEMA_WRITE,
                    MASTER_DATA_READ, MASTER_DATA_WRITE,
                    CAMPAIGN_READ, CAMPAIGN_WRITE
            );
        };
    }
}
