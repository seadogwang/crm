# 会员动态属性全生命周期测试报告

> **测试日期**: 2026-07-01  
> **会员ID**: `1782902686693396`  
> **手机号**: `17700000001`  
> **初始等级**: SILVER  
> **API基础路径**: `http://localhost:8081/api/members`

---

## 测试流程

```
创建会员(25个动态属性) → 查询验证 → 积分操作(3种账户) → 等级调整 → 冻结解冻 → 最终查询验证
```

## Step 1: 创建含动态属性的会员

### 请求数据 — 25个动态属性字段

| 字段 | 值 | 类型 | 说明 |
|------|------|:----:|------|
| `name` | "动态属性测试会员" | string | 中文姓名 |
| `mobile` | "17700000001" | string | 手机号 |
| `gender` | "FEMALE" | enum string | 性别枚举 |
| `birthday` | "1992-08-20" | string(date) | 出生日期 |
| `email` | "dynamic_test@example.com" | string | 邮箱 |
| `city` | "上海市" | string | 城市 |
| `age` | 32 | number | 年龄 |
| `vip_level` | "DIAMOND" | enum string | VIP等级 |
| `membership_source` | "APP" | enum string | 注册来源 |
| `annual_income` | 500000 | number | 年收入 |
| `preferred_channel` | "WECHAT" | enum string | 偏好通知渠道 |
| `tags` | ["高净值","活跃用户","母婴类目偏好"] | array(string) | 会员标签 |
| `hobbies` | ["瑜伽","旅行","阅读"] | array(string) | 兴趣爱好 |
| `referral_code` | "REF2026VIP001" | string | 推荐码 |
| `notes` | "重要客户，生日月赠送双倍积分" | string | 客服备注 |
| `id_verified` | true | boolean | 实名认证 |
| `last_purchase_date` | "2026-06-28" | string(date) | 最近购买日期 |
| `total_points_earned` | 15000 | number | 累计获得积分 |
| `member_tenure_months` | 24 | number | 会员月数 |
| `preferred_store` | "上海静安店" | string | 偏好门店 |
| `consent_marketing` | true | boolean | 同意营销推送 |
| `pet_name` | "布丁" | string | 宠物名称 |
| `total_spent` | 86800 | number | 累计消费 |
| `total_orders` | 156 | number | 累计订单数 |

### 响应

```json
{
  "code": "SUCCESS",
  "data": {
    "memberId": 1782902686693396,
    "tierCode": "SILVER",
    "status": "ENROLLED",
    "schemaVersion": "MEMBER:v2",
    "extAttributes": {
      "name": "动态属性测试会员",
      "mobile": "17700000001",
      "gender": "FEMALE",
      "birthday": "1992-08-20",
      "email": "dynamic_test@example.com",
      "city": "上海市",
      "age": 32,
      "vip_level": "DIAMOND",
      "membership_source": "APP",
      "annual_income": 500000,
      "preferred_channel": "WECHAT",
      "tags": ["高净值", "活跃用户", "母婴类目偏好"],
      "hobbies": ["瑜伽", "旅行", "阅读"],
      "referral_code": "REF2026VIP001",
      "notes": "重要客户，生日月赠送双倍积分",
      "id_verified": true,
      "last_purchase_date": "2026-06-28",
      "total_points_earned": 15000,
      "member_tenure_months": 24,
      "preferred_store": "上海静安店",
      "consent_marketing": true,
      "pet_name": "布丁",
      "total_spent": 86800,
      "total_orders": 156,
      "_schema_version": "MEMBER:v2"
    }
  }
}
```

### Step 1 验证: ✅ 全部通过

| 验证项 | 结果 | 说明 |
|--------|:----:|------|
| 创建成功 | ✅ | code=SUCCESS |
| memberId自动生成 | ✅ | 1782902686693396 |
| tierCode=SILVER | ✅ | 指定等级生效 |
| status=ENROLLED | ✅ | 默认状态 |
| schema_version双写 | ✅ | schemaVersion字段 + extAttributes._schema_version |
| 手机号唯一键 | ✅ | MOBILE_PLAIN已生成 |
| 4个积分账户 | ✅ | CREDIT/record/REWARD/TIER全创建 |

---

## Step 2: 查询验证动态属性

### 手机号搜索 (keyword=17700000001) ✅
### memberId详情查询 ✅

### 动态属性数据类型验证

| 数据类型 | 字段 | 验证 | 结果 |
|:--------:|------|------|:----:|
| **string** | name, email, city, pet_name, referral_code | "动态属性测试会员" | ✅ |
| **number** | age(32), annual_income(500000), total_spent(86800) | 数值正确 | ✅ |
| **boolean** | id_verified(true), consent_marketing(true) | true正确 | ✅ |
| **array(string)** | tags(3项), hobbies(3项) | 数组完整 | ✅ |
| **enum** | gender(FEMALE), vip_level(DIAMOND) | 枚举值正确 | ✅ |
| **date** | birthday(1992-08-20), last_purchase_date(2026-06-28) | 日期格式正确 | ✅ |
| **中文** | 上海市, 布丁, 瑜伽 | 中文正确存储 | ✅ |
| **长文本** | notes(含16个中文字符) | 完整存储 | ✅ |

