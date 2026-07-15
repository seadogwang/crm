<p align="center">
  <h1 align="center">Loyalty Platform</h1>
  <p align="center">Omni-channel Loyalty Management Platform</p>
  <p align="center">全渠道忠诚度管理平台</p>
  <p align="center">
    <img src="https://img.shields.io/badge/Java-17-blue" alt="Java 17">
    <img src="https://img.shields.io/badge/Spring%20Boot-3.2.5-green" alt="Spring Boot 3.2.5">
    <img src="https://img.shields.io/badge/React-18-61dafb" alt="React 18">
    <img src="https://img.shields.io/badge/Drools-8.44.2-orange" alt="Drools 8.44.2">
    <img src="https://img.shields.io/badge/LiteFlow-2.12.4-667eea" alt="LiteFlow 2.12.4">
    <img src="https://img.shields.io/badge/PostgreSQL-15+-336791" alt="PostgreSQL 15+">
  </p>
</p>

---

## English

### Overview

Loyalty Platform is a **omni-channel loyalty management platform** built for enterprises operating across multiple retail channels (Tmall, JD.com, Douyin, WeChat Mini Programs). It provides a unified member identity system, flexible points accounting engine, rule-driven reward distribution, and visual workflow orchestration.

**Key Capabilities:**
- **Multi-Tenant Isolation** — 4-layer defense: HTTP filter → ORM interceptor → middleware sandbox → query sentinel
- **One-ID Enrollment** — Cross-channel member matching & deduplication (phone/UnionID/UserID)
- **Points Accounting** — FIFO waterfall redemption, negative balance risk control, credit limits
- **Drools Rule Engine** — DRL rules with hot-reload, AI-assisted generation, shadow sandbox regression testing
- **LiteFlow Pipeline** — 7-component event processing chain with visual React Flow designer & hot-reload
- **Schema-Driven UI** — Dynamic entity model (JSONB ext_attributes) with REST API auto-generation
- **Cascade Recalculation** — Lock-free compensation for tier changes triggered by points adjustments

### Architecture

```
Frontend (React 18 + TypeScript + Ant Design 5)
  Dashboard | Rule Editor | Flow Designer | Schema Editor | ...
        │ REST API (/api/*)
        ▼
Backend (Spring Boot 3.2.5 + Java 17)
  SPI Gateway ──→ LiteFlow Pipeline (7 components)
  Drools Rules ──→ Points Accounting (FIFO + Waterfall)
  Cascade Recalculation ──→ Security (RBAC + JWT + Quota)
        │
        ▼
Data Layer: PostgreSQL 15+ (JSONB) | Redis 6.x+ | Kafka (optional)
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend Framework | Spring Boot 3.2.5, Java 17 |
| ORM | Hibernate 6.4 + JPA, MyBatis-Plus 3.5.6 |
| Rule Engine | Drools 8.44.2 (KieBase Cache, StatelessKieSession) |
| Flow Orchestration | LiteFlow 2.12.4 (7 components, EL chain, hot-reload) |
| Scripting | GraalVM Polyglot (JavaScript sandbox) |
| Database | PostgreSQL 15+ (JSONB, RLS, pg_partman) |
| Cache | Redis 6.x+ (Redisson 3.30) |
| Messaging | Kafka (optional, dev uses LocalEventBus) |
| Frontend | React 18, TypeScript, Ant Design 5 |
| Flow Designer | @xyflow/react (React Flow 11.x), Zustand |
| Code Editor | Monaco Editor |
| Testing | JUnit 5, Mockito, Playwright (E2E) |

### Quick Start

**Prerequisites:** Java 17+, PostgreSQL 15+, Redis 6.x+ (optional), Node.js 18+

```bash
# Backend
psql -U postgres -c "CREATE DATABASE loyalty_dev;"
psql -U postgres -d loyalty_dev -f src/main/resources/db/migration/V1_*.sql
mvn spring-boot:run

# Frontend
cd src/frontend
npm install && npm run dev

