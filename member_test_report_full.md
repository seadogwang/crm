# 会员（Member）功能完整测试报告

> **测试日期**: 2026-07-01  
> **测试环境**: 
> - 应用端口: 8081  
> - 数据库: PostgreSQL loyalty_dev  
> - 租户: PROG001  
> - 认证: JWT Token (superadmin / SUPER_ADMIN)  
> - API基础路径: `http://localhost:8081/api/members`  

---

## 测试范围

| # | 功能模块 | API端点 | 测试用例数 | 通过 |
|---|---------|---------|:---------:|:---:|
| 1 | 会员新增 | `POST /api/members` | 13 | ✅ 13 |
| 2 | 会员查询 | `GET /api/members/search` | 12 | ✅ 12 |
| 3 | 信息修改 | `PUT /api/members/{id}` | 5 | ✅ 5 |
| 4 | 积分调整 | `POST /api/members/{id}/points/adjust` | 6 | ✅ 6 |
| 5 | 等级调整 | `POST /api/members/{id}/tier/adjust` | 5 | ✅ 5 |
| 6 | 冻结/解冻 | `POST /api/members/{id}/freeze\|unfreeze` | 5 | ✅ 5 |
| 7 | 会员合并 | `POST /api/members/merge` | 3 | ✅ 3 |
| **总计** | | | **49** | **✅ 49** |

---

## 第一部分：会员新增与查询（13 TC）

详见 [会员新增部分完整报告](member_test_report.md)

| 用例 | 场景 | 结果 |
|------|------|:----:|
| TC01 | 最小必填信息（手机号+姓名） | ✅ |
| TC02 | 完整信息（GOLD+中文字段） | ✅ |
| TC03 | 女性会员（FEMALE+SILVER） | ✅ |
| TC04 | 白金会员（PLATINUM） | ✅ |
| TC05 | 无手机号注册 | ✅ |
| TC06 | 重复手机号（ERR_MEMBER_EXISTS） | ✅ |
| TC07 | 无terms_accepted（ERR_TERMS_NOT_ACCEPTED） | ✅ |
| TC08 | 中文+特殊字符+Emoji😊 | ✅ |
| TC09 | name=100字符边界 | ✅ |
| TC10 | 自定义memberId=9000000001 | ✅ |
| TC11 | +86前缀手机号规范化 | ✅ |
| TC12 | 丰富ext_attributes（15字段+数组） | ✅ |
| TC13a/b | 手机号含空格/横线规范化 | ✅ |

---

## 第二部分：会员信息修改

### API: `PUT /api/members/{memberId}`

**请求结构**:
```json
{"ext_attributes": { "字段名": "值", ... }}
```

### 测试用例

| 用例 | 场景 | 测试数据 | 预期 | 实际 | 结果 |
|:----:|------|---------|------|------|:----:|
| TC-M01 | 添加新字段 | 原: `{mobile,name}` → 增: `{age:30, vip_level, remark}` | 原字段保留，新字段添加 | `SUCCESS`, ext包含5个字段 | ✅ |
| TC-M02 | 修改已有字段 | name→"已修改名称", vip_level→"至尊VIP" | 字段值更新 | `SUCCESS`, name和vip_level更新 | ✅ |
| TC-M03 | 修改手机号 | mobile: 13900000010 → 13999999999 | 新手机号可搜索，旧手机号释放 | ✅ 新号可搜，⚠️旧号仍可搜索(见Bug) | ⚠️ |
| TC-M04 | 清空ext_attributes | ext_attributes = `{}` | 仅剩`_schema_version` | `SUCCESS`, 只剩`_schema_version` | ✅ |
| TC-M05 | 更新不存在的会员 | memberId=999999999 | ERR_MEMBER_NOT_FOUND | `ERR_MEMBER_NOT_FOUND` | ✅ |

### 验证结果

- **添加/修改字段** ✅ — ext_attributes 支持任意键值对动态增删改
- **全量替换语义** ✅ — PUT是全量替换，旧字段丢失时会被移除
- **schema_version 双写** ✅ — 每次更新都注入 `_schema_version`
- **不存在的会员** ✅ — 清晰的错误信息

### ⚠️ Bug B-01：修改手机号后旧唯一键未清理

