好，这一步我按你要求来：**只做“可落地设计文档目录”，不加解释、不加概念扩展、不加伪代码。**
目标是：👉 你可以直接拿这个目录去写“工程级PRD + System Design”。
***
# # Campaign Planning Domain（详细设计目录 v1）
***
# 0. System Overview
## 0.1 System Scope
## 0.2 System Boundaries
## 0.3 External Dependencies
* Loyalty Data Platform
* Event Streaming System
* Messaging / Channel System
## 0.4 Core Outputs
* Campaign Strategy
* Opportunity Set
* Budget Allocation Plan
* Campaign Execution Blueprint
***
# 1. Planning Workspace（规划工作台）
## 1.1 Workspace Management
* 1.1.1 Create Workspace
* 1.1.2 Update Workspace
* 1.1.3 Delete Workspace
* 1.1.4 Workspace Access Control
## 1.2 Goal Management（营销目标管理）
### 1.2.1 Goal Definition
* Goal Type Definition
* Goal KPI Definition
* Goal Time Range
* Goal Target Segmentation
### 1.2.2 Goal Lifecycle
* Draft
* Active
* Paused
* Completed
* Archived
### 1.2.3 Goal Metrics Tracking
* Revenue Target
* Conversion Rate Target
* Retention Target
### 1.2.4 Goal Versioning
* Goal Snapshot
* Goal Revision History
***
## 1.3 Initiative Management（营销举措管理）
### 1.3.1 Initiative Definition
* Initiative Structure
* Initiative Goal Mapping
### 1.3.2 Initiative Breakdown
* Sub-Initiatives
* Campaign Grouping
### 1.3.3 Initiative Lifecycle
* Planning
* Approved
* Running
* Completed
***
## 1.4 Portfolio Management（组合管理）
### 1.4.1 Campaign Portfolio Structure
* Multi-campaign grouping
* Cross-goal aggregation
### 1.4.2 Portfolio Optimization Rules
* Budget distribution
* ROI balancing
* Channel balancing
### 1.4.3 Portfolio Lifecycle
* Draft
* Optimized
* Locked
* Executing
* Completed
***
# 2. Opportunity Intelligence（机会智能层）
***
## 2.1 Opportunity Discovery（机会发现）
### 2.1.1 Data Inputs
* Member behavior data
* Transaction history
* Engagement signals
### 2.1.2 Opportunity Types
* Churn Risk
* Upsell Opportunity
* Reactivation Opportunity
* High Value Expansion
### 2.1.3 Opportunity Scoring
* Score definition
* Score thresholds
* Score ranking
### 2.1.4 Opportunity Segmentation
* Rule-based segmentation
* Dynamic segmentation
* Time-based segmentation
***
## 2.2 Recommendation Engine（推荐引擎）
### 2.2.1 Recommendation Inputs
* Opportunity set
* Historical campaign data
* Budget constraints
### 2.2.2 Recommendation Outputs
* Campaign type recommendation
* Channel recommendation
* Offer recommendation
### 2.2.3 Ranking Logic
* Weighted scoring model
* Priority ranking
* Constraint filtering
***
## 2.3 AI Planner（策略生成）
### 2.3.1 Planning Inputs
* Goal input
* Opportunity input
* Budget constraints
* Channel constraints
### 2.3.2 Strategy Generation
* Campaign strategy generation
* Segment strategy mapping
* Channel strategy mapping
### 2.3.3 Plan Output
* Campaign blueprint
* Execution structure
* Expected KPI output
***
# 3. Marketing Decision Engine（营销决策引擎）
***
## 3.1 Budget Allocation（预算分配）
### 3.1.1 Budget Model Definition
* Total budget
* Per-goal allocation
* Per-campaign allocation
### 3.1.2 Allocation Strategy
* Rule-based allocation
* ROI-driven allocation
* Dynamic reallocation
### 3.1.3 Budget Constraints
* Min budget
* Max budget
* Channel cap
***
## 3.2 Attention Budget（注意力预算）
### 3.2.1 Attention Definition
* Exposure limit
* Frequency cap
* Fatigue model
### 3.2.2 Attention Allocation
* Per user cap
* Per channel cap
* Per campaign cap
### 3.2.3 Fatigue Control
* Overexposure detection
* Suppression rules
***
## 3.3 Arbitration Engine（冲突仲裁）
### 3.3.1 Conflict Types
* Campaign conflict
* Channel conflict
* Budget conflict
* Audience overlap conflict
### 3.3.2 Arbitration Rules
* Priority override
* ROI-based selection
* Constraint-based filtering
### 3.3.3 Execution Result
* Selected campaign
* Rejected campaigns
* Reason codes
***
## 3.4 Prioritization Engine（优先级排序）
### 3.4.1 Priority Factors
* ROI score
* Opportunity score
* Budget weight
* Time sensitivity
### 3.4.2 Ranking Model
* Weighted scoring
* Hard constraints
* Tie-breaking rules
***
# 4. Simulation & Optimization（模拟与优化）
***
## 4.1 Forecast Engine（预测引擎）
### 4.1.1 Forecast Inputs
* Historical campaign data
* Member behavior data
* Market trends
### 4.1.2 Forecast Outputs
* Conversion rate forecast
* Revenue forecast
* Engagement forecast
***
## 4.2 What-if Simulation（假设模拟）
### 4.2.1 Simulation Scenarios
* Budget increase/decrease
* Channel switching
* Offer changes
### 4.2.2 Simulation Output
* KPI impact
* Risk score
* ROI impact
***
## 4.3 ROI Prediction（ROI预测）
### 4.3.1 ROI Model Inputs
* Cost
* Conversion probability
* Expected revenue
### 4.3.2 ROI Calculation Model
* Per campaign ROI
* Portfolio ROI
* Lifetime ROI
***
## 4.4 Auto Campaign Generation（自动生成）
### 4.4.1 Generation Inputs
* Goal
* Opportunity set
* Budget constraints
### 4.4.2 Generation Output
* Campaign structure
* Channel plan
* Execution blueprint
***
# 5. Cross-Domain Dependencies
## 5.1 Data Dependencies
* Member Data Model
* Transaction Data Model
* Event Data Model
## 5.2 Service Dependencies
* Event Service
* Execution Service
* Canvas Runtime Service
## 5.3 External Integrations
* Email / SMS / Push
* CRM System
* Data Warehouse
***
# 6. System Output Contracts
## 6.1 Planning Output Contract
* CampaignPlan
* StrategyPlan
* BudgetPlan
## 6.2 Decision Output Contract
* DecisionResult
* PriorityResult
* AllocationResult
## 6.3 Simulation Output Contract
* ForecastResult
* ROIResult
* ScenarioResult
***
# ✔ 这一份是什么级别
这是：
> 🟢 **可直接拆 Jira / 可直接写后端模块 / 可做 API contract base 的系统目录级设计**
***
如果你下一步要继续，我可以把这一份直接升级成：
> 👉 “每一节 = DB + API + Java Service + State + Event 的完整实现规范”
那就是真正 Codex 可以直接开工的版本。
好，我们按“工程级可实现规范”来写 **0. System Overview**，这一章不做概念扩展，只做：范围、边界、依赖、输入输出契约。
***
# # 0. System Overview（Campaign Planning Domain）
***
# 0.1 System Scope（系统范围）
***
## 0.1.1 系统核心能力范围
Campaign Planning Domain 系统负责以下四类核心能力：
### (1) Marketing Planning（营销规划）
* 创建 Marketing Goal
* 拆解 Initiative
* 生成 Campaign Portfolio
* 维护 Planning Workspace
***
### (2) Opportunity Intelligence（机会识别）
* 计算用户机会评分（Opportunity Score）
* 生成用户机会集合（Opportunity Set）
* 用户分群（Segmentation）
* 推荐营销触发点（Trigger Suggestion）
***
### (3) Decision Engine（营销决策）
* 预算分配（Budget Allocation）
* 注意力分配（Attention Budget）
* 冲突仲裁（Arbitration）
* 优先级排序（Prioritization）
***
### (4) Simulation & Optimization（模拟优化）
* ROI 预测（ROI Prediction）
* 转化预测（Forecast）
* 策略模拟（What-if Simulation）
* 自动生成 Campaign Blueprint
***
## 0.1.2 系统职责边界（必须执行）
系统**只负责“决策与规划”**，不负责执行。
***
### ✔ 系统负责
* Campaign 设计
* Campaign 结构生成
* 人群筛选逻辑
* 预算分配结果
* 渠道策略建议
* ROI预测与优化
***
### ❌ 系统不负责
* 实际发送短信 / 邮件 / push
* 消息投递成功率
* 渠道 SDK 调用
* 用户实时触达执行
（执行属于 Execution System）
***
## 0.1.3 核心处理对象
系统只处理以下 Domain Object：
* CampaignPlan
* MarketingGoal
* Initiative
* Opportunity
* MemberSegment
* BudgetPlan
* StrategyPlan
* SimulationScenario
***
# 0.2 System Boundaries（系统边界）
***
## 0.2.1 内部系统边界
Campaign Planning System 内部包含：
```
Planning Workspace
Opportunity Intelligence
Decision Engine
Simulation Engine
```
***
## 0.2.2 外部系统边界
系统不直接持有以下能力：
| 外部系统             | 说明            |
| ---------------- | ------------- |
| Execution System | 实际执行 Campaign |
| Loyalty Platform | 用户基础数据来源      |
| Channel System   | 消息触达          |
| Event System     | 行为事件流         |
***
## 0.2.3 数据边界
### 输入边界（Inbound Data Only）
系统只接收：
* Member Profile Snapshot
* Order History Snapshot
* Behavior Event Aggregates
* Campaign Execution Feedback
***
### 输出边界（Outbound Data Only）
系统只输出：
* Campaign Plan
* Strategy Plan
* Budget Allocation Plan
* Simulation Result
* Opportunity Set
***
## 0.2.4 状态边界（关键）
系统**不维护长期用户状态变更逻辑**，只维护：
* Planning State
* Versioned Plans
* Snapshot-based Models
***
# 0.3 External Dependencies（外部依赖）
***
# 0.3.1 Loyalty Data Platform（核心数据依赖）
***
## 数据类型
系统依赖以下数据：
### (1) Member Data
* member\_id
* tier
* lifetime\_value
* last\_purchase\_time
* segmentation\_tags
***
### (2) Transaction Data
* order\_id
* order\_amount
* order\_time
* discount
* channel
***
### (3) Behavior Data
* event\_type
* event\_time
* session\_id
* engagement\_score
***
## 数据同步方式
```
Loyalty DB → CDC → Kafka → Campaign Data Store
```
***
## 数据使用方式
* Batch Aggregation (T+1)
* Near Real-time Aggregation (5\~10 min delay)
* Read-only access in Planning Engine
***
# 0.3.2 Event Streaming System（事件流系统）
***
## 职责
用于提供：
* 用户行为流
* 交易事件流
* Campaign反馈事件流
***
## 消费方式
* Kafka Consumer Group
* Event Aggregator Service
* Window-based processing
***
## 事件类型
```
MemberLoginEvent
OrderCreatedEvent
OrderPaidEvent
CampaignExposureEvent
CampaignConversionEvent
```
***
## 使用方式
Planning System 只消费：
* Aggregated Event Metrics
* Windowed Behavior Features
不直接消费 raw event stream 做决策。
***
# 0.3.3 Messaging / Channel System（渠道系统）
***
## 职责
外部系统提供：
* Email sending API
* SMS gateway
* Push notification service
* WhatsApp / LINE integration
***
## 对接方式
```
Campaign Planning → Execution System → Channel System
```
***
## Planning System 只输出：
```
JSON
{
  "channel": "EMAIL",
  "audience": "...",
  "message_template": "...",
  "send_time": "..."
}
```
***
## 不直接调用
Planning System **不直接调用任何 channel API**
***
# 0.4 Core Outputs（核心系统输出）
***
# 0.4.1 Campaign Strategy（策略输出）
***
## 定义
系统生成的营销策略结构体：
```
JSON
CampaignStrategy
```
***
## 包含内容
* Strategy Type（WINBACK / UPSELL / RETENTION）
* Target Segment
* Channel Mix
* Offer Strategy
* Timing Strategy
***
## 输出结构
```
JSON
{
  "strategy_id": "S123",
  "goal_id": "G1",
  "type": "WINBACK",
  "segments": ["SEG_A"],
  "channels": ["EMAIL", "SMS"],
  "offer": {
    "type": "DISCOUNT",
    "value": 10
  }
}
```
***
# 0.4.2 Opportunity Set（机会集合）
***
## 定义
系统输出的用户机会集合：
```
JSON
OpportunitySet
```
***
## 内容
* user\_id
* opportunity\_type
* score
* reason codes
***
## 输出结构
```
JSON
{
  "opportunities": [
    {
      "member_id": "M1",
      "type": "CHURN",
      "score": 0.82,
      "reasons": ["NO_ORDER_60D", "LOW_ENGAGEMENT"]
    }
  ]
}
```
***
# 0.4.3 Budget Allocation Plan（预算分配计划）
***
## 定义
Campaign级预算分配结果
***
## 输出结构
```
JSON
{
  "goal_id": "G1",
  "total_budget": 100000,
  "allocation": [
    {
      "campaign_type": "WINBACK",
      "budget": 40000
    },
    {
      "campaign_type": "UPSELL",
      "budget": 60000
    }
  ]
}
```
***
# 0.4.4 Campaign Execution Blueprint（执行蓝图）
***
## 定义
用于 Execution System 的结构化输入
***
## 内容
* Campaign DAG
* Trigger logic
* Segment logic
* Action nodes
***
## 输出结构
```
JSON
{
  "campaign_id": "C1",
  "dag": {
    "nodes": [],
    "edges": []
  },
  "execution_policy": {
    "retry": 3,
    "idempotency": true
  }
}
```
***
# ✔ 本章总结（工程视角）
这一章定义了：
### ✔ 系统做什么（Scope）
### ✔ 系统不做什么（Boundary）
### ✔ 外部依赖如何接入
### ✔ 输入数据模型
### ✔ 输出契约（最关键）
***
# 下一步（非常关键）
如果你同意这个粒度，我们下一章可以进入：
> 👉 **1. Planning Workspace（可直接建库 + API + Java service）**
那一章开始就会变成：
* table schema
* service class
* API endpoint
* state machine
* versioning model
（真正开始“写系统”）
好，这一章我按你要求升级成\*\*“工程级可读 + 可实现 + 带说明的完整设计”\*\*，不再是目录，也不是碎片代码，而是：
> ✔ 可以直接建库\
> ✔ 可以直接写 Spring Boot\
> ✔ 可以直接给前端对接\
> ✔ 每个模块都有“为什么 + 做什么 + 怎么做”
***
# # 1. Planning Workspace（系统实现级设计）
***
# 1.0 模块概述（必须先理解）
## 🎯 Workspace 是什么？
Planning Workspace 是 Campaign Planning Domain 的**顶层容器（Top-level Container）**
它的作用不是“功能模块”，而是：
> 🧠 把所有 Campaign Planning 相关对象（Goal / Initiative / Portfolio / Strategy）统一放在一个“可管理、可版本化、可隔离”的工作空间中
***
## 🧩 为什么必须有 Workspace？
如果没有 Workspace，会出现：
* 多个营销团队互相污染 Campaign
* Goal / Campaign 无版本隔离
* AI Planner 无上下文边界
* Portfolio 无法做跨目标优化
***
## 🧠 Workspace 的本质
> Workspace = “一个独立的营销决策上下文（Decision Context Scope）”
***
# 1.1 数据库设计（可直接建表）
***
# 1.1.1 workspace 表
```
SQL
CREATE TABLE campaign_workspace (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- 所属组织
    org_id VARCHAR(64) NOT NULL,
    -- 状态
    status VARCHAR(32) NOT NULL, 
    -- ACTIVE / ARCHIVED / LOCKED
    -- 当前默认目标
    active_goal_id VARCHAR(64),
    -- 元信息
    created_by VARCHAR(64),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```
