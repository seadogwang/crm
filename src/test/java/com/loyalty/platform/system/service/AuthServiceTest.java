package com.loyalty.platform.system.service;

import com.loyalty.platform.security.OperationPermission;
import com.loyalty.platform.security.PlatformRole;
import com.loyalty.platform.system.entity.SysRolePermission;
import com.loyalty.platform.system.entity.SysUser;
import com.loyalty.platform.system.entity.SysUserRole;
import com.loyalty.platform.system.repository.SysRolePermissionRepository;
import com.loyalty.platform.system.repository.SysUserRepository;
import com.loyalty.platform.system.repository.SysUserRoleRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mindrot.jbcrypt.BCrypt;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthService 认证服务单元测试")
class AuthServiceTest {

    @Mock private SysUserRepository userRepo;
    @Mock private SysUserRoleRepository userRoleRepo;
    @Mock private SysRolePermissionRepository rolePermissionRepo;

    private AuthService authService;

    private static final String TEST_SECRET = "test-jwt-secret-key-for-unit-tests";

    @BeforeEach
    void setUp() {
        authService = new AuthService(userRepo, userRoleRepo, rolePermissionRepo, TEST_SECRET);
    }

    // ==================== BCrypt 密码哈希 ====================

    @Test @DisplayName("BCrypt 哈希-验密闭环")
    void bcryptHashAndVerify() {
        String raw = "admin123";
        String hash = BCrypt.hashpw(raw, BCrypt.gensalt(10));
        assertTrue(hash.startsWith("$2a$"));
        assertTrue(BCrypt.checkpw(raw, hash));
        assertFalse(BCrypt.checkpw("wrong", hash));
    }

    // ==================== JWT Token 生成 ====================

    @Test @DisplayName("JWT 签发 — 格式与 payload 字段正确")
    void generateTokenFormat() {
        SysUser user = SysUser.builder()
                .id(1L).username("testuser").platformRole("OPERATOR").programCode("PROG001")
                .build();
        Set<String> permissions = Set.of("MEMBER_READ", "RULE_READ");

        String token = authService.generateToken(user, permissions, "PROG001");

        // 验证 JWT 三段式结构
        assertNotNull(token);
        String[] parts = token.split("\\.");
        assertEquals(3, parts.length);

        // 解析 payload 验证字段
        SecretKey key = Keys.hmacShaKeyFor(
                TEST_SECRET.getBytes(StandardCharsets.UTF_8));
        Claims claims = Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload();

        assertEquals("1", claims.getSubject());
        assertEquals("testuser", claims.get("username"));
        assertEquals("OPERATOR", claims.get("role"));
        assertEquals("PROG001", claims.get("program_code"));
        assertNotNull(claims.getExpiration());
        @SuppressWarnings("unchecked")
        List<String> perms = claims.get("permissions", List.class);
        assertTrue(perms.contains("MEMBER_READ"));
    }

    @Test @DisplayName("JWT — Token 24 小时内有效")
    void tokenExpiry() {
        SysUser user = SysUser.builder()
                .id(1L).username("u").platformRole("OPERATOR").programCode("X").build();
        String token = authService.generateToken(user, Set.of(), "X");
        SecretKey key = Keys.hmacShaKeyFor(
                TEST_SECRET.getBytes(StandardCharsets.UTF_8));
        Claims claims = Jwts.parser().verifyWith(key).build()
                .parseSignedClaims(token).getPayload();

        long diffMs = claims.getExpiration().getTime() - System.currentTimeMillis();
        assertTrue(diffMs > 23 * 3600_000L, "Token 有效期应 > 23 小时");
        assertTrue(diffMs < 25 * 3600_000L, "Token 有效期应 < 25 小时");
    }

    // ==================== 登录流程 ====================

    @Test @DisplayName("登录成功 — 返回 token + user + permissions")
    void loginSuccess() {
        String rawPassword = "mypassword";
        SysUser user = SysUser.builder()
                .id(42L).username("operator1")
                .passwordHash(BCrypt.hashpw(rawPassword, BCrypt.gensalt(10)))
                .realName("运营员")
                .platformRole("OPERATOR").programCode("PROG001").status("ACTIVE")
                .build();

        when(userRepo.findByProgramCodeAndUsername("PROG001", "operator1"))
                .thenReturn(Optional.of(user));
        when(userRoleRepo.findAllByUserId(42L)).thenReturn(List.of());

        Map<String, Object> result = authService.login("operator1", rawPassword, "PROG001");

        assertNotNull(result.get("token"));
        @SuppressWarnings("unchecked")
        Map<String, Object> userMap = (Map<String, Object>) result.get("user");
        assertEquals(42L, userMap.get("userId"));
        assertEquals("operator1", userMap.get("username"));
        assertEquals("运营员", userMap.get("displayName"));
        assertEquals("OPERATOR", userMap.get("platformRole"));
        @SuppressWarnings("unchecked")
        List<String> perms = (List<String>) result.get("permissions");
        assertFalse(perms.isEmpty(), "OPERATOR 角色应至少有默认权限");
    }