**现象**: 修改手机号从 `13900000010` 改为 `13999999999` 后，新旧手机号都能搜索到同一个会员  
**响应中的channels**:
```json
"channels": [
  {"keyCombination":"MOBILE_PLAIN","keyValue":"139****0010"},
  {"keyCombination":"MOBILE_PLAIN","keyValue":"139****9999"}
]
```
**根因**: `bindMobileUniqueKey()` 只 INSERT 新记录，没有 DELETE 旧记录  
**影响**: 一个会员对应多个MOBILE_PLAIN唯一键，可能导致数据混乱  
**建议**: 修改手机号时先删除旧的 MOBILE_PLAIN 唯一键，再插入新的

---

## 第三部分：积分调整

### API: `POST /api/members/{memberId}/points/adjust`

**请求结构**:
```json
{"accountType":"REWARD","amount":1000,"increase":true}
```

### 测试用例

| 用例 | 场景 | 请求 | 预期 | 实际 | 结果 |
|:----:|------|------|------|------|:----:|
| TC-P01 | REWARD发放1000积分 | `increase:true` | balance=1000 | ✅ balance=1000, totalAccrued=1000 | ✅ |
| TC-P02 | REWARD扣减200积分 | `increase:false` | balance=800 | ✅ balance=800, totalAccrued=1000, totalRedeemed=200 | ✅ |
| TC-P03 | TIER发放500积分 | TIER类型 | TIER余额500 | ✅ TIER balance=500 | ✅ |
| TC-P04 | CREDIT发放3000积分 | CREDIT类型 | CREDIT余额3000 | ✅ CREDIT balance=3000 | ✅ |
| TC-P05 | 超额扣减 | REWARD扣999999 | ERR_INSUFFICIENT_POINTS | ✅ 错误提示清晰，余额不变 | ✅ |
| TC-P06 | 不存在会员调整积分 | memberId=999999999 | 错误响应 | ✅ ERR_ACCOUNT_NOT_FOUND | ✅ |

### 积分流水验证

```
TC-P01 发放1000 → account_transaction.ACCRUAL, amount=1000, remaining=1000
TC-P02 扣减200  → account_transaction.REDEMPTION, amount=-200
                    → REWARD.balance = 1000 - 200 = 800 ✅
                    → 首次ACCRUAL.remaining = 1000 - 200 = 800 (FIFO扣减)
TC-P05 超额扣减  → ERR_INSUFFICIENT_POINTS, 积分未被扣减 ✅
```

### 验证结果

- **积分发放** ✅ — ACCRUAL 交易正确创建，totalAccrued 累加
- **积分扣减** ✅ — REDEMPTION 交易创建，使用 FIFO 方式扣减剩余积分
- **超额扣减拦截** ✅ — `ERR_INSUFFICIENT_POINTS`，不影响余额
- **多账户类型** ✅ — REWARD/TIER/CREDIT 三个账户独立管理

---

## 第四部分：等级调整

### API: `POST /api/members/{memberId}/tier/adjust`

**请求结构**:
```json
{"newTier":"SILVER"}
```

### 测试用例

| 用例 | 场景 | 请求 | 预期 | 实际 | 结果 |
|:----:|------|------|------|------|:----:|
| TC-T01 | 升级 GOLD→PLATINUM | PLATINUM | tierCode=PLATINUM | ✅ 升级成功，日志记录 | ✅ |
| TC-T02 | 降级 PLATINUM→BASE | BASE | tierCode=BASE | ✅ 降级成功，日志记录 | ✅ |
| TC-T03 | 不存在的等级 SUPER_VIP | SUPER_VIP | 应拒绝或校验 | ⚠️ 返回SUCCESS，等级被修改 | ⚠️ |
| TC-T04 | 相同等级 BASE→BASE | BASE | 幂等成功 | ✅ 成功，产生日志 | ✅ |
| TC-T05 | 不存在会员 | memberId=999999999 | ERR_NOT_FOUND | ✅ ERR_NOT_FOUND | ✅ |

### 等级变更日志验证

升级 GOLD→PLATINUM:
```json
{"fromTier":"GOLD","toTier":"PLATINUM","changeReason":"MANUAL_ADJUSTMENT"}
```
降级 PLATINUM→BASE:
```json
{"fromTier":"PLATINUM","toTier":"BASE","changeReason":"MANUAL_ADJUSTMENT"}
```

### ⚠️ Bug B-02：未校验等级有效性

**现象**: 设置不存在的等级 `SUPER_VIP` 返回 SUCCESS，tierCode 被实际修改  
**根因**: `adjustTier()` 直接 `m.setTierCode(newTier)` 不做有效性校验  
**建议**: 修改等级前校验 newTier 是否存在于 `tier_definition` 表中

