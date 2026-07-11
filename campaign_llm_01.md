# Campaign Tools 平台设计文档（Loyalty 融合版）
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：2.0\
> **设计原则**：
>
> * **最大化复用 Loyalty 现有能力**：不重复建设已有的事件系统、规则引擎、数据模型
>
> * **保持一致的架构风格**：沿用 Spring Boot 3.x + PostgreSQL + Kafka + Redis
>
> * **渐进式落地**：Phase 1 聚焦 Planning + 基础 Execution，Phase 2 引入 Zeebe 工作流，Phase 3 接入 AI Skills
>
> * **Campaign Planning 必须用 AI**：所有 Planning 阶段的分析工作由 AI Agent + Skill 完成
>
> * **Skill 可动态配置**：竞品分析、数据洞察等 Skill 由运营人员配置，支持跨行业扩展
***
## 一、整体融合策略
### 1.1 原设计文档与 Loyalty 平台对照分析
| 原设计模块                              | Loyalty 已有能力                         | 融合策略                                         |
| ---------------------------------- | ------------------------------------ | -------------------------------------------- |
| **Event System（第6章）**              | EventBridge + Kafka + event\_inbox 表 | **完全复用**，无需新建                                |
| **Execution Engine（第5章）**          | LiteFlow + Drools 规则引擎               | **扩展**，增加 Campaign 节点类型                      |
| **Canvas 画布（第7.13节）**              | React Flow（已在规则编辑器中使用）               | **复用**，扩展 Campaign 节点组件库                     |
| **Flow Compiler（第9章）**             | 无                                    | **新增**，Canvas DAG → LiteFlow EL 或 Zeebe BPMN |
| **Planning Workspace（第1章）**        | 无                                    | **新增**，作为 AI 决策入口                            |
| **Opportunity Intelligence（第2章）**  | 无                                    | **新增**，结合 Loyalty 数据                         |
| **Decision Engine（第3章）**           | 无                                    | **新增**，预算分配、仲裁                               |
| **Simulation & Optimization（第4章）** | 无                                    | **新增**，ROI 预测、What-if                        |
| **外部感知 AI Skills（第2.4节）**          | 无                                    | **新增**，竞品分析、舆情监控                             |
| **Content & Compliance（第13章）**     | 无                                    | **新增**，素材管理、审批流                              |
### 1.2 融合后的整体架构
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Loyalty 平台 (v7.3)                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  · EventBridge · Kafka · event_inbox · account_transaction          │   │
│  │  · rule_definition · LiteFlow · Drools · program_schema            │   │
│  │  · member · member_unique_key · tier_definition                    │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ CDC + Kafka 实时同步
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Campaign Tools 平台                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │    Campaign Planning    │    │        Campaign Execution               │ │
│  │    （AI 驱动）           │    │     （画布 + 工作流引擎）                │ │
│  │                         │    │                                         │ │
│  │  · Workspace/Goal/      │    │  ┌─────────────────────────────────┐   │ │
│  │    Initiative/Portfolio │    │  │   Canvas (React Flow)           │   │ │
│  │  · Opportunity Intel    │    │  │   · 事件接收 · 人群筛选          │   │ │
│  │  · Decision Engine      │    │  │   · 流程控制 · 渠道发送          │   │ │
│  │  · Simulation & Opt     │    │  └─────────────────────────────────┘   │ │
│  │  · External AI Skills   │    │  ┌─────────────────────────────────┐   │ │
│  └─────────────────────────┘    │  │   Flow Compiler                │   │ │
│               │                   │  │   Canvas DAG → LiteFlow EL     │   │ │
│               ▼                   │  │   或 → Zeebe BPMN             │   │ │
│  ┌─────────────────────────┐    │  └─────────────────────────────────┘   │ │
│  │   AI Agent + Skill 层    │    │  ┌─────────────────────────────────┐   │ │
│  │   · 竞品分析 Skill       │    │  │   Execution Runtime            │   │ │
│  │   · 数据洞察 Skill       │    │  │   · LiteFlow (现有) / Zeebe    │   │ │
│  │   · 策略生成 Skill       │    │  │   · Node Workers               │   │ │
│  └─────────────────────────┘    │  │   · Channel Adapters           │   │ │
│               │                   │  └─────────────────────────────────┘   │ │
│               ▼                   │                                         │ │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐ │ │
│  │     Campaign 数据存储            │  │   Content & Compliance         │ │ │
│  │  · campaign_goal · initiative   │  │   · content_asset              │ │ │
│  │  · opportunity · campaign_plan  │  │   · approval_record            │ │ │
│  │  · canvas · execution_log       │  │   · intervention_command       │ │ │
│  └─────────────────────────────────┘  └─────────────────────────────────┘ │ │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ 调用 Loyalty 能力
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 能力层                                      │
│  · 积分发放 (PointGrantService)   · 优惠券发放 (CouponService)              │
│  · 消息发送 (ChannelService)      · 等级变更 (TierService)                 │
│  · 会员查询 (MemberService)       · 规则引擎 (RuleEngineService)            │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.3 与 Loyalty 现有模块的关系
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 现有模块                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │
│  │  规则引擎    │  │  LiteFlow    │  │  EventBridge │  │  会员/积分   │   │
│  │  (第六章)    │  │  (第七章)    │  │  (第二章)    │  │  (第三/四章) │   │
│  └──────────────┘  └──────────────┘  └──────────────┘  └──────────────┘   │
│         │                  │                  │                  │          │
│         └──────────────────┴──────────────────┴──────────────────┘          │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                     Campaign Tools 调用层                            │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │  Campaign Planning → 输出 Campaign Plan                      │   │   │
│  │  │       ↓                                                      │   │   │
│  │  │  Campaign Execution → 调用 Loyalty 能力                      │   │   │
│  │  │       · 积分发放 → PointGrantService                        │   │   │
│  │  │       · 优惠券 → CouponService                              │   │   │
│  │  │       · 消息 → ChannelService                               │   │   │
│  │  │       · 规则 → RuleEngineService                            │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
***
## 二、对原设计文档的逐章修改
### 2.1 第0章：System Overview
#### 修改点
1. **系统定位调整**：从“独立营销自动化系统”调整为 **“Loyalty 平台的营销决策与执行扩展层”**
2. **数据边界明确**：Campaign Tools 不存储会员、积分、订单等主数据，全部通过 CDC 从 Loyalty 同步
3. **执行引擎选择**：优先复用 LiteFlow（已有），复杂场景可扩展 Zeebe
#### 修改后内容
```text
0.1 System Scope
系统本质：
Campaign Tools 是 Loyalty 平台的营销决策与执行扩展层，不是独立系统。
系统核心能力：
1. 营销决策（Planning）：AI 驱动的目标管理、机会发现、策略生成
2. 营销执行（Execution）：画布编排 + 工作流引擎，调用 Loyalty 能力
3. 智能闭环（Feedback）：执行结果回流，持续优化 AI 决策
数据边界：
- 输入：通过 CDC 从 Loyalty 同步会员、订单、行为、积分、等级数据
- 输出：Campaign Plan → Execution → 调用 Loyalty 能力（积分/优惠券/消息）
执行引擎选择：
- 优先：LiteFlow（已有，轻量级 DAG 执行）
- 扩展：Zeebe（复杂流程、高并发场景）
```
### 2.2 第1章：Planning Workspace
#### 修改点
1. **Goal 与 Loyalty 已有概念的映射**：Goal 的 KPI 可以关联 Loyalty 的积分类型、等级等
2. **数据模型调整**：部分表复用 `rule_definition` 的 `metadata` 存储
3. **状态机与现有 `status` 枚举对齐**
#### 修改后数据模型
```sql
-- 复用 Loyalty 的 rule_definition 表存储 Initiative 规则
-- 新增 rule_purpose = 'INITIATIVE'
-- Workspace 表（新增）
CREATE TABLE campaign_workspace (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,        -- 关联 Loyalty Program
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE / ARCHIVED
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Goal 表（新增）
CREATE TABLE campaign_goal (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    goal_type VARCHAR(32) NOT NULL,            -- REVENUE / RETENTION / ACQUISITION / ENGAGEMENT
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- DRAFT / ACTIVE / PAUSED / COMPLETED
    target_metric VARCHAR(64),                 -- 关联 Loyalty 指标：TIER_POINTS / ORDER_COUNT / TOTAL_AMOUNT
    target_value DECIMAL(18,4),
    current_value DECIMAL(18,4),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Initiative 表（新增）
CREATE TABLE campaign_initiative (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    initiative_type VARCHAR(32),               -- WINBACK / GROWTH / ENGAGEMENT
    status VARCHAR(32) DEFAULT 'PLANNED',      -- PLANNED / ACTIVE / PAUSED / COMPLETED
    priority INT DEFAULT 100,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Portfolio 表（新增）
CREATE TABLE campaign_portfolio (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'DRAFT',        -- DRAFT / OPTIMIZED / LOCKED
    optimization_mode VARCHAR(32) DEFAULT 'ROI_MAXIMIZATION',
    total_budget DECIMAL(18,4),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 2.3 第2章：Opportunity Intelligence
#### 修改点
1. **数据源对接 Loyalty 结构化数据**：从 `campaign_member_dim`、`campaign_order_fact` 等读取
2. **AI Skills 复用 Loyalty 的 AI 规则生成能力**
3. **机会评分规则可使用 Drools 规则引擎**
#### 修改后内容
**2.1 数据源对接**
```java
@Component
public class LoyaltyDataProvider implements OpportunityDataProvider {
    @Autowired
    private CampaignMemberDimRepository memberDimRepo;
    @Autowired
    private CampaignOrderFactRepository orderFactRepo;
    @Autowired
    private CampaignBehaviorFactRepository behaviorRepo;
    @Autowired
    private CampaignTierChangeDetailRepository tierChangeRepo;
    
    public MemberFeature getMemberFeature(String memberId) {
        // 从 Loyalty 同步的宽表读取
        CampaignMemberDim dim = memberDimRepo.findByMemberId(memberId);
        List<CampaignOrderFact> orders = orderFactRepo.findByMemberId(memberId);
        
        return MemberFeature.builder()
            .memberId(memberId)
            .recency(dim.getLastOrderDays())
            .frequency(dim.getTotalOrderCount())
            .monetary(dim.getTotalOrderAmount())
            .tierCode(dim.getTierCode())
            .churnRiskScore(calculateChurnRisk(dim))
            .engagementScore(calculateEngagement(dim))
            .build();
    }
}
```
**2.2 机会评分（使用 Drools 规则）**
drools
```
// 复用 Loyalty 的规则引擎
rule "HighValueChurnRisk"
when
    $feature: MemberFeature(churnRiskScore > 0.7, monetary > 5000)
then
    Opportunity opp = new Opportunity();
    opp.setType("CHURN_RISK");
    opp.setScore(0.85);
    opp.setRecommendedAction("WINBACK_DISCOUNT");
    insert(opp);
end
rule "UpsellOpportunity"
when
    $feature: MemberFeature(engagementScore > 0.6, tierCode == "GOLD")
then
    Opportunity opp = new Opportunity();
    opp.setType("UPSELL");
    opp.setScore(0.75);
    opp.setRecommendedAction("BUNDLE_OFFER");
    insert(opp);
end
```
### 2.4 第3章：Decision Engine
#### 修改点
1. **复用 Loyalty 的规则引擎做决策**
2. **预算分配结果存储到 `campaign_portfolio` 表**
3. **仲裁引擎与 Loyalty 现有风控能力集成**
### 2.5 第4章：Simulation & Optimization
#### 修改点
1. **模拟数据来源于 Loyalty 历史数据**
2. **AI 辅助生成 Campaign Plan**
#### 修改后内容
```java
@Service
public class SimulationEngine {
    @Autowired
    private CampaignOrderFactRepository orderRepo;
    @Autowired
    private AIAssistant aiAssistant;
    
    public SimulationResult simulate(CampaignPlan plan) {
        // 1. 从 Loyalty 历史数据计算基线转化率
        double baselineConversion = orderRepo.calculateConversionRate(
            plan.getTargetSegment(), 30);
        
        // 2. AI 预测 uplift
        double predictedUplift = aiAssistant.predictUplift(plan);
        
        // 3. 计算预测结果
        return SimulationResult.builder()
            .predictedROI(plan.getTotalBudget() * predictedUplift)
            .predictedConversion(baselineConversion * (1 + predictedUplift))
            .confidence(0.75)
            .build();
    }
}
```
### 2.6 第5章：Campaign Execution Engine
#### 修改点
1. **执行引擎优先使用 LiteFlow（已有）**
2. **Canvas DAG → LiteFlow EL 表达式编译**
3. **节点类型与 Loyalty 现有组件对齐**
#### 修改后内容
**5.1 执行引擎选择策略**
| 场景              | 执行引擎     | 说明         |
| --------------- | -------- | ---------- |
| 简单 DAG（< 10 节点） | LiteFlow | 轻量级，复用已有能力 |
| 复杂 DAG（> 10 节点） | Zeebe    | 分布式、高并发    |
| 需要人工审批          | Zeebe    | 支持等待事件     |
| 需要事务补偿          | Zeebe    | 支持 Saga    |
**5.2 Canvas DAG → LiteFlow EL 编译**
```java
@Component
public class CanvasToLiteFlowCompiler {
    
    public String compile(CanvasGraph graph) {
        StringBuilder el = new StringBuilder();
        el.append("THEN(\n");
        for (Node node : topologicalSort(graph)) {
            String nodeEl = compileNode(node);
            el.append("    ").append(nodeEl).append(",\n");
        }
        el.append(")");
        return el.toString();
    }
    
    private String compileNode(Node node) {
        switch (node.getType()) {
            case "AUDIENCE_FILTER":
                return "audienceFilterCmp";
            case "SEND_EMAIL":
                return "sendEmailCmp";
            case "CONDITION":
                return "conditionCmp";
            case "DELAY":
                return "delayCmp";
            case "OFFER_DISPATCH":
                return "offerDispatchCmp";
            default:
                throw new UnsupportedOperationException("Unknown node type: " + node.getType());
        }
    }
}
```
### 2.7 第6章：Event System + Feedback Loop
#### 修改点
1. **完全复用 Loyalty 的 EventBridge + Kafka**
2. **使用现有 `event_inbox` 表**
3. **新增 Campaign 相关事件类型**
#### 修改后内容
```java
// 复用 Loyalty 的 EventBridge
@Component
public class CampaignEventPublisher {
    @Autowired
    private EventBridge eventBridge;
    