***
## 📌 说明
这个表是 Workspace 的核心：
* 一个 org 可以有多个 workspace
* 每个 workspace 代表一个独立营销“脑区”
* active\_goal\_id 表示当前 AI/系统工作的主目标
***
# 1.1.2 workspace\_member（权限模型）
```
SQL
CREATE TABLE workspace_member (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64),
    user_id VARCHAR(64),
    role VARCHAR(32),
    -- OWNER / ADMIN / ANALYST / VIEWER
    created_at TIMESTAMP
);
```
***
## 📌 说明
用于解决：
* 谁可以创建 Campaign
* 谁可以修改 Goal
* 谁可以执行 AI Planner
***
# 1.1.3 workspace\_snapshot（版本隔离核心）
```
SQL
CREATE TABLE workspace_snapshot (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64),
    snapshot_type VARCHAR(32),
    -- GOAL / INITIATIVE / PORTFOLIO
    snapshot_data JSONB,
    version INT,
    created_at TIMESTAMP
);
```
***
## 📌 说明（非常关键）
Workspace 不允许“直接覆盖修改”，必须：
> ✔ 每次变更生成 snapshot\
> ✔ 支持回滚\
> ✔ 支持 AI replay
***
# 1.2 Java Service 设计（可直接实现）
***
# 1.2.1 WorkspaceService
```
Java
public class WorkspaceService {
    private WorkspaceRepository workspaceRepository;
    /**
     * 创建 Workspace
     */
    public Workspace create(CreateWorkspaceRequest req) {
        Workspace ws = new Workspace();
        ws.setId(UUID.randomUUID().toString());
        ws.setName(req.getName());
        ws.setOrgId(req.getOrgId());
        ws.setStatus("ACTIVE");
        return workspaceRepository.save(ws);
    }
}
```
***
## 📌 说明
这是 Workspace 的生命周期入口：
* 创建 workspace = 创建一个“独立决策空间”
* 后续所有 Campaign 都必须绑定 workspace\_id
***
# 1.2.2 WorkspaceContextService（核心上下文服务）
```
Java
public class WorkspaceContextService {
    public WorkspaceContext load(String workspaceId) {
        Workspace ws = workspaceRepo.findById(workspaceId);
        Goal goal = goalRepo.findActiveGoal(workspaceId);
        List<Initiative> initiatives = initiativeRepo.findByWorkspace(workspaceId);
        List<Portfolio> portfolios = portfolioRepo.findByWorkspace(workspaceId);
        return new WorkspaceContext(ws, goal, initiatives, portfolios);
    }
}
```
***
## 📌 说明（关键）
这个类是整个 Planning System 的：
> 🧠 “AI + Decision Engine 的上下文入口”
所有：
* AI Planner
* Opportunity Engine
* Budget Engine
都必须依赖它。
***
# 1.2.3 WorkspaceLockService（防并发冲突）
```
Java
public class WorkspaceLockService {
    private RedisTemplate redis;
    public boolean lock(String workspaceId) {
        String key = "ws_lock:" + workspaceId;
        return redis.opsForValue()
            .setIfAbsent(key, "LOCKED", Duration.ofMinutes(10));
    }
    public void unlock(String workspaceId) {
        redis.delete("ws_lock:" + workspaceId);
    }
}
```
***
## 📌 说明
解决问题：
* 多人同时改 Goal
* AI Planner 并发执行
* Portfolio 冲突计算
***
# 1.2.4 WorkspaceVersionService（版本控制）
```
Java
public class WorkspaceVersionService {
    public void snapshot(String workspaceId, Object data, String type) {
        WorkspaceSnapshot snapshot = new WorkspaceSnapshot();
        snapshot.setWorkspaceId(workspaceId);
        snapshot.setSnapshotType(type);
        snapshot.setSnapshotData(JsonUtil.toJson(data));
        snapshot.setVersion(getNextVersion(workspaceId));
        snapshotRepo.save(snapshot);
    }
}
```
***
## 📌 说明
这是 AI 能“回放决策”的基础：
* AI Planner 可以重跑历史 workspace
* 可以做 what-if simulation
* 可以 rollback strategy
***
# 1.3 API 设计（前端直接用）
***
# 1.3.1 Workspace API
## 创建 Workspace
```
http
POST /api/workspace/create
```
### Request
```
JSON
{
  "name": "Q2 Marketing Workspace",
  "orgId": "ORG_1"
}
```
***
## 获取 Workspace
```
http
GET /api/workspace/{workspaceId}
```
***
## 加载 Workspace Context（AI/引擎使用）
```
http
GET /api/workspace/{id}/context
```
***
## Lock Workspace
```
http
POST /api/workspace/{id}/lock
```
***
## Snapshot Workspace
```
http
POST /api/workspace/{id}/snapshot
```
***
# 1.4 Workspace 在系统中的位置（非常关键）
***
```
Workspace
   ↓
Goal
   ↓
Initiative
   ↓
Portfolio
   ↓
Opportunity Engine
   ↓
Decision Engine
   ↓
Simulation Engine
```
***
## 📌 解释
Workspace 是：
> 🧠 所有 Planning 决策的“上下文容器”
没有 workspace：
* AI 无法判断目标范围
* Budget 无法隔离
* Strategy 无法版本化
***
# 1.5 Workspace 与 AI Planner 的关系（核心设计点）
***
## AI Planner 输入必须是：
```
JSON
{
  "workspace": {
    "goal": "...",
    "portfolio": "...",
    "constraints": "..."
  }
}
```
***
## AI Planner 不允许：
* 直接访问全局数据
* 跨 workspace 推理
* 无 context 决策
***
## ✔ 这是防“AI乱决策”的关键
***
# ✔ 本章总结（工程视角）
这一章你已经得到：
### ✔ 数据库可以直接建
### ✔ Service 可以直接写
### ✔ API 可以直接给前端用
### ✔ AI Planner 有明确上下文边界
### ✔ 并发 / 版本 / 锁 都已经定义
***
# 下一步（继续会进入核心）
如果你继续：
> 👉 1.2 Goal Management（营销目标管理）
我会直接写：
* Goal 表结构（完整）
* Goal state machine
* Goal API
* Goal versioning
* Goal → AI Planner 输入结构
* Goal 如何驱动 Opportunity Engine
那一章开始就是 **真正核心业务逻辑层**。
好，这一节我们严格按你要求来升级：
> ✔ 不只是代码\
> ✔ 有业务解释（为什么要做）\
> ✔ 有功能拆解（做什么）\
> ✔ 有实现设计（怎么做）\
> ✔ 可以直接落地开发（DB + API + Service + State）
***
# # 1.2 Goal Management（营销目标管理）
***
# 1.2.0 模块总体说明（必须先理解）
## 🎯 Goal Management 是什么？
Goal Management 是 Campaign Planning System 的：
> 🧠 “战略入口层（Strategic Entry Point）”
所有营销活动都必须从 Goal 出发。
***
## 📌 为什么必须有 Goal？
如果没有 Goal，会导致：
* Campaign 变成“零散活动”
* AI Planner 无法做全局优化
* Budget 无法统一分配
* ROI 无法回溯到目标层
***
## 🧠 Goal 的本质
> Goal = “可量化的营销目标 + 时间约束 + KPI约束 + 策略约束”
***
# 1.2.1 Goal 数据模型（数据库设计）
***
## 1.2.1.1 主表：campaign\_goal
```
SQL
CREATE TABLE campaign_goal (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    goal_type VARCHAR(32) NOT NULL,
    -- REVENUE / RETENTION / ACQUISITION / ENGAGEMENT
    status VARCHAR(32) NOT NULL,
    -- DRAFT / ACTIVE / PAUSED / COMPLETED / ARCHIVED
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    created_by VARCHAR(64),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```
***
## 📌 说明
这个表是 Goal 的“核心容器”：
* 一个 Workspace 可以有多个 Goal
* 但同一时间只能有一个 ACTIVE 主 Goal（强约束）
***
## 1.2.1.2 Goal KPI 表（关键）
```
SQL
CREATE TABLE campaign_goal_kpi (
    id VARCHAR(64) PRIMARY KEY,
    goal_id VARCHAR(64),
    kpi_type VARCHAR(32),
    -- REVENUE / CONVERSION / RETENTION / ROI
    target_value DECIMAL(18,4),
    current_value DECIMAL(18,4),
    weight DECIMAL(5,2),
    updated_at TIMESTAMP
);
```
***
## 📌 说明
Goal 不是单指标，而是：
> ✔ 多 KPI 组合目标（multi-objective optimization）
***
## 1.2.1.3 Goal Version（版本控制）
```
SQL
CREATE TABLE campaign_goal_version (
    id VARCHAR(64) PRIMARY KEY,
    goal_id VARCHAR(64),
    version INT,
    snapshot JSONB,
    created_at TIMESTAMP
);
```
***
## 📌 说明
用于：
* Goal 回滚
* AI Planner replay
* What-if simulation
***
# 1.2.2 Goal 生命周期（状态机设计）
***
## 状态定义
```
DRAFT → ACTIVE → PAUSED → COMPLETED → ARCHIVED
```
***
## 状态说明
| 状态        | 说明            |
| --------- | ------------- |
| DRAFT     | 目标草稿          |
| ACTIVE    | 正在驱动 Campaign |
| PAUSED    | 暂停执行          |
| COMPLETED | 已完成           |
| ARCHIVED  | 历史归档          |
***
## 状态约束规则
```
- ACTIVE goal per workspace = 1
- ACTIVE goal cannot be deleted
- COMPLETED goal becomes read-only
```
***
# 1.2.3 Java Service 设计（可直接实现）
***
## 1.2.3.1 GoalService（核心服务）
```
Java
public class GoalService {
    private GoalRepository goalRepo;
    private GoalKpiRepository kpiRepo;
```
***
### 创建 Goal
```
Java
public Goal createGoal(CreateGoalRequest req) {
    Goal goal = new Goal();
    goal.setId(UUID.randomUUID().toString());
    goal.setWorkspaceId(req.getWorkspaceId());
    goal.setName(req.getName());
    goal.setGoalType(req.getGoalType());
    goal.setStatus("DRAFT");
    return goalRepo.save(goal);
}
```
***
## 📌 说明
创建 Goal 是系统的“战略起点”，但不触发执行。
***
### 激活 Goal（关键逻辑）
```
Java
public void activateGoal(String goalId) {
    Goal goal = goalRepo.findById(goalId);
    // 1. 关闭其他 ACTIVE goal
    goalRepo.deactivateAll(goal.getWorkspaceId());
    // 2. 激活当前 goal
    goal.setStatus("ACTIVE");
    goalRepo.save(goal);
}
```
***
## 📌 说明（非常关键）
👉 一个 workspace 只能有一个 active goal\
👉 这是 AI Planner 的唯一“决策锚点”
***
## 更新 KPI
```
Java
public void updateKpi(UpdateKpiRequest req) {
    GoalKpi kpi = kpiRepo.findByGoalId(req.getGoalId());
    kpi.setCurrentValue(req.getValue());
    kpiRepo.save(kpi);
}
```
***
# 1.2.4 Goal Context Service（AI 核心输入）
***
## 作用说明
这个 service 是 AI Planner 的：
> 🧠 “唯一战略输入源”
***
## 实现
```
Java
public class GoalContextService {
    public GoalContext load(String goalId) {
        Goal goal = goalRepo.findById(goalId);
        List<GoalKpi> kpis = kpiRepo.findByGoalId(goalId);
        return new GoalContext(goal, kpis);
    }
}
```
***
## 📌 说明
AI Planner 不直接访问 DB，只能通过这个 context：
* 避免数据污染
* 保证决策一致性
* 支持 replay
***
# 1.2.5 API 设计（前端 + AI 可用）
***
## 创建 Goal
```
http
POST /api/goal/create
```
### Request
```
JSON
{
  "workspaceId": "WS1",
  "name": "Q2 Revenue Growth",
  "goalType": "REVENUE"
}
```
***
## 激活 Goal
```
http
POST /api/goal/{goalId}/activate
```
***
## 更新 KPI
```
http
POST /api/goal/kpi/update
```
***
## 获取 Goal Context（AI用）
```
http
GET /api/goal/{goalId}/context
```
***
# 1.2.6 Goal 在系统中的位置（核心逻辑）
***
```
Workspace
   ↓
Goal (ACTIVE)
   ↓
AI Planner
   ↓
Opportunity Engine
   ↓
Decision Engine
   ↓
Campaign Strategy
```
***
## 📌 关键点
👉 Goal 是整个系统的：
> 🧠 “唯一优化目标函数（Objective Function）”
***
# 1.2.7 Goal 与 AI Planner 的关系（非常关键）
***
## AI 输入必须是：
```
JSON
{
  "goal": {
    "type": "REVENUE",
    "kpis": [
      {
        "type": "REVENUE",
        "target": 1000000
      }
    ]
  }
}
```
***
## AI 不允许：
* 自己定义目标
* 修改 goal\_type
* 跨 goal 推理
***
# ✔ 本章总结（工程视角）
这一章你已经得到：
### ✔ Goal 完整数据库结构
### ✔ Goal 生命周期状态机
### ✔ Goal 核心 Service
### ✔ Goal API
### ✔ Goal → AI Planner 输入契约
### ✔ Goal 在系统中的“唯一战略锚点”
***
# 下一步（继续就是核心决策层）
如果你继续，我下一章会写：
> 👉 **1.3 Initiative Management（营销举措管理）**
那一章会开始进入：
* Campaign grouping
* Initiative DAG
* Budget inheritance
* Multi-goal coordination
也就是从“目标”进入“策略结构层”。
好，这一节我按你要的标准升级：**不是“模块说明”，而是“可以直接建系统的工程规格说明”**，并且每个部分都会补齐：
* 👉 这个功能是干什么的（业务本质）
* 👉 为什么需要它（设计动机）
* 👉 怎么落地（数据 + 服务 + API + 规则）
* 👉 关键约束（避免系统跑偏）
***
# # 1.3 Initiative Management（营销举措管理）
***
# 1.3.0 模块总体说明（必须先理解）
***
## 🎯 Initiative 是什么？
Initiative（营销举措）是介于：
> Goal（战略目标） 和 Campaign（具体活动）之间的“结构化承载层”
***
## 📌 一句话理解
> Initiative = “为了实现一个 Goal，而组织的一组相关 Campaign 的逻辑集合”
***
## 🧠 为什么必须有 Initiative？
如果没有 Initiative，会出现三个严重问题：
### ❌ 1. Campaign 变成碎片化执行
所有 Campaign 直接挂 Goal → 无结构
### ❌ 2. AI 无法做中层优化
只能在 Goal 或 Campaign 两层跳
### ❌ 3. Budget 无法分层管理
只能“Goal级 or Campaign级”，没有中间层
***
## 🧠 Initiative 的本质
> Initiative = “策略分组 + 预算容器 + 执行结构单元”
***
# 1.3.1 数据模型设计（可直接建表）
***
## 1.3.1.1 Initiative 主表
```
SQL
CREATE TABLE campaign_initiative (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    initiative_type VARCHAR(32),
    -- WINBACK_INITIATIVE / GROWTH_INITIATIVE / ENGAGEMENT_INITIATIVE
    status VARCHAR(32),
    -- PLANNED / ACTIVE / PAUSED / COMPLETED / ARCHIVED
    priority INT DEFAULT 100,
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    created_by VARCHAR(64),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```
***
## 📌 说明
Initiative 是：
* Goal 的“结构拆解单元”
* Campaign 的“上层容器”
* AI 决策的“中间优化层”
***
# 1.3.1.2 Initiative ↔ Campaign 关系表
```
SQL
CREATE TABLE initiative_campaign_relation (
    id VARCHAR(64) PRIMARY KEY,
    initiative_id VARCHAR(64),
    campaign_id VARCHAR(64),
    weight DECIMAL(10,4),
    role VARCHAR(32),
    -- PRIMARY / SUPPORTING / EXPERIMENTAL
    created_at TIMESTAMP
);
```
***
## 📌 说明
一个 Initiative 可以包含多个 Campaign：
* 主 Campaign（核心执行）
* 支撑 Campaign（补充触达）
* 实验 Campaign（A/B test）
***
# 1.3.1.3 Initiative KPI 表
```
SQL
CREATE TABLE initiative_kpi (
    id VARCHAR(64) PRIMARY KEY,
    initiative_id VARCHAR(64),
    kpi_type VARCHAR(32),
    target_value DECIMAL(18,4),
    current_value DECIMAL(18,4),
    weight DECIMAL(5,2),
    updated_at TIMESTAMP
);
```
***
## 📌 说明
Initiative 是一个“局部优化目标函数”：
> 它有自己的 KPI，而不是完全继承 Goal
***
# 1.3.2 Initiative 生命周期（状态机）
***
```
PLANNED → ACTIVE → PAUSED → COMPLETED → ARCHIVED
```
***
## 状态说明
| 状态        | 说明            |
| --------- | ------------- |
| PLANNED   | AI 或用户创建但未启用  |
| ACTIVE    | 正在驱动 Campaign |
| PAUSED    | 暂停            |
| COMPLETED | 完成            |
| ARCHIVED  | 归档            |
***
## 关键约束
```
ACTIVE Initiative 必须属于 ACTIVE Goal
```
***
# 1.3.3 Java Service 设计（可实现）
***
## 1.3.3.1 InitiativeService
```
Java
public class InitiativeService {
    private InitiativeRepository initiativeRepo;
```
***
## 创建 Initiative
```
Java
public Initiative create(CreateInitiativeRequest req) {
    Initiative i = new Initiative();
    i.setId(UUID.randomUUID().toString());
    i.setWorkspaceId(req.getWorkspaceId());
    i.setGoalId(req.getGoalId());
    i.setName(req.getName());
    i.setStatus("PLANNED");
    return initiativeRepo.save(i);
}
```
***
## 📌 说明
Initiative 不直接影响执行，只是结构定义。
***
## 激活 Initiative（关键逻辑）
```
Java
public void activate(String initiativeId) {
    Initiative i = initiativeRepo.findById(initiativeId);
    // 校验 goal 必须 ACTIVE
    Goal goal = goalRepo.findById(i.getGoalId());
    if (!goal.isActive()) {
        throw new IllegalStateException("Goal must be ACTIVE");
    }
    i.setStatus("ACTIVE");
    initiativeRepo.save(i);
}
```
***
## 📌 说明
这是系统“安全约束”核心：
> ❗ Initiative 不能脱离 Goal 存在
***
# 1.3.3.2 Campaign 绑定逻辑
```
Java
public void bindCampaign(String initiativeId, String campaignId, String role) {
    InitiativeCampaignRelation rel = new InitiativeCampaignRelation();
    rel.setInitiativeId(initiativeId);
    rel.setCampaignId(campaignId);
    rel.setRole(role);
    relationRepo.save(rel);
}
```
***
## 📌 说明
Initiative 负责：
> 🧠 “组织 Campaign，而不是执行 Campaign”
***
# 1.3.4 Initiative Context Service（AI关键）
***
## 作用
提供 AI Planner 的：
> 🧠 “中层结构上下文”
***
## 实现
```
Java
public class InitiativeContextService {
    public InitiativeContext load(String initiativeId) {
        Initiative i = initiativeRepo.findById(initiativeId);
        List<Campaign> campaigns =
            campaignRepo.findByInitiativeId(initiativeId);
        List<Kpi> kpis = kpiRepo.findByInitiativeId(initiativeId);
        return new InitiativeContext(i, campaigns, kpis);
    }
}
```
***
## 📌 说明
AI Planner 会用它来：
* 判断 Campaign 是否冗余
* 做预算分配
* 做结构优化
***
# 1.3.5 API 设计（前端 + AI）
***
## 创建 Initiative
```
http
POST /api/initiative/create
```
```
JSON
{
  "workspaceId": "WS1",
  "goalId": "G1",
  "name": "Winback Users Q2"
}
```
***
## 激活 Initiative
```
http
POST /api/initiative/{id}/activate
```
***
## 绑定 Campaign
```
http
POST /api/initiative/{id}/bind-campaign
```
```
JSON
{
  "campaignId": "C1",
  "role": "PRIMARY"
}
```
***
## 获取 Initiative Context（AI用）
```
http
GET /api/initiative/{id}/context
```
***
# 1.3.6 Initiative 在系统中的位置（核心）
***
```
Workspace
   ↓
Goal
   ↓
Initiative   ←（本章核心）
   ↓
Campaign
   ↓
Execution System
```
***
## 📌 核心意义
Initiative 是：
> 🧠 “AI做中层结构优化的唯一单位”
***
# 1.3.7 Initiative 与 AI Planner 的关系
***
## AI 输入结构
```
JSON
{
  "initiative": {
    "goal_id": "G1",
    "campaigns": ["C1", "C2"],
    "kpis": [...]
  }
}
```
***
## AI 可以做：
* Campaign 重组
* Budget 重分配
* Campaign 删除/合并建议
***
## AI 不可以：
* 改 Goal
* 直接执行 Campaign
* 跨 Initiative 操作
***
# ✔ 本章总结（工程视角）
你现在得到的是：
### ✔ Initiative 完整数据模型
### ✔ Initiative 生命周期
### ✔ Campaign 组织关系模型
### ✔ Java Service 可实现代码
### ✔ API 可直接接前端
### ✔ AI Context 输入规范
### ✔ 系统分层（Goal → Initiative → Campaign）
***
# 下一步（关键升级点）
如果你继续，我下一章会写：
> 👉 **1.4 Portfolio Management（营销组合管理）**
那一章会进入：
* 跨 Initiative 优化
* 全局 Budget rebalance
* ROI 全局优化
* AI global optimizer
这是：
> 🧠 “真正开始系统级优化层”
好，这一章开始已经进入\*\*系统“全局优化层”\*\*了，我会按你要求继续保持：
* ✔ 业务解释（为什么存在）
* ✔ 功能拆解（做什么）
* ✔ 工程落地（DB / Service / API）
* ✔ 关键规则（避免系统失控）
* ✔ AI如何使用（非常关键）
***
# # 1.4 Portfolio Management（营销组合管理）
***
# 1.4.0 模块总体说明（必须先理解）
***
## 🎯 Portfolio 是什么？
Portfolio（营销组合）是 Campaign Planning 系统中的：
> 🧠 **全局资源分配与优化层（Global Optimization Layer）**
***
## 📌 一句话理解
> Portfolio = “在多个 Goal / Initiative / Campaign 之间做资源最优分配的系统”
***
## 🧠 为什么必须有 Portfolio？
如果没有 Portfolio，会出现：
### ❌ 1. Goal 之间抢预算
每个 Goal 各自优化，导致冲突
### ❌ 2. Initiative 局部最优
每个 Initiative 都“看起来很好”，但整体 ROI 下降
### ❌ 3. Campaign 无全局约束
无法做跨项目资源平衡
***
## 🧠 Portfolio 的本质
> Portfolio = “跨 Initiative 的资源调度与全局收益优化器”
***
# 1.4.1 数据模型设计（可直接建表）
***
# 1.4.1.1 Portfolio 主表
```
SQL
CREATE TABLE campaign_portfolio (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32),
    -- DRAFT / OPTIMIZED / LOCKED / EXECUTING / COMPLETED
    optimization_mode VARCHAR(32),
    -- ROI_MAXIMIZATION / REVENUE_MAXIMIZATION / BALANCED
    start_time TIMESTAMP,
    end_time TIMESTAMP,
    created_by VARCHAR(64),
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```
***
## 📌 说明
Portfolio 是：
> 🧠 一个“优化任务容器”，不是静态结构
***
# 1.4.1.2 Portfolio ↔ Initiative 关系表
```
SQL
CREATE TABLE portfolio_initiative_relation (
    id VARCHAR(64) PRIMARY KEY,
    portfolio_id VARCHAR(64),
    initiative_id VARCHAR(64),
    allocated_budget DECIMAL(18,4),
    expected_roi DECIMAL(10,4),
    priority_weight DECIMAL(10,4),
    created_at TIMESTAMP
);
```
***
## 📌 说明
这是 Portfolio 的核心：
> ✔ 决定每个 Initiative 拿多少钱\
> ✔ 决定资源分配比例\
> ✔ 决定优先级
***
# 1.4.1.3 Portfolio KPI 表
```
SQL
CREATE TABLE portfolio_kpi (
    id VARCHAR(64) PRIMARY KEY,
    portfolio_id VARCHAR(64),
    kpi_type VARCHAR(32),
    target_value DECIMAL(18,4),
    predicted_value DECIMAL(18,4),
    weight DECIMAL(5,2),
    updated_at TIMESTAMP
);
```
***
## 📌 说明
Portfolio KPI 是：
> 🧠 “全局优化目标函数”
***
# 1.4.2 Portfolio 生命周期（状态机）
***
```
DRAFT → OPTIMIZED → LOCKED → EXECUTING → COMPLETED
```
***
## 状态说明
| 状态        | 说明         |
| --------- | ---------- |
| DRAFT     | 未优化        |
| OPTIMIZED | AI 已完成资源分配 |
| LOCKED    | 冻结，不允许修改   |
| EXECUTING | 执行中        |
| COMPLETED | 完成         |
***
## 关键约束
```
LOCKED 后不可修改 allocation
EXECUTING 状态只能追加，不可重分配
```
***
# 1.4.3 Java Service 设计（核心实现）
***
# 1.4.3.1 PortfolioService
```
Java
public class PortfolioService {
    private PortfolioRepository portfolioRepo;
    private PortfolioRelationRepository relationRepo;
```
***
## 创建 Portfolio
```
Java
public Portfolio create(CreatePortfolioRequest req) {
    Portfolio p = new Portfolio();
    p.setId(UUID.randomUUID().toString());
    p.setWorkspaceId(req.getWorkspaceId());
    p.setName(req.getName());
    p.setStatus("DRAFT");
    return portfolioRepo.save(p);
}
```
***
## 📌 说明
Portfolio 创建只是“容器初始化”，不做优化。
***
# 1.4.3.2 Portfolio Optimizer（核心算法入口）
***
```
Java
public Portfolio optimize(String portfolioId) {
    Portfolio p = portfolioRepo.findById(portfolioId);
    List<Initiative> initiatives =
        initiativeRepo.findByWorkspace(p.getWorkspaceId());
    List<Kpi> kpis = kpiRepo.findByPortfolioId(portfolioId);
```
***
## 📌 说明
这里进入系统核心：
> 🧠 “跨 Initiative 全局优化”
***
## 核心优化逻辑（伪代码）
```
Java
Map<String, Double> budgetAllocation = optimizer.solve(
    initiatives,
    kpis,
    constraints
);
```
***
## 📌 说明
optimizer 做的事：
* ROI 最大化
* Budget constraint 满足
* Priority balance
* Risk control
***
## 保存结果
```
Java
for (Map.Entry<String, Double> entry : budgetAllocation.entrySet()) {
    PortfolioInitiativeRelation rel = new PortfolioInitiativeRelation();
    rel.setPortfolioId(portfolioId);
    rel.setInitiativeId(entry.getKey());
    rel.setAllocatedBudget(entry.getValue());
    relationRepo.save(rel);
}
```
***
## 更新状态
```
Java
p.setStatus("OPTIMIZED");
portfolioRepo.save(p);
```
***
# 1.4.4 Portfolio Context Service（AI 输入）
***
## 作用
提供 AI Planner：
> 🧠 “全局资源结构视图”
***
## 实现
```
Java
public class PortfolioContextService {
    public PortfolioContext load(String portfolioId) {
        Portfolio p = portfolioRepo.findById(portfolioId);
        List<InitiativeAllocation> allocations =
            relationRepo.findByPortfolioId(portfolioId);
        List<Kpi> kpis = kpiRepo.findByPortfolioId(portfolioId);
        return new PortfolioContext(p, allocations, kpis);
    }
}
```
***
## 📌 说明
AI Planner 用它做：
* 全局预算重排
* Initiative 合并建议
* ROI最大化调整
***
# 1.4.5 API 设计（前端 + AI）
***
## 创建 Portfolio
```
http
POST /api/portfolio/create
```
```
JSON
{
  "workspaceId": "WS1",
  "name": "Q2 Marketing Portfolio"
}
```
***
## 运行优化
```
http
POST /api/portfolio/{id}/optimize
```
***
## 锁定 Portfolio
```
http
POST /api/portfolio/{id}/lock
```
***
## 获取 Portfolio Context（AI用）
```
http
GET /api/portfolio/{id}/context
```
***
# 1.4.6 Portfolio 在系统中的位置（关键）
***
```
Workspace
   ↓
Goal
   ↓
Initiative
   ↓
Portfolio   ←（本章核心）
   ↓
Campaign
```
***
## 📌 本质
Portfolio 是：
> 🧠 “系统级资源优化器（Global Optimizer）”
***
# 1.4.7 Portfolio 与 AI Planner 的关系
***
## AI 输入结构
```
JSON
{
  "portfolio": {
    "initiatives": [...],
    "budgets": [...],
    "constraints": [...]
  }
}
```
***
## AI 可以做：
* Budget reallocation
* Initiative merge/split
* ROI optimization
* Strategy re-ranking
***
## AI 不可以：
* 修改 Goal
* 修改 Workspace
* 直接触发 Execution
***
# ✔ 本章总结（工程视角）
这一章你已经得到：
### ✔ Portfolio 数据模型（完整可建库）
### ✔ Portfolio 生命周期状态机
### ✔ 跨 Initiative 预算分配逻辑
### ✔ Optimization Service（核心入口）
### ✔ AI Context 输入结构
### ✔ 系统全局优化层设计
***
# 🚀 到这里为止，你的系统已经形成三层核心结构：
```
Goal        → 战略目标层
Initiative  → 策略组织层
Portfolio   → 全局优化层
```
***
# 下一步（真正进入“智能系统核心”）
如果你继续，我下一章会写：
> 👉 **2. Opportunity Intelligence（机会智能系统）**
那一章会进入真正 AI 核心：
* 用户机会发现算法
* churn prediction
* uplift modeling
* opportunity scoring engine
* real AI decision inputs
这一步开始：
> 🧠 系统从“管理系统”进入“智能系统”
好，这一章我会按你要求升级到\*\*“可落地 + 可实现 + 带算法 + 带AI提示词 + 可直接进工程”级别\*\*，不再是概念描述。
目标是：你可以直接用它拆服务、写代码、甚至喂给 Codex 生成模块。
***
# # 2. Opportunity Intelligence（机会智能系统）
***
# 2.0 模块总体说明（必须先理解）
***
## 🎯 Opportunity Intelligence 是什么？
Opportunity Intelligence 是 Campaign Planning 系统中的：
> 🧠 **“用户价值变化与营销机会识别引擎”**
***
## 📌 一句话理解
> Opportunity Intelligence = “预测用户下一步最可能发生的行为 + 哪些行为值得被营销干预”
***
## 🧠 它解决的核心问题
传统营销系统只能回答：
* 用户是谁（User Profile）
* 用户做了什么（History）
但不能回答：
> ❗“现在应该对谁做什么，才最有价值？”
***
## 🧠 Opportunity Intelligence 输出的是：
> ✔ 可执行的“营销机会列表（Opportunity Set）”
***
# 2.1 系统输入（必须明确）
***
## 2.1.1 输入数据结构
```
Member Profile Data
Order History
Behavior Events
Campaign Exposure History
Campaign Conversion History
```
***
## 2.1.2 特征统一模型（Feature Layer）
```
JSON
{
  "member_id": "M1",
  "features": {
    "recency": 12,
    "frequency": 5,
    "monetary": 320,
    "avg_order_value": 64,
    "churn_risk_score": 0.72,
    "engagement_score": 0.45,
    "discount_sensitivity": 0.8
  }
}
```
***
# 2.2 核心算法模块设计
***
# 2.2.1 Churn Prediction Model（流失预测）
***
## 🎯 目标
预测用户是否会流失
***
## 📌 输出
```
P(churn | user)
```
***
## 🧠 模型结构（工程可实现）
### 推荐实现：
* XGBoost / LightGBM
* 或 Logistic Regression baseline
***
## 特征：
* RFM features
* last\_active\_days
* engagement drop trend
* campaign response rate
***
## 公式（逻辑表达）
```
ChurnScore = σ(w1*recency + w2*freq + w3*engagement_drop + w4*discount_dependency)
```
***
## Java调用结构
```
Java
public double predictChurn(MemberFeature feature) {
    return churnModel.predict(feature.toVector());
}
```
***
# 2.2.2 Uplift Modeling（增量价值模型）
***
## 🎯 目标
判断：
> “做营销 vs 不做营销”的差异
***
## 📌 输出
```
Uplift = P(conversion | treatment) - P(conversion | no treatment)
```
***
## 🧠 工程实现方式（推荐）
* Two-model approach
  * Model A: treated users
  * Model B: control users