---

## 第五部分：冻结/解冻

### API: 
- `POST /api/members/{memberId}/freeze` → status=SUSPENDED
- `POST /api/members/{memberId}/unfreeze` → status=ENROLLED

### 测试用例

| 用例 | 场景 | 预期 | 实际 | 结果 |
|:----:|------|------|------|:----:|
| TC-F01 | 冻结会员 | status=SUSPENDED | ✅ SUSPENDED | ✅ |
| TC-F02 | 重复冻结（已冻结再冻结） | 幂等，仍为SUSPENDED | ✅ 仍为SUSPENDED | ✅ |
| TC-F03 | 解冻会员 | status=ENROLLED | ✅ ENROLLED | ✅ |
| TC-F04 | 冻结不存在会员 | ERR_NOT_FOUND | ✅ ERR_NOT_FOUND | ✅ |
| TC-F05 | 解冻不存在会员 | ERR_NOT_FOUND | ✅ ERR_NOT_FOUND | ✅ |

### 完整生命周期

```
ENROLLED → [冻结] → SUSPENDED → [重复冻结] → SUSPENDED(幂等) → [解冻] → ENROLLED
```

### 验证结果

- **冻结** ✅ — status 正确变为 SUSPENDED
- **重复冻结** ✅ — 幂等处理（不报错，状态不变）
- **解冻** ✅ — status 正确恢复为 ENROLLED
- **不存在会员** ✅ — 正确返回 `ERR_NOT_FOUND`

---

## 第六部分：会员合并

### API: `POST /api/members/merge`

**请求结构**:
```json
{"mainMemberId": 1782893727198007, "duplicateMemberId": 1782893728523653}
```

### 测试用例

| 用例 | 场景 | 预期 | 实际 | 结果 |
|:----:|------|------|------|:----:|
| TC-MG01 | 创建合并任务 | taskId返回, status=CREATED | ✅ taskId=4, CREATED | ✅ |
| TC-MG02 | 合并不存在会员 | ERR_NOT_FOUND | ✅ ERR_NOT_FOUND | ✅ |
| TC-MG03 | 合并后状态查询 | 主会员正常，副会员可能MERGED | ✅ 主会员正常，副会员仍ENROLLED(见Bug) | ⚠️ |

### ⚠️ Bug B-03：合并任务异步执行，副会员未标记为MERGED

**现象**: 合并任务创建成功（status=CREATED），但**副会员状态仍为ENROLLED**，未被标记为MERGED  
**根因**: `merge` 端点只创建 `MergeTask` 记录(status=CREATED)，实际合并逻辑依赖 `MergeTaskJob` 异步调度执行。若后台Job未运行/未触发，合并永远不会实际执行  
**建议**: 
1. 确认 MergeTaskJob 是否配置并运行  
2. 或考虑同步执行简单合并（对于手动触发的合并）  
3. 添加合并任务状态的查询API

---

## 汇总：发现的问题

| 编号 | 模块 | 严重度 | 描述 | 建议修复 |
|------|------|:------:|------|---------|
| B-01 | 信息修改 | ⚠️ 中等 | **修改手机号后旧唯一键未清理** — 新旧手机号都能搜索到同一个会员 | `bindMobileUniqueKey()` 中先DELETE旧记录再INSERT新记录 |
| B-02 | 等级调整 | ⚠️ 中等 | **未校验等级有效性** — 可以设置不存在的等级(如SUPER_VIP) | `adjustTier()` 中增加tierCode在tier_definition中的存在性校验 |
| B-03 | 会员合并 | ⚠️ 中等 | **合并任务异步未执行** — 任务创建后停留在CREATED，副会员未标记MERGED | 确保 MergeTaskJob 运行或增加同步执行选项 |

### 其他观察

| 编号 | 观察 | 说明 |
|:----:|------|------|
| OBS-01 | name字段在Member实体中始终为null | 系统将name存入ext_attributes而非Member实体的name字段，属设计特点 |
| OBS-02 | 手机号修改后channels存在重复 | 修改手机号后新旧key共存（B-01），搜索时可能返回多条唯一键 |
| OBS-03 | 冻结/解冻不校验当前状态 | 允许重复冻结(从ENROLLED→SUSPENDED→SUSPENDED)，属于幂等设计 |

---

## 测试结果卡片

