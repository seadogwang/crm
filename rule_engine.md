# 积分活动规则引擎补充设计文档
> 本文档作为主设计文档 v7.3 第六章《规则引擎》的补充，描述基于现有 `rule_definition` 表的 **积分活动（promo）** 配置、存储与执行方案，供 AI 开发积分活动界面使用。
## 一、总体说明
* **基础规则**（`rule_category = 'base'`）：使用 DRL 编辑器，支持手写或 AI 生成的规则代码。
* **活动规则**（`rule_category = 'promo'`）：使用统一的可视化配置界面，支持固定倍数活动和阶梯循环活动，以“阶梯表格 + 上限控制”为核心。
前端规则列表页已实现两个 Tab：**基础规则** 和 **活动规则**，分别对应 `rule_category = 'base'` 和 `rule_category = 'promo'`。本设计仅涉及 **活动规则** 部分的界面与后端实现。
## 二、数据模型
### 2.1 `rule_definition` 表（已存在，扩展使用）
```sql
CREATE TABLE rule_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    rule_code VARCHAR(64) NOT NULL,          -- 唯一标识，如 PROMO_618
    rule_name VARCHAR(200) NOT NULL,
    rule_type VARCHAR(30) NOT NULL,          -- 'DRL' | 'ACTIVITY_PROMO'
    rule_category VARCHAR(50) NOT NULL,      -- 'base' | 'promo'
    drl_content TEXT,                        -- 发布时自动生成的 DRL
    status VARCHAR(20) DEFAULT 'DRAFT',      -- DRAFT / ACTIVE / INACTIVE
    version INT DEFAULT 1,
    metadata JSONB NOT NULL,                 -- 活动配置 JSON
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ,
    UNIQUE(program_code, rule_code)
);
```
**字段说明**：
* `rule_type`：对于活动规则固定为 `ACTIVITY_PROMO`。
* `rule_category`：`promo` 表示活动规则。
* `metadata`：存储阶梯配置、上限、时间范围等。
### 2.2 会员活动累计状态表（新增）
用于累计上限控制，记录每个会员在每个活动下已赠送的总积分。
```sql
CREATE TABLE member_activity_state (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    rule_code VARCHAR(64) NOT NULL,          -- 关联 rule_definition.rule_code
    total_rewarded NUMERIC(18,4) DEFAULT 0,
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, member_id, rule_code)
);
```
## 三、`metadata` JSON Schema（统一阶梯配置）
活动配置统一使用阶梯模型，通过 `steps` 数组定义金额分段和倍数，通过 `cycleMode` 控制是否循环扣除，通过 `excessStrategy` 控制超限行为。
### 3.1 完整 JSON 结构
```json
{
  "condition": {
    "min_order_amount": 0,
    "member_tiers": ["GOLD", "PLATINUM"]
  },
  "valid_time_range": {
    "start": "2026-01-01T00:00:00Z",
    "end": null
  },
  "steps": [
    { "lower": 0, "upper": 1000, "multiplier": 0.5, "isCycleThreshold": false },
    { "lower": 1000, "upper": 2000, "multiplier": 1.0, "isCycleThreshold": false },
    { "lower": 2000, "upper": 3000, "multiplier": 1.5, "isCycleThreshold": false },
    { "lower": 3000, "upper": null, "multiplier": 2.0, "isCycleThreshold": true }
  ],
  "cycleMode": "THRESHOLD_LOOP",       // 或 "SINGLE_MATCH"
  "cycleThresholdOrder": [3000],       // 循环分段点阈值列表（降序），自动从 steps 中提取 isCycleThreshold=true 的 upper
  "remainderMode": "USE_STEP_MULTIPLIER",  // 或 "FIXED_MULTIPLIER"
  "remainderFixedMultiplier": 1.0,     // 仅当 remainderMode = FIXED_MULTIPLIER 时使用
  "perOrderLimit": 10000,              // 单笔订单赠送上限（积分），null 表示不限制
  "accumulativeLimit": 50000,          // 活动期间累计上限（积分），null 表示不限制
  "excessStrategy": "TRUNCATE_AND_DOWNGRADE",  // 或 "STOP", "RATIO"
  "downgradeMultiplier": 1.0,          // 截断降级时剩余金额的倍数
  "downgradeContinueCycle": false      // 降级后是否继续参与循环
}
```
### 3.2 各字段含义
| 字段                         | 类型      | 说明                                                              |
| -------------------------- | ------- | --------------------------------------------------------------- |
| `condition`                | object  | 触发条件（订单金额门槛、会员等级等）                                              |
| `valid_time_range`         | object  | 活动生效时间范围                                                        |
| `steps`                    | array   | 阶梯区间数组，每个元素包含 lower, upper, multiplier, isCycleThreshold        |
| `cycleMode`                | string  | `SINGLE_MATCH`（单次匹配，不循环）或 `THRESHOLD_LOOP`（循环扣除）                |
| `cycleThresholdOrder`      | array   | 循环分段点的阈值列表（降序），自动生成                                             |
| `remainderMode`            | string  | 剩余金额处理方式：`USE_STEP_MULTIPLIER`（按阶梯倍数）或 `FIXED_MULTIPLIER`（固定倍数） |
| `remainderFixedMultiplier` | number  | 当 remainderMode = FIXED\_MULTIPLIER 时的固定倍数                      |
| `perOrderLimit`            | number  | 单笔订单赠送积分上限，null 表示不限制                                           |
| `accumulativeLimit`        | number  | 活动期间累计赠送积分上限，null 表示不限制                                         |
| `excessStrategy`           | string  | 超限策略：`STOP`（停止赠送）、`RATIO`（比例缩放）、`TRUNCATE_AND_DOWNGRADE`（截断降级）  |
| `downgradeMultiplier`      | number  | 截断降级时，剩余金额的奖励倍数（通常为 1）                                          |
| `downgradeContinueCycle`   | boolean | 截断后剩余金额是否继续参与循环扣除（默认 false）                                     |
### 3.3 固定倍数活动如何表达
固定倍数活动（原 Ad-hoc）可视为 `steps` 只有一行的阶梯：
```json
{
  "steps": [
    { "lower": 0, "upper": null, "multiplier": 2.0, "isCycleThreshold": false }
  ],
  "cycleMode": "SINGLE_MATCH",
  "accumulativeLimit": 50000,
  "perOrderLimit": null,
  "excessStrategy": "STOP"
}
```
前端界面统一用阶梯表格，允许添加多行。对于固定倍数活动，用户只添加一行，不勾选循环点，不做复杂配置。
## 四、前端界面设计（活动规则 Tab）
### 4.1 活动列表页
* 位于规则引擎模块，Tab 切换“基础规则”和“活动规则”。
* 活动规则列表显示：规则名称、规则代码、状态、生效时间、操作（编辑、发布、停用）。
### 4.2 新建/编辑活动页面
采用单页表单，包含以下区块：
#### 4.2.1 基础信息
| 字段     | 控件     | 说明                   |
| ------ | ------ | -------------------- |
| 规则代码   | 文本输入   | 必填，唯一                |
| 规则名称   | 文本输入   | 必填                   |
| 生效时间范围 | 日期时间范围 | 开始时间必填，结束时间可选（空表示永久） |
#### 4.2.2 触发条件
* 订单金额下限（数字输入，默认 0）
* 会员等级（多选下拉，可选 GOLD, PLATINUM 等，不选表示全部）
#### 4.2.3 阶梯规则配置
**阶梯表格**（可动态增删行）：
| 下限(元) | 上限(元) | 倍数  | 是循环分段点？ | 操作 |
| ----- | ----- | --- | ------- | -- |
| 0     | 1000  | 0.5 | ☐       | 删除 |
| 1000  | 2000  | 1.0 | ☐       | 删除 |
| ...   |       |     |         |    |
* **上限**：输入框，留空或 `∞` 表示无上限。
* **是循环分段点**：仅当 `cycleMode` 选择“循环扣除”时才显示该列，用户可勾选一个或多个阶梯作为循环点。
#### 4.2.4 循环与分段配置
* **循环模式**：单选框（单次匹配 / 循环扣除）
  * 选择“单次匹配”时，隐藏“循环分段点”列。
  * 选择“循环扣除”时，显示“是循环分段点”列，并允许勾选。