***
## Java结构
```
Java
public double calculateUplift(MemberFeature f) {
    double treated = modelTreated.predict(f);
    double control = modelControl.predict(f);
    return treated - control;
}
```
***
# 2.2.3 RFM Scoring Engine
***
## 🎯 目标
基础用户价值分层
***
## 模型：
```
RFM Score = f(Recency, Frequency, Monetary)
```
***
## 计算规则：
```
Java
public double rfmScore(Member m) {
    double r = normalize(m.getRecency());
    double f = normalize(m.getFrequency());
    double mScore = normalize(m.getMonetary());
    return 0.3*r + 0.3*f + 0.4*mScore;
}
```
***
# 2.2.4 Engagement Decay Model（行为衰减模型）
***
## 🎯 目标
判断用户活跃衰减趋势
***
## 公式：
```
Engagement(t) = E0 * e^(-λt)
```
***
## Java实现
```
Java
public double engagementDecay(double base, int days) {
    return base * Math.exp(-0.05 * days);
}
```
***
# 2.3 Opportunity Scoring Engine（核心引擎）
***
## 🎯 目标
生成统一机会评分
***
## 公式：
```
OpportunityScore =
    w1 * churnRisk
  + w2 * uplift
  + w3 * rfm
  + w4 * engagementDecay
```
***
## Java实现
```
Java
public double calculateOpportunityScore(MemberFeature f) {
    double churn = churnModel.predict(f);
    double uplift = upliftModel.calculate(f);
    double rfm = rfmModel.score(f);
    double engagement = engagementModel.score(f);
    return 0.3*churn + 0.4*uplift + 0.2*rfm + 0.1*engagement;
}
```
***
# 2.4 Opportunity Generator（机会生成器）
***
## 🎯 目标
输出：
> Opportunity Set（可用于 Campaign Planning）
***
## 输出结构
```
JSON
{
  "member_id": "M1",
  "opportunities": [
    {
      "type": "CHURN_RISK",
      "score": 0.87,
      "recommended_action": "WINBACK_DISCOUNT"
    },
    {
      "type": "UPSELL",
      "score": 0.72,
      "recommended_action": "BUNDLE_OFFER"
    }
  ]
}
```
***
## Java实现
```
Java
public OpportunitySet generate(MemberFeature f) {
    List<Opportunity> list = new ArrayList<>();
    double churn = churnModel.predict(f);
    if (churn > 0.7) {
        list.add(new Opportunity("CHURN", churn, "WINBACK"));
    }
    double uplift = upliftModel.calculate(f);
    if (uplift > 0.6) {
        list.add(new Opportunity("UPSELL", uplift, "UPSELL_OFFER"));
    }
    return new OpportunitySet(f.getMemberId(), list);
}
```
***
# 2.5 AI Planner Prompt（系统级关键设计）
***
# 2.5.1 Prompt 目标
AI 的任务不是“分析数据”，而是：
> 🧠 从 Opportunity Set 中生成 Campaign Strategy
***
# 2.5.2 System Prompt（核心）
```
You are a Marketing Opportunity Intelligence Engine.
Your task:
1. Analyze user opportunity signals
2. Identify actionable marketing opportunities
3. Prioritize based on ROI uplift potential
4. Output structured campaign recommendations
Constraints:
- You must NOT invent user data
- You must ONLY use provided opportunity signals
- You must optimize for ROI and conversion uplift
- You must respect budget constraints
Output format:
- Opportunity ranking
- Recommended campaign type
- Recommended channel
- Expected impact score
```
***
# 2.5.3 User Prompt Template
```
JSON
{
  "member_features": {...},
  "opportunities": [
    {
      "type": "CHURN",
      "score": 0.87
    }
  ],
  "constraints": {
    "budget": 10000,
    "channel": ["EMAIL", "SMS"]
  }
}
```
***
# 2.5.4 AI输出结构
```
JSON
{
  "recommended_campaigns": [
    {
      "type": "WINBACK",
      "priority": 1,
      "channel": "EMAIL",
      "expected_uplift": 0.23
    }
  ]
}
```
***
# 2.6 Java Service 结构（可直接落地）
***
## OpportunityService
```
Java
public class OpportunityService {
    private ChurnModel churnModel;
    private UpliftModel upliftModel;
    private RfmModel rfmModel;
    public OpportunitySet generate(MemberFeature f) {
        double score = calculateOpportunityScore(f);
        return OpportunityBuilder.build(f, score);
    }
}
```
***
# 2.7 API 设计
***
## 生成机会
```
http
POST /api/opportunity/generate
```
***
## 请求
```
JSON
{
  "workspaceId": "WS1",
  "memberId": "M1"
}
```
***
## 返回
```
JSON
{
  "member_id": "M1",
  "opportunities": [...]
}
```
***
# 2.8 系统在整体架构中的位置
***
```
Goal
  ↓
Initiative
  ↓
Portfolio
  ↓
Opportunity Intelligence  ←（本章）
  ↓
Decision Engine
  ↓
Campaign Strategy
```
***
# ✔ 本章总结（工程视角）
你现在得到的是：
### ✔ 完整算法层设计（Churn / Uplift / RFM）
### ✔ 可直接实现 Java scoring engine
### ✔ Opportunity Set 数据结构
### ✔ AI Planner System Prompt
### ✔ 可直接落地 API
### ✔ 系统在整体架构中的位置
***
# 🚀 下一步（如果继续）
下一章我可以直接进入：
> 👉 **3. Marketing Decision Engine（预算 + 仲裁 + 优先级系统）**
这一层会进入：
* Budget Allocation algorithm（线性规划 / greedy / knapsack）
* Attention budget
* Conflict arbitration
* cross-campaign optimization
这一步开始就是：
> 🧠 “真正的决策系统核心层”
很好，这一层已经是整个系统的\*\*“大脑决策核心”\*\*了，不再是分析或生成，而是：
> 🧠 **在资源约束下做“唯一最优选择”的系统**
我会按你要求做到三件事：
* ✔ 讲清楚“它到底在解决什么现实问题”
* ✔ 拆清楚“预算 / 优先级 / 仲裁三大子系统”
* ✔ 给出“可直接落地的算法 + DB + Java实现结构 + 规则细节”
* ✔ 同时说明 AI 如何被约束在这个系统里
***
# # 3. Marketing Decision Engine（营销决策引擎）
***
# 3.0 模块总体说明（必须先理解）
***
## 🎯 Decision Engine 是什么？
Marketing Decision Engine 是 Campaign Planning 系统中的：
> 🧠 **“全局资源冲突解决器 + 最优营销决策生成器”**
***
## 📌 一句话理解
> Decision Engine = “在预算有限、用户有限、渠道有限的情况下，决定**谁该被营销 + 用什么方式 + 花多少钱**”
***
## 🧠 它解决的核心问题
在真实营销系统中，每一刻都在冲突：
* Campaign A 想投这个用户
* Campaign B 也想投这个用户
* Budget 不够
* 用户注意力有限
* 渠道容量有限
***
## ❌ 如果没有 Decision Engine
系统会变成：
* 多 Campaign 并行乱投
* ROI 下降
* 用户疲劳
* 预算失控
* AI 输出无法执行
***
## 🧠 Decision Engine 的本质
> Decision Engine = “多目标约束优化系统（Multi-objective constrained optimizer）”
***
# 3.1 系统输入（必须明确）
***
## 3.1.1 输入对象
```
Opportunity Set（来自 AI）
Campaign Candidates（来自 Planning）
Budget Constraints（来自 Portfolio）
Channel Constraints（来自 Execution）
User Fatigue Model
```
***
## 3.1.2 输入统一模型
```
JSON
{
  "opportunities": [...],
  "campaigns": [...],
  "budget": 100000,
  "constraints": {
    "channel_capacity": {
      "EMAIL": 50000,
      "SMS": 20000
    },
    "max_frequency_per_user": 3
  }
}
```
***
# 3.2 Budget Allocation Engine（预算分配）
***
# 3.2.0 业务本质
预算分配不是“分钱”，而是：
> 🧠 “把有限资源分配给最值得执行的营销机会”
***
# 3.2.1 数学模型（核心）
***
## 目标函数：
```
Maximize:
Σ (Expected ROI_i × Budget_i)
```
***
## 约束：
```
Σ Budget_i ≤ Total Budget
Budget_i ≥ Min Threshold
Channel Capacity Limits
```
***
# 3.2.2 简化工程实现（Greedy + ROI排序）
***
```
Java
public Map<String, Double> allocateBudget(List<CampaignCandidate> campaigns, double totalBudget) {
    // 1. 按 ROI 排序
    campaigns.sort((a, b) -> Double.compare(b.getExpectedROI(), a.getExpectedROI()));
    Map<String, Double> allocation = new HashMap<>();
    double remaining = totalBudget;
    for (CampaignCandidate c : campaigns) {
        double budget = Math.min(c.getRecommendedBudget(), remaining);
        if (budget <= 0) continue;
        allocation.put(c.getId(), budget);
        remaining -= budget;
        if (remaining <= 0) break;
    }
    return allocation;
}
```
***
## 📌 说明
这是一个：
> ✔ 可上线 baseline\
> ✔ 可解释\
> ✔ 可控风险\
> ✔ AI可辅助优化
***
# 3.2.3 高级版本（Knapsack思想）
***
```
maximize ROI subject to budget constraint
```
***
## DP版本（可选增强）
```
Java
dp[i][b] = max ROI using first i campaigns with budget b
```
***
# 3.3 Attention Budget（注意力预算）
***
# 3.3.0 业务本质
不是钱的问题，而是：
> 🧠 “用户不能被无限打扰”
***
## 核心约束
* 每个用户每天最多接收 N 次营销
* 每个渠道有频控
* 每个 Campaign 有曝光上限
***
# 3.3.1 数据模型
```
SQL
CREATE TABLE user_attention_budget (
    user_id VARCHAR(64),
    date DATE,
    max_exposure INT,
    used_exposure INT,
    channel VARCHAR(32),
    PRIMARY KEY(user_id, date, channel)
);
```
***
# 3.3.2 核心算法
```
Java
public boolean canSend(String userId, String channel) {
    AttentionBudget budget = repo.find(userId, channel);
    return budget.getUsed() < budget.getMax();
}
```
***
# 3.3.3 更新逻辑
```
Java
public void consume(String userId, String channel) {
    repo.increment(userId, channel, 1);
}
```
***
# 3.4 Arbitration Engine（冲突仲裁系统）
***
# 3.4.0 业务本质
当多个 Campaign 同时竞争一个资源：
> 🧠 “谁赢？”
***
# 3.4.1 冲突类型
* 用户冲突
* 预算冲突
* 渠道冲突
* 时间冲突
***
# 3.4.2 仲裁规则模型
```
Priority Score =
    0.4 * ROI
  + 0.3 * Opportunity Score
  + 0.2 * Strategic Weight
  + 0.1 * Recency Boost
```
***
# 3.4.3 Java实现
```
Java
public Campaign resolveConflict(List<Campaign> campaigns) {
    return campaigns.stream()
        .max(Comparator.comparingDouble(this::score))
        .orElse(null);
}
```
***
## score函数：
```
Java
private double score(Campaign c) {
    return 0.4 * c.getRoi()
         + 0.3 * c.getOpportunityScore()
         + 0.2 * c.getStrategicWeight()
         + 0.1 * c.getRecencyBoost();
}
```
***
# 3.5 Prioritization Engine（优先级系统）
***
# 3.5.0 业务本质
> 🧠 “决定执行顺序，而不是是否执行”
***
# 3.5.1 排序模型
```
Priority =
    ROI × Opportunity × Time Sensitivity
```
***
# 3.5.2 Java实现
```
Java
public List<Campaign> prioritize(List<Campaign> list) {
    return list.stream()
        .sorted((a, b) ->
            Double.compare(score(b), score(a))
        )
        .collect(Collectors.toList());
}
```
***
# 3.6 Decision Output Model（统一输出）
***
```
JSON
{
  "allocations": [
    {
      "campaign_id": "C1",
      "budget": 30000,
      "priority": 1
    }
  ],
  "rejected_campaigns": [
    {
      "campaign_id": "C9",
      "reason": "LOW_ROI"
    }
  ],
  "conflicts_resolved": 12
}
```
***
# 3.7 AI 在 Decision Engine 中的角色（关键设计）
***
## ❗ AI 不能做：
* 不允许直接分配预算
* 不允许 override arbitration
* 不允许绕过 attention budget
***
## ✔ AI 可以做：
* 提供 ROI 预测
* 提供 opportunity score
* 提供 strategy weight
***
## AI Prompt（约束版）
```
You are a Marketing Decision Support Engine.
You MUST NOT allocate budget directly.
You can only:
- estimate ROI
- estimate opportunity value
- provide scoring signals
Final decision is handled by deterministic engine.
```
***
# 3.8 系统在架构中的位置
***
```
Opportunity Intelligence
        ↓
Marketing Decision Engine   ←（本章核心）
        ↓
Campaign Execution Blueprint
```
***
# ✔ 本章总结（工程视角）
你现在已经得到：
### ✔ 完整预算分配模型（Greedy + DP扩展）
### ✔ Attention Budget 系统（用户疲劳控制）
### ✔ Arbitration Engine（冲突解决核心）
### ✔ Prioritization Engine（排序系统）
### ✔ AI约束机制（防止模型失控）
### ✔ 可直接落地 Java 实现结构
### ✔ 完整输出数据结构
***
# 🚀 下一步（系统已经进入核心闭环）
如果你继续下一章：
> 👉 **4. Simulation & Optimization（预测 + what-if + ROI优化 + 自动生成）**
这一层会是：
* 全局模拟系统
* AI反事实推理
* ROI预测模型
* 自动Campaign生成器（接近 autonomous system）
到这里，你的系统就从：
> 🧠 “决策系统” → “可模拟的智能系统”
很好，这一章已经进入整个系统最“高级的一层”：
> 🧠 **从“决策系统” → “可模拟未来的营销数字孪生系统（Digital Twin）”**
这里的目标不是“做推荐”，而是：
> ❗在执行前，把未来结果先算一遍，并选择最优路径
***
# # 4. Simulation & Optimization（模拟与优化系统）
***
# 4.0 模块总体说明（必须先理解）
***
## 🎯 Simulation & Optimization 是什么？
Simulation & Optimization 是 Campaign Planning 系统中的：
> 🧠 **“未来营销结果预测 + 策略对比 + 自动优化生成引擎”**
***
## 📌 一句话理解
> Simulation Engine = “在不执行任何 Campaign 的情况下，提前模拟执行后的业务结果”
***
## 🧠 它解决的核心问题
现实营销系统的最大问题：
* Campaign 做了才知道效果
* ROI 是滞后反馈
* 资源浪费无法提前避免
***
## ❌ 没有 Simulation 会发生：
* 预算烧完才发现 ROI 不行
* Campaign 冲突上线后才发现用户过载
* AI 推荐无法验证
***
## 🧠 Simulation 的本质
> Simulation = “基于用户行为模型 + 机会模型 + 预算模型的未来状态推演系统”
***
# 4.1 系统输入（必须明确）
***
## 4.1.1 输入统一结构
```
JSON
{
  "campaign_plan": [
    {
      "campaign_id": "C1",
      "audience": "A1",
      "budget": 10000,
      "channel": "EMAIL"
    }
  ],
  "constraints": {
    "budget_total": 100000,
    "time_range": "30d",
    "channel_capacity": {
      "EMAIL": 50000
    }
  },
  "user_population": "segment_snapshot_v12"
}
```
***
# 4.2 Simulation Engine（核心模拟引擎）
***
# 4.2.0 业务本质
Simulation Engine 做的事情是：
> 🧠 “把 Campaign 当作输入变量，把未来用户行为当作输出函数”
***
## 数学表达：
```
Future Outcome =
    f(users, campaigns, budget, constraints)
```
***
# 4.2.1 三层模拟模型结构
***
```
Layer 1: Exposure Model（曝光模型）
Layer 2: Behavior Model（行为模型）
Layer 3: Conversion Model（转化模型）
```
***
# 4.2.2 Exposure Model（曝光模拟）
***
## 🎯 目标
模拟：
> 用户是否会看到这个 Campaign
***
## 公式：
```
P(exposure) = min(channel_capacity, attention_budget)
```
***
## Java实现：
```
Java
public double exposureProbability(User u, Campaign c) {
    double channelCap = channelCapacity.get(c.getChannel());
    double attention = attentionModel.get(u.getId());
    return Math.min(channelCap, attention);
}
```
***
# 4.2.3 Behavior Model（行为模拟）
***
## 🎯 目标
模拟：
> 用户看到后是否会点击 / 参与
***
## 模型：
```
P(click) = sigmoid(w1*offer_strength + w2*user_interest + w3*fatigue)
```
***
## Java实现：
```
Java
public double behaviorProbability(User u, Campaign c) {
    double score =
        0.4 * c.getOfferStrength()
      + 0.3 * u.getInterestScore()
      - 0.3 * u.getFatigueScore();
    return sigmoid(score);
}
```
***
# 4.2.4 Conversion Model（转化模拟）
***
## 🎯 目标
模拟：
> 点击后是否转化（购买 / 任务完成）
***
## 模型：
```
P(conversion) = uplift × intent × offer_match
```
***
## Java实现：
```
Java
public double conversionProbability(User u, Campaign c) {
    return upliftModel.get(u, c)
         * intentModel.get(u)
         * offerMatchModel.get(u, c);
}
```
***
# 4.3 ROI Simulation Engine（核心）
***
## 🎯 目标
计算：
> 每个 Campaign 的预期 ROI
***
## 核心公式：
```
ROI = Revenue - Cost
```
***
## Revenue：
```
Revenue = Σ (P(exposure) × P(click) × P(conversion) × AOV)
```
***
## Java实现：
```
Java
public double simulateROI(Campaign c, List<User> users) {
    double revenue = 0;
    for (User u : users) {
        double pExp = exposureProbability(u, c);
        double pClick = behaviorProbability(u, c);
        double pConv = conversionProbability(u, c);
        revenue += pExp * pClick * pConv * u.getAOV();
    }
    double cost = c.getBudget();
    return revenue - cost;
}
```
***
# 4.4 What-if Simulation（策略对比系统）
***
# 4.4.0 业务本质
> 🧠 “如果我改变预算 / 人群 / 渠道，会发生什么？”
***
## 输入：
* A方案（当前）
* B方案（修改后）
***
## 输出：
* ROI差异
* 转化差异
* 风险差异
***
## Java实现：
```
Java
public SimulationResult compare(Plan A, Plan B) {
    double roiA = simulate(A);
    double roiB = simulate(B);
    return new SimulationResult(roiA, roiB, roiB - roiA);
}
```
***
# 4.5 Optimization Engine（自动优化核心）
***
# 4.5.0 业务本质
> 🧠 “在约束条件下自动生成最优 Campaign Plan”
***
## 优化目标：
```
Maximize ROI
Subject to:
    Budget constraint
    Attention constraint
    Channel capacity
```
***
# 4.5.1 优化方法（工程可落地）
***
## ✔ 方法1：Greedy Optimization（baseline）
```
Java
campaigns.sort(byROI);
select until budget exhausted;
```
***
## ✔ 方法2：Genetic Algorithm（推荐）
```
Initialize population of campaign plans
Evaluate ROI
Select top performers
Crossover + Mutation
Iterate
```
***
## Java伪代码：
```
Java
public Plan optimize(List<Campaign> campaigns) {
    Population pop = initPopulation(campaigns);
    for (int i = 0; i < 50; i++) {
        pop.evaluate(this::simulateROI);
        pop = pop.evolve();
    }
    return pop.best();
}
```
***
# 4.6 Auto Campaign Generation（自动生成系统）
***
# 4.6.0 业务本质
> 🧠 “AI 从机会 + 约束中直接生成 Campaign”
***
# 4.6.1 输入
```
JSON
{
  "opportunities": [...],
  "budget": 10000,
  "constraints": {...}
}
```
***
# 4.6.2 AI System Prompt（关键设计）
```
You are a Marketing Campaign Generation Engine.
Your task:
1. Generate optimal campaign structures
2. Ensure budget constraints are respected
3. Maximize ROI based on provided opportunities
4. Avoid user fatigue and overexposure
Rules:
- Do NOT exceed budget
- Do NOT violate attention constraints
- Do NOT create overlapping campaigns targeting same users excessively
- Prefer high uplift opportunities
Output format:
- campaign plan list
- expected ROI
- target segment mapping
```
***
# 4.6.3 AI 输出结构
```
JSON
{
  "campaigns": [
    {
      "name": "Winback High Value Users",
      "budget": 5000,
      "channel": "EMAIL",
      "expected_roi": 2.3
    }
  ]
}
```
***
# 4.7 系统级数据结构
***
```
SimulationInput
SimulationResult
CampaignPlan
UserBehaviorModel
ROIProjection
OptimizationPlan
```
***
# 4.8 系统在整体架构中的位置
***
```
Marketing Decision Engine
        ↓
Simulation & Optimization   ←（本章核心）
        ↓
Auto Campaign Execution
```
***
# ✔ 本章总结（工程视角）
你现在得到的是：
### ✔ 三层行为模拟模型（曝光 / 行为 / 转化）
### ✔ ROI 计算完整公式
### ✔ What-if 对比系统
### ✔ 优化引擎（Greedy + GA）
### ✔ Auto Campaign Generation（AI Prompt）
### ✔ Java可实现代码结构
### ✔ 完整系统输入输出规范
***
# 🚀 到这里，你的系统已经完成“闭环核心”
你现在拥有：
```
1. Opportunity Intelligence（发现）
2. Decision Engine（决策）
3. Simulation Engine（预测）
4. Execution Engine（执行）
```
***
如果你下一步继续，我可以帮你写：
> 👉 **5. Campaign Execution Engine（执行系统 + 画布 + 工作流 + 状态机 + 幂等 + Saga）**
这一层会是：
* Canvas系统设计
* 节点系统（Node Engine）
* Workflow orchestration
* Event-driven execution
* Exactly-once / retry / compensation
也就是：
> 🧠 真正“能跑起来的系统层”
很好，这一章开始进入整个系统最“工程化”的部分：
> 🧠 **真正把 Campaign 变成“可执行分布式系统”的 Execution Engine**
这里不再是“分析/决策/模拟”，而是：
> ❗**把策略变成可靠执行（Reliable Execution System）**
***
# # 5. Campaign Execution Engine（执行系统）
***
# 5.0 模块总体说明（必须先理解）
***
## 🎯 Execution Engine 是什么？
Campaign Execution Engine 是系统中的：
> 🧠 **“营销执行操作系统（Marketing Runtime OS）”**
***
## 📌 一句话理解
> Execution Engine = “把 Campaign Plan 变成可控、可恢复、可追踪的分布式执行流程”
***
## 🧠 它解决的核心问题
现实营销执行系统的核心问题：
### ❌ 1. 消息发送失败无法恢复
### ❌ 2. 用户重复触达（重复消费）
### ❌ 3. 多渠道执行不同步
### ❌ 4. Campaign 状态不可控
### ❌ 5. 无法回溯执行过程
***
## 🧠 Execution Engine 的本质
> Execution Engine = **“事件驱动 + 状态机 + Saga + 幂等控制 + 工作流引擎”**
***
# 5.1 系统总体架构
***
```
                ┌──────────────────────────────┐
                │     Campaign Canvas UI       │
                │  (Drag / Node / Flow Graph)  │
                └──────────────┬───────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │   Execution Orchestrator     │
                │   (Workflow Engine Layer)    │
                └──────────────┬───────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐
│ Node Engine   │   │ Event Bus        │   │ Saga Manager     │
│ (Task Exec)   │   │ (Kafka / MQ)     │   │ (Compensation)   │
└──────────────┘   └──────────────────┘   └──────────────────┘
        │
        ▼
┌──────────────────────────────────────────┐
│ Channel Adapters (Email / SMS / Push)   │
└──────────────────────────────────────────┘
```
***
# 5.2 Canvas System（画布系统）
***
# 5.2.0 业务本质
Canvas 是：
> 🧠 “Campaign 执行逻辑的可视化编排器”
***
## 📌 一句话理解
> Canvas = “把 Campaign 变成 DAG（有向无环图）执行流程”
***
# 5.2.1 Canvas 数据模型
***
## 5.2.1.1 Campaign Canvas
```
SQL
CREATE TABLE campaign_canvas (
    id VARCHAR(64) PRIMARY KEY,
    campaign_id VARCHAR(64),
    name VARCHAR(255),
    status VARCHAR(32),
    -- DRAFT / PUBLISHED / RUNNING / PAUSED / COMPLETED
    definition JSONB,   -- DAG结构
    created_at TIMESTAMP,
    updated_at TIMESTAMP
);
```
***
## 📌 说明
Canvas 本质是：
> ✔ JSON DAG execution graph
***
# 5.2.2 Node 模型（核心）
***
## 5.2.2.1 Node 定义
```
JSON
{
  "node_id": "N1",
  "type": "AUDIENCE_FILTER",
  "config": {
    "segment": "HIGH_VALUE_USERS"
  },
  "next": ["N2"]
}
```
***
## 支持 Node 类型：
| 类型               | 作用   |
| ---------------- | ---- |
| AUDIENCE\_FILTER | 人群筛选 |
| CONDITION        | 条件判断 |
| DELAY            | 延迟   |
| CHANNEL\_SEND    | 发送   |
| SPLIT            | 分流   |
| MERGE            | 合流   |
| WEBHOOK          | 外部调用 |
***
# 5.2.3 Canvas Execution Flow
***
```
START
  ↓
Audience Filter
  ↓
Condition Node
  ↓
Split Node
  ↓
Channel Send (Email/SMS/Push)
  ↓
END
```
***
# 5.3 Execution Orchestrator（执行调度器）
***
# 5.3.0 业务本质
> 🧠 “负责调度整个 Canvas DAG 执行”
***
# 5.3.1 核心职责
* DAG解析
* 节点调度
* 状态管理
* 并发控制
* 重试机制
***
# 5.3.2 Java核心实现
```
Java
public class ExecutionOrchestrator {
    private NodeEngine nodeEngine;
    private ExecutionStateStore stateStore;
    public void start(String canvasId) {
        Canvas canvas = canvasRepo.find(canvasId);
        ExecutionContext ctx = new ExecutionContext(canvas);
        executeNode(canvas.getStartNode(), ctx);
    }
```
***
## 执行节点
```
Java
private void executeNode(Node node, ExecutionContext ctx) {
    ExecutionState state = stateStore.get(node.getId());
    if (state.isCompleted()) return;
    nodeEngine.execute(node, ctx);
    stateStore.markCompleted(node.getId());
    for (String next : node.getNextNodes()) {
        executeNode(nodeRepo.find(next), ctx);
    }
}
```
***
# 5.4 Node Engine（节点执行引擎）
***
# 5.4.0 业务本质
> 🧠 “每种 Node 类型对应一个可执行 Handler”
***
# 5.4.1 Node Handler 设计
```
Java
public interface NodeHandler {
    void execute(Node node, ExecutionContext ctx);
}
```
***
## Audience Filter Node
```
Java
public class AudienceFilterHandler implements NodeHandler {
    public void execute(Node node, ExecutionContext ctx) {
        List<User> users = audienceService.filter(node.getConfig());
        ctx.setUsers(users);
    }
}
```
***
## Channel Send Node
```
Java
public class ChannelSendHandler implements NodeHandler {
    public void execute(Node node, ExecutionContext ctx) {
        for (User u : ctx.getUsers()) {
            String idempotencyKey = generateKey(u, node);
            if (dedup.exists(idempotencyKey)) continue;
            channelService.send(u, node.getConfig());
            dedup.mark(idempotencyKey);
        }
    }
}
```
***
# 5.5 幂等系统（Idempotency Engine）
***
# 5.5.0 业务本质
> 🧠 “防止重复执行 / 重复发送”
***
# 5.5.1 幂等 Key 设计
```
campaign_id + node_id + user_id + channel
```
***
## 存储结构
```
SQL
CREATE TABLE execution_dedup (
    idempotency_key VARCHAR(255) PRIMARY KEY,
    created_at TIMESTAMP
);
```
***
## Java实现
```
Java
public boolean exists(String key) {
    return repo.existsById(key);
}
```
***
# 5.6 Saga Orchestration（补偿机制）
***
# 5.6.0 业务本质
> 🧠 “保证跨系统执行一致性”
***
# 5.6.1 Saga 状态机
```
INIT → RUNNING → PARTIAL_FAILED → COMPENSATING → COMPLETED
```
***
# 5.6.2 Saga 结构
```
Java
public class SagaStep {
    String stepId;
    Runnable action;
    Runnable compensation;
}
```
***
## 执行 Saga
```
Java
public void executeSaga(List<SagaStep> steps) {
    List<SagaStep> executed = new ArrayList<>();
    for (SagaStep step : steps) {
        try {
            step.action.run();
            executed.add(step);
        } catch (Exception e) {
            for (SagaStep done : executed) {
                done.compensation.run();
            }
            throw e;
        }
    }
}
```
***
# 5.7 Event System（事件驱动）
***
# 5.7.0 业务本质
> 🧠 “所有执行结果必须可追踪”
***
## Event Model
```
JSON
{
  "event_type": "CAMPAIGN_NODE_EXECUTED",
  "campaign_id": "C1",
  "node_id": "N2",
  "user_id": "U1",
  "timestamp": 123456
}
```
***
## Kafka Topic
```
campaign.execution.events
```
***
# 5.8 Channel Adapter Layer
***
## 支持渠道
| Channel  | Adapter           |
| -------- | ----------------- |
| EMAIL    | SMTP / SendGrid   |
| SMS      | Twilio / Provider |
| PUSH     | Firebase          |
| WHATSAPP | API Gateway       |
***
## Interface
```
Java
public interface ChannelAdapter {
    void send(User user, Message msg);
}
```
***
# 5.9 Execution State Machine（核心）
***
```
PENDING
→ RUNNING
→ NODE_EXECUTING
→ NODE_COMPLETED
→ FAILED
→ RETRYING
→ COMPLETED
```
***
# 5.10 Execution Engine 在系统中的位置
***
```
Simulation & Optimization
        ↓
Execution Engine   ←（本章核心）
        ↓
Event System
```
***
# ✔ 本章总结（工程级）
你现在拥有：
### ✔ Canvas DAG 执行模型
### ✔ Node Engine（可扩展执行体系）
### ✔ 幂等系统（防重复执行）
### ✔ Saga 补偿机制（分布式一致性）
### ✔ Event-driven execution（可追踪）
### ✔ Channel Adapter layer（多渠道）
### ✔ Java可落地执行架构
### ✔ 状态机完整设计
***
# 🚀 到这里，你的系统已经进入“可运行系统级别”
你现在的系统已经具备：
```
Planning → Intelligence → Decision → Simulation → Execution
```
***
如果你继续下一章，我建议进入：
> 👉 **6. Event System + Feedback Loop（让系统“变聪明”的关键闭环）**
这一章会让系统从：
> 🧠 “执行系统” → “自我优化系统（self-learning loop）”
很好，这一章开始，你的系统真正从：
> 🧠 **“可执行营销系统” → “自学习营销系统（Self-Learning Marketing OS）”**
***
# # 6. Event System + Feedback Loop（智能闭环系统）
***
# 6.0 模块总体说明（必须先理解）
***
## 🎯 Event System 是什么？
Event System 是整个 Campaign 平台的：
> 🧠 **“全链路行为事实记录层 + 学习数据底座”**
***
## 🎯 Feedback Loop 是什么？
Feedback Loop 是：
> 🧠 **“把执行结果反向输入 AI / 模型 / 决策系统的机制”**
***
## 📌 一句话理解
> Event System + Feedback Loop = “让系统每一次执行都变得更聪明”
***
# 6.1 系统核心目标
***
## 目标1：全链路可追踪
每一个 Campaign：
* 谁被触达
* 是否打开
* 是否点击
* 是否转化
* 是否流失
***
## 目标2：模型持续学习
* ROI模型更新
* uplift模型修正
* churn模型自适应
* decision权重自动调整
***
## 目标3：策略自动进化
* 自动调整 budget allocation
* 自动优化 campaign structure
* 自动淘汰低效策略
***
# 6.2 Event System（事件系统）
***
# 6.2.0 业务本质
> 🧠 “系统所有行为的事实记录流（System of Record for Behavior）”
***
# 6.2.1 事件标准模型（必须统一）
***
```
JSON
{
  "event_id": "E1",
  "event_type": "CAMPAIGN_SENT",
  "timestamp": 123456,
  "campaign_id": "C1",
  "initiative_id": "I1",
  "portfolio_id": "P1",
  "user_id": "U1",
  "channel": "EMAIL",
  "metadata": {
    "template_id": "T1",
    "cost": 0.02
  }
}
```
***
# 6.2.2 Event 类型定义（完整体系）
***
| 类别         | Event                         |
| ---------- | ----------------------------- |
| Execution  | SENT / FAILED / RETRY         |
| Engagement | OPEN / CLICK / VIEW           |
| Conversion | PURCHASE / SUBSCRIBE          |
| Negative   | UNSUBSCRIBE / SPAM\_REPORT    |
| System     | NODE\_EXECUTED / SAGA\_FAILED |
***
# 6.2.3 Event 存储设计
***
## PostgreSQL（结构化）
```
SQL
CREATE TABLE campaign_event (
    event_id VARCHAR(64) PRIMARY KEY,
    event_type VARCHAR(64),
    campaign_id VARCHAR(64),
    user_id VARCHAR(64),
    timestamp TIMESTAMP,
    metadata JSONB
);
```
***
## Kafka（流系统）
```
campaign.event.stream
```
***
# 6.3 Event Processing Pipeline（事件处理流水线）
***
```
Execution Engine
     ↓
Event Producer
     ↓
Kafka Stream
     ↓
Stream Processor
     ↓
Feature Store
     ↓
ML Models / AI Planner
```
***
# 6.3.1 Stream Processor（实时计算）
***
## 功能：
* 实时计算 CTR
* 实时更新 ROI
* 实时更新 fatigue
* 实时更新 churn score
***
## Java（Kafka Consumer）
```
Java
public class EventProcessor {
    public void handle(Event e) {
        if (e.getType().equals("CLICK")) {
            featureStore.incrementCTR(e.getUserId());
        }
        if (e.getType().equals("PURCHASE")) {
            featureStore.updateRevenue(e.getUserId(), e.getMetadata());
        }
    }
}
```
***
# 6.4 Feature Store（特征更新中心）
***
# 6.4.0 业务本质
> 🧠 “模型的实时记忆系统”
***
## 更新内容：
* user engagement score
* churn probability input features
* uplift calibration features
***
## 表结构
```
SQL
CREATE TABLE user_feature_store (
    user_id VARCHAR(64) PRIMARY KEY,
    churn_score DECIMAL,
    engagement_score DECIMAL,
    fatigue_score DECIMAL,
    last_updated TIMESTAMP
);
```
***
# 6.5 Feedback Loop（核心闭环）
***
# 6.5.0 业务本质
> 🧠 “把真实结果反向喂给 AI / Decision Engine / Simulation Engine”
***
# 6.5.1 三层反馈结构
***
## 🔵 Level 1：Execution Feedback
```
Campaign Sent → Open Rate → Click Rate → Conversion Rate
```
***
## 🟡 Level 2：Model Feedback
```
Actual ROI vs Predicted ROI
Uplift Error Correction
Churn Prediction Drift
```
***
## 🔴 Level 3：Strategy Feedback
```
Budget allocation adjustment
Campaign structure change
Channel reweighting
```
***
# 6.5.2 ROI Feedback Correction（关键算法）
***
## 误差计算
```
Error = Actual ROI - Predicted ROI
```
***
## 权重更新
```
Java
public void updateModelWeight(double error) {
    learningRate = 0.01;
    weight = weight + learningRate * error;
}
```
***
# 6.6 AI Self-Learning Loop（核心设计）
***
# 6.6.0 业务本质
> 🧠 “系统自动优化 Decision Engine & Simulation Engine”
***
# 6.6.1 AI输入反馈结构
```
JSON
{
  "campaign_id": "C1",
  "predicted_roi": 2.1,
  "actual_roi": 1.4,
  "user_response": {
    "ctr": 0.12,
    "conversion": 0.03
  }
}
```
***
# 6.6.2 System Prompt（学习型AI）
```
You are a Marketing Optimization Learning Engine.
Your task:
1. Compare predicted vs actual performance
2. Identify deviation patterns
3. Suggest adjustments to:
   - Budget allocation weights
   - Opportunity scoring
   - Campaign targeting rules
Constraints:
- Do NOT change production decisions directly
- Only produce optimization suggestions
- Must be explainable and consistent
```
***
# 6.6.3 AI输出
```
JSON
{
  "adjustments": [
    {
      "component": "budget_allocation_weight",
      "change": "+0.05 to ROI factor"
    },
    {
      "component": "churn_model",
      "change": "increase weight on engagement decay"
    }
  ]
}
```
***
# 6.7 Drift Detection（模型漂移检测）
***
## 目标
检测：
* 用户行为变化
* ROI下降趋势
* 模型失效
***
## 规则：
```
if |predicted - actual| > threshold → drift detected
```
***
## Java实现
```
Java
public boolean detectDrift(double predicted, double actual) {
    return Math.abs(predicted - actual) > 0.2;
}
```
***
# 6.8 Auto Optimization Trigger（自动优化触发）
***
## 触发条件：
* ROI下降
* CTR下降
* Conversion下降
* churn increase
***
## 执行：
```
Trigger:
  → Simulation Engine Re-run
  → Decision Engine Rebalance
  → Portfolio Re-optimize
```
***
# 6.9 系统闭环总图（核心）
***
```
Execution Engine
      ↓
Event System
      ↓
Feature Store
      ↓
ML Models / AI Planner
      ↓
Decision Engine Update
      ↓
Simulation Engine Re-run
      ↓
Execution Engine Adjustment
      ↺ (loop)
```
***
# ✔ 本章总结（工程视角）
你现在已经拥有：
### ✔ 全链路 Event System
### ✔ 实时 Feature Store
### ✔ ROI / Uplift / Churn 反馈机制
### ✔ AI 自学习 Prompt 设计
### ✔ 模型漂移检测
### ✔ 自动优化触发机制
### ✔ 完整闭环架构
***
# 🚀 到这里，你的系统已经不是“营销系统”，而是：
> 🧠 **Self-Optimizing Marketing Operating System（自优化营销操作系统）**
***
如果你继续下一章，我可以帮你写：
> 👉 **7. System Blueprint（完整工程蓝图：Java + JS + DB + MQ + AI 全栈落地结构）**
这一章会把你所有模块：
* 变成微服务架构
* 画出工程目录结构
* 定义 API gateway
* 定义 event schema registry
* 定义 production deployment model
这是：
> 🧠 “从设计 → 直接可以开工写系统”的最后一步
很好，这一章开始我们做一件非常关键的事情：
> 🧠 **把前面 6 大模块全部“工程化收敛”，变成可以直接开仓库写代码的系统蓝图**
不再是设计，而是：
> ❗**可落地的分布式系统工程骨架（Production Blueprint）**
***
# # 7. System Blueprint（完整工程蓝图）
***
# 7.0 系统目标（工程级定义）
***
## 🎯 系统本质
本系统是一个：
> 🧠 **AI 驱动的营销决策 + 执行 + 自学习闭环操作系统（Marketing OS）**
***
## 📌 核心能力边界
系统必须具备：
* ✔ Campaign Planning（策略生成）
* ✔ Decision Engine（资源分配）
* ✔ Simulation Engine（结果预测）
* ✔ Execution Engine（可靠执行）
* ✔ Event Feedback Loop（持续学习）
***
# 7.1 总体架构（微服务级）
***
```
                     ┌────────────────────────────┐
                     │       Frontend (JS)        │
                     │ React + Canvas + Dashboard │
                     └─────────────┬──────────────┘
                                   │
                         API Gateway (Spring Cloud Gateway)
                                   │
───────────────────────────────────┼───────────────────────────────────
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        ▼                          ▼                          ▼
┌────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Planning Svc    │     │ Decision Svc     │     │ Execution Svc      │
│ (AI + Strategy) │     │ (Optimization)   │     │ (Workflow Engine)  │
└────────────────┘     └──────────────────┘     └────────────────────┘
        ▼                          ▼                          ▼
┌────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Opportunity Svc │     │ Simulation Svc   │     │ Event Processor    │
│ (AI Scoring)    │     │ (Forecast)       │     │ (Feedback Loop)    │
└────────────────┘     └──────────────────┘     └────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │   Shared Infrastructure  │
                    │ Kafka / Redis / PG / ES  │
                    └──────────────────────────┘
```
***
# 7.2 后端工程结构（Java）
***
```
campaign-platform/
│
├── gateway/
│   └── api-gateway (Spring Cloud Gateway)
│
├── services/
│   ├── planning-service/
│   ├── opportunity-service/
│   ├── decision-service/
│   ├── simulation-service/
│   ├── execution-service/
│   ├── event-service/
│
├── ai-engine/
│   ├── prompt-engine/
│   ├── llm-orchestrator/
│   ├── skill-registry/
│
├── common/
│   ├── event-model/
│   ├── dto/
│   ├── utils/
│
└── infra/
    ├── kafka/
    ├── redis/
    ├── db/
```
***
# 7.3 前端工程结构（JavaScript）
***
```
campaign-ui/
│
├── src/
│   ├── canvas/
│   │   ├── node-editor/
│   │   ├── workflow-renderer/
│   │   ├── toolbar/
│   │
│   ├── pages/
│   │   ├── planning/
│   │   ├── portfolio/
│   │   ├── execution/
│   │
│   ├── services/
│   │   ├── api-client/
│   │   ├── websocket/
│   │
│   ├── store/
│   ├── components/
│
└── package.json
```
***
# 7.4 数据架构（统一模型）
***
## 7.4.1 核心数据库
| 类型             | 技术            |
| -------------- | ------------- |
| Transaction DB | PostgreSQL    |
| Event Store    | Kafka         |
| Cache          | Redis         |
| Analytics      | ClickHouse    |
| Search         | Elasticsearch |
***
## 7.4.2 核心数据域
```
campaign_goal
campaign_initiative
campaign_portfolio
campaign_canvas
campaign_event
campaign_execution_state
user_feature_store
opportunity_set
simulation_result
```
***
# 7.5 MQ 事件体系（核心）
***
## 7.5.1 Kafka Topics
```
campaign.event.execution
campaign.event.user
campaign.event.conversion
campaign.event.feedback
campaign.event.system
```
***
## 7.5.2 Event Schema Registry
```
JSON
{
  "event_type": "CAMPAIGN_SENT",
  "schema_version": "1.0",
  "required_fields": [
    "campaign_id",
    "user_id",
    "timestamp"
  ]
}
```
***
# 7.6 AI Engine 体系（核心）
***
## 7.6.1 AI模块结构
```
AI Engine
│
├── Planner LLM
├── Decision LLM
├── Simulation LLM
├── Optimization LLM
├── Feedback Learning LLM
```
***
## 7.6.2 Prompt Registry（关键）
```
prompt/
├── opportunity_prompt.txt
├── decision_prompt.txt
├── simulation_prompt.txt
├── optimization_prompt.txt
├── feedback_learning_prompt.txt
```
***
## 7.6.3 Planner Prompt（核心示例）
```
You are a Marketing Strategy Planner.
Input:
- Goals
- Opportunities
- Constraints
- Budget
Output:
- Campaign structure
- Initiative grouping
- Expected ROI
Rules:
- Must respect budget constraints
- Must avoid user fatigue
- Must maximize uplift
```
***
# 7.7 Execution Runtime（核心系统）
***
## 7.7.1 Execution Engine Runtime
```
Canvas DAG → Execution Orchestrator → Node Engine → Channel Adapter
```
***
## 7.7.2 Node Registry
```
Java
public interface NodeHandler {
    void execute(Node node, ExecutionContext ctx);
}
```
***
## Node类型
| Node     | 功能   |
| -------- | ---- |
| FILTER   | 人群筛选 |
| DECISION | 条件判断 |
| SPLIT    | 分流   |
| SEND     | 渠道发送 |
| DELAY    | 延迟   |
| WEBHOOK  | 外部调用 |
***
# 7.8 API Gateway（统一入口）
***
## 7.8.1 API分组
```
POST /api/planning/*
POST /api/opportunity/*
POST /api/decision/*
POST /api/simulation/*
POST /api/execution/*
POST /api/event/*
```
***
## 示例
```
http
POST /api/decision/optimize
```
***
# 7.9 Java Service 核心骨架
***
## Planning Service
```
Java
public class PlanningService {
    public CampaignPlan generate(PlanningRequest req) {
        OpportunitySet opp = opportunityService.get(req);
        return aiPlanner.generate(opp, req.getBudget());
    }
}
```
***
## Decision Service
```
Java
public class DecisionService {
    public DecisionResult optimize(CampaignPlan plan) {
        return optimizer.run(plan);
    }
}
```
***
## Execution Service
```
Java
public class ExecutionService {
    public void run(String canvasId) {
        orchestrator.start(canvasId);
    }
}
```
***
# 7.10 前端 Canvas（核心UI）
***
## Canvas能力
* drag node
* connect edges
* configure campaign
* preview execution
* simulate result
***
## Node UI
```
[Audience Filter] → [Condition] → [Send Email]
```
***
# 7.11 分布式一致性设计（生产级）
***
## 7.11.1 幂等
```
campaign_id + node_id + user_id
```
***
## 7.11.2 Retry
* exponential backoff
* max retry = 3
***
## 7.11.3 Saga
```
SEND → FAILED → COMPENSATE → RETRY
```
***
## 7.11.4 Exactly-once（核心）
* Kafka + Dedup Table + State Machine
***
# 7.12 系统闭环（最终形态）
***
```
Planning
   ↓
Opportunity
   ↓
Decision Engine
   ↓
Simulation Engine
   ↓
Execution Engine
   ↓
Event System
   ↓
Feedback Loop
   ↓
AI Re-Planning
   ↺
```
***
# ✔ 本章总结（工程收敛）
这一章你已经得到：
### ✔ 完整微服务架构
### ✔ Java + JS 工程目录结构
### ✔ Kafka 事件体系
### ✔ AI Prompt Registry
### ✔ Canvas UI系统结构
### ✔ Execution Runtime设计
### ✔ 分布式一致性方案
### ✔ 可直接开仓库的 blueprint
***
# 🚀 到这里，你的系统已经完整闭环
这是一个：
> 🧠 **AI-Native Marketing Operating System（可运行级别架构）**
***
# 如果你下一步继续，我建议：
我可以帮你做最后一层升级（非常关键）：
> 👉 **8. Production Hardening（生产级强化：性能 / 容灾 / 成本 / 多租户 / SLA / 安全）**
这一章会把系统从：
> “能跑” → “能在大规模企业稳定运行”
你这个点其实是对的，而且是**这套系统能不能“真做出来”的关键缺口**。
前面我们讲的是：
* 后端分布式架构
* AI 决策系统
* Execution Engine
但你现在缺的是两块**真正决定产品是否可落地的“产品层核心”**：
> ❗1. 前端 Canvas 组件体系（不是页面，是可运行的编辑器系统）\
> ❗2. 流程控制组件（Flow Control Runtime Model）
这两个东西决定：
* 运营能不能用
* AI 生成的 plan 能不能执行
* DAG 是否真实可控
下面我补一份**工程级设计（不是概念）**。
***
# # 7.13 Frontend Canvas System（前端画布系统）
***
# 7.13.0 本质定义（必须先理解）
Canvas 不是 UI 页面，而是：
> 🧠 **“营销工作流的可视化编程环境（Visual Programming IDE）”**
类似：
* Apache Airflow UI
* Retool Workflow
* Node-RED
* Figma + BPMN hybrid
***
# 7.13.1 Canvas 前端架构
```
campaign-ui/
│
├── canvas-core/                # 画布核心引擎
│   ├── graph-engine           # DAG模型
│   ├── coordinate-system      # 坐标系统
│   ├── render-engine          # 渲染
│   ├── selection-engine       # 选区/框选
│
├── node-system/               # 节点体系
│   ├── node-registry
│   ├── node-renderer
│   ├── node-config-panel
│
├── edge-system/               # 连线系统
│   ├── edge-router
│   ├── edge-validation
│
├── runtime-preview/           # 运行模拟器
│
├── toolbar/                   # 工具栏
├── minimap/                   # 小地图
├── inspector-panel/          # 右侧属性面板
```
***
# 7.13.2 Canvas 核心数据模型（前端）
***
## Graph Model（核心）
```
TypeScript
type CanvasGraph = {
  nodes: Node[];
  edges: Edge[];
};
```
***
## Node Model（前端）
```
TypeScript
type Node = {
  id: string;
  type: NodeType;
  position: {
    x: number;
    y: number;
  };
  config: Record<string, any>;
  inputs: Port[];
  outputs: Port[];
};
```
***
## Edge Model
```
TypeScript
type Edge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  sourcePort: string;
  targetPort: string;
};
```
***
# 7.13.3 Node 类型体系（关键）
***
## 节点分类（必须系统化）
```
1. Input Nodes
2. Logic Nodes
3. Action Nodes
4. Control Flow Nodes
5. AI Nodes
```
***
## 示例
| 类别      | Node               |
| ------- | ------------------ |
| Input   | Audience Selector  |
| Logic   | Condition          |
| Logic   | Split              |
| Control | Delay              |
| Action  | Send Email         |
| Action  | Send SMS           |
| AI      | Opportunity Scorer |
| AI      | Campaign Generator |
***
# 7.13.4 Canvas Renderer（核心引擎）
***
## 技术选型
* React + SVG / Canvas2D
* 或 WebGL（高性能版本）
* 推荐：**React + SVG + requestAnimationFrame**
***
## 渲染循环
```
TypeScript
function renderLoop() {
  updateNodePositions();
  updateEdges();
  requestAnimationFrame(renderLoop);
}
```
***
## Node Render
```
TypeScript
function NodeView({ node }) {
  return (
    <div
      className="canvas-node"
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`
      }}
    >
      <NodeHeader type={node.type} />
      <NodeBody config={node.config} />
    </div>
  );
}
```
***
# 7.13.5 连接系统（Edge System）
***
## 关键能力
* 拖拽连线
* 自动吸附 port
* 校验连接合法性
* 防循环（DAG constraint）
***
## Edge 创建逻辑
```
TypeScript
function connect(source, target) {
  if (createsCycle(source, target)) {
    throw new Error("Cycle not allowed in DAG");
  }
  edges.push({
    sourceNodeId: source.nodeId,
    targetNodeId: target.nodeId
  });
}
```
***
# 7.13.6 DAG 校验器（非常关键）
***
## 防止非法流程
```
TypeScript
function validateDAG(graph) {
  if (hasCycle(graph)) {
    throw new Error("Invalid DAG: cycle detected");
  }
  if (hasOrphanNodes(graph)) {
    throw new Error("Invalid DAG: orphan nodes exist");
  }
}
```
***
# 7.13.7 Inspector Panel（配置系统）
***
## 功能
点击 node 后：
* 编辑 AI prompt
* 配置 audience
* 配置 channel
* 配置 budget
* 配置 condition rule
***
## UI结构
```
[Node Config]
  ├── Basic Settings
  ├── AI Prompt Editor
  ├── Input Schema
  ├── Output Schema
  ├── Execution Policy