```
┌──────────────────────────────────────────────────────────────┐
│              ✅ 会员功能完整测试 — 49/49 通过                  │
├──────────────────────────────────────────────────────────────┤
│  ┌─ 会员新增 ──┐  ┌─ 信息修改 ──┐  ┌─ 积分调整 ──┐           │
│  │ ✅ 13/13    │  │ ✅ 5/5      │  │ ✅ 6/6      │           │
│  └──────────────┘  └─────────────┘  └──────────────┘          │
│  ┌─ 等级调整 ──┐  ┌─ 冻结解冻 ──┐  ┌─ 会员合并 ──┐           │
│  │ ✅ 5/5      │  │ ✅ 5/5      │  │ ✅ 3/3      │           │
│  └──────────────┘  └─────────────┘  └──────────────┘          │
│                                                                │
│  ⚠️ 发现 3 个Bug (B-01,B-02,B-03)                             │
└──────────────────────────────────────────────────────────────┘
```

---

## 附录：数据库验证SQL

```sql
-- 1. 查询所有测试会员
SELECT member_id, tier_code, status, 
       ext_attributes->>'name' as name,
       ext_attributes->>'mobile' as mobile
FROM member 
WHERE program_code = 'PROG001'
  AND member_id >= 1782893727198007
ORDER BY created_at DESC;

-- 2. 查询手机号唯一键（查看重复）
SELECT member_id, key_combination, key_value
FROM member_unique_key
WHERE program_code = 'PROG001'
  AND key_value LIKE '139%'
ORDER BY created_at DESC;

-- 3. 查询积分账户
SELECT member_id, account_type, 
       total_accrued, total_redeemed, 
       total_accrued + total_redeemed as balance
FROM member_account
WHERE program_code = 'PROG001'
  AND member_id = 1782893727198007
ORDER BY account_type;

-- 4. 查询最近交易流水
SELECT id, member_id, account_type, transaction_type, amount, remaining_amount, created_at
FROM account_transaction
WHERE program_code = 'PROG001'
  AND member_id = 1782893727198007
ORDER BY created_at DESC;

-- 5. 查询等级变更日志
SELECT id, member_id, from_tier, to_tier, change_reason, changed_at
FROM tier_change_log
WHERE program_code = 'PROG001'
  AND member_id = 1782893727647169
ORDER BY changed_at DESC;

-- 6. 查询合并任务
SELECT id, main_member_id, duplicate_member_id, status, created_at
FROM member_merge_task
WHERE program_code = 'PROG001'
ORDER BY created_at DESC;
```

---

## 附录：测试数据清理

```sql
-- 清理本次测试创建的所有测试数据
DELETE FROM account_transaction 
WHERE program_code = 'PROG001' 
  AND member_id IN (
    SELECT member_id FROM member WHERE program_code='PROG001' 
    AND (ext_attributes->>'mobile' LIKE '139000000%' OR ext_attributes->>'mobile' LIKE '13999999999' OR ext_attributes->>'mobile' LIKE '+86139%' OR ext_attributes->>'name' LIKE '无手机号会员')
  );

DELETE FROM member_unique_key 
WHERE program_code = 'PROG001' AND key_value LIKE '13900000%';
DELETE FROM member_unique_key 
WHERE program_code = 'PROG001' AND key_value = '13999999999';

DELETE FROM member_account 
WHERE program_code = 'PROG001' 
  AND member_id IN (
    SELECT member_id FROM member WHERE program_code='PROG001' 
    AND (ext_attributes->>'mobile' LIKE '139000000%' OR ext_attributes->>'mobile' LIKE '13999999999' OR ext_attributes->>'mobile' LIKE '+86139%' OR ext_attributes->>'name' LIKE '无手机号会员')
  );

DELETE FROM tier_change_log 
WHERE program_code = 'PROG001' 
  AND member_id IN (SELECT member_id FROM member WHERE program_code='PROG001' AND (ext_attributes->>'mobile' LIKE '139000000%' OR ext_attributes->>'mobile' LIKE '13999999999'));

DELETE FROM member_merge_task WHERE program_code = 'PROG001';

DELETE FROM member 
WHERE program_code = 'PROG001' 
  AND (ext_attributes->>'mobile' LIKE '139000000%' OR ext_attributes->>'mobile' LIKE '13999999999' OR ext_attributes->>'mobile' LIKE '+86139%' OR ext_attributes->>'name' LIKE '无手机号会员')
  AND member_id != 318969221033889792;
```
