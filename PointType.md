# 积分类型体系扩展设计
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：1.0\
> **设计目标**：
>
> * 扩展积分类型体系，支持**多维度等级评估**（金额、次数、行为等）
>
> * 通过积分流水记录所有累积数据，确保**退单自动冲抵**
>
> * 积分类型可灵活配置，支持不同业务场景
## 一、积分类型完整体系
### 1.1 积分类型全景图
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                           积分类型体系                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    核心积分类型（已有）                              │   │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │   │
│  │  │  REWARD  │  │   TIER   │  │  CREDIT  │  │  PREPAY_CREDIT   │  │   │
│  │  │  消费积分 │  │  等级积分 │  │  授信积分 │  │  预售积分        │  │   │
│  │  │  (可兑换) │  │  (算等级) │  │  (可透支) │  │  (可冲抵)        │  │   │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    扩展积分类型（新增）                              │   │
│  │  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │   │
│  │  │  PURCHASE_COUNT  │  │  BEHAVIOR_POINTS │  │  CUSTOM_POINTS   │  │   │
│  │  │  购买次数积分    │  │  行为积分        │  │  自定义积分      │  │   │
│  │  │  (算等级/次数)   │  │  (算等级/行为)   │  │  (按需配置)      │  │   │
│  │  └──────────────────┘  └──────────────────┘  └──────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.2 积分类型定义表（已有）
sql
```
CREATE TABLE point_type_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    type_code VARCHAR(32) NOT NULL,
    type_name VARCHAR(100) NOT NULL,
    is_redeemable BOOLEAN DEFAULT false,      -- 是否可兑换
    is_tier_calc BOOLEAN DEFAULT false,        -- 是否计入等级计算
    is_transferable BOOLEAN DEFAULT false,     -- 可否转赠
    allow_negative BOOLEAN DEFAULT false,      -- 是否允许负分
    allow_repay BOOLEAN DEFAULT false,         -- 是否可被冲抵
    expiry_mode VARCHAR(20) DEFAULT 'NATURAL_YEAR', -- 有效期模式
    expiry_value INT DEFAULT 12,               -- 有效期值
    credit_limit NUMERIC(18,4) DEFAULT 0,      -- 授信额度（仅CREDIT）
    visible BOOLEAN DEFAULT true,              -- 是否对用户可见
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, type_code)
);
```
### 1.3 积分类型配置清单
| 积分类型              | 用途     | `is_redeemable` | `is_tier_calc` | `allow_negative` | `allow_repay` | 有效期       | 说明                 |
| ----------------- | ------ | --------------- | -------------- | ---------------- | ------------- | --------- | ------------------ |
| `REWARD`          | 消费积分   | ✅ true          | ❌ false        | ❌ false          | ❌ false       | 365天      | 用户消费获得的积分，可兑换礼品    |
| `TIER`            | 等级积分   | ❌ false         | ✅ true         | ❌ false          | ❌ false       | **永久（0）** | 按金额累积，用于等级评估       |
| `CREDIT`          | 授信积分   | ✅ true          | ❌ false        | ✅ true           | ❌ false       | 按配置       | 系统授予的信用额度          |
| `PREPAY_CREDIT`   | 预售积分   | ✅ true          | ❌ false        | ❌ false          | ✅ true        | 按配置       | 预售产生的临时负债          |
| `PURCHASE_COUNT`  | 购买次数积分 | ❌ false         | ✅ true         | ❌ false          | ❌ false       | **永久（0）** | **按次数累积，用于等级评估**   |
| `BEHAVIOR_POINTS` | 行为积分   | ❌ false         | ✅ true         | ❌ false          | ❌ false       | **永久（0）** | **按行为次数累积，用于等级评估** |
| `CUSTOM_POINTS`   | 自定义积分  | 按需              | 按需             | 按需               | 按需            | 按需        | **按需配置**           |
## 二、新增积分类型详解
### 2.1 购买次数积分（PURCHASE\_COUNT）
#### 业务场景
| 场景   | 说明             |
| ---- | -------------- |
| 升级条件 | “购买一次正价商品即可升级” |
| 保级条件 | “过去365天内购买≥5次” |
| 降级条件 | “连续180天未购买”    |
#### 积分发放规则
sql
```
-- 正价商品购买完成 → 发放 1 分
INSERT INTO point_type_definition (
    program_code, type_code, type_name,
    is_redeemable, is_tier_calc,
    expiry_mode, expiry_value,
    allow_negative, allow_repay,
    description
) VALUES (
    'BRAND_A', 'PURCHASE_COUNT', '正价购买次数',
    false, true,
    'NATURAL_YEAR', 0,  -- 永不过期
    false, false,
    '记录正价商品购买次数，用于等级评估'
);
```
**规则配置**：
```text
┌─ 购买次数积分规则 ─────────────────────────────────────────────────────┐
│ 积分类型： PURCHASE_COUNT                                                │
│ 积分名称： 正价购买次数                                                  │
│ 触发条件：                                                              │
│   ● 订单状态 = 已完成                                                   │
│   ● 商品类型 ∈ [正价商品]                                               │
│   ● 订单实付金额 > 0                                                    │
│ 奖励方式： 固定值 1 分                                                  │
│ 有效期： 永久有效                                                       │
│ 退单处理： 自动扣减 1 分                                               │
└──────────────────────────────────────────────────────────────────────────┘
```
### 2.2 行为积分（BEHAVIOR\_POINTS）
#### 业务场景
| 场景   | 说明           |
| ---- | ------------ |
| 升级条件 | “连续签到30天可升级” |
| 保级条件 | “过去90天有行为记录” |
#### 积分发放规则

