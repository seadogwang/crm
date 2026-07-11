# 规则引擎补充设计文档：AI 对话式规则配置
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3 第六章《规则引擎》\
> **版本**：1.0\
> **设计目标**：在现有规则引擎基础上，增加基于大语言模型的对话式规则配置能力，使运营人员通过自然语言描述需求，系统自动生成符合平台规范的规则。
***
## 一、功能概述
### 1.1 业务痛点
| 痛点            | 说明                            |
| ------------- | ----------------------------- |
| **规则编写门槛高**   | Drools DRL 语法复杂，运营人员无法直接编写    |
| **AI 生成缺乏交互** | 现有的 AI 辅助生成是“一次性输入→输出”，缺乏多轮澄清 |
| **字段理解困难**    | 运营人员不熟悉底层字段名，需要看到业务友好的描述      |
| **规则类型混淆**    | 积分规则和等级规则使用不同的积分类型，容易配错       |
### 1.2 设计目标
* 通过**自然语言对话**的方式，运营人员描述规则需求
* 大模型结合**系统 Schema** 理解需求，自动生成标准规则
* 支持**多轮对话**，当信息不足时主动向用户提问澄清
* 区分**积分累积规则**和**等级规则**，根据规则类型自动过滤可用积分类型
* 用户看到的规则条件是**字段描述**（如“订单实付金额”），而非底层字段名
* 支持**对话式**和**填空题式**两种交互模式
***
## 二、整体流程
### 2.1 对话式规则配置流程
```text
用户输入需求
       │
       ▼
┌──────────────────────────────────────────────┐
│ Step 1: 意图识别                              │
│ - 判断规则类型（积分规则 / 等级规则）          │
│ - 如果未明确，追问用户                         │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Step 2: 信息抽取与结构化                      │
│ - 从对话中提取：触发条件、奖励对象、奖励值     │
│ - 结合系统 Schema 理解字段含义               │
│ - 识别缺失信息                                │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Step 3: 信息补充                             │
│ - 如果信息完整：生成规则预览                  │
│ - 如果信息缺失：生成澄清问题或展示填空页面    │
│ - 循环直至信息完整                           │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Step 4: 规则生成与预览                       │
│ - 根据类型自动填充积分类型                    │
│ - 生成 DRL 代码                             │
│ - 展示规则预览（业务语言描述 + DRL）          │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Step 5: 确认与保存                           │
│ - 用户确认规则逻辑                          │
│ - 保存为草稿或直接发布                       │
└──────────────────────────────────────────────┘
```
***
## 三、界面设计
### 3.1 整体布局
```text
┌─ AI 规则助手 ──────────────────────────────────────────────────────────┐
│ 规则类型：[积分累积规则 ▼]  状态：● 草稿   [保存] [发布] [清空]       │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  💬 对话区域                                                    │   │
│  │                                                                  │   │
│  │  🤖 您好！我是规则配置助手。请告诉我您想配置什么样的规则？      │   │
│  │                                                                  │   │
│  │  👤 我想给订单金额超过100元的用户奖励10积分                    │   │
│  │                                                                  │   │
│  │  🤖 好的，我理解您想配置一个积分累积规则。                     │   │
│  │     触发条件：订单实付金额 > 100 元                            │   │
│  │     奖励动作：奖励 10 积分                                      │   │
│  │     请问是否需要限定会员等级？                                  │   │
│  │                                                                  │   │
│  │  👤 只给黄金会员                                                │   │
│  │                                                                  │   │
│  │  🤖 明白了。我为您生成了以下规则预览，请确认：                 │   │
│  │     ┌─────────────────────────────────────────────────────┐    │   │
│  │     │ 📋 规则预览                                        │    │   │
│  │     │ 规则名称：订单满100送10积分（黄金会员专享）        │    │   │
│  │     │ 规则类型：积分累积规则                             │    │   │
│  │     │ 触发条件：                                         │    │   │
│  │     │   · 订单实付金额 > 100 元                          │    │   │
│  │     │   · 会员等级 = 黄金                                │    │   │
│  │     │ 奖励动作：                                         │    │   │
│  │     │   · 积分类型：消费积分                             │    │   │
│  │     │   · 奖励积分：10                                   │    │   │
│  │     └─────────────────────────────────────────────────────┘    │   │
│  │     确认无误吗？                                              │   │
│  │                                                                  │   │
│  │  [输入框] [发送]                                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ 规则预览（实时更新） ─────────────────────────────────────────────┐ │
│  │  DRL 代码（只读）                                                │ │
│  │  ┌──────────────────────────────────────────────────────────────┐ │ │
│  │  │ rule "ORDER_OVER_100_GOLD_10"                               │ │ │
│  │  │ when                                                         │ │ │
│  │  │     $event: EventFact(eventType == "ORDER",                 │ │ │
│  │  │               getPayloadNumber("total_amount") > 100)        │ │ │
│  │  │     $member: MemberFact(memberId == $event.memberId,        │ │ │
│  │  │               getExtString("tier_code") == "GOLD")          │ │ │
│  │  │ then                                                         │ │ │
│  │  │     ActionCollector.get().awardPoints(10, "REWARD")...       │ │ │
│  │  │ end                                                          │ │ │
│  │  └──────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```
### 3.2 信息补充页面（当大模型需要用户澄清时）
当大模型判断信息不完整时，可以切换到“填空/选择”模式，引导用户补充必要信息。
```text
┌─ 请补充以下信息 ────────────────────────────────────────────────────────┐
│ 为了生成完整的规则，还需要以下信息：                                     │
│                                                                          │
│  1. 触发条件：                                                           │
│     实体：[订单 ▼]  字段：[实付金额 ▼]  运算符：[大于 ▼]  值：[100]     │
│                                                                          │
│  2. 奖励设置：                                                           │
│     积分类型：[消费积分 ▼]  积分数量：[10]                              │
│                                                                          │
│  3. 是否限制会员等级？                                                   │
│     ● 全部会员  ○ 仅限特定等级：[黄金] [铂金]                          │
│                                                                          │
│  4. 是否有额外条件？                                                     │
│     □ 指定商品  □ 指定渠道  □ 指定时间范围                              │
│                                                                          │
│  [生成规则] [重新开始]                                                  │
└──────────────────────────────────────────────────────────────────────────┘
```
### 3.3 规则类型选择
用户可以通过下拉框或对话指定规则类型，系统根据类型自动过滤可用积分类型：
| 规则类型       | 可用积分类型（自动过滤）                 | 说明             |
| ---------- | ---------------------------- | -------------- |
| **积分累积规则** | `is_redeemable = true` 的积分类型 | 自动排除仅用于等级计算的积分 |
| **等级规则**   | `is_tier_calc = true` 的积分类型  | 只能使用成长值/等级分    |
***
## 四、系统上下文构建（System Prompt）
### 4.1 上下文数据来源
| 数据类型            | 来源                        | 用途            |
| --------------- | ------------------------- | ------------- |
| **业务实体 Schema** | `program_schema` 表        | 提供可用字段及其描述、类型 |
| **积分类型列表**      | `point_type_definition` 表 | 按规则类型过滤可用积分类型 |
| **等级定义**        | Program 配置                | 提供可用等级列表      |
| **运算符列表**       | 系统常量                      | 提供条件运算符       |
### 4.2 System Prompt 模板
```text
你是一个忠诚度管理系统的规则配置助手，帮助运营人员创建 Drools 规则。
## 可用数据模型
### 订单实体 (EventFact)
可用的字段及其描述：
- total_amount (订单实付金额，数值型)
- order_id (订单号，字符串)
- order_status (订单状态，枚举：TRADE_FINISHED, TRADE_REFUNDED...)
- items (商品列表，数组)
- channel (渠道，枚举：TMALL, JD, WECHAT, ...)
### 会员实体 (MemberFact)
可用的字段及其描述：
- tier_code (会员等级，枚举：BASE, SILVER, GOLD, PLATINUM)
- ext_attributes 中的扩展属性：
  - birthday (生日，日期型)
  - member_since (注册时间，日期型)
### 可用积分类型
当前 Program 可用的积分类型：
- REWARD (消费积分，可兑换)
- PREPAY_CREDIT (预售积分，可冲抵)
### 规则类型说明
- 积分累积规则：用于奖励用户积分，可使用 is_redeemable=true 的积分类型
- 等级规则：用于计算会员等级，可使用 is_tier_calc=true 的积分类型
## 输出格式
当信息完整时，输出标准 JSON：
{
  "ruleType": "积分累积规则",
  "ruleName": "规则名称",
  "description": "规则业务描述（中⽂，运营可读）",
  "conditions": [
    { "entity": "Order", "field": "total_amount", "operator": ">", "value": 100 },
    { "entity": "Member", "field": "tier_code", "operator": "==", "value": "GOLD" }
  ],
  "actions": [
    { "type": "awardPoints", "pointType": "REWARD", "amount": 10 }
  ],
  "status": "DRAFT",
  "drlContent": "生成的Drools DRL代码..."
}
当信息不完整时，输出：
{
  "status": "CLARIFYING",
  "message": "自然的澄清问题（中文）",
  "missingFields": [
    { "field": "触发条件", "description": "需要指定订单金额的门槛值", "type": "number" },
    { "field": "奖励积分", "description": "需要指定奖励的积分数量", "type": "number" }
  ]
}
## 约束
1. 规则名称自动生成，格式：[业务场景] + [奖励内容]
2. 字段描述优先使用中文业务术语，避免使用底层代码名
3. 如果用户指定的条件不合法，需友好提示
```
### 4.3 上下文组装（伪代码）
```java
@Service
public class RuleContextBuilder {
    public String buildSystemPrompt(String programCode, String ruleType) {
        // 1. 获取实体 Schema
        ProgramSchema memberSchema = schemaRepo.findByProgramCodeAndEntityType(programCode, "MEMBER");
        ProgramSchema eventSchema = schemaRepo.findByProgramCodeAndEntityType(programCode, "TRANSACTION_EVENT");
        
        // 2. 获取积分类型（根据规则类型过滤）
        List<PointTypeDefinition> pointTypes = pointTypeRepo.findByProgramCode(programCode);
        if ("积分累积规则".equals(ruleType)) {
            pointTypes = pointTypes.stream().filter(p -> p.isRedeemable()).collect();
        } else if ("等级规则".equals(ruleType)) {
            pointTypes = pointTypes.stream().filter(p -> p.isTierCalc()).collect();
        }
        
        // 3. 获取等级定义
        JSONArray tiers = programRepo.getTiers(programCode);
        
        // 4. 构建 Prompt
        return String.format(
            "你是一个忠诚度管理系统的规则配置助手...\n\n" +
            "## 会员实体字段\n%s\n" +
            "## 订单实体字段\n%s\n" +
            "## 可用积分类型\n%s\n" +
            "## 会员等级\n%s\n" +
            "## 输出格式\n%s",
            formatFields(memberSchema),
            formatFields(eventSchema),
            formatPointTypes(pointTypes),
            formatTiers(tiers),
            getOutputFormatTemplate()
        );
    }
}
```
***
## 五、对话状态管理
### 5.1 会话状态
```java
public class RuleConversationSession {
    private String sessionId;
    private String programCode;
    private String ruleType;              // 积分累积规则 / 等级规则
    private String userInput;
    private RuleContext ruleContext;      // 当前累积的结构化数据
    private String lastAIResponse;
    private List<ConversationTurn> history;
    private SessionStatus status;         // COLLECTING / CLARIFYING / READY / GENERATED
}
public class RuleContext {
    private String ruleName;
    private String description;
    private List<Condition> conditions;
    private List<Action> actions;
    private String pointType;              // 仅积分规则有效
    private String tierCalculationType;    // 仅等级规则有效
}
public class ConversationTurn {
    private String speaker;   // USER / AI
    private String content;
    private LocalDateTime timestamp;
}
```
### 5.2 处理流程
```java
@Service
public class RuleConversationService {
    @Autowired private ChatClient chatClient;
    @Autowired private RuleContextBuilder contextBuilder;
    
    public ConversationResponse processUserMessage(String sessionId, String userMessage) {
        // 1. 获取或创建会话
        RuleConversationSession session = sessionManager.getOrCreate(sessionId);
        
        // 2. 构建完整 Prompt
        String systemPrompt = contextBuilder.buildSystemPrompt(
            session.getProgramCode(), 
            session.getRuleType()
        );
        
        String conversationHistory = buildHistory(session);
        
        // 3. 调用大模型
        String response = chatClient.chat(systemPrompt, conversationHistory, userMessage);
        
        // 4. 解析响应
        ConversationResponse result = parseResponse(response);
        
        // 5. 更新会话状态
        session.addTurn("USER", userMessage);
        session.addTurn("AI", result.getMessage());
        
        if (result.getStatus() == "CLARIFYING") {
            session.setStatus(SessionStatus.CLARIFYING);
        } else if (result.getStatus() == "READY") {
            session.setRuleContext(result.getRuleContext());
            session.setStatus(SessionStatus.READY);
        }
        
        return result;
    }
}
```
***
## 六、规则生成
### 6.1 从对话到 DRL
```java
@Service
public class RuleGenerator {
    public RuleDefinition generateRule(RuleContext context, String programCode) {
        RuleDefinition rule = new RuleDefinition();
        rule.setProgramCode(programCode);
        rule.setRuleCode(generateRuleCode(context));
        rule.setRuleName(context.getRuleName());
        rule.setRuleType(convertRuleType(context.getRuleType()));
        rule.setRuleCategory("base");
        rule.setStatus("DRAFT");
        
        // 1. 构建 metadata（表单结构）
        JSONObject metadata = new JSONObject();
        metadata.put("ruleType", context.getRuleType());
        metadata.put("conditions", context.getConditions());
        metadata.put("actions", context.getActions());
        rule.setMetadata(metadata);
        
        // 2. 生成 DRL
        String drl = generateDrools(context, programCode);
        rule.setDrlContent(drl);
        
        return rule;
    }
    
    private String generateDrools(RuleContext context, String programCode) {
        StringBuilder drl = new StringBuilder();
        drl.append("import com.loyalty.platform.domain.rules.model.*;\n");
        drl.append("import com.loyalty.platform.domain.rules.engine.ActionCollector;\n\n");
        
        String ruleName = context.getRuleName().replaceAll("\\s+", "_");
        drl.append("rule \"").append(ruleName).append("\"\n");
        drl.append("when\n");
        
        // 生成条件
        for (Condition condition : context.getConditions()) {
            drl.append("    ").append(generateCondition(condition)).append("\n");
        }
        
        drl.append("then\n");
        for (Action action : context.getActions()) {
            drl.append("    ").append(generateAction(action)).append("\n");
        }
        drl.append("end\n");
        
        return drl.toString();
    }
}
```
### 6.2 字段映射与描述
系统需要维护字段名与业务描述的映射关系：
```sql
CREATE TABLE field_metadata (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    entity_type VARCHAR(64) NOT NULL,       -- MEMBER / TRANSACTION_EVENT / ORDER_ITEM
    field_name VARCHAR(64) NOT NULL,        -- 底层字段名
    field_label VARCHAR(128) NOT NULL,      -- 业务显示名称
    field_type VARCHAR(32) NOT NULL,        -- string / number / date / enum
    enum_values JSONB,                      -- 枚举值列表
    example_values JSONB,                   -- 示例值
    is_common BOOLEAN DEFAULT true,         -- 是否常用字段
    UNIQUE(program_code, entity_type, field_name)
);
```
大模型在生成规则时，使用 `field_label` 作为条件描述，用户看到的是“订单实付金额”而不是 `total_amount`。
***
## 七、API 接口设计
### 7.1 启动对话
```text
POST /api/rules/ai/start
{
  "programCode": "BRAND_A",
  "ruleType": "积分累积规则"  // 或 "等级规则"
}
响应：
{
  "sessionId": "sess_xxx",
  "message": "您好！我是规则配置助手。请告诉我您想配置什么样的规则？",
  "suggestions": [
    "订单金额超过100元送10积分",
    "黄金会员每消费1元得1.5倍积分",
    "首次购买送50积分"
  ]
}
```
### 7.2 继续对话
```text
POST /api/rules/ai/chat
{
  "sessionId": "sess_xxx",
  "message": "我想给订单金额超过100元的用户奖励10积分"
}
响应：
{
  "status": "CLARIFYING",  // 或 "READY"
  "message": "好的，我理解您想配置一个积分累积规则。请问是否需要限定会员等级？",
  "rulePreview": null,      // 当 status=READY 时返回
  "missingFields": [
    { "field": "会员等级", "description": "可选项，不限制则适用于全部会员" }
  ]
}
```
### 7.3 信息补充（填空题模式）
```text
POST /api/rules/ai/fill
{
  "sessionId": "sess_xxx",
  "fields": {
    "会员等级": "GOLD",
    "奖励积分": "20"
  }
}
响应：同 7.2
```
### 7.4 确认并保存
```text
POST /api/rules/ai/save
{
  "sessionId": "sess_xxx",
  "publish": false  // true=直接发布，false=保存为草稿
}
响应：
{
  "ruleId": "RULE_001",
  "ruleName": "订单满100送10积分（黄金会员专享）",
  "status": "DRAFT",
  "drlContent": "..."
}
```
***
## 八、前端组件设计
### 8.1 组件结构
```tsx
// AIRuleAssistant.tsx
import { useState } from 'react';
import { ChatPanel } from './ChatPanel';
import { RulePreview } from './RulePreview';
import { FillForm } from './FillForm';
export const AIRuleAssistant = () => {
  const [sessionId, setSessionId] = useState(null);
  const [ruleType, setRuleType] = useState('积分累积规则');
  const [messages, setMessages] = useState([]);
  const [showFillForm, setShowFillForm] = useState(false);
  const [missingFields, setMissingFields] = useState([]);
  
  const sendMessage = async (text: string) => {
    const response = await api.post('/rules/ai/chat', { sessionId, message: text });
    if (response.status === 'CLARIFYING') {
      // 切换到填空模式
      setShowFillForm(true);
      setMissingFields(response.missingFields);
    } else if (response.status === 'READY') {
      // 展示规则预览
      setRulePreview(response.rulePreview);
    }
  };
  
  return (
    <div className="ai-rule-assistant">
      <Toolbar ruleType={ruleType} setRuleType={setRuleType} />
      <div className="main-area">
        <ChatPanel messages={messages} onSend={sendMessage} />
        {showFillForm && (
          <FillForm fields={missingFields} onSubmit={handleFillSubmit} />
        )}
        <RulePreview preview={rulePreview} onSave={handleSave} />
      </div>
    </div>
  );
};
```
### 8.2 规则预览组件
```tsx
// RulePreview.tsx
const RulePreview = ({ preview, onSave }) => {
  if (!preview) return null;
  return (
    <div className="rule-preview">
      <div className="preview-header">
        <span className="badge">预览</span>
        <span className="status">{preview.status}</span>
      </div>
      
      <div className="preview-body">
        <div className="info-section">
          <label>规则名称</label>
          <div className="value">{preview.ruleName}</div>
        </div>
        <div className="info-section">
          <label>规则描述</label>
          <div className="value">{preview.description}</div>
        </div>
        <div className="info-section">
          <label>触发条件</label>
          <ul>
            {preview.conditions.map((c, i) => (
              <li key={i}>{c.displayText}</li>
            ))}
          </ul>
        </div>
        <div className="info-section">
          <label>奖励动作</label>
          <ul>
            {preview.actions.map((a, i) => (
              <li key={i}>{a.displayText}</li>
            ))}
          </ul>
        </div>
      </div>
      
      <div className="drl-section">
        <label>DRL 代码（参考）</label>
        <pre>{preview.drlContent}</pre>
      </div>
      
      <div className="actions">
        <button onClick={() => onSave(false)}>保存草稿</button>
        <button onClick={() => onSave(true)}>发布</button>
      </div>
    </div>
  );
};
```
***
## 九、与现有设计的集成
### 9.1 现有规则编辑器修改
在规则编辑页面增加“AI 助手”按钮：
```text
┌─ 规则编辑器 ─────────────────────────────────────────────────────────────┐
│ [基础信息] [规则脚本] [测试]    [AI 助手]  [保存] [发布]                │
│                                                                          │
│ 点击“AI 助手”后，右侧滑出对话面板，或切换至对话模式                     │
└──────────────────────────────────────────────────────────────────────────┘
```
### 9.2 与现有 AI 生成的关系
| 现有功能            | 新增功能                         | 关系              |
| --------------- | ---------------------------- | --------------- |
| AI 辅助规则生成（单次输入） | AI 对话式规则配置（多轮）               | **增强**，新增多轮对话能力 |
| 输入自然语言 → 输出 DRL | 输入自然语言 → 多轮澄清 → 输出规则预览 + DRL | 更完整的体验          |
| 无规则类型区分         | 区分积分规则和等级规则                  | **新增**规则类型自动识别  |
### 9.3 数据存储
生成规则仍存储在 `rule_definition` 表中，与现有规则兼容：
* `rule_type`：`DRL`（基础规则）或 `ACTIVITY_PROMO`（活动规则），AI 生成规则使用 `DRL`
* `metadata`：存储从对话中提取的结构化配置
* `drl_content`：生成的 DRL 代码
***
## 十、总结
本设计文档在现有规则引擎基础上，增加了基于大语言模型的对话式规则配置功能，核心要点：
| 能力         | 说明                                  |
| ---------- | ----------------------------------- |
| **自然语言理解** | 用户用业务语言描述需求，大模型自动理解并提取结构化信息         |
| **多轮对话**   | 信息不足时主动澄清，避免生成错误规则                  |
| **双模式交互**  | 支持对话式（Chat）和填空题式（Fill Form）两种信息采集方式 |
| **规则类型感知** | 自动识别积分规则和等级规则，并按类型过滤可用积分类型          |
| **业务友好展示** | 用户看到的是字段描述而非底层字段名，降低理解门槛            |
| **现有系统兼容** | 生成的规则存储格式与现有规则一致，无需额外迁移             |
您说得完全正确！**`program_schema` 表已经包含了字段定义，我新加的 `field_metadata` 表与现有设计确实存在重复。**
让我重新审视这个问题：
## 问题分析
### 现有 `program_schema` 表已包含的元数据
```sql
-- 主设计文档 v7.3 中的表结构
CREATE TABLE program_schema (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,         -- MEMBER / TRANSACTION_EVENT / API_ORDER_REQUEST
    version VARCHAR(16) NOT NULL,
    field_schema JSONB NOT NULL,              -- Formily 可消费的 JSON Schema
    entity_relations JSONB,                   -- 业务实体到系统实体的映射关系
    api_config JSONB,                         -- API 实体的路由和校验配置
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE (program_code, entity_type, version)
);
```
`field_schema` 中存储的是标准 JSON Schema，已经包含了：
* `properties`：字段名及类型定义
* `description`：字段描述
* `enum`：枚举值列表
* `type`：字段类型（string, number, integer, boolean, array, object）
### 正确的做法：复用 `program_schema`
**不应新建 `field_metadata` 表**，而是直接从 `program_schema.field_schema` 中提取字段信息。
```java
public class SchemaFieldExtractor {
    
    public List<FieldMetadata> extractFields(ProgramSchema schema) {
        JSONObject fieldSchema = schema.getFieldSchema();
        JSONObject properties = fieldSchema.getJSONObject("properties");
        
        List<FieldMetadata> fields = new ArrayList<>();
        for (String fieldName : properties.keySet()) {
            JSONObject fieldDef = properties.getJSONObject(fieldName);
            FieldMetadata meta = new FieldMetadata();
            meta.setFieldName(fieldName);
            meta.setFieldLabel(fieldDef.optString("description", fieldName));
            meta.setFieldType(fieldDef.optString("type"));
            
            // 提取枚举值
            if (fieldDef.has("enum")) {
                meta.setEnumValues(fieldDef.getJSONArray("enum"));
            }
            
            // 提取示例值
            if (fieldDef.has("examples") && fieldDef.getJSONArray("examples").length() > 0) {
                meta.setExampleValue(fieldDef.getJSONArray("examples").get(0));
            }
            
            fields.add(meta);
        }
        return fields;
    }
}
```
### 关于实体类型的澄清
| 实体类型                | 说明                                                        | 来源                                                        |
| ------------------- | --------------------------------------------------------- | --------------------------------------------------------- |
| `MEMBER`            | 会员实体，包含标准字段 + `ext_attributes`                            | `program_schema` 中 `entity_type='MEMBER'`                 |
| `TRANSACTION_EVENT` | 交易事件实体，包含 `payload` 字段结构                                  | `program_schema` 中 `entity_type='TRANSACTION_EVENT'`      |
| `ORDER_ITEM`        | **不需要单独存储**，它是 `TRANSACTION_EVENT.payload.items` 数组中的元素定义 | 从 `TRANSACTION_EVENT` 的 Schema 中解析 `items` 字段的 `items` 定义 |
### 修正后的设计
删除 `field_metadata` 表，从 `program_schema` 中动态提取字段信息用于大模型上下文构建。
**修正后的 System Prompt 构建伪代码**：
```java
@Service
public class RuleContextBuilder {
    
    @Autowired private ProgramSchemaRepository schemaRepo;
    
    public String buildSystemPrompt(String programCode) {
        // 1. 获取 Member Schema（包含 ext_attributes）
        ProgramSchema memberSchema = schemaRepo.findByProgramCodeAndEntityType(
            programCode, "MEMBER", "ACTIVE");
        
        // 2. 获取 TransactionEvent Schema（包含 payload）
        ProgramSchema eventSchema = schemaRepo.findByProgramCodeAndEntityType(
            programCode, "TRANSACTION_EVENT", "ACTIVE");
        
        // 3. 提取字段列表
        List<FieldMetadata> memberFields = extractFields(memberSchema);
        List<FieldMetadata> eventFields = extractFields(eventSchema);
        
        // 4. 构建 Prompt
        return buildPrompt(memberFields, eventFields);
    }
}
```
### 总结
| 对比    | 原设计（错误）                                       | 修正后                                  |
| ----- | --------------------------------------------- | ------------------------------------ |
| 字段来源  | 新建 `field_metadata` 表                         | 从 `program_schema.field_schema` 动态提取 |
| 数据一致性 | 需要额外同步维护                                      | 单一数据源，Schema 即元数据                    |
| 实体类型  | 硬编码 MEMBER / TRANSACTION\_EVENT / ORDER\_ITEM | 从 `program_schema.entity_type` 动态获取  |
**结论**：不需要新建 `field_metadata` 表，直接复用 `program_schema` 表即可。这样可以保持数据一致性，避免冗余维护。