* **循环分段点顺序**（仅当选择“循环扣除”且至少勾选一个循环点时显示）：以拖拽列表形式展示已勾选循环点的阈值，支持排序。
* **剩余金额处理**：下拉选择
  * 按剩余金额所在阶梯倍数奖励（默认）
  * 统一按固定倍数奖励（出现额外输入框）
#### 4.2.5 上限控制
* **单笔订单赠送上限**：数字输入，可选（留空为不限制）。
* **活动期间累计上限**：数字输入，可选。
#### 4.2.6 超限处理策略（仅当累计上限不为空时显示）
* **停止赠送**（超过上限后不再赠送任何积分）
* **按剩余容量比例缩放**（各段同比例缩减）
* **截断并降级**（推荐）：展示优先级排序（按倍数从高到低，可拖拽）；降级倍数（默认 1 倍）；是否继续循环（默认否）
#### 4.2.7 实时预览（可选）
提供测试面板：输入订单金额和已累计奖励，点击预览，展示计算过程和最终奖励积分。
#### 4.2.8 按钮
* **保存草稿**：保存 `metadata`，不生成 DRL，状态为 `DRAFT`。
* **发布**：生成 DRL，存入 `drl_content`，热加载规则，状态变更为 `ACTIVE`。
* **取消**：返回列表。
### 4.3 前端与后端交互 API
* `POST /api/rules`：创建/更新活动规则（草稿）
* `POST /api/rules/{ruleCode}/publish`：发布活动规则，生成 DRL 并激活
* `POST /api/rules/{ruleCode}/deactivate`：停用活动规则
* `GET /api/rules?category=promo`：获取活动规则列表
* `GET /api/rules/{ruleCode}`：获取单个规则详情
## 五、后端 DRL 生成逻辑
### 5.1 生成流程
1. 读取 `metadata`。
2. 根据 `cycleMode`、`steps`、`excessStrategy` 等配置，调用 `StepCycleDrlGenerator` 生成 DRL 字符串。
3. 将 DRL 存入 `drl_content`。
4. 调用 `KieBaseCacheManager.refreshKieBase(programCode)` 热加载规则。
### 5.2 DRL 模板要点
* 使用 `global ActivityStateService stateService` 操作累计状态。
* `when` 部分包含：`EventFact` 条件、`MemberFact` 关联、活动有效期检查、累计上限检查。
* `then` 部分：调用 `StepCycleCalculator` 计算奖励，调用 `ActionCollector` 发放积分，更新 `member_activity_state`。
### 5.3 辅助类
* `StepCycleCalculator`：提供阶梯分段、循环扣除、超限截断等静态方法。
* `ActivityStateService`：提供查询/更新 `member_activity_state` 的原子操作（`SELECT FOR UPDATE`）。
## 六、枚举值汇总
| 枚举类型             | 值                        | 说明          |
| ---------------- | ------------------------ | ----------- |
| `rule_type`      | `DRL`                    | 基础规则        |
|                  | `ACTIVITY_PROMO`         | 活动规则        |
| `rule_category`  | `base`                   | 基础规则（Tab 1） |
|                  | `promo`                  | 活动规则（Tab 2） |
| `cycleMode`      | `SINGLE_MATCH`           | 单次匹配，不循环    |
|                  | `THRESHOLD_LOOP`         | 循环扣除        |
| `remainderMode`  | `USE_STEP_MULTIPLIER`    | 按阶梯倍数       |
|                  | `FIXED_MULTIPLIER`       | 固定倍数        |
| `excessStrategy` | `STOP`                   | 停止赠送        |
|                  | `RATIO`                  | 比例缩放        |
|                  | `TRUNCATE_AND_DOWNGRADE` | 截断降级        |
| `status`         | `DRAFT`                  | 草稿          |
|                  | `ACTIVE`                 | 已发布         |
|                  | `INACTIVE`               | 已停用         |
## 七、开发要点
1. **前端**：
   * 新建 `PromoRuleEditor` 组件，与基础规则编辑器分开。
   * 使用动态表格组件实现阶梯规则的增删改。
   * 根据 `cycleMode` 显示/隐藏“循环分段点”列。
   * 调用后端 API 保存/发布。
2. **后端**：
   * 实现 `StepCycleDrlGenerator` 根据 `metadata` 生成 DRL。
   * 实现 `ActivityStateService` 并注入到 Drools 全局变量。
   * 修改 `RuleEvaluationService` 以支持全局变量注入。
3. **测试**：
   * 单元测试覆盖阶梯计算、循环扣除、超限截断等核心逻辑。
   * 集成测试验证活动发布、热加载及规则触发。
## 八、与主设计文档的关系
* 此设计完全基于主文档 v7.3 的 `rule_definition` 表，未引入新表（除 `member_activity_state` 运行时表）。
* 复用现有规则发布、KieBase 缓存、动作执行等基础设施。
* 前端通过 `rule_category` 区分 Tab，与主文档前端规范一致。
***