```sql
INSERT INTO point_type_definition (
    program_code, type_code, type_name,
    is_redeemable, is_tier_calc,
    expiry_mode, expiry_value,
    allow_negative, allow_repay,
    description
) VALUES (
    'BRAND_A', 'BEHAVIOR_POINTS', '行为积分',
    false, true,
    'NATURAL_YEAR', 0,  -- 永不过期
    false, false,
    '记录用户行为（签到、浏览等），用于等级评估'
);
```
**规则配置**：
```text
┌─ 行为积分规则 ─────────────────────────────────────────────────────────┐
│ 积分类型： BEHAVIOR_POINTS                                              │
│ 积分名称： 行为积分                                                    │
│ 触发条件：                                                              │
│   ● 行为类型 ∈ [签到, 浏览, 分享, 评价]                               │
│ 奖励方式：                                                              │
│   ○ 签到 → 1 分                                                       │
│   ○ 浏览 → 0.5 分                                                     │
│   ○ 分享 → 2 分                                                       │
│   ○ 评价 → 3 分                                                       │
│ 有效期： 永久有效                                                       │
└──────────────────────────────────────────────────────────────────────────┘
```
### 2.3 自定义积分（CUSTOM\_POINTS）
#### 业务场景
| 场景   | 说明         |
| ---- | ---------- |
| 升级条件 | “参与指定活动N次” |
| 保级条件 | “完成指定任务”   |
#### 积分类型定义

