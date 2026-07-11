# Campaign Tools 平台设计文档
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **版本**：1.0
> **设计目标**：构建一个集**营销活动规划（Planning）** 与**活动执行（Execution）** 于一体的 Campaign Tools 平台，充分利用 AI 能力完成数据分析和竞品洞察，通过可视化画布实现客户旅程编排与 Ad-hoc 活动配置，最终形成从“洞察→策略→执行→优化”的完整营销闭环-。
## 一、整体架构
### 1.1 设计原则
| 原则            | 说明                                         |
| ------------- | ------------------------------------------ |
| **数据驱动**      | 所有营销决策基于 Loyalty 平台沉淀的会员、订单、行为、积分、等级等数据    |
| **AI 原生**     | Planning 阶段必须使用 AI + Skill 完成数据分析和竞品洞察-    |
| **可视化编排**     | Execution 阶段采用画布 + 工具栏模式，拖拽式配置流程-          |
| **可扩展 Skill** | AI Skill 由运营人员动态配置，支持跨行业扩展-                |
| **实时数据同步**    | Loyalty 数据通过 CDC 技术实时同步到 Campaign 结构化数据存储- |
### 1.2 整体架构图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Campaign Tools 平台                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────┐    ┌─────────────────────────────────────────┐ │
│  │    Campaign Planning    │    │        Campaign Execution               │ │
│  │    （AI 驱动）           │    │     （画布 + 工作流引擎）                │ │
│  │                         │    │                                         │ │
│  │  · 市场数据分析          │    │  ┌─────────────────────────────────┐   │ │
│  │  · 竞品分析（Skill）     │    │  │   客户旅程编排（Journey）        │   │ │
│  │  · 会员洞察              │    │  │  · 入会/生日/首购/节假日        │   │ │
│  │  · 策略生成              │    │  │  · 流失挽回/购买周期推算        │   │ │
│  └─────────────────────────┘    │  └─────────────────────────────────┘   │ │
│               │                   │  ┌─────────────────────────────────┐   │ │
│               ▼                   │  │   Ad-hoc 活动                   │   │ │
│  ┌─────────────────────────┐    │  │  · 选人（人群细分）             │   │ │
│  │   AI Agent + Skill 层    │    │  │  · A/B Test / 控制组            │   │ │
│  │   · 竞品分析 Skill       │    │  │  · 渠道选择 / Offer 配置        │   │ │
│  │   · 数据洞察 Skill       │    │  └─────────────────────────────────┘   │ │
│  │   · 策略生成 Skill       │    │                                         │ │
│  └─────────────────────────┘    │  ┌─────────────────────────────────┐   │ │
│               │                   │  │   工作流引擎（Camunda/Zeebe）   │   │ │
│               ▼                   │  │   · 事件驱动 / 定时触发         │   │ │
│  ┌─────────────────────────────────┐  │   · 流程状态管理               │   │ │
│  │       统一数据层                │  │   · 失败重试 / 补偿            │   │ │
│  │  结构化数据存储（用于 AI 分析） │  └─────────────────────────────────┘   │ │
│  └─────────────────────────────────┘                                         │ │
│               ▲                                                             │ │
│               │ CDC 实时同步                                                 │ │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │                       Loyalty 平台数据源                                 │ │
│  │  会员数据 · 订单数据 · 行为数据 · 积分数据 · 等级变更数据 · 主数据      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.3 分层架构
参考营销系统通用分层模型，平台自下而上分为四层-：
| 层级         | 说明                    | 组件                               |
| ---------- | --------------------- | -------------------------------- |
| **数据层**    | 原始数据采集与结构化存储          | CDC 同步、数据仓库、JSON 解析              |
| **AI 能力层** | AI Agent + Skill 执行引擎 | 竞品分析 Skill、数据洞察 Skill、策略生成 Skill |
| **业务层**    | 营销规则引擎与用户分群逻辑         | 人群细分、触发规则、A/B Test               |
| **应用层**    | 具体功能模块                | Planning 工作台、Execution 画布、渠道对接   |
## 二、数据层设计
### 2.1 数据来源与同步
Loyalty 平台的数据以 JSON 格式存储，需要结构化后供 AI 分析和 Campaign 使用。
**数据同步架构**：
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 数据源                                      │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ 会员数据  │ │ 订单数据  │ │ 行为数据  │ │ 积分数据  │ │ 等级变更  │       │
│  │ (JSONB)  │ │ (JSONB)  │ │ (JSONB)  │ │ (JSONB)  │ │ (JSONB)  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (CDC - Change Data Capture)
┌─────────────────────────────────────────────────────────────────────────────┐
│                         数据同步管道                                         │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Debezium / Canal (监听 PostgreSQL WAL 日志)                        │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Kafka / Event Stream (实时事件流)                                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                    │                                       │
│                                    ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  数据转换与结构化 (ETL/ELT)                                         │  │
│  │  · JSON 解析 → 结构化字段                                            │  │
│  │  · 数据清洗与标准化                                                  │  │
│  │  · 维度建模（星型/雪花模型）                                         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Campaign 结构化数据存储                                   │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │  ClickHouse / PostgreSQL (分析型)                                  │   │
│  │  · 会员宽表 · 订单事实表 · 行为事件表 · 积分汇总表 · 等级快照表   │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 2.2 核心数据表设计
#### 2.2.1 会员宽表 `campaign_member_dim`
```sql
CREATE TABLE campaign_member_dim (
    member_id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    -- 会员属性
    name VARCHAR(100),
    gender VARCHAR(10),
    birthday DATE,
    tier_code VARCHAR(16),
    tier_name VARCHAR(50),
    tier_level INT,
    status VARCHAR(16),
    register_date DATE,
    -- 汇总指标（实时更新）
    total_order_count INT DEFAULT 0,
    total_order_amount DECIMAL(18,2) DEFAULT 0,
    avg_order_amount DECIMAL(18,2) DEFAULT 0,
    last_order_date DATE,
    last_order_days INT,                      -- 距上次下单天数
    total_points DECIMAL(18,4) DEFAULT 0,     -- 当前总积分
    tier_points DECIMAL(18,4) DEFAULT 0,      -- 等级成长值
    -- 行为指标
    total_login_days INT DEFAULT 0,
    continuous_login_days INT DEFAULT 0,
    -- 时间维度
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cmd_program ON campaign_member_dim(program_code);
CREATE INDEX idx_cmd_tier ON campaign_member_dim(tier_code);
CREATE INDEX idx_cmd_last_order ON campaign_member_dim(last_order_date);
```
#### 2.2.2 订单事实表 `campaign_order_fact`
```sql
CREATE TABLE campaign_order_fact (
    order_id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    order_date TIMESTAMPTZ NOT NULL,
    order_amount DECIMAL(18,2) NOT NULL,
    discount_amount DECIMAL(18,2) DEFAULT 0,
    net_amount DECIMAL(18,2) NOT NULL,
    channel VARCHAR(32),
    order_status VARCHAR(20),
    item_count INT DEFAULT 0,
    -- 积分相关
    points_earned DECIMAL(18,4) DEFAULT 0,
    -- 时间维度（用于分析）
    year INT,
    month INT,
    quarter INT,
    week INT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cof_member ON campaign_order_fact(member_id);
CREATE INDEX idx_cof_date ON campaign_order_fact(order_date);
CREATE INDEX idx_cof_program ON campaign_order_fact(program_code);
```
#### 2.2.3 行为事件表 `campaign_behavior_fact`
```sql
CREATE TABLE campaign_behavior_fact (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    behavior_code VARCHAR(64) NOT NULL,      -- SIGN_IN, SHARE, BROWSE, REVIEW...
    behavior_time TIMESTAMPTZ NOT NULL,
    channel VARCHAR(32),
    source VARCHAR(50),
    ext_attributes JSONB,                    -- 行为扩展属性
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cbf_member ON campaign_behavior_fact(member_id);
CREATE INDEX idx_cbf_code ON campaign_behavior_fact(behavior_code);
CREATE INDEX idx_cbf_time ON campaign_behavior_fact(behavior_time);
```
#### 2.2.4 积分汇总表 `campaign_points_summary`
```sql
CREATE TABLE campaign_points_summary (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    point_type VARCHAR(32) NOT NULL,         -- REWARD / TIER / CREDIT / PREPAY_CREDIT
    total_earned DECIMAL(18,4) DEFAULT 0,
    total_redeemed DECIMAL(18,4) DEFAULT 0,
    current_balance DECIMAL(18,4) DEFAULT 0,
    snapshot_date DATE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, member_id, point_type, snapshot_date)
);
```
### 2.3 CDC 同步实现
```java
@Component
public class LoyaltyDataSyncService {
    @EventListener
    public void onMemberChanged(MemberChangedEvent event) {
        // 1. 接收 CDC 变更事件
        Member member = event.getMember();
        
        // 2. 转换为 Campaign 宽表格式
        CampaignMemberDim dim = convertToDim(member);
        
        // 3. 更新/插入 Campaign 数据存储
        campaignMemberRepo.upsert(dim);
        
        // 4. 触发相关数据更新（订单、积分等）
        updateAggregates(member.getMemberId());
    }
    
    @EventListener
    public void onOrderCompleted(OrderCompletedEvent event) {
        // 同步订单事实表
        campaignOrderRepo.insert(convertToOrderFact(event));
        
        // 更新会员宽表汇总指标
        recalcMemberSummary(event.getMemberId());
    }
}
```
## 三、Campaign Planning（AI 驱动）
### 3.1 功能概述
Planning 阶段的核心目标是通过 AI 辅助完成市场分析、竞品洞察和策略生成，输出可执行的营销计划-。
### 3.2 AI Agent + Skill 架构
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         AI Planning 工作台                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  用户输入：营销目标 / 活动主题 / 目标人群 / 预算                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        AI Agent Orchestrator                          │   │
│  │  1. 理解用户意图，拆解任务                                            │   │
│  │  2. 选择合适的 Skill 执行                                            │   │
│  │  3. 整合结果，生成输出                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│                    ┌───────────────┼───────────────┐                      │
│                    ▼               ▼               ▼                      │
│  ┌─────────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐ │
│  │  竞品分析 Skill      │ │  数据洞察 Skill  │ │  策略生成 Skill          │ │
│  │  · 竞品动态监控      │ │  · 会员画像分析  │ │  · 活动策略建议          │ │
│  │  · 竞品活动扫描      │ │  · RFM 分析     │ │  · 渠道组合推荐          │ │
│  │  · 市场趋势分析      │ │  · 行为洞察     │ │  · 预算分配建议          │ │
│  └─────────────────────┘ └─────────────────┘ └─────────────────────────┘ │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  输出：营销计划报告 / 活动建议 / 人群推荐 / 渠道策略                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 3.3 Skill 定义与管理
Skill 是 AI Agent 可调用的能力单元，由运营人员动态配置，支持跨行业扩展-。
#### 3.3.1 Skill 定义表
```sql
CREATE TABLE campaign_skill_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    skill_code VARCHAR(64) NOT NULL,
    skill_name VARCHAR(200) NOT NULL,
    skill_type VARCHAR(30) NOT NULL,          -- COMPETITOR_ANALYSIS / DATA_INSIGHT / STRATEGY_GEN / CUSTOM
    description TEXT,
    -- Skill 配置
    config_schema JSONB NOT NULL,             -- 输入参数 Schema
    prompt_template TEXT,                      -- AI Prompt 模板
    data_source_config JSONB,                  -- 数据源配置
    -- 执行配置
    execution_timeout INT DEFAULT 60,          -- 超时时间（秒）
    retry_count INT DEFAULT 3,
    -- 状态
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, skill_code)
);
```
**Skill 配置示例（竞品分析 Skill）**：
```json
{
  "skill_code": "COMPETITOR_ANALYSIS",
  "skill_name": "竞品重大事件监控",
  "skill_type": "COMPETITOR_ANALYSIS",
  "config_schema": {
    "type": "object",
    "properties": {
      "competitors": { "type": "array", "description": "竞品品牌列表" },
      "monitor_channels": { "type": "array", "description": "监控渠道" },
      "time_range": { "type": "string", "description": "时间范围" }
    }
  },
  "prompt_template": "你是一位资深营销分析师。请分析以下竞品在 {time_range} 内的市场动态：n竞品列表：{competitors}n监控渠道：{monitor_channels}nn请输出：n1. 竞品重大活动盘点n2. 竞品营销策略分析n3. 差异化机会建议",
  "data_source_config": {
    "sources": ["competitor_api", "public_news", "social_media"],
    "update_frequency": "DAILY"
  }
}
```
#### 3.3.2 Skill 执行引擎（伪代码）
```java
@Service
public class SkillExecutionEngine {
    @Autowired private SkillDefinitionRepository skillRepo;
    @Autowired private AiClient aiClient;
    @Autowired private DataQueryService dataQueryService;
    
    public SkillExecutionResult executeSkill(String skillCode, Map<String, Object> params) {
        // 1. 加载 Skill 定义
        SkillDefinition skill = skillRepo.findBySkillCode(skillCode);
        
        // 2. 验证参数
        validateParams(skill.getConfigSchema(), params);
        
        // 3. 准备数据上下文
        Map<String, Object> context = new HashMap<>();
        context.putAll(params);
        context.put("campaignData", dataQueryService.queryCampaignData(params));
        
        // 4. 构建 Prompt
        String prompt = buildPrompt(skill.getPromptTemplate(), context);
        
        // 5. 调用 AI 执行
        String result = aiClient.chat(prompt);
        
        // 6. 解析并结构化输出
        return parseResult(result);
    }
}
```
### 3.4 Planning 界面设计
#### 3.4.1 Planning 工作台整体布局
```text
┌─ Campaign Planning ─────────────────────────────────────────────────────────┐
│  [新建计划]  [历史计划]  [Skill 管理]                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─ 目标输入 ─────────────────────────────────────────────────────────────┐ │
│  │  活动目标： [  提升618期间会员复购率  ]                                 │ │
│  │  目标人群： [  近90天未消费会员  ]                                     │ │
│  │  预算范围： [  10万  ]                                                 │ │
│  │  时间范围： [  2026-06-01 至 2026-06-30  ]                            │ │
│  │                                          [ 开始分析 ]                   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ AI 分析进度 ──────────────────────────────────────────────────────────┐ │
│  │  ✅ 数据加载完成 (会员: 45,231人)                                      │ │
│  │  🔄 竞品分析进行中...                                                   │ │
│  │  ⏳ 策略生成等待中                                                     │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  ┌─ 分析结果 ─────────────────────────────────────────────────────────────┐ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │  📊 会员洞察                                                    │   │ │
│  │  │  目标人群：45,231人                                              │   │ │
│  │  │  · 黄金及以上会员占比：32%                                       │   │ │
│  │  │  · 最近30天活跃度：18%                                           │   │ │
│  │  │  · 平均历史消费：2,450元                                         │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │  🔍 竞品分析（Competitor Analysis Skill）                       │   │ │
│  │  │  · 竞品A：618预热活动已启动，主推满300减50                       │   │ │
│  │  │  · 竞品B：会员日积分翻倍，6月每周三                              │   │ │
│  │  │  · 建议：差异化主推“会员专属折扣”，避开价格战                    │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  │  ┌─────────────────────────────────────────────────────────────────┐   │ │
│  │  │  💡 策略建议                                                    │   │ │
│  │  │  推荐活动类型：积分翻倍 + 会员日专属优惠                         │   │ │
│  │  │  推荐渠道：小程序推送 + 短信                                     │   │ │
│  │  │  预计触达：42,000人，响应率预估：8-12%                           │   │ │
│  │  └─────────────────────────────────────────────────────────────────┘   │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  [ 导出计划 ]  [ 创建活动 → ]                                               │
└──────────────────────────────────────────────────────────────────────────────┘
```
#### 3.4.2 Skill 管理界面
```text
┌─ Skill 管理 ─────────────────────────────────────────────────────────────────┐
│  [+ 新建 Skill]  [导入]  [导出]                                              │
├──────────────────────────────────────────────────────────────────────────────┤
│ ┌────────────┬──────────────┬────────────┬──────────┬──────────────────────┐│
│ │ Skill 代码 │ Skill 名称   │ 类型       │ 状态     │ 操作                 ││
│ ├────────────┼──────────────┼────────────┼──────────┼──────────────────────┤│
│ │ COMP_ANAL  │ 竞品分析     │ COMPETITOR │ 启用     │ [编辑] [执行] [测试] ││
│ │ DATA_INS   │ 数据洞察     │ DATA       │ 启用     │ [编辑] [执行] [测试] ││
│ │ STRAT_GEN  │ 策略生成     │ STRATEGY   │ 启用     │ [编辑] [执行] [测试] ││
│ │ CUST_SKILL │ 行业定制     │ CUSTOM     │ 草稿     │ [编辑] [执行] [测试] ││
│ └────────────┴──────────────┴────────────┴──────────┴──────────────────────┘│
└──────────────────────────────────────────────────────────────────────────────┘
```
## 四、Campaign Execution（画布 + 工作流引擎）
### 4.1 整体架构
Execution 部分采用**画布 + 工作流引擎**模式，支持客户旅程编排和 Ad-hoc 活动配置-。
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Campaign Execution 画布                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        工具栏                                       │   │
│  │  [事件接收] [人群细分] [流程控制] [沟通渠道] [Offer] [定时器]       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                        画布区域                                      │   │
│  │  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐        │   │
│  │  │ 事件接收 │───▶│ 人群细分 │───▶│ 流程控制 │───▶│ 发送消息 │        │   │
│  │  │ (入会)   │    │ (新会员) │    │ (条件)  │    │ (邮件)  │        │   │
│  │  └─────────┘    └─────────┘    └────┬────┘    └─────────┘        │   │
│  │                                     │                              │   │
│  │                                     ▼                              │   │
│  │                              ┌─────────┐                          │   │
│  │                              │ 结束节点 │                          │   │
│  │                              └─────────┘                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    工作流引擎（Camunda / Zeebe）                     │   │
│  │  · BPMN 流程定义执行                                                │   │
│  │  · 事件驱动 / 定时触发                                              │   │
│  │  · 状态管理 / 失败重试                                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.2 画布工具栏组件
| 组件类型      | 组件名称  | 说明              | 配置项                  |
| --------- | ----- | --------------- | -------------------- |
| **事件接收**  | 事件触发器 | 监听 Loyalty 平台事件 | 事件类型（入会、订单、行为等）      |
| **事件接收**  | 定时触发器 | 按时间维度触发         | 时间表达式（每日/每周/每月）、时间基准 |
| **人群细分**  | 人群筛选  | 基于条件筛选目标人群      | 实体 + 属性 + 运算符 + 值    |
| **人群细分**  | 人群分组  | A/B Test 分组     | 分组比例、控制组             |
| **流程控制**  | 条件分支  | 基于条件分流          | IF-ELSE 条件           |
| **流程控制**  | 并行分支  | 同时执行多条路径        | 并行数量                 |
| **流程控制**  | 等待节点  | 等待指定时间          | 等待时长、等待条件            |
| **沟通渠道**  | 邮件    | 发送邮件            | 模板、发件人、主题            |
| **沟通渠道**  | 短信    | 发送短信            | 模板、签名                |
| **沟通渠道**  | 推送    | App/小程序推送       | 模板、跳转链接              |
| **Offer** | 积分奖励  | 发放积分            | 积分类型、数量              |
| **Offer** | 优惠券   | 发放优惠券           | 券模板、有效期              |
| **Offer** | 实物奖品  | 发放实物奖品          | 奖品信息                 |
| **结束**    | 结束节点  | 流程终止            | -                    |
### 4.3 工作流引擎选择
采用 **Camunda 8（Zeebe）** 作为工作流引擎-：
| 特性          | 说明                 |
| ----------- | ------------------ |
| **BPMN 标准** | 支持标准 BPMN 2.0 流程定义 |
| **事件驱动**    | 基于事件的执行模型          |
| **状态管理**    | 长流程状态持久化           |
| **失败重试**    | 自动重试失败的步骤-         |
| **可扩展性**    | 支持高并发执行-           |
### 4.4 流程定义存储
```sql
-- 流程定义表
CREATE TABLE campaign_flow_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    flow_code VARCHAR(64) NOT NULL,
    flow_name VARCHAR(200) NOT NULL,
    flow_type VARCHAR(20) NOT NULL,           -- JOURNEY / ADHOC
    -- BPMN 流程定义
    bpmn_xml TEXT NOT NULL,
    flow_graph JSONB NOT NULL,                -- 画布节点/连线 JSON
    -- 元数据
    description TEXT,
    status VARCHAR(20) DEFAULT 'DRAFT',       -- DRAFT / ACTIVE / INACTIVE
    version INT DEFAULT 1,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, flow_code)
);
-- 流程执行实例表
CREATE TABLE campaign_flow_instance (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    flow_code VARCHAR(64) NOT NULL,
    instance_id VARCHAR(64) NOT NULL,          -- Zeebe 流程实例 ID
    member_id VARCHAR(64),
    status VARCHAR(20) DEFAULT 'RUNNING',      -- RUNNING / COMPLETED / FAILED / CANCELLED
    current_node VARCHAR(64),
    variables JSONB,                           -- 流程变量
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cfi_flow ON campaign_flow_instance(program_code, flow_code);
CREATE INDEX idx_cfi_member ON campaign_flow_instance(member_id);
CREATE INDEX idx_cfi_status ON campaign_flow_instance(status);
```
### 4.5 画布节点 JSON 结构
```json
{
  "nodes": [
    {
      "id": "node_1",
      "type": "event_trigger",
      "position": { "x": 100, "y": 100 },
      "data": {
        "label": "会员入会",
        "config": {
          "event_type": "MEMBER_ENROLLED",
          "channel": "ALL"
        }
      }
    },
    {
      "id": "node_2",
      "type": "audience_filter",
      "position": { "x": 350, "y": 100 },
      "data": {
        "label": "筛选新会员",
        "config": {
          "conditions": [
            { "field": "register_days", "operator": "<=", "value": 30 }
          ]
        }
      }
    },
    {
      "id": "node_3",
      "type": "condition",
      "position": { "x": 600, "y": 100 },
      "data": {
        "label": "是否首次消费",
        "config": {
          "condition": { "field": "order_count", "operator": "==", "value": 0 }
        }
      }
    },
    {
      "id": "node_4",
      "type": "send_message",
      "position": { "x": 850, "y": 50 },
      "data": {
        "label": "发送欢迎邮件",
        "config": {
          "channel": "EMAIL",
          "template_code": "WELCOME_EMAIL",
          "delay_minutes": 10
        }
      }
    },
    {
      "id": "node_5",
      "type": "send_message",
      "position": { "x": 850, "y": 150 },
      "data": {
        "label": "发送首购优惠",
        "config": {
          "channel": "SMS",
          "template_code": "FIRST_PURCHASE_OFFER"
        }
      }
    }
  ],
  "edges": [
    { "id": "e1", "source": "node_1", "target": "node_2" },
    { "id": "e2", "source": "node_2", "target": "node_3" },
    { "id": "e3", "source": "node_3", "target": "node_4", "data": { "condition": "true" } },
    { "id": "e4", "source": "node_3", "target": "node_5", "data": { "condition": "false" } }
  ]
}
```
### 4.6 客户旅程 vs Ad-hoc 活动
| 维度       | 客户旅程（Journey）  | Ad-hoc 活动      |
| -------- | -------------- | -------------- |
| **触发方式** | 事件触发 + 定时触发    | 手动触发（选人 → 发送）  |
| **流程长度** | 多步、长期（数天-数月）   | 单步、短期（即时-数天）   |
| **目标**   | 全生命周期管理        | 特定营销目标         |
| **典型场景** | 入会旅程、生日旅程、流失挽回 | 618大促、新品推广、会员日 |
| **技术实现** | 事件驱动 + 定时检查    | 人群圈选 + 批量发送    |
## 五、AI 辅助 Execution
### 5.1 AI 辅助场景
| 场景           | AI 能力          | 输入               | 输出           |
| ------------ | -------------- | ---------------- | ------------ |
| **人群细分**     | 基于自然语言生成人群条件   | “找出近90天未消费的黄金会员” | 结构化人群筛选条件    |
| **流程配置**     | 基于描述生成流程草图     | “配置一个入会欢迎旅程”     | 画布节点/连线 JSON |
| **Offer 推荐** | 基于会员画像推荐 Offer | 会员群体特征           | 推荐 Offer 列表  |
| **渠道推荐**     | 基于历史数据推荐渠道     | 活动目标、预算          | 渠道组合建议       |
### 5.2 AI 辅助人群细分
```java
@Service
public class AudienceAssistant {
    public AudienceCondition parseNaturalLanguage(String userInput) {
        // 1. 调用 AI 解析自然语言
        String prompt = "将以下自然语言描述转换为结构化人群筛选条件：n" + userInput;
        String response = aiClient.chat(prompt);
        
        // 2. 解析 AI 返回的 JSON
        return parseAudienceCondition(response);
    }
}
```
**界面示例**：
```text
┌─ AI 人群助手 ──────────────────────────────────────────────────────────────┐
│ 描述您想要的人群：                                                          │
│ [  近90天未消费的黄金会员，且累计消费超过5000元  ]                          │
│                                 [ 生成 ]                                    │
│                                                                              │
│ AI 理解结果：                                                               │
│  ✅ 会员等级 ∈ [GOLD, PLATINUM]                                             │
│  ✅ 最近订单日期 ≤ 90天前                                                    │
│  ✅ 累计消费金额 ≥ 5000                                                     │
│                                                                              │
│ 预估人群：12,847人                                                          │
│                                 [ 确认并创建 ]                               │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 六、数据结构化存储（用于 AI 分析）
### 6.1 数据仓库设计
AI 分析需要结构化、可查询的数据。采用 **ClickHouse** 作为分析型数据库：
```sql
-- 会员日快照表（每日汇总）
CREATE TABLE member_daily_snapshot (
    snapshot_date Date,
    program_code String,
    member_id String,
    tier_code String,
    total_order_count UInt32,
    total_order_amount Decimal(18,2),
    last_order_date Date,
    last_order_days UInt16,
    total_points Decimal(18,4),
    tier_points Decimal(18,4),
    continuous_login_days UInt16
) ENGINE = ReplacingMergeTree()
PARTITION BY snapshot_date
ORDER BY (program_code, member_id, snapshot_date);
-- 订单汇总表（按日/月聚合）
CREATE TABLE order_daily_summary (
    stat_date Date,
    program_code String,
    channel String,
    order_count UInt32,
    total_amount Decimal(18,2),
    avg_amount Decimal(18,2),
    unique_members UInt32
) ENGINE = SummingMergeTree()
PARTITION BY stat_date
ORDER BY (program_code, channel, stat_date);
```
### 6.2 数据同步策略
| 同步方式         | 说明                | 延迟    | 适用场景       |
| ------------ | ----------------- | ----- | ---------- |
| **CDC 实时同步** | 监听 WAL 日志，实时同步变更- | < 1秒  | 实时营销、触发式旅程 |
| **近实时同步**    | 每分钟批量拉取增量数据       | 1-5分钟 | 人群圈选、活动分析  |
| **每日全量同步**   | 每日凌晨全量同步          | 24小时  | 数据仓库、BI 报告 |
## 七、完整数据流
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Loyalty 平台                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐      │
│  │ member 表    │ │ order 表     │ │ behavior 表  │ │ point 表     │      │
│  │ (JSONB)      │ │ (JSONB)      │ │ (JSONB)      │ │ (JSONB)      │      │
│  └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘      │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (CDC)
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Campaign 结构化数据存储                                │
│  ┌────────────────────────────────────────────────────────────────────┐   │
│  │  campaign_member_dim (会员宽表)                                    │   │
│  │  campaign_order_fact (订单事实表)                                  │   │
│  │  campaign_behavior_fact (行为事件表)                               │   │
│  │  campaign_points_summary (积分汇总表)                              │   │
│  └────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌───────────────────────┐ ┌───────────────────┐ ┌───────────────────────────┐
│   Campaign Planning   │ │ Campaign Execution │ │   AI 分析引擎             │
│   · 数据分析          │ │ · 人群圈选        │ │   · 会员洞察              │
│   · 竞品分析          │ │ · 旅程编排        │ │   · 预测分析              │
│   · 策略生成          │ │ · 活动执行        │ │   · 效果评估              │
└───────────────────────┘ └───────────────────┘ └───────────────────────────┘
```
## 八、开发实施步骤
| 阶段            | 序号 | 任务                      | 说明                               | 优先级 |
| ------------- | -- | ----------------------- | -------------------------------- | --- |
| **数据层**       | 1  | 设计结构化数据表                | 会员宽表、订单事实表、行为事件表、积分汇总表           | P0  |
|               | 2  | 实现 CDC 数据同步             | Debezium + Kafka 管道，JSON → 结构化转换 | P0  |
|               | 3  | 实现数据同步服务                | Java 服务，监听变更事件并更新 Campaign 表     | P0  |
| **Planning**  | 4  | 设计 Skill 管理模块           | Skill 定义、存储、CRUD API             | P0  |
|               | 5  | 实现 Skill 执行引擎           | AI 调用、Prompt 模板渲染、结果解析           | P0  |
|               | 6  | 实现竞品分析 Skill            | 竞品数据采集、AI 分析、报告生成                | P0  |
|               | 7  | 实现数据洞察 Skill            | 会员画像、RFM 分析、行为洞察                 | P1  |
|               | 8  | 实现 Planning 工作台界面       | 目标输入、进度展示、结果展示                   | P1  |
| **Execution** | 9  | 集成 Camunda/Zeebe 工作流引擎  | BPMN 执行、状态管理、重试机制                | P0  |
|               | 10 | 设计画布工具栏组件               | 事件接收、人群细分、流程控制、渠道、Offer          | P0  |
|               | 11 | 实现画布拖拽编辑功能              | React Flow 画布、节点/连线管理            | P0  |
|               | 12 | 实现流程定义存储                | BPMN XML + 画布 JSON 存储            | P0  |
|               | 13 | 实现流程执行引擎                | 触发执行、状态跟踪、日志记录                   | P0  |
|               | 14 | 实现客户旅程模板                | 入会旅程、生日旅程、流失挽回等预置模板              | P1  |
| **AI 辅助**     | 15 | 实现 AI 辅助人群细分            | 自然语言 → 人群条件                      | P1  |
|               | 16 | 实现 AI 辅助流程配置            | 自然语言 → 画布节点                      | P2  |
| **集成**        | 17 | Planning → Execution 对接 | 计划输出直接生成活动草稿                     | P1  |
|               | 18 | 数据反馈闭环                  | 活动效果数据回流到 Planning               | P2  |
## 九、总结
本设计文档完整定义了 Campaign Tools 平台的两个核心部分：
| 部分                     | 核心能力                       | 技术方案                   |
| ---------------------- | -------------------------- | ---------------------- |
| **Campaign Planning**  | AI 驱动的市场分析、竞品洞察、策略生成       | AI Agent + 动态配置 Skill- |
| **Campaign Execution** | 客户旅程编排 + Ad-hoc 活动配置       | 画布 + Camunda 工作流引擎-    |
| **数据层**                | Loyalty 数据 → 结构化存储 → AI 分析 | CDC 实时同步-              |
关键设计亮点：
1. **Planning 必须用 AI**：所有 Planning 阶段的分析工作由 AI Agent + Skill 完成，Skill 由运营人员动态配置，支持跨行业扩展-
2. **Execution 画布化**：采用拖拽式画布配置流程，工具栏包含事件接收、人群细分、流程控制、沟通渠道、Offer 等组件-
3. **工作流引擎驱动**：采用 Camunda/Zeebe 执行 BPMN 流程，支持事件驱动和定时触发-
4. **数据实时同步**：通过 CDC 技术将 Loyalty 数据实时同步到 Campaign 结构化存储-
5. **AI 辅助 Execution**：支持自然语言生成人群条件、AI 辅助流程配置（后续迭代）
## 一、补充：Campaign 数据层完整设计
### 1.1 当前已覆盖的数据
| 数据域   | 已覆盖表                      | 状态    |
| ----- | ------------------------- | ----- |
| 会员主数据 | `campaign_member_dim`     | ✅ 已设计 |
| 订单汇总  | `campaign_order_fact`     | ✅ 已设计 |
| 行为事件  | `campaign_behavior_fact`  | ✅ 已设计 |
| 积分汇总  | `campaign_points_summary` | ✅ 已设计 |
### 1.2 需要补充的数据表
#### 1.2.1 订单明细表 `campaign_order_item_fact`
```sql
CREATE TABLE campaign_order_item_fact (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    order_id VARCHAR(64) NOT NULL,              -- 关联订单事实表
    member_id VARCHAR(64) NOT NULL,
    -- 商品信息
    sku_code VARCHAR(64) NOT NULL,
    sku_name VARCHAR(200),
    category_id VARCHAR(64),                    -- 商品分类ID
    category_name VARCHAR(100),                 -- 分类名称
    brand_id VARCHAR(64),
    brand_name VARCHAR(100),
    -- 金额信息
    unit_price DECIMAL(18,4) NOT NULL,
    quantity INT NOT NULL,
    total_amount DECIMAL(18,4) NOT NULL,
    discount_amount DECIMAL(18,4) DEFAULT 0,
    net_amount DECIMAL(18,4) NOT NULL,          -- 实付金额（优惠后）
    -- 积分信息
    points_earned DECIMAL(18,4) DEFAULT 0,      -- 该商品行获得的积分
    points_type VARCHAR(32),                    -- REWARD / TIER / PREPAY_CREDIT
    -- 时间维度
    order_date TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_coif_order ON campaign_order_item_fact(order_id);
CREATE INDEX idx_coif_member ON campaign_order_item_fact(member_id);
CREATE INDEX idx_coif_sku ON campaign_order_item_fact(sku_code);
CREATE INDEX idx_coif_category ON campaign_order_item_fact(category_id);
CREATE INDEX idx_coif_date ON campaign_order_item_fact(order_date);
```
**数据来源**：`event_inbox.payload.items`（JSONB 数组），在 CDC 同步时解析并展开为明细行。
#### 1.2.2 商品分类维度表 `campaign_category_dim`
```sql
CREATE TABLE campaign_category_dim (
    category_id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    category_name VARCHAR(100) NOT NULL,
    parent_category_id VARCHAR(64),              -- 上级分类（支持多级）
    category_level INT DEFAULT 1,                -- 分类层级
    category_path VARCHAR(500),                  -- 分类路径（如：电子/手机/5G手机）
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ccd_program ON campaign_category_dim(program_code);
CREATE INDEX idx_ccd_parent ON campaign_category_dim(parent_category_id);
```
#### 1.2.3 SKU 维度表 `campaign_sku_dim`
```sql
CREATE TABLE campaign_sku_dim (
    sku_code VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    sku_name VARCHAR(200) NOT NULL,
    category_id VARCHAR(64),                     -- 关联商品分类
    brand_id VARCHAR(64),
    brand_name VARCHAR(100),
    unit_price DECIMAL(18,4),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_csd_program ON campaign_sku_dim(program_code);
CREATE INDEX idx_csd_category ON campaign_sku_dim(category_id);
```
#### 1.2.4 积分明细表 `campaign_points_detail`
用于 AI 分析积分行为模式（如积分获取渠道、积分消耗节奏等）。
```sql
CREATE TABLE campaign_points_detail (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    transaction_id VARCHAR(64),                  -- 关联 account_transaction
    point_type VARCHAR(32) NOT NULL,             -- REWARD / TIER / CREDIT / PREPAY_CREDIT
    transaction_type VARCHAR(32) NOT NULL,       -- ACCRUAL / REDEMPTION / EXPIRATION / REPAYMENT
    amount DECIMAL(18,4) NOT NULL,
    balance_after DECIMAL(18,4),                 -- 交易后余额
    source_event_type VARCHAR(32),               -- ORDER / BEHAVIOR / REDEMPTION / CUSTOM
    source_event_id VARCHAR(64),                 -- 来源事件ID（如订单号）
    created_at TIMESTAMPTZ NOT NULL,
    snapshot_date DATE GENERATED ALWAYS AS (created_at::DATE) STORED
);
CREATE INDEX idx_cpd_member ON campaign_points_detail(member_id);
CREATE INDEX idx_cpd_type ON campaign_points_detail(point_type);
CREATE INDEX idx_cpd_date ON campaign_points_detail(snapshot_date);
CREATE INDEX idx_cpd_source ON campaign_points_detail(source_event_id);
```
#### 1.2.5 等级变更明细表 `campaign_tier_change_detail`
```sql
CREATE TABLE campaign_tier_change_detail (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    old_tier VARCHAR(32),
    new_tier VARCHAR(32) NOT NULL,
    change_reason VARCHAR(50) NOT NULL,          -- UPGRADE / DOWNGRADE / RETENTION / ACTIVITY / MANUAL
    tier_points_before DECIMAL(18,4),            -- 变更前等级积分
    tier_points_after DECIMAL(18,4),             -- 变更后等级积分
    trigger_event_id VARCHAR(64),                -- 触发事件ID
    changed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    snapshot_date DATE GENERATED ALWAYS AS (changed_at::DATE) STORED
);
CREATE INDEX idx_ctcd_member ON campaign_tier_change_detail(member_id);
CREATE INDEX idx_ctcd_reason ON campaign_tier_change_detail(change_reason);
CREATE INDEX idx_ctcd_date ON campaign_tier_change_detail(snapshot_date);
```
**数据来源**：`tier_change_log` 表，通过 CDC 同步。
#### 1.2.6 积分类型定义表 `campaign_point_type_dim`
```sql
CREATE TABLE campaign_point_type_dim (
    point_type VARCHAR(32) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    is_redeemable BOOLEAN DEFAULT false,
    is_tier_calc BOOLEAN DEFAULT false,
    allow_repay BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 1.3 数据同步补充逻辑
```java
@Component
public class OrderItemSyncService {
    @EventListener
    public void onOrderCompleted(OrderCompletedEvent event) {
        // 1. 同步订单主表（已有）
        campaignOrderRepo.insert(convertToOrderFact(event));
        
        // 2. 解析并同步订单明细
        JSONArray items = event.getPayload().getJSONArray("items");
        List<CampaignOrderItemFact> itemFacts = new ArrayList<>();
        for (int i = 0; i < items.size(); i++) {
            JSONObject item = items.getJSONObject(i);
            CampaignOrderItemFact fact = new CampaignOrderItemFact();
            fact.setOrderId(event.getOrderId());
            fact.setMemberId(event.getMemberId());
            fact.setSkuCode(item.getString("sku"));
            fact.setSkuName(item.optString("title"));
            fact.setCategoryId(extractCategoryId(item));
            fact.setUnitPrice(item.getBigDecimal("price"));
            fact.setQuantity(item.getInt("quantity"));
            fact.setTotalAmount(item.getBigDecimal("total_fee"));
            fact.setNetAmount(item.getBigDecimal("payment"));
            // 积分信息（从积分流水反查或直接从事件获取）
            fact.setPointsEarned(extractPointsEarned(event, item));
            itemFacts.add(fact);
        }
        campaignOrderItemRepo.batchInsert(itemFacts);
        
        // 3. 更新商品分类维度表（如果分类信息变化）
        updateCategoryDim(itemFacts);
    }
}
```
### 1.4 数据模型关系图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Campaign 数据模型                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────┐     ┌─────────────────────┐                       │
│  │ campaign_member_dim │────│ campaign_order_fact │                       │
│  │  (会员宽表)          │1   N│  (订单事实表)        │                       │
│  └─────────────────────┘     └──────────┬──────────┘                       │
│              │                           │ 1:N                              │
│              │                           ▼                                  │
│              │                  ┌─────────────────────┐                     │
│              │                  │ campaign_order_item │                     │
│              │                  │ _fact (订单明细表)   │                     │
│              │                  └──────────┬──────────┘                     │
│              │                             │ N:1                            │
│              │                             ▼                                │
│              │                  ┌─────────────────────┐                     │
│              │                  │ campaign_sku_dim   │                     │
│              │                  │  (SKU维度表)        │                     │
│              │                  └──────────┬──────────┘                     │
│              │                             │                                │
│              │                             ▼                                │
│              │                  ┌─────────────────────┐                     │
│              │                  │ campaign_category   │                     │
│              │                  │ _dim (分类维度表)    │                     │
│              │                  └─────────────────────┘                     │
│              │                                                             │
│  ┌───────────┴──────────────────────────────────────────────────────────┐  │
│  │                        积分与等级数据                                 │  │
│  │  ┌─────────────────────┐  ┌─────────────────────────────────────┐  │  │
│  │  │ campaign_points     │  │ campaign_tier_change_detail         │  │  │
│  │  │ _detail (积分明细)   │  │ (等级变更明细)                       │  │  │
│  │  └─────────────────────┘  └─────────────────────────────────────┘  │  │
│  │  ┌─────────────────────┐  ┌─────────────────────────────────────┐  │  │
│  │  │ campaign_points     │  │ campaign_point_type_dim             │  │  │
│  │  │ _summary (积分汇总)  │  │ (积分类型定义)                       │  │  │
│  │  └─────────────────────┘  └─────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.5 AI 分析的数据视图
为方便 AI 分析，可创建以下物化视图或查询模板：
```sql
-- 会员360视图（供AI分析使用）
CREATE VIEW campaign_member_360 AS
SELECT 
    m.member_id,
    m.tier_code,
    m.total_order_count,
    m.total_order_amount,
    m.last_order_days,
    m.total_points,
    -- 商品偏好（TOP3品类）
    (SELECT array_agg(category_name) 
     FROM (
         SELECT category_name, COUNT(*) as cnt
         FROM campaign_order_item_fact i
         WHERE i.member_id = m.member_id
         GROUP BY category_name
         ORDER BY cnt DESC
         LIMIT 3
     ) t) as top_categories,
    -- 最近一次等级变更
    (SELECT change_reason || '→' || new_tier 
     FROM campaign_tier_change_detail 
     WHERE member_id = m.member_id 
     ORDER BY changed_at DESC LIMIT 1) as last_tier_change,
    -- 积分获取/消耗趋势（近30天）
    (SELECT SUM(CASE WHEN transaction_type = 'ACCRUAL' THEN amount ELSE 0 END) 
     FROM campaign_points_detail 
     WHERE member_id = m.member_id 
       AND created_at > NOW() - INTERVAL '30 days') as points_earned_30d,
    (SELECT SUM(CASE WHEN transaction_type = 'REDEMPTION' THEN amount ELSE 0 END) 
     FROM campaign_points_detail 
     WHERE member_id = m.member_id 
       AND created_at > NOW() - INTERVAL '30 days') as points_redeemed_30d