```
***
# 7.13.8 Runtime Preview（关键能力）
***
## 功能
> 🧠 “在不执行真实 Campaign 的情况下模拟流程运行”
***
## 逻辑
```
TypeScript
function simulate(graph) {
  let context = {};
  for (node of topologicalSort(graph)) {
    context = executeNodeMock(node, context);
  }
  return context;
}
```
***
***
# # 7.14 Flow Control Runtime（流程控制引擎）
***
# 7.14.0 本质定义
Flow Control Runtime 是：
> 🧠 **“控制 Campaign DAG 执行顺序 + 状态 + 分支逻辑的执行内核”**
***
# 7.14.1 Flow Execution Model
***
## 三阶段模型
```
Parse → Schedule → Execute
```
***
# 7.14.2 Flow State Machine
***
```
CREATED
  ↓
VALIDATED
  ↓
READY
  ↓
RUNNING
  ↓
NODE_EXECUTING
  ↓
WAITING (Delay / Event)
  ↓
COMPLETED
  ↓
FAILED
```
***
# 7.14.3 Flow Executor（核心）
***
```
Java
public class FlowExecutor {
    public void execute(Flow flow) {
        List<Node> sorted = topoSort(flow.getGraph());
        for (Node node : sorted) {
            executeNode(node, flow.getContext());
            updateState(node);
        }
    }
}
```
***
# 7.14.4 Conditional Flow（条件流）
***
## IF Node
```
Java
public class ConditionNodeHandler {
    public boolean evaluate(User u, Condition c) {
        return u.getSegment().equals(c.getSegment())
            && u.getScore() > c.getThreshold();
    }
}
```
***
# 7.14.5 Split / Merge Flow（分流/合流）
***
## Split
```
IF condition:
   path A
