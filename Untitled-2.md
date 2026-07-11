好的，我完全理解了。之前的设计文档确实过于偏重**逻辑描述**，缺少**高保真的界面细节设计**。现在，我重新为你设计一份**以界面为核心、逻辑为支撑**的完整设计文档。
***
# Loyalty 积分规则引擎 - 可视化编辑器完整设计文档
**版本**：v4.0（界面优先版）\
**最后更新**：2026-07-08\
**关联技术**：React 18 + Ant Design 5 + Zustand（前端） / Java + Drools 7.x（后端）
## 1. 整体页面布局
### 1.1 三栏布局（左-中-右）
text
```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  🔷 Loyalty 积分规则引擎                                           [ 保存 ] [ 发布 ] │
├──────────┬────────────────────────────────────────────────┬─────────────────────────┤
│ 变量池   │  规则编辑画布（核心）                          │  实时预览               │
│ (280px)  │  (弹性宽度)                                   │  (320px)                │
│          │                                                │                         │
│ 📦 输入  │  ┌────────────────────────────────────────┐   │  📖 规则语义            │
│  订单    │  │  🔵 如果 (IF) 满足以下条件：           │   │  当 订单金额 > 0        │
│  ·金额   │  │  ┌──────────────────────────────────┐  │   │  执行 分段阶梯累进：    │
│  ·商品数 │  │  │ 订单金额  [大于]  [0]  [AND ▼] │  │   │  · 0~1000 → 1倍        │
│  ·渠道   │  │  └──────────────────────────────────┘  │   │  · 1000~2000 → 1.2倍   │
│  📦 用户 │  │  [+ 添加条件]  [+ 添加条件组]          │   │  · 2000~3000 → 1.5倍   │
│  ·等级   │  └────────────────────────────────────────┘   │   │  · 3000以上 → 2倍      │
│  ·注册天数│                                                │   │                         │
│  ·生日月 │  ┌────────────────────────────────────────┐   │   │  🧮 模拟计算器         │
│  📦 商品 │  │  🟢 那么 (THEN) 执行：                 │   │   │  输入金额 [8900]       │
│  ·商品列表│  │  ┌──────────────────────────────────┐  │   │   │  毛积分 16350          │
│          │  │  │ 📊 分段阶梯累进                  │  │   │   │  🔒 触发上限 10000     │
│          │  │  │  依据：[订单金额 ▼]               │  │   │   │  溢出补足 3900         │
│          │  │  │  模式：[档位扣减 ▼]               │  │   │   │  ✅ 最终 13900 分     │
│          │  │  │  ┌────────┬────────┬────────┐   │  │   │                         │
│          │  │  │  │ 下限   │ 上限   │ 倍数   │   │  │   │                         │
│          │  │  │  │ 0      │ 1000   │ 1.0    │   │  │   │                         │
│          │  │  │  │ 1000   │ 2000   │ 1.2    │   │  │   │                         │
│          │  │  │  │ 2000   │ 3000   │ 1.5    │   │  │   │                         │
│          │  │  │  │ 3000   │ ∞      │ 2.0    │   │  │   │                         │
│          │  │  │  └────────┴────────┴────────┘   │  │   │                         │
│          │  │  │  [➕ 添加阶梯行]                  │  │   │                         │
│          │  │  │  ▼ 🛡️ 积分上限 [启用]            │  │   │                         │
│          │  │  │    最高 [10000] 分                │  │   │                         │
│          │  │  │    溢出后按 [1.0] 倍继续          │  │   │                         │
│          │  │  └──────────────────────────────────┘  │   │                         │
│          │  │  [+ 添加动作]                          │   │                         │
│          │  └────────────────────────────────────────┘   │                         │
│          │                                                │                         │
│          │  ┌────────────────────────────────────────┐   │                         │
│          │  │  🔴 否则 (ELSE) 执行：                 │   │                         │
│          │  │  (空 - 无动作)                         │   │                         │
│          │  └────────────────────────────────────────┘   │                         │
├──────────┴────────────────────────────────────────────────┴─────────────────────────┤
│  元信息：优先级 [20]  │  状态 [● 启用]  │  版本 [v1.0.0]  │  更新于 2026-07-08      │
└──────────────────────────────────────────────────────────────────────────────────────┘
```
## 2. 左侧：变量池（VariablePanel）
### 2.1 界面设计
text
```
┌─────────────────────────────┐
│ 📦 变量池                    │
│ 🔍 [搜索字段...]             │
├─────────────────────────────┤
│ 📁 订单相关                  │
│  ├── 💰 订单金额             │
│  ├── 📦 商品数量             │
│  ├── 🏷️ 下单渠道             │
│  └── 📋 商品列表 (集合)      │
│ 📁 用户相关                  │
│  ├── 👤 用户等级             │
│  ├── 📅 注册天数             │
│  └── 🎂 生日月份             │
│ 📁 系统变量                  │
│  ├── 🕐 当前时间             │
│  └── 📅 当前日期             │
├─────────────────────────────┤
│ 📤 输出变量                  │
│  ├── ⭐ 最终积分             │
│  ├── 📈 积分倍数             │
│  └── 🎫 发放优惠券ID         │
└─────────────────────────────┘
```
### 2.2 交互规则
| 交互方式     | 说明                            |
| -------- | ----------------------------- |
| **点击**   | 点击字段 → 自动填入当前选中的条件行/动作行       |
| **拖拽**   | 拖拽字段到编辑区 → 在落点位置插入新条件行并自动填入字段 |
| **搜索**   | 输入关键词实时过滤字段列表                 |
| **分组折叠** | 点击分组标题展开/收起                   |
### 2.3 字段数据结构
```typescript
interface Field {
  code: string;          // 字段编码（如 'orderAmount'）
  label: string;         // 显示名称（如 '订单金额'）
  type: 'number' | 'string' | 'boolean' | 'collection';
  group: 'order' | 'user' | 'system' | 'output';
  isCollection: boolean; // 是否为集合类型（用于 FOR 循环）
}
```
## 3. 中间：规则编辑画布
### 3.1 IF 条件区（蓝色）
#### 3.1.1 界面设计
text
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ 🔵 如果 (IF) 满足以下条件：                                                   │
│ ┌───────────────────────────────────────────────────────────────────────────┐ │
│ │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│ │  │  订单金额   [大于 ▼]   [0]          [AND ▼]  [🗑️]               │ │ │
│ │  │  用户等级   [等于 ▼]   [VIP ▼]      [—]     [🗑️]               │ │ │
│ │  └─────────────────────────────────────────────────────────────────────┘ │ │
│ │  ┌─────────────────────────────────────────────────────────────────────┐ │ │
│ │  │  📁 条件组 (OR)                                          [🗑️组] │ │ │
│ │  │  ┌─────────────────────────────────────────────────────────────────┐│ │ │
│ │  │  │  下单渠道  [等于 ▼]  [APP ▼]      [OR ▼]  [🗑️]              ││ │ │
│ │  │  │  下单渠道  [等于 ▼]  [H5 ▼]        [—]     [🗑️]              ││ │ │
│ │  │  └─────────────────────────────────────────────────────────────────┘│ │ │
│ │  │  [➕ 添加条件]  [➕ 添加条件组]                                     │ │ │
│ │  └─────────────────────────────────────────────────────────────────────┘ │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│ [➕ 添加条件]  [📁 添加条件组]                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```
#### 3.1.2 交互规则
| 元素        | 交互     | 说明                                      |
| --------- | ------ | --------------------------------------- |
| **字段下拉**  | 下拉选择   | 选项来自左侧变量池的输入变量                          |
| **比较符下拉** | 下拉选择   | 选项：等于、不等于、大于、大于等于、小于、小于等于、包含、不包含、为空、不为空 |
| **值输入**   | 输入框/下拉 | 根据字段类型自动切换（数字→InputNumber，枚举→Select）    |
| **逻辑连接**  | 下拉选择   | `AND` / `OR`，最后一行不显示                    |
| **条件组**   | 递归渲染   | 缩进16px，左边框3px，背景色略深                     |
| **删除**    | 点击🗑️  | 删除当前行或条件组                               |
### 3.2 THEN 动作区（绿色）
#### 3.2.1 界面设计（核心：动作菜单 + 阶梯组件）
text
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ 🟢 那么 (THEN) 执行：                                                         │
│                                                                               │
│ ┌───────────────────────────────────────────────────────────────────────────┐ │
│ │ 📊 分段阶梯累进                                                          │ │
│ │ ┌─────────────────────────────────────────────────────────────────────┐ │ │
│ │ │  计算依据：[订单金额 ▼]      输出结果：[最终积分 ▼]                │ │ │
│ │ │  计算模式：○ 按金额区间归属   ● 按档位总额扣减                    │ │ │
│ │ │  ┌────────────┬────────────┬────────────┬────────────┐             │ │ │
│ │ │  │  下限(含)   │  上限(不含) │  积分倍数   │  操作       │             │ │ │
│ │ │  ├────────────┼────────────┼────────────┼────────────┤             │ │ │
│ │ │  │  0         │  1000      │  1.0       │  [🗑️]      │             │ │ │
│ │ │  │  1000      │  2000      │  1.2       │  [🗑️]      │             │ │ │
│ │ │  │  2000      │  3000      │  1.5       │  [🗑️]      │             │ │ │
│ │ │  │  3000      │  ∞         │  2.0       │  [🗑️]      │             │ │ │
│ │ │  └────────────┴────────────┴────────────┴────────────┘             │ │ │
│ │ │  [➕ 添加阶梯行]                                                     │ │ │
│ │ │                                                                     │ │ │
│ │ │  ▼ 🛡️ 积分上限与溢出处理                                            │ │ │
│ │ │  ┌─────────────────────────────────────────────────────────────────┐│ │ │
│ │ │  │  [●] 启用积分上限                                              ││ │ │
│ │ │  │  单笔最高累积积分：[10000] 分                                  ││ │ │
│ │ │  │  超出上限后，剩余金额：○ 丢弃  ● 按 [1.0] 倍继续累积          ││ │ │
│ │ │  └─────────────────────────────────────────────────────────────────┘│ │ │
│ │ └─────────────────────────────────────────────────────────────────────┘ │ │
│ │                                                                           │ │
│ │ 💡 预览：输入 8900 → 毛积分 16350 → 触发上限 → 最终 13900 分            │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
│                                                                               │
│ [➕ 添加动作 ▼]                                                               │
└───────────────────────────────────────────────────────────────────────────────┘
```
#### 3.2.2 动作菜单详情（点击「添加动作」后的下拉菜单）
text
```
┌─────────────────────────────┐
│  ✏️ 赋值                     │
│  ➕ 累加                     │
│  ──────────────────────────  │
│  🔄 循环遍历 (FOR)           │
│  ❓ 条件分支 (IF-ELSE)       │
│  ──────────────────────────  │
│  📊 分段阶梯累进  ← 重点！   │
└─────────────────────────────┘
```
#### 3.2.3 循环遍历（FOR）容器界面（当用户选择「循环遍历」时）
text
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ 🔄 循环遍历 (FOR)                                                             │
│ ┌───────────────────────────────────────────────────────────────────────────┐ │
│ │  遍历集合：[订单商品列表 ▼]  元素变量名：[item]           [🗑️删除循环]  │ │
│ │                                                                           │ │
│ │  ┌─────────────────────────────────────────────────────────────────────┐  │ │
│ │  │  ❓ 如果 (IF) 条件：                                               │  │ │
│ │  │  ┌───────────────────────────────────────────────────────────────┐ │  │ │
│ │  │  │  item.price  [大于]  [100]                    [AND ▼]  [🗑️] │ │  │ │
│ │  │  └───────────────────────────────────────────────────────────────┘ │  │ │
│ │  │  [➕ 添加条件]                                                    │  │ │
│ │  │                                                                   │  │ │
│ │  │  ✅ 那么 (THEN) 执行：                                            │  │ │
│ │  │  ┌───────────────────────────────────────────────────────────────┐ │  │ │
│ │  │  │  ✏️ 赋值：item.bonusPoints = item.price * 2     [🗑️]       │ │  │ │
│ │  │  └───────────────────────────────────────────────────────────────┘ │  │ │
│ │  │  [➕ 添加动作]                                                    │  │ │
│ │  └─────────────────────────────────────────────────────────────────────┘  │ │
│ │  [➕ 循环内添加动作]                                                     │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```
#### 3.2.4 条件分支（IF-ELSE）容器界面（当用户选择「条件分支」时）
text
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ ❓ 条件分支 (IF-ELSE)                                                         │
│ ┌───────────────────────────────────────────────────────────────────────────┐ │
│ │  条件：                                                                   │ │
│ │  ┌─────────────────────────────────────────────────────────────────────┐  │ │
│ │  │  用户等级  [等于 ▼]  [VIP ▼]                        [AND ▼]  [🗑️] │  │ │
│ │  └─────────────────────────────────────────────────────────────────────┘  │ │
│ │  [➕ 添加条件]                                                           │ │
│ │                                                                           │ │
│ │  🟢 那么 (THEN) 执行：                                                    │ │
│ │  ┌─────────────────────────────────────────────────────────────────────┐  │ │
│ │  │  ✏️ 赋值：积分倍数 = 2                              [🗑️]          │  │ │
│ │  └─────────────────────────────────────────────────────────────────────┘  │ │
│ │  [➕ 添加动作]                                                           │ │
│ │                                                                           │ │
│ │  🔴 否则 (ELSE) 执行：                                                    │ │
│ │  ┌─────────────────────────────────────────────────────────────────────┐  │ │
│ │  │  ✏️ 赋值：积分倍数 = 1                              [🗑️]          │  │ │
│ │  └─────────────────────────────────────────────────────────────────────┘  │ │
│ │  [➕ 添加动作]                                                           │ │
│ │                                                                           │ │
│ │  [🗑️ 删除分支]                                                           │ │
│ └───────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────────────────┘
```
### 3.3 ELSE 动作区（红色）
与 THEN 动作区结构完全相同，仅背景色和标题不同，用于配置条件不满足时的执行逻辑。
## 4. 右侧：实时预览窗格
### 4.1 界面设计
text
```
┌─────────────────────────────────────────┐
│ 📖 规则语义预览                         │
│ ─────────────────────────────────────── │
│ 当 **订单金额 > 0** 时：                │
│                                         │
│ 执行 **分段阶梯累进**：                 │
│ ─────────────────────────────────────── │
│  依据：订单金额                         │
│  模式：按档位总额扣减                   │
│  阶梯：                                 │
│  · 0 ~ 1000       → 1.0 倍             │
│  · 1000 ~ 2000    → 1.2 倍             │
│  · 2000 ~ 3000    → 1.5 倍             │
│  · 3000 ~ ∞       → 2.0 倍             │
│  上限：10000 分，溢出按 1.0 倍          │
│                                         │
│ ─────────────────────────────────────── │
│ 🧮 模拟计算器                           │
│ ┌─────────────────────────────────────┐ │
│ │  订单金额：[8900]    [计算]         │ │
│ │                                     │ │
│ │  📊 计算明细：                      │ │
│ │  · 阶梯毛积分：16,350 分            │ │
│ │  · 触发积分上限：10,000 分          │ │
│ │  · 消耗金额达上限：5,000 元         │ │
│ │  · 剩余金额溢出补足：3,900 × 1.0   │ │
│ │  ✅ 最终积分：**13,900 分**        │ │
│ └─────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```
### 4.2 交互规则
| 元素        | 说明                     |
| --------- | ---------------------- |
| **规则语义**  | 实时翻译，随编辑区变化自动更新        |
| **模拟计算器** | 业务人员输入金额，点击计算，立即显示拆分明细 |
| **高亮关键词** | 字段名、数值、倍数等用不同颜色高亮      |
## 5. 完整规则数据结构（JSON）
### 5.1 对应上述界面的完整 JSON
json
```
{
  "ruleId": "LOYALTY_TIERED_001",
  "name": "大额阶梯双倍积分（带封顶）",
  "category": "积分翻倍",
  "priority": 20,
  "enabled": true,
  "version": "1.0.0",
  "lhs": {
    "logic": "AND",
    "items": [
      {
        "id": "c1",
        "type": "condition",
        "field": "orderAmount",
        "operator": ">",
        "value": 0
      }
    ]
  },
  "rhs": {
    "then": [
      {
        "id": "a1",
        "type": "tiered",
        "sourceField": "orderAmount",
        "targetField": "finalPoints",
        "mode": "deduction",
        "tiers": [
          { "id": "t1", "lowerBound": 0, "upperBound": 1000, "multiplier": 1.0 },
          { "id": "t2", "lowerBound": 1000, "upperBound": 2000, "multiplier": 1.2 },
          { "id": "t3", "lowerBound": 2000, "upperBound": 3000, "multiplier": 1.5 },
          { "id": "t4", "lowerBound": 3000, "upperBound": null, "multiplier": 2.0 }
        ],
        "capping": {
          "enabled": true,
          "maxPoints": 10000,
          "overflowMode": "multiply",
          "overflowMultiplier": 1.0
        }
      }
    ],
    "else": []
  },
  "description": "当订单金额>0时，按档位扣减模式执行分段阶梯累进，上限10000分，溢出按1倍累积。"
}
```
### 5.2 FOR + IF 嵌套场景的 JSON 示例
json
```
{
  "rhs": {
    "then": [
      {
        "id": "loop1",
        "type": "loop",
        "collection": "orderItems",
        "elementVariable": "item",
        "actions": [
          {
            "id": "branch1",
            "type": "branch",
            "condition": {
              "logic": "AND",
              "items": [
                { "id": "c2", "type": "condition", "field": "item.price", "operator": ">", "value": 100 }
              ]
            },
            "thenActions": [
              { "id": "a2", "type": "assign", "field": "item.bonusPoints", "value": "item.price * 2" }
            ],
            "elseActions": [
              { "id": "a3", "type": "assign", "field": "item.bonusPoints", "value": "item.price * 1" }
            ]
          }
        ]
      }
    ]
  }
}
```
## 6. 后端 DRL 生成伪代码
### 6.1 针对阶梯组件（TieredAction）的 DRL 生成
java
```
private String generateTieredDRL(TieredAction action, String indent) {
    StringBuilder code = new StringBuilder();
    code.append(indent).append("double remaining = ").append(action.getSourceField()).append(";\n");
    code.append(indent).append("double totalPoints = 0.0;\n");
    
    if (action.getCapping() != null && action.getCapping().isEnabled()) {
        code.append(indent).append("double cap = ").append(action.getCapping().getMaxPoints()).append(";\n");
        code.append(indent).append("double overflowMulti = ").append(action.getCapping().getOverflowMultiplier()).append(";\n");
    }
    
    code.append(indent).append("List<Tier> tiers = getSortedTiersDesc();\n");
    code.append(indent).append("for (Tier tier : tiers) {\n");
    code.append(indent).append("    if (remaining <= 0) break;\n");
    code.append(indent).append("    double lower = tier.getLowerBound();\n");
    code.append(indent).append("    double upper = tier.getUpperBound() == null ? Double.MAX_VALUE : tier.getUpperBound();\n");
    code.append(indent).append("    double stepSize = upper - lower;\n");
    code.append(indent).append("    if (remaining > lower) {\n");
    code.append(indent).append("        double applicable = Math.min(remaining - lower, stepSize);\n");
    code.append(indent).append("        if (tier.getUpperBound() == null) applicable = remaining;\n");
    code.append(indent).append("        double pointsThisStep = applicable * tier.getMultiplier();\n");
    
    // 积分上限检测
    if (action.getCapping() != null && action.getCapping().isEnabled()) {
        code.append(indent).append("        if ((totalPoints + pointsThisStep) > cap) {\n");
        code.append(indent).append("            double amountToCap = (cap - totalPoints) / tier.getMultiplier();\n");
        code.append(indent).append("            totalPoints = cap;\n");
        code.append(indent).append("            remaining -= amountToCap;\n");
        code.append(indent).append("            if (remaining > 0) {\n");
        code.append(indent).append("                totalPoints += remaining * overflowMulti;\n");
        code.append(indent).append("            }\n");
        code.append(indent).append("            break;\n");
        code.append(indent).append("        } else {\n");
        code.append(indent).append("            totalPoints += pointsThisStep;\n");
        code.append(indent).append("            remaining -= applicable;\n");
        code.append(indent).append("        }\n");
    } else {
        code.append(indent).append("        totalPoints += pointsThisStep;\n");
        code.append(indent).append("        remaining -= applicable;\n");
    }
    
    code.append(indent).append("    }\n");
    code.append(indent).append("}\n");
    code.append(indent).append(action.getTargetField()).append(" = totalPoints;\n");
    
    return code.toString();
}
```
### 6.2 FOR + IF 嵌套的 DRL 生成（递归）
java
```
private String generateActionDRL(ActionItem action, String indent) {
    if (action instanceof AssignAction) {
        return indent + ((AssignAction) action).getField() + " = " + ((AssignAction) action).getValue() + ";\n";
    }
    if (action instanceof LoopAction) {
        LoopAction loop = (LoopAction) action;
        StringBuilder code = new StringBuilder();
        code.append(indent).append("for (").append(loop.getElementVariable()).append(" : ").append(loop.getCollection()).append(") {\n");
        for (ActionItem sub : loop.getActions()) {
            code.append(generateActionDRL(sub, indent + "    "));
        }
        code.append(indent).append("}\n");
        return code.toString();
    }
    if (action instanceof BranchAction) {
        BranchAction branch = (BranchAction) action;
        StringBuilder code = new StringBuilder();
        code.append(indent).append("if (").append(buildConditionExpr(branch.getCondition())).append(") {\n");
        for (ActionItem sub : branch.getThenActions()) {
            code.append(generateActionDRL(sub, indent + "    "));
        }
        code.append(indent).append("} else {\n");
        for (ActionItem sub : branch.getElseActions()) {
            code.append(generateActionDRL(sub, indent + "    "));
        }
        code.append(indent).append("}\n");
        return code.toString();
    }
    if (action instanceof TieredAction) {
        return generateTieredDRL((TieredAction) action, indent);
    }
    return "";
}
```
## 7. React 组件结构
### 7.1 组件树
text
```
RuleEditor (主页面)
├── VariablePanel (左侧变量池)
│   ├── SearchInput
│   ├── FieldGroup (订单/用户/系统/输出)
│   │   └── FieldItem (可拖拽/点击)
│   └── OutputFieldGroup
├── EditorCanvas (中间编辑区)
│   ├── ConditionGroup (IF 蓝色区域)
│   │   ├── ConditionRow (条件行)
│   │   │   ├── FieldSelect
│   │   │   ├── OperatorSelect
│   │   │   ├── ValueInput
│   │   │   └── LogicSelect
│   │   ├── ConditionGroup (递归嵌套)
│   │   ├── AddConditionButton
│   │   └── AddGroupButton
│   ├── ActionContainer (THEN 绿色区域)
│   │   ├── ActionItem (渲染器)
│   │   │   ├── AssignAction (赋值)
│   │   │   ├── LoopAction (循环容器)
│   │   │   │   ├── CollectionSelect
│   │   │   │   ├── VariableInput
│   │   │   │   └── ActionContainer (递归渲染子动作)
│   │   │   ├── BranchAction (条件分支容器)
│   │   │   │   ├── ConditionGroup (复用)
│   │   │   │   ├── ActionContainer (THEN子动作)
│   │   │   │   └── ActionContainer (ELSE子动作)
│   │   │   └── TieredAction (阶梯高级组件)
│   │   │       ├── FieldSelect (依据/输出)
│   │   │       ├── ModeRadio
│   │   │       ├── TierTable (可编辑表格)
│   │   │       │   └── EditableRow (下限/上限/倍数)
│   │   │       ├── AddTierButton
│   │   │       ├── CappingCollapse (折叠面板)
│   │   │       │   ├── EnableSwitch
│   │   │       │   ├── MaxPointsInput
│   │   │       │   ├── OverflowModeSelect
│   │   │       │   └── OverflowMultiplierInput
│   │   │       └── TierPreview (实时预览)
│   │   ├── AddActionDropdown (动作菜单)
│   │   └── EmptyState (空状态)
│   └── ActionContainer (ELSE 红色区域) [同THEN结构]
└── PreviewPanel (右侧预览)
    ├── NaturalLanguage (规则语义)
    ├── Simulator (模拟计算器)
    │   ├── InputField
    │   ├── CalculateButton
    │   └── ResultDetail (拆分明细)
    └── CopyButton
```
### 7.2 Zustand Store 核心方法
```typescript
interface RuleStore {
  config: RuleConfig;
  
  // 条件操作
  addCondition: (path: string[]) => void;
  addGroup: (path: string[]) => void;
  removeNode: (path: string[]) => void;
  updateCondition: (path: string[], updates: Partial<Condition>) => void;
  
  // 动作操作
  addAction: (path: string[], type: ActionType) => void;
  removeAction: (path: string[]) => void;
  updateAction: (path: string[], updates: Partial<ActionItem>) => void;
  
  // 阶梯专用
  addTier: (path: string[]) => void;
  removeTier: (path: string[], tierIndex: number) => void;
  updateTier: (path: string[], tierIndex: number, updates: Partial<TierRow>) => void;
  
  // 规则操作
  resetConfig: (config: RuleConfig) => void;
  saveRule: () => Promise<void>;
}
```
***
*文档版本：v4.0（界面优先版） | 最后更新：2026-07-08*
这份文档现在以**界面设计为核心**，每个区域都配有详细的 UI 示意和交互规则说明，开发团队可以直接依据此文档进行编码实现。
