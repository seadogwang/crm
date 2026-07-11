# Loyalty 系统权限管理体系设计
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：1.0\
> **设计目标**：为 Loyalty 平台构建完整的权限管理体系，涵盖**后台管理用户**、**API 调用账号**、**功能权限**、**数据权限**四个维度，实现统一的身份认证与访问控制。
## 一、整体架构
### 1.1 权限模型（RBAC）
采用 **RBAC（基于角色的访问控制）** 模型，扩展支持数据权限。
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           权限模型（RBAC + 数据权限）                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────┐     ┌─────────┐     ┌─────────────┐     ┌─────────────────┐ │
│   │  用户   │────▶│  角色   │────▶│   权限点    │────▶│    功能/资源    │ │
│   │ (User)  │ N:M │ (Role)  │ N:M │ (Permission)│     │  (Function)     │ │
│   └─────────┘     └─────────┘     └─────────────┘     └─────────────────┘ │
│        │                │                                                  │
│        │                ▼                                                  │
│        │         ┌─────────────┐     ┌─────────────────┐                  │
│        └────────▶│  数据范围   │────▶│   Program 租户  │                  │
│                  │ (DataScope) │     │  (Tenant)      │                  │
│                  └─────────────┘     └─────────────────┘                  │
│                                                                             │
│   用户类型：                                                                │
│     - 后台管理用户（内部运营/客服/管理员）                                    │
│     - API 调用账号（外部系统/商户）                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.2 用户类型分类
| 用户类型         | 说明          | 认证方式                   | 适用场景        |
| ------------ | ----------- | ---------------------- | ----------- |
| **后台管理用户**   | 内部运营/客服/管理员 | 账号密码 + MFA（可选）         | 运营后台、客服工作台  |
| **API 调用账号** | 外部系统/商户     | API Key + Secret / JWT | 开放 API、商户对接 |
| **超级管理员**    | 平台级管理员      | 账号密码 + MFA（强制）         | 系统初始化、租户管理  |
### 1.3 与现有认证体系的集成
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         现有认证体系（已有）                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  JWT Token（用户登录后生成）                                        │   │
│  │  TenantContext（线程级租户上下文）                                   │   │
│  │  TenantContextFilter（请求拦截）                                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 扩展
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         权限管理扩展                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  @RequiresPermission 注解（方法级权限控制）                          │   │
│  │  PermissionInterceptor（权限拦截器）                                 │   │
│  │  DataScopeFilter（数据权限过滤）                                     │   │
│  │  ApiKeyAuthenticationFilter（API Key 认证）                         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
## 二、数据模型设计
### 2.1 用户表（`system_user`）
```sql
-- ============================================================
-- 系统用户表（后台管理用户 + API 调用账号统一管理）
-- ============================================================
CREATE TABLE system_user (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,           -- 所属租户（NULL = 平台级）
    
    -- ===== 基本信息 =====
    username VARCHAR(64) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,         -- BCrypt 加密
    user_type VARCHAR(20) NOT NULL,              -- ADMIN / OPERATOR / CUSTOMER_SERVICE / API_ACCOUNT
    
    -- ===== 个人信息 =====
    real_name VARCHAR(100),
    email VARCHAR(128),
    phone VARCHAR(32),
    avatar VARCHAR(255),
    
    -- ===== 状态控制 =====
    status VARCHAR(20) DEFAULT 'ACTIVE',         -- ACTIVE / INACTIVE / LOCKED / EXPIRED
    locked_at TIMESTAMPTZ,
    lock_reason TEXT,
    
    -- ===== 登录安全 =====
    last_login_at TIMESTAMPTZ,
    last_login_ip INET,
    login_fail_count INT DEFAULT 0,
    password_updated_at TIMESTAMPTZ DEFAULT NOW(),
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(64),                      -- TOTP Secret
    
    -- ===== 元数据 =====
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(program_code, username)
);
CREATE INDEX idx_su_program ON system_user(program_code);
CREATE INDEX idx_su_type ON system_user(user_type);
CREATE INDEX idx_su_status ON system_user(status);
```
### 2.2 API 调用账号表（`system_api_account`）
API 调用账号独立于普通用户，拥有独立的认证凭证和限流配置。
```sql
-- ============================================================
-- API 调用账号表（外部系统/商户对接）
-- ============================================================
CREATE TABLE system_api_account (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    
    -- ===== 账号信息 =====
    account_name VARCHAR(128) NOT NULL,          -- 商户/系统名称
    api_key VARCHAR(64) NOT NULL UNIQUE,         -- Access Key（公开）
    api_secret_hash VARCHAR(255) NOT NULL,       -- Secret Key（加密存储）
    
    -- ===== 权限配置 =====
    role_id VARCHAR(64),                         -- 关联角色（限制功能范围）
    ip_whitelist TEXT[],                         -- IP 白名单
    allowed_apis TEXT[],                         -- 允许调用的 API 路径
    
    -- ===== 限流配置 =====
    rate_limit_per_minute INT DEFAULT 60,
    rate_limit_per_hour INT DEFAULT 1000,
    rate_limit_per_day INT DEFAULT 10000,
    
    -- ===== 状态控制 =====
    status VARCHAR(20) DEFAULT 'ACTIVE',         -- ACTIVE / INACTIVE / EXPIRED
    expires_at TIMESTAMPTZ,                      -- 过期时间（NULL = 永不过期）
    
    -- ===== 使用统计 =====
    last_used_at TIMESTAMPTZ,
    total_requests INT DEFAULT 0,
    
    -- ===== 元数据 =====
    description TEXT,
    contact_person VARCHAR(100),
    contact_email VARCHAR(128),
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(program_code, api_key)
);
CREATE INDEX idx_saa_program ON system_api_account(program_code);
CREATE INDEX idx_saa_key ON system_api_account(api_key);
CREATE INDEX idx_saa_status ON system_api_account(status);
```
### 2.3 角色表（`system_role`）
```sql
-- ============================================================
-- 角色表
-- ============================================================
CREATE TABLE system_role (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,           -- 租户级角色（NULL = 平台级）
    
    role_code VARCHAR(64) NOT NULL,              -- 角色代码（唯一标识）
    role_name VARCHAR(128) NOT NULL,             -- 角色显示名称
    description TEXT,
    
    -- ===== 角色类型 =====
    role_type VARCHAR(20) DEFAULT 'CUSTOM',      -- SYSTEM / BUILTIN / CUSTOM
    is_default BOOLEAN DEFAULT FALSE,            -- 是否默认角色（新用户自动分配）
    
    -- ===== 数据权限范围 =====
    data_scope VARCHAR(20) DEFAULT 'SELF',       -- SELF / PROGRAM / ALL
    
    -- ===== 状态 =====
    status VARCHAR(20) DEFAULT 'ACTIVE',
    
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(program_code, role_code)
);
CREATE INDEX idx_sr_program ON system_role(program_code);
CREATE INDEX idx_sr_type ON system_role(role_type);
```
### 2.4 权限点表（`system_permission`）
```sql
-- ============================================================
-- 权限点表（功能权限）
-- ============================================================
CREATE TABLE system_permission (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    
    perm_code VARCHAR(128) NOT NULL,             -- 权限代码（如 "member:view"）
    perm_name VARCHAR(128) NOT NULL,             -- 权限名称
    perm_type VARCHAR(20) NOT NULL,              -- MENU / BUTTON / API / DATA
    parent_id VARCHAR(64),                       -- 父权限（树形结构）
    
    -- ===== 资源路径 =====
    resource_path VARCHAR(255),                  -- 对应 API 路径或前端路由
    http_method VARCHAR(10),                     -- GET / POST / PUT / DELETE
    
    -- ===== 排序 =====
    sort_order INT DEFAULT 0,
    
    -- ===== 状态 =====
    status VARCHAR(20) DEFAULT 'ACTIVE',
    
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(program_code, perm_code)
);
CREATE INDEX idx_sp_program ON system_permission(program_code);
CREATE INDEX idx_sp_type ON system_permission(perm_type);
CREATE INDEX idx_sp_parent ON system_permission(parent_id);
```
### 2.5 角色-权限关联表（`system_role_permission`）
```sql
-- ============================================================
-- 角色-权限关联表
-- ============================================================
CREATE TABLE system_role_permission (
    id BIGSERIAL PRIMARY KEY,
    role_id VARCHAR(64) NOT NULL,
    permission_id VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(role_id, permission_id)
);
CREATE INDEX idx_srp_role ON system_role_permission(role_id);
CREATE INDEX idx_srp_perm ON system_role_permission(permission_id);
```
### 2.6 用户-角色关联表（`system_user_role`）
```sql
-- ============================================================
-- 用户-角色关联表
-- ============================================================
CREATE TABLE system_user_role (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    role_id VARCHAR(64) NOT NULL,
    assigned_by VARCHAR(64),
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, role_id)
);
CREATE INDEX idx_sur_user ON system_user_role(user_id);
CREATE INDEX idx_sur_role ON system_user_role(role_id);
```
### 2.7 操作日志表（`system_audit_log`）
```sql
-- ============================================================
-- 审计日志表（所有关键操作记录）
-- ============================================================
CREATE TABLE system_audit_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    
    -- ===== 操作人 =====
    user_id VARCHAR(64),
    username VARCHAR(64),
    user_type VARCHAR(20),                      -- ADMIN / OPERATOR / API_ACCOUNT
    
    -- ===== 操作信息 =====
    operation_type VARCHAR(32),                 -- LOGIN / LOGOUT / CREATE / UPDATE / DELETE / QUERY / EXPORT
    operation_target VARCHAR(64),               -- 操作对象类型（如 "MEMBER", "ORDER", "RULE"）
    operation_target_id VARCHAR(64),
    operation_desc TEXT,
    
    -- ===== 请求信息 =====
    request_ip INET,
    request_uri VARCHAR(255),
    http_method VARCHAR(10),
    request_params TEXT,
    request_body TEXT,
    response_code INT,
    
    -- ===== 执行结果 =====
    success BOOLEAN DEFAULT TRUE,
    error_message TEXT,
    execution_time_ms INT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sal_program ON system_audit_log(program_code);
CREATE INDEX idx_sal_user ON system_audit_log(user_id);
CREATE INDEX idx_sal_type ON system_audit_log(operation_type);
CREATE INDEX idx_sal_time ON system_audit_log(created_at DESC);
```
## 三、权限点定义
### 3.1 权限点分类
| 分类         | 权限代码前缀      | 说明       | 示例                                                              |
| ---------- | ----------- | -------- | --------------------------------------------------------------- |
| **会员管理**   | `member:`   | 会员相关操作   | `member:view`, `member:update`, `member:points:adjust`          |
| **订单管理**   | `order:`    | 订单相关操作   | `order:view`, `order:refund`                                    |
| **积分管理**   | `points:`   | 积分相关操作   | `points:grant`, `points:redeem`, `points:adjust`                |
| **等级管理**   | `tier:`     | 等级相关操作   | `tier:view`, `tier:upgrade`, `tier:downgrade`                   |
| **规则引擎**   | `rule:`     | 规则相关操作   | `rule:view`, `rule:edit`, `rule:publish`, `rule:force_override` |
| **活动管理**   | `campaign:` | 营销活动相关   | `campaign:view`, `campaign:create`, `campaign:approve`          |
| **渠道配置**   | `channel:`  | 渠道相关操作   | `channel:view`, `channel:config`                                |
| **流程编排**   | `flow:`     | 流程相关操作   | `flow:view`, `flow:edit`, `flow:publish`                        |
| **系统管理**   | `system:`   | 系统级操作    | `system:user:manage`, `system:role:manage`, `system:audit:view` |
| **API 管理** | `api:`      | API 账号管理 | `api:account:manage`, `api:account:view`                        |
### 3.2 预置角色定义
| 角色代码               | 角色名称     | 说明           | 数据范围      |
| ------------------ | -------- | ------------ | --------- |
| `SUPER_ADMIN`      | 超级管理员    | 平台所有权限       | `ALL`     |
| `PROGRAM_ADMIN`    | 租户管理员    | 租户内所有权限      | `PROGRAM` |
| `PROGRAM_MANAGER`  | 运营经理     | 租户内除系统配置外的权限 | `PROGRAM` |
| `OPERATOR`         | 运营专员     | 日常运营操作       | `PROGRAM` |
| `CUSTOMER_SERVICE` | 客服       | 仅查看和有限修改     | `SELF`    |
| `ANALYST`          | 数据分析师    | 仅查看          | `PROGRAM` |
| `API_ACCOUNT`      | API 调用账号 | API 调用权限     | `PROGRAM` |
### 3.3 权限点清单（示例）
```text
# ===== 会员管理 =====
member:view              # 查看会员
member:create            # 创建会员
member:update            # 修改会员
member:delete            # 删除会员
member:points:view       # 查看积分
member:points:adjust     # 调整积分
member:tier:view         # 查看等级
member:tier:adjust       # 调整等级
member:freeze            # 冻结账户
member:merge             # 合并会员
member:export            # 导出会员
# ===== 积分管理 =====
points:type:view         # 查看积分类型
points:type:edit         # 编辑积分类型
points:grant             # 发放积分
points:redeem            # 兑换积分
points:adjust            # 手动调整积分
# ===== 等级管理 =====
tier:view                # 查看等级
tier:edit                # 编辑等级
tier:upgrade             # 手动升级
tier:downgrade           # 手动降级
tier:rule:edit           # 编辑等级规则
# ===== 规则引擎 =====
rule:view                # 查看规则
rule:edit                # 编辑规则
rule:publish             # 发布规则
rule:force_override      # 强制放行规则
rule:test                # 测试规则
# ===== 活动管理 =====
campaign:view            # 查看活动
campaign:create          # 创建活动
campaign:edit            # 编辑活动
campaign:approve         # 审批活动
campaign:execute         # 执行活动
campaign:pause           # 暂停活动
# ===== 系统管理 =====
system:user:view         # 查看用户
system:user:create       # 创建用户
system:user:edit         # 编辑用户
system:role:view         # 查看角色
system:role:edit         # 编辑角色
system:audit:view        # 查看审计日志
system:config:edit       # 修改系统配置
# ===== API 管理 =====
api:account:view         # 查看 API 账号
api:account:create       # 创建 API 账号
api:account:edit         # 编辑 API 账号
api:account:delete       # 删除 API 账号
```
## 四、后端实现
### 4.1 权限注解（`@RequiresPermission`）