# 规则引擎补充设计文档：AI 对话式规则配置
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：1.1\
> **更新说明**：优化用户交互体验，包括澄清问题的业务化表达与流式输出支持
***
## 一、澄清问题的业务化表达
### 1.1 问题分析
用户反馈的核心问题是：**大模型提出的澄清问题（如“触发条件的具体数值是多少？”）对运营人员来说太难理解。**
| 问题           | 原因                  | 解决方案        |
| ------------ | ------------------- | ----------- |
| “触发条件的具体数值”  | 运营人员不熟悉“触发条件”这个技术术语 | 使用业务场景化语言提问 |
| “是否需要限制会员等级” | 用户可能不知道等级配置在哪里      | 给出选项而非开放式提问 |
| “请输入字段名称”    | 用户不知道字段名是什么         | 展示业务字段描述和示例 |
### 1.2 改进后的澄清方式
#### 对比示例
| 改造前               | 改造后                                              |
| ----------------- | ------------------------------------------------ |
| ❌ “触发条件的具体数值是多少？” | ✅ “您希望订单金额达到多少元以上才赠送积分？（例如：满100元）”               |
| ❌ “是否需要限制会员等级？”   | ✅ “本次活动是否只针对特定等级的会员？请选择：① 全部会员 ② 仅黄金及以上 ③ 仅铂金会员” |
| ❌ “请指定奖励积分数值”     | ✅ “每满足一次条件，您希望奖励多少积分？（例如：10分）”                   |
### 1.3 Prompt 优化
在 System Prompt 中增加澄清问题的表达规范：
```text
## 澄清问题规范
当需要向用户补充信息时，请遵循以下规范：
1. **使用业务语言**：避免使用“触发条件”“实体”“字段”等技术术语，使用“什么情况下触发”“针对哪些商品”等业务表达。
2. **提供具体示例**：在问题后附上示例答案，帮助用户理解期望的输入格式。
3. **给出选项**：对于有明确枚举值的问题（如会员等级、渠道等），直接提供可选项列表。
4. **一次只问一个问题**：避免一次性提出多个问题造成用户认知负担。
5. **告知当前配置状态**：如果用户已提供部分信息，在问题前简要复述，让用户了解上下文。
### 澄清问题模板
- 数值型：“您希望 [业务场景描述] 达到多少 [单位]？（例如：[示例值]）”
- 枚举型：“请选择适用的 [业务对象]：① [选项1] ② [选项2] ③ [选项3]”
- 是否型：“是否要求 [业务条件描述]？（如是，请选择 [选项列表]）”
```
### 1.4 多轮对话中的上下文保持
json
```
{
  "status": "CLARIFYING",
  "message": "您希望订单金额达到多少元以上才赠送积分？（例如：满100元）",
  "context": {
    "已理解内容": "购买指定产品，实付金额多倍积分",
    "已确认信息": "活动时间：6月底"
  },
  "suggestions": [
    "满100元送2倍积分",
    "满200元送3倍积分",
    "自定义金额"
  ]
}
```
### 1.5 信息补充页面优化
将抽象的技术问题转换为填空/选择题，采用自然语言问句 + 输入控件的形式。对于不同类型的变量，自动生成对应的控件：
| 变量类型     | 示例问题                | 控件            |
| -------- | ------------------- | ------------- |
| **金额**   | “订单金额达到多少元？（如：100）” | 数字输入框 + 单位“元” |
| **积分倍数** | “赠送多少倍积分？（如：2倍）”    | 数字输入框 + 单位“倍” |
| **枚举**   | “哪些会员等级可以参与？可多选”    | 多选下拉 + 可选项列表  |
| **商品**   | “哪些商品参与活动？可多选”      | 搜索+多选下拉       |
| **时间**   | “活动持续到哪一天？”         | 日期选择器         |
***
## 二、流式输出
### 2.1 设计目标
* **用户体验**：大模型响应较长（5-10秒），流式输出让用户实时看到内容生成，避免等待焦虑
* **技术实现**：前端使用 SSE（Server-Sent Events）或 WebSocket，后端逐字/逐句推送
### 2.2 前后端通信协议
#### 请求
```text
POST /api/rules/ai/stream
Content-Type: application/json
{
  "sessionId": "sess_xxx",
  "message": "我想配置一个618活动，购买指定商品双倍积分",
  "stream": true
}
```
#### 响应（SSE 流式）
```text
event: chunk
data: {"type": "thinking", "content": "正在理解您的需求..."}
event: chunk
data: {"type": "text", "content": "收到"}
event: chunk
data: {"type": "text", "content": "您的"}
event: chunk
data: {"type": "text", "content": "需求"}
event: chunk
data: {"type": "clarifying", "content": "您希望哪些商品参与本次活动？请选择商品分类或指定具体SKU。"}
event: done
data: {"type": "done"}
```
### 2.3 消息类型
| 类型           | 用途         | 前端表现          |
| ------------ | ---------- | ------------- |
| `thinking`   | 展示处理状态     | 显示“正在分析...”动画 |
| `text`       | 完整回答内容（流式） | 逐字/逐句追加显示     |
| `clarifying` | 澄清问题       | 显示问题 + 选项/输入框 |
| `preview`    | 规则预览       | 渲染规则预览卡片      |
| `done`       | 流结束        | 移除 loading 状态 |
### 2.4 前端伪代码
```tsx
// useRuleChat.ts
const useRuleChat = () => {
  const [messages, setMessages] = useState([]);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const sendMessage = async (text: string) => {
    setIsStreaming(true);
    const response = await fetch('/api/rules/ai/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text })
    });
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let currentMessage = { role: 'assistant', content: '', type: 'text' };
    let fullContent = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const events = chunk.split('\n\n');
      
      for (const event of events) {
        if (!event.startsWith('event: ')) continue;
        const lines = event.split('\n');
        const eventType = lines[0].replace('event: ', '');
        const data = JSON.parse(lines[1].replace('data: ', ''));
        
        if (eventType === 'chunk') {
          if (data.type === 'text') {
            fullContent += data.content;
            // 更新 UI：追加文本
            updateMessage(fullContent);
          } else if (data.type === 'clarifying') {
            // 显示澄清问题 + 选项
            showClarification(data.content, data.options);
          } else if (data.type === 'preview') {
            // 显示规则预览
            showRulePreview(data.content);
          }
        } else if (eventType === 'done') {
          setIsStreaming(false);
        }
      }
    }
  };
  
  return { messages, isStreaming, sendMessage };
};
```
### 2.5 后端流式处理
```java
@RestController
public class RuleAIController {
    
    @PostMapping("/api/rules/ai/stream")
    public SseEmitter streamChat(@RequestBody ChatRequest request) {
        SseEmitter emitter = new SseEmitter(60000L);
        
        // 异步处理
        CompletableFuture.runAsync(() -> {
            try {
                // 1. 发送思考状态
                emitter.send(SseEmitter.event()
                    .name("chunk")
                    .data(Map.of("type", "thinking", "content", "正在理解您的需求...")));
                
                // 2. 调用大模型（流式）
                String sessionId = request.getSessionId();
                String userMessage = request.getMessage();
                
                // 模拟流式输出
                String fullResponse = chatService.streamChat(sessionId, userMessage, 
                    chunk -> {
                        try {
                            emitter.send(SseEmitter.event()
                                .name("chunk")
                                .data(Map.of("type", "text", "content", chunk)));
                        } catch (IOException e) {
                            // 处理发送异常
                        }
                    }
                );
                
                // 3. 解析响应，判断是否需要澄清
                if (isClarifying(fullResponse)) {
                    emitter.send(SseEmitter.event()
                        .name("chunk")
                        .data(Map.of("type", "clarifying", 
                                     "content", extractQuestion(fullResponse),
                                     "options", extractOptions(fullResponse))));
                } else if (isReady(fullResponse)) {
                    emitter.send(SseEmitter.event()
                        .name("chunk")
                        .data(Map.of("type", "preview", 
                                     "content", extractRulePreview(fullResponse))));
                }
                
                // 4. 完成
                emitter.send(SseEmitter.event().name("done").data(""));
                emitter.complete();
                
            } catch (Exception e) {
                emitter.completeWithError(e);
            }
        });
        
        return emitter;
    }
}
```
***
## 三、界面设计更新
### 3.1 对话区域增加流式输出效果
```text
┌─ AI 规则助手 ──────────────────────────────────────────────────────────┐
│ 规则类型：[积分累积规则 ▼]  状态：● 草稿   [保存] [发布] [清空]       │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  💬 对话区域                                                    │   │
│  │                                                                  │   │
│  │  🤖 您好！我是规则配置助手。请告诉我您想配置什么样的规则？      │   │
│  │     例如：                                                       │   │
│  │     · “618活动，指定商品双倍积分”                              │   │
│  │     · “会员生日当天消费送3倍积分”                              │   │
│  │                                                                  │   │
│  │  👤 618活动，购买指定商品双倍积分                              │   │
│  │                                                                  │   │
│  │  🤖 ┌─────────────────────────────────────────────────────┐    │   │
│  │  │  ⏳ 正在分析您的需求...                                 │    │   │
│  │  └─────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  │  🤖 收到您的需求。请补充以下信息：                            │   │
│  │                                                                  │   │
│  │     您希望订单金额达到多少元以上才赠送积分？                    │   │
│  │     ┌─────────────────────────────────────────────┐            │   │
│  │     │  例如：满100元                              │            │   │
│  │     └─────────────────────────────────────────────┘            │   │
│  │     [ 100 ] 元  [确定]                                        │   │
│  │                                                                  │   │
│  │  👤 100                                                         │   │
│  │                                                                  │   │
│  │  🤖 哪些商品参与本次活动？                                    │   │
│  │     ┌─────────────────────────────────────────────────────┐    │   │
│  │     │  [SKU001] [SKU002] [SKU003]  [搜索商品...]        │    │   │
│  │     └─────────────────────────────────────────────────────┘    │   │
│  │                                                                  │   │
│  │  [输入框] [发送]                                                │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```
### 3.2 规则类型选择与积分类型过滤
在对话开始前，用户选择规则类型，系统自动构建对应的上下文：
| 规则类型       | 可用字段          | 可用积分类型                                                 |
| ---------- | ------------- | ------------------------------------------------------ |
| **积分累积规则** | 订单字段 + 会员字段   | `is_redeemable = true` 的积分类型（如 REWARD, PREPAY\_CREDIT） |
| **等级规则**   | 会员字段 + 等级相关字段 | `is_tier_calc = true` 的积分类型（如 TIER）                    |
### 3.3 规则预览（业务语言 + DRL）
```text
┌─ 规则预览 ──────────────────────────────────────────────────────────────┐
│  📋 规则业务描述                                                       │
│  ──────────────────────────────────────────────────────────────────────  │
│  规则名称：618指定商品双倍积分                                          │
│  触发条件：                                                            │
│    1. 订单实付金额 ≥ 100 元                                            │
│    2. 订单包含商品 SKU001 或 SKU002                                   │
│  奖励动作：                                                            │
│    发放 2倍 消费积分（REWARD）                                         │
│  适用等级：全部会员                                                    │
│  生效时间：2026-06-01 ~ 2026-06-30                                    │
│  ──────────────────────────────────────────────────────────────────────  │
│  💻 DRL 代码                                                           │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ rule "618_PROMO_SPECIAL_SKU"                                    │   │
│  │ when                                                             │   │
│  │     $event: EventFact(eventType == "ORDER",                     │   │
│  │               getPayloadNumber("total_amount") >= 100)          │   │
│  │     eval( $event.hasAnySku(["SKU001", "SKU002"]) )             │   │
│  │     $member: MemberFact(memberId == $event.memberId)            │   │
│  │ then                                                             │   │
│  │     ActionCollector.get().awardPoints(                          │   │
│  │         $event.getEventId(),                                    │   │
│  │         $event.getPayloadNumber("total_amount") * 2,            │   │
│  │         "REWARD",                                               │   │
│  │         "618_PROMO_SPECIAL_SKU"                                 │   │
│  │     ).execute(drools);                                          │   │
│  │ end                                                              │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  [修改] [保存草稿] [发布]                                               │
└──────────────────────────────────────────────────────────────────────────┘
```
***
## 四、API 接口更新
### 4.1 流式对话接口
```text
POST /api/rules/ai/stream
请求：
{
  "sessionId": "sess_xxx",
  "message": "618活动，指定商品双倍积分",
  "ruleType": "积分累积规则"
}
响应：SSE 流式
```
### 4.2 普通对话接口（保留）
```text
POST /api/rules/ai/chat
请求：
{
  "sessionId": "sess_xxx",
  "message": "只限黄金会员"
}
响应：
{
  "status": "READY",
  "message": "已更新规则，请确认。",
  "rulePreview": { ... }
}
```
### 4.3 提交补充信息
```text
POST /api/rules/ai/fill
请求：
{
  "sessionId": "sess_xxx",
  "fields": {
    "min_order_amount": 100,
    "skus": ["SKU001", "SKU002"]
  }
}
响应：同普通对话接口
```
***
## 五、总结
| 改进点      | 改造前           | 改造后                |
| -------- | ------------- | ------------------ |
| **澄清问题** | 技术化表达，用户看不懂   | 业务化表达 + 示例 + 选项列表  |
| **交互方式** | 纯文本对话         | 对话 + 填空题 + 选择题混合模式 |
| **响应速度** | 等待完整响应（5-10秒） | 流式输出，实时反馈          |
| **规则预览** | 仅 DRL 代码      | 业务描述 + DRL 代码双展示   |
| **规则类型** | 用户手动选         | 自动识别并过滤可用积分类型      |
| **字段理解** | 看到底层字段名       | 看到业务显示名称 + 示例值     |