ELSE:
   path B
```
***
## Merge
```
A ─┐
   ├──→ MERGE → NEXT
B ─┘
```
***
# 7.14.6 Event-driven Flow（非常关键）
***
## Flow 可以被事件中断/触发
```
EVENT:
  USER_PURCHASED → trigger next node
```
***
## 事件驱动执行
```
Java
@EventListener
public void onEvent(CampaignEvent e) {
    flowEngine.resume(e.getFlowId());
}
```
***
# 7.14.7 Flow + Saga 集成
***
## 每个 Flow 自动生成 Saga
```
Node1 → Node2 → Node3
失败：
Node3 fail → rollback Node2 → rollback Node1
```
***
# ✔ 本章补齐后你系统真正完整了
现在你的系统完整具备：
***
## 🧠 前端层（你之前缺的）
* Canvas IDE
* Node Editor
* DAG renderer
* Inspector Panel
* Runtime Preview
***
## ⚙️ 流程层（核心执行逻辑）
* Flow runtime
* DAG scheduler
* Condition engine
* Event trigger flow
* Saga integration
***
# 🚀 最终你得到的是：
```
AI Planning
   ↓
Canvas Design (Frontend)
   ↓
Flow Runtime (Execution logic)
   ↓
Execution Engine (backend)
   ↓