    public void publishCampaignEvent(CampaignEvent event) {
        eventBridge.publish(
            "campaign-events",
            event.getCampaignId(),
            event
        );
    }
}
// 新增事件类型（使用现有 event_inbox 表）
public enum CampaignEventType {
    CAMPAIGN_PLAN_GENERATED,
    CAMPAIGN_APPROVED,
    CAMPAIGN_STARTED,
    CAMPAIGN_NODE_EXECUTED,
    CAMPAIGN_COMPLETED,
    CAMPAIGN_PAUSED,
    CAMPAIGN_CANCELLED
}
```
### 2.8 第7章：System Blueprint
#### 修改点
1. **与 Loyalty 现有工程结构对齐**
2. **包路径统一为 `com.loyalty.platform.campaign`**
#### 修改后内容
```text
campaign-platform/
├── src/main/java/com/loyalty/platform/campaign/
│   ├── planning/          # Planning Service
│   │   ├── controller/    # Goal/Initiative/Portfolio API
│   │   ├── service/       # GoalService, InitiativeService, PortfolioService
│   │   ├── engine/        # OpportunityEngine, DecisionEngine
│   │   └── repository/
│   ├── execution/         # Execution Service
│   │   ├── controller/    # Canvas/Execution API
│   │   ├── service/       # CanvasService, ExecutionService
│   │   ├── compiler/      # CanvasToLiteFlowCompiler
│   │   ├── worker/        # Node Handlers
│   │   └── repository/
│   ├── ai/                # AI Service
│   │   ├── skill/         # ExternalSkill 实现
│   │   ├── prompt/        # Prompt 模板管理
│   │   └── client/        # LLM Client
│   ├── content/           # Content & Compliance
│   │   ├── service/       # ContentService, ApprovalService
│   │   ├── repository/
│   │   └── handler/       # InterventionService
│   ├── common/            # 共享 DTO/Utils
│   └── config/            # 配置类
└── src/main/resources/
    ├── bpmn/              # Zeebe BPMN 定义
    └── prompts/           # AI Prompt 模板
```
### 2.9 第8章：Production-grade Canvas + Flow Engine
#### 修改点
1. **Canvas 复用现有 React Flow 能力**
2. **Node 组件库扩展**
#### 修改后内容
**8.1 Node 类型体系（与 Loyalty 对齐）**
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
### 2.10 第9章：Canvas → BPMN Compiler
#### 修改点
1. **支持 LiteFlow EL 和 Zeebe BPMN 双输出**
2. **LiteFlow EL 优先，Zeebe 作为高级选项**
#### 修改后内容
**9.1 双编译器架构**
```java
public interface CanvasCompiler {
    String compile(CanvasGraph graph);
}
@Component
public class LiteFlowCompiler implements CanvasCompiler {
    @Override
    public String compile(CanvasGraph graph) {
        // 生成 LiteFlow EL 表达式
        return generateLiteFlowEL(graph);
    }
}
@Component
public class ZeebeCompiler implements CanvasCompiler {
    @Override
    public String compile(CanvasGraph graph) {
        // 生成 Zeebe BPMN XML
        return generateZeebeBPMN(graph);
    }
}
@Service
public class CompilerService {
    @Autowired
    private List<CanvasCompiler> compilers;
    
    public CompilationResult compile(CanvasGraph graph, String engineType) {
        CanvasCompiler compiler = compilers.stream()
            .filter(c -> c.supports(engineType))
            .findFirst()
            .orElseThrow(() -> new UnsupportedOperationException("Unknown engine type: " + engineType));
        
        String compiled = compiler.compile(graph);
        return CompilationResult.builder()
            .engineType(engineType)
            .compiledContent(compiled)
            .build();
    }
}
```
### 2.11 第13章：Content & Compliance Governance
#### 修改点
1. **复用 Loyalty 的审批流能力**
2. **与现有 `rule_definition` 审批状态对齐**
#### 修改后内容
```sql
-- 素材表（新增）
CREATE TABLE campaign_content_asset (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(32),              -- EMAIL_HTML / SMS_TEXT / PUSH_JSON
    channel VARCHAR(32),                 -- EMAIL / SMS / PUSH
    subject_line VARCHAR(255),
    body_text TEXT,
    variable_schema JSONB,               -- 变量占位符定义
    status VARCHAR(32) DEFAULT 'DRAFT',  -- DRAFT / PENDING_APPROVAL / APPROVED / REJECTED
    created_by VARCHAR(64),
    approved_by VARCHAR(64),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 2.12 第14章：Human Override & Intervention System
#### 修改点
1. **复用 Loyalty 的 `operation_log` 表记录干预操作**
2. **与 EventBridge 集成，实时通知**
```sql
-- 干预指令表（新增）
CREATE TABLE campaign_intervention_command (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    campaign_id VARCHAR(64),
    target_node_id VARCHAR(64),
    command_type VARCHAR(32),            -- PAUSE / RESUME / CANCEL / SKIP_NODE / UPDATE_CONFIG
    reason TEXT,
    operator_id VARCHAR(64),
    previous_state_snapshot JSONB,
    new_config_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);
```
### 2.13 外部感知 AI Skills（新增独立章节）
#### 2.13.1 与 Loyalty AI 体系集成
外部感知 Skills 复用 Loyalty 的 AI 规则生成能力，由运营人员动态配置：
```sql
-- 复用 behavior_code 表，增加技能类型
INSERT INTO behavior_code (program_code, behavior_code, behavior_name, description, status)
VALUES 
('BRAND_A', 'COMPETITOR_PRICE_MONITOR', '竞品价格监控', '监控竞品价格变化，触发营销策略调整', 'ENABLED'),
('BRAND_A', 'SOCIAL_SENTIMENT_MONITOR', '社交媒体舆情监控', '监控品牌舆情变化，及时调整营销节奏', 'ENABLED');
```
#### 2.13.2 Skill 执行框架
```java
@Component
public class ExternalSkillRegistry {
    private final Map<String, ExternalSkill> skills = new HashMap<>();
    
    @PostConstruct
    public void init() {
        skills.put("COMPETITOR_PRICE_MONITOR", new CompetitorMonitorSkill());
        skills.put("SOCIAL_SENTIMENT_MONITOR", new SocialSentimentSkill());
        skills.put("REGULATORY_WATCH", new RegulatoryWatchSkill());
    }
    
    public ExternalSkill getSkill(String skillCode) {
        return skills.get(skillCode);
    }
}
@Scheduled(cron = "0 0 */6 * * ?")
public void executeExternalSkills() {
    List<String> activeSkills = behaviorCodeRepo.findActiveSkills();
    for (String skillCode : activeSkills) {
        ExternalSkill skill = skillRegistry.getSkill(skillCode);
        List<ExternalSignal> signals = skill.execute();
        // 信号触发 Opportunity 重算
        opportunityService.recalculate(signals);
    }
}
```
***
## 三、数据同步设计
### 3.1 CDC 同步架构
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 数据库                                      │
│  member · account_transaction · order · behavior · tier_change_log         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Debezium CDC)
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Kafka                                          │
│  Topics: loyalty.member, loyalty.order, loyalty.points, loyalty.tier       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (Campaign Data Sync Service)
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Campaign 结构化数据存储                                │
│  campaign_member_dim · campaign_order_fact · campaign_behavior_fact         │
│  campaign_points_summary · campaign_tier_change_detail                     │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 3.2 同步服务实现
```java
@Component
public class CampaignDataSyncService {
    @KafkaListener(topics = "loyalty.member")
    public void syncMember(ConsumerRecord<String, String> record) {
        MemberEvent event = JsonUtil.fromJson(record.value(), MemberEvent.class);
        CampaignMemberDim dim = convertToDim(event);
        memberDimRepo.upsert(dim);
    }
    
    @KafkaListener(topics = "loyalty.order")
    public void syncOrder(ConsumerRecord<String, String> record) {
        OrderEvent event = JsonUtil.fromJson(record.value(), OrderEvent.class);
        CampaignOrderFact fact = convertToFact(event);
        orderFactRepo.save(fact);
        // 更新会员宽表汇总
        recalcMemberSummary(event.getMemberId());
    }
}
```
### 3.3 结构化数据表（补充）
```sql
-- 会员宽表（已在前文设计）
CREATE TABLE campaign_member_dim (...);
-- 订单事实表（已在前文设计）
CREATE TABLE campaign_order_fact (...);
-- 行为事件表（已在前文设计）
CREATE TABLE campaign_behavior_fact (...);
-- 积分汇总表（已在前文设计）
CREATE TABLE campaign_points_summary (...);
-- 等级变更明细表（已在前文设计）
CREATE TABLE campaign_tier_change_detail (...);
```
***
## 四、与原设计文档的主要差异总结
| 差异点           | 原设计       | 修正后                             |
| ------------- | --------- | ------------------------------- |
| **系统定位**      | 独立营销自动化系统 | Loyalty 平台的营销扩展层                |
| **执行引擎**      | Zeebe（固定） | LiteFlow（优先）+ Zeebe（扩展）         |
| **事件系统**      | 自建        | 复用 EventBridge                  |
| **规则引擎**      | 自建        | 复用 Drools                       |
| **数据模型**      | 独立新建      | 复用 + 扩展                         |
| **AI Skills** | 固定实现      | 可动态配置（复用 behavior\_code）        |
| **审批流**       | 自建        | 复用操作日志                          |
| **包结构**       | 独立        | `com.loyalty.platform.campaign` |
***
## 五、开发实施步骤（调整后）
| 阶段            | 序号 | 任务                                          | 说明                                                                                | 优先级 |
| ------------- | -- | ------------------------------------------- | --------------------------------------------------------------------------------- | --- |
| **准备**        | 1  | 创建 Campaign 数据表                             | 新增表：workspace, goal, initiative, portfolio, content\_asset, intervention\_command | P0  |
|               | 2  | 实现 CDC 同步                                   | Debezium + Kafka，同步 Loyalty 数据到 Campaign 表                                        | P0  |
|               | 3  | 扩展 program\_schema                          | 增加 Campaign 相关实体定义                                                                | P1  |
| **Planning**  | 4  | 实现 Workspace/Goal/Initiative/Portfolio CRUD | 基础 API                                                                            | P0  |
|               | 5  | 实现 Opportunity Intelligence                 | 复用 Drools 规则，接入 Loyalty 数据                                                        | P0  |
|               | 6  | 实现 Decision Engine                          | 预算分配、仲裁                                                                           | P1  |
|               | 7  | 实现 Simulation Engine                        | ROI 预测、What-if                                                                    | P1  |
|               | 8  | 实现 AI Skills 框架                             | 竞品监控、舆情监控                                                                         | P1  |
| **Execution** | 9  | 实现 Canvas 画布                                | 复用 React Flow，扩展节点类型                                                              | P0  |
|               | 10 | 实现 Canvas → LiteFlow Compiler               | DAG 转 EL 表达式                                                                      | P0  |
|               | 11 | 实现 Node Workers                             | 人群筛选、渠道发送、Offer 发放                                                                | P0  |
|               | 12 | 实现 Zeebe Compiler（可选）                       | 复杂流程支持                                                                            | P2  |
| **闭环**        | 13 | 实现 Content & Compliance                     | 素材管理、审批流                                                                          | P1  |
|               | 14 | 实现 Intervention System                      | 暂停/恢复/跳过/配置覆盖                                                                     | P1  |
|               | 15 | 实现 Feedback Loop                            | 执行结果回写，优化 AI 决策                                                                   | P1  |
***
## 六、总结
本设计文档在 `campaign_llm.md` 的基础上，进行了以下融合调整：
1. **系统定位**：从独立系统调整为 Loyalty 平台的扩展层
2. **执行引擎**：优先复用 LiteFlow，保留 Zeebe 作为复杂场景选项
3. **事件系统**：完全复用 Loyalty 的 EventBridge + Kafka
4. **规则引擎**：复用 Drools 规则引擎
5. **数据模型**：最大化复用 Loyalty 现有表结构
6. **数据同步**：通过 CDC 将 Loyalty 数据同步到 Campaign 结构化存储
7. **AI Skills**：可动态配置，复用 `behavior_code` 表
8. **包结构**：统一到 `com.loyalty.platform.campaign`
# Campaign Tools 平台设计文档（Loyalty 融合版 V2）
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：4.0\
> **设计原则**：
>
> * **Loyalty 优先**：Campaign Tools 是 Loyalty 平台的扩展层
>
> * **Zeebe 统一执行**：Campaign 所有流程统一使用 Zeebe 执行引擎
>
> * **LiteFlow 保持独立**：LiteFlow 继续服务 Loyalty 核心事件处理（幂等、标准化、One-ID等），两者共存不冲突
>
> * **轻量落地**：开发阶段简化技术栈，PostgreSQL 为主
## 一、执行引擎策略（修正）
### 1.1 Zeebe vs LiteFlow 分工
| 引擎           | 职责范围           | 说明                                      |
| ------------ | -------------- | --------------------------------------- |
| **LiteFlow** | Loyalty 核心事件处理 | 幂等检查、数据标准化、One-ID 匹配、规则引擎、动作执行（保持不变）    |
| **Zeebe**    | Campaign 流程执行  | 所有 Campaign 相关流程（含审批、长时等待、状态查询、Saga 补偿） |
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 平台                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LiteFlow（现有，保持不变）                                         │   │
│  │  幂等检查 → 标准化 → One-ID → 规则引擎 → 动作执行                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Campaign 流程调用
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Campaign Tools                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Zeebe（新增，统一执行 Campaign 流程）                               │   │
│  │  Canvas DAG → BPMN Compiler → Zeebe → Workers → Loyalty 能力       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.2 为什么选择 Zeebe
| 能力          | LiteFlow | Zeebe           | Campaign 需求    |
| ----------- | -------- | --------------- | -------------- |
| 状态持久化       | ❌ 无      | ✅ 事件溯源          | 流程中断后可恢复       |
| 人工审批节点      | ❌ 不支持    | ✅ User Task     | 内容审批、预算审批      |
| 长时等待（定时/事件） | ⚠️ 需自建   | ✅ Timer/Message | 延迟发送、等待事件      |
| 流程状态查询      | ❌ 不支持    | ✅ Operate UI    | 运营查看执行进度       |
| 失败补偿/Saga   | ⚠️ 需自建   | ✅ 支持            | 部分失败回滚         |
| 分布式高可用      | ⚠️ 需自建   | ✅ 原生支持          | 大规模并发执行        |
| 与 Java 集成   | ✅ 优秀     | ✅ 优秀            | Spring Boot 支持 |
## 二、Zeebe 本地开发环境配置
### 2.1 依赖配置
xml
运行
```
<!-- pom.xml -->
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
```
### 2.2 application.yml 配置（开发阶段）
yaml
```
# Zeebe 配置（开发阶段使用嵌入式模式）
zeebe:
  client:
    broker:
      gateway-address: localhost:26500
    security:
      plaintext: true
  embedded:
    enabled: true
    container:
      port: 26500
    data:
      directory: ./zeebe-data  # RocksDB 数据目录
# 生产环境切换为独立 Zeebe 集群
# zeebe:
#   client:
#     broker:
#       gateway-address: zeebe-gateway:26500
```
### 2.3 Docker Compose 环境（开发阶段可选）
yaml
```
# docker-compose.yml（开发阶段可选择不使用，直接嵌入式启动）
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: campaign_dev
      POSTGRES_USER: campaign_user
      POSTGRES_PASSWORD: campaign_pass
    ports:
      - "5432:5432"
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
  # Zeebe 独立模式（也可使用嵌入式，二选一）
  zeebe:
    image: camunda/zeebe:8.5.0
    ports:
      - "26500:26500"
    environment:
      - ZEEBE_LOG_LEVEL=debug
```
### 2.4 Zeebe 嵌入式配置
```java
package com.loyalty.platform.campaign.config;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.embedded.EmbeddedZeebe;
import io.camunda.zeebe.embedded.EmbeddedZeebeConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
@Configuration
@Profile("dev")
public class ZeebeEmbeddedConfig {
    @Bean
    public EmbeddedZeebe embeddedZeebe() {
        EmbeddedZeebeConfig config = EmbeddedZeebeConfig.builder()
            .setPort(26500)
            .setDataDirectory("./zeebe-data")
            .build();
        return EmbeddedZeebe.start(config);
    }
    @Bean
    public ZeebeClient zeebeClient(EmbeddedZeebe embeddedZeebe) {
        return ZeebeClient.newClientBuilder()
            .gatewayAddress("localhost:26500")
            .usePlaintext()
            .defaultRequestTimeout(Duration.ofSeconds(30))
            .build();
    }
}
```
### 2.5 生产环境 Zeebe 配置
```java
@Configuration
@Profile("prod")
public class ZeebeProductionConfig {
    @Bean
    public ZeebeClient zeebeClient() {
        return ZeebeClient.newClientBuilder()
            .gatewayAddress("zeebe-gateway:26500")
            .usePlaintext()  // 生产环境应使用 TLS
            .defaultRequestTimeout(Duration.ofSeconds(30))
            .build();
    }
}
```
## 三、BPMN 流程定义
### 3.1 通用 Campaign 流程模板
xml
运行
```
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="CampaignFlow" isExecutable="true">
    
    <!-- 开始事件（由 API 触发） -->
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:messageEventDefinition id="MessageEventDefinition_1" />
    </bpmn:startEvent>
    <!-- 人群筛选 Service Task -->
    <bpmn:serviceTask id="Activity_AudienceFilter" name="人群筛选"
                      zeebe:taskType="campaign-audience-filter">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="campaign-audience-filter" />
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <!-- AI 评分 Service Task -->
    <bpmn:serviceTask id="Activity_AIScore" name="AI 评分"
                      zeebe:taskType="campaign-ai-score">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="campaign-ai-score" />
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <!-- 条件分支（Exclusive Gateway） -->
    <bpmn:exclusiveGateway id="Gateway_1" name="高价值用户?">
      <bpmn:conditionExpression>
        = return variables.score >= 0.7
      </bpmn:conditionExpression>
    </bpmn:exclusiveGateway>
    <!-- 人工审批 User Task（Zeebe 特有） -->
    <bpmn:userTask id="Activity_Approval" name="内容审批">
      <bpmn:extensionElements>
        <zeebe:assignmentDefinition assignee="approver" />
        <zeebe:taskDefinition type="campaign-approval" />
      </bpmn:extensionElements>
    </bpmn:userTask>
    <!-- 发送邮件 Service Task -->
    <bpmn:serviceTask id="Activity_SendEmail" name="发送邮件"
                      zeebe:taskType="campaign-send-email">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="campaign-send-email" />
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <!-- 延迟等待 Timer -->
    <bpmn:intermediateCatchEvent id="Timer_1" name="延迟2天">
      <bpmn:timerEventDefinition>
        <bpmn:timeDuration>P2D</bpmn:timeDuration>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>
    <!-- 结束事件 -->
    <bpmn:endEvent id="EndEvent_1" />
    <!-- 连线 -->
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_AudienceFilter" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_AudienceFilter" targetRef="Activity_AIScore" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Activity_AIScore" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Activity_Approval">
      <bpmn:conditionExpression>score >= 0.7</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Gateway_1" targetRef="EndEvent_1">
      <bpmn:conditionExpression>score < 0.7</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Activity_Approval" targetRef="Timer_1" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Timer_1" targetRef="Activity_SendEmail" />
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Activity_SendEmail" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
```
## 四、Canvas → BPMN Compiler
### 4.1 核心编译器
```java
package com.loyalty.platform.campaign.compiler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.stream.Collectors;
@Component
public class CanvasToBpmnCompiler {
    private static final String BPMN_TEMPLATE = """
        <?xml version="1.0" encoding="UTF-8"?>
        <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                          xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                          xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
                          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                          id="Definitions_1"
                          targetNamespace="http://bpmn.io/schema/bpmn">
          <bpmn:process id="%s" isExecutable="true">
            %s
          </bpmn:process>
        </bpmn:definitions>
        """;
    public String compile(String canvasId, JsonNode graph) {
        String processId = "campaign_" + canvasId.replace("-", "_");
        String bpmnContent = generateBpmnContent(graph, processId);
        return String.format(BPMN_TEMPLATE, processId, bpmnContent);
    }
    private String generateBpmnContent(JsonNode graph, String processId) {
        JsonNode nodes = graph.get("nodes");
        JsonNode edges = graph.get("edges");
        
        StringBuilder bpmn = new StringBuilder();
        bpmn.append("<bpmn:startEvent id=\"StartEvent_1\">\n");
        bpmn.append("  <bpmn:messageEventDefinition id=\"MessageEventDefinition_1\" />\n");
        bpmn.append("</bpmn:startEvent>\n");
        
        // 拓扑排序
        List<String> sortedNodeIds = topologicalSort(nodes, edges);
        
        Map<String, String> nodeIdMap = new HashMap<>();
        int seq = 0;
        for (String nodeId : sortedNodeIds) {
            String bpmnId = "Activity_" + (++seq);
            nodeIdMap.put(nodeId, bpmnId);
            JsonNode node = findNode(nodes, nodeId);
            bpmn.append(generateNodeBpmn(bpmnId, node));
        }
        
        // 生成结束事件
        bpmn.append("<bpmn:endEvent id=\"EndEvent_1\" />\n");
        
        // 生成连线
        bpmn.append(generateSequenceFlows(edges, nodeIdMap));
        
        return bpmn.toString();
    }
    private String generateNodeBpmn(String bpmnId, JsonNode node) {
        String nodeType = node.get("type").asText();
        String nodeName = node.has("name") ? node.get("name").asText() : nodeType;
        String workerType = mapToWorkerType(nodeType);
        
        switch (nodeType) {
            case "AUDIENCE_FILTER":
            case "AI_SCORE":
            case "SEND_EMAIL":
            case "SEND_SMS":
            case "OFFER_POINTS":
            case "OFFER_COUPON":
            case "WEBHOOK":
                return String.format("""
                    <bpmn:serviceTask id="%s" name="%s" zeebe:taskType="%s">
                      <bpmn:extensionElements>
                        <zeebe:taskDefinition type="%s" />
                      </bpmn:extensionElements>
                    </bpmn:serviceTask>
                    """, bpmnId, nodeName, workerType, workerType);
            
            case "CONDITION":
                return String.format("""
                    <bpmn:exclusiveGateway id="%s" name="%s" />
                    """, bpmnId, nodeName);
            
            case "APPROVAL":
                return String.format("""
                    <bpmn:userTask id="%s" name="%s">
                      <bpmn:extensionElements>
                        <zeebe:assignmentDefinition assignee="approver" />
                        <zeebe:taskDefinition type="%s" />
                      </bpmn:extensionElements>
                    </bpmn:userTask>
                    """, bpmnId, nodeName, workerType);
            
            case "DELAY":
                long delayMs = node.has("config") && node.get("config").has("delayMs") 
                    ? node.get("config").get("delayMs").asLong() : 86400000; // 默认1天
                String duration = formatDuration(delayMs);
                return String.format("""
                    <bpmn:intermediateCatchEvent id="%s" name="%s">
                      <bpmn:timerEventDefinition>
                        <bpmn:timeDuration>%s</bpmn:timeDuration>
                      </bpmn:timerEventDefinition>
                    </bpmn:intermediateCatchEvent>
                    """, bpmnId, nodeName, duration);
            
            default:
                return String.format("""
                    <bpmn:serviceTask id="%s" name="%s" zeebe:taskType="%s">
                      <bpmn:extensionElements>
                        <zeebe:taskDefinition type="%s" />
                      </bpmn:extensionElements>
                    </bpmn:serviceTask>
                    """, bpmnId, nodeName, "campaign-default", "campaign-default");
        }
    }
    private String mapToWorkerType(String nodeType) {
        return "campaign-" + nodeType.toLowerCase().replace("_", "-");
    }
    private String formatDuration(long delayMs) {
        if (delayMs < 60000) {
            return "PT" + delayMs / 1000 + "S";
        } else if (delayMs < 3600000) {
            return "PT" + delayMs / 60000 + "M";
        } else if (delayMs < 86400000) {
            return "PT" + delayMs / 3600000 + "H";
        } else {
            return "P" + delayMs / 86400000 + "D";
        }
    }
    private List<String> topologicalSort(JsonNode nodes, JsonNode edges) {
        Map<String, Integer> inDegree = new HashMap<>();
        Map<String, List<String>> adj = new HashMap<>();
        
        for (JsonNode node : nodes) {
            String id = node.get("id").asText();
            inDegree.put(id, 0);
            adj.put(id, new ArrayList<>());
        }
        
        for (JsonNode edge : edges) {
            String source = edge.get("source").asText();
            String target = edge.get("target").asText();
            adj.get(source).add(target);
            inDegree.merge(target, 1, Integer::sum);
        }
        
        // Kahn 算法
        Queue<String> queue = new LinkedList<>();
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) queue.add(entry.getKey());
        }
        
        List<String> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            String node = queue.poll();
            result.add(node);
            for (String next : adj.get(node)) {
                inDegree.merge(next, -1, Integer::sum);
                if (inDegree.get(next) == 0) queue.add(next);
            }
        }
        return result;
    }
    private JsonNode findNode(JsonNode nodes, String id) {
        for (JsonNode node : nodes) {
            if (node.get("id").asText().equals(id)) {
                return node;
            }
        }
        return null;
    }
}
```
## 五、Zeebe Workers 实现
### 5.1 Worker 基类
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import java.util.HashMap;
import java.util.Map;
@Slf4j
public abstract class BaseCampaignWorker {
    protected abstract String getWorkerType();
    