```java
package com.loyalty.platform.common.annotation;
import java.lang.annotation.*;
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresPermission {
    String[] value();                         // 权限代码，如 "member:view"
    Logical logical() default Logical.AND;    // AND / OR
    String[] roles() default {};              // 可选：角色限制
    
    enum Logical {
        AND, OR
    }
}
```
### 4.2 权限拦截器

```java
package com.loyalty.platform.common.interceptor;
import com.loyalty.platform.common.annotation.RequiresPermission;
import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.common.exception.BusinessException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.Arrays;
import java.util.Set;
@Slf4j
@Component
@RequiredArgsConstructor
public class PermissionInterceptor implements HandlerInterceptor {
    private final PermissionService permissionService;
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod handlerMethod)) {
            return true;
        }
        // 1. 获取当前用户
        String userId = SecurityContext.getCurrentUserId();
        if (userId == null) {
            // 对于公开接口，直接放行
            return true;
        }
        // 2. 检查方法上的 @RequiresPermission 注解
        RequiresPermission annotation = handlerMethod.getMethodAnnotation(RequiresPermission.class);
        if (annotation == null) {
            // 检查类上的注解
            annotation = handlerMethod.getBeanType().getAnnotation(RequiresPermission.class);
        }
        if (annotation == null) {
            return true; // 无权限要求，放行
        }
        // 3. 检查用户权限
        String[] requiredPermissions = annotation.value();
        boolean hasPermission = checkPermissions(userId, requiredPermissions, annotation.logical());
        if (!hasPermission) {
            log.warn("用户 {} 缺少权限: {}", userId, Arrays.toString(requiredPermissions));
            throw new BusinessException("ERR_FORBIDDEN", "权限不足，需要权限: " + String.join(", ", requiredPermissions));
        }
        return true;
    }
    private boolean checkPermissions(String userId, String[] requiredPermissions, RequiresPermission.Logical logical) {
        Set<String> userPermissions = permissionService.getUserPermissions(userId);
        if (logical == RequiresPermission.Logical.AND) {
            return Arrays.stream(requiredPermissions).allMatch(userPermissions::contains);
        } else {
            return Arrays.stream(requiredPermissions).anyMatch(userPermissions::contains);
        }
    }
}
```
### 4.3 权限服务

```java
package com.loyalty.platform.system.service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.stereotype.Service;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
@Slf4j
@Service
@RequiredArgsConstructor
public class PermissionService {
    private final SystemUserRoleRepository userRoleRepo;
    private final SystemRolePermissionRepository rolePermRepo;
    private final SystemPermissionRepository permissionRepo;
    /**
     * 获取用户的所有权限
     */
    @Cacheable(value = "userPermissions", key = "#userId")
    public Set<String> getUserPermissions(String userId) {
        // 1. 查询用户的所有角色
        List<String> roleIds = userRoleRepo.findRoleIdsByUserId(userId);
        if (roleIds.isEmpty()) {
            return new HashSet<>();
        }
        // 2. 查询角色的所有权限
        List<String> permissionIds = rolePermRepo.findPermissionIdsByRoleIds(roleIds);
        if (permissionIds.isEmpty()) {
            return new HashSet<>();
        }
        // 3. 查询权限代码
        List<SystemPermission> permissions = permissionRepo.findByIds(permissionIds);
        return permissions.stream()
                .map(SystemPermission::getPermCode)
                .collect(Collectors.toSet());
    }
    /**
     * 检查用户是否有指定权限
     */
    public boolean hasPermission(String userId, String permissionCode) {
        Set<String> permissions = getUserPermissions(userId);
        return permissions.contains(permissionCode);
    }
    /**
     * 检查用户是否有任一指定权限
     */
    public boolean hasAnyPermission(String userId, String... permissionCodes) {
        Set<String> permissions = getUserPermissions(userId);
        for (String code : permissionCodes) {
            if (permissions.contains(code)) {
                return true;
            }
        }
        return false;
    }
    /**
     * 检查用户是否有所有指定权限
     */
    public boolean hasAllPermissions(String userId, String... permissionCodes) {
        Set<String> permissions = getUserPermissions(userId);
        for (String code : permissionCodes) {
            if (!permissions.contains(code)) {
                return false;
            }
        }
        return true;
    }
    /**
     * 清除用户权限缓存
     */
    public void clearUserPermissionCache(String userId) {
        // 清除缓存
    }
}
```
### 4.4 API Key 认证过滤器

