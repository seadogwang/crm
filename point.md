# 积分类型补充设计文档：可冲抵积分（负债积分）
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：1.0\
> **设计目标**：扩展积分类型系统，支持“可冲抵积分”作为独立的积分行为属性，实现预售积分冲抵、会员授信积分等业务场景。
## 一、背景与业务场景
### 1.1 业务需求
忠诚度平台需要支持以下业务场景：
| 场景       | 说明                                           | 积分行为                   |
| -------- | -------------------------------------------- | ---------------------- |
| **预售冲抵** | 用户支付预售定金，系统发放临时积分（可兑礼），正式订单到达后，用正式积分冲抵临时积分负债 | 临时积分可兑礼，但需要用后续正式积分“还债” |
| **会员授信** | 系统授予会员信用积分（可兑礼），后续用消费积分偿还授信额度                | 授信积分可兑礼，需要用后续消费积分“还债”  |
这些场景的共同特征是：**积分发放时可用于兑换，但本质上是负债，需要用后续的正式积分来冲抵。**
### 1.2 设计目标
* 支持积分的**可冲抵性**作为独立的积分类型属性（与“可兑换”、“算等级”、“允许负分”并列）
* **冲抵方向**：正式积分（消费积分）发放时，自动冲抵会员名下的可冲抵积分负债
* **冲抵顺序**：按过期时间从近到远（FEFO，First Expired First Offset）
* 支持**同类型多账户**：同一会员可同时拥有多个可冲抵积分账户（如不同活动、不同渠道的预售积分）
* **完整的冲抵明细**：记录每次冲抵的源流水、目标流水、冲抵金额，支持追溯和退单补偿
## 二、积分类型属性扩展
### 2.1 新增属性：`allow_repay`
在积分类型定义中增加 `allow_repay` 属性，与 `is_redeemable`、`is_tier_calc`、`allow_negative` 并列，作为积分类型的**行为属性**。
| 属性            | 类型      | 默认值     | 说明                           |
| ------------- | ------- | ------- | ---------------------------- |
| `allow_repay` | Boolean | `false` | 该积分类型是否属于“负债积分”，允许被后续的正向积分冲抵 |
### 2.2 积分类型配置矩阵
| 类型代码            | 名称         | `is_redeemable` | `is_tier_calc` | `allow_negative` | `allow_repay` | 业务语义                  |
| --------------- | ---------- | --------------- | -------------- | ---------------- | ------------- | --------------------- |
| `REWARD`        | 消费积分       | `true`          | `false`        | `false`          | `false`       | 正式资产，最终归属用户，不可冲抵      |
| `TIER`          | 成长值        | `false`         | `true`         | `false`          | `false`       | 等级成长值，不参与兑换与冲抵        |
| `CREDIT`        | 授信积分（信用额度） | `true`          | `false`        | `true`           | `false`       | 固定授信额度（系统预设），不参与冲抵    |
| `PREPAY_CREDIT` | 预售积分       | `true`          | `false`        | `false`          | `true`        | **负债积分**，可兑礼，需用正式积分冲抵 |
### 2.3 `allow_repay` 与 `is_redeemable` 的关系
* **正交属性，互不影响**：一个积分可以同时 `is_redeemable = true` 且 `allow_repay = true`（预售积分）
* 系统冲抵时，只关注 `allow_repay`，不关心 `is_redeemable`
## 三、数据模型变更
### 3.1 修改 `point_type_definition` 表
```sql
-- 新增 allow_repay 字段
ALTER TABLE point_type_definition ADD COLUMN allow_repay BOOLEAN DEFAULT false;
COMMENT ON COLUMN point_type_definition.allow_repay IS '该积分类型是否属于负债积分，允许被后续的正向积分冲抵';
```
### 3.2 修改 `member_account` 表
```sql
-- 新增负债余额字段（冗余字段，用于快速查询待冲抵总额）
ALTER TABLE member_account ADD COLUMN pending_repay_amount NUMERIC(18,4) DEFAULT 0;
COMMENT ON COLUMN member_account.pending_repay_amount IS '该账户下待冲抵的负债积分总额（仅当 account_type 的 allow_repay=true 时有效）';
```
### 3.3 修改 `account_transaction` 表
```sql
-- 新增冲抵标记字段
ALTER TABLE account_transaction ADD COLUMN repayable BOOLEAN DEFAULT false;
COMMENT ON COLUMN account_transaction.repayable IS '该笔流水是否可被后续交易冲抵（仅当 transaction_type=ACCRUAL 且积分类型 allow_repay=true 时标记）';
ALTER TABLE account_transaction ADD COLUMN repaid_amount NUMERIC(18,4) DEFAULT 0;
COMMENT ON COLUMN account_transaction.repaid_amount IS '该笔流水已被冲抵的金额（累计值）';
```
### 3.4 新增冲抵明细表 `repayment_allocation`
用于记录每次冲抵的明细，支持追溯和退单补偿。
```sql
CREATE TABLE repayment_allocation (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    
    -- 冲抵关系
    repayment_tx_id BIGINT NOT NULL,        -- 用于冲抵的积分流水（REWARD 的发放流水）
    repayable_tx_id BIGINT NOT NULL,         -- 被冲抵的负债流水（allow_repay=true 的发放流水）
    
    -- 冲抵金额
    offset_amount NUMERIC(18,4) NOT NULL,
    
    -- 状态
    status VARCHAR(20) DEFAULT 'ACTIVE',     -- ACTIVE / COMPENSATED（退单补偿后标记）
    created_at TIMESTAMPTZ DEFAULT NOW(),
    compensated_at TIMESTAMPTZ               -- 补偿时间（退单回滚时）
);
CREATE INDEX idx_repay_repayment ON repayment_allocation(repayment_tx_id);
CREATE INDEX idx_repay_repayable ON repayment_allocation(repayable_tx_id);
CREATE INDEX idx_repay_member ON repayment_allocation(program_code, member_id);
```
## 四、冲抵引擎详细设计
### 4.1 冲抵方向
```text
正式积分（REWARD）发放 → 检查会员名下所有 allow_repay=true 的积分账户 → 按 FEFO 顺序冲抵负债 → 剩余金额继续入账
```
**核心原则**：
* **冲抵方**：`allow_repay = false` 的积分类型（如 `REWARD`）
* **被冲抵方**：`allow_repay = true` 的积分类型（如 `PREPAY_CREDIT`）
### 4.2 冲抵顺序（FEFO）
按负债流水**过期时间从近到远**排序，优先冲抵即将过期的积分：
```sql
SELECT * FROM account_transaction
WHERE member_id = ? 
  AND repayable = true 
  AND status = 'ACTIVE' 
  AND remaining_amount > 0 
  AND expires_at IS NOT NULL
ORDER BY expires_at ASC, created_at ASC
```
### 4.3 冲抵逻辑伪代码
```java
@Transactional
public void grantPoints(String programCode, String memberId, String accountType, 
                        BigDecimal pointsToGrant, String ruleId, String ruleSnapshotId) {
    
    PointTypeDefinition pointType = pointTypeRepo.findByProgramCodeAndTypeCode(programCode, accountType);
    BigDecimal remaining = pointsToGrant;
    
    // 如果是正式积分（allow_repay=false），检查是否需要冲抵负债
    if (!pointType.isAllowRepay()) {
        // 查找该会员所有可冲抵的负债流水（allow_repay=true）
        List<AccountTransaction> repayableTxList = transactionRepo.findRepayableForMember(
            programCode, memberId, Sort.by(Sort.Direction.ASC, "expiresAt", "createdAt")
        );
        
        for (AccountTransaction repayableTx : repayableTxList) {
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            
            // 查询该笔负债剩余可冲抵金额（原始余额 - 已冲抵 - 已消耗）
            BigDecimal availableDebt = repayableTx.getRemainingAmount()
                .subtract(repayableTx.getReclaimedAmount()); // 已在 4.5 中说明
            
            BigDecimal offsetAmount = remaining.min(availableDebt);
            
            // 执行冲抵：更新负债流水
            repayableTx.setRepaidAmount(repayableTx.getRepaidAmount().add(offsetAmount));
            if (repayableTx.getRepaidAmount().compareTo(repayableTx.getOriginalAmount()) >= 0) {
                repayableTx.setStatus("REPAID");
            }
            transactionRepo.save(repayableTx);
            
            // 记录冲抵明细
            repaymentAllocationRepo.save(new RepaymentAllocation(
                programCode, memberId, 
                repaymentTxId,   // 本次发放的流水ID（先占位，发放后更新）
                repayableTx.getId(), 
                offsetAmount
            ));
            
            remaining = remaining.subtract(offsetAmount);
        }
    }
    
    // 如果剩余积分 > 0，正常发放
    if (remaining.compareTo(BigDecimal.ZERO) > 0) {
        AccountTransaction tx = createTransaction(memberId, accountType, "ACCRUAL", remaining);
        // 如果是负债积分（allow_repay=true），标记为可冲抵
        if (pointType.isAllowRepay()) {
            tx.setRepayable(true);
        }
        transactionRepo.save(tx);
        
        // 更新冲抵明细中的 repayment_tx_id（如果有冲抵发生）
        if (repaymentTxId == null) {
            repaymentTxId = tx.getId();
            repaymentAllocationRepo.updateRepaymentTxId(repaymentTxId);
        }
        
        // 更新账户累计统计
        memberAccountRepo.incrementTotalAccrued(memberId, accountType, remaining);
    }
}
```
### 4.4 冲抵明细表的补偿字段
为了支持退单场景的精确补偿，在 `repayment_allocation` 中需要记录**被冲抵负债流水的原始剩余金额**（冲抵前快照）。
```sql
-- 增加快照字段
ALTER TABLE repayment_allocation ADD COLUMN snapshot_remaining_before NUMERIC(18,4);
COMMENT ON COLUMN repayment_allocation.snapshot_remaining_before IS '冲抵前该负债流水的 remaining_amount（用于退单补偿恢复）';
```
### 4.5 负债流水关键字段
为支持冲抵状态追踪，`account_transaction` 表需要精确区分负债的**可冲抵余额**和**已消耗余额**：
```sql
-- 最终方案：用 remaining_amount（账务余额）统一管理
-- remaining_amount：当前剩余可用额度（含可冲抵部分 + 已消耗但未冲抵部分）
-- 
-- 对于负债积分（allow_repay=true）：
--   - 发放时：remaining_amount = 发放金额
--   - 兑换时：remaining_amount = remaining_amount - 兑换金额
--   - 冲抵时：remaining_amount = remaining_amount - 冲抵金额
--   - 当 remaining_amount = 0 时，status = 'REPAID'
-- 
-- 关键：冲抵和兑换都减少同一个 remaining_amount，
--       所以需要按 created_at 排序，先产生的先消耗
```
**改进的查询逻辑**：
```sql
-- 查询可用负债余额（未过期、未被完全冲抵、未被完全消耗）
SELECT SUM(remaining_amount) 
FROM account_transaction
WHERE member_id = ?
  AND repayable = true
  AND status = 'ACTIVE'
  AND remaining_amount > 0
  AND (expires_at IS NULL OR expires_at > NOW());
-- 查询待冲抵负债明细（按 FEFO 顺序）
SELECT * FROM account_transaction
WHERE member_id = ?
  AND repayable = true
  AND status = 'ACTIVE'
  AND remaining_amount > 0
  AND (expires_at IS NULL OR expires_at > NOW())
ORDER BY expires_at ASC NULLS LAST, created_at ASC;
```
### 4.6 与现有瀑布流冲抵机制的关系
| 现有机制              | 新机制                       | 协作方式                                          |
| ----------------- | ------------------------- | --------------------------------------------- |
| 透支冲抵（被动透支还款）      | 积分冲抵（主动负债偿还）              | 先执行透支冲抵（补天窗），再执行负债冲抵（还授信）                     |
| 信用还款（跨账户还 CREDIT） | 负债冲抵（跨账户还 PREPAY\_CREDIT） | 使用相同的跨账户还款模式，复用同一套冲抵框架                        |
| 积分的核销             | 积分的归还                     | 可以理解为相反的核销，但需要作为独立的 account\_transaction 类型记录 |
## 五、积分类型配置与使用
### 5.1 运营后台积分类型配置
积分类型列表新增“可被冲抵”开关：
```text
┌─ 积分类型配置 ──────────────────────────────────────────────┐
│ 类型代码: [PREPAY_CREDIT                                    ] │
│ 类型名称: [预售积分                                         ] │
│ 可兑换:   [✓]                                                │
│ 算等级:   [ ]                                                │
│ 允许负分: [ ]                                                │
│ 可被冲抵: [✓]  ← 新增字段                                   │
│ 有效期:   [30天 ▼]                                           │
│                                                              │
│ 说明：可被冲抵的积分属于负债积分，                         │
│       发放后会记录为待冲抵负债，                         │
│       后续发放非冲抵类积分时将自动冲抵。              │
└─────────────────────────────────────────────────────────────┘
```
### 5.2 规则引擎中的配置
运营人员在规则动作中选择积分类型时，系统显示所有可用类型，并在类型名称后标注“可冲抵”标签：
```text
发放积分：
  积分类型: [预售积分 (可冲抵) ▼]   ← 带有可冲抵标签
  积分数量: [ ${order.amount} ]
```
## 六、用户端展示
### 6.1 用户积分账户显示
用户的“积分明细”页面需要清晰展示负债积分的状态：
| 积分类型 | 总积分  | 可用  | 待冲抵 | 说明      |
| ---- | ---- | --- | --- | ------- |
| 消费积分 | 1000 | 500 | -   | 可正常使用   |
| 预售积分 | 200  | 0   | 200 | 待冲抵，不可用 |
### 6.2 前端展示逻辑
1. 用户总可用积分 = 所有非负债积分账户的可用余额之和
2. 负债积分（`allow_repay = true`）可用余额**不展示**在总可用积分中（或单独展示为“待冲抵”）
3. 负债积分在积分明细中标记为“待冲抵”状态
### 6.3 积分流水展示
| 时间               | 事件        | 变动   | 类型          | 说明               |
| ---------------- | --------- | ---- | ----------- | ---------------- |
| 2026-06-01 10:00 | 预售订单 P001 | +200 | 预售积分（待冲抵）   | 预售金额200元，待正式订单冲抵 |
| 2026-06-01 11:00 | 兑换优惠券     | -50  | 预售积分        | 使用预售积分兑换         |
| 2026-06-10 14:00 | 冲抵        | -150 | 消费积分 → 预售积分 | 正式订单冲抵剩余预售积分     |
## 七、逆向处理（退单补偿）
### 7.1 正式订单退单
正式订单的积分（用于冲抵的 REWARD）被回滚，需恢复对应的负债积分余额。
```java
@Transactional
public void compensateRefund(String programCode, String memberId, Long refundTxId) {
    // 1. 找到该正式订单产生的所有冲抵明细
    List<RepaymentAllocation> allocations = repaymentAllocationRepo.findByRepaymentTxId(refundTxId);
    
    for (RepaymentAllocation alloc : allocations) {
        // 2. 恢复被冲抵的负债流水
        AccountTransaction repayableTx = transactionRepo.findById(alloc.getRepayableTxId());
        repayableTx.setRemainingAmount(repayableTx.getRemainingAmount().add(alloc.getOffsetAmount()));
        if ("REPAID".equals(repayableTx.getStatus())) {
            repayableTx.setStatus("ACTIVE");
        }
        transactionRepo.save(repayableTx);
        
        // 3. 标记冲抵明细为“已补偿”
        alloc.setStatus("COMPENSATED");
        alloc.setCompensatedAt(LocalDateTime.now());
        repaymentAllocationRepo.save(alloc);
    }
}
```
### 7.2 预售订单退单
预售订单退单时，需扣回已发放的负债积分：
```java
@Transactional
public void handlePrepayOrderRefund(String programCode, String memberId, Long prepayTxId) {
    AccountTransaction prepayTx = transactionRepo.findById(prepayTxId);
    
    // 如果该笔负债已被部分或全部消耗（兑换或冲抵），需根据消耗情况扣减积分
    BigDecimal remainingToDeduct = prepayTx.getOriginalAmount().subtract(prepayTx.getRemainingAmount());
    if (remainingToDeduct.compareTo(BigDecimal.ZERO) > 0) {
        // 调用积分扣减逻辑
        pointDeductService.deductPoints(memberId, "PREPAY_CREDIT", remainingToDeduct);
    }
}
```
## 八、对现有设计的改造清单
### 8.1 数据库变更
| 表                         | 变更                                |
| ------------------------- | --------------------------------- |
| `point_type_definition`   | 新增 `allow_repay` 字段               |
| `member_account`          | 新增 `pending_repay_amount` 字段      |
| `account_transaction`     | 新增 `repayable`、`repaid_amount` 字段 |
| 新增 `repayment_allocation` | 冲抵明细表                             |
### 8.2 代码变更
| 模块                                   | 变更                                          |
| ------------------------------------ | ------------------------------------------- |
| `PointTypeDefinition` 实体             | 新增 `allow_repay` 属性                         |
| `MemberAccount` 实体                   | 新增 `pendingRepayAmount` 属性                  |
| `AccountTransaction` 实体              | 新增 `repayable`、`repaidAmount` 属性            |
| `PointGrantService`                  | 增加冲抵逻辑（4.3 伪代码）                             |
| `PointDeductService`                 | 扣减负债积分时，更新 `pending_repay_amount`           |
| `TransactionRepository`              | 新增 `findRepayableForMember()` 方法（按 FEFO 排序） |
| `RepaymentAllocation` 实体及 Repository | 新增冲抵明细管理                                    |
### 8.3 前端变更
| 页面     | 变更                          |
| ------ | --------------------------- |
| 积分类型配置 | 新增“可被冲抵”开关                  |
| 规则编辑器  | 积分类型下拉显示“可冲抵”标签             |
| 用户积分明细 | 区分“总可用积分”与“待冲抵积分”，增加“待冲抵”状态 |
## 九、与其他积分类型的关系总结
| 积分类型                  | `is_redeemable` | `allow_repay` | 与冲抵引擎的关系                  |
| --------------------- | --------------- | ------------- | ------------------------- |
| `REWARD`（消费积分）        | true            | false         | **冲抵方**：发放时检查负债，主动冲抵      |
| `CREDIT`（授信积分）        | true            | false         | **不参与冲抵**：固定额度授信，不与普通积分互冲 |
| `PREPAY_CREDIT`（预售积分） | true            | true          | **被冲抵方**：负债等待被正式积分冲抵      |
| `TIER`（成长值）           | false           | false         | **不参与冲抵**：仅用于等级计算         |
| 其他自定义积分               | 按配置             | 按配置           | 根据 `allow_repay` 决定角色     |
## 十、总结
本设计文档扩展了积分类型系统，增加 `allow_repay` 属性作为积分类型的**行为属性**，用于标识该积分是否属于“负债积分”（可兑换，但需要用后续正式积分冲抵）。
**核心机制**：
1. **冲抵方向**：正式积分（`allow_repay = false`）发放时，自动冲抵会员名下的负债积分（`allow_repay = true`）
2. **冲抵顺序**：按过期时间从近到远（FEFO）
3. **冲抵记录**：通过 `repayment_allocation` 表记录每次冲抵的明细，支持退单补偿
**业务价值**：
* 实现预售积分冲抵、会员授信积分等复杂业务场景
* 积分类型配置灵活，运营人员可通过开关控制
* 完整的冲抵明细和补偿机制，保障金融级账务一致性
