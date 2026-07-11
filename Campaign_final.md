# 基于AI的下一代全渠道忠诚度管理SaaS平台 – Campaign Tools 详细设计（Loyalty融合版）
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：5.0（最终融合版）\
> **设计原则**：
>
> * **Loyalty优先**：Campaign Tools 是 Loyalty 平台的营销决策与执行扩展层，非独立系统
>
> * **复用优先**：最大程度复用 Loyalty 现有能力（EventBridge、LiteFlow、数据模型、React Flow）
>
> * **执行引擎**：**Zeebe 统一执行 Campaign 流程**，LiteFlow 继续服务 Loyalty 核心事件处理（幂等、标准化、One‑ID），两者共存
>
> * **AI原生**：Planning 阶段由 AI 驱动，Execution 阶段 AI 辅助，外部感知提供实时市场情报
>
> * **生产就绪**：涵盖内容合规、人工干预、外部感知、闭环学习，满足企业级合规与风控要求
***
## 目录
* 1. 系统概述
* 1. Planning Workspace
* 2. Opportunity Intelligence（含外部感知AI技能）
* 3. Marketing Decision Engine
* 4. Simulation & Optimization
* 5. Campaign Execution Engine（Zeebe）
* 6. Event System + Feedback Loop
* 7. System Blueprint
* 8. Production‑grade Canvas + Flow Engine
* 9. Canvas → BPMN Compiler（含AI→DAG Prompt体系）
* 10. Node Config Schema System
* 11. End‑to‑End Execution Runtime
* 12. Production Reference Architecture
* 13. Content & Compliance Governance
* 14. Human Override & Intervention System
* 附录A：数据同步设计（CDC + 定时）
* 附录B：开发阶段技术简化方案
***
## 0. 系统概述
### 0.1 系统定位
**Campaign Tools 是 Loyalty 平台的营销决策与执行扩展层**，提供从目标设定、机会发现、策略生成、画布编排、审批合规、人工干预到执行反馈的全链路闭环。
**核心能力**：
1. **营销决策（Planning）** – AI 驱动的目标管理、机会发现、策略生成
2. **营销执行（Execution）** – 画布编排 + Zeebe 工作流引擎，调用 Loyalty 能力
3. **外部感知（Sensing）** – AI Skills 采集竞品、舆情、政策等外部信号，动态调整策略
4. **智能闭环（Feedback）** – 执行结果回流，持续优化 AI 模型与策略
### 0.2 数据边界
* **输入**：通过 CDC（生产）或定时同步（开发）从 Loyalty 同步会员、订单、行为、积分、等级数据
* **输出**：Campaign Plan → Execution → 调用 Loyalty 能力（积分/优惠券/消息/等级）
* **存储**：Campaign Tools 不存储主数据，只存储规划、画布、执行日志、审批记录等业务实体
### 0.3 执行引擎策略
| 引擎           | 职责范围           | 说明                                              |
| ------------ | -------------- | ----------------------------------------------- |
| **LiteFlow** | Loyalty 核心事件处理 | 幂等检查、数据标准化、One‑ID 匹配、规则引擎（Drools）、动作执行，**保持不变** |
| **Zeebe**    | Campaign 流程执行  | 所有 Campaign 相关流程（含审批、长时等待、状态查询、Saga 补偿），**新增**  |
两套引擎完全独立，互不干扰，通过 `application.yml` 分别配置。
### 0.4 与 Loyalty 现有模块的关系
| Loyalty 能力          | 复用方式                                     |
| ------------------- | ---------------------------------------- |
| 会员/积分/等级数据          | 通过 CDC 同步到 Campaign 宽表                   |
| 积分发放、优惠券发放、消息发送     | 由 Zeebe Workers 调用对应 Service             |
| 规则引擎 Drools         | **仅用于 Loyalty 业务规则**，Campaign 不使用 Drools |
| LiteFlow            | 保持原有能力，Campaign 不侵入                      |
| EventBridge + Kafka | 完全复用，新增 Campaign 事件类型                    |
| React Flow          | 复用，扩展 Campaign 节点组件库                     |
***
## 1. Planning Workspace
### 1.1 数据模型（新增表，复用 `rule_definition` 的 metadata 存储 Initiative 规则）
```sql
-- 工作区
CREATE TABLE campaign_workspace (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 目标
CREATE TABLE campaign_goal (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    goal_type VARCHAR(32) NOT NULL,          -- REVENUE / RETENTION / ACQUISITION / ENGAGEMENT
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    target_metric VARCHAR(64),               -- 关联 Loyalty 指标
    target_value DECIMAL(18,4),
    current_value DECIMAL(18,4),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 举措
CREATE TABLE campaign_initiative (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    initiative_type VARCHAR(32),             -- WINBACK / GROWTH / ENGAGEMENT / ACQUISITION
    status VARCHAR(32) DEFAULT 'PLANNED',
    priority INT DEFAULT 100,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 组合
CREATE TABLE campaign_portfolio (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'DRAFT',      -- DRAFT / OPTIMIZED / LOCKED / EXECUTING
    optimization_mode VARCHAR(32) DEFAULT 'ROI_MAXIMIZATION',
    total_budget DECIMAL(18,4),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Campaign Plan（核心）
CREATE TABLE campaign_plan (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64),
    initiative_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'DRAFT',      -- DRAFT / GENERATED / APPROVED / REJECTED / EXECUTING / COMPLETED
    total_budget DECIMAL(18,4),
    expected_roi DECIMAL(10,4),
    strategy_json JSONB,
    allocation_json JSONB,
    graph_json JSONB,                        -- Canvas DAG
    forecast_json JSONB,
    -- Zeebe 相关
    zeebe_process_id VARCHAR(100),
    zeebe_version INT,
    zeebe_instance_key BIGINT,
    created_by VARCHAR(64),
    approved_by VARCHAR(64),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 1.2 状态机
* Goal: `DRAFT → ACTIVE → PAUSED → COMPLETED → ARCHIVED`（每个 Workspace 仅一个 ACTIVE Goal）
* Initiative: `PLANNED → ACTIVE → PAUSED → COMPLETED → ARCHIVED`
* Portfolio: `DRAFT → OPTIMIZED → LOCKED → EXECUTING → COMPLETED`
### 1.3 Planning Service（Java）
```java
@Service
public class PlanningService {
    @Autowired private GoalRepository goalRepo;
    @Autowired private InitiativeRepository initiativeRepo;
    @Autowired private PortfolioRepository portfolioRepo;
    @Autowired private AIPlanner aiPlanner;
    @Autowired private OpportunityService opportunityService;
    public CampaignPlan generatePlan(String goalId, BigDecimal budget) {
        Goal goal = goalRepo.findById(goalId);
        List<Opportunity> opportunities = opportunityService.discover(goal);
        AIPlanResponse response = aiPlanner.generatePlan(goal, opportunities, budget);
        CampaignPlan plan = buildPlan(response);
        plan.setStatus("GENERATED");
        return planRepo.save(plan);
    }
}
```
***
## 2. Opportunity Intelligence（含外部感知AI技能）
### 2.1 内部分析引擎（基于 Loyalty 数据）
**数据源**：从同步的宽表（`campaign_member_dim`, `campaign_order_fact`）读取。
**评分流程**：
1. **SQL 预过滤**（硬性门槛）：会员状态=ACTIVE、非黑名单、符合等级/注册时间等
2. **ML 预测评分**：调用 Python ML 服务（XGBoost/LightGBM），输出 `churn_probability`, `uplift_score`, `conversion_prob`
3. **RFM 基础分**：计算 Recency, Frequency, Monetary 加权
**Java Service**（不含 Drools）：
```java
@Service
public class OpportunityService {
    @Autowired private CampaignMemberDimRepository dimRepo;
    @Autowired private MLScoringClient mlClient;
    @Autowired private ExternalSignalService externalSignalService;
    public List<Opportunity> discover(Goal goal) {
        List<CampaignMemberDim> eligible = dimRepo.findEligibleMembers(goal);
        List<MemberFeature> features = eligible.stream().map(this::toFeature).collect(Collectors.toList());
        List<MLScoreResult> mlResults = mlClient.predict(features);
        List<ExternalSignal> activeSignals = externalSignalService.getActiveSignals(goal.getProgramCode());
        List<Opportunity> opportunities = new ArrayList<>();
        for (int i = 0; i < eligible.size(); i++) {
            double externalWeight = calculateExternalWeight(activeSignals, eligible.get(i));
            double finalScore = mlResults.get(i).getScore() * externalWeight;
            opportunities.add(buildOpportunity(eligible.get(i), mlResults.get(i), finalScore));
        }
        opportunities.sort((a,b) -> Double.compare(b.getScore(), a.getScore()));
        return opportunities.stream().limit(10000).collect(Collectors.toList());
    }
}
```
### 2.2 外部感知层（AI Skills）
#### 2.2.1 技能定义
系统内置四类 AI 技能，通过 **LLM Tool Calling** 解析非结构化数据：
| 技能类别 | AI 技能名称                  | 数据源             | 输出信号类型                                 |
| ---- | ------------------------ | --------------- | -------------------------------------- |
| 竞品动态 | `CompetitorMonitorSkill` | 竞品官网、价格API、应用商店 | `PRICE_CHANGE`, `NEW_LAUNCH`           |
| 宏观舆情 | `SocialListeningSkill`   | 微博/推特、行业论坛      | `SENTIMENT_SHIFT`, `VIRAL_EVENT`       |
| 政策法规 | `RegulatoryWatchSkill`   | 政府公告、行业新闻       | `COMPLIANCE_DEADLINE`, `POLICY_CHANGE` |
| 供应链  | `InventoryRiskSkill`     | 内部库存系统、供应商公告    | `STOCK_OUT`, `RESTOCK_ALERT`           |
#### 2.2.2 技能执行框架
```java
public interface ExternalSkill {
    String getSkillName();
    List<ExternalSignal> execute(SkillExecutionContext ctx);
}
@Component
public class CompetitorMonitorSkill implements ExternalSkill {
    @Autowired private WebCrawlerService crawler;
    @Autowired private LLMClient llmClient;
    @Override
    public List<ExternalSignal> execute(SkillExecutionContext ctx) {
        List<String> urls = ctx.getCompetitorUrls();
        Map<String, String> rawHtmls = crawler.fetch(urls);
        String prompt = buildPrompt(rawHtmls);
        String llmResponse = llmClient.chat(prompt);
        return parseLlmResponse(llmResponse);
    }
}
```
#### 2.2.3 外部信号数据模型
```sql
CREATE TABLE external_signal (
    id VARCHAR(64) PRIMARY KEY,
    signal_type VARCHAR(64),
    severity VARCHAR(32),               -- INFO / WARNING / CRITICAL
    source_skill VARCHAR(64),
    target_entity VARCHAR(255),
    raw_payload JSONB,
    impact_factor DECIMAL(5,4),         -- 影响系数，>1 增强机会
    affected_segments TEXT[],
    recommended_action TEXT,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ,
    is_consumed BOOLEAN DEFAULT FALSE
);
```
#### 2.2.4 外部信号加权融合
在 `OpportunityService` 中：
```java
private double calculateExternalWeight(List<ExternalSignal> signals, CampaignMemberDim dim) {
    double weight = 1.0;
    for (ExternalSignal s : signals) {
        if ("PRICE_CHANGE".equals(s.getSignalType()) && s.getAffectedSegments().contains(dim.getSegmentCode())) {
            weight += s.getImpactFactor() * 0.5;
        }
        if ("VIRAL_EVENT".equals(s.getSignalType())) {
            weight += s.getImpactFactor() * 0.3;
        }
    }
    return Math.min(weight, 2.0);
}
```
#### 2.2.5 调度策略
* 竞品价格：每 6 小时（`@Scheduled(cron = "0 0 */6 * * ?")`）
* 舆情：实时（Webhook + Kafka）
* 政策法规：每 24 小时
* 突发事件：外部推送 + 主动轮询
***
## 3. Marketing Decision Engine
### 3.1 预算分配（Greedy + ROI 排序）
```java
public Map<String, Double> allocateBudget(List<CampaignCandidate> candidates, double totalBudget) {
    candidates.sort((a,b) -> Double.compare(b.getExpectedROI(), a.getExpectedROI()));
    Map<String, Double> allocation = new LinkedHashMap<>();
    double remaining = totalBudget;
    for (CampaignCandidate c : candidates) {
        double budget = Math.min(c.getRecommendedBudget(), remaining);
        if (budget <= 0) break;
        allocation.put(c.getId(), budget);
        remaining -= budget;
    }
    return allocation;
}
```
### 3.2 注意力预算（频控）
```sql
CREATE TABLE user_attention_budget (
    user_id VARCHAR(64),
    date DATE,
    channel VARCHAR(32),
    max_exposure INT,
    used_exposure INT,
    PRIMARY KEY(user_id, date, channel)
);
```
### 3.3 冲突仲裁
优先级分数 = `0.4*ROI + 0.3*OpportunityScore + 0.2*StrategicWeight + 0.1*RecencyBoost`
***
## 4. Simulation & Optimization
### 4.1 三层模拟模型
* **Exposure Model**：曝光概率（渠道容量 + 用户注意力）
* **Behavior Model**：行为概率（Offer强度 + 兴趣 - 疲劳）
* **Conversion Model**：转化概率（Uplift \* Intent \* OfferMatch）
### 4.2 What‑if 模拟与自动优化
* 支持策略对比（A/B 计划 ROI 对比）
* 遗传算法自动优化预算分配（或贪心基线）
***
## 5. Campaign Execution Engine（Zeebe）
### 5.1 执行引擎选择（已定）
**Zeebe 统一执行所有 Campaign 流程**，LiteFlow 继续服务 Loyalty 核心事件处理。
### 5.2 Zeebe 本地开发环境
* 依赖：`spring-boot-starter-camunda` + `zeebe-client-java` (8.5.0)
* 开发模式：嵌入式 Zeebe（`zeebe.embedded.enabled=true`）
* 生产模式：独立 Zeebe 集群
### 5.3 BPMN 流程模板（示例）
参见独立文档第 3 章（通用 Campaign 流程模板），包含 Start、Audience Filter、AI Score、Exclusive Gateway、User Task（审批）、Timer、Send Email、End。
### 5.4 Canvas → BPMN Compiler（见第 9 章）
### 5.5 Zeebe Workers（Java 实现）
所有 Worker 继承 `BaseCampaignWorker`，使用 `@JobWorker` 注解。
**示例：人群筛选 Worker**
```java
@JobWorker(type = "campaign-audience-filter", timeout = 30000)
public Map<String, Object> handle(JobClient client, ActivatedJob job) {
    String programCode = getString(variables, "programCode");
    String segmentCode = getString(variables, "segmentCode");
    List<String> memberIds = memberRepo.findByProgramCodeAndSegment(programCode, segmentCode, 10000);
    return Map.of("memberIds", memberIds, "count", memberIds.size());
}
```
其他 Worker：`campaign-ai-score`, `campaign-send-email`, `campaign-send-sms`, `campaign-offer-points`, `campaign-offer-coupon`, `campaign-approval`。
### 5.6 流程部署与启动
```java
@Service
public class ZeebeDeployService {
    public String deploy(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        String bpmnXml = compiler.compile(plan.getCanvasId(), plan.getGraphJson());
        DeploymentEvent deployment = zeebeClient.newDeployResourceCommand()
                .addResourceString(bpmnXml, "campaign_" + planId + ".bpmn")
                .send().join();
        plan.setZeebeProcessId(deployment.getProcesses().get(0).getBpmnProcessId());
        planRepo.save(plan);
        return plan.getZeebeProcessId();
    }
}
```
***
## 6. Event System + Feedback Loop
### 6.1 复用 Loyalty EventBridge + Kafka
* 新增 Campaign 事件类型：`CAMPAIGN_PLAN_GENERATED`, `CAMPAIGN_APPROVED`, `CAMPAIGN_STARTED`, `CAMPAIGN_NODE_EXECUTED`, `CAMPAIGN_COMPLETED`, `CAMPAIGN_PAUSED`, `CAMPAIGN_CANCELLED`
* 使用现有 `event_inbox` 表存储
### 6.2 Feedback Loop
* **三层反馈**：
  1. Execution Feedback（CTR、转化率）
  2. Model Feedback（预测 ROI vs 实际，漂移检测）
  3. Strategy Feedback（预算分配调整）
* **自学习触发**：当 `|predicted - actual| > threshold` 时，触发 Simulation Engine 重新优化
***
## 7. System Blueprint（工程结构）
### 7.1 后端包结构（`com.loyalty.platform.campaign`）
```text
campaign-platform/
├── src/main/java/com/loyalty/platform/campaign/
│   ├── planning/          # Planning Service
│   │   ├── controller/
│   │   ├── service/
│   │   ├── engine/        # OpportunityEngine, DecisionEngine
│   │   └── repository/
│   ├── execution/         # Execution Service
│   │   ├── controller/
│   │   ├── service/       # CanvasService, ZeebeDeployService, ZeebeExecutionService
│   │   ├── compiler/      # CanvasToBpmnCompiler
│   │   ├── worker/        # Zeebe Workers
│   │   └── repository/
│   ├── ai/                # AI Service
│   │   ├── skill/         # ExternalSkill 实现
│   │   ├── prompt/        # Prompt 模板管理
│   │   └── client/        # LLM Client
│   ├── content/           # Content & Compliance
│   │   ├── service/       # ContentService, ApprovalService
│   │   ├── repository/
│   │   └── handler/       # InterventionService
│   ├── common/
│   └── config/            # Zeebe, LiteFlow, EventBridge 配置
└── src/main/resources/
    ├── bpmn/              # 预置 BPMN 模板
    └── prompts/           # AI Prompt 模板