```java
package com.loyalty.platform.common.filter;
import com.loyalty.platform.system.service.ApiAccountService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import javax.servlet.FilterChain;
import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
@Slf4j
@Component
@Order(1)
@RequiredArgsConstructor
public class ApiKeyAuthenticationFilter extends OncePerRequestFilter {
    private static final String API_KEY_HEADER = "X-API-Key";
    private static final String API_SIGNATURE_HEADER = "X-API-Signature";
    private static final String API_TIMESTAMP_HEADER = "X-API-Timestamp";
    private final ApiAccountService apiAccountService;
    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain) {
        // 1. 检查是否为 API 请求
        String path = request.getRequestURI();
        if (!path.startsWith("/api/open/")) {
            chain.doFilter(request, response);
            return;
        }
        // 2. 提取认证信息
        String apiKey = request.getHeader(API_KEY_HEADER);
        String signature = request.getHeader(API_SIGNATURE_HEADER);
        String timestamp = request.getHeader(API_TIMESTAMP_HEADER);
        if (apiKey == null || signature == null || timestamp == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("Missing API authentication headers");
            return;
        }
        // 3. 验证 API Key
        ApiAccount account = apiAccountService.validateApiKey(apiKey);
        if (account == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("Invalid API Key");
            return;
        }
        // 4. 验证签名
        boolean valid = apiAccountService.verifySignature(account, request, signature, timestamp);
        if (!valid) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("Invalid signature");
            return;
        }
        // 5. 检查限流
        if (!apiAccountService.checkRateLimit(apiKey)) {
            response.setStatus(HttpServletResponse.SC_TOO_MANY_REQUESTS);
            response.getWriter().write("Rate limit exceeded");
            return;
        }
        // 6. 注入上下文
        ApiContext.setApiAccount(account);
        TenantContext.set(account.getProgramCode());
        try {
            chain.doFilter(request, response);
        } finally {
            ApiContext.clear();
            TenantContext.clear();
        }
    }
}
```
### 4.5 API 账号服务

