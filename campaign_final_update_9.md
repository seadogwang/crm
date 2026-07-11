## 缺失项 7（P2）：多品牌/多 Program 的全局隔离与共享详细设计
> **优先级**：P2（增强功能）\
> **原因**：当前设计基于 `program_code` 实现了完备的行级隔离，但企业实际运营中常需要跨品牌/跨 Program 的协作场景，如集团级黑名单、共享优质素材、跨品牌联合营销等。缺乏共享能力将导致数据冗余和运营效率低下。\
> **对应章节**：第12章（多租户架构）扩展 + 第1章（数据模型）扩展 + 第13章（Content）扩展\
> **设计原则**：**默认隔离，按需共享**。保持现有 `program_code` 隔离不变，通过新增“共享策略配置”显式开启共享能力，确保安全可控、可审计。
## 一、设计目标
1. **默认强隔离**：所有数据默认按 `program_code` 隔离，现有功能完全不受影响。
2. **按需显式共享**：通过配置明确哪些数据可以跨 Program 共享，由集团管理员统一管理。
3. **共享类型分级**：
   * **全局共享（Global）**：所有 Program 可见（如：集团级黑名单、全局退订用户）。
   * **指定共享（Selective）**：仅指定的 Program 可见（如：A 品牌和 B 品牌的联合活动）。
   * **继承共享（Inherited）**：子 Program 继承父 Program 的配置（如：集团下有多个子品牌）。
