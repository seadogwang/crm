package com.loyalty.platform.system.service;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.security.OperationPermission;
import com.loyalty.platform.security.PlatformRole;
import com.loyalty.platform.system.entity.SysRole;
import com.loyalty.platform.system.entity.SysRolePermission;
import com.loyalty.platform.system.entity.SysUserRole;
import com.loyalty.platform.system.repository.SysRolePermissionRepository;
import com.loyalty.platform.system.repository.SysRoleRepository;
import com.loyalty.platform.system.repository.SysUserRoleRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;

@Service
public class SysRoleService {

    private static final Logger log = LoggerFactory.getLogger(SysRoleService.class);

    private final SysRoleRepository roleRepo;
    private final SysRolePermissionRepository rolePermissionRepo;
    private final SysUserRoleRepository userRoleRepo;

    public SysRoleService(SysRoleRepository roleRepo,
                          SysRolePermissionRepository rolePermissionRepo,
                          SysUserRoleRepository userRoleRepo) {
        this.roleRepo = roleRepo;
        this.rolePermissionRepo = rolePermissionRepo;
        this.userRoleRepo = userRoleRepo;
    }

    /** 列出当前租户下的所有角色（含权限） */
    public List<Map<String, Object>> listRoles(String programCode) {
        List<SysRole> roles = roleRepo.findAllByProgramCode(programCode);
        List<Map<String, Object>> result = new ArrayList<>();
        for (SysRole r : roles) {
            result.add(roleToMap(r));
        }
        return result;
    }

    /** 创建角色 */
    @Transactional
    public Map<String, Object> createRole(Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        String roleName = (String) body.get("roleName");
        String roleCode = (String) body.get("roleCode");

        if (roleName == null || roleName.isBlank()) {
            throw new IllegalArgumentException("角色名称不能为空");
        }
        if (roleCode == null || roleCode.isBlank()) {
            throw new IllegalArgumentException("角色编码不能为空");
        }
        if (roleRepo.existsByProgramCodeAndRoleCode(pc, roleCode)) {
            throw new IllegalArgumentException("角色编码已存在: " + roleCode);
        }

        SysRole role = SysRole.builder()
                .roleName(roleName)
                .roleCode(roleCode)
                .description((String) body.get("description"))
                .dataScope((String) body.getOrDefault("dataScope", "TENANT"))
                .isSystem((Boolean) body.getOrDefault("isSystem", false))
                .programCode(pc)
                .build();

        role = roleRepo.save(role);

        // 保存权限
        @SuppressWarnings("unchecked")
        List<String> permissionIds = (List<String>) body.get("permissionIds");
        if (permissionIds != null) {
            savePermissions(role.getId(), permissionIds, pc);
        }

        log.info("[SysRole] 角色创建: name={}, code={}, program={}", roleName, roleCode, pc);
        return roleToMap(role);
    }

    /** 更新角色 */
    @Transactional
    public Map<String, Object> updateRole(Long id, Map<String, Object> body) {
        String pc = TenantContext.getRequired();
        SysRole role = roleRepo.findByProgramCodeAndId(pc, id)
                .orElseThrow(() -> new IllegalArgumentException("角色不存在: " + id));

        if (body.containsKey("roleName")) role.setRoleName((String) body.get("roleName"));
        if (body.containsKey("description")) role.setDescription((String) body.get("description"));
        if (body.containsKey("dataScope")) role.setDataScope((String) body.get("dataScope"));
        role.setUpdatedAt(LocalDateTime.now());

        // 更新权限
        if (body.containsKey("permissionIds")) {
            rolePermissionRepo.deleteByRoleId(id);
            @SuppressWarnings("unchecked")
            List<String> permissionIds = (List<String>) body.get("permissionIds");
            if (permissionIds != null) {
                savePermissions(id, permissionIds, pc);
            }
        }

        roleRepo.save(role);
        log.info("[SysRole] 角色更新: id={}", id);
        return roleToMap(role);
    }

    /** 删除角色 */
    @Transactional
    public void deleteRole(Long id) {
        String pc = TenantContext.getRequired();
        roleRepo.findByProgramCodeAndId(pc, id)
                .orElseThrow(() -> new IllegalArgumentException("瑙掕壊涓嶅瓨鍦? " + id));
        // 检查是否存在用户关联
        List<SysUserRole> userRoles = userRoleRepo.findAllByRoleId(id);
        if (!userRoles.isEmpty()) {
            // 先删除用户-角色关联
            for (SysUserRole ur : userRoles) {
                userRoleRepo.delete(ur);
            }
        }
        rolePermissionRepo.deleteByRoleId(id);
        roleRepo.deleteById(id);
        log.info("[SysRole] 角色删除: id={}", id);
    }

    /** 获取可用权限目录 */
    public List<Map<String, Object>> getAvailablePermissions() {
        List<Map<String, Object>> result = new ArrayList<>();
        for (OperationPermission p : OperationPermission.values()) {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("permName", formatPermName(p.name()));
            m.put("permCode", p.name());
            m.put("module", extractModule(p.name()));
            m.put("permType", p.name().endsWith("READ") ? "READ" :
                    p.name().endsWith("WRITE") || p.name().endsWith("GRANT")
                            || p.name().endsWith("REDEEM") || p.name().endsWith("ADJUST")
                            || p.name().endsWith("PUBLISH") ? "WRITE" :
                    p.name().endsWith("DELETE") ? "DELETE" : "OTHER");
            result.add(m);
        }
        return result;
    }

    // ==================== 私有辅助方法 ====================

    private void savePermissions(Long roleId, List<String> permissionIds, String programCode) {
        for (String permCode : permissionIds) {
            // 验证权限代码合法
            try {
                OperationPermission.valueOf(permCode);
            } catch (IllegalArgumentException e) {
                log.warn("[SysRole] 忽略无效权限代码: {}", permCode);
                continue;
            }
            rolePermissionRepo.save(SysRolePermission.builder()
                    .roleId(roleId)
                    .permissionCode(permCode)
                    .programCode(programCode)
                    .build());
        }
    }

    private Map<String, Object> roleToMap(SysRole r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", r.getId());
        m.put("roleName", r.getRoleName());
        m.put("roleCode", r.getRoleCode());
        m.put("description", r.getDescription());
        m.put("dataScope", r.getDataScope());
        m.put("isSystem", r.getIsSystem());
        m.put("programCode", r.getProgramCode());

        List<SysRolePermission> perms = rolePermissionRepo.findAllByRoleId(r.getId());
        m.put("permissionIds", perms.stream().map(SysRolePermission::getPermissionCode).toList());

        m.put("createdAt", r.getCreatedAt() != null ? r.getCreatedAt().toString() : null);
        return m;
    }

    private String formatPermName(String permCode) {
        // MEMBER_READ → 会员读取
        // POINTS_GRANT → 积分发放
        return permCode.replace("_", " ").toLowerCase();
    }

    private String extractModule(String permCode) {
        int idx = permCode.indexOf('_');
        return idx > 0 ? permCode.substring(0, idx) : permCode;
    }
}