    protected abstract Map<String, Object> doExecute(Map<String, Object> variables);
    public Map<String, Object> execute(JobClient client, ActivatedJob job) {
        String workerType = getWorkerType();
        long processInstanceKey = job.getProcessInstanceKey();
        
        log.info("Worker 开始执行: {}, processInstanceKey: {}", workerType, processInstanceKey);
        
        try {
            Map<String, Object> variables = job.getVariablesAsMap();
            Map<String, Object> result = doExecute(variables);
            
            log.info("Worker 执行成功: {}, processInstanceKey: {}", workerType, processInstanceKey);
            return result;
            
        } catch (Exception e) {
            log.error("Worker 执行失败: {}, error: {}", workerType, e.getMessage(), e);
            throw new RuntimeException("Worker execution failed: " + e.getMessage(), e);
        }
    }
    protected <T> T getVariable(Map<String, Object> variables, String key, Class<T> type) {
        Object value = variables.get(key);
        if (value == null) return null;
        if (type.isInstance(value)) return type.cast(value);
        return null;
    }
    protected String getString(Map<String, Object> variables, String key) {
        Object value = variables.get(key);
        return value != null ? String.valueOf(value) : null;
    }
    protected Integer getInt(Map<String, Object> variables, String key) {
        Object value = variables.get(key);
        if (value instanceof Integer) return (Integer) value;
        if (value instanceof Number) return ((Number) value).intValue();
        if (value instanceof String) return Integer.parseInt((String) value);
        return null;
    }
    protected BigDecimal getDecimal(Map<String, Object> variables, String key) {
        Object value = variables.get(key);
        if (value instanceof BigDecimal) return (BigDecimal) value;
        if (value instanceof Number) return BigDecimal.valueOf(((Number) value).doubleValue());
        if (value instanceof String) return new BigDecimal((String) value);
        return null;
    }
}
```
### 5.2 人群筛选 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
public class AudienceFilterWorker extends BaseCampaignWorker {
    @Autowired
    private CampaignMemberDimRepository memberRepo;
    @Override
    protected String getWorkerType() {
        return "campaign-audience-filter";
    }
    @JobWorker(type = "campaign-audience-filter", timeout = 30000)
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        String programCode = getString(variables, "programCode");
        String segmentCode = getString(variables, "segmentCode");
        Integer maxCount = getInt(variables, "maxCount");
        if (maxCount == null) maxCount = 10000;
        // 查询目标人群
        List<String> memberIds = memberRepo.findByProgramCodeAndSegment(
            programCode, segmentCode, maxCount
        );
        Map<String, Object> result = new HashMap<>();
        result.put("memberIds", memberIds);
        result.put("count", memberIds.size());
        result.put("segmentCode", segmentCode);
        result.put("filteredAt", LocalDateTime.now().toString());
        return result;
    }
}
```
### 5.3 AI 评分 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
@Slf4j
@Component
public class AIScoreWorker extends BaseCampaignWorker {
    @Autowired
    private MLScoringClient mlClient;
    @Autowired
    private CampaignMemberDimRepository memberRepo;
    @Override
    protected String getWorkerType() {
        return "campaign-ai-score";
    }
    @JobWorker(type = "campaign-ai-score", timeout = 60000)
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        List<String> memberIds = (List<String>) variables.get("memberIds");
        String modelType = getString(variables, "modelType");
        if (modelType == null) modelType = "churn";
        // 获取会员特征
        List<MemberFeature> features = memberRepo.findFeaturesByMemberIds(memberIds);
        // 调用 ML 服务评分
        List<MLScoreResult> scores = mlClient.predict(features, modelType);
        // 构建评分结果
        List<Map<String, Object>> scoredMembers = scores.stream().map(s -> {
            Map<String, Object> item = new HashMap<>();
            item.put("memberId", s.getMemberId());
            item.put("score", s.getScore());
            item.put("confidence", s.getConfidence());
            return item;
        }).collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("scoredMembers", scoredMembers);
        result.put("modelType", modelType);
        result.put("scoredAt", LocalDateTime.now().toString());
        return result;
    }
}
```
### 5.4 发送邮件 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
public class SendEmailWorker extends BaseCampaignWorker {
    @Autowired
    private ChannelService channelService;  // Loyalty 服务
    @Autowired
    private ContentService contentService;
    @Override
    protected String getWorkerType() {
        return "campaign-send-email";
    }
    @JobWorker(type = "campaign-send-email", timeout = 60000)
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        List<String> memberIds = (List<String>) variables.get("memberIds");
        String assetId = getString(variables, "assetId");
        int successCount = 0;
        int failCount = 0;
        for (String memberId : memberIds) {
            try {
                // 获取会员邮箱
                Member member = memberService.findByMemberId(memberId);
                
                // 渲染内容
                String content = contentService.render(assetId, member);
                
                // 发送邮件（调用 Loyalty 能力）
                channelService.sendEmail(member.getEmail(), content);
                successCount++;
                
            } catch (Exception e) {
                log.error("发送邮件失败: memberId={}, error={}", memberId, e.getMessage());
                failCount++;
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("successCount", successCount);
        result.put("failCount", failCount);
        result.put("totalCount", memberIds.size());
        result.put("sentAt", LocalDateTime.now().toString());
        return result;
    }
}
```
### 5.5 发放积分 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
public class OfferPointsWorker extends BaseCampaignWorker {
    @Autowired
    private PointGrantService pointGrantService;  // Loyalty 服务
    @Override
    protected String getWorkerType() {
        return "campaign-offer-points";
    }
    @JobWorker(type = "campaign-offer-points", timeout = 30000)
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        List<String> memberIds = (List<String>) variables.get("memberIds");
        String pointType = getString(variables, "pointType");
        BigDecimal pointsAmount = getDecimal(variables, "pointsAmount");
        String programCode = getString(variables, "programCode");
        String ruleId = getString(variables, "ruleId");
        int successCount = 0;
        int failCount = 0;
        for (String memberId : memberIds) {
            try {
                pointGrantService.grantPoints(
                    programCode,
                    memberId,
                    pointType,
                    pointsAmount,
                    ruleId,
                    null
                );
                successCount++;
            } catch (Exception e) {
                log.error("发放积分失败: memberId={}, error={}", memberId, e.getMessage());
                failCount++;
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("successCount", successCount);
        result.put("failCount", failCount);
        result.put("totalCount", memberIds.size());
        result.put("pointsType", pointType);
        result.put("pointsAmount", pointsAmount);
        return result;
    }
}
```
### 5.6 审批 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Component
public class ApprovalWorker extends BaseCampaignWorker {
    @Autowired
    private ApprovalService approvalService;
    @Override
    protected String getWorkerType() {
        return "campaign-approval";
    }
    @JobWorker(type = "campaign-approval", timeout = 86400000) // 24小时超时
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        String assetId = getString(variables, "assetId");
        String planId = getString(variables, "planId");
        String approverId = getString(variables, "approverId");
        // 获取审批状态
        ApprovalStatus status = approvalService.getStatus(assetId, planId);
        Map<String, Object> result = new HashMap<>();
        result.put("approved", "APPROVED".equals(status.getAction()));
        result.put("status", status.getAction());
        result.put("approverId", status.getApproverId());
        result.put("approvedAt", status.getApprovedAt());
        result.put("comment", status.getComment());
        return result;
    }
}
```
## 六、Zeebe 流程管理服务
### 6.1 流程部署服务
```java
package com.loyalty.platform.campaign.service;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.response.DeploymentEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
@Slf4j
@Service
public class ZeebeDeployService {
    @Autowired
    private ZeebeClient zeebeClient;
    @Autowired
    private CanvasToBpmnCompiler compiler;
    @Autowired
    private CampaignPlanRepository planRepo;
    public String deploy(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        String bpmnXml = compiler.compile(plan.getCanvasId(), plan.getGraphJson());
        DeploymentEvent deployment = zeebeClient.newDeployResourceCommand()
            .addResourceString(bpmnXml, "campaign_" + planId + ".bpmn")
            .send()
            .join();
        String processId = deployment.getProcesses().get(0).getBpmnProcessId();
        log.info("流程部署成功: planId={}, processId={}", planId, processId);
        plan.setZeebeProcessId(processId);
        plan.setZeebeVersion(deployment.getProcesses().get(0).getVersion());
        planRepo.save(plan);
        return processId;
    }
}
```
### 6.2 流程实例启动服务
```java
package com.loyalty.platform.campaign.service;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.response.ProcessInstanceEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Service
public class ZeebeExecutionService {
    @Autowired
    private ZeebeClient zeebeClient;
    @Autowired
    private CampaignPlanRepository planRepo;
    @Autowired
    private CampaignExecutionLogRepository logRepo;
    public String start(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        if (plan.getZeebeProcessId() == null) {
            throw new BusinessException("计划尚未部署，请先部署");
        }
        Map<String, Object> variables = new HashMap<>();
        variables.put("planId", planId);
        variables.put("programCode", plan.getProgramCode());
        variables.put("campaignName", plan.getName());
        variables.put("targetSegment", plan.getTargetSegment());
        variables.put("budget", plan.getTotalBudget());
        variables.put("startTime", plan.getStartTime());
        variables.put("endTime", plan.getEndTime());
        ProcessInstanceEvent instance = zeebeClient.newCreateInstanceCommand()
            .bpmnProcessId(plan.getZeebeProcessId())
            .latestVersion()
            .variables(variables)
            .send()
            .join();
        log.info("流程实例启动成功: planId={}, processInstanceKey={}", planId, instance.getProcessInstanceKey());
        plan.setZeebeInstanceKey(instance.getProcessInstanceKey());
        plan.setStatus("RUNNING");
        planRepo.save(plan);
        return String.valueOf(instance.getProcessInstanceKey());
    }
    public String getStatus(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        if (plan.getZeebeInstanceKey() == null) {
            return "NOT_STARTED";
        }
        // 查询 Zeebe 流程状态
        // 通过 Zeebe Operate API 或直接查询数据库
        return plan.getStatus();
    }
    public void pause(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        // 调用 Zeebe 暂停 API
        // 需要在 BPMN 中预埋暂停网关
        plan.setStatus("PAUSED");
        planRepo.save(plan);
    }
    public void resume(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        plan.setStatus("RUNNING");
        planRepo.save(plan);
        // 恢复 Zeebe 流程执行
    }
    public void cancel(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        // 调用 Zeebe 取消 API
        plan.setStatus("CANCELLED");
        planRepo.save(plan);
    }
}
```
## 七、数据模型补充（Zeebe 相关）
```sql
-- 扩展 campaign_plan 表，增加 Zeebe 相关字段
ALTER TABLE campaign_plan ADD COLUMN zeebe_process_id VARCHAR(100);
ALTER TABLE campaign_plan ADD COLUMN zeebe_version INT;
ALTER TABLE campaign_plan ADD COLUMN zeebe_instance_key BIGINT;
-- Zeebe 执行实例表
CREATE TABLE campaign_zeebe_instance (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64),
    process_instance_key BIGINT NOT NULL,
    bpmn_process_id VARCHAR(100),
    status VARCHAR(32),                    -- RUNNING / COMPLETED / FAILED / CANCELLED
    variables JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_czi_plan ON campaign_zeebe_instance(plan_id);
CREATE INDEX idx_czi_key ON campaign_zeebe_instance(process_instance_key);
-- Zeebe 任务执行记录表
CREATE TABLE campaign_zeebe_task (
    id VARCHAR(64) PRIMARY KEY,
    instance_id VARCHAR(64),
    job_key BIGINT,
    task_type VARCHAR(64),
    task_name VARCHAR(255),
    status VARCHAR(32),                    -- CREATED / COMPLETED / FAILED / RETRY
    input_variables JSONB,
    output_variables JSONB,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_czt_instance ON campaign_zeebe_task(instance_id);
CREATE INDEX idx_czt_status ON campaign_zeebe_task(status);
```
## 八、与 Loyalty LiteFlow 的共存策略
| 场景                     | 执行引擎                                 | 说明                        |
| ---------------------- | ------------------------------------ | ------------------------- |
| Loyalty 核心事件处理         | **LiteFlow**                         | 幂等检查、标准化、One-ID、规则引擎，保持不变 |
| Campaign 流程执行          | **Zeebe**                            | 所有 Campaign 相关流程          |
| Campaign 调用 Loyalty 能力 | **Zeebe Workers → Loyalty Services** | Workers 内部调用 Loyalty 服务   |
### 配置隔离
yaml
```
# application.yml
# LiteFlow 继续为 Loyalty 服务
liteflow:
  rule-source: classpath:liteflow/el/*.el.xml
  component-scan: com.loyalty.platform.flow.components
# Zeebe 为 Campaign 服务
zeebe:
  client:
    broker:
      gateway-address: localhost:26500
```
两套引擎完全独立，互不干扰。
## 九、与原设计文档的差异
| 原设计                         | 修正后                                |
| --------------------------- | ---------------------------------- |
| LiteFlow 作为 Campaign 唯一执行引擎 | **Zeebe 统一执行 Campaign 流程**         |
| 未考虑审批节点                     | **Zeebe User Task 支持审批**           |
| 未考虑状态持久化                    | **Zeebe 事件溯源持久化**                  |
| Canvas → LiteFlow Compiler  | **Canvas → BPMN Compiler → Zeebe** |
| 无法查询流程状态                    | **Zeebe Operate 支持状态查询**           |
| 无 Saga 补偿                   | **Zeebe 支持 Saga 补偿**               |
## 十、总结
| 结论                        | 说明                       |
| ------------------------- | ------------------------ |
| **LiteFlow 保持不变**         | 继续服务 Loyalty 核心事件处理      |
| **Zeebe 统一执行 Campaign**   | 所有 Campaign 流程使用 Zeebe   |
| **BPMN Compiler 是关键**     | Canvas DAG → BPMN XML 编译 |
| **Workers 调用 Loyalty 能力** | 复用 Loyalty 服务，不重复建设      |
| **两套引擎独立共存**              | 互不干扰，各司其职                |
# Campaign Tools 平台设计文档（Loyalty 融合优化版）
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：3.0\
> **设计原则**：
>
> * **Loyalty 优先**：Campaign Tools 是 Loyalty 平台的扩展层，不独立存在
>
> * **复用优先**：优先复用 Loyalty 现有能力（LiteFlow、EventBridge、规则引擎、数据模型）
>
> * **轻量落地**：开发阶段简化技术栈（PostgreSQL 为主，暂不引入 Kafka/Redis），降低复杂度
>
> * **AI 原生**：Planning 阶段必须由 AI 驱动，Execution 阶段 AI 辅助
>
> * **Drools 边界明确**：Drools 仅用于 Loyalty 积分/等级业务规则，Campaign 系统不使用 Drools
## 一、整体融合策略
### 1.1 设计定位
**Campaign Tools 是 Loyalty 平台的营销决策与执行扩展层，而非独立系统。**
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 平台 (v7.3)                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  会员 · 积分 · 等级 · 规则引擎 (Drools) · LiteFlow · EventBridge   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 复用 + 扩展
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Campaign Tools 平台                                  │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │    Campaign Planning    │    │        Campaign Execution               │ │
│  │    （AI 驱动）           │    │     （画布 + LiteFlow 扩展）             │ │
│  └─────────────────────────┘    └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.2 复用 vs 新增 对照表
| 能力        | Loyalty 已有                 | Campaign Tools 处理方式                |
| --------- | -------------------------- | ---------------------------------- |
| **规则引擎**  | Drools（积分/等级规则）            | **不复用**，Campaign 不用 Drools         |
| **流程编排**  | LiteFlow                   | **复用**，扩展 Campaign 节点类型            |
| **事件系统**  | EventBridge + event\_inbox | **复用**，新增 Campaign 事件类型            |
| **消息队列**  | Kafka                      | 开发阶段暂不使用，用同步调用替代                   |
| **缓存**    | Redis                      | 开发阶段暂不使用，用数据库查询替代                  |
| **数据存储**  | PostgreSQL + JSONB         | **复用**，新增 Campaign 相关表             |
| **前端画布**  | React Flow                 | **复用**，扩展节点组件库                     |
| **AI 能力** | 规则生成 AI                    | **扩展**，新增 Planning/Execution AI 能力 |
### 1.3 技术栈（开发阶段）
| 组件    | 选型                    | 说明                     |
| ----- | --------------------- | ---------------------- |
| 后端框架  | Spring Boot 3.x       | 与 Loyalty 一致           |
| 数据库   | PostgreSQL 15         | 与 Loyalty 一致，开发阶段唯一数据源 |
| 流程编排  | LiteFlow              | 复用 Loyalty 已有能力        |
| 事件系统  | EventBridge           | 复用 Loyalty 已有能力        |
| 前端    | React 18 + React Flow | 复用 Loyalty 已有画布能力      |
| AI 集成 | 直接调用 LLM API          | 跳过中间层，简化架构             |
| 缓存    | 无                     | 开发阶段直接查询数据库            |
| 消息队列  | 无                     | 开发阶段使用同步调用             |
> **生产环境迁移**：Kafka 和 Redis 在生产环境部署时按需引入，本设计文档中预留接口但不强制实现。
## 二、数据模型设计
### 2.1 新增表（Campaign 专用）
#### 2.1.1 Workspace 表
```sql
CREATE TABLE campaign_workspace (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,        -- 关联 Loyalty Program
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE / ARCHIVED
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cw_program ON campaign_workspace(program_code);
```
#### 2.1.2 Goal 表
```sql
CREATE TABLE campaign_goal (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    goal_type VARCHAR(32) NOT NULL,            -- REVENUE / RETENTION / ACQUISITION / ENGAGEMENT
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT', -- DRAFT / ACTIVE / PAUSED / COMPLETED
    target_metric VARCHAR(64),                 -- 关联 Loyalty 指标
    target_value DECIMAL(18,4),
    current_value DECIMAL(18,4),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cg_workspace ON campaign_goal(workspace_id);
CREATE INDEX idx_cg_status ON campaign_goal(status);
```
#### 2.1.3 Initiative 表
```sql
CREATE TABLE campaign_initiative (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    initiative_type VARCHAR(32),               -- WINBACK / GROWTH / ENGAGEMENT / ACQUISITION
    status VARCHAR(32) DEFAULT 'PLANNED',      -- PLANNED / ACTIVE / PAUSED / COMPLETED
    priority INT DEFAULT 100,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ci_workspace ON campaign_initiative(workspace_id);
CREATE INDEX idx_ci_goal ON campaign_initiative(goal_id);
```
#### 2.1.4 Portfolio 表
```sql
CREATE TABLE campaign_portfolio (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'DRAFT',        -- DRAFT / OPTIMIZED / LOCKED / EXECUTING
    optimization_mode VARCHAR(32) DEFAULT 'ROI_MAXIMIZATION',
    total_budget DECIMAL(18,4),
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cp_workspace ON campaign_portfolio(workspace_id);
```
#### 2.1.5 Campaign Plan 表
```sql
CREATE TABLE campaign_plan (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64),
    initiative_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'DRAFT',        -- DRAFT / GENERATED / APPROVED / REJECTED / EXECUTING / COMPLETED
    total_budget DECIMAL(18,4),
    expected_roi DECIMAL(10,4),
    strategy_json JSONB,                       -- 策略配置
    allocation_json JSONB,                     -- 预算分配
    graph_json JSONB,                          -- Canvas DAG
    forecast_json JSONB,                       -- 预测结果
    created_by VARCHAR(64),
    approved_by VARCHAR(64),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cpl_workspace ON campaign_plan(workspace_id);
CREATE INDEX idx_cpl_status ON campaign_plan(status);
```
#### 2.1.6 Opportunity 表
```sql
CREATE TABLE campaign_opportunity (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64),
    member_id VARCHAR(64),                     -- 具体会员（或分群）
    segment_code VARCHAR(64),                  -- 分群标识
    opportunity_type VARCHAR(32),              -- CHURN_RISK / UPSELL / WINBACK / CROSS_SELL
    score DECIMAL(10,4),                       -- 机会评分
    churn_probability DECIMAL(10,4),           -- 流失概率（ML 输出）
    uplift_score DECIMAL(10,4),                -- 增量价值（ML 输出）
    confidence DECIMAL(10,4),                  -- 置信度
    external_influence DECIMAL(10,4),          -- 外部信号影响因子
    recommended_action VARCHAR(255),
    status VARCHAR(32) DEFAULT 'ACTIVE',       -- ACTIVE / CONSUMED / EXPIRED
    source VARCHAR(32),                        -- INTERNAL / EXTERNAL / ML
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_co_workspace ON campaign_opportunity(workspace_id);
CREATE INDEX idx_co_member ON campaign_opportunity(member_id);
CREATE INDEX idx_co_score ON campaign_opportunity(score DESC);
```
#### 2.1.7 Content Asset 表
```sql
CREATE TABLE campaign_content_asset (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    asset_name VARCHAR(255) NOT NULL,
    asset_type VARCHAR(32),                    -- EMAIL_HTML / SMS_TEXT / PUSH_JSON
    channel VARCHAR(32),                       -- EMAIL / SMS / PUSH
    subject_line VARCHAR(255),
    body_text TEXT,
    variable_schema JSONB,                     -- 变量占位符定义
    status VARCHAR(32) DEFAULT 'DRAFT',        -- DRAFT / PENDING_APPROVAL / APPROVED / REJECTED
    created_by VARCHAR(64),
    approved_by VARCHAR(64),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cca_program ON campaign_content_asset(program_code);
CREATE INDEX idx_cca_status ON campaign_content_asset(status);
```
#### 2.1.8 Approval Record 表
```sql
CREATE TABLE campaign_approval_record (
    id VARCHAR(64) PRIMARY KEY,
    asset_id VARCHAR(64),
    plan_id VARCHAR(64),
    node_id VARCHAR(64),
    requester_id VARCHAR(64),
    approver_id VARCHAR(64),
    action VARCHAR(32),                        -- SUBMITTED / APPROVED / REJECTED / REVOKED
    comment TEXT,
    snapshot_before JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_car_asset ON campaign_approval_record(asset_id);
CREATE INDEX idx_car_plan ON campaign_approval_record(plan_id);
```
#### 2.1.9 Intervention Command 表
```sql
CREATE TABLE campaign_intervention_command (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    plan_id VARCHAR(64),
    target_node_id VARCHAR(64),
    command_type VARCHAR(32),                  -- PAUSE / RESUME / CANCEL / SKIP_NODE / UPDATE_CONFIG
    reason TEXT,
    operator_id VARCHAR(64),
    previous_state_snapshot JSONB,
    new_config_snapshot JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);
CREATE INDEX idx_cic_plan ON campaign_intervention_command(plan_id);
```
#### 2.1.10 Execution Log 表
```sql
CREATE TABLE campaign_execution_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    plan_id VARCHAR(64),
    node_id VARCHAR(64),
    worker_type VARCHAR(50),
    status VARCHAR(20),                        -- SUCCESS / FAILED / SKIPPED
    message TEXT,
    variables JSONB,
    result_data JSONB,
    executed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cel_plan ON campaign_execution_log(plan_id);
CREATE INDEX idx_cel_time ON campaign_execution_log(executed_at DESC);
```
### 2.2 Loyalty 数据同步（结构化存储）
Campaign Tools 需要从 Loyalty 同步数据进行分析。开发阶段使用**增量查询**方式（定时任务），生产环境可升级为 CDC。
#### 2.2.1 会员宽表
```sql
CREATE TABLE campaign_member_dim (
    member_id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    name VARCHAR(100),
    gender VARCHAR(10),
    birthday DATE,
    tier_code VARCHAR(16),
    tier_name VARCHAR(50),
    tier_level INT,
    status VARCHAR(16),
    register_date DATE,
    -- 汇总指标（定时更新）
    total_order_count INT DEFAULT 0,
    total_order_amount DECIMAL(18,2) DEFAULT 0,
    avg_order_amount DECIMAL(18,2) DEFAULT 0,
    last_order_date DATE,
    last_order_days INT,
    total_points DECIMAL(18,4) DEFAULT 0,
    tier_points DECIMAL(18,4) DEFAULT 0,
    total_login_days INT DEFAULT 0,
    continuous_login_days INT DEFAULT 0,
    segment_code VARCHAR(64),                  -- 分群标识
    blacklist_flag BOOLEAN DEFAULT false,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cmd_program ON campaign_member_dim(program_code);
CREATE INDEX idx_cmd_tier ON campaign_member_dim(tier_code);
CREATE INDEX idx_cmd_segment ON campaign_member_dim(segment_code);
CREATE INDEX idx_cmd_last_order ON campaign_member_dim(last_order_days);
```
#### 2.2.2 订单事实表
```sql
CREATE TABLE campaign_order_fact (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    order_date TIMESTAMPTZ NOT NULL,
    order_amount DECIMAL(18,2) NOT NULL,
    discount_amount DECIMAL(18,2) DEFAULT 0,
    net_amount DECIMAL(18,2) NOT NULL,
    channel VARCHAR(32),
    order_status VARCHAR(20),
    item_count INT DEFAULT 0,
    points_earned DECIMAL(18,4) DEFAULT 0,
    synced_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cof_member ON campaign_order_fact(member_id);
CREATE INDEX idx_cof_date ON campaign_order_fact(order_date DESC);
CREATE INDEX idx_cof_program ON campaign_order_fact(program_code);
```
#### 2.2.3 同步服务（开发阶段）
```java
@Component
public class CampaignDataSyncService {
    @Autowired
    private MemberRepository memberRepo;
    @Autowired
    private AccountTransactionRepository txRepo;
    @Autowired
    private TierChangeLogRepository tierRepo;
    @Autowired
    private CampaignMemberDimRepository dimRepo;
    @Autowired
    private CampaignOrderFactRepository factRepo;
    
    /**
     * 定时同步（每 30 分钟）
     */
    @Scheduled(fixedDelay = 1800000)
    @Transactional
    public void syncAll() {
        syncMembers();
        syncOrders();
        syncPoints();
        syncTierChanges();
    }
    
    private void syncMembers() {
        // 从 Loyalty member 表查询增量数据
        LocalDateTime lastSync = getLastSyncTime();
        List<Member> members = memberRepo.findByUpdatedAtAfter(lastSync);
        for (Member member : members) {
            CampaignMemberDim dim = convertToDim(member);
            dimRepo.upsert(dim);
        }
        updateSyncTime();
    }
    
    private void syncOrders() {
        // 从 Loyalty account_transaction 或 event_inbox 同步订单数据
        // 具体实现取决于数据存储方式
    }
    
    private CampaignMemberDim convertToDim(Member member) {
        // 聚合计算：订单数、金额、最近订单等
        return CampaignMemberDim.builder()
            .memberId(member.getMemberId())
            .programCode(member.getProgramCode())
            .tierCode(member.getTierCode())
            .status(member.getStatus())
            .registerDate(member.getCreatedAt().toLocalDate())
            // ... 其他字段
            .build();
    }
}
```
## 三、Planning 模块设计
### 3.1 Workspace 管理
```text
┌─ Workspace 管理 ───────────────────────────────────────────────────────────┐
│ [+ 新建工作区]                                                             │
├────────────┬──────────────┬──────────────┬────────────────────────────────┤
│ 工作区名称  │ Program      │ 当前目标     │ 状态   │ 操作                 │
├────────────┼──────────────┼──────────────┼────────┼──────────────────────┤
│ 618大促    │ BRAND_A      │ GMV提升20%   │ ACTIVE │ [编辑] [进入]        │
│ Q3会员日   │ BRAND_A      │ 复购率提升   │ ACTIVE │ [编辑] [进入]        │
└────────────┴──────────────┴──────────────┴────────┼──────────────────────┘
```
### 3.2 Goal → Initiative → Plan 层级
```text
┌─ Goal: 618大促GMV提升20% ─────────────────────────────────────────────────┐
│ 目标类型: REVENUE  │  目标值: 1000万  │  当前值: 680万                  │
│ 有效期: 2026-06-01 ~ 2026-06-30                                         │
├───────────────────────────────────────────────────────────────────────────┤
│ ┌─ Initiative 1: 高价值会员召回 ───────────────────────────────────────┐ │
│ │  类型: WINBACK  │  优先级: 1  │  预算: 30万                         │ │
│ │  └─ Plan: 召回邮件 + 折扣券                                         │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Initiative 2: 新会员促活 ───────────────────────────────────────────┐ │
│ │  类型: ACQUISITION  │  优先级: 2  │  预算: 20万                     │ │
│ │  └─ Plan: 首购礼包 + 积分加倍                                       │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
│ ┌─ Initiative 3: 会员升级激励 ─────────────────────────────────────────┐ │
│ │  类型: GROWTH  │  优先级: 3  │  预算: 15万                         │ │
│ │  └─ Plan: 等级直升 + 专属权益                                       │ │
│ └───────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────┘
```
### 3.3 Planning Java Service
```java
@Service
public class PlanningService {
    @Autowired
    private WorkspaceRepository workspaceRepo;
    @Autowired
    private GoalRepository goalRepo;
    @Autowired
    private InitiativeRepository initiativeRepo;
    @Autowired
    private PlanRepository planRepo;
    @Autowired
    private OpportunityService opportunityService;
    @Autowired
    private AIPlanner aiPlanner;
    
    /**
     * AI 生成 Campaign Plan
     */
    public CampaignPlan generatePlan(String goalId, BigDecimal budget) {
        Goal goal = goalRepo.findById(goalId);
        if (!"ACTIVE".equals(goal.getStatus())) {
            throw new BusinessException("Goal 必须为 ACTIVE 状态");
        }
        
        // 1. 获取机会列表
        List<Opportunity> opportunities = opportunityService.discover(goal);
        if (opportunities.isEmpty()) {
            throw new BusinessException("未发现可用的营销机会");
        }
        
        // 2. AI 生成策略
        AIPlanRequest request = AIPlanRequest.builder()
            .goal(goal)
            .opportunities(opportunities)
            .budget(budget)
            .build();
        AIPlanResponse response = aiPlanner.generatePlan(request);
        
        // 3. 保存 Plan
        CampaignPlan plan = CampaignPlan.builder()
            .workspaceId(goal.getWorkspaceId())
            .goalId(goalId)
            .name(response.getPlanName())
            .status("GENERATED")
            .totalBudget(budget)
            .expectedRoi(response.getExpectedRoi())
            .strategyJson(response.getStrategy())
            .allocationJson(response.getAllocation())
            .graphJson(response.getGraph())
            .forecastJson(response.getForecast())
            .build();
        
        return planRepo.save(plan);
    }
}
```
## 四、Opportunity Intelligence 模块设计
### 4.1 核心架构（Drools 不参与）
```text
Loyalty 同步数据
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. SQL 预过滤（硬性门槛）                                   │
│    - 会员状态 = ACTIVE                                      │
│    - 非黑名单                                               │
│    - 目标等级范围内                                         │
│    - 注册时间符合条件                                       │
│    输出：合格会员列表                                       │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. ML 预测评分（Python 服务 / ONNX 模型）                  │
│    - 输入：会员特征向量（RFM + 行为特征）                    │
│    - 输出：churn_probability, uplift_score, conversion_prob │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. AI 外部信号加权（LLM + Skills）                        │
│    - 竞品价格监控                                           │
│    - 舆情事件检测                                           │
│    - 动态调整评分权重                                       │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
    Opportunity Set
```
### 4.2 Opportunity Service（不含 Drools）
```java
@Service
public class OpportunityService {
    @Autowired
    private CampaignMemberDimRepository dimRepo;
    @Autowired
    private CampaignOrderFactRepository orderRepo;
    @Autowired
    private MLScoringClient mlClient;
    @Autowired
    private ExternalSignalService externalSignalService;
    
    /**
     * 发现机会（不经过 Drools）
     */
    public List<Opportunity> discover(Goal goal) {
        // 1. SQL 预过滤：硬性门槛
        List<CampaignMemberDim> eligibleMembers = dimRepo.findEligibleMembers(
            goal.getProgramCode(),
            goal.getTargetSegment(),
            List.of("ACTIVE"),
            goal.getTargetTiers(),
            goal.getStartTime(),
            goal.getEndTime()
        );
        
        if (eligibleMembers.isEmpty()) {
            return Collections.emptyList();
        }
        
        // 2. ML 预测评分
        List<MemberFeature> features = eligibleMembers.stream()
            .map(this::toFeature)
            .collect(Collectors.toList());
        List<MLScoreResult> mlResults = mlClient.predict(features);
        
        // 3. 外部信号加权
        List<ExternalSignal> activeSignals = externalSignalService.getActiveSignals(
            goal.getProgramCode()
        );
        
        // 4. 组合生成 Opportunity
        List<Opportunity> opportunities = new ArrayList<>();
        for (int i = 0; i < eligibleMembers.size(); i++) {
            CampaignMemberDim dim = eligibleMembers.get(i);
            MLScoreResult mlResult = mlResults.get(i);
            
            double externalWeight = calculateExternalWeight(activeSignals, dim);
            double finalScore = mlResult.getScore() * externalWeight;
            
            Opportunity opp = Opportunity.builder()
                .workspaceId(goal.getWorkspaceId())
                .goalId(goal.getId())
                .memberId(dim.getMemberId())
                .segmentCode(dim.getSegmentCode())
                .opportunityType(determineType(mlResult))
                .score(finalScore)
                .churnProbability(mlResult.getChurnProb())
                .upliftScore(mlResult.getUpliftScore())
                .confidence(mlResult.getConfidence())
                .externalInfluence(externalWeight)
                .recommendedAction(determineAction(mlResult))
                .source("ML")
                .build();
            opportunities.add(opp);
        }
        
        // 5. 按评分排序，截取 Top N
        opportunities.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        return opportunities.stream().limit(10000).collect(Collectors.toList());
    }
    
    private double calculateExternalWeight(List<ExternalSignal> signals, CampaignMemberDim dim) {
        double weight = 1.0;
        for (ExternalSignal signal : signals) {
            if ("PRICE_DROP".equals(signal.getSignalType()) 
                && signal.getAffectedSegments().contains(dim.getSegmentCode())) {
                weight += signal.getImpactFactor();
            }
            if ("VIRAL_EVENT".equals(signal.getSignalType())) {
                weight += signal.getImpactFactor() * 0.3;
            }
        }
        return Math.min(weight, 2.0); // 上限2倍
    }
}
```
### 4.3 外部信号（AI Skills）
```java
@Component
public class ExternalSignalService {
    @Autowired
    private LLMClient llmClient;
    @Autowired
    private WebCrawlerService crawler;
    @Autowired
    private CampaignExternalSignalRepository signalRepo;
    
    /**
     * 执行外部信号采集（定时任务）
     */
    @Scheduled(cron = "0 0 */6 * * ?") // 每6小时
    @Transactional
    public void collectExternalSignals() {
        // 1. 竞品价格监控
        List<CompetitorPriceSignal> priceSignals = monitorCompetitorPrices();
        
        // 2. 舆情监控
        List<SentimentSignal> sentimentSignals = monitorSocialSentiment();
        
        // 3. 保存信号
        for (CompetitorPriceSignal signal : priceSignals) {
            ExternalSignal extSignal = ExternalSignal.builder()
                .signalType("PRICE_DROP")
                .severity(signal.getSeverity())
                .sourceSkill("COMPETITOR_MONITOR")
                .targetEntity(signal.getBrand())
                .impactFactor(signal.getImpactFactor())
                .affectedSegments(signal.getAffectedSegments())
                .recommendedAction(signal.getRecommendedAction())
                .expiresAt(signal.getExpiresAt())
                .build();
            signalRepo.save(extSignal);
        }
    }
}
```
### 4.4 ML 模型集成（Python 服务）
python
```
# ml_service/app.py
from flask import Flask, request, jsonify
import joblib
import numpy as np
app = Flask(__name__)
# 加载模型
churn_model = joblib.load('models/churn_xgboost.pkl')
uplift_model = joblib.load('models/uplift_xgboost.pkl')
@app.route('/predict', methods=['POST'])
def predict():
    data = request.json
    features = np.array([item['features'] for item in data['members']])
    
    churn_probs = churn_model.predict_proba(features)[:, 1]
    uplift_scores = uplift_model.predict(features)
    
    results = []
    for i, member in enumerate(data['members']):
        results.append({
            'member_id': member['member_id'],
            'churn_probability': float(churn_probs[i]),
            'uplift_score': float(uplift_scores[i]),
            'confidence': 0.85
        })
    
    return jsonify(results)
```
### 4.5 Java 调用 ML 服务
```java
@Component
public class MLScoringClient {
    @Autowired
    private RestTemplate restTemplate;
    
    public List<MLScoreResult> predict(List<MemberFeature> features) {
        MLRequest request = new MLRequest();
        request.setMembers(features);
        
        ResponseEntity<MLResponse> response = restTemplate.postForEntity(
            "http://ml-service:5000/predict",
            request,
            MLResponse.class
        );
        
        return response.getBody().getResults();
    }
}
```
## 五、Execution 模块设计（复用 LiteFlow）
### 5.1 Canvas → LiteFlow 编译
```java
@Component
public class CanvasToLiteFlowCompiler {
    
    public String compile(CampaignPlan plan) {
        JSONObject graph = plan.getGraphJson();
        JSONArray nodes = graph.getJSONArray("nodes");
        JSONArray edges = graph.getJSONArray("edges");
        
        // 拓扑排序
        List<JSONObject> sortedNodes = topologicalSort(nodes, edges);
        
        StringBuilder el = new StringBuilder();
        el.append("THEN(\n");
        for (JSONObject node : sortedNodes) {
            String nodeType = node.getString("type");
            String nodeId = node.getString("id");
            String componentName = mapToLiteFlowComponent(nodeType);
            el.append("    ").append(componentName).append(",\n");
        }
        el.append(")");
        
        return el.toString();
    }
    
    private String mapToLiteFlowComponent(String nodeType) {
        switch (nodeType) {
            case "AUDIENCE_FILTER":
                return "campaignAudienceFilterCmp";
            case "SEND_EMAIL":
                return "campaignSendEmailCmp";
            case "SEND_SMS":
                return "campaignSendSmsCmp";
            case "OFFER_POINTS":
                return "campaignOfferPointsCmp";
            case "OFFER_COUPON":
                return "campaignOfferCouponCmp";
            case "CONDITION":
                return "campaignConditionCmp";
            case "DELAY":
                return "campaignDelayCmp";
            case "TIER_UPGRADE":
                return "campaignTierUpgradeCmp";
            default:
                return "campaignDefaultCmp";
        }
    }
}
```
### 5.2 LiteFlow 组件扩展（新增 Campaign 节点）
```java
@Component("campaignSendEmailCmp")
public class CampaignSendEmailComponent extends BaseLiteflowComponent {
    @Autowired
    private ChannelService channelService;
    @Autowired
    private ContentService contentService;
    
    @Override
    protected void doProcess(EventContext ctx) {
        JSONObject config = ctx.getAttribute("campaignNodeConfig");
        String memberId = ctx.getMemberId();
        String assetId = config.getString("assetId");
        
        // 1. 获取会员信息
        Member member = memberRepo.findByMemberId(memberId);
        
        // 2. 渲染内容
        String renderedContent = contentService.render(assetId, member);
        
        // 3. 发送邮件
        channelService.sendEmail(member.getEmail(), renderedContent);
        
        // 4. 记录执行日志
        logExecution(ctx, "SEND_EMAIL", "SUCCESS");
    }
}
```
### 5.3 LiteFlow 组件在 Campaign 系统中的定位
**重要说明**：Campaign 系统中的 LiteFlow 组件与 Loyalty 系统的 LiteFlow 组件**共享同一引擎实例**，通过组件名称前缀区分：
| 组件类型         | 命名规范          | 示例                                                  | 用途           |
| ------------ | ------------- | --------------------------------------------------- | ------------ |
| Loyalty 核心组件 | 无前缀           | `idempotentCmp`, `standardizeCmp`, `ruleEngineCmp`  | Loyalty 事件处理 |
| Campaign 组件  | `campaign` 前缀 | `campaignAudienceFilterCmp`, `campaignSendEmailCmp` | Campaign 执行  |
两者互不干扰，可以共存于同一 LiteFlow 配置中。
## 六、AI 集成设计
### 6.1 AI 使用场景
| 场景          | AI 能力  | 输入                            | 输出            |
| ----------- | ------ | ----------------------------- | ------------- |
| **Plan 生成** | 策略规划   | Goal + Opportunities + Budget | Campaign Plan |
| **机会发现**    | 外部信号采集 | 竞品数据、舆情数据                     | 外部信号列表        |
| **内容生成**    | 文案创作   | 活动主题、目标人群                     | 邮件/短信模板       |
| **人群推荐**    | 人群分析   | 会员特征                          | 目标人群建议        |
### 6.2 AI 调用封装
```java
@Service
public class AIPlanner {
    @Autowired
    private LLMClient llmClient;
    @Autowired
    private PromptTemplateRegistry promptRegistry;
    
    public AIPlanResponse generatePlan(AIPlanRequest request) {
        String prompt = promptRegistry.getTemplate("plan_generation")
            .render(request);
        
        String response = llmClient.chat(prompt);
        
        return parseResponse(response);
    }
    
    public String generateContent(String template, Map<String, Object> context) {
        String prompt = promptRegistry.getTemplate("content_generation")
            .render(template, context);
        
        return llmClient.chat(prompt);
    }
}
@Service
public class LLMClient {
    @Value("${llm.api.url}")
    private String apiUrl;
    @Value("${llm.api.key}")
    private String apiKey;
    
    public String chat(String prompt) {
        // 调用 LLM API（OpenAI / 阿里云 / 私有部署）
        // 开发阶段可使用 Mock
        if (isDevMode()) {
            return mockResponse(prompt);
        }
        return callRealLLM(prompt);
    }
}
```
### 6.3 Prompt 模板管理
```sql
CREATE TABLE campaign_prompt_template (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    template_code VARCHAR(64) NOT NULL,
    template_name VARCHAR(255),
    template_type VARCHAR(32),                -- PLAN_GENERATION / CONTENT_GENERATION / OPPORTUNITY_ANALYSIS
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
## 七、与 Loyalty 系统的集成点
### 7.1 集成点总览
| 集成点       | Loyalty 能力                            | Campaign Tools 使用方式            |
| --------- | ------------------------------------- | ------------------------------ |
| **会员数据**  | `member` 表                            | 定时同步到 `campaign_member_dim`    |
| **订单数据**  | `event_inbox` / `account_transaction` | 定时同步到 `campaign_order_fact`    |
| **积分发放**  | `PointGrantService`                   | 通过 `campaignOfferPointsCmp` 调用 |
| **优惠券发放** | `CouponService`                       | 通过 `campaignOfferCouponCmp` 调用 |
| **消息发送**  | `ChannelService`                      | 通过 `campaignSendEmailCmp` 调用   |
| **等级变更**  | `TierService`                         | 通过 `campaignTierUpgradeCmp` 调用 |
| **流程编排**  | `LiteFlow`                            | 复用，新增 Campaign 组件              |
| **事件系统**  | `EventBridge`                         | 复用，发布 Campaign 事件              |
### 7.2 调用 Loyalty 服务（示例）
```java
@Component("campaignOfferPointsCmp")
public class CampaignOfferPointsComponent extends BaseLiteflowComponent {
    @Autowired
    private PointGrantService pointGrantService;  // Loyalty 服务
    