Event System
   ↓
Feedback Loop
```
***
# 如果你下一步要继续，我可以帮你补“最后缺的一块”
> 👉 **8. Production-grade Canvas + Flow Engine（性能优化 + 大规模并发 + 分片执行 + 多租户隔离）**
这一块就是：
* 10万节点 DAG 怎么跑
* 多租户 canvas 怎么隔离
* flow 怎么分片执行
* UI 怎么不卡
* execution 怎么水平扩展
会把系统推到“真正企业级SaaS”级别
很好，这一章就是把你整个系统从“能用”推进到：
> 🧠 **真正能支撑大规模 SaaS（10万 Canvas + 高并发 Flow + 多租户隔离）**
核心不再是“设计”，而是：
> ❗**技术选型 + 分布式拆解 + 性能边界设计**
***
# # 8. Production-grade Canvas + Flow Engine（生产级架构）
***
# 8.0 先说结论（你要的“用什么组件”）
这一层系统的标准工业选型如下：
***
## 🧠 核心组件栈（生产级标准）
| 层级           | 组件                                |
| ------------ | --------------------------------- |
| 前端 Canvas    | React + React Flow / Konva.js     |
| DAG 存储       | PostgreSQL + JSONB                |
| Flow Runtime | Temporal / Zeebe（推荐 Zeebe）        |
| 分布式调度        | Kubernetes + HPA                  |
| 消息系统         | Kafka                             |
| 状态存储         | Redis + PostgreSQL                |
| 分片执行         | Kafka Partition + Tenant Sharding |
| 任务队列         | Kafka / RabbitMQ                  |
| 工作流引擎        | Camunda 8 / Zeebe                 |
| 多租户隔离        | Schema-level + Row-level Security |
| 实时状态         | Redis Streams / WebSocket         |
| 事件存储         | Kafka + ClickHouse                |
***
# # 8.1 Canvas 大规模性能架构
***
## 🎯 问题
Canvas 在大规模场景会遇到：
* 10,000 nodes DAG
* 复杂连线渲染卡顿
* UI 重绘爆炸
* state同步延迟
***
## 🧠 解决方案：前端分层渲染架构
***
### 📌 采用：
> ✔ React + React Flow（基础）\
> ✔ WebWorker（计算 DAG）\
> ✔ Canvas virtualization（节点懒加载）
***
## 架构：
```
UI Thread:
  - render visible nodes only
WebWorker:
  - DAG layout calculation
  - topology sort
  - validation
Backend:
  - full graph storage
```
***
## React Flow + 虚拟化
```
TypeScript
const visibleNodes = useMemo(() => {
  return nodes.filter(n => isInViewport(n.position));
}, [viewport]);
```
***
## WebWorker DAG 计算
```
TypeScript
self.onmessage = (graph) => {
  const sorted = topoSort(graph);
  postMessage(sorted);
};
```
***
# # 8.2 Flow Engine 高并发架构
***
## 🎯 问题
Flow 执行会遇到：
* millions of campaign executions
* node-level fan-out
* retry storms
* state contention
***
# 🧠 标准解法：Zeebe / Temporal
***
## 推荐架构：
> ⭐ Zeebe（Camunda 8）作为 Workflow Runtime
原因：
* 原生 DAG support
* 分布式 job worker
* 可水平扩展
* Kafka-like partitioning
***
## 替代方案：
| 场景       | 方案                    |
| -------- | --------------------- |
| 中小规模     | Camunda 7             |
| 大规模 SaaS | Zeebe                 |
| 超大规模自研   | Kafka + State Machine |
***
# # 8.3 Flow 分片执行（核心设计）
***
## 🎯 核心思想
> ❗Flow 不在单机执行，而是“按 tenant + campaign shard 执行”
***
## 分片规则：
```
Shard Key = hash(tenant_id + campaign_id)
```
***
## Kafka Partition：
```
partition 0 → tenant A campaigns
partition 1 → tenant B campaigns
partition 2 → tenant C campaigns
```
***
## Worker 消费：
```
Java
@KafkaListener(topic = "flow-execution")
public void handle(FlowEvent event) {
    flowExecutor.execute(event.getFlow());
}
```
***
# # 8.4 多租户隔离设计（非常关键）
***
## 🎯 三种隔离模式
***
### ✔ 1. Row-level isolation（推荐默认）
```
SQL
WHERE tenant_id = ?
```
***
### ✔ 2. Schema-level isolation（高安全）
```
tenant_a.campaign
tenant_b.campaign
```
***
### ✔ 3. DB-level isolation（金融级）
```
DB per tenant
```
***
## 推荐组合：
> ✔ SaaS 标准：Row-level + partition + cache isolation
***
# # 8.5 状态存储架构（Flow State）
***
## 🎯 问题
Flow execution state：
* 不能丢
* 不能重复
* 要可恢复
***
## 🧠 方案：三层状态存储
***
### ✔ 1. Redis（实时状态）
```
RUNNING / NODE_ACTIVE
```
***
### ✔ 2. PostgreSQL（持久状态）
```
SQL
flow_execution_state
```
***
### ✔ 3. Kafka Event Log（可回放）
```
FLOW_NODE_EXECUTED
```
***
# # 8.6 Flow 执行架构（最终形态）
***
```
           ┌──────────────┐
           │ Canvas DAG   │
           └──────┬───────┘
                  ▼
       ┌────────────────────┐
       │ Flow Compiler      │
       │ (DAG → Execution)  │
       └──────┬─────────────┘
              ▼
     ┌──────────────────────┐
     │ Zeebe Workflow Engine │
     └──────┬───────────────┘
            ▼
 ┌──────────────────────────┐
 │ Kafka Task Distribution  │
 └──────┬───────────────────┘
        ▼
 ┌──────────────────────────┐
 │ Node Worker Cluster      │
 └──────┬───────────────────┘
        ▼
 ┌──────────────────────────┐
 │ Channel Adapters         │
 └──────────────────────────┘
```
***
# # 8.7 高并发优化策略（核心）
***
## ✔ 1. Node-level 并发
```
Node execution = stateless worker
```
***
## ✔ 2. Campaign-level isolation
```
Each campaign = independent flow instance
```
***
## ✔ 3. Kafka backpressure
```
consumer lag → auto throttle
```
***
## ✔ 4. Redis caching
* audience cache
* segment cache
* feature cache
***
## ✔ 5. Async everything
* no blocking calls in execution engine
***
# # 8.8 Canvas 性能优化（关键）
***
## ✔ 节点渲染优化
* viewport culling
* virtualization
* memoized node rendering
***
## ✔ 连线优化
* bezier cache
* edge batching
***
## ✔ 大图优化策略
```
< 1000 nodes → React Flow
> 1000 nodes → Canvas + WebGL fallback
```
***
# # 8.9 AI + Flow 结合优化（高级）
***
## 🎯 AI 不直接执行 Flow
AI 只做：
* plan generation
* optimization
* reweighting
Flow engine 才是 runtime
***
## AI 输出 → Flow Compiler
```
JSON
{
  "dag": {
    "nodes": [],
    "edges": []
  }
}
```
***
# # 8.10 系统最终工业级栈（总结）
***
## 🧠 前端
* React
* React Flow
* Konva.js
* WebWorker
***
## ⚙️ Flow Runtime
* Zeebe (Camunda 8)
* Kafka (task distribution)
***
## 🧠 Backend
* Spring Boot
* Kafka
* Redis
* PostgreSQL
***
## 📊 Storage
* ClickHouse (analytics)
* Elasticsearch (search)
* Postgres (state)
***
## ☁ Infra
* Kubernetes
* HPA autoscaling
* Istio (optional service mesh)
***
# ✔ 最终结论（工程视角）
你这个系统在生产级已经是：
> 🧠 **AI + Workflow + Event-driven + Multi-tenant SaaS Operating System**
***
# 🚀 如果你继续下一步，我可以帮你做最后一层：
> 👉 **9. Full Production Reference Architecture（可直接给团队开工的“工程施工图级文档”）**
包括：
* service mesh topology
* k8s deployment
* CI/CD pipeline
* failure scenarios
* SLA设计
* cost模型
那一章就是：
> 🧠 “从架构设计 → 直接变成工程施工图”
很好，这一章就是把你整个系统从“能用”推进到：
> 🧠 **真正能支撑大规模 SaaS（10万 Canvas + 高并发 Flow + 多租户隔离）**
核心不再是“设计”，而是：
> ❗**技术选型 + 分布式拆解 + 性能边界设计**
***
# # 8. Production-grade Canvas + Flow Engine（生产级架构）
***
# 8.0 先说结论（你要的“用什么组件”）
这一层系统的标准工业选型如下：
***
## 🧠 核心组件栈（生产级标准）
| 层级           | 组件                                |
| ------------ | --------------------------------- |
| 前端 Canvas    | React + React Flow / Konva.js     |
| DAG 存储       | PostgreSQL + JSONB                |
| Flow Runtime | Temporal / Zeebe（推荐 Zeebe）        |
| 分布式调度        | Kubernetes + HPA                  |
| 消息系统         | Kafka                             |
| 状态存储         | Redis + PostgreSQL                |
| 分片执行         | Kafka Partition + Tenant Sharding |
| 任务队列         | Kafka / RabbitMQ                  |
| 工作流引擎        | Camunda 8 / Zeebe                 |
| 多租户隔离        | Schema-level + Row-level Security |
| 实时状态         | Redis Streams / WebSocket         |
| 事件存储         | Kafka + ClickHouse                |
***
# # 8.1 Canvas 大规模性能架构
***
## 🎯 问题
Canvas 在大规模场景会遇到：
* 10,000 nodes DAG
* 复杂连线渲染卡顿
* UI 重绘爆炸
* state同步延迟
***
## 🧠 解决方案：前端分层渲染架构
***
### 📌 采用：
> ✔ React + React Flow（基础）\
> ✔ WebWorker（计算 DAG）\
> ✔ Canvas virtualization（节点懒加载）
***
## 架构：
```
UI Thread:
  - render visible nodes only
WebWorker:
  - DAG layout calculation
  - topology sort
  - validation
Backend:
  - full graph storage
```
***
## React Flow + 虚拟化
```
TypeScript
const visibleNodes = useMemo(() => {
  return nodes.filter(n => isInViewport(n.position));
}, [viewport]);
```
***
## WebWorker DAG 计算
```
TypeScript
self.onmessage = (graph) => {
  const sorted = topoSort(graph);
  postMessage(sorted);
};
```
***
# # 8.2 Flow Engine 高并发架构
***
## 🎯 问题
Flow 执行会遇到：
* millions of campaign executions
* node-level fan-out
* retry storms
* state contention
***
# 🧠 标准解法：Zeebe / Temporal
***
## 推荐架构：
> ⭐ Zeebe（Camunda 8）作为 Workflow Runtime
原因：
* 原生 DAG support
* 分布式 job worker
* 可水平扩展
* Kafka-like partitioning
***
## 替代方案：
| 场景       | 方案                    |
| -------- | --------------------- |
| 中小规模     | Camunda 7             |
| 大规模 SaaS | Zeebe                 |
| 超大规模自研   | Kafka + State Machine |
***
# # 8.3 Flow 分片执行（核心设计）
***
## 🎯 核心思想
> ❗Flow 不在单机执行，而是“按 tenant + campaign shard 执行”
***
## 分片规则：
```
Shard Key = hash(tenant_id + campaign_id)
```
***
## Kafka Partition：
```
partition 0 → tenant A campaigns
partition 1 → tenant B campaigns
partition 2 → tenant C campaigns
```
***
## Worker 消费：
```
Java
@KafkaListener(topic = "flow-execution")
public void handle(FlowEvent event) {
    flowExecutor.execute(event.getFlow());
}
```
***
# # 8.4 多租户隔离设计（非常关键）
***
## 🎯 三种隔离模式
***
### ✔ 1. Row-level isolation（推荐默认）
```
SQL
WHERE tenant_id = ?
```
***
### ✔ 2. Schema-level isolation（高安全）
```
tenant_a.campaign
tenant_b.campaign
```
***
### ✔ 3. DB-level isolation（金融级）
```
DB per tenant
```
***
## 推荐组合：
> ✔ SaaS 标准：Row-level + partition + cache isolation
***
# # 8.5 状态存储架构（Flow State）
***
## 🎯 问题
Flow execution state：
* 不能丢
* 不能重复
* 要可恢复
***
## 🧠 方案：三层状态存储
***
### ✔ 1. Redis（实时状态）
```
RUNNING / NODE_ACTIVE
```
***
### ✔ 2. PostgreSQL（持久状态）
```
SQL
flow_execution_state
```
***
### ✔ 3. Kafka Event Log（可回放）
```
FLOW_NODE_EXECUTED
```
***
# # 8.6 Flow 执行架构（最终形态）
***
```
           ┌──────────────┐
           │ Canvas DAG   │
           └──────┬───────┘
                  ▼
       ┌────────────────────┐
       │ Flow Compiler      │
       │ (DAG → Execution)  │
       └──────┬─────────────┘
              ▼
     ┌──────────────────────┐
     │ Zeebe Workflow Engine │
     └──────┬───────────────┘
            ▼
 ┌──────────────────────────┐
 │ Kafka Task Distribution  │
 └──────┬───────────────────┘
        ▼
 ┌──────────────────────────┐
 │ Node Worker Cluster      │
 └──────┬───────────────────┘
        ▼
 ┌──────────────────────────┐
 │ Channel Adapters         │
 └──────────────────────────┘
```
***
# # 8.7 高并发优化策略（核心）
***
## ✔ 1. Node-level 并发
```
Node execution = stateless worker
```
***
## ✔ 2. Campaign-level isolation
```
Each campaign = independent flow instance
```
***
## ✔ 3. Kafka backpressure
```
consumer lag → auto throttle
```
***
## ✔ 4. Redis caching
* audience cache
* segment cache
* feature cache
***
## ✔ 5. Async everything
* no blocking calls in execution engine
***
# # 8.8 Canvas 性能优化（关键）
***
## ✔ 节点渲染优化
* viewport culling
* virtualization
* memoized node rendering
***
## ✔ 连线优化
* bezier cache
* edge batching
***
## ✔ 大图优化策略
```
< 1000 nodes → React Flow
> 1000 nodes → Canvas + WebGL fallback
```
***
# # 8.9 AI + Flow 结合优化（高级）
***
## 🎯 AI 不直接执行 Flow
AI 只做：
* plan generation
* optimization
* reweighting
Flow engine 才是 runtime
***
## AI 输出 → Flow Compiler
```
JSON
{
  "dag": {
    "nodes": [],
    "edges": []
  }
}
```
***
# # 8.10 系统最终工业级栈（总结）
***
## 🧠 前端
* React
* React Flow
* Konva.js
* WebWorker
***
## ⚙️ Flow Runtime
* Zeebe (Camunda 8)
* Kafka (task distribution)
***
## 🧠 Backend
* Spring Boot
* Kafka
* Redis
* PostgreSQL
***
## 📊 Storage
* ClickHouse (analytics)
* Elasticsearch (search)
* Postgres (state)
***
## ☁ Infra
* Kubernetes
* HPA autoscaling
* Istio (optional service mesh)
***
# ✔ 最终结论（工程视角）
你这个系统在生产级已经是：
> 🧠 **AI + Workflow + Event-driven + Multi-tenant SaaS Operating System**
***
# 🚀 如果你继续下一步，我可以帮你做最后一层：
> 👉 **9. Full Production Reference Architecture（可直接给团队开工的“工程施工图级文档”）**
包括：
* service mesh topology
* k8s deployment
* CI/CD pipeline
* failure scenarios
* SLA设计
* cost模型
那一章就是：
> 🧠 “从架构设计 → 直接变成工程施工图”
可以用，但要先把话说清楚：**什么时候必须用，什么时候反而不该用**。否则很容易变成“架构很好看，但系统跑不动”。
***
# # 结论先说
## ✅ 建议使用 Zeebe / Camunda 8（优先 Zeebe）
但条件是：
> ✔ 你已经明确要做“长期运行 + 多流程 + 高可靠 + 可观测”的生产级 Workflow 系统\
> ✔ Campaign Execution 是核心业务，不只是辅助逻辑\
> ✔ 未来要做 SaaS / 多租户 / 高并发
***
# # 1. 为什么这个系统“适合 Zeebe”
你这个 Campaign Execution Engine 本质是：
> 🧠 **长期运行的 DAG Workflow + 状态机 + 人群分发 + 多步骤节点执行**
它天然具备：
### ✔ 长流程
* Campaign 可能运行 1h / 7d / 30d
### ✔ 强状态
* 每个 node 都有状态
* user-level execution state
### ✔ 分布式任务
* send email / sms / push
* AI scoring
* segmentation
### ✔ 失败可恢复
* retry
* compensation (Saga)
👉 这些都是 Zeebe 的设计核心场景
***
# # 2. Zeebe / Camunda 能帮你解决什么（关键）
## 🧠 2.1 Flow orchestration（最关键）
你不用自己写：
* DAG scheduler
* retry logic
* state persistence
* timeout handling
Zeebe 直接提供：
```
BPMN / Workflow Definition → Engine 自动执行
```
***
## 🧠 2.2 State persistence（强项）
你现在的：
* flow\_state table
* node\_state
* execution tracking
👉 Zeebe 全部内建
***
## 🧠 2.3 分布式 worker 模型
```
Workflow Engine → Job → Worker → Complete
```
天然适合：
* email service
* sms service
* AI planner
* segmentation engine
***
## 🧠 2.4 可观测性（非常关键）
Camunda Operate：
* flow trace
* node execution timeline
* failure replay
👉 这对“营销系统”非常重要
***
# # 3. 什么时候**不该用 Zeebe**
这是更重要的部分：
***
## ❌ 不适合的情况
### 1. 你还在快速迭代 MVP
* workflow 经常变
* node 逻辑频繁调整
👉 Zeebe BPMN 会变成负担
***
### 2. Flow 逻辑完全 AI 驱动
* 每次 execution 都动态生成 DAG
👉 Zeebe 不擅长“动态 graph”
***
### 3. 你还没有稳定 node system
Zeebe 假设：
> workflow 是“预定义模型”
但你系统是：
> AI + Canvas 动态生成 flow
***
# # 4. 你的系统的最佳使用方式（重点）
你这个系统**正确架构是混合模式**：
***
## 🧠 推荐架构（非常重要）
```
Canvas (AI生成 DAG)
        ↓
