package com.loyalty.platform.system.service;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.system.entity.SysUser;
import com.loyalty.platform.system.entity.SysUserRole;
import com.loyalty.platform.system.repository.SysRoleRepository;
import com.loyalty.platform.system.repository.SysUserRepository;
import com.loyalty.platform.system.repository.SysUserRoleRepository;
import org.mindrot.jbcrypt.BCrypt;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class SysUserService {

    private static final Logger log = LoggerFactory.getLogger(SysUserService.class);

    private final SysUserRepository userRepo;
    private final SysUserRoleRepository userRoleRepo;
    private final SysRoleRepository roleRepo;

    public SysUserService(SysUserRepository userRepo,
                          SysUserRoleRepository userRoleRepo,
                          SysRoleRepository roleRepo) {
        this.userRepo = userRepo;
        this.userRoleRepo = userRoleRepo;
        this.roleRepo = roleRepo;
    }

    /** 列出当前租户下的所有用户 */
    public List<Map<String, Object>> listUsers(String programCode) {
        List<SysUser> users = userRepo.findAllByProgramCode(programCode);
        List<Map<String, Object>> result = new ArrayList<>();
        for (SysUser u : users) {
            result.add(userToMap(u));
        }
        return result;
    }

    /** 创建用户 */
    @Transactional
    public Map<String, Object> createUser(Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String username = (String) body.get("username");
        String password = (String) body.get("password");
        String realName = (String) body.getOrDefault("realName", username);
        String platformRole = (String) body.getOrDefault("platformRole", "OPERATOR");

        if (username == null || username.isBlank()) {
            throw new IllegalArgumentException("用户名不能为空");
        }
        if (password == null || password.isBlank()) {
            throw new IllegalArgumentException("密码不能为空");
        }
        if (userRepo.existsByProgramCodeAndUsername(pc, username)) {
            throw new IllegalArgumentException("用户名已存在: " + username);
        }

        SysUser user = SysUser.builder()
                .username(username)
                .passwordHash(BCrypt.hashpw(password, BCrypt.gensalt(10)))
                .realName(realName)
                .email((String) body.get("email"))
                .phone((String) body.get("phone"))
                .platformRole(platformRole)
                .status("ACTIVE")
                .programCode(pc)
                .build();

        user = userRepo.save(user);
        log.info("[SysUser] 用户创建: username={}, role={}, program={}", username, platformRole, pc);

        // 处理角色分配
        @SuppressWarnings("unchecked")
        List<Number> roleIds = (List<Number>) body.get("roleIds");
        if (roleIds != null && !roleIds.isEmpty()) {
            for (Number rid : roleIds) {
                Long roleId = rid.longValue();
                roleRepo.findByProgramCodeAndId(pc, roleId)
                        .orElseThrow(() -> new IllegalArgumentException("瑙掕壊涓嶅瓨鍦? " + roleId));
                userRoleRepo.save(SysUserRole.builder()
                        .userId(user.getId())
                        .roleId(roleId)
                        .programCode(pc)
                        .build());
            }
        }

        return userToMap(user);
    }

    /** 更新用户信息 */
    @Transactional
    public Map<String, Object> updateUser(Long id, Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        SysUser user = userRepo.findByProgramCodeAndId(pc, id)
                .orElseThrow(() -> new IllegalArgumentException("用户不存在: " + id));

        if (body.containsKey("realName")) user.setRealName((String) body.get("realName"));
        if (body.containsKey("email")) user.setEmail((String) body.get("email"));
        if (body.containsKey("phone")) user.setPhone((String) body.get("phone"));
        if (body.containsKey("platformRole")) user.setPlatformRole((String) body.get("platformRole"));
        if (body.containsKey("status")) user.setStatus((String) body.get("status"));
        user.setUpdatedAt(LocalDateTime.now());

        // 更新角色分配
        if (body.containsKey("roleIds")) {
            userRoleRepo.deleteByUserId(id);
            @SuppressWarnings("unchecked")
            List<Number> roleIds = (List<Number>) body.get("roleIds");
            if (roleIds != null) {
                for (Number rid : roleIds) {
                    Long roleId = rid.longValue();
                    roleRepo.findByProgramCodeAndId(pc, roleId)
                            .orElseThrow(() -> new IllegalArgumentException("瑙掕壊涓嶅瓨鍦? " + roleId));
                    userRoleRepo.save(SysUserRole.builder()
                            .userId(id)
                            .roleId(roleId)
                            .build());
                }
            }
        }

        userRepo.save(user);
        log.info("[SysUser] 用户更新: id={}", id);
        return userToMap(user);
    }

    /** 重置密码 */
    @Transactional
    public void resetPassword(Long id, String newPassword) {
        String pc = TenantContext.getRequired();
        SysUser user = userRepo.findByProgramCodeAndId(pc, id)
                .orElseThrow(() -> new IllegalArgumentException("用户不存在: " + id));
        if (newPassword == null || newPassword.isBlank()) {
            throw new IllegalArgumentException("密码不能为空");
        }
        user.setPasswordHash(BCrypt.hashpw(newPassword, BCrypt.gensalt(10)));
        user.setUpdatedAt(LocalDateTime.now());
        userRepo.save(user);
        log.info("[SysUser] 密码重置: id={}", id);
    }

    /** 用户 → 前端响应 Map */
    private Map<String, Object> userToMap(SysUser u) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", u.getId());
        m.put("username", u.getUsername());
        m.put("realName", u.getRealName());
        m.put("email", u.getEmail());
        m.put("phone", u.getPhone());
        m.put("platformRole", u.getPlatformRole());
        m.put("status", u.getStatus());
        m.put("programCode", u.getProgramCode());

        // 获取用户角色 IDs
        List<SysUserRole> userRoles = userRoleRepo.findAllByUserId(u.getId());
        m.put("roleIds", userRoles.stream().map(SysUserRole::getRoleId).toList());

        m.put("lastLoginAt", u.getLastLoginAt() != null ? u.getLastLoginAt().toString() : null);
        m.put("createdAt", u.getCreatedAt() != null ? u.getCreatedAt().toString() : null);
        return m;
    }
}
