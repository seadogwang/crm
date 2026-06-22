# 规则引擎补充设计文档：AI 对话式规则配置 V2
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **版本**：2.0
> **更新说明**：基于实测反馈，优化交互方式：澄清问题集中呈现为表单、字典数据前端渲染为可选择组件、时间维度明确化
***
## 一、问题分析与设计原则
### 1.1 实测问题汇总
| 问题          | 具体表现                                       | 根本原因                  |
| ----------- | ------------------------------------------ | --------------------- |
| **时间语义模糊**  | AI只问开始时间，没问结束时间；没区分“系统时间”与“订单时间（下单/付款/签收）” | Prompt 未明确时间维度的完整性和语义 |
| **字典数据无控件** | 提示“请输入商品编号”，但用户不知道有哪些商品可选                  | 前端未介入，仅靠文本对话无法提供选择能力  |
| **多轮效率低**   | 一个问题问完再问下一个，用户需反复响应                        | 未采用“批量收集”模式           |
| **用户输出质量差** | 用户不知道填什么格式、什么内容                            | 缺少结构化表单引导             |
### 1.2 设计原则
| 原则          | 说明                                     |
| ----------- | -------------------------------------- |
| **表单化收集**   | 当需要用户补充多项信息时，一次性生成结构化表单，而非逐条提问         |
| **字典数据控件化** | 商品、品类、等级等字典数据，前端通过 API 获取并渲染为下拉/搜索选择器  |
| **时间语义明确**  | 规则时间必须明确：是活动生效时间（系统判断）还是订单时间（下单/付款/签收） |
| **混合交互模式**  | 对话（自然语言理解）+ 表单（结构化收集）混合，各取所长           |
***
## 二、交互流程
### 2.1 整体流程
```text
用户输入需求
       │
       ▼
┌──────────────────────────────────────────────┐
│ Step 1: 大模型理解需求，提取结构化信息        │
│ - 识别规则类型、触发条件、奖励动作            │
│ - 识别已提供的信息和缺失的信息                │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Step 2: 如果信息不完整 → 生成澄清表单         │
│ - 所有缺失字段合并为一个结构化表单            │
│ - 字典字段（商品、品类、等级）前端渲染为选择器 │
│ - 时间字段明确时间语义（下单/付款/签收）      │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Step 3: 用户填写表单并提交                    │
│ - 前端收集所有字段值                         │
│ - 提交给后端，大模型生成最终规则             │
└──────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────┐
│ Step 4: 规则预览与确认                       │
│ - 展示完整的业务规则描述 + DRL              │
└──────────────────────────────────────────────┘
```
### 2.2 对话 + 表单混合模式示意
```text
┌─ AI 规则助手 ──────────────────────────────────────────────────────────┐
│ 规则类型：[积分累积规则 ▼]  状态：● 草稿   [保存] [发布] [清空]       │
├──────────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  💬 对话区域                                                    │   │
│  │                                                                  │   │
│  │  🤖 您好！请描述您想配置的规则：                                │   │
│  │                                                                  │   │
│  │  👤 6月底做一场积分活动，指定商品多倍积分                      │   │
│  │                                                                  │   │
│  │  🤖 收到需求。请填写以下信息完成规则配置：                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌─ 📋 请完善以下信息 ───────────────────────────────────────────────┐ │
│  │                                                                  │   │
│  │  活动名称 *                                                      │   │
│  │  [ 618年中大促多倍积分活动                    ]                   │   │
│  │                                                                  │   │
│  │  活动时间 *                                                      │   │
│  │  开始：[2026-06-20 00:00]  结束：[2026-06-30 23:59]             │   │
│  │  时间基准：[下单时间 ▼]   (下单时间 / 付款时间 / 签收时间)     │   │
│  │                                                                  │   │
│  │  指定商品 *                                                      │   │
│  │  [  搜索商品...  ]  [品类筛选 ▼]                                 │   │
│  │  已选：SKU001 商品A  |  SKU002 商品B  |  +                     │   │
│  │                                                                  │   │
│  │  限制会员等级                                                    │   │
│  │  [全部会员 ▼]   (全部会员 / 黄金及以上 / 铂金及以上)            │   │
│  │                                                                  │   │
│  │  积分规则 *                                                      │   │
│  │  实付金额每满 [100] 元，赠送 [2] 倍积分                         │   │
│  │  积分类型：[消费积分 ▼]                                          │   │
│  │                                                                  │   │
│  │  ───────────── 可选条件 ─────────────                            │   │
│  │  □ 限制渠道：[天猫] [京东] [抖音]                                │   │
│  │  □ 指定支付方式：[支付宝] [微信]                                 │   │
│  │                                                                  │   │
│  │  [生成规则]  [重新填写]                                          │   │
│  └──────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```
***
## 三、澄清表单的生成与渲染
### 3.1 大模型输出的澄清表单结构
当大模型判断信息不完整时，输出一个结构化的 `formSchema`，前端根据此 Schema 渲染表单。
```json
{
  "status": "CLARIFYING",
  "message": "请填写以下信息完成规则配置：",
  "formSchema": {
    "sections": [
      {
        "id": "basic_info",
        "title": "基本信息",
        "fields": [
          {
            "id": "rule_name",
            "label": "活动名称",
            "type": "text",
            "placeholder": "例如：618年中大促多倍积分",
            "required": true,
            "value": "618年中大促多倍积分活动"
          },
          {
            "id": "rule_description",
            "label": "活动描述",
            "type": "textarea",
            "placeholder": "简要描述活动内容",
            "required": false
          }
        ]
      },
      {
        "id": "time_config",
        "title": "活动时间",
        "fields": [
          {
            "id": "time_range",
            "label": "活动时间范围",
            "type": "datetime_range",
            "required": true,
            "value": { "start": "2026-06-20T00:00:00Z", "end": "2026-06-30T23:59:59Z" }
          },
          {
            "id": "time_basis",
            "label": "时间基准（用于判断订单是否在活动期内）",
            "type": "select",
            "required": true,
            "options": [
              { "value": "created_at", "label": "下单时间" },
              { "value": "paid_at", "label": "付款时间" },
              { "value": "completed_at", "label": "签收/完成时间" }
            ],
            "value": "paid_at",
            "help": "选择以哪个时间点判断订单是否在活动期间内"
          }
        ]
      },
      {
        "id": "condition",
        "title": "触发条件",
        "fields": [
          {
            "id": "min_order_amount",
            "label": "实付金额门槛",
            "type": "number",
            "placeholder": "例如：100",
            "required": true,
            "unit": "元",
            "value": 100
          },
          {
            "id": "applicable_scope",
            "label": "适用商品",
            "type": "sku_selector",
            "required": true,
            "help": "选择参与活动的商品（可搜索、多选）",
            "value": ["SKU001", "SKU002"]
          },
          {
            "id": "applicable_categories",
            "label": "适用商品品类",
            "type": "category_selector",
            "required": false,
            "help": "选择品类后，该品类下所有商品自动参与"
          }
        ]
      },
      {
        "id": "reward",
        "title": "奖励设置",
        "fields": [
          {
            "id": "point_type",
            "label": "积分类型",
            "type": "select",
            "required": true,
            "options": [
              { "value": "REWARD", "label": "消费积分" },
              { "value": "PREPAY_CREDIT", "label": "预售积分" }
            ],
            "value": "REWARD"
          },
          {
            "id": "reward_multiplier",
            "label": "奖励倍数",
            "type": "number",
            "placeholder": "例如：2 表示2倍积分",
            "required": true,
            "unit": "倍",
            "value": 2
          },
          {
            "id": "per_amount_unit",
            "label": "每满多少元赠送",
            "type": "number",
            "placeholder": "例如：100",
            "required": true,
            "unit": "元",
            "value": 100
          }
        ]
      },
      {
        "id": "restrictions",
        "title": "可选限制条件",
        "fields": [
          {
            "id": "tier_restriction",
            "label": "会员等级限制",
            "type": "select",
            "required": false,
            "options": [
              { "value": "ALL", "label": "全部会员" },
              { "value": "GOLD_ABOVE", "label": "黄金及以上" },
              { "value": "PLATINUM_ONLY", "label": "仅铂金会员" }
            ],
            "value": "ALL"
          },
          {
            "id": "channels",
            "label": "限制渠道",
            "type": "multi_select",
            "required": false,
            "options": [
              { "value": "TMALL", "label": "天猫" },
              { "value": "JD", "label": "京东" },
              { "value": "DOUYIN", "label": "抖音" },
              { "value": "WECHAT", "label": "微信" }
            ]
          }
        ]
      }
    ]
  }
}
```
### 3.2 前端表单渲染器（伪代码）
```tsx
// ClarificationForm.tsx
interface FieldSchema {
  id: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'select' | 'multi_select' | 
        'datetime_range' | 'sku_selector' | 'category_selector';
  required: boolean;
  placeholder?: string;
  options?: { value: string; label: string }[];
  value?: any;
  unit?: string;
  help?: string;
}
const ClarificationForm = ({ schema, onSubmit }) => {
  const [formData, setFormData] = useState({});
  
  const renderField = (field: FieldSchema) => {
    switch (field.type) {
      case 'text':
        return <Input value={formData[field.id]} onChange={...} />;
      
      case 'datetime_range':
        return <DateTimeRangePicker value={formData[field.id]} onChange={...} />;
      
      case 'select':
        return <Select options={field.options} value={formData[field.id]} onChange={...} />;
      
      case 'multi_select':
        return <Select mode="multiple" options={field.options} ... />;
      
      case 'sku_selector':
        // 调用商品搜索 API，返回可搜索多选组件
        return <SkuSelector 
          value={formData[field.id]} 
          onChange={...}
          apiUrl="/api/products/search"
        />;
      
      case 'category_selector':
        // 调用品类列表 API，返回多选树组件
        return <CategorySelector 
          value={formData[field.id]} 
          onChange={...}
          apiUrl="/api/categories/tree"
        />;
      
      default:
        return null;
    }
  };
  
  return (
    <div className="clarification-form">
      {schema.sections.map(section => (
        <Section key={section.id} title={section.title}>
          {section.fields.map(field => (
            <FormItem key={field.id} label={field.label} required={field.required}>
              {renderField(field)}
              {field.unit && <span className="unit">{field.unit}</span>}
              {field.help && <span className="help">{field.help}</span>}
            </FormItem>
          ))}
        </Section>
      ))}
      <Button onClick={() => onSubmit(formData)}>生成规则</Button>
    </div>
  );
};
```
### 3.3 字典数据 API
| 接口                                 | 用途               | 返回               |
| ---------------------------------- | ---------------- | ---------------- |
| `/api/products/search?keyword=xxx` | 搜索商品（用于 SKU 选择器） | SKU 列表 + 名称 + 分类 |
| `/api/categories/tree`             | 获取品类树            | 品类树（带层级）         |
| `/api/members/tiers`               | 获取可用等级列表         | 等级代码 + 名称        |
| `/api/channels/list`               | 获取渠道列表           | 渠道代码 + 名称        |
| `/api/point-types?redeemable=true` | 获取可兑换积分类型        | 积分类型列表           |
***
## 四、时间语义设计
### 4.1 问题背景
规则的有效期判断存在多种时间基准：
| 时间基准     | 说明        | 适用场景      |
| -------- | --------- | --------- |
| **下单时间** | 用户提交订单的时间 | 预售活动、限时抢购 |
| **付款时间** | 用户完成支付的时间 | 大多数常规活动   |
| **签收时间** | 用户确认收货的时间 | 售后活动、评价激励 |
### 4.2 设计变更
在 `rule_definition` 表中增加时间基准字段：
sql
```
-- 新增时间基准字段
ALTER TABLE rule_definition ADD COLUMN time_basis VARCHAR(20) DEFAULT 'paid_at';
COMMENT ON COLUMN rule_definition.time_basis IS '规则生效时间基准：created_at(下单时间) / paid_at(付款时间) / completed_at(签收时间)';
-- 优化查询：活动有效期判断时使用指定的时间字段
CREATE INDEX idx_rule_effective ON rule_definition(program_code, status, effective_start, effective_end, time_basis);
```
### 4.3 DRL 生成中的时间判断
```java
public String generateTimeCondition(String timeBasis) {
    switch (timeBasis) {
        case "created_at":
            return "getPayloadDateTime("created_at")";
        case "paid_at":
            return "getPayloadDateTime("paid_at")";
        case "completed_at":
            return "getPayloadDateTime("completed_at")";
        default:
            return "getPayloadDateTime("paid_at")";
    }
}
```
生成的 DRL 示例：
```drools
rule "618_PROMO"
when
    $event: EventFact(
        eventType == "ORDER",
        // 使用付款时间判断是否在活动期内
        getPayloadDateTime("paid_at") >= effective_start,
        getPayloadDateTime("paid_at") <= effective_end
    )
    ...
then
    ...
end
```
***
## 五、交互流程对比
| 对比项        | V1（纯对话）  | V2（对话+表单混合） |
| ---------- | -------- | ----------- |
| **信息收集方式** | 逐条提问     | 一次性生成结构化表单  |
| **用户操作**   | 打字回复     | 选择/填写/搜索    |
| **字典数据**   | 纯文本提示    | 可搜索/选择控件    |
| **时间语义**   | 容易遗漏     | 强制选择时间基准    |
| **输入质量**   | 参差不齐     | 格式规范        |
| **效率**     | 多轮耗时     | 一次填写完成      |
| **学习成本**   | 高（需理解问题） | 低（填表即可）     |
***
## 六、API 接口更新
### 6.1 启动对话（返回表单 Schema）
```text
POST /api/rules/ai/start
请求：
{
  "programCode": "BRAND_A",
  "ruleType": "积分累积规则",
  "initialMessage": "6月底做一场积分活动，指定商品多倍积分"
}
响应：
{
  "sessionId": "sess_xxx",
  "status": "CLARIFYING",
  "message": "请填写以下信息完成规则配置：",
  "formSchema": { ... },  // 详见第 3.1 节
  "dictData": {           // 预加载的字典数据，用于前端渲染
    "pointTypes": [...],
    "tiers": [...],
    "channels": [...]
  }
}
```
### 6.2 提交表单
```text
POST /api/rules/ai/submit-form
请求：
{
  "sessionId": "sess_xxx",
  "formData": {
    "rule_name": "618年中大促多倍积分",
    "time_range": { "start": "2026-06-20T00:00:00Z", "end": "2026-06-30T23:59:59Z" },
    "time_basis": "paid_at",
    "min_order_amount": 100,
    "sku_list": ["SKU001", "SKU002"],
    "point_type": "REWARD",
    "reward_multiplier": 2,
    "per_amount_unit": 100,
    "tier_restriction": "ALL"
  }
}
响应：
{
  "status": "READY",
  "rulePreview": {
    "ruleName": "618年中大促多倍积分",
    "description": "2026-06-20 00:00 至 2026-06-30 23:59 期间，购买指定商品（SKU001、SKU002）且实付金额≥100元，可获得2倍消费积分。适用全部会员。",
    "drlContent": "..."
  }
}
```
***
## 七、总结
| 改进点  | V1    | V2                |
| ---- | ----- | ----------------- |
| 澄清方式 | 逐条提问  | **结构化表单，一次性收集**   |
| 字典数据 | 纯文本提示 | **可搜索/可选择控件**     |
| 时间语义 | 容易遗漏  | **强制选择时间基准**      |
| 用户输入 | 自由文本  | **表单 + 选择器，格式规范** |
| 效率   | 多轮反复  | **一轮填写完成**        |
| 交互模式 | 纯对话   | **对话 + 表单混合**     |