Flow Compiler（你自己写）
        ↓
Zeebe Workflow Engine
        ↓
Workers (Java Services)
        ↓
Event System
```
***
# # 5. 关键设计：Zeebe 在你系统中的位置
***
## ❗ Zeebe 不负责：
* Canvas
* AI Planning
* Simulation
* Opportunity scoring
***
## ✔ Zeebe 只负责：
> 🧠 **“Execution Runtime（执行层）”**
***
## 对应关系：
| 模块               | 是否交给 Zeebe |
| ---------------- | ---------- |
| Campaign DAG执行   | ✔ 是        |
| Node调度           | ✔ 是        |
| Retry / Failover | ✔ 是        |
| Compensation     | ✔ 是        |
| AI Planner       | ❌ 否        |
| Canvas生成         | ❌ 否        |
| Simulation       | ❌ 否        |
***
# # 6. Node 如何映射 Zeebe（关键）
***
## 你的 Node：
```
JSON
{
  "type": "SEND_EMAIL",
  "config": {}
}
```
***
## 转成 BPMN Task：
```
Service Task → sendEmailWorker
```
***
## Worker（Java）
```
Java
@JobWorker(type = "send-email")
public void handleSendEmail(final JobClient client, final ActivatedJob job) {
    emailService.send(job.getVariables());
    client.newCompleteCommand(job.getKey()).send().join();
}
```
***
# # 7. Flow Engine vs Zeebe（关键决策）
***
## ❗ 不能同时“全自研 + Zeebe全替代”
必须选：
***
## 🟢 推荐方案（现实可落地）
| 层级                | 方案            |
| ----------------- | ------------- |
| Canvas            | 自研            |
| DAG Compiler      | 自研            |
| Execution Runtime | Zeebe         |
| Workers           | Java services |
| Event system      | 自研            |
***
# # 8. 为什么这个组合是最优解
***
## ✔ 你保留了：
* AI 灵活性（Canvas + Planner）
* 动态 DAG 能力
* 业务可控性
***
## ✔ 你获得：
* 工业级 workflow runtime
* 分布式可靠性
* 可观测性
* retry / saga / state
***
# # 9. 最重要的架构一句话总结
***
> 🧠 **Canvas 是“脑”，Zeebe 是“肌肉”，Event System 是“神经系统”**
***
# # 10. 最终建议（非常明确）
***
## ✔ 应该用 Zeebe，但方式是：
### ❗“Execution-only runtime”
而不是：
### ❌ “全系统 workflow 平台”
***
# 🚀 如果你下一步继续，我可以帮你做：
> 👉 **9. Canvas → BPMN Compiler 设计（AI生成 DAG 如何转 Zeebe workflow）**
这一层是整个系统最关键的桥：
> 🧠 “AI生成的营销策略 → 变成可执行 workflow”
这一步做完，你系统就真的可以“端到端运行”了。
很好，这一层是你整个系统的**真正“落地分水岭”**：
> 🧠 AI 生成的是“自由 DAG”\
> ⚙ Zeebe 只能执行“结构化 BPMN Workflow”
所以你必须有一个：
> ❗**Canvas → BPMN Compiler（语义编译器）**
它负责把：
```
AI Plan / Canvas DAG  →  可执行 BPMN (Zeebe)
```
***
# # 9. Canvas → BPMN Compiler（设计级实现）
***
# 9.0 核心问题定义
***
## 🧠 输入（Canvas DAG）
```
JSON
{
  "nodes": [
    { "id": "n1", "type": "AUDIENCE_FILTER" },
    { "id": "n2", "type": "AI_SCORE" },
    { "id": "n3", "type": "SEND_EMAIL" }
  ],
  "edges": [
    { "from": "n1", "to": "n2" },
    { "from": "n2", "to": "n3" }
  ]
}
```
***
## ⚙ 输出（Zeebe BPMN）
```
Start → ServiceTask(AUDIENCE_FILTER)
      → ServiceTask(AI_SCORE)
      → ServiceTask(SEND_EMAIL)
      → End
```
***
# # 9.1 Compiler 总体架构
***
```
Canvas DAG
     ↓
[1] Semantic Analyzer
     ↓
[2] Flow Normalizer
     ↓
[3] BPMN Graph Builder
     ↓
[4] Zeebe BPMN Generator
     ↓
[5] Worker Binding Registry
```
***
# # 9.2 核心设计：Node → BPMN Mapping
***
## 🧠 Node类型系统（关键）
```
INPUT NODES:
- AudienceFilter
- EventTrigger
LOGIC NODES:
- Condition
- Split
- Merge
AI NODES:
- OpportunityScoring
- CampaignOptimization
ACTION NODES:
- SendEmail
- SendSMS
- PushNotification
CONTROL NODES:
- Delay
- WaitForEvent
```
***
# # 9.3 BPMN 映射规则（核心规则引擎）
***
## ✔ 规则1：单节点 = Service Task
```
Canvas Node → BPMN ServiceTask
```
```
XML
<bpmn:serviceTask id="AI_SCORE" name="AI Score">
```
***
## ✔ 规则2：条件节点 → Exclusive Gateway
```
Condition Node → XOR Gateway
```
```
XML
<bpmn:exclusiveGateway id="gw1"/>
```
***
## ✔ 规则3：分流 → Parallel Gateway
```
Split Node → Parallel Gateway
```
***
## ✔ 规则4：等待 → Timer/Event Subprocess
```
Delay Node → Timer Event
```
***
# # 9.4 Compiler 核心类设计（Java）
***
## 9.4.1 Compiler入口
```
Java
public class CanvasToBpmnCompiler {
    public BpmnDefinition compile(CanvasGraph graph) {
        FlowGraph normalized = flowNormalizer.normalize(graph);
        BpmnGraph bpmn = graphBuilder.build(normalized);
        return bpmnGenerator.generate(bpmn);
    }
}
```
***
# # 9.5 Semantic Analyzer（语义分析器）
***
## 🧠 作用
把“画布节点”变成：
> ✔ 可执行语义模型（Execution Semantics Graph）
***
## 校验逻辑：
```
Java
public void validate(CanvasGraph graph) {
    assertNoOrphanNodes(graph);
    assertDAG(graph);
    assertValidNodeTypes(graph);
    assertAllNodesHaveMapping(graph);
}
```
***
# # 9.6 Flow Normalizer（非常关键）
***
## 🧠 作用
Canvas DAG → 标准 Execution DAG
处理：
* 多入口
* 多出口
* 非标准连接
* AI生成乱结构
***
## 逻辑：
```
Java
public FlowGraph normalize(CanvasGraph graph) {
    graph = removeCycles(graph);
    graph = addStartEndNodes(graph);
    graph = flattenSubgraphs(graph);
    return graph;
}
```
***
# # 9.7 BPMN Graph Builder
***
## 🧠 作用
将 DAG 转为 BPMN Graph Model
***
## 核心结构：
```
Node → BPMN Element
Edge → Sequence Flow
Branch → Gateway
```
***
## 示例：
```
Java
BpmnNode node = new BpmnNode();
node.setType("serviceTask");
node.setId(canvasNode.getId());
node.setWorker(mapping.getWorker(canvasNode.type));
```
***
# # 9.8 BPMN Generator（Zeebe输出）
***
## 输出 XML（Zeebe格式）
```
XML
<bpmn:process id="campaign_flow">
  <bpmn:startEvent id="start"/>
  <bpmn:serviceTask id="AUDIENCE_FILTER"
      zeebe:taskDefinition type="audience-filter"/>
  <bpmn:serviceTask id="AI_SCORE"
      zeebe:taskDefinition type="ai-score"/>
  <bpmn:serviceTask id="SEND_EMAIL"
      zeebe:taskDefinition type="send-email"/>
  <bpmn:endEvent id="end"/>
</bpmn:process>
```
***
# # 9.9 Worker Binding Registry（关键）
***
## 🧠 作用
Canvas Node → Zeebe Worker 映射
***
```
Java
public class WorkerRegistry {
    Map<String, String> mapping = Map.of(
        "AUDIENCE_FILTER", "audience-filter-worker",
        "AI_SCORE", "ai-score-worker",
        "SEND_EMAIL", "email-worker"
    );
}
```
***
# # 9.10 AI Node 特殊处理（关键）
***
## 🧠 AI Node 不直接执行
必须拆成：
### ✔ Step 1：Request AI Service
### ✔ Step 2：Persist result
### ✔ Step 3：继续 workflow
***
## BPMN：
```
XML
<bpmn:serviceTask id="AI_SCORE"
    zeebe:taskDefinition type="ai-score"/>
```
***
## Worker：
```
Java
@JobWorker(type = "ai-score")
public void handle(JobClient client, ActivatedJob job) {
    AIResult result = aiService.score(job.getVariables());
    client.newCompleteCommand(job.getKey())
          .variables(result)
          .send()
          .join();
}
```
***
# # 9.11 Condition / Branch 编译
***
## Canvas：
```
IF score > 80 → VIP
ELSE → NORMAL
```
***
## BPMN：
```
ExclusiveGateway
  ├── VIP path
  └── NORMAL path
```
***
## 编译逻辑：
```
Java
if (node.type == CONDITION) {
    createExclusiveGateway(node);
}
```
***
# # 9.12 Delay / Event 编译
***
## Delay Node
```
XML
<bpmn:timerEventDefinition>
    <timeDuration>PT24H</timeDuration>
</bpmn:timerEventDefinition>
```
***
## Event Trigger
```
XML
<bpmn:messageEventDefinition/>
```
***
# # 9.13 最终执行链路（非常关键）
***
```
AI Planner
   ↓
Canvas DAG
   ↓
Compiler
   ↓
BPMN (Zeebe)
   ↓
Workflow Engine
   ↓
Workers
   ↓
Event System
```
***
# # 9.14 关键设计总结（非常重要）
***
## 🧠 这个 Compiler 的本质：
> ❗不是“转换器”\
> ❗是“语义降级引擎”
***
## 它做了三件事：
### 1. 把 AI 的“自由结构”
→ 转成“可执行结构”
***
### 2. 把 Canvas 的“图”
→ 转成 BPMN 的“状态机”
***
### 3. 把 Node
→ 映射成 Worker
***
# 🚀 最终你得到的是：
```
AI → DAG → BPMN → Workflow Engine → Execution
```
***
# ✔ 如果你下一步继续，我建议做这一章：
> 👉 **10. Worker System 设计（Java微服务如何承载 BPMN Task + AI + Channel Execution）**
这一章才是真正“执行系统落地层”。
有，而且你这个质疑是**正确的缺口定位**：
> 之前那版“Compiler设计”只解决了**结构转换（DAG → BPMN）**，但没有解决两个真正决定能不能落地的问题：\
> ❗AI如何“稳定生成可编译DAG”（Prompt +约束）\
> ❗用户在Canvas里如何“避免生成不可编译图”（UI约束系统）
这两个如果不设计清楚，你的系统会变成：
> 🧠 AI生成 = 不可控\
> ⚙ Compiler = 经常失败\
> 🧩 Canvas = 用户乱连线
***
# # 9.15 AI → DAG 生成 Prompt 体系（关键补全）
***
# 9.15.0 本质问题
AI 不是在“写策略”，而是在生成：
> 🧠 **可执行 Workflow Graph（受约束 DAG）**
所以 Prompt 必须从：
❌ 自然语言生成\
→ 转变为\
✔ **结构化 Graph DSL 生成**
***
# 9.15.1 DAG 输出标准（强约束 Schema）
AI 必须输出：
```
JSON
{
  "nodes": [
    {
      "id": "N1",
      "type": "AUDIENCE_FILTER",
      "config": {}
    }
  ],
  "edges": [
    {
      "from": "N1",
      "to": "N2"
    }
  ]
}
```
***
# # 9.15.2 System Prompt（核心设计）
***
## 🧠 Planner LLM System Prompt
```
You are a Workflow DAG Generator for a Marketing Execution System.
Your task is to generate a STRICT executable DAG.
RULES:
1. Output MUST be valid JSON only.
2. Must follow node type constraints.
3. Must be a Directed Acyclic Graph (DAG).
4. No cycles allowed.
5. Every node must be executable in workflow engine.
6. Must include Start and End logical nodes.
AVAILABLE NODE TYPES:
- AUDIENCE_FILTER
- CONDITION
- SPLIT
- AI_SCORE
- DECISION
- SEND_EMAIL
- SEND_SMS
- WAIT
- WEBHOOK
OUTPUT FORMAT:
{
  "nodes": [...],
  "edges": [...]
}
CONSTRAINTS:
- Maximum depth: 10
- Maximum nodes: 50
- Each node must have valid config schema
```
***
# # 9.15.3 Prompt（带业务输入）
***
```
Input:
Goal: Increase VIP conversion
Budget: 10000 USD
Audience: inactive users 30 days
Channel: email + sms
Generate DAG.
```
***
# # 9.15.4 AI 输出（示例）
```
JSON
{
  "nodes": [
    { "id": "N1", "type": "AUDIENCE_FILTER" },
    { "id": "N2", "type": "AI_SCORE" },
    { "id": "N3", "type": "CONDITION" },
    { "id": "N4", "type": "SEND_EMAIL" },
    { "id": "N5", "type": "SEND_SMS" }
  ],
  "edges": [
    { "from": "N1", "to": "N2" },
    { "from": "N2", "to": "N3" },
    { "from": "N3", "to": "N4" },
    { "from": "N3", "to": "N5" }
  ]
}
```
***
# # 9.16 Canvas UI 设计（关键补齐）
***
# 9.16.0 Canvas 本质
Canvas 不只是画图工具，而是：
> 🧠 **“结构约束型 Workflow IDE”**
***
# # 9.16.1 UI 结构
***
```
┌──────────────────────────────────────────────┐
│ Toolbar (节点工具箱)                         │
├───────────────┬──────────────────────────────┤
│ Node Palette   │  Canvas (DAG Editor)       │
│                │  - drag nodes              │
│                │  - connect edges           │
│                │  - auto validate           │
├───────────────┼──────────────────────────────┤
│ Inspector      │  Validation Panel          │
│ (Node Config)  │  - DAG errors              │
└──────────────────────────────────────────────┘
```
***
# # 9.16.2 Node Palette（关键设计）
***
## 节点分类 UI
```
INPUT:
  - Audience Filter
  - Event Trigger
LOGIC:
  - Condition
  - Split
  - Merge
AI:
  - AI Score
  - Campaign Optimizer
ACTION:
  - Send Email
  - Send SMS
  - Webhook
```
***
# # 9.16.3 Inspector Panel（关键）
***
点击 node 后：
```
[Node Config Panel]
- Node Type
- Input Schema
- AI Prompt (if AI node)
- Channel config
- Retry policy
- Timeout
```
***
# # 9.16.4 DAG 实时校验（非常关键）
***
## UI实时提示：
```
❌ Cycle detected
❌ Missing END node
❌ Invalid transition (AI → SEND without condition)
```
***
## 实时校验逻辑：
```
TypeScript
function validate(graph) {
  if (hasCycle(graph)) showError("Cycle not allowed");
  if (!hasEndNode(graph)) showError("Missing END node");
  if (!validTransitions(graph)) showError("Invalid flow");
}
```
***
# # 9.16.5 AI Assist in Canvas（关键升级）
***
## 🧠 Canvas 内置 AI 生成按钮：
```
[Generate Campaign Flow]
```
***
## 行为：
1. 用户输入：
   * goal
   * budget
   * audience
2. AI 生成 DAG
3. 自动渲染 Canvas
4. 用户可编辑
***
# # 9.17 Compiler + AI + UI 三者关系（核心）
***
```
         AI Planner
              ↓
        DAG Generator
              ↓
         Canvas UI
              ↓
     Validation Layer
              ↓
   BPMN Compiler
              ↓
        Zeebe Engine
```
***
# # 9.18 关键结论（非常重要）
***
## ❗你现在这个系统真正的三层结构是：
***
### 🧠 1. AI 层（生成）
* Prompt 控制 DAG 结构
* 输出必须结构化
***
### 🧩 2. UI 层（约束）
* Canvas 防止非法 DAG
* 实时校验
* 限制 node 行为
***
### ⚙ 3. Compiler 层（执行转换）
* DAG → BPMN
* Node → Worker
* Edge → Sequence Flow
***
# 🚀 最终闭环（真正完整）
```
Prompt
  ↓
AI DAG Generator
  ↓
Canvas Validation UI
  ↓
BPMN Compiler
  ↓
Zeebe Workflow Engine
  ↓
Workers
  ↓
