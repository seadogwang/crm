package com.loyalty.platform.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("MultiTenantRbacInterceptor permission mapping")
class MultiTenantRbacInterceptorTest {

    private final MultiTenantRbacInterceptor interceptor = new MultiTenantRbacInterceptor("test-jwt-secret");

    @Test
    @DisplayName("admin system endpoints require system permissions")
    void adminSystemRequiresSystemPermissions() {
        assertEquals(OperationPermission.SYSTEM_READ,
                interceptor.resolveRequiredPermission("/api/admin/system/users", "GET"));
        assertEquals(OperationPermission.SYSTEM_WRITE,
                interceptor.resolveRequiredPermission("/api/admin/system/user/1", "PUT"));
    }

    @Test
    @DisplayName("campaign execution endpoints require campaign permissions")
    void campaignEndpointsRequireCampaignPermissions() {
        assertEquals(OperationPermission.CAMPAIGN_READ,
                interceptor.resolveRequiredPermission("/api/campaign/execution/instance/abc", "GET"));
        assertEquals(OperationPermission.CAMPAIGN_WRITE,
                interceptor.resolveRequiredPermission("/api/campaign/execution/instance/abc/execute/job", "POST"));
    }

    @Test
    @DisplayName("unknown api endpoints stay unmapped for default deny")
    void unknownApiEndpointsStayUnmapped() {
        assertNull(interceptor.resolveRequiredPermission("/api/unmapped/admin-task", "GET"));
    }

    @Test
    @DisplayName("auth profile requires only a valid token")
    void authProfileIsAuthenticatedOnly() {
        assertTrue(interceptor.isAuthenticatedOnly("/api/auth/me"));
        assertFalse(interceptor.isAuthenticatedOnly("/api/auth/admin"));
    }
}