```java
package com.loyalty.platform.system.service;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Base64;
@Slf4j
@Service
@RequiredArgsConstructor
public class ApiAccountService {
    private final SystemApiAccountRepository apiAccountRepo;
    private final RedisTemplate<String, Integer> rateLimitRedis;
    /**
     * 验证 API Key
     */
    public ApiAccount validateApiKey(String apiKey) {
        ApiAccount account = apiAccountRepo.findByApiKey(apiKey);
        if (account == null) {
            return null;
        }
        if (account.getStatus() != ApiAccountStatus.ACTIVE) {
            return null;
        }
        if (account.getExpiresAt() != null && account.getExpiresAt().isBefore(Instant.now())) {
            return null;
        }
        return account;
    }
    /**
     * 验证 HMAC-SHA256 签名
     * 签名规则：HMAC-SHA256(secret, timestamp + ":" + method + ":" + path + ":" + bodyHash)
     */
    public boolean verifySignature(ApiAccount account, HttpServletRequest request, 
                                   String signature, String timestamp) {
        try {
            String method = request.getMethod();
            String path = request.getRequestURI();
            String body = readBody(request);
            String bodyHash = DigestUtils.sha256Hex(body);
            String payload = timestamp + ":" + method + ":" + path + ":" + bodyHash;
            String expected = hmacSha256(account.getApiSecret(), payload);
            return MessageDigest.isEqual(signature.getBytes(StandardCharsets.UTF_8), 
                                        expected.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            log.error("Signature verification failed", e);
            return false;
        }
    }
    /**
     * 检查限流
     */
    public boolean checkRateLimit(String apiKey) {
        String minuteKey = "rate_limit:" + apiKey + ":minute";
        String hourKey = "rate_limit:" + apiKey + ":hour";
        String dayKey = "rate_limit:" + apiKey + ":day";
        // 获取配置
        ApiAccount account = apiAccountRepo.findByApiKey(apiKey);
        int minuteLimit = account.getRateLimitPerMinute();
        int hourLimit = account.getRateLimitPerHour();
        int dayLimit = account.getRateLimitPerDay();
        return checkAndIncrement(dayKey, dayLimit) &&
               checkAndIncrement(hourKey, hourLimit) &&
               checkAndIncrement(minuteKey, minuteLimit);
    }
    private boolean checkAndIncrement(String key, int limit) {
        Integer count = rateLimitRedis.opsForValue().get(key);
        if (count == null) {
            rateLimitRedis.opsForValue().set(key, 1, Duration.ofSeconds(60));
            return true;
        }
        if (count >= limit) {
            return false;
        }
        rateLimitRedis.opsForValue().increment(key);
        return true;
    }
    private String hmacSha256(String secret, String payload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec keySpec = new SecretKeySpec(
                secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(keySpec);
            byte[] result = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(result);
        } catch (Exception e) {
            throw new RuntimeException("HMAC-SHA256 generation failed", e);
        }
    }
    /**
     * 生成 API Key/Secret 对
     */
    public ApiKeyPair generateApiKey(String programCode, String accountName) {
        String apiKey = "loyalty_" + programCode + "_" + UUID.randomUUID().toString().substring(0, 8);
        String apiSecret = UUID.randomUUID().toString().replace("-", "");
        String secretHash = bcryptEncode(apiSecret);
        ApiAccount account = new ApiAccount();
        account.setId(UUID.randomUUID().toString());
        account.setProgramCode(programCode);
        account.setAccountName(accountName);
        account.setApiKey(apiKey);
        account.setApiSecretHash(secretHash);
        account.setStatus(ApiAccountStatus.ACTIVE);
        apiAccountRepo.save(account);
        return new ApiKeyPair(apiKey, apiSecret);
    }
}
```
## 五、前端界面设计
### 5.1 菜单结构（权限控制）
```text
系统管理（system:view）
  ├── 用户管理（system:user:view）
  │   ├── 用户列表
  │   ├── 新增用户（system:user:create）
  │   └── 编辑用户（system:user:edit）
  ├── 角色管理（system:role:view）
  │   ├── 角色列表
  │   ├── 新增角色（system:role:edit）
  │   └── 权限分配（system:role:edit）
  ├── API 账号管理（api:account:view）
  │   ├── 账号列表
  │   ├── 新增账号（api:account:create）
  │   └── 编辑账号（api:account:edit）
  └── 审计日志（system:audit:view）
```
### 5.2 用户管理页面
```text
┌─ 用户管理 ──────────────────────────────────────────────────────────────────┐
│  [+ 新建用户]  [导入]                                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ 搜索: [________________]  用户类型: [全部 ▼]  状态: [全部 ▼]       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌────┬──────────┬────────────┬──────────┬────────────┬──────────────────┐ │
│  │   │ 用户名   │ 姓名       │ 用户类型  │ 状态       │ 操作             │ │
│  ├────┼──────────┼────────────┼──────────┼────────────┼──────────────────┤ │
│  │ 1  │ admin    │ 系统管理员 │ 管理员   │ ● 正常     │ [编辑] [重置]   │ │
│  │ 2  │ zhangsan │ 张三      │ 运营人员 │ ● 正常     │ [编辑] [重置]   │ │
│  │ 3  │ lisi     │ 李四      │ 客服     │ ○ 已锁定   │ [编辑] [重置]   │ │
│  └────┴──────────┴────────────┴──────────┴────────────┴──────────────────┘ │
│                                                                              │
│  共 23 条  第 1/3 页  [<] [>]                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.3 用户编辑弹窗
```text
┌─ 编辑用户 ──────────────────────────────────────────────────────────────────┐
│  基本信息                                                                   │
│  用户名: [admin              ]  姓名: [系统管理员         ]                │
│  邮箱:   [admin@company.com   ]  手机: [13800000000       ]                │
│  用户类型: [管理员 ▼]  状态: [● 启用  ○ 停用  ○ 锁定]                    │
│                                                                              │
│  ┌─ 角色分配 ─────────────────────────────────────────────────────────────┐ │
│  │  [✓] 超级管理员   [ ] 租户管理员   [ ] 运营经理                      │ │
│  │  [ ] 运营专员     [ ] 客服         [ ] 数据分析师                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 数据权限 ─────────────────────────────────────────────────────────────┐ │
│  │  所属 Program: [BRAND_A ▼]   数据范围: [全部 ▼]                      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [保存] [取消]                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.4 角色管理页面
```text
┌─ 角色管理 ──────────────────────────────────────────────────────────────────┐
│  [+ 新建角色]                                                               │
│                                                                              │
│  ┌────┬────────────┬───────────────────────┬──────────────────────────────┐ │
│  │   │ 角色名称   │ 角色代码               │ 操作                         │ │
│  ├────┼────────────┼───────────────────────┼──────────────────────────────┤ │
│  │ 1  │ 超级管理员 │ SUPER_ADMIN           │ [权限分配] [编辑] [删除]   │ │
│  │ 2  │ 租户管理员 │ PROGRAM_ADMIN         │ [权限分配] [编辑] [删除]   │ │
│  │ 3  │ 运营经理   │ PROGRAM_MANAGER       │ [权限分配] [编辑] [删除]   │ │
│  └────┴────────────┴───────────────────────┴──────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.5 权限分配界面
```text
┌─ 权限分配 - 运营经理 ───────────────────────────────────────────────────────┐
│  角色名称: 运营经理  角色代码: PROGRAM_MANAGER                              │
│                                                                              │
│  ┌─ 全选  ────────────────────────────────────────────────────────────────┐ │
│  │                                                                        │ │
│  │  ▼ 会员管理（member:*）                                                │ │
│  │    [✓] 查看会员（member:view）  [✓] 创建会员（member:create）         │ │
│  │    [✓] 修改会员（member:update） [ ] 删除会员（member:delete）         │ │
│  │    [✓] 查看积分（member:points:view） [✓] 调整积分（member:points:adjust）│ │
│  │                                                                        │ │
│  │  ▼ 规则引擎（rule:*）                                                  │ │
│  │    [✓] 查看规则（rule:view）  [✓] 编辑规则（rule:edit）               │ │
│  │    [✓] 发布规则（rule:publish） [ ] 强制放行（rule:force_override）   │ │
│  │                                                                        │ │
│  │  ▼ 活动管理（campaign:*）                                              │ │
│  │    [✓] 查看活动（campaign:view）  [✓] 创建活动（campaign:create）     │ │
│  │    [✓] 编辑活动（campaign:edit）  [ ] 审批活动（campaign:approve）    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [保存] [取消]                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.6 API 账号管理页面
```text
┌─ API 账号管理 ──────────────────────────────────────────────────────────────┐
│  [+ 新建 API 账号]                                                          │
│                                                                              │
│  ┌────┬────────────┬────────────┬────────────┬──────────┬──────────────────┐ │
│  │   │ 账号名称   │ API Key    │ 状态       │ 调用次数  │ 操作             │ │
│  ├────┼────────────┼────────────┼────────────┼──────────┼──────────────────┤ │
│  │ 1  │ 天猫对接   │ loy_...001 │ ● 正常     │ 12,345   │ [编辑] [密钥]   │ │
│  │ 2  │ 京东对接   │ loy_...002 │ ● 正常     │ 8,901    │ [编辑] [密钥]   │ │
│  │ 3  │ 内部系统   │ loy_...003 │ ○ 已停用   │ 0        │ [编辑] [密钥]   │ │
│  └────┴────────────┴────────────┴────────────┴──────────┴──────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.7 API 账号编辑弹窗
```text
┌─ 新建 API 账号 ─────────────────────────────────────────────────────────────┐
│  账号名称: [天猫对接              ]                                         │
│  描述:     [用于接收天猫订单回调    ]                                         │
│  角色:     [API_ACCOUNT ▼]                                                 │
│                                                                              │
│  ┌─ 限流配置 ─────────────────────────────────────────────────────────────┐ │
│  │  每分钟限制: [60]  每小时限制: [1000]  每日限制: [10000]              │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ IP 白名单 ─────────────────────────────────────────────────────────────┐ │
│  │  192.168.1.0/24                                                         │ │
│  │  10.0.0.1                                                               │ │
│  │  [添加 IP]                                                              │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 权限配置 ─────────────────────────────────────────────────────────────┐ │
│  │  [✓] /api/open/order/*    [✓] /api/open/member/*                     │ │
│  │  [ ] /api/open/points/*    [ ] /api/open/tier/*                       │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [生成密钥] [保存] [取消]                                                    │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 六、安全配置
### 6.1 密码策略
| 策略     | 配置                          |
| ------ | --------------------------- |
| 最小长度   | 8 位                         |
| 复杂度要求  | 大写 + 小写 + 数字 + 特殊字符（至少 3 种） |
| 密码有效期  | 90 天                        |
| 登录失败锁定 | 5 次失败锁定 15 分钟               |
| 密码历史   | 记录最近 5 次密码，不能重复使用           |

```java
@Component
public class PasswordPolicyValidator {
    public boolean validate(String password) {
        // 长度检查
        if (password.length() < 8) return false;
        // 复杂度检查
        boolean hasUpper = false, hasLower = false, hasDigit = false, hasSpecial = false;
        for (char c : password.toCharArray()) {
            if (Character.isUpperCase(c)) hasUpper = true;
            else if (Character.isLowerCase(c)) hasLower = true;
            else if (Character.isDigit(c)) hasDigit = true;
            else hasSpecial = true;
        }
        int count = (hasUpper ? 1 : 0) + (hasLower ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSpecial ? 1 : 0);
        return count >= 3;
    }
}
```
### 6.2 会话管理
* JWT Token 有效期：24 小时（可配置）
* Refresh Token：7 天
* 同一用户最多 5 个并发会话

```java
@Component
public class SessionManager {
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    public void registerSession(String userId, String token) {
        String key = "session:" + userId;
        Set<String> sessions = redisTemplate.opsForSet().members(key);
        if (sessions.size() >= 5) {
            // 踢掉最早的会话
            String oldest = sessions.iterator().next();
            revokeSession(oldest);
        }
        redisTemplate.opsForSet().add(key, token);
        redisTemplate.expire(key, Duration.ofDays(7));
    }
    
    public void revokeSession(String token) {
        // 将 Token 加入黑名单
        redisTemplate.opsForValue().set("blacklist:" + token, "revoked", Duration.ofHours(24));
    }
}
```
### 6.3 审计日志切面

```java
@Aspect
@Component
@Slf4j
public class AuditLogAspect {
    @Autowired
    private SystemAuditLogRepository auditLogRepo;
    
    @Around("@annotation(com.loyalty.platform.common.annotation.Audit)")
    public Object logOperation(ProceedingJoinPoint joinPoint) throws Throwable {
        String operationType = extractOperationType(joinPoint);
        String target = extractTarget(joinPoint);
        
        long start = System.currentTimeMillis();
        boolean success = true;
        String error = null;
        
        try {
            Object result = joinPoint.proceed();
            return result;
        } catch (Exception e) {
            success = false;
            error = e.getMessage();
            throw e;
        } finally {
            long duration = System.currentTimeMillis() - start;
            saveAuditLog(operationType, target, success, error, duration);
        }
    }
    
    private void saveAuditLog(String type, String target, boolean success, String error, long duration) {
        SystemAuditLog log = SystemAuditLog.builder()
            .programCode(TenantContext.get())
            .userId(SecurityContext.getCurrentUserId())
            .username(SecurityContext.getCurrentUsername())
            .userType(SecurityContext.getCurrentUserType())
            .operationType(type)
            .operationTarget(target)
            .success(success)
            .errorMessage(error)
            .executionTimeMs((int) duration)
            .requestIp(WebUtils.getClientIp())
            .requestUri(WebUtils.getRequestUri())
            .build();
        auditLogRepo.save(log);
    }
}
```
## 七、数据权限实现
### 7.1 数据范围类型
| 数据范围      | 说明                   |
| --------- | -------------------- |
| `SELF`    | 仅本人数据（客服只能查看自己处理的工单） |
| `PROGRAM` | 所在 Program 的数据（租户级）  |
| `ALL`     | 全部 Program（仅超级管理员）   |
### 7.2 MyBatis 数据权限拦截器

```java
@Component
@Intercepts({
    @Signature(type = StatementHandler.class, method = "prepare", args = {Connection.class, Integer.class})
})
public class DataPermissionInterceptor implements Interceptor {
    
    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        StatementHandler handler = (StatementHandler) invocation.getTarget();
        MetaObject meta = SystemMetaObject.forObject(handler);
        MappedStatement ms = (MappedStatement) meta.getValue("delegate.mappedStatement");
        
        // 检查是否有 @DataPermission 注解
        if (!hasDataPermissionAnnotation(ms)) {
            return invocation.proceed();
        }
        
        // 获取当前用户的数据范围
        String userId = SecurityContext.getCurrentUserId();
        String dataScope = SecurityContext.getDataScope();
        String programCode = TenantContext.get();
        
        // 改造 SQL，添加数据权限过滤
        String originalSql = (String) meta.getValue("delegate.boundSql.sql");
        String newSql = applyDataPermission(originalSql, dataScope, programCode, userId);
        meta.setValue("delegate.boundSql.sql", newSql);
        
        return invocation.proceed();
    }
    
    private String applyDataPermission(String sql, String dataScope, String programCode, String userId) {
        switch (dataScope) {
            case "SELF":
                return sql + " AND created_by = '" + userId + "'";
            case "PROGRAM":
                return sql + " AND program_code = '" + programCode + "'";
            case "ALL":
                return sql;
            default:
                return sql + " AND program_code = '" + programCode + "'";
        }
    }
}
```
## 八、预置数据初始化
```sql
-- ============================================================
-- 预置权限数据 SQL
-- ============================================================
-- 1. 预置角色
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('r1', NULL, 'SUPER_ADMIN', '超级管理员', 'SYSTEM', FALSE, 'ALL'),
('r2', 'BRAND_A', 'PROGRAM_ADMIN', '租户管理员', 'SYSTEM', FALSE, 'PROGRAM'),
('r3', 'BRAND_A', 'PROGRAM_MANAGER', '运营经理', 'SYSTEM', FALSE, 'PROGRAM'),
('r4', 'BRAND_A', 'OPERATOR', '运营专员', 'SYSTEM', TRUE, 'PROGRAM'),
('r5', 'BRAND_A', 'CUSTOMER_SERVICE', '客服', 'SYSTEM', FALSE, 'SELF');
-- 2. 预置超级管理员用户
INSERT INTO system_user (id, program_code, username, password_hash, user_type, real_name, status) VALUES
('u1', NULL, 'admin', '$2a$10$...', 'ADMIN', '系统管理员', 'ACTIVE');
-- 3. 超级管理员关联超级管理员角色
INSERT INTO system_user_role (user_id, role_id) VALUES ('u1', 'r1');
```
## 九、与现有系统的集成
### 9.1 与 JWT 认证的集成
现有 JWT Token 中扩展权限信息，减少数据库查询：

```java
public class JwtTokenProvider {
    public String generateToken(User user, Set<String> permissions) {
        Claims claims = Jwts.claims()
            .setSubject(user.getId())
            .setIssuedAt(new Date())
            .setExpiration(new Date(System.currentTimeMillis() + TOKEN_VALIDITY));
        
        // 扩展权限信息到 Token
        claims.put("programCode", user.getProgramCode());
        claims.put("userType", user.getUserType());
        claims.put("dataScope", user.getDataScope());
        claims.put("permissions", permissions);
        
        return Jwts.builder()
            .setClaims(claims)
            .signWith(SignatureAlgorithm.HS256, jwtSecret)
            .compact();
    }
}
```
### 9.2 与 TenantContext 的集成
用户登录后，从 Token 中解析租户信息并设置到 TenantContext：

```java
@Component
public class TenantContextFilter implements Filter {
    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) {
        String token = extractToken(request);
        if (token != null) {
            Claims claims = JwtTokenProvider.parseToken(token);
            String programCode = claims.get("programCode", String.class);
            TenantContext.set(programCode);
            
            // 同时设置权限信息
            Set<String> permissions = claims.get("permissions", Set.class);
            SecurityContext.setPermissions(permissions);
        }
        try {
            chain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            SecurityContext.clear();
        }
    }
}
```
## 十、总结
| 能力           | 实现方式                                             |
| ------------ | ------------------------------------------------ |
| **用户管理**     | `system_user` 表 + 前端管理界面                         |
| **API 账号管理** | `system_api_account` 表 + API Key/Secret 认证       |
| **角色管理**     | `system_role` 表 + 前端管理界面                         |
| **权限点管理**    | `system_permission` 表 + `@RequiresPermission` 注解 |
| **权限拦截**     | `PermissionInterceptor` 拦截器                      |
| **数据权限**     | `DataPermissionInterceptor` + 数据范围字段             |
| **API 认证**   | `ApiKeyAuthenticationFilter` + HMAC-SHA256 签名    |
| **限流控制**     | Redis 计数 + 配置化限流                                 |
| **审计日志**     | `system_audit_log` 表 + `@Audit` 切面               |
| **密码策略**     | `PasswordPolicyValidator`                        |
| **会话管理**     | Redis 存储 + Token 黑名单                             |
# Campaign 模块权限与用户角色设计
> **关联文档**：Loyalty 系统权限管理体系设计（v1.0）\
> **设计目标**：在 Loyalty 权限体系基础上，补充 Campaign Tools 模块的权限点定义、预置角色配置及数据权限规则。
***
## 一、整体融合策略
### 1.1 融合原则
| 原则               | 说明                                                       |
| ---------------- | -------------------------------------------------------- |
| **复用现有 RBAC 框架** | 完全复用 `system_user`、`system_role`、`system_permission` 表结构 |
| **权限点命名空间隔离**    | Campaign 权限点统一使用 `campaign:` 前缀，避免与 Loyalty 核心冲突         |
| **角色平滑扩展**       | 新增 Campaign 专属角色，同时允许 Loyalty 已有角色绑定 Campaign 权限         |
| **数据权限统一**       | 复用 `program_code` + 新增 `workspace_id` 数据维度               |
### 1.2 与 Loyalty 权限体系的集成关系
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Loyalty 权限体系（已有）                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  system_user │ system_role │ system_permission │ system_user_role │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│                                    │ 扩展                                   │
│                                    ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Campaign 权限扩展                                 │   │
│  │  ┌──────────────────────────────────────────────────────────────┐  │   │
│  │  │  新增权限点：campaign:*                                       │  │   │
│  │  │  新增角色：CAMPAIGN_ADMIN / CAMPAIGN_MANAGER / ...          │  │   │
│  │  │  新增数据维度：workspace_id + program_code                   │  │   │
│  │  └──────────────────────────────────────────────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
## 二、Campaign 权限点定义
### 2.1 权限点分类结构
```text
campaign:
├── workspace (工作区管理)
│   ├── view              # 查看工作区
│   ├── create            # 创建工作区
│   ├── edit              # 编辑工作区
│   ├── delete            # 删除工作区
│   └── archive           # 归档工作区
├── goal (目标管理)
│   ├── view              # 查看目标
│   ├── create            # 创建目标
│   ├── edit              # 编辑目标
│   ├── delete            # 删除目标
│   ├── activate          # 激活目标
│   └── archive           # 归档目标
├── initiative (举措管理)
│   ├── view              # 查看举措
│   ├── create            # 创建举措
│   ├── edit              # 编辑举措
│   ├── delete            # 删除举措
│   ├── activate          # 激活举措
│   └── archive           # 归档举措
├── portfolio (组合管理)
│   ├── view              # 查看组合
│   ├── create            # 创建组合
│   ├── edit              # 编辑组合
│   ├── delete            # 删除组合
│   ├── optimize          # 运行优化
│   └── lock              # 锁定组合
├── opportunity (机会发现)
│   ├── view              # 查看机会
│   ├── discover          # 触发机会发现
│   ├── refresh           # 刷新机会评分
│   └── export            # 导出机会数据
├── canvas (画布)
│   ├── view              # 查看画布
│   ├── create            # 创建画布
│   ├── edit              # 编辑画布
│   ├── delete            # 删除画布
│   └── save              # 保存画布
├── execution (执行)
│   ├── view              # 查看执行状态
│   ├── deploy            # 部署到 Zeebe
│   ├── start             # 启动执行
│   ├── pause             # 暂停执行
│   ├── resume            # 恢复执行
│   ├── cancel            # 取消执行
│   └── retry             # 重试失败作业
├── content (内容与审批)
│   ├── asset:view        # 查看素材
│   ├── asset:create      # 创建素材
│   ├── asset:edit        # 编辑素材
│   ├── asset:delete      # 删除素材
│   ├── approval:submit   # 提交审批
│   ├── approval:approve  # 审批通过
│   └── approval:reject   # 审批拒绝
├── intervention (人工干预)
│   ├── pause              # 暂停执行
│   ├── resume             # 恢复执行
│   ├── cancel             # 取消执行
│   ├── skip_node          # 跳过节点
│   ├── override_config    # 覆盖配置
│   └── emergency_stop     # 紧急停止
├── strategy (策略拆解)
│   ├── view               # 查看策略建议
│   ├── analyze            # 执行拆解分析
│   ├── adopt              # 采纳策略建议
│   └── blueprint:view     # 查看策略蓝图
├── system (系统管理)
│   └── blueprint:edit     # 编辑策略蓝图（管理员）
└── all                   # 所有 Campaign 权限
```
### 2.2 详细权限点清单
| 权限代码                                    | 权限名称  | 类型     | 说明                  |
| --------------------------------------- | ----- | ------ | ------------------- |
| `campaign:workspace:view`               | 查看工作区 | MENU   | 查看工作区列表和详情          |
| `campaign:workspace:create`             | 创建工作区 | BUTTON | 创建新的营销工作区           |
| `campaign:workspace:edit`               | 编辑工作区 | BUTTON | 修改工作区配置             |
| `campaign:workspace:delete`             | 删除工作区 | BUTTON | 删除工作区               |
| `campaign:workspace:archive`            | 归档工作区 | BUTTON | 归档已结束的工作区           |
| `campaign:goal:view`                    | 查看目标  | MENU   | 查看目标列表和详情           |
| `campaign:goal:create`                  | 创建目标  | BUTTON | 创建新的营销目标            |
| `campaign:goal:edit`                    | 编辑目标  | BUTTON | 修改目标配置              |
| `campaign:goal:delete`                  | 删除目标  | BUTTON | 删除目标                |
| `campaign:goal:activate`                | 激活目标  | BUTTON | 激活目标（会停用其他ACTIVE目标） |
| `campaign:goal:archive`                 | 归档目标  | BUTTON | 归档已结束的目标            |
| `campaign:initiative:view`              | 查看举措  | MENU   | 查看举措列表和详情           |
| `campaign:initiative:create`            | 创建举措  | BUTTON | 创建新的营销举措            |
| `campaign:initiative:edit`              | 编辑举措  | BUTTON | 修改举措配置              |
| `campaign:initiative:delete`            | 删除举措  | BUTTON | 删除举措                |
| `campaign:initiative:activate`          | 激活举措  | BUTTON | 激活举措                |
| `campaign:initiative:archive`           | 归档举措  | BUTTON | 归档举措                |
| `campaign:portfolio:view`               | 查看组合  | MENU   | 查看组合列表和详情           |
| `campaign:portfolio:create`             | 创建组合  | BUTTON | 创建新的营销组合            |
| `campaign:portfolio:edit`               | 编辑组合  | BUTTON | 修改组合配置              |
| `campaign:portfolio:delete`             | 删除组合  | BUTTON | 删除组合                |
| `campaign:portfolio:optimize`           | 运行优化  | BUTTON | 执行预算分配优化            |
| `campaign:portfolio:lock`               | 锁定组合  | BUTTON | 锁定组合禁止修改            |
| `campaign:opportunity:view`             | 查看机会  | MENU   | 查看机会列表              |
| `campaign:opportunity:discover`         | 触发发现  | BUTTON | 执行机会发现              |
| `campaign:opportunity:refresh`          | 刷新评分  | BUTTON | 刷新机会评分              |
| `campaign:opportunity:export`           | 导出数据  | BUTTON | 导出机会数据              |
| `campaign:canvas:view`                  | 查看画布  | MENU   | 查看画布                |
| `campaign:canvas:create`                | 创建画布  | BUTTON | 创建新画布               |
| `campaign:canvas:edit`                  | 编辑画布  | BUTTON | 编辑画布节点和连线           |
| `campaign:canvas:delete`                | 删除画布  | BUTTON | 删除画布                |
| `campaign:canvas:save`                  | 保存画布  | BUTTON | 保存画布草稿              |
| `campaign:execution:view`               | 查看执行  | MENU   | 查看执行状态和历史           |
| `campaign:execution:deploy`             | 部署流程  | BUTTON | 部署到 Zeebe           |
| `campaign:execution:start`              | 启动执行  | BUTTON | 启动流程实例              |
| `campaign:execution:pause`              | 暂停执行  | BUTTON | 暂停流程执行              |
| `campaign:execution:resume`             | 恢复执行  | BUTTON | 恢复暂停的流程             |
| `campaign:execution:cancel`             | 取消执行  | BUTTON | 取消流程执行              |
| `campaign:execution:retry`              | 重试作业  | BUTTON | 重试失败的作业             |
| `campaign:content:asset:view`           | 查看素材  | MENU   | 查看素材列表              |
| `campaign:content:asset:create`         | 创建素材  | BUTTON | 创建新素材               |
| `campaign:content:asset:edit`           | 编辑素材  | BUTTON | 编辑素材内容              |
| `campaign:content:asset:delete`         | 删除素材  | BUTTON | 删除素材                |
| `campaign:content:approval:submit`      | 提交审批  | BUTTON | 提交素材审批              |
| `campaign:content:approval:approve`     | 审批通过  | BUTTON | 审批通过素材              |
| `campaign:content:approval:reject`      | 审批拒绝  | BUTTON | 审批拒绝素材              |
| `campaign:intervention:pause`           | 执行暂停  | BUTTON | 人工暂停 Campaign       |
| `campaign:intervention:resume`          | 执行恢复  | BUTTON | 人工恢复 Campaign       |
| `campaign:intervention:cancel`          | 执行取消  | BUTTON | 人工取消 Campaign       |
| `campaign:intervention:skip_node`       | 跳过节点  | BUTTON | 人工跳过节点              |
| `campaign:intervention:override_config` | 覆盖配置  | BUTTON | 修改运行中节点配置           |
| `campaign:intervention:emergency_stop`  | 紧急停止  | BUTTON | 紧急停止 Campaign       |
| `campaign:strategy:view`                | 查看策略  | MENU   | 查看策略建议              |
| `campaign:strategy:analyze`             | 拆解分析  | BUTTON | 执行目标拆解              |
| `campaign:strategy:adopt`               | 采纳建议  | BUTTON | 采纳策略建议创建举措          |
| `campaign:strategy:blueprint:view`      | 查看蓝图  | MENU   | 查看策略蓝图              |
| `campaign:strategy:blueprint:edit`      | 编辑蓝图  | BUTTON | 编辑策略蓝图（管理员）         |
| `campaign:all`                          | 全部权限  | -      | 拥有所有 Campaign 权限    |
## 三、预置角色设计
### 3.1 Campaign 预置角色
| 角色代码                       | 角色名称         | 数据范围      | 适用人员       | 说明                                  |
| -------------------------- | ------------ | --------- | ---------- | ----------------------------------- |
| `CAMPAIGN_ADMIN`           | Campaign 管理员 | `ALL`     | 平台管理员      | 拥有所有 Campaign 权限，包括蓝图编辑、紧急停止、系统配置   |
| `CAMPAIGN_MANAGER`         | Campaign 经理  | `PROGRAM` | 营销团队负责人    | 拥有完整 Campaign 管理权限（除蓝图编辑、紧急停止、系统配置） |
| `CAMPAIGN_OPERATOR`        | Campaign 运营  | `PROGRAM` | 运营专员       | 日常运营操作：创建活动、执行、查看数据、提交审批            |
| `CAMPAIGN_CONTENT_MANAGER` | 内容负责人        | `PROGRAM` | 内容/创意团队    | 素材创建、编辑、提交审批（无活动执行权限）               |
| `CAMPAIGN_APPROVER`        | 审批人          | `PROGRAM` | 法务/合规/营销经理 | 仅审批权限：查看素材、审批通过/拒绝                  |
| `CAMPAIGN_ANALYST`         | 数据分析师        | `PROGRAM` | 数据团队       | 只读权限：查看所有数据（机会、执行、反馈），无操作权限         |
| `CAMPAIGN_VIEWER`          | 查看者          | `PROGRAM` | 业务方/合作伙伴   | 最小只读权限：仅查看活动概览                      |
| `CAMPAIGN_INTERVENTION`    | 干预操作员        | `PROGRAM` | 高级运营/值班人员  | 仅干预权限：暂停/恢复/取消/紧急停止                 |
| `CAMPAIGN_API_ACCOUNT`     | API 调用账号     | `PROGRAM` | 外部系统       | API 调用权限：受限的 API 访问                 |
### 3.2 角色权限矩阵
| 权限点                                     | ADMIN | MANAGER | OPERATOR | CONTENT\_MGR | APPROVER | ANALYST | VIEWER | INTERVENTION | API\_ACCOUNT |
| --------------------------------------- | ----- | ------- | -------- | ------------ | -------- | ------- | ------ | ------------ | ------------ |
| `campaign:workspace:*`                  | ✅     | ✅       | ✅        | ❌            | ❌        | ✅       | ✅      | ❌            | ❌            |
| `campaign:goal:*`                       | ✅     | ✅       | ✅        | ❌            | ❌        | ✅       | ✅      | ❌            | ❌            |
| `campaign:initiative:*`                 | ✅     | ✅       | ✅        | ❌            | ❌        | ✅       | ✅      | ❌            | ❌            |
| `campaign:portfolio:*`                  | ✅     | ✅       | ✅        | ❌            | ❌        | ✅       | ✅      | ❌            | ❌            |
| `campaign:opportunity:*`                | ✅     | ✅       | ✅        | ❌            | ❌        | ✅       | ✅      | ❌            | ✅            |
| `campaign:canvas:*`                     | ✅     | ✅       | ✅        | ❌            | ❌        | ✅       | ✅      | ❌            | ❌            |
| `campaign:execution:*`                  | ✅     | ✅       | ✅        | ❌            | ❌        | ✅       | ✅      | ❌            | ✅            |
| `campaign:content:asset:*`              | ✅     | ✅       | ✅        | ✅            | ✅        | ✅       | ❌      | ❌            | ❌            |
| `campaign:content:approval:submit`      | ✅     | ✅       | ✅        | ✅            | ❌        | ❌       | ❌      | ❌            | ❌            |
| `campaign:content:approval:approve`     | ✅     | ✅       | ❌        | ❌            | ✅        | ❌       | ❌      | ❌            | ❌            |
| `campaign:content:approval:reject`      | ✅     | ✅       | ❌        | ❌            | ✅        | ❌       | ❌      | ❌            | ❌            |
| `campaign:intervention:pause`           | ✅     | ✅       | ❌        | ❌            | ❌        | ❌       | ❌      | ✅            | ❌            |
| `campaign:intervention:resume`          | ✅     | ✅       | ❌        | ❌            | ❌        | ❌       | ❌      | ✅            | ❌            |
| `campaign:intervention:cancel`          | ✅     | ✅       | ❌        | ❌            | ❌        | ❌       | ❌      | ✅            | ❌            |
| `campaign:intervention:skip_node`       | ✅     | ✅       | ❌        | ❌            | ❌        | ❌       | ❌      | ✅            | ❌            |
| `campaign:intervention:override_config` | ✅     | ✅       | ❌        | ❌            | ❌        | ❌       | ❌      | ✅            | ❌            |
| `campaign:intervention:emergency_stop`  | ✅     | ❌       | ❌        | ❌            | ❌        | ❌       | ❌      | ✅            | ❌            |
| `campaign:strategy:view`                | ✅     | ✅       | ✅        | ❌            | ❌        | ✅       | ✅      | ❌            | ❌            |
| `campaign:strategy:analyze`             | ✅     | ✅       | ✅        | ❌            | ❌        | ❌       | ❌      | ❌            | ❌            |
| `campaign:strategy:adopt`               | ✅     | ✅       | ✅        | ❌            | ❌        | ❌       | ❌      | ❌            | ❌            |
| `campaign:strategy:blueprint:view`      | ✅     | ✅       | ❌        | ❌            | ❌        | ❌       | ❌      | ❌            | ❌            |
| `campaign:strategy:blueprint:edit`      | ✅     | ❌       | ❌        | ❌            | ❌        | ❌       | ❌      | ❌            | ❌            |
### 3.3 角色权限聚合示例
```sql
-- ============================================================
-- Campaign 预置角色数据初始化
-- ============================================================
-- 1. Campaign 管理员（拥有所有 Campaign 权限）
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('role_campaign_admin', NULL, 'CAMPAIGN_ADMIN', 'Campaign管理员', 'SYSTEM', FALSE, 'ALL');
-- 2. Campaign 经理（完整管理权限）
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('role_campaign_manager', 'BRAND_A', 'CAMPAIGN_MANAGER', 'Campaign经理', 'SYSTEM', FALSE, 'PROGRAM');
-- 3. Campaign 运营（日常运营操作）
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('role_campaign_operator', 'BRAND_A', 'CAMPAIGN_OPERATOR', 'Campaign运营', 'SYSTEM', TRUE, 'PROGRAM');
-- 4. 内容负责人
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('role_campaign_content', 'BRAND_A', 'CAMPAIGN_CONTENT_MANAGER', '内容负责人', 'SYSTEM', FALSE, 'PROGRAM');
-- 5. 审批人
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('role_campaign_approver', 'BRAND_A', 'CAMPAIGN_APPROVER', 'Campaign审批人', 'SYSTEM', FALSE, 'PROGRAM');
-- 6. 数据分析师（只读）
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('role_campaign_analyst', 'BRAND_A', 'CAMPAIGN_ANALYST', 'Campaign数据分析师', 'SYSTEM', FALSE, 'PROGRAM');
-- 7. 查看者（最小权限）
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('role_campaign_viewer', 'BRAND_A', 'CAMPAIGN_VIEWER', 'Campaign查看者', 'SYSTEM', FALSE, 'PROGRAM');
-- 8. 干预操作员（仅干预权限）
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('role_campaign_intervention', 'BRAND_A', 'CAMPAIGN_INTERVENTION', '干预操作员', 'SYSTEM', FALSE, 'PROGRAM');
-- 9. API 调用账号（受限 API 权限）
INSERT INTO system_role (id, program_code, role_code, role_name, role_type, is_default, data_scope) VALUES
('role_campaign_api', 'BRAND_A', 'CAMPAIGN_API_ACCOUNT', 'API调用账号', 'SYSTEM', FALSE, 'PROGRAM');
```
## 四、数据权限设计
### 4.1 数据维度
| 维度        | 字段             | 说明           |
| --------- | -------------- | ------------ |
| **租户隔离**  | `program_code` | 区分不同品牌/租户的数据 |
| **工作区隔离** | `workspace_id` | 工作区级别的数据隔离   |
| **用户归属**  | `created_by`   | 用户个人数据       |
### 4.2 数据范围与数据权限映射
| 数据范围          | 可见数据                   | 适用角色                                                        |
| ------------- | ---------------------- | ----------------------------------------------------------- |
| **ALL**       | 所有 program\_code 的数据   | `CAMPAIGN_ADMIN`                                            |
| **PROGRAM**   | 所在 program\_code 的所有数据 | `CAMPAIGN_MANAGER`, `CAMPAIGN_OPERATOR`, `CAMPAIGN_ANALYST` |
| **WORKSPACE** | 所在 workspace 的数据       | 可配置                                                         |
| **SELF**      | 仅自己创建的数据               | 不适用于 Campaign 场景                                            |
| **NONE**      | 无数据访问权限                | `CAMPAIGN_VIEWER`（需配合具体查看权限）                                |
### 4.3 数据权限 SQL 实现
```sql
-- ============================================================
-- Campaign 数据权限过滤器
-- 基于 program_code + workspace_id 双重隔离
-- ============================================================
-- 在现有 DataPermissionInterceptor 中扩展
private String applyDataPermission(String sql, String dataScope, 
                                   String programCode, String userId, 
                                   String workspaceId) {
    
    // 获取当前表名（从 SQL 中解析主表）
    String tableAlias = extractTableAlias(sql);
    
    switch (dataScope) {
        case "ALL":
            return sql;
            
        case "PROGRAM":
            if (sql.contains("campaign_workspace")) {
                // 通过 workspace 关联到 program
                return sql + " AND " + tableAlias + ".program_code = '" + programCode + "'";
            }
            return sql;
            
        case "WORKSPACE":
            return sql + " AND " + tableAlias + ".workspace_id = '" + workspaceId + "'";
            
        case "SELF":
            return sql + " AND " + tableAlias + ".created_by = '" + userId + "'";
            
        default:
            return sql + " AND " + tableAlias + ".program_code = '" + programCode + "'";
    }
}
-- 扩展 UserContext 增加 workspace_id 维度
public class SecurityContext {
    private static final ThreadLocal<String> currentWorkspaceId = new ThreadLocal<>();
    
    public static void setWorkspaceId(String workspaceId) {
        currentWorkspaceId.set(workspaceId);
    }
    
    public static String getWorkspaceId() {
        return currentWorkspaceId.get();
    }
}
```
## 五、权限使用示例
### 5.1 控制器权限注解

```java
@RestController
@RequestMapping("/api/campaign/workspace")
public class WorkspaceController {
    // 查看工作区列表
    @GetMapping
    @RequiresPermission("campaign:workspace:view")
    public ApiResponse<PageResponse<Workspace>> list(PageRequest page) {
        // ...
    }
    // 创建工作区
    @PostMapping
    @RequiresPermission("campaign:workspace:create")
    @Audit(operation = "CREATE_WORKSPACE")
    public ApiResponse<Workspace> create(@RequestBody CreateWorkspaceRequest request) {
        // ...
    }
    // 删除工作区
    @DeleteMapping("/{workspaceId}")
    @RequiresPermission("campaign:workspace:delete")
    @Audit(operation = "DELETE_WORKSPACE")
    public ApiResponse<Void> delete(@PathVariable String workspaceId) {
        // 先检查数据权限
        if (!workspaceService.hasAccess(workspaceId)) {
            throw new BusinessException("ERR_FORBIDDEN", "无权访问该工作区");
        }
        // ...
    }
}
@RestController
@RequestMapping("/api/campaign/execution")
public class ExecutionController {
    // 启动执行
    @PostMapping("/{planId}/start")
    @RequiresPermission("campaign:execution:start")
    @Audit(operation = "START_EXECUTION")
    public ApiResponse<ExecutionResult> start(@PathVariable String planId) {
        // ...
    }
    // 暂停执行
    @PostMapping("/{planId}/pause")
    @RequiresPermission("campaign:intervention:pause")
    @Audit(operation = "PAUSE_EXECUTION")
    public ApiResponse<Void> pause(@PathVariable String planId, @RequestBody PauseRequest request) {
        // 更高级别的风险确认
        if (!isInterventionAllowed()) {
            throw new BusinessException("ERR_FORBIDDEN", "无权执行干预操作");
        }
        // ...
    }
    // 紧急停止
    @PostMapping("/emergency-stop")
    @RequiresPermission("campaign:intervention:emergency_stop")
    @Audit(operation = "EMERGENCY_STOP")
    public ApiResponse<EmergencyStopResult> emergencyStop(@RequestBody EmergencyStopRequest request) {
        // 记录操作人、原因、时间戳
        auditService.logCritical("EMERGENCY_STOP", request);
        // ...
    }
}
```
### 5.2 Service 层权限校验

```java
@Service
public class WorkspaceService {
    @Autowired
    private PermissionService permissionService;
    /**
     * 检查用户是否有权限访问指定工作区
     */
    public boolean hasAccess(String workspaceId) {
        String userId = SecurityContext.getCurrentUserId();
        Workspace workspace = workspaceRepo.findById(workspaceId);
        // 1. 检查 program_code 是否匹配
        if (!workspace.getProgramCode().equals(TenantContext.get())) {
            return false;
        }
        // 2. 检查数据范围
        String dataScope = SecurityContext.getDataScope();
        if ("ALL".equals(dataScope)) return true;
        if ("PROGRAM".equals(dataScope)) return true;
        // 3. 检查是否有该工作区的具体权限
        return permissionService.hasPermission(userId, "campaign:workspace:view");
    }
    /**
     * 获取用户可见的工作区列表
     */
    public List<Workspace> getAccessibleWorkspaces() {
        String userId = SecurityContext.getCurrentUserId();
        String dataScope = SecurityContext.getDataScope();
        String programCode = TenantContext.get();
        List<Workspace> allWorkspaces = workspaceRepo.findByProgramCode(programCode);
        if ("ALL".equals(dataScope) || "PROGRAM".equals(dataScope)) {
            return allWorkspaces;
        }
        // 按权限过滤
        return allWorkspaces.stream()
                .filter(ws -> hasAccess(ws.getId()))
                .collect(Collectors.toList());
    }
}
```
## 六、前端权限集成
### 6.1 权限控制指令
```typescript
// hooks/usePermission.ts
export const usePermission = () => {
  const permissions = useStore(state => state.permissions);
  const has = (perm: string): boolean => {
    return permissions.includes(perm) || permissions.includes('campaign:all');
  };
  const hasAny = (...perms: string[]): boolean => {
    return perms.some(p => has(p));
  };
  const hasAll = (...perms: string[]): boolean => {
    return perms.every(p => has(p));
  };
  return { has, hasAny, hasAll };
};
// 组件中使用
const WorkspaceList = () => {
  const { has } = usePermission();
  return (
    <div>
      <h1>工作区管理</h1>
      {has('campaign:workspace:create') && (
        <Button onClick={handleCreate}>+ 新建工作区</Button>
      )}
      {/* ... */}
    </div>
  );
};
```
### 6.2 路由权限控制
```typescript
// router.tsx
import { usePermission } from '@/hooks/usePermission';
const ProtectedRoute = ({ children, permission }: { children: React.ReactNode; permission: string }) => {
  const { has } = usePermission();
  if (!has(permission)) {
    return <Navigate to="/403" replace />;
  }
  return children;
};
// 路由配置
const routes = [
  {
    path: '/campaign/workspace',
    element: (
      <ProtectedRoute permission="campaign:workspace:view">
        <WorkspaceList />
      </ProtectedRoute>
    )
  },
  {
    path: '/campaign/execution/:planId',
    element: (
      <ProtectedRoute permission="campaign:execution:view">
        <ExecutionMonitor />
      </ProtectedRoute>
    )
  },
  {
    path: '/campaign/intervention',
    element: (
      <ProtectedRoute permission="campaign:intervention:pause">
        <InterventionPanel />
      </ProtectedRoute>
    )
  }
];
```
### 6.3 菜单权限控制
```typescript
// config/menu.ts
export const menuConfig = [
  {
    key: 'workspace',
    label: '工作区',
    icon: '🏠',
    permission: 'campaign:workspace:view',
    children: [
      { key: 'workspace/list', label: '工作区列表', permission: 'campaign:workspace:view' },
      { key: 'workspace/create', label: '新建工作区', permission: 'campaign:workspace:create' }
    ]
  },
  {
    key: 'execution',
    label: '执行监控',
    icon: '⚙️',
    permission: 'campaign:execution:view',
    children: [
      { key: 'execution/monitor', label: '实时监控', permission: 'campaign:execution:view' },
      { key: 'execution/history', label: '执行历史', permission: 'campaign:execution:view' }
    ]
  },
  {
    key: 'intervention',
    label: '人工干预',
    icon: '🛑',
    permission: 'campaign:intervention:pause',
    children: [
      { key: 'intervention/dashboard', label: '干预控制台', permission: 'campaign:intervention:pause' },
      { key: 'intervention/emergency', label: '紧急控制', permission: 'campaign:intervention:emergency_stop' }
    ]
  },
  {
    key: 'strategy',
    label: '策略中心',
    icon: '📊',
    permission: 'campaign:strategy:view',
    children: [
      { key: 'strategy/workbench', label: '策略工作台', permission: 'campaign:strategy:view' },
      { key: 'strategy/blueprint', label: '蓝图管理', permission: 'campaign:strategy:blueprint:view' }
    ]
  },
  {
    key: 'content',
    label: '内容管理',
    icon: '📝',
    permission: 'campaign:content:asset:view',
    children: [
      { key: 'content/asset', label: '素材管理', permission: 'campaign:content:asset:view' },
      { key: 'content/approval', label: '审批管理', permission: 'campaign:content:approval:approve' }
    ]
  }
];
```
## 七、审计日志集成
### 7.1 Campaign 操作审计

```java
@Aspect
@Component
@Slf4j
public class CampaignAuditAspect extends AuditLogAspect {
    @Override
    protected void enrichAuditLog(SystemAuditLog auditLog, ProceedingJoinPoint joinPoint) {
        // 提取 Campaign 特有上下文
        auditLog.setOperationTarget(extractCampaignTarget(joinPoint));
        auditLog.setOperationDesc(buildOperationDescription(joinPoint));
    }
    private String extractCampaignTarget(ProceedingJoinPoint joinPoint) {
        Object[] args = joinPoint.getArgs();
        for (Object arg : args) {
            if (arg instanceof CampaignOperation) {
                CampaignOperation op = (CampaignOperation) arg;
                return op.getTargetType() + ":" + op.getTargetId();
            }
        }
        return null;
    }
}
```
### 7.2 关键操作审计要求
| 操作          | 必须记录的信息               |
| ----------- | --------------------- |
| **目标激活**    | 操作人、目标ID、工作区ID、激活时间   |
| **举措创建**    | 操作人、举措ID、关联目标、策略归因    |
| **执行启动**    | 操作人、计划ID、执行时间         |
| **执行暂停/恢复** | 操作人、计划ID、原因、执行时间      |
| **执行取消**    | 操作人、计划ID、原因、执行时间      |
| **紧急停止**    | 操作人、Program、原因、影响范围   |
| **审批通过/拒绝** | 操作人、素材ID、审批意见、审批时间    |
| **干预操作**    | 操作人、计划ID、节点ID、干预类型、原因 |
## 八、实施检查清单
* 在 `system_permission` 表中初始化 Campaign 权限点（约 40+ 条）
* 在 `system_role` 表中初始化 Campaign 预置角色（9 个）
* 初始化角色-权限关联数据
* 扩展 `SecurityContext` 支持 `workspace_id` 维度
* 扩展 `DataPermissionInterceptor` 支持 Campaign 数据范围
* 在 Campaign 各 Controller 中添加 `@RequiresPermission` 注解
* 在 Campaign 关键操作中添加 `@Audit` 注解
* 前端实现 `usePermission` Hook
* 前端菜单集成权限控制
* 前端路由集成权限控制
* 编写权限测试用例
## 九、总结
本设计在 Loyalty 权限体系基础上，为 Campaign Tools 模块补充了：
| 能力       | 说明                                   |
| -------- | ------------------------------------ |
| **权限点**  | 40+ 个细粒度权限点，覆盖 Campaign 所有功能         |
| **角色**   | 9 个预置角色，覆盖不同岗位的权限需求                  |
| **数据权限** | program\_code + workspace\_id 双重数据隔离 |
| **审计日志** | 关键操作全记录，支持追溯                         |
| **前端集成** | 权限控制指令、路由守卫、菜单过滤                     |
**与 Loyalty 权限体系完全兼容**：
* 复用 `system_user`、`system_role`、`system_permission` 表结构
* 复用 `@RequiresPermission` 注解机制
* 复用 `DataPermissionInterceptor` 拦截器
* 复用 `@Audit` 切面统一审计