    @Override
    protected void doProcess(EventContext ctx) {
        String programCode = ctx.getProgramCode();
        String memberId = ctx.getMemberId();
        BigDecimal points = ctx.getAttribute("pointsAmount");
        String pointType = ctx.getAttribute("pointType");
        String ruleId = ctx.getAttribute("campaignRuleId");
        
        // 直接调用 Loyalty 的积分发放服务
        pointGrantService.grantPoints(
            programCode,
            memberId,
            pointType,
            points,
            ruleId,
            null  // ruleSnapshotId
        );
    }
}
```
### 7.3 事件发布（复用 EventBridge）
```java
@Component
public class CampaignEventPublisher {
    @Autowired
    private EventBridge eventBridge;  // Loyalty 事件总线
    
    public void publishPlanGenerated(CampaignPlan plan) {
        eventBridge.publish(
            "campaign-events",
            plan.getId(),
            new CampaignPlanGeneratedEvent(plan)
        );
    }
    
    public void publishOpportunityDiscovered(List<Opportunity> opportunities) {
        eventBridge.publish(
            "campaign-events",
            "opportunity-batch",
            new OpportunityDiscoveredEvent(opportunities)
        );
    }
}
```
## 八、前端界面设计
### 8.1 菜单结构
```text
营销活动
  ├── 工作台（Dashboard）
  ├── 规划（Planning）
  │   ├── 目标管理（Goal）
  │   ├── 举措管理（Initiative）
  │   └── 组合管理（Portfolio）
  ├── 机会发现（Opportunity）
  │   ├── 机会列表
  │   └── AI 分析
  ├── 活动画布（Canvas）
  │   ├── 新建活动
  │   └── 活动列表
  └── 素材管理（Content）
      ├── 模板管理
      └── 审批管理
```
### 8.2 Canvas 画布（复用 React Flow）
```text
┌─ 画布编辑器 ──────────────────────────────────────────────────────────────┐
│ [保存] [发布] [模拟] [执行]                                  [配置面板]   │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌──────────────┐ ┌────────────────────────────────────────────────────┐ │
│ │  节点库       │ │                                                   │ │
│ │ ┌──────────┐ │ │                                                   │ │
│ │ │人群筛选   │ │ │   [人群筛选] → [条件分支] → [发送邮件]           │ │
│ │ ├──────────┤ │ │         │                                        │ │
│ │ │条件分支   │ │ │         ▼                                        │ │
│ │ ├──────────┤ │ │   [延迟等待] → [发送短信]                        │ │
│ │ │延迟等待   │ │ │                                                   │ │
│ │ ├──────────┤ │ │                                                   │ │
│ │ │发送邮件   │ │ │                                                   │ │
│ │ ├──────────┤ │ │                                                   │ │
│ │ │发送短信   │ │ │                                                   │ │
│ │ ├──────────┤ │ │                                                   │ │
│ │ │发放积分   │ │ │                                                   │ │
│ │ ├──────────┤ │ │                                                   │ │
│ │ │发放优惠券 │ │ │                                                   │ │
│ │ └──────────┘ │ │                                                   │ │
│ └──────────────┘ └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```
### 8.3 Node 配置面板
```text
┌─ 节点配置 ──────────────────────────────────────────────────────────────┐
│ 节点类型: 发送邮件                                                       │
│ 节点名称: [ 欢迎邮件 ]                                                   │
│                                                                          │
│ ┌─ 内容配置 ───────────────────────────────────────────────────────────┐ │
│ │ 素材模板: [ 欢迎邮件模板 ▼ ]                                         │ │
│ │ 变量映射:                                                           │ │
│ │   {{user_name}} → 会员姓名                                          │ │
│ │   {{tier_name}} → 会员等级                                          │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ┌─ 执行策略 ───────────────────────────────────────────────────────────┐ │
│ │ 重试次数: [3]   超时时间: [30] 秒                                    │ │
│ │ 幂等控制: [✓]                                                        │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ [保存] [取消]                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```
## 九、API 设计
### 9.1 Planning API
| 方法   | 路径                                 | 说明      |
| ---- | ---------------------------------- | ------- |
| POST | `/api/campaign/workspace`          | 创建工作区   |
| GET  | `/api/campaign/workspace/{id}`     | 获取工作区   |
| POST | `/api/campaign/goal`               | 创建目标    |
| POST | `/api/campaign/goal/{id}/activate` | 激活目标    |
| POST | `/api/campaign/initiative`         | 创建举措    |
| POST | `/api/campaign/portfolio`          | 创建组合    |
| POST | `/api/campaign/plan/generate`      | AI 生成计划 |
### 9.2 Opportunity API
| 方法   | 路径                                      | 说明     |
| ---- | --------------------------------------- | ------ |
| GET  | `/api/campaign/opportunity?goalId={id}` | 获取机会列表 |
| POST | `/api/campaign/opportunity/discover`    | 触发机会发现 |
| POST | `/api/campaign/opportunity/refresh`     | 刷新机会评分 |
### 9.3 Execution API
| 方法   | 路径                                    | 说明              |
| ---- | ------------------------------------- | --------------- |
| POST | `/api/campaign/canvas`                | 保存画布            |
| GET  | `/api/campaign/canvas/{id}`           | 获取画布            |
| POST | `/api/campaign/canvas/{id}/compile`   | 编译为 LiteFlow EL |
| POST | `/api/campaign/execution/{id}/start`  | 启动执行            |
| POST | `/api/campaign/execution/{id}/pause`  | 暂停执行            |
| POST | `/api/campaign/execution/{id}/resume` | 恢复执行            |
| POST | `/api/campaign/execution/{id}/cancel` | 取消执行            |
| GET  | `/api/campaign/execution/{id}/status` | 获取执行状态          |
### 9.4 Content API
| 方法   | 路径                                         | 说明   |
| ---- | ------------------------------------------ | ---- |
| POST | `/api/campaign/content/asset`              | 创建素材 |
| PUT  | `/api/campaign/content/asset/{id}`         | 更新素材 |
| POST | `/api/campaign/content/asset/{id}/approve` | 审批通过 |
| POST | `/api/campaign/content/asset/{id}/reject`  | 审批拒绝 |
## 十、开发阶段技术简化方案
### 10.1 不使用 Kafka 的替代方案
| 原设计（Kafka） | 开发阶段替代           | 说明                    |
| ---------- | ---------------- | --------------------- |
| CDC 实时同步   | 定时任务（@Scheduled） | 每 30 分钟同步一次           |
| 事件发布/订阅    | 直接方法调用           | 使用 Spring Event 或同步调用 |
| 异步处理       | 同步处理             | 简化调试                  |
```java
// 开发阶段：同步事件处理
@Component
public class CampaignEventPublisherDev {
    @Autowired
    private List<CampaignEventListener> listeners;
    