# Tests
mvn test -Dtest="RulesUnitTest,TenantKeyGeneratorTest,MergeTaskTest"
mvn test  # Full suite (requires PostgreSQL)
```

### Key API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/rules` | List rule definitions |
| `POST` | `/api/admin/rules` | Create rule (DRAFT) |
| `POST` | `/api/admin/rules/{id}/publish` | Publish with regression test |
| `POST` | `/api/admin/rules/validate-drl` | Validate DRL syntax |
| `POST` | `/api/admin/rules/generate` | AI-assisted rule generation |
| `GET`  | `/api/admin/llm-config` | Get LLM configuration |
| `PUT`  | `/api/admin/llm-config` | Save LLM configuration |
| `POST` | `/api/admin/llm-config/test` | Test LLM connection |
| `GET` | `/api/admin/flows` | List flow definitions |
| `POST` | `/api/admin/flows/{id}/publish` | Publish flow (LiteFlow hot-reload) |
| `POST` | `/api/events/{chainName}/{programCode}` | Execute LiteFlow event chain |
| `POST` | `/api/open/spi/{channel}/{programCode}/{action}` | SPI webhook for 3rd-party channels |
| `GET` | `/api/members/{id}` | Get member details |
| `POST` | `/api/members/merge` | Create member merge task |

### Project Structure

```
src/main/java/com/loyalty/platform/
├── accounting/         Points grant, redeem, compaction, negative risk
├── admin/              AdminController (programs, rules, flows, audit)
├── api/                REST controllers & services
├── cascade/            Cascade recalculation engine
├── common/             Shared utilities (cache, context, event, exception, filter, interceptor)
├── config/             Hibernate, MyBatis-Plus, RLS, Tenant configs
├── domain/             JPA entities, enums, converters, repositories
├── event/              EventInboxProcessor (state machine)
├── flow/               ** LiteFlow pipeline (7 components + EventContext + EventController)
├── job/                Scheduled jobs (TierEval, Compaction, Merge, Retry)
├── mapping/            ScriptingTransformer (GraalVM)
├── member/             OneIdEnrollmentService, MemberMergeService
├── notification/       Outbox, SMS, WeChat providers
├── rules/              Drools rule engine (Action, DRL, regression)
├── security/           RBAC, JWT, QuotaBillingSentinel, AuditMonitor
└── spi/                SPI gateway (TMALL, JD, DOUYIN, WECHAT handlers)
```

### v7.3 Features

- **LiteFlow Pipeline** — 7-component event chain + React Flow visual designer
- **Package Restructure** — `com.loyalty.saas` → `com.loyalty.platform`
- **Rule Engine API** — 11 endpoints for rule CRUD, publish, sandbox, DRL test
- **Member Merge Saga** — Async merge with MergeTaskJob (SKIP LOCKED)
- **TenantKeyGenerator** — Tenant-aware Redis key generation
- **Event Time Extraction** — Multi-format business event time parsing
- **KieBase Draft Compilation** — `buildKieBaseWithDraft()` for shadow sandbox

### v7.4 — Campaign Tools (New)

**Campaign Tools** is a full-stack marketing planning & execution platform integrated with Loyalty. 12 modules, 27+ Flyway migrations, 100+ new files.

| Module | Description | Key API |
|--------|-------------|---------|
| **Planning Workspace** | Workspace → Goal → Initiative → Portfolio hierarchy | `/api/campaign/workspace` |
| **Opportunity Intelligence** | ML + RFM + external signal driven opportunity discovery | `/api/campaign/opportunity/discover` |
| **Marketing Decision Engine** | Budget allocation, attention budget, conflict arbitration, prioritization | `/api/campaign/decision/execute` |
| **Simulation & Optimization** | 3-layer simulation (Exposure→Behavior→Conversion), genetic algorithm optimization | `/api/campaign/simulation/run` |
| **Execution Engine (Zeebe)** | BPMN deploy, process start, worker execution, pause/resume | `/api/campaign/execution` |
| **Event System + Feedback Loop** | 13 event types, feedback metrics, model drift detection, strategy adjustment | `/api/campaign/feedback` |
| **Canvas → BPMN Compiler** | DAG JSON → Zeebe BPMN XML, semantic validation, AI DAG generation | `/api/campaign/canvas` |
| **Node Config Schema** | 12 node types with JSON Schema, pluggable NodeHandler framework | `/api/campaign/nodes` |
| **Content & Compliance** | Asset management, approval workflow, variable rendering, audit trail | `/api/campaign/content` |
| **Human Intervention** | Pause/resume/cancel, node skip, emergency throttle, kill switch | `/api/campaign/intervention` |
| **End-to-End Runtime** | Execution master/step/user-detail tracking, 10-state machine | `/api/campaign/execution` |