    @Test @DisplayName("登录失败 — 密码错误")
    void loginWrongPassword() {
        SysUser user = SysUser.builder()
                .id(1L).username("u")
                .passwordHash(BCrypt.hashpw("correct", BCrypt.gensalt(10)))
                .platformRole("OPERATOR").programCode("PROG001").status("ACTIVE")
                .build();
        when(userRepo.findByProgramCodeAndUsername("PROG001", "u"))
                .thenReturn(Optional.of(user));

        AuthService.AuthException ex = assertThrows(AuthService.AuthException.class,
                () -> authService.login("u", "wrong", "PROG001"));
        assertEquals("ERR_INVALID_CREDENTIALS", ex.getCode());
    }

    @Test @DisplayName("登录失败 — 用户不存在")
    void loginUserNotFound() {
        when(userRepo.findByProgramCodeAndUsername(anyString(), anyString()))
                .thenReturn(Optional.empty());

        AuthService.AuthException ex = assertThrows(AuthService.AuthException.class,
                () -> authService.login("ghost", "pw", "PROG001"));
        assertEquals("ERR_INVALID_CREDENTIALS", ex.getCode());
    }

    @Test @DisplayName("登录失败 — 用户被禁用")
    void loginDisabledUser() {
        SysUser user = SysUser.builder()
                .id(1L).username("u")
                .passwordHash(BCrypt.hashpw("pw", BCrypt.gensalt(10)))
                .platformRole("OPERATOR").programCode("PROG001").status("DISABLED")
                .build();
        when(userRepo.findByProgramCodeAndUsername("PROG001", "u"))
                .thenReturn(Optional.of(user));

        AuthService.AuthException ex = assertThrows(AuthService.AuthException.class,
                () -> authService.login("u", "pw", "PROG001"));
        assertEquals("ERR_USER_DISABLED", ex.getCode());
    }

    @Test @DisplayName("SUPER_ADMIN 跨租户登录 — program_code='*' 支持")
    void loginSuperAdminCrossTenant() {
        String rawPw = "admin123";
        SysUser superAdmin = SysUser.builder()
                .id(1L).username("superadmin")
                .passwordHash(BCrypt.hashpw(rawPw, BCrypt.gensalt(10)))
                .platformRole("SUPER_ADMIN").programCode("*").status("ACTIVE")
                .build();
        when(userRepo.findByProgramCodeAndUsername("PROG001", "superadmin"))
                .thenReturn(Optional.empty());
        when(userRepo.findByProgramCodeAndUsername("*", "superadmin"))
                .thenReturn(Optional.of(superAdmin));
        when(userRoleRepo.findAllByUserId(1L)).thenReturn(List.of());

        Map<String, Object> result = authService.login("superadmin", rawPw, "PROG001");
        assertNotNull(result.get("token"));
    }

    @Test @DisplayName("角色权限合并 — PlatformRole 默认 + sys_role_permission 自定义")
    void permissionMerge() {
        SysUser user = SysUser.builder()
                .id(1L).username("u")
                .passwordHash(BCrypt.hashpw("pw", BCrypt.gensalt(10)))
                .platformRole("OPERATOR").programCode("PROG001").status("ACTIVE")
                .build();
        when(userRepo.findByProgramCodeAndUsername("PROG001", "u"))
                .thenReturn(Optional.of(user));

        // 用户有自定义角色，该角色有额外权限
        when(userRoleRepo.findAllByUserId(1L)).thenReturn(List.of(
                SysUserRole.builder().id(1L).userId(1L).roleId(100L).build()
        ));
        when(rolePermissionRepo.findAllByRoleId(100L)).thenReturn(List.of(
                SysRolePermission.builder().id(1L).roleId(100L).permissionCode("AUDIT_EXPORT").build(),
                SysRolePermission.builder().id(2L).roleId(100L).permissionCode("TENANT_WRITE").build()
        ));

        Map<String, Object> result = authService.login("u", "pw", "PROG001");
        @SuppressWarnings("unchecked")
        List<String> perms = (List<String>) result.get("permissions");

        // OPERATOR 默认权限 + 自定义权限
        assertTrue(perms.contains("MEMBER_READ"), "应包含 OPERATOR 默认权限");
        assertTrue(perms.contains("AUDIT_EXPORT"), "应包含自定义角色权限");
        assertTrue(perms.contains("TENANT_WRITE"), "应包含自定义角色权限");
    }
}