    public void publish(CampaignEvent event) {
        for (CampaignEventListener listener : listeners) {
            listener.onEvent(event);
        }
    }
}
```
### 10.2 不使用 Redis 的替代方案
| 原设计（Redis） | 开发阶段替代                    | 说明       |
| ---------- | ------------------------- | -------- |
| 分布式锁       | 数据库悲观锁（SELECT FOR UPDATE） | 开发阶段并发量低 |
| 缓存         | 直接查询数据库                   | 简化架构     |
| 限流         | 无                         | 开发阶段不启用  |
```java
// 开发阶段：使用数据库乐观锁替代 Redis 分布式锁
@Version
private Long version;  // 实体版本号
```
### 10.3 生产环境迁移路径
```text
开发阶段（当前）
  ├── PostgreSQL（唯一数据源）
  ├── 定时任务（数据同步）
  ├── 同步调用（事件处理）
  └── 数据库锁（并发控制）
生产环境（后续）
  ├── PostgreSQL + Kafka（事件驱动）
  ├── Redis（缓存 + 分布式锁）
  ├── CDC 实时同步
  └── 异步处理 + 重试
```
## 十一、与 campaign\_llm.md 的差异对照
| 原设计（campaign\_llm.md） | 本设计（Loyalty 融合版）     | 差异说明   |
| --------------------- | -------------------- | ------ |
| 独立系统                  | Loyalty 扩展层          | 定位调整   |
| Zeebe 工作流             | LiteFlow（复用）         | 执行引擎复用 |
| Drools 用于机会评分         | Drools 不参与 Campaign  | 边界明确   |
| Kafka + Redis 标配      | 开发阶段不使用              | 简化落地   |
| 独立事件系统                | 复用 EventBridge       | 事件系统复用 |
| 独立规则引擎                | 复用 Drools（仅 Loyalty） | 规则引擎复用 |
| 自建画布                  | 复用 React Flow        | 前端复用   |
| ML 模型可选               | ML 模型为核心评分           | 评分机制明确 |
## 十二、开发实施步骤
### Phase 1：数据与基础（2周）
1. 创建 Campaign 数据表（9 张表）
2. 实现数据同步服务（定时任务 + 宽表）
3. 实现 Workspace/Goal/Initiative/Portfolio CRUD API
4. 实现 Plan 生成 API（基础版，先不接入 AI）
### Phase 2：Planning + AI（3周）
5. 实现 Opportunity 发现服务（SQL 预过滤 + ML 评分接口）
6. 集成 ML 预测服务（调用 Python 模型）
7. 实现 AI Planner（调用 LLM 生成 Plan）
8. 实现外部信号采集（AI Skills：竞品监控、舆情监控）
### Phase 3：Execution（3周）
9. 实现 Canvas 画布界面（复用 React Flow）
10. 实现 Canvas → LiteFlow Compiler
11. 实现 Campaign LiteFlow 组件（6 个节点类型）
12. 实现 Execution 服务（启动/暂停/恢复/取消）
### Phase 4：Content & 闭环（2周）
13. 实现 Content Asset 管理
14. 实现审批流（Approval）
15. 实现人工干预（Intervention）
16. 实现 Feedback 数据回流
## 十三、总结
本设计文档基于 `campaign_llm.md` 进行融合优化，核心调整如下：
1. **系统定位**：从独立系统调整为 Loyalty 平台的营销扩展层
2. **执行引擎**：复用 LiteFlow，不引入 Zeebe（开发阶段）
3. **Drools 边界**：明确 Drools 仅用于 Loyalty 积分/等级规则，Campaign 不使用
4. **机会评分**：SQL 预过滤 + ML 预测 + AI 外部加权，三层协作
5. **技术简化**：开发阶段不使用 Kafka 和 Redis，降低落地难度
6. **数据同步**：通过定时任务从 Loyalty 同步数据
7. **AI 集成**：直接调用 LLM API，不经过中间层
8. **前端复用**：复用 Loyalty 已有的 React Flow 画布能力
本设计可直接作为开发团队的技术规格说明书使用。
# Campaign Tools 平台设计文档（Loyalty 融合版 V2）
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：4.0\
> **设计原则**：
>
> * **Loyalty 优先**：Campaign Tools 是 Loyalty 平台的扩展层
>
> * **Zeebe 统一执行**：Campaign 所有流程统一使用 Zeebe 执行引擎
>
> * **LiteFlow 保持独立**：LiteFlow 继续服务 Loyalty 核心事件处理（幂等、标准化、One-ID等），两者共存不冲突
>
> * **轻量落地**：开发阶段简化技术栈，PostgreSQL 为主
## 一、执行引擎策略（修正）
### 1.1 Zeebe vs LiteFlow 分工
| 引擎           | 职责范围           | 说明                                      |
| ------------ | -------------- | --------------------------------------- |
| **LiteFlow** | Loyalty 核心事件处理 | 幂等检查、数据标准化、One-ID 匹配、规则引擎、动作执行（保持不变）    |
| **Zeebe**    | Campaign 流程执行  | 所有 Campaign 相关流程（含审批、长时等待、状态查询、Saga 补偿） |
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 平台                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  LiteFlow（现有，保持不变）                                         │   │
│  │  幂等检查 → 标准化 → One-ID → 规则引擎 → 动作执行                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ Campaign 流程调用
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Campaign Tools                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Zeebe（新增，统一执行 Campaign 流程）                               │   │
│  │  Canvas DAG → BPMN Compiler → Zeebe → Workers → Loyalty 能力       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.2 为什么选择 Zeebe
| 能力          | LiteFlow | Zeebe           | Campaign 需求    |
| ----------- | -------- | --------------- | -------------- |
| 状态持久化       | ❌ 无      | ✅ 事件溯源          | 流程中断后可恢复       |
| 人工审批节点      | ❌ 不支持    | ✅ User Task     | 内容审批、预算审批      |
| 长时等待（定时/事件） | ⚠️ 需自建   | ✅ Timer/Message | 延迟发送、等待事件      |
| 流程状态查询      | ❌ 不支持    | ✅ Operate UI    | 运营查看执行进度       |
| 失败补偿/Saga   | ⚠️ 需自建   | ✅ 支持            | 部分失败回滚         |
| 分布式高可用      | ⚠️ 需自建   | ✅ 原生支持          | 大规模并发执行        |
| 与 Java 集成   | ✅ 优秀     | ✅ 优秀            | Spring Boot 支持 |
## 二、Zeebe 本地开发环境配置
### 2.1 依赖配置
xml
运行
```
<!-- pom.xml -->
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
```
### 2.2 application.yml 配置（开发阶段）
yaml
```
# Zeebe 配置（开发阶段使用嵌入式模式）
zeebe:
  client:
    broker:
      gateway-address: localhost:26500
    security:
      plaintext: true
  embedded:
    enabled: true
    container:
      port: 26500
    data:
      directory: ./zeebe-data  # RocksDB 数据目录
# 生产环境切换为独立 Zeebe 集群
# zeebe:
#   client:
#     broker:
#       gateway-address: zeebe-gateway:26500
```
### 2.3 Docker Compose 环境（开发阶段可选）
yaml
```
# docker-compose.yml（开发阶段可选择不使用，直接嵌入式启动）
version: '3.8'
services:
  postgres:
    image: postgres:15
    environment:
      POSTGRES_DB: campaign_dev
      POSTGRES_USER: campaign_user
      POSTGRES_PASSWORD: campaign_pass
    ports:
      - "5432:5432"
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
  # Zeebe 独立模式（也可使用嵌入式，二选一）
  zeebe:
    image: camunda/zeebe:8.5.0
    ports:
      - "26500:26500"
    environment:
      - ZEEBE_LOG_LEVEL=debug
```
### 2.4 Zeebe 嵌入式配置
```java
package com.loyalty.platform.campaign.config;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.embedded.EmbeddedZeebe;
import io.camunda.zeebe.embedded.EmbeddedZeebeConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
@Configuration
@Profile("dev")
public class ZeebeEmbeddedConfig {
    @Bean
    public EmbeddedZeebe embeddedZeebe() {
        EmbeddedZeebeConfig config = EmbeddedZeebeConfig.builder()
            .setPort(26500)
            .setDataDirectory("./zeebe-data")
            .build();
        return EmbeddedZeebe.start(config);
    }
    @Bean
    public ZeebeClient zeebeClient(EmbeddedZeebe embeddedZeebe) {
        return ZeebeClient.newClientBuilder()
            .gatewayAddress("localhost:26500")
            .usePlaintext()
            .defaultRequestTimeout(Duration.ofSeconds(30))
            .build();
    }
}
```
### 2.5 生产环境 Zeebe 配置
```java
@Configuration
@Profile("prod")
public class ZeebeProductionConfig {
    @Bean
    public ZeebeClient zeebeClient() {
        return ZeebeClient.newClientBuilder()
            .gatewayAddress("zeebe-gateway:26500")
            .usePlaintext()  // 生产环境应使用 TLS
            .defaultRequestTimeout(Duration.ofSeconds(30))
            .build();
    }
}
```
## 三、BPMN 流程定义
### 3.1 通用 Campaign 流程模板
xml
运行
```
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="CampaignFlow" isExecutable="true">
    
