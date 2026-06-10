# 积分活动规则引擎设计文档（最终完整版）
> **版本**：3.2
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **设计原则**：
>
> * 所有促销活动（固定倍数、阶梯循环、SKU/品类定向、生命周期里程碑）使用**统一配置界面**。
>
> * 触发条件基于**业务实体选择**，实体属性从现有 `program_schema` 表读取，属性类型决定UI控件。
>
> * 规则包含**有效期**（开始/结束时间）和**规则组**（用于优先级排序）。
>
> * 奖励计算统一使用**阶梯表格**，支持单次匹配或循环扣除，支持累计上限及超限策略。
>
> * 生命周期里程碑作为**虚拟条件**处理，不新增表。
>
> * **基础规则**与**活动规则**通过 `rule_category` 字段区分，前端分Tab展示。
***
## 一、数据库变更
### 1.1 修改 `rule_definition` 表

```sql
-- 1. 重命名 agenda_group 为 rule_category
ALTER TABLE rule_definition RENAME COLUMN agenda_group TO rule_category;
-- 2. 修改注释和默认值
COMMENT ON COLUMN rule_definition.rule_category IS '规则分类：base=基础规则，promo=促销活动';
ALTER TABLE rule_definition ALTER COLUMN rule_category SET DEFAULT 'base';
-- 3. 扩展 rule_type 长度
ALTER TABLE rule_definition ALTER COLUMN rule_type TYPE VARCHAR(30);
-- 4. 确保 metadata 为 JSONB（如不是则转换）
ALTER TABLE rule_definition ALTER COLUMN metadata TYPE JSONB USING metadata::jsonb;
-- 5. 新增 rule_group 字段（用于同一组内优先级排序）
ALTER TABLE rule_definition ADD COLUMN rule_group VARCHAR(50);
COMMENT ON COLUMN rule_definition.rule_group IS '规则组，同组内按 priority 排序执行';
ALTER TABLE rule_definition ADD COLUMN priority INT DEFAULT 0;
COMMENT ON COLUMN rule_definition.priority IS '组内优先级，数字越小越先执行';
-- 6. 新增有效时间字段（冗余便于查询）
ALTER TABLE rule_definition ADD COLUMN effective_start TIMESTAMPTZ;
ALTER TABLE rule_definition ADD COLUMN effective_end TIMESTAMPTZ;
```
### 1.2 新增会员活动累计状态表

```sql
CREATE TABLE member_activity_state (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    rule_code VARCHAR(64) NOT NULL,
    total_rewarded NUMERIC(18,4) DEFAULT 0,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, member_id, rule_code)
);
CREATE INDEX idx_mas_member ON member_activity_state(program_code, member_id);
CREATE INDEX idx_mas_rule ON member_activity_state(program_code, rule_code);
```
### 1.3 复用现有 `program_schema` 表
* 前端通过现有 Schema API (`/api/admin/schemas/{entityType}/current`) 获取实体属性列表及类型。
* 订单属性：`TransactionEvent` 的 payload 字段 Schema（`entity_type='TRANSACTION_EVENT'`）。
* 会员属性：`Member` 的标准属性 + `ext_attributes` 动态属性（`entity_type='MEMBER'`）。
* 订单明细属性：系统预定义，如 `sku`, `category_id`, `price`, `quantity` 等。
***
## 二、枚举值定义
| 枚举名              | 值                                                                 | 说明               |
| ---------------- | ----------------------------------------------------------------- | ---------------- |
| `rule_type`      | `DRL`                                                             | 基础规则（手写/AI生成）    |
|                  | `ACTIVITY_PROMO`                                                  | 所有促销活动           |
| `rule_category`  | `base`                                                            | 基础规则（Tab 1）      |
|                  | `promo`                                                           | 活动规则（Tab 2）      |
| `status`         | `DRAFT`                                                           | 草稿               |
|                  | `ACTIVE`                                                          | 已发布              |
|                  | `INACTIVE`                                                        | 已停用              |
| `cycleMode`      | `SINGLE_MATCH`                                                    | 单次匹配（不循环）        |
|                  | `THRESHOLD_LOOP`                                                  | 循环扣除             |
| `remainderMode`  | `USE_STEP_MULTIPLIER`                                             | 剩余金额按阶梯倍数        |
|                  | `FIXED_MULTIPLIER`                                                | 固定倍数             |
| `excessStrategy` | `STOP`                                                            | 停止赠送             |
|                  | `RATIO`                                                           | 按比例缩放            |
|                  | `TRUNCATE_AND_DOWNGRADE`                                          | 截断降级             |
| 运算符              | `EQ`, `NE`, `GT`, `LT`, `GTE`, `LTE`, `BETWEEN`, `IN`, `CONTAINS` | 条件比较符            |
| 属性类型             | `NUMBER`, `STRING`, `DATE`, `ENUM`, `BOOLEAN`, `LIFECYCLE`        | 从 Schema 推断或系统定义 |
***
## 三、`metadata` JSON 结构（统一）
### 3.1 完整示例