---

## Step 3: 积分操作

| 操作 | 账户类型 | 金额 | 增加/扣减 | 结果 | 描述 |
|------|:--------:|:----:|:--------:|:----:|------|
| 3.1 发放 | REWARD | 5000 | increase=true | ✅ SUCCESS | 消费积分发放 |
| 3.2 发放 | TIER | 2000 | increase=true | ✅ SUCCESS | 等级成长值发放 |
| 3.3 发放 | CREDIT | 10000 | increase=true | ✅ SUCCESS | 授信积分发放 |
| 3.4 扣减 | REWARD | 500 | increase=false | ✅ SUCCESS | 消费积分扣减 |

### 积分余额验证（Step 6最终查询）

```
REWARD:   deposit=5000 - redeem=500 = 4500 ✅
TIER:     deposit=2000           = 2000 ✅
CREDIT:   deposit=10000          = 10000 ✅
```

### 交易流水验证

```
ID-791: ACCRUAL   REWARD  +5000.0  remaining=4500 (FIFO: 500已用)
ID-792: ACCRUAL   TIER    +2000.0  remaining=2000
ID-793: ACCRUAL   CREDIT  +10000.0 remaining=10000
ID-794: REDEMPTION REWARD -500.0   (扣减FIFO)
```

---

## Step 4: 等级调整

| 操作 | 初始等级 | 目标等级 | 结果 | 日志 |
|------|:-------:|:--------:|:----:|:----:|
| 升级 | SILVER | GOLD | ✅ SUCCESS | from=SILVER, to=GOLD |
| 降级 | GOLD | BASE | ✅ SUCCESS | from=GOLD, to=BASE |

等级变更日志:
```
ID-140: SILVER → GOLD   (MANUAL_ADJUSTMENT)
ID-141: GOLD   → BASE   (MANUAL_ADJUSTMENT)
```

---

## Step 5: 冻结/解冻

| 操作 | 前状态 | 后状态 | 结果 |
|:----:|:------:|:------:|:----:|
| 冻结 | ENROLLED | SUSPENDED | ✅ |
| 解冻 | SUSPENDED | ENROLLED | ✅ |

---

## Step 6: 最终查询 — 完整性验证

**最终查询** `GET /api/members/1782902686693396` 结果汇总:

| 验证项 | 结果 | 值 |
|--------|:----:|----|
| 会员存在 | ✅ | memberId=1782902686693396 |
| 当前等级 | ✅ | BASE (Step4降级结果) |
| 当前状态 | ✅ | ENROLLED (Step5解冻结果) |
| 动态属性完整 | ✅ | 全部25个字段完整无缺 |
| REWARD积分余额 | ✅ | 4500 (5000-500) |
| TIER成长值余额 | ✅ | 2000 |
| CREDIT授信余额 | ✅ | 10000 |
| 交易流水 | ✅ | 4条完整记录 |
| 等级变更日志 | ✅ | 2条完整记录 |
| 手机号唯一键 | ✅ | MOBILE_PLAIN: 177****0001 |

---

## 综合结论

**测试结果: 6步全流程 ✅ 全部通过**

```
Step 1: 创建会员(25个动态属性) ──→ ✅
Step 2: 查询验证(搜索+详情)    ──→ ✅
Step 3: 积分操作(3种账户×4笔)  ──→ ✅
Step 4: 等级调整(升降各1次)     ──→ ✅
Step 5: 冻结解冻(完整生命周期)  ──→ ✅
Step 6: 最终查询(全字段验证)    ──→ ✅
```

### 验证的关键能力

| 能力 | 验证结果 |
|------|:--------:|
| 动态属性 **string** 存储 | ✅ |
| 动态属性 **number** 存储 | ✅ |
| 动态属性 **boolean** 存储 | ✅ |
| 动态属性 **array** 存储 | ✅ |
| 动态属性 **enum** 值 | ✅ |
| 动态属性 **中文** 存储 | ✅ |
| 动态属性完整生命周期保持 | ✅ (创建→查询→积分→调级→冻结→最终查询, 25个字段完整) |
| 积分发放/扣减/FIFO | ✅ |
| 多账户类型(REWARD/TIER/CREDIT) | ✅ |
| 等级升降级 + 变更日志 | ✅ |
| 冻结/解冻状态切换 | ✅ |
| 手机号唯一键 + 搜索 | ✅ |
| schema_version双写 | ✅ |

---

## 数据清理

```sql
DELETE FROM account_transaction 
WHERE program_code = 'PROG001' AND member_id = 1782902686693396;

DELETE FROM member_unique_key 
WHERE program_code = 'PROG001' AND member_id = 1782902686693396;

DELETE FROM member_account 
WHERE program_code = 'PROG001' AND member_id = 1782902686693396;

DELETE FROM tier_change_log 
WHERE program_code = 'PROG001' AND member_id = 1782902686693396;

DELETE FROM member 
WHERE program_code = 'PROG001' AND member_id = 1782902686693396;
```
