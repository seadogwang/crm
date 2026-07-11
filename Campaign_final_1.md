## 第1章：Planning Workspace 详细设计
Planning Workspace 是 Campaign Tools 的**战略入口层**，所有营销活动都从这里出发。本章将 Workspace、Goal、Initiative、Portfolio 四个核心实体作为一个完整的设计单元进行详细阐述。
***
## 1.0 模块概述
### 1.0.1 本质定义
Planning Workspace 是 Campaign Planning Domain 的**顶层容器（Top-level Container）**，把所有 Campaign Planning 相关对象统一放在一个“可管理、可版本化、可隔离”的工作空间中-。
Workspace = “一个独立的营销决策上下文（Decision Context Scope）”
### 1.0.2 层级关系
```text
Workspace（工作区）
    └── Goal（目标）—— 每个 Workspace 同时仅有一个 ACTIVE Goal
            ├── Initiative（举措）—— 属于 Goal 的策略分组
            │       └── Campaign Plan（活动计划）—— 属于 Initiative 的具体执行方案
            └── Portfolio（组合）—— 跨 Goal/Initiative 的全局资源优化层
```
### 1.0.3 与 Loyalty 现有模块的融合
| Loyalty 现有能力              | 融合方式                                   |
| ------------------------- | -------------------------------------- |
| `program` 表（Program 定义）   | `campaign_workspace.program_code` 外键关联 |
| `rule_definition` 表（规则定义） | 复用 `metadata` 字段存储 Initiative 规则配置-    |
| `member` 表（会员数据）          | 通过 CDC/定时任务同步到 `campaign_member_dim`   |
| `status` 枚举体系             | 状态值与 Loyalty 现有枚举对齐                    |
***
## 1.1 Workspace Management（工作区管理）
### 1.1.1 数据库设计
```sql
-- 工作区主表
CREATE TABLE campaign_workspace (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,              -- 关联 Loyalty Program
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',   -- ACTIVE / ARCHIVED / LOCKED
    active_goal_id VARCHAR(64),                     -- 当前激活的目标ID
    config JSONB DEFAULT '{}',                      -- 工作区级配置（时区、默认预算等）
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cw_program ON campaign_workspace(program_code);
CREATE INDEX idx_cw_status ON campaign_workspace(status);
-- 工作区成员（权限模型）
CREATE TABLE campaign_workspace_member (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    user_id VARCHAR(64) NOT NULL,
    role VARCHAR(32) NOT NULL,                      -- OWNER / ADMIN / ANALYST / VIEWER
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, user_id)
);
CREATE INDEX idx_cwm_workspace ON campaign_workspace_member(workspace_id);
-- 工作区快照（版本隔离核心）
CREATE TABLE campaign_workspace_snapshot (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    snapshot_type VARCHAR(32) NOT NULL,             -- GOAL / INITIATIVE / PORTFOLIO
    snapshot_data JSONB NOT NULL,
    version INT NOT NULL,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cws_workspace ON campaign_workspace_snapshot(workspace_id);
CREATE INDEX idx_cws_type_version ON campaign_workspace_snapshot(workspace_id, snapshot_type, version);
```
### 1.1.2 后端 Service 设计
#### WorkspaceService（核心服务）
```java
@Service
@Slf4j
@Transactional
public class WorkspaceService {
    @Autowired
    private WorkspaceRepository workspaceRepository;
    @Autowired
    private WorkspaceMemberRepository memberRepository;
    @Autowired
    private WorkspaceSnapshotRepository snapshotRepository;
    @Autowired
    private GoalRepository goalRepository;
    @Autowired
    private ProgramService programService;          // Loyalty 服务
    /**
     * 创建工作区
     */
    public Workspace createWorkspace(CreateWorkspaceRequest request) {
        // 1. 校验 Program 是否存在（调用 Loyalty 服务）
        Program program = programService.findByCode(request.getProgramCode());
        if (program == null) {
            throw new BusinessException("Program not found: " + request.getProgramCode());
        }
        // 2. 创建工作区
        Workspace workspace = Workspace.builder()
                .id(UUID.randomUUID().toString())
                .programCode(request.getProgramCode())
                .name(request.getName())
                .description(request.getDescription())
                .status("ACTIVE")
                .config(request.getConfig() != null ? request.getConfig() : new HashMap<>())
                .createdBy(SecurityContext.getCurrentUserId())
                .build();
        workspace = workspaceRepository.save(workspace);
        // 3. 自动将创建者设为 OWNER
        WorkspaceMember member = WorkspaceMember.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(workspace.getId())
                .userId(workspace.getCreatedBy())
                .role("OWNER")
                .build();
        memberRepository.save(member);
        log.info("Workspace created: id={}, name={}, program={}", 
                 workspace.getId(), workspace.getName(), workspace.getProgramCode());
        return workspace;
    }
    /**
     * 获取工作区（含权限校验）
     */
    public Workspace getWorkspace(String workspaceId, String userId) {
        // 1. 校验用户是否有权限访问
        if (!hasPermission(workspaceId, userId)) {
            throw new PermissionDeniedException("No permission to access workspace");
        }
        return workspaceRepository.findById(workspaceId)
                .orElseThrow(() -> new ResourceNotFoundException("Workspace not found"));
    }
    /**
     * 加载工作区上下文（AI 核心输入）
     */
    public WorkspaceContext loadContext(String workspaceId) {
        Workspace workspace = getWorkspace(workspaceId, SecurityContext.getCurrentUserId());
        Goal activeGoal = goalRepository.findActiveGoal(workspaceId).orElse(null);
        List<Initiative> initiatives = initiativeRepository.findByWorkspaceId(workspaceId);
        List<Portfolio> portfolios = portfolioRepository.findByWorkspaceId(workspaceId);
        return WorkspaceContext.builder()
                .workspace(workspace)
                .activeGoal(activeGoal)
                .initiatives(initiatives)
                .portfolios(portfolios)
                .build();
    }
    /**
     * 锁定工作区（防并发冲突）
     */
    public boolean lockWorkspace(String workspaceId) {
        String lockKey = "ws_lock:" + workspaceId;
        return redisTemplate.opsForValue()
                .setIfAbsent(lockKey, "LOCKED", Duration.ofMinutes(10));
    }
    public void unlockWorkspace(String workspaceId) {
        redisTemplate.delete("ws_lock:" + workspaceId);
    }
    /**
     * 创建工作区快照（版本控制）
     */
    public void snapshot(String workspaceId, String snapshotType, Object data) {
        int nextVersion = snapshotRepository.getNextVersion(workspaceId, snapshotType);
        WorkspaceSnapshot snapshot = WorkspaceSnapshot.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(workspaceId)
                .snapshotType(snapshotType)
                .snapshotData(JsonUtil.toJsonNode(data))
                .version(nextVersion)
                .createdBy(SecurityContext.getCurrentUserId())
                .build();
        snapshotRepository.save(snapshot);
        log.info("Snapshot created: workspace={}, type={}, version={}", 
                 workspaceId, snapshotType, nextVersion);
    }
    /**
     * 权限校验
     */
    private boolean hasPermission(String workspaceId, String userId) {
        return memberRepository.existsByWorkspaceIdAndUserId(workspaceId, userId);
    }
}
```
#### WorkspaceLockService（分布式锁，防并发冲突）
```java
@Service
public class WorkspaceLockService {
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    private static final String LOCK_PREFIX = "ws_lock:";
    private static final Duration LOCK_TIMEOUT = Duration.ofMinutes(10);
    /**
     * 尝试获取工作区锁
     * @return true 表示获取成功
     */
    public boolean tryLock(String workspaceId) {
        String key = LOCK_PREFIX + workspaceId;
        Boolean success = redisTemplate.opsForValue()
                .setIfAbsent(key, Thread.currentThread().getName(), LOCK_TIMEOUT);
        return Boolean.TRUE.equals(success);
    }
    /**
     * 释放工作区锁
     */
    public void unlock(String workspaceId) {
        String key = LOCK_PREFIX + workspaceId;
        redisTemplate.delete(key);
    }
    /**
     * 带自动释放的锁执行器
     */
    public <T> T executeWithLock(String workspaceId, Supplier<T> action) {
        if (!tryLock(workspaceId)) {
            throw new ConcurrentModificationException("Workspace is locked by another user");
        }
        try {
            return action.get();
        } finally {
            unlock(workspaceId);
        }
    }
}
```
### 1.1.3 前端界面设计
#### Workspace 列表页
```text
┌──────────────────────────────────────────────────────────────────────────────┐
│  📊 营销工作区                                          [+ 新建工作区]      │
├──────────────────────────────────────────────────────────────────────────────┤
│  🔍 [搜索工作区...]                                    Program: [全部 ▼]    │
├───────┬────────────────┬───────────────┬──────────────┬────────────────────┤
│ 工作区 │ Program        │ 当前目标      │ 状态         │ 操作               │
├───────┼────────────────┼───────────────┼──────────────┼────────────────────┤
│ 618大促│ BRAND_A        │ GMV提升20%   │ ● ACTIVE    │ [进入] [编辑] [📋] │
│ Q3会员 │ BRAND_A        │ 复购率提升   │ ● ACTIVE    │ [进入] [编辑] [📋] │
│ 双11  │ BRAND_B        │ 新客获取     │ ○ ARCHIVED  │ [查看]             │
└───────┴────────────────┴───────────────┴──────────────┴────────────────────┘
```
**组件说明**：
* **顶部操作栏**：新建工作区按钮、搜索框、Program 筛选器
* **列表**：展示工作区名称、关联 Program、当前激活目标、状态（ACTIVE/ARCHIVED/LOCKED）
* **操作按钮**：进入（跳转至工作区详情）、编辑、快照查看（📋）
#### 新建工作区弹窗
```text
┌─ 新建工作区 ────────────────────────────────────────────────────────────────┐
│                                                                             │
│  工作区名称 *  [________________________________]                            │
│                                                                             │
│  关联 Program * [BRAND_A (品牌A)          ▼]                                │
│                                                                             │
│  描述          [________________________________]                            │
│                [________________________________]                            │
│                                                                             │
│  时区          [Asia/Shanghai            ▼]                                 │
│  默认预算      [          ] 元                                              │
│                                                                             │
│                              [取消]        [创建]                            │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 1.1.4 前后端 JSON 交互
#### 创建 Workspace
**Request:**
```json
POST /api/campaign/workspace
{
    "name": "618大促",
    "programCode": "BRAND_A",
    "description": "2026年618大促营销工作区",
    "config": {
        "timezone": "Asia/Shanghai",
        "defaultBudget": 100000
    }
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "id": "ws_001",
        "name": "618大促",
        "programCode": "BRAND_A",
        "description": "2026年618大促营销工作区",
        "status": "ACTIVE",
        "config": {
            "timezone": "Asia/Shanghai",
            "defaultBudget": 100000
        },
        "activeGoalId": null,
        "createdBy": "user_001",
        "createdAt": "2026-06-24T10:00:00Z",
        "updatedAt": "2026-06-24T10:00:00Z"
    }
}
```
#### 加载工作区上下文
**Request:**
```json
GET /api/campaign/workspace/ws_001/con```text
**Response:**
```json
{
    "code": 0,
    "data": {
        "workspace": {
            "id": "ws_001",
            "name": "618大促",
            "programCode": "BRAND_A",
            "status": "ACTIVE"
        },
        "activeGoal": {
            "id": "goal_001",
            "name": "GMV提升20%",
            "goalType": "REVENUE",
            "targetValue": 10000000,
            "currentValue": 6800000,
            "progress": 68
        },
        "initiatives": [
            {
                "id": "ini_001",
                "name": "高价值会员召回",
                "type": "WINBACK",
                "priority": 1,
                "status": "ACTIVE"
            },
            {
                "id": "ini_002",
                "name": "新会员促活",
                "type": "ACQUISITION",
                "priority": 2,
                "status": "PLANNED"
            }
        ],
        "portfolios": [
            {
                "id": "port_001",
                "name": "Q2营销组合",
                "status": "OPTIMIZED",
                "totalBudget": 650000
            }
        ]
    }
}
```
***
## 1.2 Goal Management（目标管理）
### 1.2.1 数据库设计
```sql
-- 目标主表
CREATE TABLE campaign_goal (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    goal_type VARCHAR(32) NOT NULL,                 -- REVENUE / RETENTION / ACQUISITION / ENGAGEMENT
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',    -- DRAFT / ACTIVE / PAUSED / COMPLETED / ARCHIVED
    target_metric VARCHAR(64),                      -- 关联 Loyalty 指标：TIER_POINTS / ORDER_COUNT / TOTAL_AMOUNT
    target_value DECIMAL(18,4),
    current_value DECIMAL(18,4) DEFAULT 0,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cg_workspace ON campaign_goal(workspace_id);
CREATE INDEX idx_cg_status ON campaign_goal(status);
CREATE INDEX idx_cg_active ON campaign_goal(workspace_id) WHERE status = 'ACTIVE';
-- 目标 KPI 表
CREATE TABLE campaign_goal_kpi (
    id VARCHAR(64) PRIMARY KEY,
    goal_id VARCHAR(64) NOT NULL,
    kpi_type VARCHAR(32) NOT NULL,                  -- REVENUE / CONVERSION / RETENTION / ROI
    target_value DECIMAL(18,4) NOT NULL,
    current_value DECIMAL(18,4) DEFAULT 0,
    weight DECIMAL(5,2) DEFAULT 1.0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(goal_id, kpi_type)
);
CREATE INDEX idx_cgk_goal ON campaign_goal_kpi(goal_id);
-- 目标版本表
CREATE TABLE campaign_goal_version (
    id VARCHAR(64) PRIMARY KEY,
    goal_id VARCHAR(64) NOT NULL,
    version INT NOT NULL,
    snapshot JSONB NOT NULL,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(goal_id, version)
);
CREATE INDEX idx_cgv_goal ON campaign_goal_version(goal_id);
```
### 1.2.2 状态机
```text
DRAFT → ACTIVE → PAUSED → COMPLETED → ARCHIVED
         ↑         ↓
         └─────────┘ (可恢复)
```
**约束规则**：
1. 每个 Workspace 同时**仅有一个** ACTIVE Goal
2. ACTIVE Goal 不可删除（只能 PAUSED 或 COMPLETED）
3. COMPLETED/ARCHIVED 状态为只读
### 1.2.3 后端 Service 设计
```java
@Service
@Slf4j
@Transactional
public class GoalService {
    @Autowired
    private GoalRepository goalRepository;
    @Autowired
    private GoalKpiRepository kpiRepository;
    @Autowired
    private GoalVersionRepository versionRepository;
    @Autowired
    private WorkspaceService workspaceService;
    @Autowired
    private WorkspaceLockService lockService;
    /**
     * 创建目标（DRAFT 状态）
     */
    public Goal createGoal(CreateGoalRequest request) {
        // 1. 校验 Workspace 存在
        workspaceService.getWorkspace(request.getWorkspaceId(), 
                                      SecurityContext.getCurrentUserId());
        Goal goal = Goal.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(request.getWorkspaceId())
                .name(request.getName())
                .description(request.getDescription())
                .goalType(request.getGoalType())
                .status("DRAFT")
                .targetMetric(request.getTargetMetric())
                .targetValue(request.getTargetValue())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .createdBy(SecurityContext.getCurrentUserId())
                .build();
        goal = goalRepository.save(goal);
        // 2. 创建 KPI
        if (request.getKpis() != null) {
            for (CreateKpiRequest kpiReq : request.getKpis()) {
                GoalKpi kpi = GoalKpi.builder()
                        .id(UUID.randomUUID().toString())
                        .goalId(goal.getId())
                        .kpiType(kpiReq.getKpiType())
                        .targetValue(kpiReq.getTargetValue())
                        .weight(kpiReq.getWeight())
                        .build();
                kpiRepository.save(kpi);
            }
        }
        // 3. 创建版本快照
        workspaceService.snapshot(request.getWorkspaceId(), "GOAL", goal);
        log.info("Goal created: id={}, name={}, workspace={}", 
                 goal.getId(), goal.getName(), goal.getWorkspaceId());
        return goal;
    }
    /**
     * 激活目标（核心逻辑：自动停用其他 ACTIVE Goal）
     */
    public Goal activateGoal(String goalId) {
        Goal goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new ResourceNotFoundException("Goal not found"));
        if (!"DRAFT".equals(goal.getStatus()) && !"PAUSED".equals(goal.getStatus())) {
            throw new BusinessException("Only DRAFT or PAUSED goal can be activated");
        }
        // 使用分布式锁防止并发激活冲突
        return lockService.executeWithLock(goal.getWorkspaceId(), () -> {
            // 1. 停用该 Workspace 下所有其他 ACTIVE Goal
            goalRepository.deactivateAllByWorkspace(goal.getWorkspaceId());
            // 2. 激活当前 Goal
            goal.setStatus("ACTIVE");
            goal = goalRepository.save(goal);
            // 3. 更新 Workspace 的 active_goal_id
            workspaceService.setActiveGoal(goal.getWorkspaceId(), goal.getId());
            // 4. 创建版本快照
            workspaceService.snapshot(goal.getWorkspaceId(), "GOAL", goal);
            log.info("Goal activated: id={}, workspace={}", goal.getId(), goal.getWorkspaceId());
            return goal;
        });
    }
    /**
     * 暂停目标
     */
    public Goal pauseGoal(String goalId) {
        Goal goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new ResourceNotFoundException("Goal not found"));
        if (!"ACTIVE".equals(goal.getStatus())) {
            throw new BusinessException("Only ACTIVE goal can be paused");
        }
        goal.setStatus("PAUSED");
        goal = goalRepository.save(goal);
        // 清除 Workspace 的 active_goal_id
        workspaceService.clearActiveGoal(goal.getWorkspaceId());
        log.info("Goal paused: id={}", goal.getId());
        return goal;
    }
    /**
     * 更新 KPI 当前值（可由事件触发或定时任务调用）
     */
    public void updateKpiValue(String goalId, String kpiType, BigDecimal value) {
        GoalKpi kpi = kpiRepository.findByGoalIdAndKpiType(goalId, kpiType)
                .orElseThrow(() -> new ResourceNotFoundException("KPI not found"));
        kpi.setCurrentValue(value);
        kpiRepository.save(kpi);
        // 同时更新 Goal 的 current_value（汇总）
        Goal goal = goalRepository.findById(goalId).orElse(null);
        if (goal != null) {
            BigDecimal total = kpiRepository.sumCurrentValuesByGoalId(goalId);
            goal.setCurrentValue(total);
            goalRepository.save(goal);
        }
    }
    /**
     * 获取 Goal 上下文（含 KPI）
     */
    public GoalContext loadContext(String goalId) {
        Goal goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new ResourceNotFoundException("Goal not found"));
        List<GoalKpi> kpis = kpiRepository.findByGoalId(goalId);
        return GoalContext.builder()
                .goal(goal)
                .kpis(kpis)
                .build();
    }
    /**
     * 计算目标进度
     */
    public Double calculateProgress(String goalId) {
        Goal goal = goalRepository.findById(goalId).orElse(null);
        if (goal == null || goal.getTargetValue() == null || goal.getTargetValue().compareTo(BigDecimal.ZERO) == 0) {
            return 0.0;
        }
        return goal.getCurrentValue()
                .divide(goal.getTargetValue(), 4, RoundingMode.HALF_UP)
                .doubleValue() * 100;
    }
}
```
### 1.2.4 前端界面设计
#### Goal 管理页面（Workspace 详情页子视图）
```text
┌─ 618大促 工作区 ─────────────────────────────────────────────────────────────┐
│  ← 返回工作区列表                                                           │
├──────────────────────────────────────────────────────────────────────────────┤
│  📈 目标管理                                    [+ 新建目标]                │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 当前激活目标 ─────────────────────────────────────────────────────────┐ │
│  │  目标名称: GMV提升20%                         状态: ● ACTIVE           │ │
│  │  类型: REVENUE                               有效期: 06/01 - 06/30    │ │
│  │  目标值: ¥10,000,000                         当前值: ¥6,800,000       │ │
│  │  进度: ████████████░░░░░░░░ 68%                                      │ │
│  │  ┌────────────┬────────────┬────────────┬────────────┐               │ │
│  │  │ KPI        │ 目标值     │ 当前值     │ 完成率     │               │ │
│  │  ├────────────┼────────────┼────────────┼────────────┤               │ │
│  │  │ REVENUE    │ 10,000,000 │ 6,800,000  │ 68%       │               │ │
│  │  │ CONVERSION │ 15%        │ 12.3%      │ 82%       │               │ │
│  │  │ RETENTION  │ 85%        │ 81.5%      │ 96%       │               │ │
│  │  └────────────┴────────────┴────────────┴────────────┘               │ │
│  │                              [暂停] [编辑] [归档]                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 历史目标 ─────────────────────────────────────────────────────────────┐ │
│  │  目标名称          │ 类型       │ 状态      │ 操作                    │ │
│  │  Q1会员增长        │ ACQUISITION│ COMPLETED │ [查看]                  │ │
│  │  春节促活          │ ENGAGEMENT │ ARCHIVED  │ [查看]                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
#### 新建目标弹窗
```text
┌─ 新建目标 ──────────────────────────────────────────────────────────────────┐
│                                                                             │
│  目标名称 * [________________________________]                               │
│  描述       [________________________________]                               │
│             [________________________________]                               │
│                                                                             │
│  目标类型 * [REVENUE (营收)                    ▼]                           │
│  关联指标   [TOTAL_AMOUNT (总订单金额)        ▼]                           │
│  目标值 *   [  10,000,000  ] 元                                            │
│                                                                             │
│  有效期     [2026-06-01] ~ [2026-06-30]                                    │
│                                                                             │
│  ┌─ KPI 配置 ───────────────────────────────────────────────────────────┐  │
│  │  [+ 添加 KPI]                                                       │  │
│  │  KPI类型    │ 目标值      │ 权重      │ 操作                        │  │
│  │  REVENUE    │ 10,000,000  │ 1.0       │ [×]                        │  │
│  │  CONVERSION │ 15          │ 0.8       │ [×]                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│                              [取消]        [创建]                           │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 1.2.5 前后端 JSON 交互
#### 创建 Goal
**Request:**
```json
POST /api/campaign/goal
{
    "workspaceId": "ws_001",
    "name": "GMV提升20%",
    "description": "618大促期间GMV突破1000万",
    "goalType": "REVENUE",
    "targetMetric": "TOTAL_AMOUNT",
    "targetValue": 10000000,
    "startTime": "2026-06-01T00:00:00Z",
    "endTime": "2026-06-30T23:59:59Z",
    "kpis": [
        {
            "kpiType": "REVENUE",
            "targetValue": 10000000,
            "weight": 1.0
        },
        {
            "kpiType": "CONVERSION",
            "targetValue": 15,
            "weight": 0.8
        }
    ]
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "id": "goal_001",
        "workspaceId": "ws_001",
        "name": "GMV提升20%",
        "description": "618大促期间GMV突破1000万",
        "goalType": "REVENUE",
        "status": "DRAFT",
        "targetMetric": "TOTAL_AMOUNT",
        "targetValue": 10000000,
        "currentValue": 0,
        "startTime": "2026-06-01T00:00:00Z",
        "endTime": "2026-06-30T23:59:59Z",
        "createdBy": "user_001",
        "createdAt": "2026-06-24T10:00:00Z",
        "updatedAt": "2026-06-24T10:00:00Z",
        "kpis": [
            {
                "id": "kpi_001",
                "kpiType": "REVENUE",
                "targetValue": 10000000,
                "currentValue": 0,
                "weight": 1.0
            },
            {
                "id": "kpi_002",
                "kpiType": "CONVERSION",
                "targetValue": 15,
                "currentValue": 0,
                "weight": 0.8
            }
        ],
        "progress": 0
    }
}
```
#### 激活 Goal
**Request:**
```json
POST /api/campaign/goal/goal_001/activate
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "id": "goal_001",
        "status": "ACTIVE",
        "message": "Goal activated successfully"
    }
}
```
***
## 1.3 Initiative Management（举措管理）
### 1.3.1 数据库设计
```sql
-- Initiative 主表
CREATE TABLE campaign_initiative (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    initiative_type VARCHAR(32),                    -- WINBACK / GROWTH / ENGAGEMENT / ACQUISITION
    status VARCHAR(32) DEFAULT 'PLANNED',           -- PLANNED / ACTIVE / PAUSED / COMPLETED / ARCHIVED
    priority INT DEFAULT 100,                       -- 数字越小优先级越高
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    -- 复用 Loyalty rule_definition 的 metadata 存储规则
    rule_config JSONB,                              -- 举措的规则配置（人群、条件等）
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ci_workspace ON campaign_initiative(workspace_id);
CREATE INDEX idx_ci_goal ON campaign_initiative(goal_id);
CREATE INDEX idx_ci_status ON campaign_initiative(status);
CREATE INDEX idx_ci_priority ON campaign_initiative(priority);
-- Initiative ↔ Campaign Plan 关系表
CREATE TABLE campaign_initiative_plan_relation (
    id VARCHAR(64) PRIMARY KEY,
    initiative_id VARCHAR(64) NOT NULL,
    plan_id VARCHAR(64) NOT NULL,
    weight DECIMAL(10,4) DEFAULT 1.0,               -- 该 Plan 在 Initiative 中的权重
    role VARCHAR(32) DEFAULT 'PRIMARY',             -- PRIMARY / SUPPORTING / EXPERIMENTAL
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(initiative_id, plan_id)
);
CREATE INDEX idx_cipr_initiative ON campaign_initiative_plan_relation(initiative_id);
CREATE INDEX idx_cipr_plan ON campaign_initiative_plan_relation(plan_id);
-- Initiative KPI 表
CREATE TABLE campaign_initiative_kpi (
    id VARCHAR(64) PRIMARY KEY,
    initiative_id VARCHAR(64) NOT NULL,
    kpi_type VARCHAR(32) NOT NULL,
    target_value DECIMAL(18,4) NOT NULL,
    current_value DECIMAL(18,4) DEFAULT 0,
    weight DECIMAL(5,2) DEFAULT 1.0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(initiative_id, kpi_type)
);
CREATE INDEX idx_cik_initiative ON campaign_initiative_kpi(initiative_id);
```
### 1.3.2 状态机
```text
PLANNED → ACTIVE → PAUSED → COMPLETED → ARCHIVED
           ↑         ↓
           └─────────┘ (可恢复)
```
**约束规则**：
1. ACTIVE Initiative 必须属于 ACTIVE Goal
2. 一个 Goal 下可以有多个 ACTIVE Initiative
### 1.3.3 后端 Service 设计
```java
@Service
@Slf4j
@Transactional
public class InitiativeService {
    @Autowired
    private InitiativeRepository initiativeRepository;
    @Autowired
    private InitiativeKpiRepository kpiRepository;
    @Autowired
    private InitiativePlanRelationRepository relationRepository;
    @Autowired
    private GoalService goalService;
    @Autowired
    private WorkspaceLockService lockService;
    /**
     * 创建 Initiative（PLANNED 状态）
     */
    public Initiative createInitiative(CreateInitiativeRequest request) {
        // 1. 校验 Goal 存在
        Goal goal = goalService.getGoal(request.getGoalId());
        Initiative initiative = Initiative.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(goal.getWorkspaceId())
                .goalId(request.getGoalId())
                .name(request.getName())
                .description(request.getDescription())
                .initiativeType(request.getInitiativeType())
                .status("PLANNED")
                .priority(request.getPriority() != null ? request.getPriority() : 100)
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .ruleConfig(request.getRuleConfig())
                .createdBy(SecurityContext.getCurrentUserId())
                .build();
        initiative = initiativeRepository.save(initiative);
        // 2. 创建 KPI
        if (request.getKpis() != null) {
            for (CreateKpiRequest kpiReq : request.getKpis()) {
                InitiativeKpi kpi = InitiativeKpi.builder()
                        .id(UUID.randomUUID().toString())
                        .initiativeId(initiative.getId())
                        .kpiType(kpiReq.getKpiType())
                        .targetValue(kpiReq.getTargetValue())
                        .weight(kpiReq.getWeight())
                        .build();
                kpiRepository.save(kpi);
            }
        }
        log.info("Initiative created: id={}, name={}, goal={}", 
                 initiative.getId(), initiative.getName(), initiative.getGoalId());
        return initiative;
    }
    /**
     * 激活 Initiative（需校验 Goal 为 ACTIVE）
     */
    public Initiative activateInitiative(String initiativeId) {
        Initiative initiative = initiativeRepository.findById(initiativeId)
                .orElseThrow(() -> new ResourceNotFoundException("Initiative not found"));
        if (!"PLANNED".equals(initiative.getStatus()) && !"PAUSED".equals(initiative.getStatus())) {
            throw new BusinessException("Only PLANNED or PAUSED initiative can be activated");
        }
        // 校验 Goal 是否为 ACTIVE
        Goal goal = goalService.getGoal(initiative.getGoalId());
        if (!"ACTIVE".equals(goal.getStatus())) {
            throw new BusinessException("Cannot activate initiative: Goal is not ACTIVE");
        }
        initiative.setStatus("ACTIVE");
        initiative = initiativeRepository.save(initiative);
        log.info("Initiative activated: id={}, goal={}", initiative.getId(), initiative.getGoalId());
        return initiative;
    }
    /**
     * 绑定 Campaign Plan 到 Initiative
     */
    public void bindPlan(String initiativeId, String planId, String role, BigDecimal weight) {
        Initiative initiative = initiativeRepository.findById(initiativeId)
                .orElseThrow(() -> new ResourceNotFoundException("Initiative not found"));
        // 校验 Plan 存在（略）
        InitiativePlanRelation relation = InitiativePlanRelation.builder()
                .id(UUID.randomUUID().toString())
                .initiativeId(initiativeId)
                .planId(planId)
                .role(role != null ? role : "PRIMARY")
                .weight(weight != null ? weight : BigDecimal.ONE)
                .build();
        relationRepository.save(relation);
        log.info("Plan bound to initiative: initiative={}, plan={}, role={}", 
                 initiativeId, planId, role);
    }
    /**
     * 获取 Initiative 上下文（含绑定的 Plans 和 KPI）
     */
    public InitiativeContext loadContext(String initiativeId) {
        Initiative initiative = initiativeRepository.findById(initiativeId)
                .orElseThrow(() -> new ResourceNotFoundException("Initiative not found"));
        List<InitiativeKpi> kpis = kpiRepository.findByInitiativeId(initiativeId);
        List<InitiativePlanRelation> relations = relationRepository.findByInitiativeId(initiativeId);
        
        return InitiativeContext.builder()
                .initiative(initiative)
                .kpis(kpis)
                .planRelations(relations)
                .build();
    }
}
```
### 1.3.4 前端界面设计
#### Initiative 管理面板（Goal 详情页子视图）
```text
┌─ 举措管理 ──────────────────────────────────────────────────────────────────┐
│  [+ 新建举措]                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 举措 1: 高价值会员召回 ──────────────────────────────────────────────┐ │
│  │  类型: WINBACK │ 优先级: 1 │ 状态: ● ACTIVE                         │ │
│  │  预算: ¥300,000 │ 预期ROI: 2.3x                                     │ │
│  │  ┌────────────────────────────────────────────────────────────────┐  │ │
│  │  │  关联 Plan              │ 角色      │ 权重  │ 操作              │  │ │
│  │  │  召回邮件+折扣券        │ PRIMARY   │ 1.0   │ [编辑] [解绑]    │  │ │
│  │  │  短信唤醒              │ SUPPORTING│ 0.6   │ [编辑] [解绑]    │  │ │
│  │  └────────────────────────────────────────────────────────────────┘  │ │
│  │  [+ 绑定 Plan]                                                      │ │
│  │  [暂停] [编辑] [归档]                                               │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 举措 2: 新会员促活 ──────────────────────────────────────────────────┐ │
│  │  类型: ACQUISITION │ 优先级: 2 │ 状态: ● ACTIVE                    │ │
│  │  预算: ¥200,000 │ 预期ROI: 1.8x                                     │ │
│  │  ┌────────────────────────────────────────────────────────────────┐  │ │
│  │  │  关联 Plan              │ 角色      │ 权重  │ 操作              │  │ │
│  │  │  首购礼包+积分加倍      │ PRIMARY   │ 1.0   │ [编辑] [解绑]    │  │ │
│  │  └────────────────────────────────────────────────────────────────┘  │ │
│  │  [+ 绑定 Plan]                                                      │ │
│  │  [暂停] [编辑] [归档]                                               │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 1.3.5 前后端 JSON 交互
#### 创建 Initiative
**Request:**
```json
POST /api/campaign/initiative
{
    "goalId": "goal_001",
    "name": "高价值会员召回",
    "description": "针对30天未活跃的高价值会员进行召回",
    "initiativeType": "WINBACK",
    "priority": 1,
    "startTime": "2026-06-01T00:00:00Z",
    "endTime": "2026-06-30T23:59:59Z",
    "ruleConfig": {
        "segment": "high_value_inactive_30d",
        "conditions": {
            "lastOrderDays": ">30",
            "totalAmount": ">5000"
        }
    },
    "kpis": [
        {
            "kpiType": "RETENTION",
            "targetValue": 15,
            "weight": 1.0
        }
    ]
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "id": "ini_001",
        "workspaceId": "ws_001",
        "goalId": "goal_001",
        "name": "高价值会员召回",
        "description": "针对30天未活跃的高价值会员进行召回",
        "initiativeType": "WINBACK",
        "status": "PLANNED",
        "priority": 1,
        "ruleConfig": {
            "segment": "high_value_inactive_30d",
            "conditions": {
                "lastOrderDays": ">30",
                "totalAmount": ">5000"
            }
        },
        "startTime": "2026-06-01T00:00:00Z",
        "endTime": "2026-06-30T23:59:59Z",
        "createdBy": "user_001",
        "createdAt": "2026-06-24T10:00:00Z",
        "updatedAt": "2026-06-24T10:00:00Z",
        "kpis": [
            {
                "id": "ikpi_001",
                "kpiType": "RETENTION",
                "targetValue": 15,
                "currentValue": 0,
                "weight": 1.0
            }
        ]
    }
}
```
***
## 1.4 Portfolio Management（组合管理）
### 1.4.1 数据库设计
```sql
-- Portfolio 主表
CREATE TABLE campaign_portfolio (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'DRAFT',             -- DRAFT / OPTIMIZED / LOCKED / EXECUTING / COMPLETED
    optimization_mode VARCHAR(32) DEFAULT 'ROI_MAXIMIZATION', -- ROI_MAXIMIZATION / REVENUE_MAXIMIZATION / BALANCED
    total_budget DECIMAL(18,4),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cp_workspace ON campaign_portfolio(workspace_id);
CREATE INDEX idx_cp_status ON campaign_portfolio(status);
-- Portfolio ↔ Initiative 关系表（预算分配）
CREATE TABLE campaign_portfolio_initiative_relation (
    id VARCHAR(64) PRIMARY KEY,
    portfolio_id VARCHAR(64) NOT NULL,
    initiative_id VARCHAR(64) NOT NULL,
    allocated_budget DECIMAL(18,4),                 -- 分配预算
    expected_roi DECIMAL(10,4),                     -- 预期 ROI
    priority_weight DECIMAL(10,4) DEFAULT 1.0,      -- 优先级权重
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(portfolio_id, initiative_id)
);
CREATE INDEX idx_cppr_portfolio ON campaign_portfolio_initiative_relation(portfolio_id);
CREATE INDEX idx_cppr_initiative ON campaign_portfolio_initiative_relation(initiative_id);
-- Portfolio KPI 表
CREATE TABLE campaign_portfolio_kpi (
    id VARCHAR(64) PRIMARY KEY,
    portfolio_id VARCHAR(64) NOT NULL,
    kpi_type VARCHAR(32) NOT NULL,
    target_value DECIMAL(18,4) NOT NULL,
    predicted_value DECIMAL(18,4),                  -- 预测值
    weight DECIMAL(5,2) DEFAULT 1.0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(portfolio_id, kpi_type)
);
CREATE INDEX idx_cpk_portfolio ON campaign_portfolio_kpi(portfolio_id);
```
### 1.4.2 状态机
```text
DRAFT → OPTIMIZED → LOCKED → EXECUTING → COMPLETED
```
**约束规则**：
* LOCKED 后不可修改 allocation
* 执行中的 Portfolio 不可删除
### 1.4.3 后端 Service 设计
```java
@Service
@Slf4j
@Transactional
public class PortfolioService {
    @Autowired
    private PortfolioRepository portfolioRepository;
    @Autowired
    private PortfolioInitiativeRelationRepository relationRepository;
    @Autowired
    private PortfolioKpiRepository kpiRepository;
    @Autowired
    private InitiativeService initiativeService;
    @Autowired
    private SimulationEngine simulationEngine;
    @Autowired
    private WorkspaceLockService lockService;
    /**
     * 创建 Portfolio（DRAFT 状态）
     */
    public Portfolio createPortfolio(CreatePortfolioRequest request) {
        Portfolio portfolio = Portfolio.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(request.getWorkspaceId())
                .name(request.getName())
                .description(request.getDescription())
                .status("DRAFT")
                .optimizationMode(request.getOptimizationMode() != null ? 
                                  request.getOptimizationMode() : "ROI_MAXIMIZATION")
                .totalBudget(request.getTotalBudget())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .createdBy(SecurityContext.getCurrentUserId())
                .build();
        portfolio = portfolioRepository.save(portfolio);
        log.info("Portfolio created: id={}, name={}, workspace={}", 
                 portfolio.getId(), portfolio.getName(), portfolio.getWorkspaceId());
        return portfolio;
    }
    /**
     * 运行优化（核心算法：预算分配）
     * 
     * 算法：基于 ROI 的贪心分配 + 背包优化
     * 1. 获取 Workspace 下所有 ACTIVE Initiative
     * 2. 对每个 Initiative 预测 ROI
     * 3. 按 ROI 降序分配预算
     * 4. 输出优化后的 allocation
     */
    public Portfolio optimizePortfolio(String portfolioId) {
        Portfolio portfolio = portfolioRepository.findById(portfolioId)
                .orElseThrow(() -> new ResourceNotFoundException("Portfolio not found"));
        if (!"DRAFT".equals(portfolio.getStatus())) {
            throw new BusinessException("Only DRAFT portfolio can be optimized");
        }
        return lockService.executeWithLock(portfolio.getWorkspaceId(), () -> {
            // 1. 获取 Workspace 下所有 ACTIVE Initiative
            List<Initiative> initiatives = initiativeService.getActiveInitiatives(
                    portfolio.getWorkspaceId());
            if (initiatives.isEmpty()) {
                throw new BusinessException("No active initiatives found for optimization");
            }
            // 2. 构建候选列表（含预测 ROI）
            List<OptimizationCandidate> candidates = new ArrayList<>();
            for (Initiative initiative : initiatives) {
                // 调用 Simulation Engine 预测 ROI
                SimulationResult simResult = simulationEngine.predictInitiativeROI(
                        initiative.getId(), portfolio.getTotalBudget());
                
                OptimizationCandidate candidate = OptimizationCandidate.builder()
                        .initiativeId(initiative.getId())
                        .initiativeName(initiative.getName())
                        .priority(initiative.getPriority())
                        .expectedROI(simResult.getExpectedROI())
                        .minBudget(simResult.getMinEffectiveBudget())
                        .maxBudget(simResult.getMaxEffectiveBudget())
                        .build();
                candidates.add(candidate);
            }
            // 3. 执行优化算法（贪心 + ROI 排序）
            Map<String, BigDecimal> allocation = runOptimization(
                    candidates, portfolio.getTotalBudget());
            // 4. 保存分配结果
            for (Map.Entry<String, BigDecimal> entry : allocation.entrySet()) {
                PortfolioInitiativeRelation relation = PortfolioInitiativeRelation.builder()
                        .id(UUID.randomUUID().toString())
                        .portfolioId(portfolioId)
                        .initiativeId(entry.getKey())
                        .allocatedBudget(entry.getValue())
                        .priorityWeight(calculatePriorityWeight(entry.getKey(), candidates))
                        .build();
                relationRepository.save(relation);
            }
            // 5. 更新 Portfolio 状态
            portfolio.setStatus("OPTIMIZED");
            portfolio = portfolioRepository.save(portfolio);
            log.info("Portfolio optimized: id={}, allocated {} initiatives", 
                     portfolioId, allocation.size());
            return portfolio;
        });
    }
    /**
     * 贪心优化算法
     * 
     * 伪代码：
     * 1. candidates 按 expectedROI 降序排序
     * 2. remaining = totalBudget
     * 3. for each candidate in candidates:
     * 4.     budget = min(candidate.maxBudget, remaining)
     * 5.     if budget >= candidate.minBudget:
     * 6.         allocation[candidate.id] = budget
     * 7.         remaining -= budget
     * 8.     if remaining <= 0: break
     * 9. 如果 remaining > 0，按优先级二次分配
     */
    private Map<String, BigDecimal> runOptimization(
            List<OptimizationCandidate> candidates, BigDecimal totalBudget) {
        
        // 按 ROI 降序排序
        candidates.sort((a, b) -> b.getExpectedROI().compareTo(a.getExpectedROI()));
        Map<String, BigDecimal> allocation = new LinkedHashMap<>();
        BigDecimal remaining = totalBudget;
        for (OptimizationCandidate candidate : candidates) {
            // 计算建议预算：取 maxBudget 和 remaining 的较小值
            BigDecimal budget = candidate.getMaxBudget().min(remaining);
            
            // 至少达到 minBudget 才分配
            if (budget.compareTo(candidate.getMinBudget()) >= 0) {
                allocation.put(candidate.getInitiativeId(), budget);
                remaining = remaining.subtract(budget);
            }
            
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                break;
            }
        }
        // 如果还有剩余预算，按优先级二次分配
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            candidates.sort(Comparator.comparingInt(OptimizationCandidate::getPriority));
            for (OptimizationCandidate candidate : candidates) {
                if (!allocation.containsKey(candidate.getInitiativeId())) {
                    BigDecimal budget = candidate.getMinBudget().min(remaining);
                    if (budget.compareTo(BigDecimal.ZERO) > 0) {
                        allocation.put(candidate.getInitiativeId(), budget);
                        remaining = remaining.subtract(budget);
                    }
                }
                if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            }
        }
        return allocation;
    }
    /**
     * 锁定 Portfolio（不可再修改）
     */
    public Portfolio lockPortfolio(String portfolioId) {
        Portfolio portfolio = portfolioRepository.findById(portfolioId)
                .orElseThrow(() -> new ResourceNotFoundException("Portfolio not found"));
        if (!"OPTIMIZED".equals(portfolio.getStatus())) {
            throw new BusinessException("Only OPTIMIZED portfolio can be locked");
        }
        portfolio.setStatus("LOCKED");
        portfolio = portfolioRepository.save(portfolio);
        log.info("Portfolio locked: id={}", portfolioId);
        return portfolio;
    }
    /**
     * 获取 Portfolio 上下文
     */
    public PortfolioContext loadContext(String portfolioId) {
        Portfolio portfolio = portfolioRepository.findById(portfolioId)
                .orElseThrow(() -> new ResourceNotFoundException("Portfolio not found"));
        List<PortfolioInitiativeRelation> relations = 
                relationRepository.findByPortfolioId(portfolioId);
        List<PortfolioKpi> kpis = kpiRepository.findByPortfolioId(portfolioId);
        
        return PortfolioContext.builder()
                .portfolio(portfolio)
                .initiativeRelations(relations)
                .kpis(kpis)
                .build();
    }
}
```
### 1.4.4 前端界面设计
#### Portfolio 管理页面
```text
┌─ 组合管理 ──────────────────────────────────────────────────────────────────┐
│  [+ 新建组合]                                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ Q2营销组合 ──────────────────────────────────────────────────────────┐ │
│  │  状态: ● OPTIMIZED │ 模式: ROI_MAXIMIZATION                         │ │
│  │  总预算: ¥650,000  │ 预期总ROI: 2.1x                                │ │
│  │                                                                      │ │
│  │  ┌────────────────────────────────────────────────────────────────┐  │ │
│  │  │  Initiative          │ 分配预算   │ 预期ROI │ 权重 │ 占比    │  │ │
│  │  ├────────────────────────────────────────────────────────────────┤  │ │
│  │  │  高价值会员召回      │ ¥300,000  │ 2.3x   │ 1.0  │ 46% ███ │  │ │
│  │  │  新会员促活          │ ¥200,000  │ 1.8x   │ 0.8  │ 31% ██  │  │ │
│  │  │  会员升级激励        │ ¥150,000  │ 2.1x   │ 0.9  │ 23% ██  │  │ │
│  │  └────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                      │ │
│  │  ┌─ 预算分配可视化 ────────────────────────────────────────────────┐ │ │
│  │  │  高价值会员召回 ████████████████████████░░░░░░░░░░ 46%         │ │ │
│  │  │  新会员促活     ████████████████░░░░░░░░░░░░░░░░ 31%           │ │ │
│  │  │  会员升级激励   ████████████░░░░░░░░░░░░░░░░░░░░ 23%           │ │ │
│  │  └────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                      │ │
│  │                              [锁定] [重新优化] [编辑]                 │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 1.4.5 前后端 JSON 交互
#### 创建 Portfolio
**Request:**
```json
POST /api/campaign/portfolio
{
    "workspaceId": "ws_001",
    "name": "Q2营销组合",
    "description": "2026年Q2整体营销预算分配",
    "optimizationMode": "ROI_MAXIMIZATION",
    "totalBudget": 650000,
    "startTime": "2026-04-01T00:00:00Z",
    "endTime": "2026-06-30T23:59:59Z"
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "id": "port_001",
        "workspaceId": "ws_001",
        "name": "Q2营销组合",
        "description": "2026年Q2整体营销预算分配",
        "status": "DRAFT",
        "optimizationMode": "ROI_MAXIMIZATION",
        "totalBudget": 650000,
        "startTime": "2026-04-01T00:00:00Z",
        "endTime": "2026-06-30T23:59:59Z",
        "createdBy": "user_001",
        "createdAt": "2026-06-24T10:00:00Z",
        "updatedAt": "2026-06-24T10:00:00Z"
    }
}
```
#### 运行优化
**Request:**
```json
POST /api/campaign/portfolio/port_001/optimize
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "portfolioId": "port_001",
        "status": "OPTIMIZED",
        "totalBudget": 650000,
        "totalExpectedROI": 2.1,
        "allocations": [
            {
                "initiativeId": "ini_001",
                "initiativeName": "高价值会员召回",
                "allocatedBudget": 300000,
                "expectedROI": 2.3,
                "priorityWeight": 1.0,
                "percentage": 46.15
            },
            {
                "initiativeId": "ini_002",
                "initiativeName": "新会员促活",
                "allocatedBudget": 200000,
                "expectedROI": 1.8,
                "priorityWeight": 0.8,
                "percentage": 30.77
            },
            {
                "initiativeId": "ini_003",
                "initiativeName": "会员升级激励",
                "allocatedBudget": 150000,
                "expectedROI": 2.1,
                "priorityWeight": 0.9,
                "percentage": 23.08
            }
        ]
    }
}
```
***
## 1.5 前端复杂逻辑伪代码
### 1.5.1 Workspace 状态管理（Redux/Zustand）
typescript
```
// store/workspace.slice.ts
interface WorkspaceState {
  currentWorkspace: Workspace | null;
  activeGoal: Goal | null;
  initiatives: Initiative[];
  portfolios: Portfolio[];
  loading: boolean;
  error: string | null;
}
const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  currentWorkspace: null,
  activeGoal: null,
  initiatives: [],
  portfolios: [],
  loading: false,
  error: null,
  // 加载工作区上下文
  loadContext: async (workspaceId: string) => {
    set({ loading: true, error: null });
    try {
      const response = await api.get(`/campaign/workspace/${workspaceId}/context`);
      set({
        currentWorkspace: response.data.workspace,
        activeGoal: response.data.activeGoal,
        initiatives: response.data.initiatives,
        portfolios: response.data.portfolios,
        loading: false
      });
    } catch (error) {
      set({ error: error.message, loading: false });
    }
  },
  // 激活目标（含乐观更新）
  activateGoal: async (goalId: string) => {
    const { currentWorkspace } = get();
    // 乐观更新：立即更新 UI
    set((state) => ({
      activeGoal: state.initiatives.find(i => i.id === goalId) as Goal,
      // 将其他目标状态改为非激活
      initiatives: state.initiatives.map(i => ({
        ...i,
        status: i.id === goalId ? 'ACTIVE' : 
                i.status === 'ACTIVE' ? 'PAUSED' : i.status
      }))
    }));
    try {
      await api.post(`/campaign/goal/${goalId}/activate`);
    } catch (error) {
      // 回滚
      await get().loadContext(currentWorkspace!.id);
      set({ error: error.message });
    }
  },
  // 运行 Portfolio 优化（含加载状态）
  optimizePortfolio: async (portfolioId: string) => {
    set({ loading: true });
    try {
      const response = await api.post(`/campaign/portfolio/${portfolioId}/optimize`);
      // 更新 portfolio 列表
      set((state) => ({
        portfolios: state.portfolios.map(p =>
          p.id === portfolioId ? { ...p, status: 'OPTIMIZED', allocations: response.data.allocations } : p
        ),
        loading: false
      }));
      return response.data;
    } catch (error) {
      set({ error: error.message, loading: false });
      throw error;
    }
  }
}));
```
### 1.5.2 Goal 进度计算 Hook
typescript
```
// hooks/useGoalProgress.ts
export const useGoalProgress = (goal: Goal) => {
  const [progress, setProgress] = useState(0);
  const [trend, setTrend] = useState<'up' | 'down' | 'stable'>('stable');
  useEffect(() => {
    if (!goal || !goal.targetValue || goal.targetValue === 0) {
      setProgress(0);
      return;
    }
    const calcProgress = () => {
      const p = (goal.currentValue / goal.targetValue) * 100;
      return Math.min(p, 100);
    };
    setProgress(calcProgress());
    // 计算趋势（对比上次值）
    const prevValue = goal.previousValue || 0;
    if (goal.currentValue > prevValue) setTrend('up');
    else if (goal.currentValue < prevValue) setTrend('down');
    else setTrend('stable');
  }, [goal]);
  return { progress, trend };
};
```
### 1.5.3 Canvas DAG 校验器（前端）
typescript
```
// utils/dag-validator.ts
interface GraphValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}
export const validateDAG = (graph: { nodes: Node[]; edges: Edge[] }): GraphValidationResult => {
  const errors: string[] = [];
  const warnings: string[] = [];
  // 1. 检测循环依赖（DFS）
  const hasCycle = (): boolean => {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    
    const dfs = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);
      
      const outgoing = graph.edges.filter(e => e.source === nodeId);
      for (const edge of outgoing) {
        if (!visited.has(edge.target)) {
          if (dfs(edge.target)) return true;
        } else if (recursionStack.has(edge.target)) {
          return true;
        }
      }
      recursionStack.delete(nodeId);
      return false;
    };
    for (const node of graph.nodes) {
      if (!visited.has(node.id)) {
        if (dfs(node.id)) return true;
      }
    }
    return false;
  };
  if (hasCycle()) {
    errors.push('DAG contains cycle, please remove circular dependencies');
  }
  // 2. 检测孤立节点
  const connectedNodes = new Set<string>();
  graph.edges.forEach(e => {
    connectedNodes.add(e.source);
    connectedNodes.add(e.target);
  });
  graph.nodes.forEach(node => {
    if (!connectedNodes.has(node.id) && node.type !== 'START' && node.type !== 'END') {
      warnings.push(`Node "${node.name || node.id}" is isolated (no connections)`);
    }
  });
  // 3. 检测缺少 END 节点
  const hasEndNode = graph.nodes.some(n => n.type === 'END');
  if (!hasEndNode) {
    errors.push('Missing END node');
  }
  // 4. 检测无效的节点类型转换
  const validTransitions: Record<string, string[]> = {
    'START': ['AUDIENCE_FILTER', 'EVENT_TRIGGER'],
    'AUDIENCE_FILTER': ['CONDITION', 'AI_SCORE', 'SEND_EMAIL', 'SEND_SMS', 'SPLIT'],
    'CONDITION': ['SEND_EMAIL', 'SEND_SMS', 'DELAY', 'MERGE'],
    'SEND_EMAIL': ['CONDITION', 'DELAY', 'END'],
    'SEND_SMS': ['CONDITION', 'DELAY', 'END'],
    'END': []
  };
  graph.edges.forEach(edge => {
    const sourceNode = graph.nodes.find(n => n.id === edge.source);
    const targetNode = graph.nodes.find(n => n.id === edge.target);
    if (sourceNode && targetNode) {
      const allowed = validTransitions[sourceNode.type] || [];
      if (!allowed.includes(targetNode.type) && targetNode.type !== 'END') {
        warnings.push(`Transition from "${sourceNode.type}" to "${targetNode.type}" may not be supported`);
      }
    }
  });
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
};
```
***
## 1.6 与 Loyalty 现有模块的集成点
| 集成点        | Loyalty 能力          | 调用方式                                                        |
| ---------- | ------------------- | ----------------------------------------------------------- |
| Program 校验 | `program` 表         | `ProgramService.findByCode()`                               |
| 会员数据       | `member` 表          | 通过 CDC/定时任务同步到 `campaign_member_dim`                        |
| 规则存储       | `rule_definition` 表 | Initiative 的 `rule_config` 可引用 `rule_definition.id`         |
| 状态枚举       | `status` 枚举         | 复用 Loyalty 的 `status` 枚举值（ACTIVE/PAUSED/COMPLETED/ARCHIVED） |
| 用户身份       | `user`/`member`     | `created_by`、`operator_id` 关联 Loyalty 用户                    |
***
## 1.7 异常处理与业务规则
### 1.7.1 业务异常枚举
```java
public enum PlanningErrorCode {
    WORKSPACE_NOT_FOUND("P001", "Workspace not found"),
    WORKSPACE_LOCKED("P002", "Workspace is locked by another user"),
    GOAL_NOT_FOUND("P003", "Goal not found"),
    GOAL_ALREADY_ACTIVE("P004", "Another goal is already active in this workspace"),
    GOAL_CANNOT_ACTIVATE("P005", "Only DRAFT or PAUSED goal can be activated"),
    INITIATIVE_NOT_FOUND("P006", "Initiative not found"),
    INITIATIVE_GOAL_NOT_ACTIVE("P007", "Cannot activate initiative: Goal is not ACTIVE"),
    PORTFOLIO_NOT_FOUND("P008", "Portfolio not found"),
    PORTFOLIO_ALREADY_LOCKED("P009", "Portfolio is already locked"),
    NO_INITIATIVES_FOR_OPTIMIZATION("P010", "No active initiatives found for optimization"),
    PERMISSION_DENIED("P011", "No permission to access this resource");
}
```
### 1.7.2 并发控制
* 使用 Redis 分布式锁保护 Workspace 级别的写操作
* 使用数据库乐观锁（`@Version`）防止并发更新冲突
* 激活 Goal 时自动停用其他 ACTIVE Goal（原子操作）
***
## 1.8 开发实施检查清单
* 创建 8 张数据表（workspace, workspace\_member, workspace\_snapshot, goal, goal\_kpi, goal\_version, initiative, initiative\_kpi, initiative\_plan\_relation, portfolio, portfolio\_initiative\_relation, portfolio\_kpi）
* 实现 WorkspaceService（CRUD + Context + Lock + Snapshot）
* 实现 GoalService（CRUD + Activate + Pause + KPI Update）
* 实现 InitiativeService（CRUD + Activate + Bind Plan）
* 实现 PortfolioService（CRUD + Optimize + Lock）
* 实现前端 Workspace 列表页 + 详情页
* 实现前端 Goal 管理（创建、激活、进度展示）
* 实现前端 Initiative 管理（创建、激活、绑定 Plan）
* 实现前端 Portfolio 管理（创建、优化可视化、锁定）
* 集成 Redis 分布式锁
* 集成 Loyalty ProgramService 进行 Program 校验
* 编写单元测试（覆盖率 > 80%）
