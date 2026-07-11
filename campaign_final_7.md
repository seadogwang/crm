## 第7章：System Blueprint（系统蓝图）详细设计
System Blueprint 是 Campaign Tools 的**“工程级施工图”**，定义系统的模块划分、包结构、核心类骨架、API 设计以及各层之间的依赖关系。它让团队在并行开发时有一致的“代码坐标系”。
***
## 7.0 模块概述
### 7.0.1 本质定义
System Blueprint 是 Campaign Tools 的**工程架构说明书**，回答以下问题：
* 代码放在哪里？（包结构）
* 模块之间如何通信？（服务边界 + API）
* 数据如何流转？（数据架构 + 事件流）
* AI 能力如何接入？（AI Engine 体系）
* 如何保证系统可靠性？（分布式一致性 + 闭环）
### 7.0.2 与 Loyalty 系统的架构关系
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Loyalty 平台 (v7.3) - 基础设施层                       │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Spring Boot 3.x  │  PostgreSQL 15  │  Kafka  │  Redis  │  React 18   ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  Loyalty 核心能力层                                                     ││
│  │  · MemberService  · PointGrantService  · ChannelService               ││
│  │  · CouponService  · TierService  · RuleEngineService                  ││
│  │  · LiteFlow (事件处理)  · EventBridge  · Drools                       ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└───────────────────────────────────┬─────────────────────────────────────────┘
                                    │ 依赖/调用
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Campaign Tools - 扩展层 (com.loyalty.platform.campaign)   │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │  planning      │  opportunity   │  decision      │  simulation         ││
│  │  execution     │  event         │  content       │  ai                 ││
│  │  (Zeebe)       │  (复用EventBridge)│               │                     ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```
### 7.0.3 核心设计原则
| 原则         | 说明                                                                  |
| ---------- | ------------------------------------------------------------------- |
| **包路径统一**  | 所有 Campaign 代码位于 `com.loyalty.platform.campaign.*`，与 Loyalty 核心代码隔离 |
| **依赖方向单一** | Campaign → Loyalty（依赖），Loyalty 不依赖 Campaign                         |
| **模块高内聚**  | 每个模块有独立的 Controller/Service/Repository 分层                           |
| **配置外部化**  | 所有环境相关配置在 `application.yml` 中管理                                     |
| **渐进式落地**  | 可先实现核心模块（Planning + Execution），再逐步引入 AI/外部感知                        |
***
## 7.1 总体架构（微服务级）
### 7.1.1 微服务拆分
| 服务名                    | 职责     | 端口   | 说明                                               |
| ---------------------- | ------ | ---- | ------------------------------------------------ |
| `campaign-gateway`     | API 网关 | 8080 | 统一入口，路由转发 + 鉴权                                   |
| `campaign-planning`    | 规划服务   | 8081 | Workspace/Goal/Initiative/Portfolio CRUD + AI 生成 |
| `campaign-opportunity` | 机会服务   | 8082 | 机会发现、ML 评分、外部信号采集                                |
| `campaign-decision`    | 决策服务   | 8083 | 预算分配、仲裁、优先级排序                                    |
| `campaign-simulation`  | 模拟服务   | 8084 | ROI 预测、What-if、优化引擎                              |
| `campaign-execution`   | 执行服务   | 8085 | Zeebe 部署/启动/状态查询 + Worker 集群                     |
| `campaign-event`       | 事件服务   | 8086 | 事件处理 + Feedback Loop                             |
| `campaign-content`     | 内容服务   | 8087 | 素材管理 + 审批流                                       |
| `campaign-ai-engine`   | AI 引擎  | 8088 | LLM 网关 + Prompt 管理 + Skill 注册表                   |
### 7.1.2 服务间调用关系
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         API Gateway (8080)                                  │
└─────────┬───────────────┬───────────────┬───────────────┬─────────────────┘
          │               │               │               │
          ▼               ▼               ▼               ▼
    ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐
    │Planning  │   │Opportunity│   │Decision  │   │Execution │
    │(8081)    │   │(8082)    │   │(8083)    │   │(8085)    │
    └────┬─────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘
         │              │              │              │
         └──────────────┼──────────────┼──────────────┘
                        │              │
                        ▼              ▼
                 ┌──────────┐   ┌──────────┐
                 │Simulation│   │Event     │
                 │(8084)    │   │(8086)    │
                 └────┬─────┘   └────┬─────┘
                      │              │
                      └──────┬───────┘
                             ▼
                      ┌─────────────┐
                      │  AI Engine  │
                      │  (8088)     │
                      └─────────────┘
        所有服务统一调用 Loyalty 核心能力层
```
### 7.1.3 开发阶段 vs 生产阶段
| 组件    | 开发阶段                  | 生产阶段                  |
| ----- | --------------------- | --------------------- |
| 服务拆分  | 单进程（Spring Boot Main） | 独立微服务（K8s Deployment） |
| Zeebe | 嵌入式                   | 独立集群                  |
| Kafka | 模拟/嵌入式                | 独立集群                  |
| 数据库   | 单 PostgreSQL          | PostgreSQL 主从 + 只读副本  |
| 前端    | Vite Dev Server       | Nginx + CDN           |
***
## 7.2 后端工程结构
### 7.2.1 完整包结构
```text
campaign-platform/
├── src/main/java/com/loyalty/platform/campaign/
│   ├── CampaignApplication.java                    # 启动类
│   │
│   ├── common/                                    # 共享模块
│   │   ├── dto/                                   # 通用 DTO
│   │   │   ├── ApiResponse.java
│   │   │   ├── PageRequest.java
│   │   │   └── PageResponse.java
│   │   ├── exception/                             # 异常处理
│   │   │   ├── BusinessException.java
│   │   │   ├── ErrorCode.java
│   │   │   └── GlobalExceptionHandler.java
│   │   ├── util/                                  # 工具类
│   │   │   ├── JsonUtil.java
│   │   │   ├── IdGenerator.java
│   │   │   └── SecurityContext.java
│   │   └── config/                                # 通用配置
│   │       ├── WebConfig.java
│   │       ├── SecurityConfig.java
│   │       └── SwaggerConfig.java
│   │
│   ├── planning/                                  # 规划模块
│   │   ├── controller/
│   │   │   ├── WorkspaceController.java
│   │   │   ├── GoalController.java
│   │   │   ├── InitiativeController.java
│   │   │   └── PortfolioController.java
│   │   ├── service/
│   │   │   ├── WorkspaceService.java
│   │   │   ├── GoalService.java
│   │   │   ├── InitiativeService.java
│   │   │   ├── PortfolioService.java
│   │   │   └── PlanningContextService.java
│   │   ├── repository/
│   │   │   ├── WorkspaceRepository.java
│   │   │   ├── GoalRepository.java
│   │   │   ├── InitiativeRepository.java
│   │   │   └── PortfolioRepository.java
│   │   └── model/
│   │       ├── Workspace.java
│   │       ├── Goal.java
│   │       ├── Initiative.java
│   │       └── Portfolio.java
│   │
│   ├── opportunity/                               # 机会模块
│   │   ├── controller/
│   │   │   └── OpportunityController.java
│   │   ├── service/
│   │   │   ├── OpportunityService.java
│   │   │   ├── ExternalSignalService.java
│   │   │   └── MLScoringClient.java
│   │   ├── skill/                                 # 外部感知技能
│   │   │   ├── ExternalSkill.java
│   │   │   ├── SkillRegistry.java
│   │   │   ├── CompetitorMonitorSkill.java
│   │   │   └── SocialListeningSkill.java
│   │   └── repository/
│   │       ├── OpportunityRepository.java
│   │       └── ExternalSignalRepository.java
│   │
│   ├── decision/                                  # 决策模块
│   │   ├── controller/
│   │   │   └── DecisionController.java
│   │   ├── service/
│   │   │   ├── DecisionEngine.java
│   │   │   ├── AttentionBudgetService.java
│   │   │   └── ArbitrationEngine.java
│   │   └── repository/
│   │       ├── DecisionResultRepository.java
│   │       └── BudgetAllocationRepository.java
│   │
│   ├── simulation/                                # 模拟模块
│   │   ├── controller/
│   │   │   └── SimulationController.java
│   │   ├── service/
│   │   │   ├── SimulationEngine.java
│   │   │   ├── OptimizationEngine.java
│   │   │   └── AICampaignGenerator.java
│   │   └── repository/
│   │       └── SimulationResultRepository.java
│   │
│   ├── execution/                                 # 执行模块（核心）
│   │   ├── controller/
│   │   │   ├── ExecutionController.java
│   │   │   └── CanvasController.java
│   │   ├── service/
│   │   │   ├── ZeebeDeployService.java
│   │   │   ├── ZeebeExecutionService.java
│   │   │   └── IdempotencyManager.java
│   │   ├── compiler/                              # BPMN 编译器
│   │   │   └── CanvasToBpmnCompiler.java
│   │   ├── worker/                                # Zeebe Workers
│   │   │   ├── BaseCampaignWorker.java
│   │   │   ├── AudienceFilterWorker.java
│   │   │   ├── AIScoreWorker.java
│   │   │   ├── SendEmailWorker.java
│   │   │   ├── SendSMSWorker.java
│   │   │   ├── OfferPointsWorker.java
│   │   │   ├── OfferCouponWorker.java
│   │   │   └── ApprovalWorker.java
│   │   └── repository/
│   │       ├── CampaignPlanRepository.java
│   │       ├── ZeebeInstanceRepository.java
│   │       ├── ZeebeTaskRepository.java
│   │       └── ExecutionDedupRepository.java
│   │
│   ├── event/                                     # 事件模块
│   │   ├── publisher/
│   │   │   └── CampaignEventPublisher.java
│   │   ├── processor/
│   │   │   └── CampaignEventProcessor.java
│   │   ├── feedback/
│   │   │   ├── FeedbackLoopService.java
│   │   │   └── FeatureStoreService.java
│   │   └── repository/
│   │       ├── FeedbackMetricsRepository.java
│   │       └── ModelDriftRepository.java
│   │
│   ├── content/                                   # 内容模块
│   │   ├── controller/
│   │   │   └── ContentController.java
│   │   ├── service/
│   │   │   ├── ContentService.java
│   │   │   └── ApprovalService.java
│   │   └── repository/
│   │       └── ContentAssetRepository.java
│   │
│   ├── ai/                                        # AI 引擎
│   │   ├── client/
│   │   │   └── LLMClient.java
│   │   ├── prompt/
│   │   │   ├── PromptTemplate.java
│   │   │   └── PromptRegistry.java
│   │   └── orchestrator/
│   │       └── AIPlanner.java
│   │
│   └── config/                                    # 配置类
│       ├── ZeebeConfig.java
│       ├── KafkaConfig.java
│       ├── RedisConfig.java
│       ├── RestTemplateConfig.java
│       └── SchedulingConfig.java
│
├── src/main/resources/
│   ├── application.yml
│   ├── application-dev.yml
│   ├── application-prod.yml
│   ├── db/
│   │   └── migration/                             # Flyway/Liquibase 脚本
│   │       ├── V1__create_workspace_tables.sql
│   │       ├── V2__create_opportunity_tables.sql
│   │       └── ...
│   ├── bpmn/                                      # 预置 BPMN 模板
│   │   └── campaign_flow_template.bpmn
│   └── prompts/                                   # AI Prompt 模板
│       ├── plan_generation.txt
│       ├── dag_generation.txt
│       └── content_generation.txt
│
└── src/test/java/
    ├── unit/
    └── integration/
```
### 7.2.2 模块依赖关系（Maven）
xml
运行
```
<!-- pom.xml 核心依赖 -->
<dependencies>
    <!-- Spring Boot Starter -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-web</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-validation</artifactId>
    </dependency>
    
    <!-- Zeebe -->
    <dependency>
        <groupId>io.camunda</groupId>
        <artifactId>spring-boot-starter-camunda</artifactId>
        <version>8.5.0</version>
    </dependency>
    <dependency>
        <groupId>io.camunda</groupId>
        <artifactId>zeebe-client-java</artifactId>
        <version>8.5.0</version>
    </dependency>
    
    <!-- Kafka -->
    <dependency>
        <groupId>org.springframework.kafka</groupId>
        <artifactId>spring-kafka</artifactId>
    </dependency>
    
    <!-- Database -->
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
    </dependency>
    <dependency>
        <groupId>org.flywaydb</groupId>
        <artifactId>flyway-core</artifactId>
    </dependency>
    
    <!-- Utility -->
    <dependency>
        <groupId>com.fasterxml.jackson.core</groupId>
        <artifactId>jackson-databind</artifactId>
    </dependency>
    <dependency>
        <groupId>org.projectlombok</groupId>
        <artifactId>lombok</artifactId>
    </dependency>
    <dependency>
        <groupId>org.apache.commons</groupId>
        <artifactId>commons-lang3</artifactId>
    </dependency>
    
    <!-- Loyalty 模块依赖（内网Maven） -->
    <dependency>
        <groupId>com.loyalty.platform</groupId>
        <artifactId>loyalty-core</artifactId>
        <version>${loyalty.version}</version>
    </dependency>
    <dependency>
        <groupId>com.loyalty.platform</groupId>
        <artifactId>loyalty-event-bridge</artifactId>
        <version>${loyalty.version}</version>
    </dependency>
</dependencies>
```
***
## 7.3 前端工程结构
### 7.3.1 目录结构
```text
campaign-ui/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
│
├── src/
│   ├── main.tsx                                  # 入口文件
│   ├── App.tsx                                   # 根组件
│   ├── routes.tsx                                # 路由配置
│   │
│   ├── pages/                                    # 页面组件
│   │   ├── Workspace/
│   │   │   ├── WorkspaceList.tsx
│   │   │   ├── WorkspaceDetail.tsx
│   │   │   └── components/
│   │   │       ├── GoalPanel.tsx
│   │   │       ├── InitiativePanel.tsx
│   │   │       └── PortfolioPanel.tsx
│   │   ├── Opportunity/
│   │   │   ├── OpportunityList.tsx
│   │   │   ├── OpportunityDetail.tsx
│   │   │   └── ExternalSignalDashboard.tsx
│   │   ├── Decision/
│   │   │   └── DecisionEngine.tsx
│   │   ├── Simulation/
│   │   │   └── SimulationDashboard.tsx
│   │   ├── Execution/
│   │   │   ├── ExecutionMonitor.tsx
│   │   │   └── ExecutionHistory.tsx
│   │   ├── Canvas/
│   │   │   ├── CanvasEditor.tsx
│   │   │   ├── NodePalette.tsx
│   │   │   └── InspectorPanel.tsx
│   │   ├── Content/
│   │   │   ├── AssetList.tsx
│   │   │   └── ApprovalWorkflow.tsx
│   │   └── Dashboard/
│   │       └── CampaignDashboard.tsx
│   │
│   ├── components/                               # 通用组件
│   │   ├── common/
│   │   │   ├── Layout.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── charts/
│   │   │   ├── ROIChart.tsx
│   │   │   ├── ProgressGauge.tsx
│   │   │   └── AllocationChart.tsx
│   │   └── forms/
│   │       ├── GoalForm.tsx
│   │       ├── InitiativeForm.tsx
│   │       └── PortfolioForm.tsx
│   │
│   ├── hooks/                                    # 自定义 Hooks
│   │   ├── useWorkspace.ts
│   │   ├── useOpportunity.ts
│   │   ├── useDecision.ts
│   │   ├── useSimulation.ts
│   │   ├── useExecution.ts
│   │   └── useEventStream.ts
│   │
│   ├── services/                                 # API 服务
│   │   ├── api-client.ts
│   │   ├── workspace.service.ts
│   │   ├── opportunity.service.ts
│   │   ├── decision.service.ts
│   │   ├── simulation.service.ts
│   │   ├── execution.service.ts
│   │   └── content.service.ts
│   │
│   ├── store/                                    # 状态管理 (Zustand)
│   │   ├── workspace.store.ts
│   │   ├── execution.store.ts
│   │   └── notification.store.ts
│   │
│   ├── types/                                    # TypeScript 类型
│   │   ├── campaign.d.ts
│   │   ├── execution.d.ts
│   │   └── api.d.ts
│   │
│   └── utils/                                    # 工具函数
│       ├── dag-validator.ts
│       ├── date-utils.ts
│       └── format-utils.ts
│
├── public/
│   └── assets/
│
└── docker/
    └── nginx.conf
```
### 7.3.2 路由设计
```typescript
// routes.tsx
import { createBrowserRouter } from 'react-router-dom';
export const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Dashboard /> },
      {
        path: 'workspaces',
        children: [
          { index: true, element: <WorkspaceList /> },
          { path: ':workspaceId', element: <WorkspaceDetail /> },
          { path: ':workspaceId/goals/:goalId', element: <GoalDetail /> }
        ]
      },
      {
        path: 'opportunity',
        children: [
          { index: true, element: <OpportunityList /> },
          { path: ':opportunityId', element: <OpportunityDetail /> },
          { path: 'signals', element: <ExternalSignalDashboard /> }
        ]
      },
      {
        path: 'decision',
        children: [
          { index: true, element: <DecisionEngine /> }
        ]
      },
      {
        path: 'simulation',
        children: [
          { index: true, element: <SimulationDashboard /> }
        ]
      },
      {
        path: 'execution',
        children: [
          { path: ':planId', element: <ExecutionMonitor /> },
          { path: 'history', element: <ExecutionHistory /> }
        ]
      },
      {
        path: 'canvas',
        children: [
          { path: ':planId', element: <CanvasEditor /> }
        ]
      },
      {
        path: 'content',
        children: [
          { index: true, element: <AssetList /> },
          { path: 'approvals', element: <ApprovalWorkflow /> }
        ]
      }
    ]
  }
]);
```
***
## 7.4 数据架构（统一模型）
### 7.4.1 数据域划分
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Campaign 数据域                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Planning 域          │  Execution 域          │  Event 域                │
│  · workspace          │  · plan                │  · event_inbox (复用)    │
│  · goal               │  · canvas              │  · feedback_metrics      │
│  · initiative         │  · zeebe_instance      │  · model_drift           │
│  · portfolio          │  · zeebe_task          │  · strategy_adjustment   │
│                       │  · execution_dedup     │                         │
├───────────────────────┼───────────────────────┼─────────────────────────┤
│  Opportunity 域       │  Decision 域           │  Content 域              │
│  · opportunity        │  · decision_result     │  · content_asset         │
│  · external_signal    │  · budget_allocation   │  · approval_record       │
│  · member_dim (同步)  │  · attention_budget    │                         │
│  · order_fact (同步)  │  · arbitration_log     │                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Loyalty 数据域（只读同步）                             │
│  · member  · account_transaction  · tier_definition  · rule_definition    │
│  · event_inbox  · program  · behavior_code                               │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 7.4.2 数据同步策略
| 数据类型  | 来源                            | 同步方式           | 频率     | 存储位置                  |
| ----- | ----------------------------- | -------------- | ------ | --------------------- |
| 会员主数据 | Loyalty `member`              | CDC (Debezium) | 实时     | `campaign_member_dim` |
| 订单数据  | Loyalty `account_transaction` | CDC            | 实时     | `campaign_order_fact` |
| 等级定义  | Loyalty `tier_definition`     | 定时查询           | 每 1 小时 | 缓存 + 本地表              |
| 规则定义  | Loyalty `rule_definition`     | 定时查询           | 每 1 小时 | 本地表                   |
| 程序配置  | Loyalty `program`             | 启动时加载          | 启动时    | 内存缓存                  |
| 事件数据  | Loyalty `event_inbox`         | Kafka 消费       | 实时     | 本地消费                  |
### 7.4.3 数据表清单（汇总）
| 序号 | 表名                                       | 所属模块        | 说明                      |
| -- | ---------------------------------------- | ----------- | ----------------------- |
| 1  | `campaign_workspace`                     | Planning    | 工作区                     |
| 2  | `campaign_workspace_member`              | Planning    | 工作区成员                   |
| 3  | `campaign_workspace_snapshot`            | Planning    | 工作区快照                   |
| 4  | `campaign_goal`                          | Planning    | 目标                      |
| 5  | `campaign_goal_kpi`                      | Planning    | 目标 KPI                  |
| 6  | `campaign_goal_version`                  | Planning    | 目标版本                    |
| 7  | `campaign_initiative`                    | Planning    | 举措                      |
| 8  | `campaign_initiative_kpi`                | Planning    | 举措 KPI                  |
| 9  | `campaign_initiative_plan_relation`      | Planning    | Initiative-Plan 关系      |
| 10 | `campaign_portfolio`                     | Planning    | 组合                      |
| 11 | `campaign_portfolio_initiative_relation` | Planning    | Portfolio-Initiative 关系 |
| 12 | `campaign_portfolio_kpi`                 | Planning    | Portfolio KPI           |
| 13 | `campaign_plan`                          | Execution   | 计划（含 Zeebe 字段）          |
| 14 | `campaign_canvas`                        | Execution   | 画布（可合并到 plan）           |
| 15 | `campaign_zeebe_instance`                | Execution   | Zeebe 执行实例              |
| 16 | `campaign_zeebe_task`                    | Execution   | Zeebe 任务明细              |
| 17 | `campaign_execution_dedup`               | Execution   | 执行去重表                   |
| 18 | `campaign_opportunity`                   | Opportunity | 机会                      |
| 19 | `campaign_external_signal`               | Opportunity | 外部信号                    |
| 20 | `campaign_member_dim`                    | Opportunity | 会员宽表（同步）                |
| 21 | `campaign_order_fact`                    | Opportunity | 订单事实表（同步）               |
| 22 | `campaign_decision_result`               | Decision    | 决策结果                    |
| 23 | `campaign_budget_allocation`             | Decision    | 预算分配明细                  |
| 24 | `campaign_attention_budget`              | Decision    | 注意力预算                   |
| 25 | `campaign_attention_consumption`         | Decision    | 注意力消耗                   |
| 26 | `campaign_arbitration_log`               | Decision    | 仲裁日志                    |
| 27 | `campaign_simulation_result`             | Simulation  | 模拟结果                    |
| 28 | `campaign_simulation_scenario`           | Simulation  | What-if 场景              |
| 29 | `campaign_optimization_result`           | Simulation  | 优化结果                    |
| 30 | `campaign_content_asset`                 | Content     | 内容素材                    |
| 31 | `campaign_approval_record`               | Content     | 审批记录                    |
| 32 | `campaign_intervention_command`          | Content     | 干预指令                    |
| 33 | `campaign_feedback_metrics`              | Event       | 反馈指标                    |
| 34 | `campaign_model_drift`                   | Event       | 模型漂移                    |
| 35 | `campaign_strategy_adjustment`           | Event       | 策略调整                    |
***
## 7.5 MQ/事件体系
### 7.5.1 Kafka Topics
| Topic                        | 说明          | 生产者                      | 消费者                      |
| ---------------------------- | ----------- | ------------------------ | ------------------------ |
| `loyalty.event.campaign`     | Campaign 事件 | `CampaignEventPublisher` | `CampaignEventProcessor` |
| `loyalty.event.user`         | 用户行为事件（已有）  | Loyalty 系统               | `CampaignEventProcessor` |
| `loyalty.event.system`       | 系统事件        | 各模块                      | 监控/告警                    |
| `campaign.execution.control` | 执行控制命令      | 决策引擎                     | Execution Service        |
### 7.5.2 事件 Schema
```json
{
  "eventId": "evt_001",
  "eventType": "CAMPAIGN_NODE_EXECUTED",
  "source": "campaign-execution",
  "timestamp": "2026-06-26T10:00:00Z",
  "programCode": "BRAND_A",
  "userId": null,
  "payload": {
    "planId": "plan_001",
    "nodeId": "N4",
    "nodeType": "SEND_EMAIL",
    "status": "SUCCESS",
    "durationMs": 1234,
    "output": { "sentCount": 123, "failCount": 0 }
  }
}
```
***
## 7.6 AI Engine 体系
### 7.6.1 AI 模块职责
| 组件                    | 职责                          | 调用方                                |
| --------------------- | --------------------------- | ---------------------------------- |
| `LLMClient`           | LLM API 调用（OpenAI/阿里云/私有部署） | 所有 AI 功能                           |
| `PromptRegistry`      | Prompt 模板管理（版本化、多租户）        | `AIPlanner`, `AICampaignGenerator` |
| `AIPlanner`           | 策略生成（Plan 生成）               | `PlanningService`                  |
| `AICampaignGenerator` | DAG 生成                      | `SimulationEngine`                 |
| `ExternalSkill`       | 外部感知技能（竞品/舆情）               | `ExternalSignalService`            |
| `SkillRegistry`       | 技能注册表                       | `ExternalSignalService`            |
### 7.6.2 Prompt 模板管理
```sql
CREATE TABLE campaign_prompt_template (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    template_code VARCHAR(64) NOT NULL,
    template_name VARCHAR(255),
    template_type VARCHAR(32),           -- PLAN_GENERATION / DAG_GENERATION / CONTENT_GENERATION
    system_prompt TEXT,
    user_prompt_template TEXT,
    output_schema JSONB,
    version INT DEFAULT 1,
    status VARCHAR(32) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, template_code, version)
);
```
### 7.6.3 LLMClient 实现
```java
@Component
public class LLMClient {
    
    @Value("${llm.provider:openai}")
    private String provider;
    
    @Value("${llm.api.url}")
    private String apiUrl;
    
    @Value("${llm.api.key}")
    private String apiKey;
    
    @Value("${llm.model:gpt-4}")
    private String model;
    
    public String chat(String systemPrompt, String userPrompt) {
        // 根据 provider 调用不同 API
        switch (provider) {
            case "openai":
                return callOpenAI(systemPrompt, userPrompt);
            case "aliyun":
                return callAliyun(systemPrompt, userPrompt);
            case "mock":
                return mockResponse(userPrompt);
            default:
                throw new UnsupportedOperationException("Provider: " + provider);
        }
    }
    
    public String chatWithTools(String prompt, List<ToolDefinition> tools) {
        // 带工具调用的 Chat
        // ...
    }
    
    private String callOpenAI(String system, String user) {
        // HTTP 调用 OpenAI API
        // ...
    }
}
```
***
## 7.7 执行运行时
### 7.7.1 Execution Runtime 组件
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Execution Runtime                                   │
│                                                                             │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Zeebe Workflow Engine (8.5)                                        │ │
│  │  · Process Instance Management                                      │ │
│  │  · Job Queue & Worker Distribution                                  │ │
│  │  · State Persistence (事件溯源)                                      │ │
│  │  · Timer/Message Events                                             │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Worker Cluster (水平扩展)                                           │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                │ │
│  │  │ Worker-1 │ │ Worker-2 │ │ Worker-3 │ │ Worker-N │                │ │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘                │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                    │                                        │
│                                    ▼                                        │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  Idempotency Layer                                                   │ │
│  │  · Dedup Table (PostgreSQL)                                          │ │
│  │  · Redis Cache for Fast Check                                        │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 7.7.2 Zeebe 部署配置（生产）
yaml
```
# application-prod.yml
zeebe:
  client:
    broker:
      gateway-address: zeebe-gateway.campaign.svc.cluster.local:26500
    security:
      plaintext: false
      certificate-path: /etc/certs/zeebe.crt
    default-request-timeout: 30s
  worker:
    default:
      timeout: 30000
      max-jobs-active: 32
      poll-interval: 100ms
# Zeebe 集群配置（Helm Values）
zeebe-cluster:
  replicas: 3
  resources:
    requests:
      cpu: 500m
      memory: 2Gi
    limits:
      cpu: 2000m
      memory: 4Gi
  persistence:
    enabled: true
    size: 10Gi
  gateway:
    replicas: 2
```
***
## 7.8 API Gateway 设计
### 7.8.1 路由配置（Spring Cloud Gateway）
yaml
```
# gateway/application.yml
spring:
  cloud:
    gateway:
      routes:
        - id: planning
          uri: lb://campaign-planning
          predicates:
            - Path=/api/planning/**
          filters:
            - StripPrefix=1
            
        - id: opportunity
          uri: lb://campaign-opportunity
          predicates:
            - Path=/api/opportunity/**
          filters:
            - StripPrefix=1
            
        - id: decision
          uri: lb://campaign-decision
          predicates:
            - Path=/api/decision/**
          filters:
            - StripPrefix=1
            
        - id: simulation
          uri: lb://campaign-simulation
          predicates:
            - Path=/api/simulation/**
          filters:
            - StripPrefix=1
            
        - id: execution
          uri: lb://campaign-execution
          predicates:
            - Path=/api/execution/**
          filters:
            - StripPrefix=1
            
        - id: content
          uri: lb://campaign-content
          predicates:
            - Path=/api/content/**
          filters:
            - StripPrefix=1
```
### 7.8.2 API 分组汇总
| 前缀                 | 服务          | 示例                          |
| ------------------ | ----------- | --------------------------- |
| `/api/planning`    | Planning    | `/api/planning/workspace`   |
| `/api/opportunity` | Opportunity | `/api/opportunity/discover` |
| `/api/decision`    | Decision    | `/api/decision/execute`     |
| `/api/simulation`  | Simulation  | `/api/simulation/run`       |
| `/api/execution`   | Execution   | `/api/execution/start`      |
| `/api/content`     | Content     | `/api/content/asset`        |
| `/api/ai`          | AI Engine   | `/api/ai/generate`          |
***
## 7.9 Java Service 核心骨架示例
### 7.9.1 统一响应格式
```java
@Data
@AllArgsConstructor
@NoArgsConstructor
public class ApiResponse<T> {
    private int code;
    private String message;
    private T data;
    private long timestamp = System.currentTimeMillis();
    
    public static <T> ApiResponse<T> success(T data) {
        return new ApiResponse<>(0, "success", data, System.currentTimeMillis());
    }
    
    public static <T> ApiResponse<T> error(int code, String message) {
        return new ApiResponse<>(code, message, null, System.currentTimeMillis());
    }
}
```
### 7.9.2 全局异常处理
```java
@RestControllerAdvice
@Slf4j
public class GlobalExceptionHandler {
    
    @ExceptionHandler(BusinessException.class)
    public ApiResponse<Void> handleBusinessException(BusinessException e) {
        log.warn("Business exception: {}", e.getMessage());
        return ApiResponse.error(e.getCode(), e.getMessage());
    }
    
    @ExceptionHandler(Exception.class)
    public ApiResponse<Void> handleException(Exception e) {
        log.error("Unexpected error: ", e);
        return ApiResponse.error(500, "Internal server error: " + e.getMessage());
    }
}
```
### 7.9.3 Service 骨架模板
```java
@Service
@Slf4j
@RequiredArgsConstructor
public class ExampleService {
    
    private final ExampleRepository repository;
    private final CampaignEventPublisher eventPublisher;
    
    @Transactional
    public ExampleEntity create(CreateRequest request) {
        // 1. 业务校验
        validate(request);
        
        // 2. 构建实体
        ExampleEntity entity = ExampleEntity.builder()
                .id(IdGenerator.generate())
                .name(request.getName())
                .build();
        
        // 3. 保存
        entity = repository.save(entity);
        
        // 4. 发布事件
        eventPublisher.publishExampleCreated(entity);
        
        // 5. 返回
        return entity;
    }
}
```
***
## 7.10 前端 Canvas 与菜单设计
### 7.10.1 菜单结构
```text
📊 营销工作台
├── 🏠 仪表板 (Dashboard)
├── 📋 工作区 (Workspace)
│   ├── 工作区列表
│   └── 工作区详情
│       ├── 目标管理 (Goal)
│       ├── 举措管理 (Initiative)
│       └── 组合管理 (Portfolio)
├── 🔍 机会发现 (Opportunity)
│   ├── 机会列表
│   ├── 外部信号监控
│   └── AI 分析
├── 🎯 决策引擎 (Decision)
│   └── 预算分配与仲裁
├── 📈 模拟优化 (Simulation)
│   ├── 模拟运行
│   ├── What-if 对比
│   └── 优化结果
├── 🎨 活动画布 (Canvas)
│   ├── 画布编辑器
│   └── 画布列表
├── ⚙️ 执行监控 (Execution)
│   ├── 实时监控
│   └── 执行历史
├── 📝 内容管理 (Content)
│   ├── 素材管理
│   └── 审批流程
└── 🔔 反馈闭环 (Feedback)
    ├── 反馈分析
    └── 策略调整
```
### 7.10.2 Canvas 编辑器布局
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  Campaign Canvas                                                           │
│  [保存] [部署] [启动] [模拟] [验证]                           [帮助] [设置] │
├──────────┬──────────────────────────────────────────────────┬───────────────┤
│ 节点面板  │  画布 (React Flow)                              │ 属性面板      │
│          │                                                │               │
│ ┌──────┐ │  ┌──────────────────────────────────────────┐ │ ┌───────────┐ │
│ │人群筛选│ │  │                                          │ │ │ 节点类型   │ │
│ ├──────┤ │  │    [START]                               │ │ │ 发送邮件   │ │
│ │条件分支│ │  │       │                                 │ │ │ 节点名称   │ │
│ ├──────┤ │  │       ▼                                 │ │ │ [________]│ │
│ │AI评分 │ │  │  [人群筛选]                              │ │ │           │ │
│ ├──────┤ │  │       │                                 │ │ │ 素材模板   │ │
│ │延迟等待│ │  │       ▼                                 │ │ │ [▼ 选择]  │ │
│ ├──────┤ │  │  [条件分支] ── [发送邮件] ── [END]      │ │ │           │ │
│ │发送邮件│ │  │       │                                 │ │ │ 重试次数   │ │
│ ├──────┤ │  │       └── [发送短信] ── [END]            │ │ │ [3]       │ │
│ │发放积分│ │  │                                          │ │ │           │ │
│ ├──────┤ │  │                                          │ │ │ [保存]    │ │
│ │审批节点│ │  │                                          │ │ │           │ │
│ └──────┘ │  │                                          │ │ └───────────┘ │
│          │  └──────────────────────────────────────────┘ │               │
│ [拖拽添加]│  缩放: 80%  节点: 5  边: 4                   │ [验证结果]   │
└──────────┴──────────────────────────────────────────────────┴───────────────┘
│ 底部状态栏: ✅ DAG 有效  |  已保存  |  最后更新: 10:23:45                 │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 7.11 分布式一致性设计
### 7.11.1 幂等保证
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Idempotency Flow                                   │
│                                                                             │
│  Worker 收到 Job                                                           │
│       │                                                                     │
│       ▼                                                                     │
│  构建幂等 Key = planId + nodeId + userId + channel                         │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────┐                               │
│  │  SELECT FOR UPDATE ON execution_dedup  │                               │
│  └─────────────────────────────────────────┘                               │
│       │                                                                     │
│       ├───────────────┬───────────────────┐                               │
│       ▼               ▼                   ▼                               │
│  ┌────────┐     ┌────────┐          ┌────────┐                           │
│  │ 已存在  │     │ 不存在  │          │ 冲突   │                           │
│  │ SKIP   │     │ 执行    │          │ 回滚   │                           │
│  └────────┘     └────────┘          └────────┘                           │
│                      │                                                      │
│                      ▼                                                      │
│               INSERT INTO dedup                                            │
│                      │                                                      │
│                      ▼                                                      │
│               执行业务逻辑                                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 7.11.2 幂等实现代码
```java
@Component
public class IdempotencyManager {
    
    private static final int LOCK_TIMEOUT_SECONDS = 60;
    
    @Autowired
    private ExecutionDedupRepository dedupRepository;
    
    @Autowired
    private RedisTemplate<String, String> redisTemplate;
    
    /**
     * 幂等执行（带分布式锁）
     */
    public <T> T executeIdempotent(String key, Supplier<T> action) {
        // 1. 检查 Redis 缓存（快速路径）
        String cacheKey = "idempotent:" + key;
        String cached = redisTemplate.opsForValue().get(cacheKey);
        if (cached != null) {
            log.debug("Idempotent check: key {} already executed (cache)", key);
            return null;
        }
        
        // 2. 数据库检查
        if (dedupRepository.existsById(key)) {
            log.debug("Idempotent check: key {} already executed (db)", key);
            return null;
        }
        
        // 3. 分布式锁
        String lockKey = "lock:idempotent:" + key;
        Boolean locked = redisTemplate.opsForValue()
                .setIfAbsent(lockKey, "LOCKED", Duration.ofSeconds(LOCK_TIMEOUT_SECONDS));
        
        if (!Boolean.TRUE.equals(locked)) {
            // 等待重试
            return executeIdempotent(key, action);
        }
        
        try {
            // 4. 再次检查（双重检查）
            if (dedupRepository.existsById(key)) {
                return null;
            }
            
            // 5. 执行业务逻辑
            T result = action.get();
            
            // 6. 记录幂等
            ExecutionDedup dedup = ExecutionDedup.builder()
                    .idempotencyKey(key)
                    .executedAt(Instant.now())
                    .ttl(Instant.now().plus(7, ChronoUnit.DAYS))
                    .build();
            dedupRepository.save(dedup);
            
            // 7. 缓存到 Redis（加速后续检查）
            redisTemplate.opsForValue().set(cacheKey, "1", Duration.ofHours(24));
            
            return result;
            
        } finally {
            redisTemplate.delete(lockKey);
        }
    }
}
```
### 7.11.3 Saga 补偿机制
Zeebe 原生支持 Saga 模式，通过 `incident` 和 `compensation` 实现。
xml
运行
```
<!-- BPMN 中的补偿定义 -->
<bpmn:serviceTask id="Activity_1" name="发放积分" 
                  zeebe:taskType="campaign-offer-points">
  <bpmn:extensionElements>
    <zeebe:taskDefinition type="campaign-offer-points" />
    <zeebe:taskHeaders>
      <zeebe:header key="compensation" value="true" />
    </zeebe:taskHeaders>
  </bpmn:extensionElements>
</bpmn:serviceTask>
<!-- 补偿任务 -->
<bpmn:serviceTask id="Activity_Compensate" name="回滚积分"
                  isForCompensation="true"
                  zeebe:taskType="campaign-rollback-points">
  <bpmn:extensionElements>
    <zeebe:taskDefinition type="campaign-rollback-points" />
  </bpmn:extensionElements>
</bpmn:serviceTask>
```
***
## 7.12 系统闭环总图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Campaign Tools 完整闭环                            │
│                                                                             │
│  1. Planning (目标设定)                                                     │
│     Workspace → Goal → Initiative → Portfolio                              │
│                        │                                                     │
│                        ▼                                                     │
│  2. Opportunity (机会发现)                                                  │
│     内部数据 (Loyalty) + 外部信号 (AI Skills) → Opportunity Set            │
│                        │                                                     │
│                        ▼                                                     │
│  3. Decision (决策)                                                        │
│     预算分配 → 注意力预算 → 冲突仲裁 → 优先级排序                           │
│                        │                                                     │
│                        ▼                                                     │
│  4. Simulation (模拟)                                                      │
│     ROI 预测 → What-if 对比 → AI 生成 DAG                                  │
│                        │                                                     │
│                        ▼                                                     │
│  5. Execution (执行)                                                       │
│     Compiler → Zeebe Deploy → Start → Workers → Loyalty 服务              │
│                        │                                                     │
│                        ▼                                                     │
│  6. Event (事件采集)                                                       │
│     曝光/互动/转化事件 → Kafka → Feature Store                             │
│                        │                                                     │
│                        ▼                                                     │
│  7. Feedback (闭环)                                                        │
│     偏差检测 → 模型漂移 → 策略调整 → AI 重新规划                           │
│                        │                                                     │
│                        └──────────────────┐                                │
│                                           ▼                                │
│                              ┌─────────────────────────┐                  │
│                              │  回到 Step 1-4 持续优化 │                  │
│                              └─────────────────────────┘                  │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 7.13 与 Loyalty 系统集成点清单
| 集成点      | Loyalty 组件                        | 调用时机           | 所属模块      |
| -------- | --------------------------------- | -------------- | --------- |
| 会员查询     | `MemberService.findByMemberId()`  | Worker 执行      | Execution |
| 程序信息     | `ProgramService.findByCode()`     | Workspace 创建   | Planning  |
| 积分发放     | `PointGrantService.grantPoints()` | 发放积分节点         | Execution |
| 优惠券发放    | `CouponService.issueCoupon()`     | 发放优惠券节点        | Execution |
| 消息发送     | `ChannelService.sendEmail()`      | 发送邮件/短信        | Execution |
| 等级变更     | `TierService.upgrade()`           | 等级直升节点         | Execution |
| 事件发布     | `EventBridge.publish()`           | 各模块事件发布        | Event     |
| 事件消费     | Kafka (`loyalty.event.*`)         | 事件处理           | Event     |
| 规则引用     | `RuleDefinitionRepository`        | 引用已有规则         | Planning  |
| LiteFlow | 保持不变                              | Loyalty 核心事件处理 | 不涉及       |
***
## 7.14 开发实施检查清单
* 创建完整包结构（`com.loyalty.platform.campaign.*`）
* 配置 Maven/Gradle 依赖（Spring Boot + Zeebe + Kafka + Loyalty 模块）
* 创建 Flyway 迁移脚本（35 张表）
* 配置 `application.yml`（dev/prod 环境）
* 实现 `ApiResponse` + `GlobalExceptionHandler`
* 实现 `IdempotencyManager`
* 配置 API Gateway 路由
* 初始化前端工程（React + TypeScript + Vite）
* 实现前端路由和菜单结构
* 配置 `LLMClient` 和 `PromptRegistry`
* 配置 `EventBridge` 和 Kafka Consumer
* 配置 Zeebe 客户端（开发嵌入式 + 生产独立）
* 编写集成测试验证模块间调用
* 编写部署脚本（Docker Compose + K8s Helm）