```sql
INSERT INTO point_type_definition (
    program_code, type_code, type_name,
    is_redeemable, is_tier_calc,
    expiry_mode, expiry_value,
    allow_negative, allow_repay,
    description
) VALUES (
    'BRAND_A', 'CUSTOM_POINTS', '自定义积分',
    false, true,
    'NATURAL_YEAR', 0,  -- 永不过期
    false, false,
    '按需配置，用于特殊活动或任务的等级评估'
);
```
## 三、退单自动冲抵机制
### 3.1 核心原理
```text
订单完成（事务内）         退单（事务内）
      │                         │
      ▼                         ▼
发放积分 +1              扣减积分 -1
（transaction_type='ACCRUAL'）  （transaction_type='REFUND'）
      │                         │
      ▼                         ▼
account_transaction        account_transaction
记录：10001, +1, 已发放   记录：10001, -1, 已退款
      │                         │
      └─────────┬─────────────────┘
                ▼
        查询时自动计算净值
        SELECT SUM(amount) = 0
```
**关键点**：
* 发放和扣减都在同一事务中
* 通过 `transaction_type` 区分正向和逆向
* 查询时直接 `SUM(amount)` 即可得到净累积值
### 3.2 积分流水记录示例
**订单完成时（发放）**：
sql
```
INSERT INTO account_transaction (
    program_code, member_id, account_type,
    transaction_type, amount, remaining_amount,
    expires_at, status, created_at,
    reference_order_id, reference_sku
) VALUES (
    'BRAND_A', 'M123', 'PURCHASE_COUNT',
    'ACCRUAL', 1, 1,
    NULL, 'ACTIVE', NOW(),
    'ORDER_001', 'SKU_POSITIVE'
);
```
**退单时（扣减）**：
sql
```
-- 方式一：直接插入扣减流水
INSERT INTO account_transaction (
    program_code, member_id, account_type,
    transaction_type, amount, remaining_amount,
    expires_at, status, created_at,
    reference_order_id
) VALUES (
    'BRAND_A', 'M123', 'PURCHASE_COUNT',
    'REFUND', -1, 0,
    NULL, 'ACTIVE', NOW(),
    'ORDER_001'
);
-- 方式二：标记原有流水为已冲抵
UPDATE account_transaction 
SET status = 'REFUNDED' 
WHERE reference_order_id = 'ORDER_001' 
  AND account_type = 'PURCHASE_COUNT';
```
### 3.3 查询示例（评估周期内购买次数）
sql
```
SELECT COALESCE(SUM(amount), 0) 
FROM account_transaction 
WHERE member_id = 'M123'
  AND account_type = 'PURCHASE_COUNT'
  AND transaction_type = 'ACCRUAL'
  AND created_at >= '2026-01-01'
  AND created_at < '2027-01-01'
  AND status = 'ACTIVE';
```
**退单的流水不会被计入，因为 `transaction_type = 'REFUND'`，而且 `amount` 为负数，但正负相抵后净值也是0。**
**关键**：查询时只看 `ACCRUAL`，这样退单扣减的负值不会被计入结果，结果更准确。如果有部分退单（退一件商品），可以用 `reference_sku` 关联回扣减对应的积分。
## 四、升级规则多条件组合（AND/OR）
### 4.1 规则配置界面
```text
┌─ 升级规则配置 ────────────────────────────────────────────────────────────┐
│ 当前等级： [银卡 ▼]  目标等级： [金卡 ▼]                                 │
│                                                                             │
│ ┌─ 升级条件 ───────────────────────────────────────────────────────────────┐ │
│ │ 条件组合：                                                              │ │
│ │                                                                          │ │
│ │  ┌─ 条件组 1 ─────────────────────────────────────────────────────────┐ │ │
│ │  │ ● 条件类型： [积分 ▼]  积分类型： [TIER ▼]  要求值： [5000] 分    │ │ │
│ │  │   评估周期： [365] 天                                               │ │ │
│ │  └────────────────────────────────────────────────────────────────────┘ │ │
│ │                                                                          │ │
│ │   ○ 并且（AND）                                                          │ │
│ │   ● 或者（OR）                                                           │ │
│ │                                                                          │ │
│ │  ┌─ 条件组 2 ─────────────────────────────────────────────────────────┐ │ │
│ │  │ ● 条件类型： [积分 ▼]  积分类型： [PURCHASE_COUNT ▼]  要求值： [1] 次│ │ │
│ │  │   评估周期： [评估周期内]                                            │ │ │
│ │  └────────────────────────────────────────────────────────────────────┘ │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 说明 ───────────────────────────────────────────────────────────────────┐ │
│ │ 满足以下任一条件即可升级：                                               │ │
│ │   - 过去365天内累积的等级积分 ≥ 5000 分                                 │ │
│ │   - 购买过1次正价商品（PURCHASE_COUNT ≥ 1）                             │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```
### 4.2 规则存储 JSON
```json
{
  "rule_purpose": "TIER_UPGRADE",
  "source_tier": "SILVER",
  "target_tier": "GOLD",
  "conditions": {
    "operator": "OR",
    "condition_groups": [
      {
        "operator": "AND",
        "conditions": [
          {
            "type": "POINTS",
            "account_type": "TIER",
            "operator": ">=",
            "value": 5000,
            "window_days": 365,
            "mode": "TOTAL"
          }
        ]
      },
      {
        "operator": "AND",
        "conditions": [
          {
            "type": "POINTS",
            "account_type": "PURCHASE_COUNT",
            "operator": ">=",
            "value": 1,
            "window_days": 365,
            "mode": "TOTAL"
          }
        ]
      }
    ]
  }
}
```
### 4.3 DRL 生成示例
```drools
rule "SILVER_TO_GOLD_UPGRADE"
when
    $member: MemberFact(memberId == $event.memberId)
    // 获取过去365天的 TIER 积分总额
    $tierPoints: Number() from accumulate(
        $tx: AccountTransaction(
            memberId == $member.memberId,
            accountType == "TIER",
            transactionType == "ACCRUAL",
            createdAt >= $windowStart,
            status == "ACTIVE"
        ),
        sum($tx.amount)
    )
    // 获取过去365天的 PURCHASE_COUNT 积分总额
    $purchaseCount: Number() from accumulate(
        $tx: AccountTransaction(
            memberId == $member.memberId,
            accountType == "PURCHASE_COUNT",
            transactionType == "ACCRUAL",
            createdAt >= $windowStart,
            status == "ACTIVE"
        ),
        sum($tx.amount)
    )
    eval( $tierPoints >= 5000 || $purchaseCount >= 1 )
then
    // 执行升级
    tierEvaluationService.upgradeMember(
        $member.memberId,
        "GOLD",
        "UPGRADE",
        $event.getEventId()
    );
end
```
## 五、积分类型使用场景对照表
| 场景     | 使用积分类型                           | 说明         |
| ------ | -------------------------------- | ---------- |
| 订单消费累积 | `TIER`（金额）+ `PURCHASE_COUNT`（次数） | 同时记录金额和次数  |
| 正价商品购买 | `PURCHASE_COUNT`                 | 专门记录正价购买次数 |
| 签到     | `BEHAVIOR_POINTS`                | 记录签到行为     |
| 浏览     | `BEHAVIOR_POINTS`                | 记录浏览行为     |
| 分享     | `BEHAVIOR_POINTS`                | 记录分享行为     |
| 评价     | `BEHAVIOR_POINTS`                | 记录评价行为     |
| 特殊活动   | `CUSTOM_POINTS`                  | 按需配置       |
| 等级直升   | `TIER` / 不限                      | 满足条件直接升级   |
| 积分兑换   | `REWARD`                         | 用户兑换礼品     |
| 授信     | `CREDIT`                         | 系统授予信用额度   |
| 预售     | `PREPAY_CREDIT`                  | 预售临时积分     |
## 六、与现有设计的集成
| 能力     | 复用/新增                        | 说明                                                       |
| ------ | ---------------------------- | -------------------------------------------------------- |
| 积分类型定义 | ✅ 复用 `point_type_definition` | 新增 `PURCHASE_COUNT`、`BEHAVIOR_POINTS`、`CUSTOM_POINTS` 类型 |
| 积分流水表  | ✅ 复用 `account_transaction`   | 无需修改，直接使用                                                |
| 积分发放服务 | ✅ 复用 `PointGrantService`     | 支持新的积分类型                                                 |
| 等级评估引擎 | ✅ 扩展 `TierEvaluationService` | 支持查询多种积分类型                                               |
| 升级规则配置 | ✅ 复用 `rule_definition`       | `metadata` 中增加 `account_type` 和条件组合                      |