4. **共享权限可控**：共享数据的查看/使用权限可配置，防止数据滥用。
5. **审计可追溯**：所有跨 Program 的数据访问记录在案。
## 二、与现有功能的集成点
| 现有功能                                | 如何与多 Program 共享集成                                    |
| ----------------------------------- | ---------------------------------------------------- |
| **program\_code 隔离（全表）**            | **保持为默认行为**，所有查询自动附加 `program_code` 过滤               |
| **campaign\_workspace**             | 每个 Workspace 属于一个 Program；可新增“跨 Program Workspace”类型 |
| **campaign\_user\_consent（偏好/退订）**  | 支持“全局退订”跨 Program 生效                                 |
| **campaign\_content\_asset（素材）**    | 素材可标记为“全局共享”或“指定 Program 共享”                         |
| **campaign\_event\_trigger（事件触发器）** | 触发器可被多个 Program 共享使用                                 |
| **campaign\_member\_attr（会员属性）**    | 会员数据仍按 Program 隔离（隐私合规），但会员可跨 Program 识别（One-ID）     |
| **Decision Engine（频控）**             | 注意力预算可按 Program 独立，也可按集团汇总                           |
## 三、数据模型设计
### 3.1 共享策略配置表（campaign\_sharing\_policy）
```sql
-- ============================================================
-- 共享策略配置（集团管理员配置共享规则）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_sharing_policy (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,                     -- 拥有者 Program
    -- ===== 共享范围 =====
    sharing_scope VARCHAR(32) NOT NULL,                    -- GLOBAL / SELECTIVE / INHERITED
    target_programs TEXT[],                                -- SELECTIVE 时指定目标 Program 列表
    parent_program_code VARCHAR(32),                       -- INHERITED 时的父 Program
    -- ===== 共享内容类型 =====
    shared_resource_types TEXT[] NOT NULL,                 -- BLACKLIST / CONSENT / ASSET / SEGMENT / TRIGGER / TEMPLATE
    -- ===== 权限控制 =====
    permission_type VARCHAR(32) DEFAULT 'READ_ONLY',       -- READ_ONLY / READ_WRITE / FULL
    -- ===== 状态 =====
    enabled BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,                                -- 可选过期时间
    -- ===== 元数据 =====
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, sharing_scope, shared_resource_types)
);
CREATE INDEX idx_csp_program ON campaign_sharing_policy(program_code);
CREATE INDEX idx_csp_scope ON campaign_sharing_policy(sharing_scope);
CREATE INDEX idx_csp_enabled ON campaign_sharing_policy(enabled) WHERE enabled = TRUE;
```
### 3.2 全局黑名单表（campaign\_global\_blacklist）
> **注意**：现有 `campaign_member_attr.blacklist_flag` 是 Program 级隔离的。全局黑名单是跨 Program 共享的补充。
```sql
-- ============================================================
-- 全局黑名单（跨 Program 共享）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_global_blacklist (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    -- ===== 黑名单来源 =====
    source_program VARCHAR(32) NOT NULL,                   -- 哪个 Program 添加的
    source_type VARCHAR(32) NOT NULL,                      -- MANUAL / CAMPAIGN_FEEDBACK / COMPLIANCE
    -- ===== 黑名单原因 =====
    reason TEXT,
    evidence TEXT,
    -- ===== 共享范围 =====
    sharing_scope VARCHAR(32) DEFAULT 'GLOBAL',            -- GLOBAL / SELECTIVE
    target_programs TEXT[],                                -- SELECTIVE 时指定
    -- ===== 状态 =====
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    -- ===== 元数据 =====
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cgb_member ON campaign_global_blacklist(member_id);
CREATE INDEX idx_cgb_program ON campaign_global_blacklist(source_program);
CREATE INDEX idx_cgb_active ON campaign_global_blacklist(is_active) WHERE is_active = TRUE;
```
### 3.3 跨 Program Campaign 关联表（campaign\_cross\_program\_relation）
> 支持一个 Campaign 关联多个 Program。
```sql
-- ============================================================
-- 跨 Program Campaign 关联
-- 支持：联合营销活动、多品牌统一活动
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_cross_program_relation (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    -- ===== 角色 =====
    role VARCHAR(32) DEFAULT 'PARTICIPANT',               -- OWNER / PARTICIPANT / OBSERVER
    -- ===== 权限 =====
    can_edit BOOLEAN DEFAULT FALSE,
    can_trigger BOOLEAN DEFAULT TRUE,
    can_view_results BOOLEAN DEFAULT TRUE,
    -- ===== 预算分摊 =====
    budget_allocation DECIMAL(18,4),                       -- 该 Program 分摊的预算
    budget_currency VARCHAR(8) DEFAULT 'CNY',
    -- ===== 元数据 =====
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ccpr_plan ON campaign_cross_program_relation(plan_id);
CREATE INDEX idx_ccpr_program ON campaign_cross_program_relation(program_code);
CREATE UNIQUE INDEX idx_ccpr_unique ON campaign_cross_program_relation(plan_id, program_code);
```
### 3.4 扩展 `campaign_plan` 表
```sql
-- ============================================================
-- 扩展 campaign_plan 表，支持跨 Program
-- ============================================================
ALTER TABLE campaign_plan ADD COLUMN is_cross_program BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN campaign_plan.is_cross_program IS '是否为跨 Program 活动';
ALTER TABLE campaign_plan ADD COLUMN sharing_scope VARCHAR(32) DEFAULT 'OWN';
COMMENT ON COLUMN campaign_plan.sharing_scope IS 'OWN / CROSS_PROGRAM / GLOBAL';
ALTER TABLE campaign_plan ADD COLUMN owner_program_code VARCHAR(32);
COMMENT ON COLUMN campaign_plan.owner_program_code IS '拥有者 Program（跨 Program 活动时使用）';
```
## 四、后端 Service 设计
### 4.1 共享策略服务（SharingPolicyService）
```java
package com.loyalty.platform.campaign.sharing;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;
@Slf4j
@Service
@RequiredArgsConstructor
public class SharingPolicyService {
    private final SharingPolicyRepository policyRepository;
    private final CrossProgramRelationRepository relationRepository;
    private final GlobalBlacklistRepository blacklistRepository;
    // ===== 权限检查 =====
    /**
     * 检查一个 Program 是否可以访问另一个 Program 的资源
     */
    public boolean canAccess(String sourceProgram, String targetProgram, String resourceType) {
        // 1. 如果是同一个 Program，允许
        if (sourceProgram.equals(targetProgram)) {
            return true;
        }
        // 2. 检查共享策略
        List<SharingPolicy> policies = policyRepository
                .findByProgramCodeAndEnabledTrueAndSharedResourceTypesContains(
                    targetProgram, resourceType);
        for (SharingPolicy policy : policies) {
            if (isProgramInScope(policy, sourceProgram)) {
                return true;
            }
        }
        // 3. 检查是否有跨 Program 关联（如果是 Campaign 资源）
        if ("CAMPAIGN".equals(resourceType)) {
            // 通过 campaign_cross_program_relation 检查
            // 由调用方处理
        }
        return false;
    }
    /**
     * 判断目标 Program 是否在策略范围内
     */
    private boolean isProgramInScope(SharingPolicy policy, String targetProgram) {
        switch (policy.getSharingScope()) {
            case "GLOBAL":
                return true;
            case "SELECTIVE":
                return policy.getTargetPrograms() != null &&
                       Arrays.asList(policy.getTargetPrograms()).contains(targetProgram);
            case "INHERITED":
                // 检查是否在继承链中
                return isInherited(policy.getParentProgramCode(), targetProgram);
            default:
                return false;
        }
    }
    /**
     * 获取某个 Program 可访问的所有资源 Program 列表（用于查询）
     */
    public Set<String> getAccessiblePrograms(String sourceProgram, String resourceType) {
        Set<String> result = new HashSet<>();
        result.add(sourceProgram);
        // 查找所有共享策略
        List<SharingPolicy> policies = policyRepository
                .findBySharedResourceTypesContains(resourceType);
        for (SharingPolicy policy : policies) {
            if (isProgramInScope(policy, sourceProgram)) {
                result.add(policy.getProgramCode());
            }
        }
        return result;
    }
    // ===== 全局黑名单 =====
    /**
     * 检查用户是否在任意 Program 的全局黑名单中
     */
    public boolean isGloballyBlacklisted(String memberId) {
        return blacklistRepository.existsByMemberIdAndIsActiveTrue(memberId);
    }
    /**
     * 检查用户是否在特定 Program 的全局黑名单中
     */
    public boolean isBlacklistedByProgram(String memberId, String programCode) {
        // 1. 先检查全局黑名单（共享）
        if (isGloballyBlacklisted(memberId)) {
            return true;
        }
        // 2. 再检查 Program 级黑名单（原有逻辑）
        // 由调用方处理
        return false;
    }
    /**
     * 添加全局黑名单（跨 Program 共享）
     */
    @Transactional
    public void addGlobalBlacklist(String memberId, String sourceProgram, String reason) {
        GlobalBlacklist entry = GlobalBlacklist.builder()
                .id(UUID.randomUUID().toString())
                .memberId(memberId)
                .sourceProgram(sourceProgram)
                .sourceType("MANUAL")
                .reason(reason)
                .sharingScope("GLOBAL")
                .isActive(true)
                .createdAt(Instant.now())
                .build();
        blacklistRepository.save(entry);
        // 发布事件
        eventPublisher.publishGlobalBlacklistAdded(memberId, sourceProgram, reason);
        log.info("Added global blacklist: memberId={}, sourceProgram={}", memberId, sourceProgram);
    }
}
```
### 4.2 跨 Program 查询适配器（QueryAdapter）
> 核心：在现有查询中自动注入共享策略，实现跨 Program 数据访问。
```java
package com.loyalty.platform.campaign.sharing;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.Set;
@Slf4j
@Component
@RequiredArgsConstructor
public class CrossProgramQueryAdapter {
    private final SharingPolicyService sharingPolicyService;
    /**
     * 获取查询时可用的 Program 列表（用于 IN 条件）
     * 
     * 示例：
     *   原本：WHERE program_code = 'BRAND_A'
     *   修改：WHERE program_code IN ('BRAND_A', 'BRAND_B', 'BRAND_C')
     */
    public Set<String> getQueryablePrograms(String sourceProgram, String resourceType) {
        return sharingPolicyService.getAccessiblePrograms(sourceProgram, resourceType);
    }
    /**
     * 构建 SQL 的 program_code 过滤条件
     */
    public String buildProgramFilter(String sourceProgram, String resourceType, String tableAlias) {
        Set<String> programs = getQueryablePrograms(sourceProgram, resourceType);
        if (programs.size() == 1) {
            return tableAlias + ".program_code = '" + programs.iterator().next() + "'";
        }
        String inClause = programs.stream()
                .map(p -> "'" + p + "'")
                .collect(Collectors.joining(", "));
        return tableAlias + ".program_code IN (" + inClause + ")";
    }
    /**
     * 检查资源是否可访问
     */
    public boolean isAccessible(String sourceProgram, String targetProgram, String resourceType) {
        return sharingPolicyService.canAccess(sourceProgram, targetProgram, resourceType);
    }
}
```
### 4.3 集成到现有 Repository（示例）
```java
// 原有 Repository 方法保持不变，但查询时动态注入共享策略
@Repository
public interface ContentAssetRepository extends JpaRepository<ContentAsset, String> {
    // 原有方法（仅查询指定 Program）
    @Query("SELECT a FROM ContentAsset a WHERE a.programCode = :programCode AND a.status = :status")
    List<ContentAsset> findByProgramCodeAndStatus(String programCode, String status);
    // 新增方法：支持跨 Program 查询
    @Query("SELECT a FROM ContentAsset a WHERE a.programCode IN :programCodes AND a.status = :status")
    List<ContentAsset> findByProgramCodesAndStatus(@Param("programCodes") Set<String> programCodes,
                                                    @Param("status") String status);
}
// Service 层调用
@Service
public class ContentService {
    @Autowired
    private ContentAssetRepository assetRepository;
    @Autowired
    private CrossProgramQueryAdapter queryAdapter;
    public List<ContentAsset> getAccessibleAssets(String sourceProgram, String status) {
        Set<String> accessiblePrograms = queryAdapter.getQueryablePrograms(
            sourceProgram, "ASSET"
        );
        return assetRepository.findByProgramCodesAndStatus(accessiblePrograms, status);
    }
}
```
## 五、前端界面设计
### 5.1 共享策略管理（集团管理员）
```text
┌─ 共享策略管理 ──────────────────────────────────────────────────────────────┐
│  Program: [BRAND_A ▼]  [集团管理员]                                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 当前共享策略 ─────────────────────────────────────────────────────────┐ │
│  │  资源类型      │ 共享范围  │ 目标 Program  │ 权限      │ 状态  │ 操作 │ │
│  │  全局黑名单    │ GLOBAL   │ 全部          │ READ_ONLY │ ✅   │ [编辑]│ │
│  │  素材模板      │ SELECTIVE│ BRAND_B, BRAND_C│ READ     │ ✅   │ [编辑]│ │
│  │  用户退订偏好  │ GLOBAL   │ 全部          │ READ_ONLY │ ✅   │ [编辑]│ │
│  │  事件触发器    │ INHERITED│ PARENT: GROUP │ READ_WRITE│ ✅   │ [编辑]│ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [+ 新增共享策略]                                                           │
│                                                                             │
│  ┌─ 共享策略配置 ─────────────────────────────────────────────────────────┐ │
│  │  资源类型: [全局黑名单 ▼]                                               │ │
│  │  共享范围: [SELECTIVE ▼]                                               │ │
│  │  目标 Program: [BRAND_B] [x]  [BRAND_C] [x]  [+ 添加]                  │ │
│  │  权限: [READ_ONLY ▼]                                                   │ │
│  │                                                                         │ │
│  │  [保存] [取消]                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.2 跨 Program Campaign 创建
```text
┌─ 新建 Campaign（跨 Program） ─────────────────────────────────────────────┐
│  活动类型: [跨品牌联合营销 ▼]                                              │
│  拥有者 Program: [BRAND_A ▼]                                               │
│  参与 Program: [BRAND_B] [x]  [BRAND_C] [x]  [+ 添加]                     │
│                                                                             │
│  ┌─ 权限设置 ─────────────────────────────────────────────────────────────┐ │
│  │  参与 Program 可编辑: [ ]  (BRAND_B、BRAND_C 可修改活动内容)           │ │
│  │  参与 Program 可触发: [x]  (BRAND_B、BRAND_C 可启动执行)               │ │
│  │  参与 Program 可见结果: [x]  (BRAND_B、BRAND_C 可查看执行数据)         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 预算分摊 ─────────────────────────────────────────────────────────────┐ │
│  │  总预算: 100,000 元                                                    │ │
│  │  BRAND_A: [ 50,000 ] 元  (50%)                                        │ │
│  │  BRAND_B: [ 30,000 ] 元  (30%)                                        │ │
│  │  BRAND_C: [ 20,000 ] 元  (20%)                                        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  画布节点中 Program 相关配置将自动适配参与 Program                          │
│                                                                             │
│  [保存] [取消]                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.3 跨 Program 资源共享（素材选择）
```text
┌─ 选择素材模板 ──────────────────────────────────────────────────────────────┐
│  来源: [全部可访问 Program ▼]                                               │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  Program   │ 素材名称          │ 类型      │ 共享状态    │ 操作   │ │
│  │  BRAND_A   │ 618大促模板       │ EMAIL     │ 我拥有的    │ [选择] │ │
│  │  BRAND_B   │ 会员欢迎邮件      │ EMAIL     │ 共享自BRAND_B│ [选择] │ │
│  │  BRAND_B   │ 新品发布短信      │ SMS       │ 共享自BRAND_B│ [选择] │ │
│  │  BRAND_C   │ 积分兑换通知      │ EMAIL     │ 共享自BRAND_C│ [选择] │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 六、API 设计
### 6.1 获取可访问的 Program 列表
```json
GET /api/campaign/sharing/accessible-programs?programCode=BRAND_A&resourceType=ASSET
{
    "code": 0,
    "data": {
        "sourceProgram": "BRAND_A",
        "accessiblePrograms": ["BRAND_A", "BRAND_B", "BRAND_C"],
        "resourceType": "ASSET"
    }
}
```
### 6.2 创建共享策略
```json
POST /api/campaign/sharing/policy
{
    "programCode": "BRAND_A",
    "sharingScope": "SELECTIVE",
    "targetPrograms": ["BRAND_B", "BRAND_C"],
    "sharedResourceTypes": ["BLACKLIST", "CONSENT"],
    "permissionType": "READ_ONLY",
    "enabled": true
}
```
### 6.3 创建跨 Program Campaign
```json
POST /api/campaign/plan/cross-program
{
    "workspaceId": "ws_001",
    "name": "618联合大促",
    "ownerProgramCode": "BRAND_A",
    "participantPrograms": [
        {
            "programCode": "BRAND_B",
            "budgetAllocation": 30000,
            "canEdit": false,
            "canTrigger": true,
            "canViewResults": true
        },
        {
            "programCode": "BRAND_C",
            "budgetAllocation": 20000,
            "canEdit": false,
            "canTrigger": true,
            "canViewResults": true
        }
    ],
    "totalBudget": 100000,
    "graphJson": { ... }
}
```
### 6.4 查询跨 Program 数据
```json
GET /api/campaign/sharing/query?programCode=BRAND_A&resourceType=ASSET&page=0&size=20
{
    "code": 0,
    "data": {
        "items": [
            { "programCode": "BRAND_A", "assetId": "asset_001", "assetName": "618大促模板" },
            { "programCode": "BRAND_B", "assetId": "asset_002", "assetName": "会员欢迎邮件" },
            { "programCode": "BRAND_C", "assetId": "asset_003", "assetName": "积分兑换通知" }
        ],
        "total": 15,
        "sourceProgram": "BRAND_A"
    }
}
```
## 七、与现有模块的集成点总结
| 现有模块                             | 集成方式                                          | 变更点         |
| -------------------------------- | --------------------------------------------- | ----------- |
| **program\_code 隔离（全表）**         | 保持默认，新增跨 Program 查询适配器                        | 无变更         |
| **campaign\_plan**               | 新增 `is_cross_program`、`owner_program_code` 字段 | ALTER TABLE |
| **campaign\_content\_asset（素材）** | 查询时注入跨 Program 策略                             | Service 层适配 |
| **campaign\_user\_consent（偏好）**  | 全局退订通过 `sharing_policy` 控制                    | 查询逻辑适配      |
| **campaign\_event\_trigger**     | 触发器可跨 Program 共享                              | 查询逻辑适配      |
| **Decision Engine（频控）**          | 按 Program 独立，不受影响                             | 无变更         |
| **Execution（发送）**                | 跨 Program Campaign 发送时按 Program 分别统计          | 适配层处理       |
## 八、实施检查清单
* 执行 DDL：创建 `campaign_sharing_policy` 表
* 执行 DDL：创建 `campaign_global_blacklist` 表
* 执行 DDL：创建 `campaign_cross_program_relation` 表
* 执行 DDL：扩展 `campaign_plan` 表（3 个新字段）
* 实现 `SharingPolicyService`（共享策略管理）
* 实现 `CrossProgramQueryAdapter`（跨 Program 查询适配）
* 修改 `ContentService` 素材查询支持跨 Program
* 修改 `ConsentService` 偏好查询支持跨 Program
* 前端：共享策略管理页面
* 前端：跨 Program Campaign 创建界面
* 前端：跨 Program 资源共享选择器
* 编写单元测试和集成测试
## 九、总结
本设计为 Campaign Tools 补齐了**多 Program 共享协作能力**：
| 能力                     | 实现方式                                                |
| ---------------------- | --------------------------------------------------- |
| **默认隔离**               | 现有 `program_code` 隔离完全保持不变                          |
| **全局黑名单共享**            | `campaign_global_blacklist` 表 + `sharing_policy` 控制 |
| **用户偏好共享**             | 全局退订通过共享策略跨 Program 生效                              |
| **素材共享**               | 查询时注入跨 Program 策略，透明访问                              |
| **跨 Program Campaign** | `campaign_cross_program_relation` 关联多个 Program      |
| **权限控制**               | READ\_ONLY / READ\_WRITE 分级控制                       |
**关键优势**：
1. **零侵入**：现有单 Program 功能完全不受影响。
2. **按需开启**：共享能力通过配置显式开启，安全可控。
3. **透明查询**：跨 Program 数据访问对业务代码透明，由适配层自动注入。
4. **审计可追溯**：所有跨 Program 访问通过 `CrossProgramQueryAdapter` 统一记录。