**Frontend Pages:** 11 dedicated campaign pages under `/campaign/*`
- Workspace List/Detail, Opportunity Intelligence, Decision Engine, Simulation & Optimization, Canvas Editor, Execution Monitor, Content Management, Intervention Dashboard, Feedback Analysis

### Screenshots

**会员服务 / Member Service**

| 截图 | 说明 |
|------|------|
| ![会员服务](src/screenshots/会员服务/会员服务.png) | **会员服务** / Member Service — 会员查询、积分账户、交易流水、渠道绑定 |

**忠诚度配置 / Loyalty Configuration**

| 截图 | 说明 |
|------|------|
| ![积分类型配置](src/screenshots/忠诚度配置/积分类型配置.png) | **积分类型配置** / Point Type Configuration |
| ![积分累积规则配置](src/screenshots/忠诚度配置/积分累积规则配置.png) | **积分累积规则配置** / Point Earning Rule Configuration |
| ![规则变量配置](src/screenshots/忠诚度配置/规则变量配置.png) | **规则变量配置** / Rule Variable Configuration |
| ![等级积分配置](src/screenshots/忠诚度配置/等级积分配置.png) | **等级积分配置** / Tier Points Configuration |
| ![等级划分配置](src/screenshots/忠诚度配置/等级划分配置.png) | **等级划分配置** / Tier Level Configuration |
| ![等级评估配置](src/screenshots/忠诚度配置/等级评估配置.png) | **等级评估配置** / Tier Evaluation Configuration |
| ![One-ID策略配置](src/screenshots/忠诚度配置/One-ID策略配置.png) | **One-ID策略配置** / One-ID Strategy Configuration |

**系统管理 / System Administration**

| 截图 | 说明 |
|------|------|
| ![实体模型配置](src/screenshots/系统管理/实体模型配置.png) | **实体模型配置** / Entity Model Configuration |
| ![主数据管理](src/screenshots/系统管理/主数据管理.png) | **主数据管理** / Master Data Management |
| ![角色管理](src/screenshots/系统管理/角色管理.png) | **角色管理** / Role Management |
| ![用户管理](src/screenshots/系统管理/用户管理.png) | **用户管理** / User Management |

---

---
## Campaign Tools (营销活动工具)

Campaign Tools is an **AI-powered marketing campaign management platform** built on top of the Loyalty platform. It provides end-to-end campaign lifecycle management from strategic planning to execution monitoring and feedback learning.

### Key Features

**1. Planning (战略规划)**
- Hierarchical structure: Workspace → Goal → Initiative → Portfolio
- Full status lifecycle: DRAFT → ACTIVE → PAUSED → COMPLETED → ARCHIVED
- Portfolio budget optimization with greedy algorithm

**2. Opportunity Intelligence (机会智能)**
- Dual-engine hybrid: internal data (RFM + ML) + external signals (AI skills)
- 4 AI skills: CompetitorMonitor, SocialListening, RegulatoryWatch, InventoryRisk
- Configurable scoring dimensions with adjustable weights (churn/uplift/conversion/RFM)
- Real-time external signal impact weighting

**3. Marketing Decision Engine (决策引擎)**
- Budget allocation with ROI-prioritized greedy algorithm
- Channel capacity constraints and attention budget management
- Conflict arbitration and priority ordering
- What-if simulation and scenario comparison

**4. Simulation & Optimization (模拟优化)**
- Baseline conversion rate calculation from historical data
- Three-layer simulation model: exposure → behavior → conversion
- Greedy and genetic algorithm optimization
- What-if scenario comparison

**5. Canvas Flow Editor (画布编辑器)**
- 13+ node types: AUDIENCE_FILTER, CONDITION, SEND_EMAIL/SMS/PUSH, OFFER_POINTS/COUPON, AI_SCORE, etc.
- Floating draggable palette with collapsible nodes by category
- SVG icons, 48×48 nodes, rounded corners, hover-reveal handles (4-direction)
- Visual DAG design with drag-and-drop, click-to-add, and edge condition editing
- AI-powered DAG generation from natural language descriptions