```
### 7.2 前端（React + React Flow）
* 复用 Loyalty 现有 React Flow 能力，扩展 Campaign 节点组件库
* Canvas 编辑器包含：节点面板、画布、属性面板、实时校验、AI 生成按钮
***
## 8. Production‑grade Canvas + Flow Engine
### 8.1 Node 类型体系（与 Loyalty 能力对齐）
| Node 类型           | 组件名   | 调用 Loyalty 能力                     |
| ----------------- | ----- | --------------------------------- |
| `AUDIENCE_FILTER` | 人群筛选  | `MemberService.filter()`          |
| `CONDITION`       | 条件分支  | `RuleEngineService.evaluate()`    |
| `DELAY`           | 延迟等待  | 定时器                               |
| `SEND_EMAIL`      | 发送邮件  | `ChannelService.sendEmail()`      |
| `SEND_SMS`        | 发送短信  | `ChannelService.sendSMS()`        |
| `SEND_PUSH`       | 发送推送  | `ChannelService.sendPush()`       |
| `OFFER_POINTS`    | 发放积分  | `PointGrantService.grantPoints()` |
| `OFFER_COUPON`    | 发放优惠券 | `CouponService.issueCoupon()`     |
| `TIER_UPGRADE`    | 等级直升  | `TierService.upgrade()`           |
| `WEBHOOK`         | 外部调用  | `WebhookService.call()`           |
| `AI_SCORE`        | AI 评分 | `AIService.score()`               |
| `APPROVAL`        | 人工审批  | 触发 Zeebe User Task                |
### 8.2 画布大规模性能优化
* React + React Flow + WebWorker（计算 DAG）
* Canvas virtualization（节点懒加载）
* 大图（>1000 nodes）使用 Canvas + WebGL fallback
***
## 9. Canvas → BPMN Compiler（含 AI→DAG Prompt 体系）
### 9.1 编译器架构
```text
Canvas DAG → Semantic Analyzer → Flow Normalizer → BPMN Graph Builder → Zeebe BPMN Generator → Worker Binding Registry
```
### 9.2 核心编译器（Java）
```java
@Component
public class CanvasToBpmnCompiler {
    public String compile(String canvasId, JsonNode graph) {
        // 拓扑排序
        List<String> sorted = topologicalSort(graph.get("nodes"), graph.get("edges"));
        // 生成 BPMN XML
        StringBuilder bpmn = new StringBuilder();
        bpmn.append("<bpmn:startEvent id=\"StartEvent_1\"/>");
        for (String nodeId : sorted) {
            JsonNode node = findNode(graph.get("nodes"), nodeId);
            bpmn.append(generateNodeBpmn(node));
        }
        bpmn.append("<bpmn:endEvent id=\"EndEvent_1\"/>");
        bpmn.append(generateSequenceFlows(graph.get("edges")));
        return wrapBpmn(bpmn.toString());
    }
}
```
### 9.3 AI → DAG 生成 Prompt 体系
**System Prompt（强约束）**：
```text
You are a Workflow DAG Generator. Output MUST be valid JSON with nodes and edges.
Available node types: AUDIENCE_FILTER, CONDITION, SPLIT, AI_SCORE, SEND_EMAIL, SEND_SMS, WAIT, WEBHOOK, APPROVAL.
Constraints: DAG, max depth 10, max nodes 50.
Output format: { "nodes": [...], "edges": [...] }
```
**业务输入示例**：
```text
Goal: Increase VIP conversion
Budget: 10000 USD
Audience: inactive users 30 days
Channel: email + sms
Generate DAG.
```
**AI 输出示例**：
```json
{
  "nodes": [
    {"id":"N1","type":"AUDIENCE_FILTER","config":{"segment":"inactive_30d"}},
    {"id":"N2","type":"AI_SCORE","config":{"model":"conversion_v2"}},
    {"id":"N3","type":"CONDITION","config":{"field":"score","operator":">","value":0.7}},
    {"id":"N4","type":"SEND_EMAIL","config":{"asset_id":"ASSET_001"}},
    {"id":"N5","type":"SEND_SMS","config":{"asset_id":"ASSET_002"}}
  ],
  "edges": [
    {"from":"N1","to":"N2"},
    {"from":"N2","to":"N3"},
    {"from":"N3","to":"N4","condition":"score >= 0.7"},
    {"from":"N3","to":"N5","condition":"score < 0.7"}
  ]
}
```
***
## 10. Node Config Schema System
### 10.1 节点统一标准模型
```java
public abstract class BaseNode {
    String nodeId;
    NodeType type;
    NodeInput input;
    NodeOutput output;
    NodeConfig config;
    public abstract NodeOutput execute(NodeContext ctx);
}
```
### 10.2 节点注册表
```java
@Component
public class NodeRegistry {
    private Map<String, BaseNode> registry = new HashMap<>();
    public BaseNode get(String type) { return registry.get(type); }
}
```
### 10.3 示例：Audience Filter Node
* **Input**：`{ "segment": "inactive_users", "filters": {...} }`
* **Config**：`{ "mode": "INTERSECTION", "limit": 100000 }`
* **Output**：`{ "user_ids": [] }`
***
## 11. End‑to‑End Execution Runtime
### 11.1 全链路
```text
Canvas UI → AI Planner (DAG生成) → Canvas 编辑 → BPMN Compiler → Zeebe Deploy → Zeebe Create Instance → Workers → Event System → Feedback Loop
```
### 11.2 执行入口 API
```text
POST /api/campaign/plan/{planId}/deploy
POST /api/campaign/plan/{planId}/start
GET  /api/campaign/plan/{planId}/status
```
### 11.3 幂等与一致性
* 幂等 Key：`campaign_id + node_id + user_id + channel`
* 去重表：`execution_dedup`
* Retry：Zeebe 内置重试 + Worker 侧幂等
* Saga 补偿：Zeebe 原生支持
***
## 12. Production Reference Architecture
### 12.1 微服务拆分（团队开发结构）
* `gateway-service`
* `planning-service`
* `execution-service`
* `compiler-service`
* `decision-service`
* `event-service`
* `worker-service`（多个 Worker 实例）
* `ai-engine`（LLM 网关、Prompt Registry、Skill 框架）
### 12.2 数据库
* 开发：单 PostgreSQL（多 schema）
* 生产：PostgreSQL 集群 + ClickHouse（事件分析）+ Redis（缓存/分布式锁）
### 12.3 部署
* 开发：Docker Compose（包含 PostgreSQL、Zeebe 嵌入式、React）
* 生产：Kubernetes（Zeebe 集群、Worker HPA、Kafka 集群）
### 12.4 多租户隔离
* Row‑level `tenant_id` + `program_code` 隔离
* 高安全场景：Schema‑level 隔离
***
## 13. Content & Compliance Governance（内容与合规治理层）
### 13.1 数据模型
```sql
-- 内容素材
CREATE TABLE campaign_content_asset (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(32),          -- EMAIL_HTML / SMS_TEXT / PUSH_JSON
    channel VARCHAR(32),
    subject_line VARCHAR(255),
    body_text TEXT,
    variable_schema JSONB,           -- 变量占位符定义
    status VARCHAR(32) DEFAULT 'DRAFT', -- DRAFT / PENDING_APPROVAL / APPROVED / REJECTED
    created_by VARCHAR(64),
    approved_by VARCHAR(64),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 审批记录
CREATE TABLE campaign_approval_record (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64),
    plan_id VARCHAR(64),
    node_id VARCHAR(64),
    requester_id VARCHAR(64),
    approver_id VARCHAR(64),
    action VARCHAR(32),              -- SUBMITTED / APPROVED / REJECTED / REVOKED
    comment TEXT,
    snapshot_before JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 13.2 审批服务
```java
@Service
public class ApprovalService {
    public void submitForApproval(String assetId, String requesterId) { /* 状态改为 PENDING_APPROVAL */ }
    public void approve(String assetId, String approverId) { /* 状态改为 APPROVED */ }
    public void validateBeforeSend(String assetId) {
        ContentAsset asset = assetRepo.findById(assetId);
        if (!"APPROVED".equals(asset.getStatus())) {
            throw new IllegalStateException("Content not approved");
        }
    }
}
```
### 13.3 Canvas 节点扩展
在 `SEND_EMAIL` 节点配置中增加：
```json
{
  "asset_id": "ASSET_001",
  "require_approval": true
}
```
Compiler 检测到 `require_approval: true` 时，在 BPMN 中注入 `WAITING_FOR_APPROVAL` 中间捕获事件。
***
## 14. Human Override & Intervention System（人工干预与覆盖系统）
### 14.1 执行状态机扩展
```text
RUNNING → PAUSED_BY_USER (可恢复) / CANCELLED (不可恢复) / NODE_SKIPPED / OVERRIDDEN
```
### 14.2 干预数据模型
```sql
CREATE TABLE campaign_intervention_command (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    plan_id VARCHAR(64),
    target_node_id VARCHAR(64),
    command_type VARCHAR(32),        -- PAUSE / RESUME / CANCEL / SKIP_NODE / UPDATE_CONFIG
    reason TEXT,
    operator_id VARCHAR(64),
    previous_state_snapshot JSONB,
    new_config_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);
```
### 14.3 干预服务
```java
@Service
public class InterventionService {
    public void pauseCampaign(String planId, String operatorId, String reason) {
        // 调用 Zeebe 修改流程实例（注入暂停网关变量）
        zeebeClient.newSetVariablesCommand(planId).variables(Map.of("pause", true)).send().join();
        recordIntervention(planId, null, "PAUSE", operatorId, reason);
    }
    public void overrideNodeConfig(String planId, String nodeId, Map<String, Object> newConfig, String operatorId, String reason) {
        zeebeClient.newSetVariablesCommand(planId)
                .variables(Map.of("node_" + nodeId + "_config", newConfig))
                .send().join();
        recordIntervention(planId, nodeId, "UPDATE_CONFIG", operatorId, reason);
    }
    public void emergencyThrottle(String tenantId, double factor) {
        redisTemplate.convertAndSend("tenant:" + tenantId + ":throttle", factor);
    }
}
```
### 14.4 Worker 防护钩子
所有 Channel Worker 在执行前检查：
```java
if (interventionService.isPaused(campaignId)) throw new PauseException();
double throttle = redisTemplate.opsForValue().get("tenant:" + tenantId + ":throttle");
if (throttle != null && throttle < 0.5) { /* 限流处理 */ }
```
### 14.5 API
```text
POST /api/execution/{planId}/pause
POST /api/execution/{planId}/resume
DELETE /api/execution/{planId}/cancel
POST /api/execution/{planId}/skip/{nodeId}
PUT  /api/execution/{planId}/config/{nodeId}
GET  /api/execution/{planId}/interventions
```
***
## 附录A：数据同步设计（CDC + 定时）
### A.1 生产环境（CDC）
```text
Loyalty DB (member, order, transaction, tier_change) 
    → Debezium CDC → Kafka (loyalty.member, loyalty.order, ...) 
    → Campaign Data Sync Service → campaign_member_dim, campaign_order_fact, ...
```
### A.2 开发环境（定时任务）
```java
@Scheduled(fixedDelay = 1800000)
@Transactional
public void syncAll() {
    syncMembers();
    syncOrders();
    syncPoints();
    syncTierChanges();
}
```
### A.3 结构化宽表
* `campaign_member_dim`（会员汇总：RFM、等级、分群）
* `campaign_order_fact`（订单明细）
* `campaign_behavior_fact`（行为事件）
* `campaign_points_summary`（积分汇总）
* `campaign_tier_change_detail`（等级变更）
***
## 附录B：开发阶段技术简化方案
| 组件   | 生产方案             | 开发阶段替代              |
| ---- | ---------------- | ------------------- |
| 消息队列 | Kafka            | 同步调用 + Spring Event |
| 缓存   | Redis            | 直接查询数据库             |
| 分布式锁 | Redis            | 数据库乐观锁（`@Version`）  |
| 数据同步 | CDC (Debezium)   | 定时任务（`@Scheduled`）  |
| 限流   | Redis + Sentinel | 暂不启用                |
生产环境迁移路径：开发阶段 → 逐步引入 Kafka、Redis、CDC。
***
## 总结
本融合文档完整吸收了 **独立 Campaign 设计** 的全部功能（第0～14章），并基于 **Loyalty 融合版 V2** 的架构原则（LiteFlow 保留、Zeebe 统一执行 Campaign）进行了深度整合。关键融合点：
* **数据**：复用 Loyalty 主数据，通过 CDC/定时同步构建 Campaign 宽表
* **执行**：Zeebe 统一执行，Workers 调用 Loyalty 服务（积分/优惠券/消息）
* **事件**：复用 EventBridge + Kafka，新增 Campaign 事件
* **规则**：Drools 仅用于 Loyalty，Campaign 使用 SQL + ML + AI 评分
* **前端**：复用 React Flow，扩展 Campaign 节点
* **补充**：完整纳入内容合规、人工干预、外部感知 AI Skills，满足企业级要求
此文档可直接作为开发团队的 **唯一技术规格说明书**，所有功能均与现有 Loyalty 平台无缝融合，无需同时查阅两份独立文档。