    <!-- 开始事件（由 API 触发） -->
    <bpmn:startEvent id="StartEvent_1">
      <bpmn:messageEventDefinition id="MessageEventDefinition_1" />
    </bpmn:startEvent>
    <!-- 人群筛选 Service Task -->
    <bpmn:serviceTask id="Activity_AudienceFilter" name="人群筛选"
                      zeebe:taskType="campaign-audience-filter">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="campaign-audience-filter" />
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <!-- AI 评分 Service Task -->
    <bpmn:serviceTask id="Activity_AIScore" name="AI 评分"
                      zeebe:taskType="campaign-ai-score">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="campaign-ai-score" />
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <!-- 条件分支（Exclusive Gateway） -->
    <bpmn:exclusiveGateway id="Gateway_1" name="高价值用户?">
      <bpmn:conditionExpression>
        = return variables.score >= 0.7
      </bpmn:conditionExpression>
    </bpmn:exclusiveGateway>
    <!-- 人工审批 User Task（Zeebe 特有） -->
    <bpmn:userTask id="Activity_Approval" name="内容审批">
      <bpmn:extensionElements>
        <zeebe:assignmentDefinition assignee="approver" />
        <zeebe:taskDefinition type="campaign-approval" />
      </bpmn:extensionElements>
    </bpmn:userTask>
    <!-- 发送邮件 Service Task -->
    <bpmn:serviceTask id="Activity_SendEmail" name="发送邮件"
                      zeebe:taskType="campaign-send-email">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="campaign-send-email" />
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <!-- 延迟等待 Timer -->
    <bpmn:intermediateCatchEvent id="Timer_1" name="延迟2天">
      <bpmn:timerEventDefinition>
        <bpmn:timeDuration>P2D</bpmn:timeDuration>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>
    <!-- 结束事件 -->
    <bpmn:endEvent id="EndEvent_1" />
    <!-- 连线 -->
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Activity_AudienceFilter" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Activity_AudienceFilter" targetRef="Activity_AIScore" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Activity_AIScore" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Activity_Approval">
      <bpmn:conditionExpression>score >= 0.7</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Gateway_1" targetRef="EndEvent_1">
      <bpmn:conditionExpression>score < 0.7</bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Activity_Approval" targetRef="Timer_1" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Timer_1" targetRef="Activity_SendEmail" />
    <bpmn:sequenceFlow id="Flow_8" sourceRef="Activity_SendEmail" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
```
## 四、Canvas → BPMN Compiler
### 4.1 核心编译器
```java
package com.loyalty.platform.campaign.compiler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Component;
import java.util.*;
import java.util.stream.Collectors;
@Component
public class CanvasToBpmnCompiler {
    private static final String BPMN_TEMPLATE = """
        <?xml version="1.0" encoding="UTF-8"?>
        <bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                          xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                          xmlns:zeebe="http://camunda.org/schema/zeebe/1.0"
                          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                          id="Definitions_1"
                          targetNamespace="http://bpmn.io/schema/bpmn">
          <bpmn:process id="%s" isExecutable="true">
            %s
          </bpmn:process>
        </bpmn:definitions>
        """;
    public String compile(String canvasId, JsonNode graph) {
        String processId = "campaign_" + canvasId.replace("-", "_");
        String bpmnContent = generateBpmnContent(graph, processId);
        return String.format(BPMN_TEMPLATE, processId, bpmnContent);
    }
    private String generateBpmnContent(JsonNode graph, String processId) {
        JsonNode nodes = graph.get("nodes");
        JsonNode edges = graph.get("edges");
        
        StringBuilder bpmn = new StringBuilder();
        bpmn.append("<bpmn:startEvent id=\"StartEvent_1\">\n");
        bpmn.append("  <bpmn:messageEventDefinition id=\"MessageEventDefinition_1\" />\n");
        bpmn.append("</bpmn:startEvent>\n");
        
        // 拓扑排序
        List<String> sortedNodeIds = topologicalSort(nodes, edges);
        
        Map<String, String> nodeIdMap = new HashMap<>();
        int seq = 0;
        for (String nodeId : sortedNodeIds) {
            String bpmnId = "Activity_" + (++seq);
            nodeIdMap.put(nodeId, bpmnId);
            JsonNode node = findNode(nodes, nodeId);
            bpmn.append(generateNodeBpmn(bpmnId, node));
        }
        
        // 生成结束事件
        bpmn.append("<bpmn:endEvent id=\"EndEvent_1\" />\n");
        
        // 生成连线
        bpmn.append(generateSequenceFlows(edges, nodeIdMap));
        
        return bpmn.toString();
    }
    private String generateNodeBpmn(String bpmnId, JsonNode node) {
        String nodeType = node.get("type").asText();
        String nodeName = node.has("name") ? node.get("name").asText() : nodeType;
        String workerType = mapToWorkerType(nodeType);
        
        switch (nodeType) {
            case "AUDIENCE_FILTER":
            case "AI_SCORE":
            case "SEND_EMAIL":
            case "SEND_SMS":
            case "OFFER_POINTS":
            case "OFFER_COUPON":
            case "WEBHOOK":
                return String.format("""
                    <bpmn:serviceTask id="%s" name="%s" zeebe:taskType="%s">
                      <bpmn:extensionElements>
                        <zeebe:taskDefinition type="%s" />
                      </bpmn:extensionElements>
                    </bpmn:serviceTask>
                    """, bpmnId, nodeName, workerType, workerType);
            
            case "CONDITION":
                return String.format("""
                    <bpmn:exclusiveGateway id="%s" name="%s" />
                    """, bpmnId, nodeName);
            
            case "APPROVAL":
                return String.format("""
                    <bpmn:userTask id="%s" name="%s">
                      <bpmn:extensionElements>
                        <zeebe:assignmentDefinition assignee="approver" />
                        <zeebe:taskDefinition type="%s" />
                      </bpmn:extensionElements>
                    </bpmn:userTask>
                    """, bpmnId, nodeName, workerType);
            
            case "DELAY":
                long delayMs = node.has("config") && node.get("config").has("delayMs") 
                    ? node.get("config").get("delayMs").asLong() : 86400000; // 默认1天
                String duration = formatDuration(delayMs);
                return String.format("""
                    <bpmn:intermediateCatchEvent id="%s" name="%s">
                      <bpmn:timerEventDefinition>
                        <bpmn:timeDuration>%s</bpmn:timeDuration>
                      </bpmn:timerEventDefinition>
                    </bpmn:intermediateCatchEvent>
                    """, bpmnId, nodeName, duration);
            
            default:
                return String.format("""
                    <bpmn:serviceTask id="%s" name="%s" zeebe:taskType="%s">
                      <bpmn:extensionElements>
                        <zeebe:taskDefinition type="%s" />
                      </bpmn:extensionElements>
                    </bpmn:serviceTask>
                    """, bpmnId, nodeName, "campaign-default", "campaign-default");
        }
    }
    private String mapToWorkerType(String nodeType) {
        return "campaign-" + nodeType.toLowerCase().replace("_", "-");
    }
    private String formatDuration(long delayMs) {
        if (delayMs < 60000) {
            return "PT" + delayMs / 1000 + "S";
        } else if (delayMs < 3600000) {
            return "PT" + delayMs / 60000 + "M";
        } else if (delayMs < 86400000) {
            return "PT" + delayMs / 3600000 + "H";
        } else {
            return "P" + delayMs / 86400000 + "D";
        }
    }
    private List<String> topologicalSort(JsonNode nodes, JsonNode edges) {
        Map<String, Integer> inDegree = new HashMap<>();
        Map<String, List<String>> adj = new HashMap<>();
        
        for (JsonNode node : nodes) {
            String id = node.get("id").asText();
            inDegree.put(id, 0);
            adj.put(id, new ArrayList<>());
        }
        
        for (JsonNode edge : edges) {
            String source = edge.get("source").asText();
            String target = edge.get("target").asText();
            adj.get(source).add(target);
            inDegree.merge(target, 1, Integer::sum);
        }
        
        // Kahn 算法
        Queue<String> queue = new LinkedList<>();
        for (Map.Entry<String, Integer> entry : inDegree.entrySet()) {
            if (entry.getValue() == 0) queue.add(entry.getKey());
        }
        
        List<String> result = new ArrayList<>();
        while (!queue.isEmpty()) {
            String node = queue.poll();
            result.add(node);
            for (String next : adj.get(node)) {
                inDegree.merge(next, -1, Integer::sum);
                if (inDegree.get(next) == 0) queue.add(next);
            }
        }
        return result;
    }
    private JsonNode findNode(JsonNode nodes, String id) {
        for (JsonNode node : nodes) {
            if (node.get("id").asText().equals(id)) {
                return node;
            }
        }
        return null;
    }
}
```
## 五、Zeebe Workers 实现
### 5.1 Worker 基类
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import java.util.HashMap;
import java.util.Map;
@Slf4j
public abstract class BaseCampaignWorker {
    protected abstract String getWorkerType();
    
    protected abstract Map<String, Object> doExecute(Map<String, Object> variables);
    public Map<String, Object> execute(JobClient client, ActivatedJob job) {
        String workerType = getWorkerType();
        long processInstanceKey = job.getProcessInstanceKey();
        
        log.info("Worker 开始执行: {}, processInstanceKey: {}", workerType, processInstanceKey);
        
        try {
            Map<String, Object> variables = job.getVariablesAsMap();
            Map<String, Object> result = doExecute(variables);
            
            log.info("Worker 执行成功: {}, processInstanceKey: {}", workerType, processInstanceKey);
            return result;
            
        } catch (Exception e) {
            log.error("Worker 执行失败: {}, error: {}", workerType, e.getMessage(), e);
            throw new RuntimeException("Worker execution failed: " + e.getMessage(), e);
        }
    }
    protected <T> T getVariable(Map<String, Object> variables, String key, Class<T> type) {
        Object value = variables.get(key);
        if (value == null) return null;
        if (type.isInstance(value)) return type.cast(value);
        return null;
    }
    protected String getString(Map<String, Object> variables, String key) {
        Object value = variables.get(key);
        return value != null ? String.valueOf(value) : null;
    }
    protected Integer getInt(Map<String, Object> variables, String key) {
        Object value = variables.get(key);
        if (value instanceof Integer) return (Integer) value;
        if (value instanceof Number) return ((Number) value).intValue();
        if (value instanceof String) return Integer.parseInt((String) value);
        return null;
    }
    protected BigDecimal getDecimal(Map<String, Object> variables, String key) {
        Object value = variables.get(key);
        if (value instanceof BigDecimal) return (BigDecimal) value;
        if (value instanceof Number) return BigDecimal.valueOf(((Number) value).doubleValue());
        if (value instanceof String) return new BigDecimal((String) value);
        return null;
    }
}
```
### 5.2 人群筛选 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
public class AudienceFilterWorker extends BaseCampaignWorker {
    @Autowired
    private CampaignMemberDimRepository memberRepo;
    @Override
    protected String getWorkerType() {
        return "campaign-audience-filter";
    }
    @JobWorker(type = "campaign-audience-filter", timeout = 30000)
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        String programCode = getString(variables, "programCode");
        String segmentCode = getString(variables, "segmentCode");
        Integer maxCount = getInt(variables, "maxCount");
        if (maxCount == null) maxCount = 10000;
        // 查询目标人群
        List<String> memberIds = memberRepo.findByProgramCodeAndSegment(
            programCode, segmentCode, maxCount
        );
        Map<String, Object> result = new HashMap<>();
        result.put("memberIds", memberIds);
        result.put("count", memberIds.size());
        result.put("segmentCode", segmentCode);
        result.put("filteredAt", LocalDateTime.now().toString());
        return result;
    }
}
```
### 5.3 AI 评分 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
@Slf4j
@Component
public class AIScoreWorker extends BaseCampaignWorker {
    @Autowired
    private MLScoringClient mlClient;
    @Autowired
    private CampaignMemberDimRepository memberRepo;
    @Override
    protected String getWorkerType() {
        return "campaign-ai-score";
    }
    @JobWorker(type = "campaign-ai-score", timeout = 60000)
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        List<String> memberIds = (List<String>) variables.get("memberIds");
        String modelType = getString(variables, "modelType");
        if (modelType == null) modelType = "churn";
        // 获取会员特征
        List<MemberFeature> features = memberRepo.findFeaturesByMemberIds(memberIds);
        // 调用 ML 服务评分
        List<MLScoreResult> scores = mlClient.predict(features, modelType);
        // 构建评分结果
        List<Map<String, Object>> scoredMembers = scores.stream().map(s -> {
            Map<String, Object> item = new HashMap<>();
            item.put("memberId", s.getMemberId());
            item.put("score", s.getScore());
            item.put("confidence", s.getConfidence());
            return item;
        }).collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("scoredMembers", scoredMembers);
        result.put("modelType", modelType);
        result.put("scoredAt", LocalDateTime.now().toString());
        return result;
    }
}
```
### 5.4 发送邮件 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
public class SendEmailWorker extends BaseCampaignWorker {
    @Autowired
    private ChannelService channelService;  // Loyalty 服务
    @Autowired
    private ContentService contentService;
    @Override
    protected String getWorkerType() {
        return "campaign-send-email";
    }
    @JobWorker(type = "campaign-send-email", timeout = 60000)
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        List<String> memberIds = (List<String>) variables.get("memberIds");
        String assetId = getString(variables, "assetId");
        int successCount = 0;
        int failCount = 0;
        for (String memberId : memberIds) {
            try {
                // 获取会员邮箱
                Member member = memberService.findByMemberId(memberId);
                
                // 渲染内容
                String content = contentService.render(assetId, member);
                
                // 发送邮件（调用 Loyalty 能力）
                channelService.sendEmail(member.getEmail(), content);
                successCount++;
                
            } catch (Exception e) {
                log.error("发送邮件失败: memberId={}, error={}", memberId, e.getMessage());
                failCount++;
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("successCount", successCount);
        result.put("failCount", failCount);
        result.put("totalCount", memberIds.size());
        result.put("sentAt", LocalDateTime.now().toString());
        return result;
    }
}
```
### 5.5 发放积分 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
public class OfferPointsWorker extends BaseCampaignWorker {
    @Autowired
    private PointGrantService pointGrantService;  // Loyalty 服务
    @Override
    protected String getWorkerType() {
        return "campaign-offer-points";
    }
    @JobWorker(type = "campaign-offer-points", timeout = 30000)
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        List<String> memberIds = (List<String>) variables.get("memberIds");
        String pointType = getString(variables, "pointType");
        BigDecimal pointsAmount = getDecimal(variables, "pointsAmount");
        String programCode = getString(variables, "programCode");
        String ruleId = getString(variables, "ruleId");
        int successCount = 0;
        int failCount = 0;
        for (String memberId : memberIds) {
            try {
                pointGrantService.grantPoints(
                    programCode,
                    memberId,
                    pointType,
                    pointsAmount,
                    ruleId,
                    null
                );
                successCount++;
            } catch (Exception e) {
                log.error("发放积分失败: memberId={}, error={}", memberId, e.getMessage());
                failCount++;
            }
        }
        Map<String, Object> result = new HashMap<>();
        result.put("successCount", successCount);
        result.put("failCount", failCount);
        result.put("totalCount", memberIds.size());
        result.put("pointsType", pointType);
        result.put("pointsAmount", pointsAmount);
        return result;
    }
}
```
### 5.6 审批 Worker
```java
package com.loyalty.platform.campaign.worker;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Component
public class ApprovalWorker extends BaseCampaignWorker {
    @Autowired
    private ApprovalService approvalService;
    @Override
    protected String getWorkerType() {
        return "campaign-approval";
    }
    @JobWorker(type = "campaign-approval", timeout = 86400000) // 24小时超时
    public Map<String, Object> handle(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) {
        String assetId = getString(variables, "assetId");
        String planId = getString(variables, "planId");
        String approverId = getString(variables, "approverId");
        // 获取审批状态
        ApprovalStatus status = approvalService.getStatus(assetId, planId);
        Map<String, Object> result = new HashMap<>();
        result.put("approved", "APPROVED".equals(status.getAction()));
        result.put("status", status.getAction());
        result.put("approverId", status.getApproverId());
        result.put("approvedAt", status.getApprovedAt());
        result.put("comment", status.getComment());
        return result;
    }
}
```
## 六、Zeebe 流程管理服务
### 6.1 流程部署服务
```java
package com.loyalty.platform.campaign.service;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.response.DeploymentEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
@Slf4j
@Service
public class ZeebeDeployService {
    @Autowired
    private ZeebeClient zeebeClient;
    @Autowired
    private CanvasToBpmnCompiler compiler;
    @Autowired
    private CampaignPlanRepository planRepo;
    public String deploy(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        String bpmnXml = compiler.compile(plan.getCanvasId(), plan.getGraphJson());
        DeploymentEvent deployment = zeebeClient.newDeployResourceCommand()
            .addResourceString(bpmnXml, "campaign_" + planId + ".bpmn")
            .send()
            .join();
        String processId = deployment.getProcesses().get(0).getBpmnProcessId();
        log.info("流程部署成功: planId={}, processId={}", planId, processId);
        plan.setZeebeProcessId(processId);
        plan.setZeebeVersion(deployment.getProcesses().get(0).getVersion());
        planRepo.save(plan);
        return processId;
    }
}
```
### 6.2 流程实例启动服务
```java
package com.loyalty.platform.campaign.service;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.response.ProcessInstanceEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Service
public class ZeebeExecutionService {
    @Autowired
    private ZeebeClient zeebeClient;
    @Autowired
    private CampaignPlanRepository planRepo;
    @Autowired
    private CampaignExecutionLogRepository logRepo;
    public String start(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        if (plan.getZeebeProcessId() == null) {
            throw new BusinessException("计划尚未部署，请先部署");
        }
        Map<String, Object> variables = new HashMap<>();
        variables.put("planId", planId);
        variables.put("programCode", plan.getProgramCode());
        variables.put("campaignName", plan.getName());
        variables.put("targetSegment", plan.getTargetSegment());
        variables.put("budget", plan.getTotalBudget());
        variables.put("startTime", plan.getStartTime());
        variables.put("endTime", plan.getEndTime());
        ProcessInstanceEvent instance = zeebeClient.newCreateInstanceCommand()
            .bpmnProcessId(plan.getZeebeProcessId())
            .latestVersion()
            .variables(variables)
            .send()
            .join();
        log.info("流程实例启动成功: planId={}, processInstanceKey={}", planId, instance.getProcessInstanceKey());
        plan.setZeebeInstanceKey(instance.getProcessInstanceKey());
        plan.setStatus("RUNNING");
        planRepo.save(plan);
        return String.valueOf(instance.getProcessInstanceKey());
    }
    public String getStatus(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        if (plan.getZeebeInstanceKey() == null) {
            return "NOT_STARTED";
        }
        // 查询 Zeebe 流程状态
        // 通过 Zeebe Operate API 或直接查询数据库
        return plan.getStatus();
    }
    public void pause(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        // 调用 Zeebe 暂停 API
        // 需要在 BPMN 中预埋暂停网关
        plan.setStatus("PAUSED");
        planRepo.save(plan);
    }
    public void resume(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        plan.setStatus("RUNNING");
        planRepo.save(plan);
        // 恢复 Zeebe 流程执行
    }
    public void cancel(String planId) {
        CampaignPlan plan = planRepo.findById(planId);
        // 调用 Zeebe 取消 API
        plan.setStatus("CANCELLED");
        planRepo.save(plan);
    }
}
```
## 七、数据模型补充（Zeebe 相关）
```sql
-- 扩展 campaign_plan 表，增加 Zeebe 相关字段
ALTER TABLE campaign_plan ADD COLUMN zeebe_process_id VARCHAR(100);
ALTER TABLE campaign_plan ADD COLUMN zeebe_version INT;
ALTER TABLE campaign_plan ADD COLUMN zeebe_instance_key BIGINT;
-- Zeebe 执行实例表
CREATE TABLE campaign_zeebe_instance (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64),
    process_instance_key BIGINT NOT NULL,
    bpmn_process_id VARCHAR(100),
    status VARCHAR(32),                    -- RUNNING / COMPLETED / FAILED / CANCELLED
    variables JSONB,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_czi_plan ON campaign_zeebe_instance(plan_id);
CREATE INDEX idx_czi_key ON campaign_zeebe_instance(process_instance_key);
-- Zeebe 任务执行记录表
CREATE TABLE campaign_zeebe_task (
    id VARCHAR(64) PRIMARY KEY,
    instance_id VARCHAR(64),
    job_key BIGINT,
    task_type VARCHAR(64),
    task_name VARCHAR(255),
    status VARCHAR(32),                    -- CREATED / COMPLETED / FAILED / RETRY
    input_variables JSONB,
    output_variables JSONB,
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);
CREATE INDEX idx_czt_instance ON campaign_zeebe_task(instance_id);
CREATE INDEX idx_czt_status ON campaign_zeebe_task(status);
```
## 八、与 Loyalty LiteFlow 的共存策略
| 场景                     | 执行引擎                                 | 说明                        |
| ---------------------- | ------------------------------------ | ------------------------- |
| Loyalty 核心事件处理         | **LiteFlow**                         | 幂等检查、标准化、One-ID、规则引擎，保持不变 |
| Campaign 流程执行          | **Zeebe**                            | 所有 Campaign 相关流程          |
| Campaign 调用 Loyalty 能力 | **Zeebe Workers → Loyalty Services** | Workers 内部调用 Loyalty 服务   |
### 配置隔离
yaml
```
# application.yml
# LiteFlow 继续为 Loyalty 服务
liteflow:
  rule-source: classpath:liteflow/el/*.el.xml
  component-scan: com.loyalty.platform.flow.components
# Zeebe 为 Campaign 服务
zeebe:
  client:
    broker:
      gateway-address: localhost:26500
```
两套引擎完全独立，互不干扰。
## 九、与原设计文档的差异
| 原设计                         | 修正后                                |
| --------------------------- | ---------------------------------- |
| LiteFlow 作为 Campaign 唯一执行引擎 | **Zeebe 统一执行 Campaign 流程**         |
| 未考虑审批节点                     | **Zeebe User Task 支持审批**           |
| 未考虑状态持久化                    | **Zeebe 事件溯源持久化**                  |
| Canvas → LiteFlow Compiler  | **Canvas → BPMN Compiler → Zeebe** |
| 无法查询流程状态                    | **Zeebe Operate 支持状态查询**           |
| 无 Saga 补偿                   | **Zeebe 支持 Saga 补偿**               |
## 十、总结
| 结论                        | 说明                       |
| ------------------------- | ------------------------ |
| **LiteFlow 保持不变**         | 继续服务 Loyalty 核心事件处理      |
| **Zeebe 统一执行 Campaign**   | 所有 Campaign 流程使用 Zeebe   |
| **BPMN Compiler 是关键**     | Canvas DAG → BPMN XML 编译 |
| **Workers 调用 Loyalty 能力** | 复用 Loyalty 服务，不重复建设      |
| **两套引擎独立共存**              | 互不干扰，各司其职                |