**6. Dynamic Audience Filtering (动态人群筛选)**
- Industry-agnostic: no pre-aggregated fields, users define their own metrics
- Condition types: DYNAMIC_STAT (real-time SQL aggregation) + STATIC_ATTR (member attributes)
- Configurable: data source, aggregation function, time window, operator, value
- Real-time query: all conditions based on NOW(), no pre-computed labels
- Blacklist exclusion and result limit

**7. Content & Compliance (内容合规)**
- Multi-channel content management: EMAIL, SMS, PUSH
- Approval workflow with version history
- Variable-based personalization rendering
- Content validation and compliance checks

**8. Execution Engine (执行引擎)**
- Zeebe workflow engine integration
- 11 worker types: audience-filter, ai-score, send-email/sms/push, offer-points/coupon, etc.
- Deploy, start, pause, resume, cancel operations
- Real-time execution monitoring with status tracking

**9. Feedback Loop (反馈闭环)**
- Prediction vs actual comparison (ROI, conversion, revenue)
- Model drift detection and strategy adjustment
- Event collection and feature store updates
- Continuous learning: execute → collect → learn → optimize

**10. Human Intervention (人工干预)**
- Runtime campaign control: pause, resume, cancel
- Node-level control: skip, retry, override config
- Emergency throttle and kill switch
- Complete audit trail for all intervention operations

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Campaign Tools (com.loyalty.platform.campaign)             │
│                                                             │
│  Planning ──→ Opportunity ──→ Decision ──→ Simulation      │
│     │              │              │             │            │
│     └──────────────┼──────────────┼─────────────┘            │
│                    ▼              ▼                          │
│              Canvas Editor ──→ Execution (Zeebe)            │
│                    │              │                          │
│                    └──────┬───────┘                          │
│                           ▼                                  │
│              Content ──→ Event ──→ Feedback                 │
│                                                             │
│  Human Intervention (global control layer)                  │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18, TypeScript, Ant Design 5, @xyflow/react |
| Workflow Engine | Zeebe 8.5 (embedded for dev) |
| AI/ML | LLM integration (DeepSeek/Bailian), ML scoring (XGBoost/LightGBM) |
| Database | PostgreSQL 15+ (JSONB, native queries) |
| Event System | Kafka (production) / EventBridge |

### UI Standards

All 10 Campaign pages follow a unified design system:
- Page padding: 4px top, 24px sides
- Title: 24px bold, description hidden with hover tooltip
- Back button: right-aligned, type="text"
- Cards: 12px gap, 12px body padding
- Tables: 14px font, nowrap + ellipsis, 13px bold headers
- Action buttons: right-aligned above tables

---

## 中文

### 概述

Loyalty Platform 是一个**全渠道忠诚度管理平台**，面向跨零售渠道（天猫、京东、抖音、微信小程序）运营的企业。提供统一的会员身份体系、灵活的积分账务引擎、规则驱动的奖励分发和可视化流程编排。

**核心能力：**
- **多租户强隔离** — 四层防御体系：入口过滤 → ORM 拦截 → 中间件沙箱 → 查询哨兵
- **One-ID 入会** — 跨渠道会员匹配与去重（手机号/UnionID/UserID）
- **积分账务** — FIFO 瀑布流冲抵、负分风险控制、授信额度管理
- **Drools 规则引擎** — DRL 规则热更新、AI 辅助生成、影子沙箱回归测试
- **LiteFlow 流水线** — 7 组件事件处理链 + React Flow 可视化设计器 + 热更新
- **Schema-Driven UI** — 动态实体模型（JSONB ext_attributes）+ REST API 自动生成
- **级联重算** — 等级变更触发积分无锁化补偿

### 架构

```
前端 (React 18 + TypeScript + Ant Design 5)
  Dashboard | Rule Editor | Flow Designer | Schema Editor | ...
        │ REST API (/api/*)
        ▼
后端 (Spring Boot 3.2.5 + Java 17)
  SPI 网关 ──→ LiteFlow 流水线 (7 组件)
  Drools 规则 ──→ 积分账务 (FIFO + 瀑布流)
  级联重算 ──→ 安全 (RBAC + JWT + 配额)
        │
        ▼
数据层: PostgreSQL 15+ (JSONB) | Redis 6.x+ | Kafka (可选)
```