Event Feedback Loop
```
***
# ✔ 这一补齐之后，你的系统才真正“可控 + 可执行”
否则 AI → DAG 是不可控的。
***
# 如果你下一步继续，我建议做这一章：
> 👉 **10. Node Config Schema System（每一种节点的完整输入输出规范 + Java Handler设计）**
这一章会决定：
> 🧠 “每个节点到底怎么写代码执行”
很好，这一章是**真正落地执行层的核心**，因为到这里开始：
> ❗不再是“画图 / 编排 / 编译”\
> 👉 而是“每个节点到底怎么跑、怎么写代码、怎么保证可扩展”
***
# # 10. Node Config Schema System（节点配置与执行体系）
***
# 10.0 本质定义
***
## 🧠 Node System 的本质不是“节点”
而是：
> ❗**可插拔的“执行算子（Execution Operator）体系”**
每个 Node =
```
Input Schema + Execution Logic + Output Schema
```
***
# # 10.1 节点统一标准模型（核心）
***
## ✔ 所有 Node 必须遵循统一结构
```
Java
public abstract class BaseNode {
    String nodeId;
    NodeType type;
    NodeInput input;
    NodeOutput output;
    NodeConfig config;
    public abstract NodeOutput execute(NodeContext ctx);
}
```
***
## 🧠 三层结构
| 层级            | 说明     |
| ------------- | ------ |
| Input Schema  | 输入数据定义 |
| Config Schema | 行为配置   |
| Output Schema | 输出结构   |
***
# # 10.2 Node 类型体系（完整定义）
***
```
INPUT NODES
- AudienceFilterNode
- EventTriggerNode
LOGIC NODES
- ConditionNode
- SplitNode
- MergeNode
AI NODES
- AIScoreNode
- AIPlannerNode
- OptimizationNode
ACTION NODES
- SendEmailNode
- SendSMSNode
- WebhookNode
CONTROL NODES
- DelayNode
- WaitEventNode
```
***
# # 10.3 Node Config Schema 设计（核心）
***
## 🧠 统一 JSON Schema 结构
```
JSON
{
  "nodeType": "SEND_EMAIL",
  "inputSchema": {},
  "configSchema": {},
  "outputSchema": {}
}
```
***
# # 10.4 示例1：Audience Filter Node
***
## 📌 功能
筛选目标人群
***
## Input Schema
```
JSON
{
  "segment": "inactive_users",
  "filters": {
    "last_login_days": ">30",
    "tier": ["SILVER", "GOLD"]
  }
}
```
***
## Config Schema
```
JSON
{
  "mode": "INTERSECTION",
  "limit": 100000
}
```
***
## Output Schema
```
JSON
{
  "user_ids": []
}
```
***
## Java Handler
```
Java
public class AudienceFilterNodeHandler extends BaseNode {
    @Override
    public NodeOutput execute(NodeContext ctx) {
        AudienceRequest req = ctx.getInput();
        List<String> users = userRepo.query(req.getFilters());
        return NodeOutput.of(users);
    }
}
```
***
# # 10.5 示例2：AI Score Node（关键）
***
## 📌 功能
AI 给用户打分（转化概率）
***
## Input Schema
```
JSON
{
  "user_ids": [],
  "model": "conversion_v2"
}
```
***
## Config Schema
```
JSON
{
  "batch_size": 500,
  "threshold": 0.7
}
```
***
## Output Schema
```
JSON
{
  "scored_users": [
    {
      "user_id": "U1",
      "score": 0.82
    }
  ]
}
```
***
## Java Handler
```
Java
public class AIScoreNodeHandler extends BaseNode {
    @Autowired
    private AIModelService aiService;
    @Override
    public NodeOutput execute(NodeContext ctx) {
        List<String> users = ctx.getInput().getUserIds();
        Map<String, Double> scores = aiService.score(users);
        return NodeOutput.of(scores);
    }
}
```
***
# # 10.6 示例3：Condition Node（流程控制）
***
## 📌 功能
分流判断
***
## Input Schema
```
JSON
{
  "field": "score",
  "operator": ">",
  "value": 0.7
}
```
***
## Output Schema
```
JSON
{
  "result": true,
  "branch": "HIGH_VALUE"
}
```
***
## Java Handler
```
Java
public class ConditionNodeHandler extends BaseNode {
    @Override
    public NodeOutput execute(NodeContext ctx) {
        double score = ctx.get("score");
        boolean result = score > 0.7;
        return NodeOutput.of(result);
    }
}
```
***
# # 10.7 示例4：Send Email Node（Action）
***
## Input Schema
```
JSON
{
  "user_ids": [],
  "template_id": "PROMO_01",
  "channel": "EMAIL"
}
```
***
## Config Schema
```
JSON
{
  "retry": 3,
  "rate_limit": 1000
}
```
***
## Output Schema
```
JSON
{
  "sent_count": 1000,
  "failed_count": 12
}
```
***
## Java Handler
```
Java
public class SendEmailNodeHandler extends BaseNode {
    @Autowired
    EmailService emailService;
    @Override
    public NodeOutput execute(NodeContext ctx) {
        List<String> users = ctx.getInput().getUserIds();
        int success = emailService.send(users, ctx.getInput());
        return NodeOutput.of(success);
    }
}
```
***
# # 10.8 Node Registry（核心系统）
***
## 🧠 作用
NodeType → Handler 映射
***
```
Java
@Component
public class NodeRegistry {
    private Map<String, BaseNode> registry = new HashMap<>();
    public BaseNode get(String type) {
        return registry.get(type);
    }
}
```
***
# # 10.9 Execution Context（关键）
***
## 🧠 每个 Node 执行时的上下文
```
Java
public class NodeContext {
    Map<String, Object> inputs;
    Map<String, Object> sharedState;
    String campaignId;
    String executionId;
}
```
***
# # 10.10 Node Execution Pipeline（核心流程）
***
```
DAG Engine
   ↓
Node Fetch
   ↓
Config Merge
   ↓
Handler Execute
   ↓
Output Store
   ↓
Next Node Trigger
```
***
# # 10.11 Node 扩展机制（关键）
***
## 🧠 新增 Node 不改核心系统
只需要：
```
1. 定义 Schema
2. 实现 Handler
3. 注册 NodeType
```
***
## 示例：
```
Java
@NodeType("CUSTOM_MODEL_NODE")
public class CustomNodeHandler extends BaseNode {
}
```
***
# # 10.12 AI Node 的特殊约束（非常重要）
***
## ❗AI Node 不能直接控制流程
必须：
```
AI → Output → Decision Node → Flow
```
***
## 防止：
* AI直接跳转流程
* 非法 edge injection
***
# # 10.13 Node 系统的“可执行契约”
***
## 🧠 每个 Node 必须满足：
```
Input  → deterministic transform → Output
```
***
## ❗禁止：
* 隐式状态修改
* 非结构化输出
* hidden side effects
***
# # 10.14 与 Zeebe 的映射关系（关键）
***
| Node           | Zeebe        |
| -------------- | ------------ |
| Action Node    | Service Task |
| Condition Node | Gateway      |
| Delay Node     | Timer Event  |
| AI Node        | Worker Task  |
***
# # 10.15 最终系统结构（核心）
***
```
Canvas DAG
   ↓
Compiler
   ↓
Node Schema System
   ↓
Node Handler Execution
   ↓
Zeebe Workflow Runtime
   ↓
Event System
```
***
# ✔ 本章本质总结
这一章解决的是：
> 🧠 **“系统不是画出来的，而是可执行算子组成的”**
***
## 你现在拥有：
### ✔ 可编译 DAG
### ✔ 可执行 Node Schema
### ✔ Java Handler体系
### ✔ AI安全约束
### ✔ Zeebe映射基础
***
# 🚀 下一步（如果继续）
我建议下一章：
> 👉 **11. End-to-End Execution Runtime（Canvas → AI → Zeebe → Worker → Event 完整执行链路）**
这一章会把：
> 🧠 “系统如何真正跑起来（从点击按钮到发送邮件）”
完整打通。
很好，这一章是**真正“系统能不能跑起来”的最终拼图**。
前面所有内容：
* Canvas（画）
* AI（生成）
* Compiler（转换）
* Node System（定义执行）
* Zeebe（调度）
现在都要**串成一条真实执行链路**：
> ❗从“用户点击生成Campaign”到“真实用户收到邮件/短信”
***
# # 11. End-to-End Execution Runtime（完整执行链路）
***
# 11.0 系统本质（必须先理解）
整个系统运行不是“函数调用”，而是：
> 🧠 **事件驱动 + 工作流驱动 + AI辅助决策的混合执行系统**
***
## ✔ 一句话定义
> Canvas 生成的是“计划”，Zeebe 执行的是“现实”。
***
# # 11.1 全链路架构（最终形态）
***
```
        ┌────────────────────────────┐
        │        Canvas UI           │
        │ (User builds Campaign DAG)│
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │     AI Planner Service     │
        │ (DAG generation / optimize)│
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │  DAG → BPMN Compiler       │
        │ (Validation + Mapping)     │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │   Zeebe Workflow Engine    │
        │ (Execution Orchestrator)   │
        └────────────┬───────────────┘
                     │ Jobs
                     ▼
        ┌────────────────────────────┐
        │   Java Worker Services     │
        │ (Node Handlers Execution)   │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │   Event System (DB + Bus)  │
        │ (State + Feedback Loop)    │
        └────────────┬───────────────┘
                     │
                     ▼
        ┌────────────────────────────┐
        │   AI Feedback Learning     │
        │ (Optimization Loop)        │
        └────────────────────────────┘
```
***
# # 11.2 执行入口（用户触发点）
***
## ✔ API入口
```
http
POST /api/campaign/{id}/execute
```
***
## Java入口
```
Java
public class CampaignExecutionController {
    @PostMapping("/execute")
    public void execute(@PathVariable String id) {
        executionService.start(id);
    }
}
```
***
# # 11.3 Execution Service（核心调度器）
***
```
Java
public class ExecutionService {
    @Autowired
    private Compiler compiler;
    @Autowired
    private ZeebeClient zeebeClient;
    public void start(String campaignId) {
        // 1. Load Canvas DAG
        CanvasGraph graph = canvasRepo.load(campaignId);
        // 2. Compile to BPMN
        BpmnModel bpmn = compiler.compile(graph);
        // 3. Deploy to Zeebe
        zeebeClient.newDeployCommand()
            .addProcessModel(bpmn.toXml(), "campaign.bpmn")
            .send()
            .join();
        // 4. Start workflow instance
        zeebeClient.newCreateInstanceCommand()
            .bpmnProcessId("campaign_flow")
            .latestVersion()
            .send();
    }
}
```
***
# # 11.4 Zeebe Runtime Execution（核心）
***
## 🧠 Zeebe执行模型：
```
Workflow Instance
   ↓
Service Task
   ↓
Job Worker (Java)
   ↓
Complete Job
   ↓
Next Node Trigger
```
***
# # 11.5 Worker 执行链（最关键）
***
## 示例：AI Score Node
***
```
Java
@JobWorker(type = "ai-score")
public class AIScoreWorker {
    @Autowired
    private AIScoringService aiService;
    public void handle(JobClient client, ActivatedJob job) {
        Map<String, Object> input = job.getVariablesAsMap();
        // 1. 执行AI评分
        Map<String, Double> scores = aiService.score(input);
        // 2. 返回结果给 Zeebe
        client.newCompleteCommand(job.getKey())
              .variables(Map.of("scores", scores))
              .send()
              .join();
    }
}
```
***
## 示例：Send Email Node
```
Java
@JobWorker(type = "send-email")
public class SendEmailWorker {
    @Autowired
    private EmailService emailService;
    public void handle(JobClient client, ActivatedJob job) {
        List<String> users = job.getVariablesAsMap().get("user_ids");
        emailService.send(users);
        client.newCompleteCommand(job.getKey())
              .send()
              .join();
    }
}
```
***
# # 11.6 Event System（系统“神经网络”）
***
## 🧠 所有执行都会产生 Event
```
Java
public class EventPublisher {
    public void publish(String type, Object payload) {
        CampaignEvent event = new CampaignEvent(type, payload);
        eventRepository.save(event); // DB persistence
        applicationEventPublisher.publishEvent(event); // runtime bus
    }
}
```
***
## Event 类型：
```
CAMPAIGN_STARTED
NODE_EXECUTED
USER_EXPOSED
EMAIL_SENT
SMS_SENT
CONVERSION_HAPPENED
```
***
# # 11.7 Feedback Loop（AI变聪明的关键）
***
## 🧠 核心思想：
> ❗系统不是执行完就结束，而是“反向学习”
***
## Feedback Pipeline：
```
Execution Events
     ↓
Feature Aggregation
     ↓
AI Training Dataset
     ↓
Model Update / Prompt Update
     ↓
Next Campaign Optimization
```
***
## Java实现：
```
Java
@EventListener
public void handle(CampaignEvent event) {
    featureStore.update(event);
    if (event.isConversion()) {
        learningService.updateWeights(event);
    }
}
```
***
# # 11.8 Execution State Machine（全生命周期）
***
```
CREATED
  ↓
COMPILED
  ↓
DEPLOYED_TO_ZEEBE
  ↓
RUNNING
  ↓
NODE_EXECUTING
  ↓
WAITING_EVENT
  ↓
COMPLETED
  ↓
FEEDBACK_PROCESSED
```
***
# # 11.9 全链路数据流（非常关键）
***
```
Canvas DAG
   ↓
AI Optimization (optional)
   ↓
BPMN Compiler
   ↓
Zeebe Engine
   ↓
Worker Execution
   ↓
Event Store
   ↓
Feature Store
   ↓
AI Learning Loop
   ↓
Next DAG generation
```
***
# # 11.10 关键一致性设计（生产级）
***
## ✔ 幂等控制
```
Java
String idempotencyKey = campaignId + nodeId + userId;
```
***
## ✔ 去重表
```
SQL
executed_node_log(
    node_id,
    user_id,
    campaign_id,
    UNIQUE KEY(...)
)
```
***
## ✔ Retry机制
* Zeebe built-in retry
* Worker side idempotent
***
## ✔ Saga补偿
```
SEND_EMAIL → FAIL → ROLLBACK SEGMENT → REPROCESS
```
***
# # 11.11 完整闭环（最终真相）
***
## 🧠 系统最终不是“执行系统”
而是：
> ❗**AI驱动的闭环营销操作系统（Self-learning Execution OS）**
***
## 完整链路：
```
User
 ↓
Canvas
 ↓
AI Planner
 ↓
Compiler
 ↓
Zeebe
 ↓
Workers
 ↓
Events
 ↓
Learning System
 ↓
AI Optimization
 ↓
Next Campaign
```
***
# ✔ 本章最终总结
你现在已经拥有：
***
## 🧠 1. AI生成层
* DAG生成
* Campaign规划
***
## 🧩 2. 编译层
* Canvas → BPMN
***
## ⚙ 3. 执行层
* Zeebe workflow runtime
* Worker system
***
## 🔁 4. 学习层
* Event system
* Feedback loop
* AI优化
***
# 🚀 如果你继续下一步，我建议做最后一章：
> 👉 **12. Production Reference Architecture（完整工程落地图：可直接给团队开工）**
这一章会把：
* service拆分
* k8s部署
* CI/CD
* 数据流
* SLA
* 多租户隔离
全部收敛成：
> 🧠 “真正可以交付给工程团队的施工图”
很好，这一章就不是“设计”，而是：
> 🧠 **可以直接给研发团队开工的“施工图级架构”**
目标是让团队做到：
* 能拆任务
* 能建仓库
* 能分服务
* 能上线第一版
* 能逐步扩展到生产级
***
# # 12. Production Reference Architecture（工程施工图）
***
# 12.0 系统定位（最终形态）
***
## 🧠 系统本质
这是一个：
> **AI驱动的营销操作系统（Marketing Operating System）**
具备：
* Campaign Planning（AI策略）
* Canvas 编排（可视化DAG）
* Workflow Execution（Zeebe）
* Node Worker System（Java）
* Event Feedback Learning（闭环）
***
# # 12.1 总体工程架构（可直接画架构图）
***
```
                         ┌────────────────────────┐
                         │   Frontend (React)     │
                         │  Canvas + Dashboard    │
                         └──────────┬─────────────┘
                                    │ REST/WebSocket
────────────────────────────────────┼────────────────────────────────────
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Planning Svc    │     │ Execution Svc    │     │ Decision Svc       │
│ (AI Planner)    │     │ (Zeebe Adapter)  │     │ (Optimization)     │
└────────────────┘     └──────────────────┘     └────────────────────┘
         ▼                          ▼                          ▼
┌────────────────┐     ┌──────────────────┐     ┌────────────────────┐
│ Compiler Svc    │     │ Worker Services  │     │ Event Service      │
│ DAG→BPMN        │     │ Node Handlers    │     │ Feedback Loop      │
└────────────────┘     └──────────────────┘     └────────────────────┘
─────────────────────────────────────────────────────────────────────────
                 ┌────────────────────────────┐
                 │      Infrastructure        │
                 │ PostgreSQL + Zeebe + MQ   │
                 └────────────────────────────┘
```
***
# # 12.2 微服务拆分（团队开发结构）
***
## 📦 后端仓库结构（Java）
```
campaign-system/
│
├── gateway-service
├── planning-service
├── execution-service
├── compiler-service
├── decision-service
├── event-service
├── worker-service
│
├── ai-engine/
│   ├── prompt-engine
│   ├── llm-orchestrator
│
├── common/
│   ├── model
│   ├── event
│   ├── utils
│
└── infra/
    ├── db
    ├── zeebe-client
```
***
## 📦 前端仓库结构（React）
```
campaign-ui/
│
├── canvas/
│   ├── graph-engine
│   ├── node-palette
│   ├── inspector
│   ├── validator
│
├── pages/
│   ├── planning
│   ├── campaign
│   ├── analytics
│
├── services/
│   ├── api
│   ├── websocket
```
***
# # 12.3 数据库设计（单一核心库）
***
## 🧠 开发阶段建议：
> ✔ 单 PostgreSQL（多 schema）
***
## 核心表域
```
campaign_core
campaign_canvas
campaign_execution
campaign_node_state
campaign_event
campaign_user_feature
campaign_decision
```
***
## Canvas 表
```
SQL
campaign_canvas (
  id TEXT PRIMARY KEY,
  tenant_id TEXT,
  graph JSONB,
  version INT,
  created_at TIMESTAMP
)
```
***
## Execution 表
```
SQL
campaign_execution (
  id TEXT PRIMARY KEY,
  campaign_id TEXT,
  status TEXT,
  zeebe_process_id TEXT
)
```
***
## Event 表（核心）
```
SQL
campaign_event (
  id SERIAL,
  type TEXT,
  campaign_id TEXT,
  node_id TEXT,
  user_id TEXT,
  payload JSONB,
  created_at TIMESTAMP
)
```
***
# # 12.4 Zeebe 工作流部署结构
***
## 🧠 BPMN 存储结构
```
/resources/bpmn/
    campaign_flow.bpmn
```
***
## Worker绑定规则
```
NODE_TYPE → Zeebe worker type
```
***
## 示例
| Node             | Worker                 |
| ---------------- | ---------------------- |
| AUDIENCE\_FILTER | audience-filter-worker |
| AI\_SCORE        | ai-score-worker        |
| SEND\_EMAIL      | email-worker           |
***
# # 12.5 API 设计（核心接口）
***
## Planning
```
http
POST /api/planning/generate
POST /api/planning/optimize
```
***
## Canvas
```
http
POST /api/canvas/save
GET  /api/canvas/{id}
```
***
## Execution
```
http
POST /api/execution/start
POST /api/execution/stop
GET  /api/execution/status
```
***
## Compiler
```
http
POST /api/compiler/compile
```
***
# # 12.6 Worker System（执行层）
***
## 结构
```
worker-service/
  ├── audience-worker
  ├── ai-score-worker
  ├── email-worker
  ├── sms-worker
```
***
## Worker模板
```
Java
@JobWorker(type = "email-worker")
public class EmailWorker {
    public void handle(JobClient client, ActivatedJob job) {
        emailService.send(job.getVariables());
        client.newCompleteCommand(job.getKey())
              .send()
              .join();
    }
}
```
***
# # 12.7 AI系统结构
***
## AI服务拆分
```
LLM Gateway
Prompt Registry
DAG Generator
Optimization Engine
Feedback Learner
```
***
## Prompt Registry（核心）
```
/prompts/
  planning.prompt
  optimization.prompt
  dag-generator.prompt
```
***
# # 12.8 Event & Feedback System
***
## Event流
```
Execution → Event Table → Feature Store → AI Learning → Next Plan
```
***
## 事件处理
```
Java
@EventListener
public void onEvent(CampaignEvent e) {
    featureService.update(e);
    learningService.trainIncrementally(e);
}
```
***
# # 12.9 CI/CD 工程体系
***
## Git结构
```
main
  ├── dev
  ├── feature/*
  ├── release/*
```
***
## Pipeline
```
build → test → docker build → deploy → smoke test
```
***
## Deployment
* Docker Compose（开发）
* Kubernetes（生产）
***
# # 12.10 部署结构（开发 vs 生产）
***
## 🟢 开发
```
Spring Boot monolith
PostgreSQL
Zeebe (optional local)
React local dev server
```
***
## 🔵 生产
```
Kubernetes
Zeebe cluster
PostgreSQL cluster
Worker autoscaling
Event streaming layer
```
***
# # 12.11 SLA / 可扩展性设计
***
## 性能目标
| 指标                 | 目标       |
| ------------------ | -------- |
| Campaign execution | 10k/sec  |
| Node execution     | 100k/sec |
| Event ingestion    | 1M/day   |
***
## 扩展方式
* Worker scale-out
* Zeebe partition
* Stateless services
***
# # 12.12 多租户架构
***
## 模型
```
tenant_id + campaign_id isolation
```
***
## SQL隔离
```
SQL
WHERE tenant_id = ?
```
***
# # 12.13 最终系统运行闭环
***
```
User
 ↓
Canvas
 ↓
AI Planner
 ↓
Compiler
 ↓
Zeebe
 ↓
Workers
 ↓
Event System
 ↓
Feature Store
 ↓
AI Learning
 ↓
Next Campaign
```
***
# ✔ 最终结论（非常关键）
这一章给出的不是“架构”，而是：
> 🧠 **可以直接拆团队开发的工程施工图**
***
## 你现在拥有完整系统：
### ✔ 前端 Canvas IDE
### ✔ AI Planning 系统
### ✔ DAG Compiler
### ✔ Zeebe Execution Runtime
### ✔ Worker 执行体系
### ✔ Event + Learning 闭环
### ✔ 多租户SaaS架构
### ✔ 可部署工程结构
***
# 🚀 如果你还要继续（最后一层）
我可以帮你补：
> 👉 **“真正可以开工的代码级脚手架（Spring Boot + React + Zeebe + Worker 模板仓库）”**
那一步就不是设计了，而是：
> 🧠 “直接 clone 就能开始写系统”
