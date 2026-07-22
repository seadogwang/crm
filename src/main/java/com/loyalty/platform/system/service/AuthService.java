package com.loyalty.platform.system.service;

import com.loyalty.platform.security.OperationPermission;
import com.loyalty.platform.security.PlatformRole;
import com.loyalty.platform.system.entity.SysRole;
import com.loyalty.platform.system.entity.SysRolePermission;
import com.loyalty.platform.system.entity.SysUser;
import com.loyalty.platform.system.entity.SysUserRole;
import com.loyalty.platform.system.repository.SysRolePermissionRepository;
import com.loyalty.platform.system.repository.SysUserRepository;
import com.loyalty.platform.system.repository.SysUserRoleRepository;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.mindrot.jbcrypt.BCrypt;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /** JWT 签名密钥 — 从 application.yml 的 loyalty.security.jwt-secret 注入，支持环境变量覆盖 */
    private final String jwtSecret;

    /** Token 有效期：24 小时 */
    private static final long TOKEN_TTL_HOURS = 24;

    private final SysUserRepository userRepo;
    private final SysUserRoleRepository userRoleRepo;
    private final SysRolePermissionRepository rolePermissionRepo;

    public AuthService(SysUserRepository userRepo,
                       SysUserRoleRepository userRoleRepo,
                       SysRolePermissionRepository rolePermissionRepo,
                       @Value("${loyalty.security.jwt-secret}") String jwtSecret) {
        this.userRepo = userRepo;
        this.userRoleRepo = userRoleRepo;
        this.rolePermissionRepo = rolePermissionRepo;
        this.jwtSecret = jwtSecret;
    }

    /**
     * 用户登录 — 验证凭据，签发 JWT Token。
     *
     * @return { token, user: { userId, username, displayName, platformRole }, permissions: [...] }
     */
    public Map<String, Object> login(String username, String password, String programCode) {
        // 1. 查找用户（支持跨租户 SUPER_ADMIN，program_code='*'）
        SysUser user = userRepo.findByProgramCodeAndUsername(programCode, username)
                .orElse(null);

        // 如果租户内找不到，尝试查找跨租户 SUPER_ADMIN
        if (user == null && !"*".equals(programCode)) {
            user = userRepo.findByProgramCodeAndUsername("*", username).orElse(null);
        }

        if (user == null) {
            throw new AuthException("ERR_INVALID_CREDENTIALS", "用户名或密码错误");
        }

        if (!"ACTIVE".equals(user.getStatus())) {
            throw new AuthException("ERR_USER_DISABLED", "用户已被禁用");
        }

        // 2. 验证密码
        if (!BCrypt.checkpw(password, user.getPasswordHash())) {
            throw new AuthException("ERR_INVALID_CREDENTIALS", "用户名或密码错误");
        }

        // 3. 收集用户权限（角色权限 + 角色默认权限合并）
        Set<String> permissions = collectPermissions(user);

        // 4. 生成 JWT
        String token = generateToken(user, permissions, programCode);

        // 5. 更新最后登录时间
        user.setLastLoginAt(LocalDateTime.now());
        userRepo.save(user);

        log.info("[Auth] 登录成功: username={}, role={}, program={}", username, user.getPlatformRole(), programCode);

        // 6. 构建响应
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("token", token);
        Map<String, Object> userMap = new LinkedHashMap<>();
        userMap.put("userId", user.getId());
        userMap.put("username", user.getUsername());
        userMap.put("displayName", user.getRealName() != null ? user.getRealName() : user.getUsername());
        userMap.put("platformRole", user.getPlatformRole());
        result.put("user", userMap);
        result.put("permissions", new ArrayList<>(permissions));
        return result;
    }

    /**
     * 收集用户的所有权限。
     * 权限来源：角色自带的 OperationPermission 默认集 + 角色关联的 sys_role_permission 自定义权限。
     */
    private Set<String> collectPermissions(SysUser user) {
        Set<String> permissions = new LinkedHashSet<>();

        // 从 PlatformRole 获取角色默认权限
        PlatformRole platformRole = PlatformRole.fromString(user.getPlatformRole());
        if (platformRole != null) {
            Set<OperationPermission> defaultPerms = OperationPermission.getPermissionsForRole(platformRole);
            defaultPerms.forEach(p -> permissions.add(p.name()));

            // SUPER_ADMIN 拥有所有权限
            if (platformRole == PlatformRole.SUPER_ADMIN) {
                for (OperationPermission p : OperationPermission.values()) {
                    permissions.add(p.name());
                }
            }
        }

        // 从用户分配的角色中收集自定义权限
        List<SysUserRole> userRoles = userRoleRepo.findAllByUserId(user.getId());
        for (SysUserRole ur : userRoles) {
            List<SysRolePermission> rpList = rolePermissionRepo.findAllByRoleId(ur.getRoleId());
            for (SysRolePermission rp : rpList) {
                permissions.add(rp.getPermissionCode());
            }
        }

        return permissions;
    }

    /**
     * 生成 JWT Token — Payload 格式与 MultiTenantRbacInterceptor 期望一致：
     * <pre>
     * { "sub": userId, "username": "...", "role": "TENANT_ADMIN",
     *   "program_code": "PROG001", "permissions": [...], "exp": epoch_seconds }
     * </pre>
     */
    String generateToken(SysUser user, Set<String> permissions, String programCode) {
        SecretKey key = Keys.hmacShaKeyFor(jwtSecret.getBytes(StandardCharsets.UTF_8));
        Instant now = Instant.now();
        Instant exp = now.plus(TOKEN_TTL_HOURS, ChronoUnit.HOURS);

        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .claim("username", user.getUsername())
                .claim("role", user.getPlatformRole())
                .claim("program_code", user.getProgramCode() != null ? user.getProgramCode() : programCode)
                .claim("permissions", new ArrayList<>(permissions))
                .issuedAt(Date.from(now))
                .expiration(Date.from(exp))
                .signWith(key)
                .compact();
    }

    // ==================== 异常类 ====================

    public static class AuthException extends RuntimeException {
        private final String code;
        public AuthException(String code, String message) {
            super(message);
            this.code = code;
        }
        public String getCode() { return code; }
    }
}