FROM campaign_member_dim m;
```
## 二、工作流引擎说明：Camunda/Zeebe vs Activiti
### 2.1 三者关系
```text
                    Activiti 5 (Alfresco发起，2010)
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Activiti 6   Camunda 7   Flowable
         (官方继续)   (核心团队分支)  (核心团队分支)
              │            │
              ▼            ▼
         Activiti 7   Camunda 8
         (云原生重构)   (Zeebe引擎)
```
* **Camunda** 是从 Activiti 5 核心团队**分支**出来的项目[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829)，由原核心团队持续维护，定位“企业级”和“开发者友好”[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829)
* **Zeebe** 是 Camunda 8 的**全新云原生工作流引擎**，采用事件溯源架构，与 Camunda 7 的架构完全不同[-4](https://blog.csdn.net/jupyter5notebook/article/details/154437539)[-1](https://grapecity.csdn.net/6923cba882fbe0098cae41fb.html)
### 2.2 核心对比
| 对比维度       | Activiti 7                                                                          | Camunda 7                                                                              | Camunda 8 (Zeebe)                                                                                  |
| ---------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **核心定位**   | 传统单体应用嵌入式引擎                                                                         | 单体/微服务嵌入式引擎                                                                            | **云原生、高吞吐量事件驱动架构**[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829)           |
| **架构基础**   | 单体架构，JPA + 关系型DB[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587) | 基于 Java，关系型数据库[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829)   | **分布式事件流引擎**，自研流式存储[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829)          |
| **持久化**    | JPA + 原生SQL[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587)      | 关系型数据库（MySQL/PG）[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829) | **事件溯源 + 自研流式存储**，无关系型DB依赖[-4](https://blog.csdn.net/jupyter5notebook/article/details/154437539)   |
| **部署模式**   | 传统应用嵌入                                                                              | 可独立部署/嵌入/容器化[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829)     | **推荐 Kubernetes**，也可本地部署[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829)     |
| **云原生支持**  | 有限（仅Cloud版本）[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587)     | 良好                                                                                     | **优秀**，原生集成 Service Mesh、自动弹性伸缩[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587) |
| **高并发吞吐量** | ~3,000 实例/秒[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587)     | ~5,000 实例/秒[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587)        | **~15,000 实例/秒**[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587)               |
| **高可用**    | 无原生集群支持[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587)          | 需手动配置集群                                                                                | **内置 Raft 协议自动选主**[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587)              |
| **容错机制**   | 基础事务控制[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587)           | 事务回滚                                                                                   | **事件溯源 + 自动补偿**[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587)                 |
| **社区活跃度**  | 中等（官方维护减弱）[-1](https://grapecity.csdn.net/6923cba882fbe0098cae41fb.html)            | 高（2025年10月已EOL）[-1](https://grapecity.csdn.net/6923cba882fbe0098cae41fb.html)          | 新兴，快速增长[-2](https://blog.csdn.net/lanwp5302/article/details/148294167)                             |
| **学习曲线**   | 中等[-2](https://blog.csdn.net/lanwp5302/article/details/148294167)                   | 中等[-2](https://blog.csdn.net/lanwp5302/article/details/148294167)                      | **低**（使用 gRPC，不限编程语言）[-2](https://blog.csdn.net/lanwp5302/article/details/148294167)               |
### 2.3 与 Activiti 的差异总结
1. **Activiti 7 进行了激进的云原生重构**，不再是传统的可独立部署的 Java 库，而是一组基于 Kubernetes 和 Spring Cloud 的微服务集合[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829)，**强制依赖 Kubernetes 生态系统**[-31](https://blog.csdn.net/weixin_28366353/article/details/158899829)
2. **Camunda 8 (Zeebe) 是全新架构**，采用**事件溯源(event sourcing)的持久化模型**和**分布式工作流引擎集群**[-4](https://blog.csdn.net/jupyter5notebook/article/details/154437539)，与 Activiti 的 PVM 架构完全不同
3. **性能差异显著**：Zeebe 单节点吞吐量可达 12,000 TPS，远超 Activiti 7 的 3,200 TPS[-4](https://blog.csdn.net/jupyter5notebook/article/details/154437539)
4. **Zeebe 支持任何 gRPC 支持的编程语言**实现 Worker，不限于 Java-
### 2.4 选型建议
| 场景                             | 推荐                     | 理由                                                                                  |
| ------------------------------ | ---------------------- | ----------------------------------------------------------------------------------- |
| **现有 Activiti 项目迁移**           | Flowable               | API 高度兼容，迁移成本最低[-2](https://blog.csdn.net/lanwp5302/article/details/148294167)      |
| **传统单体应用，简单流程**                | Activiti 7             | 轻量级，快速上手-                                                                           |
| **微服务架构，中等并发**                 | Camunda 7 或 Flowable 7 | 功能完善，社区活跃[-2](https://blog.csdn.net/lanwp5302/article/details/148294167)            |
| **高并发、云原生、分布式**                | **Camunda 8 (Zeebe)**  | 云原生架构，高吞吐量，内置高可用[-3](https://blog.csdn.net/ryo1060732496/article/details/148369587) |
| **已有 Loyalty 平台（Java/Spring）** | **Camunda 7 或 Zeebe**  | 需评估当前架构：传统应用→Camunda 7；云原生→Zeebe                                                    |
### 2.5 对 Campaign Tools 的建议
考虑到 Loyalty 平台的技术栈（Java 17 + Spring Boot 3.x）和 Campaign Tools 的**高并发营销活动执行**需求：
| 考量因素        | 分析                                                                                            |
| ----------- | --------------------------------------------------------------------------------------------- |
| **并发量**     | 营销活动可能同时触达数万会员，需要高吞吐量                                                                         |
| **云原生**     | 如果部署在 K8s 环境，Zeebe 优势明显                                                                       |
| **Java 生态** | Camunda 7 与 Spring Boot 集成更成熟                                                                 |
| **长期维护**    | Camunda 7 社区版已于 2025 年 10 月 EOL[-1](https://grapecity.csdn.net/6923cba882fbe0098cae41fb.html) |
**建议**：
* 如果团队**熟悉 Activiti**且迁移成本可控，建议直接选择 **Camunda 8 (Zeebe)**，因为 Camunda 7 已停止社区维护[-1](https://grapecity.csdn.net/6923cba882fbe0098cae41fb.html)，且 Zeebe 是未来方向
* 如果希望**平滑过渡**，可先用 **Camunda 7** 快速落地，后续再评估迁移到 Zeebe
* 如果**完全云原生**，直接选择 **Zeebe**，它专为高吞吐量微服务设计[-2](https://blog.csdn.net/lanwp5302/article/details/148294167)
***
以上补充设计涵盖了订单明细、商品分类、积分明细、等级变更明细等全部数据域，同时澄清了 Camunda/Zeebe 与 Activiti 的关系和差异，可直接纳入 Campaign Tools 设计文档。
# Campaign Execution 工作流引擎设计：Zeebe 本地开发与 PostgreSQL 适配
> **关联主文档**：Campaign Tools 平台设计文档
> **版本**：1.0
> **设计目标**：基于 Zeebe 构建 Campaign Execution 工作流引擎，采用 PostgreSQL 作为本地开发数据库，后续平滑迁移至 ClickHouse 生产环境。
## 一、整体架构设计
### 1.1 技术选型确认
| 组件         | 选型                 | 说明                           |
| ---------- | ------------------ | ---------------------------- |
| **工作流引擎**  | Zeebe (Camunda 8)  | 云原生、高吞吐量、事件驱动                |
| **部署模式**   | 嵌入式 (Embedded)     | 本地开发使用 Spring Boot 嵌入式 Zeebe |
| **存储引擎**   | RocksDB (Zeebe 默认) | Zeebe 自身状态存储                 |
| **业务数据存储** | PostgreSQL         | 流程定义、实例元数据、活动记录、执行日志         |
| **分析数据存储** | ClickHouse         | 生产环境，用于 AI 分析和报表             |
### 1.2 架构分层
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 平台（事件源）                               │
│  会员入会 · 订单完成 · 签到 · 行为事件 · 等级变更 · 积分变动                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (事件推送 / 定时触发)
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Zeebe 工作流引擎（嵌入式）                           │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Zeebe Broker (RocksDB)                                            │   │
│  │  · 流程实例状态 · 作业队列 · 变量存储                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                    │                                       │
│                                    ▼                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Zeebe Workers (Spring Boot 服务)                                  │   │
│  │  · 人群筛选 Worker · 消息发送 Worker · Offer 发放 Worker           │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (业务数据持久化)
┌─────────────────────────────────────────────────────────────────────────────┐
│                         PostgreSQL（业务数据存储）                           │
│  流程定义 · 流程实例 · 执行日志 · 活动记录 · 人群快照                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼ (ETL / 同步)
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ClickHouse（分析数据存储 - 生产环境）                │
│  流程执行分析 · 活动效果分析 · AI 数据查询                                  │
└─────────────────────────────────────────────────────────────────────────────┘
```
## 二、本地开发环境配置
### 2.1 Maven 依赖
xml
运行
```
<!-- Zeebe Spring Boot Starter -->
<dependency>
    <groupId>io.camunda</groupId>
    <artifactId>spring-boot-starter-camunda</artifactId>
    <version>8.5.0</version>
</dependency>
<!-- Zeebe Client -->
<dependency>
    <groupId>io.camunda</groupId>
    <artifactId>zeebe-client-java</artifactId>
    <version>8.5.0</version>
</dependency>
<!-- PostgreSQL 驱动 -->
<dependency>
    <groupId>org.postgresql</groupId>
    <artifactId>postgresql</artifactId>
    <version>42.7.3</version>
</dependency>
<!-- 数据库连接池 -->
<dependency>
    <groupId>com.zaxxer</groupId>
    <artifactId>HikariCP</artifactId>
</dependency>
<!-- JSON 处理 -->
<dependency>
    <groupId>com.fasterxml.jackson.core</groupId>
    <artifactId>jackson-databind</artifactId>
</dependency>
```
### 2.2 application.yml 配置
yaml
```
# Zeebe 嵌入式配置（本地开发）
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
      threads:
        cpu-threads: 1
        io-threads: 2
    data:
      directory: ./zeebe-data  # RocksDB 数据目录
      snapshot-period: 15m
      compaction-rate: 1000
    export:
      # 导出到 PostgreSQL（自定义 Exporter）
      enabled: true
# PostgreSQL 配置（本地开发）
spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/campaign_dev
    username: campaign_user
    password: campaign_pass
    driver-class-name: org.postgresql.Driver
    hikari:
      maximum-pool-size: 10
      minimum-idle: 5
      connection-timeout: 30000
      idle-timeout: 600000
      max-lifetime: 1800000
  jpa:
    hibernate:
      ddl-auto: update
    show-sql: true
    properties:
      hibernate:
        dialect: org.hibernate.dialect.PostgreSQLDialect
        format_sql: true
        jdbc:
          batch_size: 100
# ClickHouse（生产环境 - 本地暂不启用）
clickhouse:
  enabled: false
```
### 2.3 Docker Compose 环境（本地开发）
yaml
```
# docker-compose.yml
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
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql
  # Zeebe 独立模式（可选，也可用嵌入式）
  zeebe:
    image: camunda/zeebe:8.5.0
    ports:
      - "26500:26500"
      - "9600:9600"
    environment:
      - ZEEBE_LOG_LEVEL=debug
      - ZEEBE_GATEWAY_NETWORK_HOST=0.0.0.0
    volumes:
      - ./zeebe-data:/usr/local/zeebe/data
  # Zeebe Operate（可视化监控，可选）
  operate:
    image: camunda/operate:8.5.0
    ports:
      - "8080:8080"
    environment:
      - CAMUNDA_OPERATE_ZEEBE_GATEWAYADDRESS=zeebe:26500
      - CAMUNDA_OPERATE_ELASTICSEARCH_URL=http://elasticsearch:9200
    depends_on:
      - zeebe
```
### 2.4 Zeebe 嵌入式配置类
```java
package com.loyalty.campaign.config;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.ZeebeClientConfiguration;
import io.camunda.zeebe.client.api.worker.JobWorker;
import io.camunda.zeebe.client.impl.ZeebeClientBuilderImpl;
import io.camunda.zeebe.embedded.EmbeddedZeebe;
import io.camunda.zeebe.embedded.EmbeddedZeebeConfig;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import java.time.Duration;
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
## 三、Zeebe 与 Loyalty 集成
### 3.1 整体集成架构
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Loyalty 平台事件源                                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐        │
│  │会员入会  │  │订单完成  │  │签到事件  │  │行为事件  │  │等级变更  │        │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
         │            │            │            │            │
         └────────────┴────────────┼────────────┴────────────┘
                                   │
                                   ▼ (EventBridge)
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Campaign 事件路由器                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  根据事件类型 + 会员状态 匹配 → 对应的 Zeebe 流程                    │   │
│  │  · 会员入会 → 入会欢迎流程                                          │   │
│  │  · 订单完成 → 订单后流程（积分通知、满意度调查）                    │   │
│  │  · 生日 → 生日营销流程（定时触发）                                 │   │
│  │  · 90天未消费 → 流失挽回流程                                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                   │
                                   ▼ (创建流程实例)
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Zeebe 工作流引擎                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  流程实例启动 → 执行 BPMN 定义 → 调度 Workers                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 3.2 事件路由器实现
```java
package com.loyalty.campaign.router;
import com.loyalty.campaign.event.CampaignEvent;
import com.loyalty.campaign.event.EventType;
import io.camunda.zeebe.client.ZeebeClient;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Service
public class CampaignEventRouter {
    @Autowired
    private ZeebeClient zeebeClient;
    @Autowired
    private CampaignFlowDefinitionService flowDefinitionService;
    /**
     * 路由 Loyalty 事件到对应的 Zeebe 流程
     */
    public void routeEvent(CampaignEvent event) {
        EventType eventType = event.getEventType();
        String memberId = event.getMemberId();
        String programCode = event.getProgramCode();
        // 1. 根据事件类型和会员状态匹配流程
        String bpmnProcessId = resolveBpmnProcessId(event);
        if (bpmnProcessId == null) {
            log.debug("未匹配到流程，忽略事件: {}", eventType);
            return;
        }
        // 2. 构建流程变量
        Map<String, Object> variables = buildVariables(event);
        // 3. 启动 Zeebe 流程实例
        zeebeClient.newCreateInstanceCommand()
            .bpmnProcessId(bpmnProcessId)
            .latestVersion()
            .variables(variables)
            .send()
            .whenComplete((result, exception) -> {
                if (exception != null) {
                    log.error("启动流程失败: {}", exception.getMessage(), exception);
                } else {
                    log.info("流程实例启动成功: processInstanceKey={}, bpmnProcessId={}",
                        result.getProcessInstanceKey(), bpmnProcessId);
                }
            });
    }
    private String resolveBpmnProcessId(CampaignEvent event) {
        // 从数据库查询匹配的流程定义
        return flowDefinitionService.findMatchingFlow(
            event.getProgramCode(),
            event.getEventType(),
            event.getMemberId()
        );
    }
    private Map<String, Object> buildVariables(CampaignEvent event) {
        Map<String, Object> variables = new HashMap<>();
        variables.put("memberId", event.getMemberId());
        variables.put("programCode", event.getProgramCode());
        variables.put("eventType", event.getEventType().name());
        variables.put("eventTime", event.getEventTime());
        variables.put("eventData", event.getData());
        variables.put("channel", event.getChannel());
        return variables;
    }
}
```
### 3.3 流程匹配规则表
```sql
CREATE TABLE campaign_flow_route_rule (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    event_type VARCHAR(50) NOT NULL,              -- MEMBER_ENROLLED / ORDER_COMPLETED / BIRTHDAY / ...
    member_condition JSONB,                       -- 会员条件（如等级、注册天数等）
    bpmn_process_id VARCHAR(100) NOT NULL,        -- Zeebe BPMN 流程ID
    priority INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, event_type, bpmn_process_id)
);
```
### 3.4 Loyalty 事件监听器
```java
package com.loyalty.campaign.listener;
import com.loyalty.campaign.event.CampaignEvent;
import com.loyalty.campaign.event.EventType;
import com.loyalty.campaign.router.CampaignEventRouter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;
@Slf4j
@Component
public class LoyaltyEventListener {
    @Autowired
    private CampaignEventRouter eventRouter;
    /**
     * 监听 Loyalty 会员入会事件
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleMemberEnrolled(MemberEnrolledEvent event) {
        CampaignEvent campaignEvent = CampaignEvent.builder()
            .eventType(EventType.MEMBER_ENROLLED)
            .memberId(event.getMemberId())
            .programCode(event.getProgramCode())
            .eventTime(event.getEnrolledAt())
            .data(Map.of(
                "name", event.getName(),
                "birthday", event.getBirthday(),
                "channel", event.getChannel()
            ))
            .channel(event.getChannel())
            .build();
        eventRouter.routeEvent(campaignEvent);
    }
    /**
     * 监听 Loyalty 订单完成事件
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleOrderCompleted(OrderCompletedEvent event) {
        CampaignEvent campaignEvent = CampaignEvent.builder()
            .eventType(EventType.ORDER_COMPLETED)
            .memberId(event.getMemberId())
            .programCode(event.getProgramCode())
            .eventTime(event.getCompletedAt())
            .data(Map.of(
                "orderId", event.getOrderId(),
                "totalAmount", event.getTotalAmount(),
                "items", event.getItems(),
                "pointsEarned", event.getPointsEarned()
            ))
            .channel(event.getChannel())
            .build();
        eventRouter.routeEvent(campaignEvent);
    }
    /**
     * 监听 Loyalty 签到事件
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleMemberSignIn(MemberSignInEvent event) {
        CampaignEvent campaignEvent = CampaignEvent.builder()
            .eventType(EventType.MEMBER_SIGN_IN)
            .memberId(event.getMemberId())
            .programCode(event.getProgramCode())
            .eventTime(event.getSignInAt())
            .data(Map.of(
                "continuousDays", event.getContinuousDays()
            ))
            .channel("APP")
            .build();
        eventRouter.routeEvent(campaignEvent);
    }
    /**
     * 监听 Loyalty 等级变更事件
     */
    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void handleTierChanged(TierChangedEvent event) {
        CampaignEvent campaignEvent = CampaignEvent.builder()
            .eventType(EventType.TIER_CHANGED)
            .memberId(event.getMemberId())
            .programCode(event.getProgramCode())
            .eventTime(event.getChangedAt())
            .data(Map.of(
                "oldTier", event.getOldTier(),
                "newTier", event.getNewTier(),
                "reason", event.getReason()
            ))
            .build();
        eventRouter.routeEvent(campaignEvent);
    }
}
```
## 四、Zeebe Workers 实现
### 4.1 Worker 基类
```java
package com.loyalty.campaign.worker;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.client.api.worker.JobClient;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.Map;
@Slf4j
@Component
public abstract class BaseCampaignWorker {
    /**
     * 执行 Worker 逻辑
     * @param client Zeebe 客户端
     * @param job 激活的任务
     * @return 执行结果
     */
    protected Map<String, Object> execute(JobClient client, ActivatedJob job) {
        try {
            log.info("开始执行 Worker: {}, processInstanceKey: {}, jobKey: {}",
                getWorkerType(), job.getProcessInstanceKey(), job.getKey());
            Map<String, Object> variables = job.getVariablesAsMap();
            Map<String, Object> result = doExecute(job, variables);
            log.info("Worker 执行成功: {}, jobKey: {}", getWorkerType(), job.getKey());
            return result;
        } catch (Exception e) {
            log.error("Worker 执行失败: {}, error: {}", getWorkerType(), e.getMessage(), e);
            // 抛出异常让 Zeebe 重试
            throw new RuntimeException("Worker execution failed: " + e.getMessage(), e);
        }
    }
    /**
     * 子类实现具体业务逻辑
     */
    protected abstract Map<String, Object> doExecute(ActivatedJob job, Map<String, Object> variables);
    /**
     * Worker 类型名称
     */
    protected abstract String getWorkerType();
    /**
     * 获取流程变量
     */
    protected <T> T getVariable(Map<String, Object> variables, String key, Class<T> type) {
        Object value = variables.get(key);
        if (value == null) return null;
        if (type.isInstance(value)) return type.cast(value);
        // 简单类型转换
        if (type == String.class) return type.cast(String.valueOf(value));
        return null;
    }
    /**
     * 记录执行日志
     */
    protected void logExecution(ActivatedJob job, String step, String status, String message) {
        // 异步写入 PostgreSQL
        campaignExecutionLogRepo.save(
            CampaignExecutionLog.builder()
                .processInstanceKey(job.getProcessInstanceKey())
                .jobKey(job.getKey())
                .workerType(getWorkerType())
                .step(step)
                .status(status)
                .message(message)
                .executedAt(LocalDateTime.now())
                .build()
        );
    }
}
```
### 4.2 人群筛选 Worker
```java
package com.loyalty.campaign.worker;
import io.camunda.zeebe.client.api.response.ActivatedJob;
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
    private CampaignAudienceService audienceService;
    @Override
    protected String getWorkerType() {
        return "audience_filter";
    }
    @JobWorker(type = "audience_filter", timeout = 30000)
    public Map<String, Object> handleJob(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(ActivatedJob job, Map<String, Object> variables) {
        // 1. 获取筛选条件
        String conditionJson = getVariable(variables, "audienceCondition", String.class);
        String memberId = getVariable(variables, "memberId", String.class);
        String programCode = getVariable(variables, "programCode", String.class);
        // 2. 执行人群筛选（查询 Campaign 宽表）
        boolean matches = audienceService.evaluateMember(programCode, memberId, conditionJson);
        // 3. 返回结果
        Map<String, Object> result = new HashMap<>();
        result.put("audienceMatched", matches);
        result.put("memberId", memberId);
        result.put("evaluatedAt", java.time.LocalDateTime.now().toString());
        if (matches) {
            result.put("audienceName", "匹配人群");
            // 触发后续节点
            result.put("nextStep", "send_message");
        } else {
            result.put("nextStep", "end");
        }
        return result;
    }
}
```
### 4.3 消息发送 Worker
```java
package com.loyalty.campaign.worker;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Component
public class MessageSenderWorker extends BaseCampaignWorker {
    @Autowired
    private ChannelService channelService;
    @Autowired
    private TemplateService templateService;
    @Override
    protected String getWorkerType() {
        return "send_message";
    }
    @JobWorker(type = "send_message", timeout = 60000)
    public Map<String, Object> handleJob(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(ActivatedJob job, Map<String, Object> variables) {
        // 1. 获取参数
        String memberId = getVariable(variables, "memberId", String.class);
        String programCode = getVariable(variables, "programCode", String.class);
        String channel = getVariable(variables, "channel", String.class);
        String templateCode = getVariable(variables, "templateCode", String.class);
        Map<String, Object> templateData = (Map<String, Object>) variables.get("templateData");
        // 2. 获取会员信息
        MemberInfo memberInfo = memberService.getMemberInfo(programCode, memberId);
        // 3. 渲染模板
        String content = templateService.render(templateCode, memberInfo, templateData);
        // 4. 发送消息
        SendResult result = channelService.send(
            channel,
            memberInfo.getContactInfo(),
            content,
            variables.get("offerId") != null ? variables.get("offerId").toString() : null
        );
        // 5. 记录发送日志
        saveSendLog(memberId, channel, templateCode, result);
        Map<String, Object> resultMap = new HashMap<>();
        resultMap.put("sent", result.isSuccess());
        resultMap.put("messageId", result.getMessageId());
        resultMap.put("channel", channel);
        resultMap.put("sentAt", java.time.LocalDateTime.now().toString());
        return resultMap;
    }
}
```
### 4.4 Offer 发放 Worker
```java
package com.loyalty.campaign.worker;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Component
public class OfferDispatchWorker extends BaseCampaignWorker {
    @Autowired
    private PointsGrantService pointsGrantService;
    @Autowired
    private CouponService couponService;
    @Override
    protected String getWorkerType() {
        return "offer_dispatch";
    }
    @JobWorker(type = "offer_dispatch", timeout = 30000)
    public Map<String, Object> handleJob(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(ActivatedJob job, Map<String, Object> variables) {
        String memberId = getVariable(variables, "memberId", String.class);
        String programCode = getVariable(variables, "programCode", String.class);
        String offerType = getVariable(variables, "offerType", String.class);
        String offerId = getVariable(variables, "offerId", String.class);
        Map<String, Object> result = new HashMap<>();
        switch (offerType) {
            case "POINTS":
                // 发放积分
                Integer points = (Integer) variables.get("pointsAmount");
                String pointType = getVariable(variables, "pointType", String.class);
                String ruleId = getVariable(variables, "ruleId", String.class);
                pointsGrantService.grantPoints(programCode, memberId, pointType, 
                    BigDecimal.valueOf(points), ruleId, null);
                result.put("pointsGranted", points);
                result.put("pointType", pointType);
                break;
            case "COUPON":
                // 发放优惠券
                String couponTemplateId = getVariable(variables, "couponTemplateId", String.class);
                String couponCode = couponService.issueCoupon(programCode, memberId, couponTemplateId);
                result.put("couponCode", couponCode);
                result.put("couponTemplateId", couponTemplateId);
                break;
            default:
                log.warn("未知的 Offer 类型: {}", offerType);
        }
        result.put("offerDispatched", true);
        result.put("dispatchedAt", java.time.LocalDateTime.now().toString());
        return result;
    }
}
```
### 4.5 等待 Worker（定时器节点）
```java
package com.loyalty.campaign.worker;
import io.camunda.zeebe.client.api.response.ActivatedJob;
import io.camunda.zeebe.spring.client.annotation.JobWorker;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
@Slf4j
@Component
public class WaitWorker extends BaseCampaignWorker {
    @Override
    protected String getWorkerType() {
        return "wait";
    }
    @JobWorker(type = "wait", timeout = 30000)
    public Map<String, Object> handleJob(JobClient client, ActivatedJob job) {
        return execute(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(ActivatedJob job, Map<String, Object> variables) {
        // 等待节点实际上由 Zeebe 的定时器 BPMN 元素处理
        // 这个 Worker 只是记录等待开始和结束
        Long waitDuration = getVariable(variables, "waitDuration", Long.class);
        if (waitDuration == null) waitDuration = 0L;
        log.info("等待节点开始: processInstanceKey={}, waitDuration={}ms",
            job.getProcessInstanceKey(), waitDuration);
        Map<String, Object> result = new HashMap<>();
        result.put("waitCompleted", true);
        result.put("waitStartedAt", LocalDateTime.now().minus(Duration.ofMillis(waitDuration)).toString());
        result.put("waitEndedAt", LocalDateTime.now().toString());
        return result;
    }
}
```
### 4.6 Worker 统一注册
```java
package com.loyalty.campaign.worker;
import io.camunda.zeebe.spring.client.ZeebeClientLifecycle;
import org.springframework.context.annotation.Configuration;
@Configuration
public class WorkerRegistry {
    // 所有 Worker 通过 @JobWorker 注解自动注册
    // 无需额外配置
}
```
## 五、BPMN 流程定义
### 5.1 入会欢迎旅程 BPMN
xml
运行
```
<?xml version="1.0" encoding="UTF-8"?>
<bpmn:definitions xmlns:bpmn="http://www.omg.org/spec/BPMN/20100524/MODEL"
                  xmlns:bpmndi="http://www.omg.org/spec/BPMN/20100524/DI"
                  id="Definitions_1"
                  targetNamespace="http://bpmn.io/schema/bpmn">
  <bpmn:process id="MemberWelcomeJourney" isExecutable="true">
    
    <!-- 开始事件（由事件路由器触发） -->
    <bpmn:startEvent id="StartEvent_1" name="会员入会">
      <bpmn:messageEventDefinition id="MessageEventDefinition_1" />
    </bpmn:startEvent>
    <!-- 等待 10 分钟 -->
    <bpmn:intermediateCatchEvent id="Timer_1" name="等待10分钟">
      <bpmn:timerEventDefinition>
        <bpmn:timeDuration>PT10M</bpmn:timeDuration>
      </bpmn:timerEventDefinition>
    </bpmn:intermediateCatchEvent>
    <!-- 检查会员是否已消费 -->
    <bpmn:serviceTask id="Activity_0" name="检查是否已消费" 
                      zeebe:taskType="audience_filter">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="audience_filter" />
        <zeebe:taskHeaders>
          <zeebe:header key="condition" value="order_count == 0" />
        </zeebe:taskHeaders>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <!-- 条件分支 -->
    <bpmn:exclusiveGateway id="Gateway_1" name="是否已消费">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">
        = return variables.audienceMatched == false
      </bpmn:conditionExpression>
    </bpmn:exclusiveGateway>
    <!-- 发送欢迎邮件 -->
    <bpmn:serviceTask id="Activity_1" name="发送欢迎邮件"
                      zeebe:taskType="send_message">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="send_message" />
        <zeebe:taskHeaders>
          <zeebe:header key="channel" value="EMAIL" />
          <zeebe:header key="templateCode" value="WELCOME_EMAIL" />
        </zeebe:taskHeaders>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <!-- 发送首购优惠 -->
    <bpmn:serviceTask id="Activity_2" name="发送首购优惠"
                      zeebe:taskType="send_message">
      <bpmn:extensionElements>
        <zeebe:taskDefinition type="send_message" />
        <zeebe:taskHeaders>
          <zeebe:header key="channel" value="SMS" />
          <zeebe:header key="templateCode" value="FIRST_PURCHASE_OFFER" />
        </zeebe:taskHeaders>
      </bpmn:extensionElements>
    </bpmn:serviceTask>
    <!-- 结束事件 -->
    <bpmn:endEvent id="EndEvent_1" name="结束" />
    <!-- 连线 -->
    <bpmn:sequenceFlow id="Flow_1" sourceRef="StartEvent_1" targetRef="Timer_1" />
    <bpmn:sequenceFlow id="Flow_2" sourceRef="Timer_1" targetRef="Activity_0" />
    <bpmn:sequenceFlow id="Flow_3" sourceRef="Activity_0" targetRef="Gateway_1" />
    <bpmn:sequenceFlow id="Flow_4" sourceRef="Gateway_1" targetRef="Activity_1">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">
        = return variables.audienceMatched == false
      </bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_5" sourceRef="Gateway_1" targetRef="Activity_2">
      <bpmn:conditionExpression xsi:type="bpmn:tFormalExpression">
        = return variables.audienceMatched == true
      </bpmn:conditionExpression>
    </bpmn:sequenceFlow>
    <bpmn:sequenceFlow id="Flow_6" sourceRef="Activity_1" targetRef="EndEvent_1" />
    <bpmn:sequenceFlow id="Flow_7" sourceRef="Activity_2" targetRef="EndEvent_1" />
  </bpmn:process>
</bpmn:definitions>
```
### 5.2 BPMN 存储表
```sql
-- BPMN 流程定义表
CREATE TABLE campaign_bpmn_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    bpmn_process_id VARCHAR(100) NOT NULL,       -- BPMN process id
    bpmn_name VARCHAR(200) NOT NULL,
    bpmn_xml TEXT NOT NULL,                      -- BPMN XML 内容
    version INT DEFAULT 1,
    status VARCHAR(20) DEFAULT 'DRAFT',          -- DRAFT / ACTIVE / INACTIVE
    flow_graph JSONB,                            -- 画布 JSON（用于前端展示）
    description TEXT,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, bpmn_process_id, version)
);
```
### 5.3 流程部署服务
```java
package com.loyalty.campaign.flow;
import io.camunda.zeebe.client.ZeebeClient;
import io.camunda.zeebe.client.api.response.DeploymentEvent;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
@Slf4j
@Service
public class BpmnDeployService {
    @Autowired
    private ZeebeClient zeebeClient;
    @Autowired
    private CampaignBpmnDefinitionRepository bpmnRepo;
    /**
     * 部署 BPMN 流程到 Zeebe
     */
    public String deployProcess(String programCode, String bpmnProcessId) {
        CampaignBpmnDefinition definition = bpmnRepo.findByProgramCodeAndProcessId(
            programCode, bpmnProcessId);
        if (definition == null) {
            throw new RuntimeException("BPMN 定义不存在: " + bpmnProcessId);
        }
        // 部署到 Zeebe
        DeploymentEvent deployment = zeebeClient.newDeployResourceCommand()
            .addResourceString(definition.getBpmnXml(), bpmnProcessId + ".bpmn")
            .send()
            .join();
        log.info("BPMN 流程部署成功: processId={}, version={}",
            bpmnProcessId, deployment.getProcesses().get(0).getVersion());
        // 更新部署版本
        definition.setDeployedVersion(deployment.getProcesses().get(0).getVersion());
        bpmnRepo.save(definition);
        return deployment.getProcesses().get(0).getBpmnProcessId();
    }
}
```
## 六、PostgreSQL 数据库表设计
### 6.1 流程执行日志表
```sql
CREATE TABLE campaign_execution_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    process_instance_key BIGINT,                 -- Zeebe 流程实例 Key
    job_key BIGINT,                              -- Zeebe Job Key
    worker_type VARCHAR(50),                     -- Worker 类型
    step VARCHAR(100),                           -- 执行步骤名称
    status VARCHAR(20) NOT NULL,                 -- SUCCESS / FAILED / TIMEOUT
    message TEXT,
    variables JSONB,                             -- 流程变量快照
    result_data JSONB,                           -- 执行结果数据
    executed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cel_process ON campaign_execution_log(process_instance_key);
CREATE INDEX idx_cel_worker ON campaign_execution_log(worker_type);
CREATE INDEX idx_cel_status ON campaign_execution_log(status);
CREATE INDEX idx_cel_time ON campaign_execution_log(executed_at);
```
### 6.2 流程实例状态表
```sql
CREATE TABLE campaign_instance (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    process_instance_key BIGINT NOT NULL UNIQUE, -- Zeebe 流程实例 Key
    bpmn_process_id VARCHAR(100) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    status VARCHAR(20) DEFAULT 'RUNNING',        -- RUNNING / COMPLETED / FAILED / CANCELLED
    current_step VARCHAR(100),                   -- 当前执行的步骤
    variables JSONB,                             -- 当前流程变量
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ci_member ON campaign_instance(member_id);
CREATE INDEX idx_ci_process ON campaign_instance(bpmn_process_id);
CREATE INDEX idx_ci_status ON campaign_instance(status);
CREATE INDEX idx_ci_started ON campaign_instance(started_at);
```
### 6.3 消息发送日志表
```sql
CREATE TABLE campaign_message_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    process_instance_key BIGINT,
    channel VARCHAR(30) NOT NULL,               -- EMAIL / SMS / PUSH
    template_code VARCHAR(100),
    message_id VARCHAR(200),                    -- 第三方返回的消息ID
    content TEXT,
    status VARCHAR(20) NOT NULL,                -- SENT / FAILED / DELIVERED / OPENED / CLICKED
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    opened_at TIMESTAMPTZ,
    clicked_at TIMESTAMPTZ,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cml_member ON campaign_message_log(member_id);
CREATE INDEX idx_cml_channel ON campaign_message_log(channel);
CREATE INDEX idx_cml_status ON campaign_message_log(status);
CREATE INDEX idx_cml_time ON campaign_message_log(sent_at);
```
## 七、生产环境 ClickHouse 迁移方案
### 7.1 迁移架构
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Zeebe 工作流引擎                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  Zeebe Exporter（自定义导出器）                                    │   │
│  │  监听 Zeebe 事件流 → 导出到 ClickHouse                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                      ClickHouse（分析数据存储）                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  · 流程执行分析表                                                   │   │
│  │  · 活动效果分析表                                                   │   │
│  │  · 消息发送分析表                                                   │   │
│  │  · AI 查询数据视图                                                 │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 7.2 ClickHouse 表设计
```sql
-- 流程执行分析表
CREATE TABLE campaign_flow_analysis (
    event_date Date,
    program_code String,
    bpmn_process_id String,
    process_instance_key UInt64,
    member_id String,
    status String,
    duration_seconds UInt32,
    worker_type String,
    worker_duration_ms UInt32,
    created_at DateTime
) ENGINE = MergeTree()
PARTITION BY event_date
ORDER BY (event_date, program_code, bpmn_process_id);
-- 消息发送分析表
CREATE TABLE campaign_message_analysis (
    event_date Date,
    program_code String,
    member_id String,
    channel String,
    template_code String,
    status String,
    sent_at DateTime,
    delivered_at DateTime,
    opened_at DateTime,
    clicked_at DateTime,
    response_time_seconds UInt32,
    created_at DateTime
) ENGINE = MergeTree()
PARTITION BY event_date
ORDER BY (event_date, program_code, channel);
```
### 7.3 Zeebe Exporter 实现（生产环境）
```java
package com.loyalty.campaign.export;
import io.camunda.zeebe.exporter.api.Exporter;
import io.camunda.zeebe.exporter.api.context.Context;
import io.camunda.zeebe.exporter.api.context.Controller;
import io.camunda.zeebe.protocol.record.Record;
import io.camunda.zeebe.protocol.record.RecordType;
import io.camunda.zeebe.protocol.record.ValueType;
import lombok.extern.slf4j.Slf4j;
@Slf4j
public class ClickHouseExporter implements Exporter {
    private Controller controller;
    private ClickHouseClient clickHouseClient;
    @Override
    public void configure(Context context) {
        // 配置导出器
        Context.RecordFilter filter = context.getRecordFilter();
        filter.accept(RecordType.EVENT);
        filter.accept(ValueType.PROCESS_INSTANCE);
        filter.accept(ValueType.JOB);
    }
    @Override
    public void open(Controller controller) {
        this.controller = controller;
        this.clickHouseClient = new ClickHouseClient();
        log.info("ClickHouse Exporter 已启动");
    }
    @Override
    public void export(Record<?> record) {
        // 处理流程实例事件
        if (record.getValueType() == ValueType.PROCESS_INSTANCE) {
            handleProcessInstanceRecord(record);
        }
        // 处理 Job 事件
        if (record.getValueType() == ValueType.JOB) {
            handleJobRecord(record);
        }
    }
    private void handleProcessInstanceRecord(Record<?> record) {
        // 解析并写入 ClickHouse
        clickHouseClient.insertProcessInstance(record);
    }
    private void handleJobRecord(Record<?> record) {
        // 解析并写入 ClickHouse
        clickHouseClient.insertJob(record);
    }
    @Override
    public void close() {
        if (clickHouseClient != null) {
            clickHouseClient.close();
        }
        log.info("ClickHouse Exporter 已关闭");
    }
}
```
## 八、开发环境启动步骤
### 8.1 本地开发启动流程
```bash
# 1. 启动 PostgreSQL
docker-compose up -d postgres
# 2. 初始化数据库（执行 DDL）
psql -h localhost -U campaign_user -d campaign_dev < init.sql
# 3. 启动 Zeebe（嵌入式模式，随 Spring Boot 自动启动）
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
# 4. 部署 BPMN 流程（通过 API 或启动时自动部署）
curl -X POST http://localhost:8080/api/campaign/flows/deploy 
  -H "Content-Type: application/json" 
  -d '{"bpmnProcessId": "MemberWelcomeJourney"}'
```
### 8.2 验证 Zeebe 运行状态
```bash
# 检查 Zeebe 网关状态
zbctl status --insecure
# 部署流程
zbctl deploy resource welcome.bpmn --insecure
# 启动流程实例
zbctl create instance MemberWelcomeJourney --variables '{"memberId":"M123"}' --insecure
```
## 九、技术选型总结与决策依据
| 决策项        | 选型                | 依据                           |
| ---------- | ----------------- | ---------------------------- |
| **工作流引擎**  | Zeebe (Camunda 8) | 云原生架构、高吞吐量、事件溯源、与 Java 生态集成好 |
| **部署模式**   | 嵌入式 (Embedded)    | 本地开发轻量级，无需额外部署 Zeebe Broker  |
| **业务数据存储** | PostgreSQL        | 关系型数据管理成熟，事务支持完善             |
| **分析数据存储** | ClickHouse        | 高并发查询，列式存储适合 OLAP 分析         |
| **数据同步**   | Zeebe Exporter    | 原生支持事件流导出，低延迟                |
### 9.1 Zeebe vs Activiti 对比（针对本次选型）
| 对比维度        | Activiti 7  | Zeebe (Camunda 8) | 选型倾向     |
| ----------- | ----------- | ----------------- | -------- |
| **云原生支持**   | 有限          | **优秀**            | Zeebe    |
| **高并发吞吐量**  | ~3,200 TPS | **~12,000 TPS**  | Zeebe    |
| **Java 集成** | 良好          | **良好**            | 持平       |
| **内存占用**    | 较小          | 中等                | Activiti |
| **部署复杂度**   | 较低          | 中等                | Activiti |
| **社区活跃度**   | 下降          | **上升**            | Zeebe    |
| **事件溯源**    | ❌           | ✅                 | Zeebe    |
| **水平扩展**    | 有限          | **原生支持**          | Zeebe    |
**最终决策：选择 Zeebe，理由如下：**
1. **高并发营销场景**：活动期间可能触发数万流程实例，Zeebe 的吞吐量优势明显
2. **云原生方向**：平台未来可能部署在 Kubernetes 上，Zeebe 原生支持
3. **事件驱动架构**：Zeebe 的事件溯源模式与 Loyalty 的事件驱动架构更匹配
4. **长期维护**：Activiti 官方维护力度减弱，Camunda 8 是活跃发展方向
## 十、开发实施步骤
| 阶段          | 序号 | 任务                 | 说明                          | 优先级 |
| ----------- | -- | ------------------ | --------------------------- | --- |
| **环境搭建**    | 1  | 添加 Zeebe 依赖        | Spring Boot Starter Camunda | P0  |
|             | 2  | 配置 PostgreSQL      | 本地开发数据库                     | P0  |
|             | 3  | 配置 Zeebe 嵌入式模式     | 本地启动配置                      | P0  |
| **数据表**     | 4  | 创建执行日志表            | `campaign_execution_log`    | P0  |
|             | 5  | 创建流程实例表            | `campaign_instance`         | P0  |
|             | 6  | 创建消息日志表            | `campaign_message_log`      | P0  |
|             | 7  | 创建流程路由规则表          | `campaign_flow_route_rule`  | P0  |
|             | 8  | 创建 BPMN 定义表        | `campaign_bpmn_definition`  | P0  |
| **集成**      | 9  | 实现事件路由器            | Loyalty → Zeebe 事件映射        | P0  |
|             | 10 | 实现 Loyalty 事件监听器   | 监听会员、订单等事件                  | P0  |
| **Workers** | 11 | 实现人群筛选 Worker      | `audience_filter`           | P0  |
|             | 12 | 实现消息发送 Worker      | `send_message`              | P0  |
|             | 13 | 实现 Offer 发放 Worker | `offer_dispatch`            | P0  |
|             | 14 | 实现等待 Worker        | `wait`                      | P1  |
| **流程**      | 15 | 编写入会欢迎 BPMN        | 入会旅程模板                      | P0  |
|             | 16 | 编写生日营销 BPMN        | 生日旅程模板                      | P1  |
|             | 17 | 编写流失挽回 BPMN        | 流失挽回旅程模板                    | P1  |
|             | 18 | 实现流程部署服务           | BPMN 部署 API                 | P0  |
| **生产**      | 19 | 配置 Zeebe Exporter  | 导出到 ClickHouse              | P2  |
|             | 20 | 搭建 ClickHouse 环境   | 生产环境配置                      | P2  |
|             | 21 | 创建 ClickHouse 分析表  | 流程/消息分析表                    | P2  |