### 技术栈

| 层级 | 技术 |
|------|------|
| 后端框架 | Spring Boot 3.2.5, Java 17 |
| ORM | Hibernate 6.4 + JPA（主）, MyBatis-Plus 3.5.6 |
| 规则引擎 | Drools 8.44.2（KieBase 缓存, StatelessKieSession） |
| 流程编排 | LiteFlow 2.12.4（7 组件, EL 链, 热更新） |
| 脚本引擎 | GraalVM Polyglot（JavaScript 沙箱） |
| 数据库 | PostgreSQL 15+（JSONB, RLS, pg_partman） |
| 缓存 | Redis 6.x+（Redisson 3.30） |
| 消息队列 | Kafka（可选，开发环境使用 LocalEventBus） |
| 前端 | React 18, TypeScript, Ant Design 5 |
| 流程设计器 | @xyflow/react（React Flow 11.x）, Zustand |
| 代码编辑器 | Monaco Editor |
| 测试 | JUnit 5, Mockito, Playwright（E2E） |

### 快速开始

**环境要求：** Java 17+, PostgreSQL 15+, Redis 6.x+（可选）, Node.js 18+

```bash
# 后端
psql -U postgres -c "CREATE DATABASE loyalty_dev;"
psql -U postgres -d loyalty_dev -f src/main/resources/db/migration/V1_*.sql
mvn spring-boot:run

# 前端
cd src/frontend
npm install && npm run dev

# 测试
mvn test -Dtest="RulesUnitTest,TenantKeyGeneratorTest,MergeTaskTest"
mvn test  # 全部测试（需要 PostgreSQL 连接）
```

### 主要 API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/admin/rules` | 规则列表 |
| `POST` | `/api/admin/rules` | 创建规则（草稿） |
| `POST` | `/api/admin/rules/{id}/publish` | 发布规则（回归测试 + 热更新） |
| `POST` | `/api/admin/rules/validate-drl` | DRL 语法校验 |
| `POST` | `/api/admin/rules/generate` | AI 辅助规则生成 |
| `GET`  | `/api/admin/llm-config` | 获取大模型配置 |
| `PUT`  | `/api/admin/llm-config` | 保存大模型配置 |
| `POST` | `/api/admin/llm-config/test` | 测试大模型连接 |
| `GET` | `/api/admin/flows` | 流程定义列表 |
| `POST` | `/api/admin/flows/{id}/publish` | 发布流程（LiteFlow 热更新） |
| `POST` | `/api/events/{chainName}/{programCode}` | 执行 LiteFlow 事件链 |
| `POST` | `/api/open/spi/{channel}/{programCode}/{action}` | 第三方渠道 SPI Webhook |
| `GET` | `/api/members/{id}` | 查询会员详情 |
| `POST` | `/api/members/merge` | 创建会员合并任务 |

### 项目结构

```
src/main/java/com/loyalty/platform/
├── accounting/         积分发放、兑换、压缩、负分风控
├── admin/              AdminController（Program、规则、流程、审计）
├── api/                REST 控制器与服务
├── cascade/            级联重算引擎
├── common/             公共工具（缓存、上下文、事件、异常、过滤器、拦截器）
├── config/             Hibernate, MyBatis-Plus, RLS, Tenant 配置
├── domain/             JPA 实体、枚举、转换器、仓储
├── event/              EventInboxProcessor（状态机）
├── flow/               ** LiteFlow 流水线（7 组件 + EventContext + EventController）
├── job/                定时任务（等级评估、积分压缩、合并、重试）
├── mapping/            ScriptingTransformer（GraalVM 脚本）
├── member/             OneIdEnrollmentService, MemberMergeService
├── notification/       消息推送（Outbox, SMS, 微信）
├── rules/              Drools 规则引擎（Action, DRL, 回归测试）
├── security/           RBAC, JWT, QuotaBillingSentinel, AuditMonitor
└── spi/                SPI 网关（天猫/京东/抖音/微信处理器）
```