```json
{
  "entity_conditions": [
    {
      "entity": "Order",
      "attribute": "total_amount",
      "operator": "BETWEEN",
      "value": { "min": 100, "max": null }
    },
    {
      "entity": "Member",
      "attribute": "tier_code",
      "operator": "IN",
      "value": ["GOLD", "PLATINUM"]
    },
    {
      "entity": "OrderItem",
      "attribute": "sku",
      "operator": "IN",
      "value": ["SKU001", "SKU002"]
    },
    {
      "entity": "Member",
      "attribute": "lifecycle_milestone",
      "operator": "EQ",
      "value": "FIRST_ORDER_IN_BIRTHDAY_MONTH"
    }
  ],
  "effective_time_range": {
    "start": "2026-01-01T00:00:00Z",
    "end": null
  },
  "reward": {
    "steps": [
      { "lower": 0, "upper": 1000, "multiplier": 0.5, "isCycleThreshold": false },
      { "lower": 1000, "upper": 2000, "multiplier": 1.0, "isCycleThreshold": false },
      { "lower": 2000, "upper": 3000, "multiplier": 1.5, "isCycleThreshold": false },
      { "lower": 3000, "upper": null, "multiplier": 2.0, "isCycleThreshold": true }
    ],
    "cycleMode": "THRESHOLD_LOOP",
    "cycleThresholdOrder": [3000],
    "remainderMode": "USE_STEP_MULTIPLIER",
    "remainderFixedMultiplier": 1.0,
    "perOrderLimit": 10000,
    "accumulativeLimit": 50000,
    "excessStrategy": "TRUNCATE_AND_DOWNGRADE",
    "downgradeMultiplier": 1.0,
    "downgradeContinueCycle": false
  }
}
```
### 3.2 字段详细说明
| 字段路径                              | 类型                     | 说明                                       |
| --------------------------------- | ---------------------- | ---------------------------------------- |
| `entity_conditions`               | array                  | 条件列表（AND关系）                              |
| `entity_conditions[].entity`      | string                 | 业务实体名（Order, Member, OrderItem）          |
| `entity_conditions[].attribute`   | string                 | 属性名（来自 Schema 或系统预定义）                    |
| `entity_conditions[].operator`    | string                 | 运算符（如 BETWEEN, IN, EQ）                   |
| `entity_conditions[].value`       | object/array/primitive | 条件值（区间对象、枚举数组或单值）                        |
| `effective_time_range.start/end`  | datetime               | 规则生效时间范围，end=null 表示永久                   |
| `reward.steps`                    | array                  | 阶梯区间，至少一行                                |
| `reward.steps[].lower`            | number                 | 区间下限（含）                                  |
| `reward.steps[].upper`            | number                 | 区间上限（不含），null 表示正无穷                      |
| `reward.steps[].multiplier`       | number                 | 奖励倍数                                     |
| `reward.steps[].isCycleThreshold` | bool                   | 是否为循环点（仅当 cycleMode=THRESHOLD_LOOP 时有效） |
| `reward.cycleMode`                | string                 | `SINGLE_MATCH` 或 `THRESHOLD_LOOP`        |
| `reward.cycleThresholdOrder`      | array                  | 循环阈值降序列表（自动生成）                           |
| `reward.remainderMode`            | string                 | 剩余金额处理方式                                 |
| `reward.remainderFixedMultiplier` | number                 | 固定倍数时的倍数                                 |
| `reward.perOrderLimit`            | number                 | 单笔赠送上限（null=不限）                          |
| `reward.accumulativeLimit`        | number                 | 累计赠送上限（null=不限）                          |
| `reward.excessStrategy`           | string                 | 超限策略                                     |
| `reward.downgradeMultiplier`      | number                 | 截断降级倍数                                   |
| `reward.downgradeContinueCycle`   | bool                   | 降级后是否继续循环                                |
***
## 四、前端界面设计（完整布局）
### 4.1 活动列表页
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│ 规则引擎                                                   [+ 新建活动]     │
├─────────────────────────────────────────────────────────────────────────────┤
│ [基础规则]  [活动规则]  ← 当前选中“活动规则”                                │
├───────────┬─────────────────────────────────────────────────────────────────┤
│ 筛选条件   │ 活动规则列表                                                    │
│ 规则分组:  │ ┌─────┬─────────┬──────────┬───────┬─────────────────┬───────┐│
│ [全部 ▼]  │ │名称 │代码     │规则组    │优先级│ 生效时间        │ 操作  ││
│ 状态:     │ ├─────┼─────────┼──────────┼───────┼─────────────────┼───────┤│
│ [全部 ▼]  │ │618  │PROMO_618│promo_grp │10     │2026-06-01~06-30 │编辑   ││
│ 搜索:     │ │大促 │         │          │       │                 │停用   ││
│ [______]  │ │生日 │BIRTH_FIR│life_grp  │5      │永久             │编辑   ││
│           │ │月首 │         │          │       │                 │停用   ││
│           │ └─────┴─────────┴──────────┴───────┴─────────────────┴───────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.2 新建/编辑活动页面（统一配置界面）
**整体布局**（单页滚动表单）：
```text
┌─ 编辑活动：[新建活动] ─────────────────────────────────────────────────────┐
│                                                                             │
│ ┌─ 基础信息 ──────────────────────────────────────────────────────────────┐ │
│ │ 规则代码 *   [PROMO_618                ]  (唯一，字母数字下划线)         │ │
│ │ 规则名称 *   [618大促                  ]                                 │ │
│ │ 规则组       [promo_group              ]  (可选，同组内按优先级排序)      │ │
│ │ 优先级       [10]                         (数字越小越先执行)              │ │
│ │ 生效时间     [2026-06-01 00:00] 至 [2026-06-30 23:59]  □ 永久            │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 触发条件（所有条件为 AND 关系） ───────────────────────────────────────┐ │
│ │                                                                         │ │
│ │  ┌───────────────────────────────────────────────────────────────────┐ │ │
│ │  │ 实体：[Order ▼]  属性：[订单金额 ▼]   ≥ [100]   ≤ [      ]  [删除] │ │ │
│ │  └───────────────────────────────────────────────────────────────────┘ │ │
│ │  ┌───────────────────────────────────────────────────────────────────┐ │ │
│ │  │ 实体：[Member ▼] 属性：[会员等级 ▼]   ⊂ [GOLD] [PLATINUM]  [删除] │ │ │
│ │  └───────────────────────────────────────────────────────────────────┘ │ │
│ │  ┌───────────────────────────────────────────────────────────────────┐ │ │
│ │  │ 实体：[OrderItem▼]属性：[SKU ▼]        ⊂ [SKU001] [SKU002] [删除] │ │ │
│ │  └───────────────────────────────────────────────────────────────────┘ │ │
│ │  ┌───────────────────────────────────────────────────────────────────┐ │ │
│ │  │ 实体：[Member ▼] 属性：[生命周期里程碑▼] = [生日月首单 ▼]  [删除] │ │ │
│ │  └───────────────────────────────────────────────────────────────────┘ │ │
│ │                                                                         │ │
│ │                                              [+ 添加条件]               │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 奖励规则（阶梯） ──────────────────────────────────────────────────────┐ │
│ │ 阶梯表格（可增删行，拖拽排序）                            [ + 添加区间 ] │ │
│ │ ┌──────────┬──────────┬──────────┬─────────────────────┬─────────────┐ │ │
│ │ │ 下限(元) │ 上限(元) │ 倍数     │ 是循环分段点？      │ 操作        │ │ │
│ │ ├──────────┼──────────┼──────────┼─────────────────────┼─────────────┤ │ │
│ │ │ 0        │ 1000     │ 0.5      │ ☐                   │ [删除]      │ │ │
│ │ │ 1000     │ 2000     │ 1.0      │ ☐                   │ [删除]      │ │ │
│ │ │ 2000     │ 3000     │ 1.5      │ ☐                   │ [删除]      │ │ │
│ │ │ 3000     │ (空)     │ 2.0      │ ☑                   │ [删除]      │ │ │
│ │ └──────────┴──────────┴──────────┴─────────────────────┴─────────────┘ │ │
│ │ 说明：上限为空表示无上限；“是循环分段点”列仅在启用循环扣除时显示。         │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 循环扣除配置（可折叠） ─────────────────────────────────────────────────┐ │
│ │ ☐ 启用循环扣除                                                          │ │
│ │   （展开时显示以下内容）                                                 │ │
│ │   循环分段点顺序（从高到低）： [3000] [↑] [↓]  删除                       │ │
│ │   剩余金额处理： ● 按阶梯倍数  ○ 固定倍数 [1] 倍                         │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 上限控制 ──────────────────────────────────────────────────────────────┐ │
│ │ 单笔订单赠送上限： [10000] 积分   □ 不限制                               │ │
│ │ 活动期间累计上限： [50000] 积分   □ 不限制                               │ │
│ │ 累计窗口：        [活动期间 ▼]   (活动期间/自然月/自定义天数)             │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 超限处理策略（仅当累计上限非空时显示） ─────────────────────────────────┐ │
│ │ ● 截断并降级（推荐）                                                     │ │
│ │   - 优先级顺序（按倍数从高到低，可拖拽）： [2.0] [1.5] [1.0] [0.5] [↑][↓]│ │
│ │   - 被截断段的剩余金额改为按以下倍数奖励： ● 1 倍   ○ 0.5 倍  ○ 不奖励   │ │
│ │   - □ 降级后的剩余金额继续参与循环扣除                                   │ │
│ │ ○ 停止赠送                                                              │ │
│ │ ○ 按剩余容量比例缩放                                                    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 测试与预览 ────────────────────────────────────────────────────────────┐ │
│ │ 测试订单金额： [8000] 元                                                 │ │
│ │ 当前已累计奖励（模拟）： [48000] 积分                                     │ │
│ │                                 [ 运行预览 ]                             │ │
│ │                                                                         │ │
│ │ 理论奖励明细（无上限时）：                                               │ │
│ │   3000×2.0 = 6000 (循环)                                                │ │
│ │   3000×2.0 = 6000 (循环)                                                │ │
│ │   2000×1.5 = 3000                                                       │ │
│ │   0×0.5 = 0                                                             │ │
│ │   合计：15000 积分                                                       │ │
│ │                                                                         │ │
│ │ 超限控制（剩余容量 2000）：                                               │ │
│ │   - 第一段 3000×2.0 需要 6000 → 仅发放 1000×2.0 = 2000                   │ │
│ │     剩余金额 2000 元 → 降级为1倍 → 2000                                  │ │
│ │   实际奖励：4000 积分                                                    │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                                                      [保存草稿] [发布] [取消]│
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.3 界面关键行为说明
| 区块         | 行为                                        |
| ---------- | ----------------------------------------- |
| **基础信息**   | 规则代码唯一性校验；勾选“永久”则结束时间清空禁用。                |
| **触发条件**   | 实体和属性从后端 Schema 动态加载；属性类型决定运算符及控件；可增删条件行。 |
| **阶梯表格**   | 默认初始一行（固定倍数）；添加多行即自动支持阶梯；拖拽调整顺序。          |
| **循环扣除配置** | 默认折叠；开启后阶梯表格显示“是循环分段点”列；循环点顺序自动同步用户勾选。    |
| **上限控制**   | 累计上限非空时，超限策略区块才显示。                        |
| **超限处理策略** | 优先级顺序自动从阶梯倍数提取，支持拖拽调整顺序。                  |
| **预览**     | 调用后端预览接口，展示分段明细及实际发放结果。                   |
| **保存/发布**  | 草稿保存不生成 DRL；发布时生成 DRL 并热更新。               |
***
## 五、后端核心伪代码
### 5.1 DRL 生成器（统一处理所有活动）


```java
@Component
public class UnifiedPromoDrlGenerator implements DrlGenerator {
    public String generate(RuleDefinition rule) {
        JSONObject meta = rule.getMetadata();
        String ruleCode = rule.getRuleCode();
        String ruleGroup = rule.getRuleGroup();
        int priority = rule.getPriority();
        StringBuilder drl = new StringBuilder();
        drl.append("package com.loyalty.rules;n");
        drl.append("import com.loyalty.platform.domain.points.model.*;n");
        drl.append("import com.loyalty.platform.domain.activity.ActivityStateService;n");
        drl.append("import com.loyalty.platform.domain.activity.StepCycleCalculator;n");
        drl.append("global ActivityStateService stateService;nn");
        drl.append("rule "").append(ruleCode).append(""n");
        if (ruleGroup != null && !ruleGroup.isEmpty()) {
            drl.append("    ruleflow-group "").append(ruleGroup).append(""n");
        }
        drl.append("    salience ").append(1000 - priority).append("n");
        drl.append("whenn");
        drl.append("    $event: EventFact(eventType == "ORDER", getPayloadNumber("total_amount") > 0)n");
        drl.append("    $member: MemberFact(memberId == $event.memberId)n");
        drl.append("    eval( stateService.isActivityActive("").append(ruleCode).append("", $event.getEventTime()) )n");
        
        // 动态生成条件检查
        JSONArray conditions = meta.getJSONArray("entity_conditions");
        for (int i = 0; i < conditions.size(); i++) {
            String conditionExpr = ConditionCodeGenerator.generate(conditions.getJSONObject(i));
            drl.append("    ").append(conditionExpr).append("n");
        }
        
        JSONObject reward = meta.getJSONObject("reward");
        if (reward.has("accumulativeLimit") && reward.get("accumulativeLimit") != null) {
            drl.append("    BigDecimal alreadyRewarded = stateService.getTotalRewarded("").append(ruleCode).append("", $member.memberId);n");
            drl.append("    BigDecimal remainingCap = new BigDecimal("").append(reward.getBigDecimal("accumulativeLimit")).append("").subtract(alreadyRewarded);n");
            drl.append("    if (remainingCap.compareTo(BigDecimal.ZERO) <= 0) return;n");
        } else {
            drl.append("    BigDecimal remainingCap = null;n");
        }
        drl.append("    $orderAmount: BigDecimal($event.getPayloadNumber("total_amount"))n");
        drl.append("thenn");
        drl.append("    List<RewardSegment> segments = StepCycleCalculator.calculateTheoreticalSegments($orderAmount, getSteps(reward), getCycleMode(reward), getCycleThresholds(reward));n");
        drl.append("    RewardResult result = StepCycleCalculator.applyExcessControl(segments, remainingCap, getDowngradeMultiplier(reward), getContinueCycle(reward), getExcessStrategy(reward));n");
        drl.append("    BigDecimal finalPoints = result.getTotalPoints();n");
        drl.append("    if (finalPoints.compareTo(BigDecimal.ZERO) > 0) {n");
        drl.append("        ActionCollector.get().awardPoints($event.getEventId(), finalPoints, "").append(ruleCode).append("").execute(drools);n");
        drl.append("        stateService.addRewarded("").append(ruleCode).append("", $member.memberId, finalPoints);n");
        drl.append("    }n");
        drl.append("endn");
        return drl.toString();
    }
}
```
### 5.2 条件代码生成器


```java
@Component
public class ConditionCodeGenerator {
    public static String generate(JSONObject cond) {
        String entity = cond.getString("entity");
        String attr = cond.getString("attribute");
        String operator = cond.getString("operator");
        Object value = cond.get("value");
        switch (entity) {
            case "Order":
                if ("total_amount".equals(attr)) {
                    JSONObject range = (JSONObject) value;
                    BigDecimal min = range.getBigDecimal("min");
                    BigDecimal max = range.isNull("max") ? null : range.getBigDecimal("max");
                    if (max == null) {
                        return "$event.getPayloadNumber("total_amount").compareTo(new BigDecimal("" + min + "")) >= 0";
                    } else {
                        return "$event.getPayloadNumber("total_amount").compareTo(new BigDecimal("" + min + "")) >= 0 && " +
                               "$event.getPayloadNumber("total_amount").compareTo(new BigDecimal("" + max + "")) <= 0";
                    }
                }
                break;
            case "Member":
                if ("tier_code".equals(attr)) {
                    JSONArray values = (JSONArray) value;
                    String inExpr = values.toList().stream()
                        .map(v -> "$member.getTierCode().equals("" + v + "")")
                        .collect(Collectors.joining(" || "));
                    return "(" + inExpr + ")";
                }
                if ("lifecycle_milestone".equals(attr)) {
                    String milestone = (String) value;
                    return "stateService.checkLifecycleMilestone("" + milestone + "", $member, $event)";
                }
                break;
            case "OrderItem":
                // 需要遍历 $event.payload.items 数组，检查是否包含指定SKU
                JSONArray skus = (JSONArray) value;
                String skuList = skus.toList().stream().map(s -> """ + s + """).collect(Collectors.joining(","));
                return "eval( $event.hasAnySku(new java.util.HashSet<>(java.util.Arrays.asList(" + skuList + "))) )";
        }
        return "true";
    }
}
```
### 5.3 阶梯计算器核心方法


```java
public class StepCycleCalculator {
    public static List<RewardSegment> calculateTheoreticalSegments(
            BigDecimal amount, List<Step> steps, String cycleMode, List<BigDecimal> cycleThresholds) {
        List<RewardSegment> segments = new ArrayList<>();
        BigDecimal remaining = amount;
        if ("THRESHOLD_LOOP".equals(cycleMode) && !cycleThresholds.isEmpty()) {
            BigDecimal highest = cycleThresholds.get(0);
            while (remaining.compareTo(highest) >= 0) {
                BigDecimal multiplier = getMultiplierForAmount(highest, steps);
                segments.add(new RewardSegment(highest, multiplier));
                remaining = remaining.subtract(highest);
            }
        }
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            BigDecimal multiplier = getMultiplierForAmount(remaining, steps);
            segments.add(new RewardSegment(remaining, multiplier));
        }
        return segments;
    }
    public static RewardResult applyExcessControl(
            List<RewardSegment> theoreticalSegments, BigDecimal remainingCapacity,
            BigDecimal downgradeMultiplier, boolean continueCycle, String excessStrategy) {
        // 实现 STOP / RATIO / TRUNCATE_AND_DOWNGRADE
        // （伪代码略，按之前讨论实现）
    }
}
```
### 5.4 全局服务 ActivityStateService


```java
@Service
public class ActivityStateService {
    @Autowired private MemberActivityStateRepository repo;
    @Autowired private RuleDefinitionRepository ruleRepo;
    @Transactional
    public BigDecimal getTotalRewarded(String ruleCode, String memberId) {
        MemberActivityState state = repo.findByRuleCodeAndMemberIdForUpdate(ruleCode, memberId);
        return state != null ? state.getTotalRewarded() : BigDecimal.ZERO;
    }
    @Transactional
    public void addRewarded(String ruleCode, String memberId, BigDecimal points) {
        MemberActivityState state = repo.findByRuleCodeAndMemberIdForUpdate(ruleCode, memberId);
        if (state == null) {
            state = new MemberActivityState();
            state.setRuleCode(ruleCode);
            state.setMemberId(memberId);
            state.setTotalRewarded(points);
        } else {
            state.setTotalRewarded(state.getTotalRewarded().add(points));
        }
        repo.save(state);
    }
    public boolean isActivityActive(String ruleCode, LocalDateTime eventTime) {
        RuleDefinition rule = ruleRepo.findByRuleCode(ruleCode);
        if (!"ACTIVE".equals(rule.getStatus())) return false;
        LocalDateTime start = rule.getEffectiveStart();
        LocalDateTime end = rule.getEffectiveEnd();
        return eventTime.isAfter(start) && (end == null || eventTime.isBefore(end));
    }
    public boolean checkLifecycleMilestone(String milestone, MemberFact member, EventFact event) {
        // 具体实现：查询 member_activity_state 是否已奖励，检查会员生日月等
        // 伪代码略
        return true;
    }
}
```
***
## 六、API 接口定义
| 方法     | 路径                                       | 说明                          |
| ------ | ---------------------------------------- | --------------------------- |
| GET    | `/api/rules?category=promo`              | 获取活动规则列表                    |
| GET    | `/api/rules/{ruleCode}`                  | 获取单个规则详情                    |
| GET    | `/api/schemas/MEMBER/current`            | 获取会员扩展属性（复用）                |
| GET    | `/api/schemas/TRANSACTION_EVENT/current` | 获取交易事件动态属性（复用）              |
| POST   | `/api/rules`                             | 创建或更新规则（草稿）                 |
| POST   | `/api/rules/{ruleCode}/publish`          | 发布活动（生成DRL，热更新）             |
| POST   | `/api/rules/{ruleCode}/deactivate`       | 停用活动                        |
| DELETE | `/api/rules/{ruleCode}`                  | 删除草稿                        |
| POST   | `/api/rules/preview`                     | 预览奖励计算（输入订单金额、已累计奖励，返回分段明细） |
**统一响应格式**（主文档定义）：
```json
{ "code": "SUCCESS", "message": "", "data": {} }
```
***
## 七、与现有代码的集成指引
1. **数据库**：执行 DDL 变更（重命名列、新增字段、新增 `member_activity_state` 表）。
2. **实体类**：修改 `RuleDefinition` 实体，增加 `ruleCategory`、`ruleGroup`、`priority`、`effectiveStart`、`effectiveEnd` 字段，移除或重映射 `agendaGroup`。
3. **规则列表**：修改查询 API，支持按 `ruleCategory` 筛选（`base` / `promo`）；前端 Tab 切换。
4. **规则编辑器**：
   * `ruleCategory = base`：保留现有 DRL 编辑器。
   * `ruleCategory = promo`：使用新统一配置界面（本设计文档第四部分）。
5. **规则发布**：
   * 对于 `ruleType = ACTIVITY_PROMO`，调用 `UnifiedPromoDrlGenerator` 生成 DRL，存入 `drl_content`，然后刷新 `KieBase`。
6. **规则执行**：无需修改，活动规则与基础规则共用同一会话。
7. **生命周期里程碑**：在 `ActivityStateService.checkLifecycleMilestone` 中实现具体逻辑。
***
## 八、开发顺序建议
1. 后端数据库变更 + 实体类修改。
2. 后端实现 `UnifiedPromoDrlGenerator`、`ConditionCodeGenerator`、`ActivityStateService` 及预览 API。
3. 前端实现活动列表页（Tab 切换、筛选）。
4. 前端实现统一配置界面（基础信息、动态条件、阶梯表格、循环配置、上限、超限策略、预览）。
5. 联调测试。
***
**文档结束** – 本版本整合了所有讨论内容，包含完整界面布局、数据库变更、枚举、JSON 结构、后端伪代码和集成指引，可直接交付 AI 开发。
