package com.loyalty.platform.admin;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.system.service.SysRoleService;
import com.loyalty.platform.system.service.SysUserService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 系统管理控制器 — 用户管理 / 角色管理 / 权限目录。
 * <p>
 * 所有端点路径匹配前端 API 定义（campaign.ts 中的 System RBAC API）。
 */
@RestController
@RequestMapping("/api/admin/system")
public class SystemAdminController {

    private static final Logger log = LoggerFactory.getLogger(SystemAdminController.class);

    private final SysUserService userService;
    private final SysRoleService roleService;

    public SystemAdminController(SysUserService userService,
                                  SysRoleService roleService) {
        this.userService = userService;
        this.roleService = roleService;
    }

    // ==================== 用户管理 ====================

    @GetMapping("/users")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listUsers(
            @RequestParam(required = false) String programCode) {
        String pc = TenantContext.getRequired();
        List<Map<String, Object>> users = userService.listUsers(pc);
        return ResponseEntity.ok(ApiResponse.success(users));
    }

    @PostMapping("/user")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createUser(
            @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> user = userService.createUser(body);
            return ResponseEntity.ok(ApiResponse.success(user));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", e.getMessage()));
        }
    }

    @PutMapping("/user/{id}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateUser(
            @PathVariable Long id, @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> user = userService.updateUser(id, body);
            return ResponseEntity.ok(ApiResponse.success(user));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", e.getMessage()));
        }
    }

    @PostMapping("/user/{id}/reset-password")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> resetPassword(
            @PathVariable Long id, @RequestBody Map<String, Object> body) {
        try {
            String password = (String) body.get("password");
            userService.resetPassword(id, password);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            result.put("reset", true);
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", e.getMessage()));
        }
    }

    // ==================== 角色管理 ====================

    @GetMapping("/roles")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listRoles(
            @RequestParam(required = false) String programCode) {
        String pc = TenantContext.getRequired();
        List<Map<String, Object>> roles = roleService.listRoles(pc);
        return ResponseEntity.ok(ApiResponse.success(roles));
    }

    @PostMapping("/role")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> createRole(
            @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> role = roleService.createRole(body);
            return ResponseEntity.ok(ApiResponse.success(role));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(ApiResponse.error("ERR_INVALID", e.getMessage()));
        }
    }

    @PutMapping("/role/{id}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> updateRole(
            @PathVariable Long id, @RequestBody Map<String, Object> body) {
        try {
            Map<String, Object> role = roleService.updateRole(id, body);
            return ResponseEntity.ok(ApiResponse.success(role));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", e.getMessage()));
        }
    }

    @DeleteMapping("/role/{id}")
    @Transactional
    public ResponseEntity<ApiResponse<Map<String, Object>>> deleteRole(@PathVariable Long id) {
        try {
            roleService.deleteRole(id);
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("id", id);
            result.put("deleted", true);
            return ResponseEntity.ok(ApiResponse.success(result));
        } catch (IllegalArgumentException e) {
            return ResponseEntity.ok(ApiResponse.error("ERR_NOT_FOUND", e.getMessage()));
        }
    }

    // ==================== 权限目录 ====================

    @GetMapping("/permissions")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> listPermissions(
            @RequestParam(required = false) String module) {
        List<Map<String, Object>> perms = roleService.getAvailablePermissions();
        if (module != null && !module.isBlank()) {
            perms = perms.stream()
                    .filter(p -> module.equals(p.get("module")))
                    .toList();
        }
        return ResponseEntity.ok(ApiResponse.success(perms));
    }
}