### v7.3 新特性

- **LiteFlow 流水线** — 7 组件事件处理链 + React Flow 可视化设计器
- **包结构重构** — `com.loyalty.saas` → `com.loyalty.platform`
- **规则引擎 API** — 11 个新端点：规则 CRUD、发布、沙箱验证、DRL 测试
- **会员合并 Saga** — 异步合并 + MergeTaskJob（SKIP LOCKED 并发安全）
- **TenantKeyGenerator** — 租户感知 Redis Key 生成器
- **事件时间提取** — 多格式业务时间解析（pay_time、trade、Unix 时间戳）
- **草稿规则编译** — `buildKieBaseWithDraft()` 支持影子沙箱回归

### Campaign Tools v2.0 — 营销活动管理工具

Campaign Tools 是建立在 Loyalty 平台之上的**AI 驱动的营销活动管理平台**，提供从战略规划到执行监控、反馈学习的端到端活动生命周期管理。

**核心功能：**

**1. 战略规划 (Planning)**
- 层级结构：工作区 → 目标 → 举措 → 组合
- 完整状态流转：DRAFT → ACTIVE → PAUSED → COMPLETED → ARCHIVED
- 组合预算优化（贪心算法）

**2. 机会智能 (Opportunity Intelligence)**
- 双引擎混合驱动：内部数据（RFM + ML） + 外部信号（AI 技能）
- 4 个 AI 技能：竞品监控、舆情监控、政策法规、库存风险
- 可配置评分维度，权重可调（流失/增量/转化/RFM）
- 外部信号实时影响系数加权

**3. 营销决策引擎 (Decision Engine)**
- ROI 优先的贪心预算分配算法
- 渠道容量约束 + 注意力预算管理
- 冲突仲裁 + 优先级排序
- What-if 模拟和场景对比

**4. 模拟与优化 (Simulation & Optimization)**
- 基于历史数据的基线转化率计算
- 三层模拟模型：曝光 → 行为 → 转化
- 贪心 + 遗传算法优化
- What-if 场景对比

**5. 画布流程编辑器 (Canvas Editor)**
- 13+ 种节点类型：人群筛选、条件分支、发送邮件/短信/推送、发放积分/优惠券、AI 评分等
- 悬浮可拖拽工具栏，分类折叠展示
- SVG 图标，48×48 正方形节点，圆角边框，悬停显示四方向连接点
- 可视化 DAG 编排，支持拖拽/点击添加，连线条件编辑
- AI 辅助：自然语言生成 DAG 流程

**6. 动态人群筛选 (Dynamic Audience)**
- 行业无关：无预聚合字段，用户自己定义统计指标
- 条件类型：DYNAMIC_STAT（实时 SQL 聚合）+ STATIC_ATTR（静态属性）
- 可配置：数据源、聚合函数、时间窗口、操作符、比较值
- 实时查询：所有条件基于 NOW() 计算，不依赖预计算标签
- 黑名单排除 + 结果上限

**7. 内容与合规 (Content & Compliance)**
- 多渠道内容管理：邮件、短信、Push
- 审批工作流 + 版本历史
- 变量个性化渲染
- 内容验证 + 合规检查

**8. 执行引擎 (Execution Engine)**
- Zeebe 工作流引擎集成
- 11 种 Worker：人群筛选、AI 评分、发送邮件/短信/推送、发放积分/优惠券等
- 部署、启动、暂停、恢复、取消操作
- 实时执行监控 + 状态追踪

**9. 反馈闭环 (Feedback Loop)**
- 预测 vs 实际对比（ROI、转化率、收入）
- 模型漂移检测 + 策略调整
- 事件采集 + 特征存储更新
- 持续学习：执行 → 采集 → 学习 → 优化

**10. 人工干预 (Human Intervention)**
- 运行时活动控制：暂停、恢复、取消
- 节点级控制：跳过、重试、覆盖配置
- 紧急限流 + 一键熔断
- 完整审计追溯

**UI 标准：** 10 个页面统一布局 — 顶部间距 4px，标题 24px 粗体，描述悬停提示，返回按钮右置，卡片间距 12px，表格 14px 不换行省略号。

### License

MIT