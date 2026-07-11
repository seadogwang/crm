# 忠诚度管理平台等级规则设计文档（完整版）
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3\
> **版本**：1.0\
> **设计原则**：
>
> * **最大化复用**：复用 v7.3 现有的 `rule_definition`、`program_schema`、`tier_change_log` 表，不引入冗余表结构
>
> * **积分与等级联动**：积分累积是“因”，等级变更是“果”，通过事件驱动机制打通
>
> * **多维度评估**：支持等级积分、购买次数、累计金额、连续活跃等多维度等级评估
>
> * **配置驱动**：升级/降级/保级规则通过可视化界面配置，运营人员无需编写代码
## 一、设计目标
1. **等级定义与管理**：配置等级名称、层级、门槛值、权益内容，支持多等级体系
2. **多维度升级/降级/保级规则**：基于等级积分、购买次数、累计金额、连续活跃等维度灵活配置
3. **积分与等级联动**：积分累积后自动触发等级评估，实现“发分→升级”的自动化
4. **等级直升活动**：支持场景化的等级直升活动（如付费直升、任务直升）
5. **动态变量支持**：购买次数、连续签到等变量作为等级评估的输入条件
6. **完全兼容 v7.3**：复用现有表结构，不破坏已有功能
## 二、整体架构与数据流
### 2.1 整体架构
```text
┌─────────────────────────────────────────────────────────────────────────┐
│                           等级生命周期管理                               │
├─────────────┬─────────────┬─────────────┬──────────────────────────────┤
│  等级定义   │  等级规则   │  等级评估   │  等级直升活动                 │
│  · 名称     │  · 升级     │  · 事件触发 │  · 付费直升                   │
│  · 层级     │  · 降级     │  · 定时触发 │  · 任务直升                   │
│  · 门槛值   │  · 保级     │  · 手动触发 │  · 手动直升                   │
│  · 权益     │  · 多维度   │  · 自动执行 │                              │
└─────────────┴─────────────┴─────────────┴──────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    rule_definition 表（复用）                           │
│  rule_purpose：EARN_POINTS / TIER_UPGRADE / TIER_RETENTION / TIER_ACTIVITY │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    member.ext_attributes（复用）                        │
│  动态变量：累计购买次数、累计消费金额、连续签到天数等                   │
└─────────────────────────────────────────────────────────────────────────┘
```
### 2.2 积分与等级联动数据流
```text
┌─────────────────────────────────────────────────────────────────────────┐
│  1. 用户触发积分累积（订单完成、签到、行为事件等）                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  2. PointGrantService.grantPoints() 发放积分                           │
│      - 更新 account_transaction（积分流水）                            │
│      - 更新 member_account.total_accrued                              │
│      - 发布 PointsAccruedEvent（事件驱动）                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  3. TierEvaluationService 监听 PointsAccruedEvent                      │
│      - 查询会员当前等级                                                │
│      - 查询该等级的升级规则（rule_purpose='TIER_UPGRADE'）             │
│      - 评估会员是否满足升级条件                                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  4. 条件满足 → 执行等级变更                                            │
│      - 更新 member.tier_code                                          │
│      - 记录 tier_change_log（等级变更历史）                            │
│      - 发布 TierChangedEvent                                         │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  5. 等级变更后的联动                                                   │
│      - 等级权益生效（折扣、免运费等）                                  │
│      - 触发等级达标活动奖励                                            │
└─────────────────────────────────────────────────────────────────────────┘
```
## 三、数据模型设计
### 3.1 复用 v7.3 现有表
#### 3.1.1 `rule_definition` 表（扩展）
在 v7.3 原有表结构基础上，增加 `rule_purpose` 字段，统一管理**积分规则**和**等级规则**。
```sql
-- 扩展现有 rule_definition 表
ALTER TABLE rule_definition ADD COLUMN rule_purpose VARCHAR(30) DEFAULT 'EARN_POINTS';
COMMENT ON COLUMN rule_definition.rule_purpose IS '规则用途: EARN_POINTS(积分累积), TIER_UPGRADE(等级升级), TIER_DOWNGRADE(等级降级), TIER_RETENTION(等级保级), TIER_ACTIVITY(等级直升活动)';
```
**`rule_purpose` 枚举值**：
| 值                | 说明     | 使用场景       |
| ---------------- | ------ | ---------- |
| `EARN_POINTS`    | 积分累积规则 | 订单积分、签到积分等 |
| `TIER_UPGRADE`   | 等级升级规则 | 达到门槛升级     |
| `TIER_DOWNGRADE` | 等级降级规则 | 保级失败降级     |
| `TIER_RETENTION` | 等级保级规则 | 保级评估       |
| `TIER_ACTIVITY`  | 等级直升活动 | 付费直升等      |
#### 3.1.2 `program_schema` 表（复用）
动态变量（购买次数、累计金额等）作为会员扩展属性，通过 `program_schema` 定义：
| `entity_type` | 说明     | 存储位置                    |
| ------------- | ------ | ----------------------- |
| `MEMBER`      | 会员扩展属性 | `member.ext_attributes` |
**示例：在 `program_schema` 中定义动态变量**
```sql
INSERT INTO program_schema (program_code, entity_type, version, field_schema, status)
VALUES ('BRAND_A', 'MEMBER', 'v1', '{
    "type": "object",
    "properties": {
        "order_count_total": { "type": "integer", "description": "累计购买次数" },
        "order_count_90days": { "type": "integer", "description": "近90天购买次数" },
        "total_amount": { "type": "number", "description": "累计消费金额" },
        "continuous_login_days": { "type": "integer", "description": "连续签到天数" },
        "last_order_at": { "type": "string", "format": "date-time", "description": "最近一次下单时间" }
    }
}', 'ACTIVE');
```
#### 3.1.3 `tier_change_log` 表（复用）
v7.3 已存在 `tier_change_log` 表，用于记录等级变更历史，无需修改。
```sql
-- 已有表（v7.3）
CREATE TABLE tier_change_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    old_tier VARCHAR(16),
    new_tier VARCHAR(16) NOT NULL,
    change_reason VARCHAR(50) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
**`change_reason` 枚举扩展**：
| 值                  | 说明         |
| ------------------ | ---------- |
| `UPGRADE`          | 正常升级（规则触发） |
| `DOWNGRADE`        | 正常降级（规则触发） |
| `RETENTION`        | 保级成功       |
| `ACTIVITY_UPGRADE` | 活动直升       |
| `MANUAL_UPGRADE`   | 手动升级       |
| `MANUAL_DOWNGRADE` | 手动降级       |
### 3.2 新增表
#### 3.2.1 等级定义表 `tier_definition`
用于存储等级的元数据，包含等级名称、层级、权益等。
```sql
CREATE TABLE tier_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    tier_code VARCHAR(32) NOT NULL,           -- BASE / SILVER / GOLD / PLATINUM
    tier_name VARCHAR(100) NOT NULL,          -- 等级显示名称
    tier_level INT NOT NULL,                  -- 等级顺序（0=最低，数字越大等级越高）
    tier_value INT NOT NULL,                  -- 等级门槛值（等级积分/成长值要求）
    tier_icon VARCHAR(255),                   -- 等级图标URL
    tier_benefits JSONB,                      -- 等级权益配置
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, tier_code)
);
-- 索引
CREATE INDEX idx_tier_def_program ON tier_definition(program_code);
CREATE INDEX idx_tier_def_level ON tier_definition(program_code, tier_level);
```
**`tier_benefits` JSON 示例**：
```json
{
    "discount": 0.9,
    "free_shipping": true,
    "birthday_gift": 100,
    "exclusive_events": true,
    "priority_service": true,
    "custom_benefits": [
        { "name": "免费停车券", "value": "每月2张" },
        { "name": "生日礼包", "value": "100积分" }
    ]
}
```
#### 3.2.2 等级直升活动表 `tier_activity`
用于配置等级直升活动（如付费直升、任务直升）。
```sql
CREATE TABLE tier_activity (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    activity_code VARCHAR(64) NOT NULL,
    activity_name VARCHAR(200) NOT NULL,
    target_tier_code VARCHAR(32) NOT NULL,    -- 直升目标等级
    trigger_type VARCHAR(30) NOT NULL,        -- EVENT / MANUAL / PAYMENT / TASK
    trigger_config JSONB NOT NULL,            -- 触发条件配置
    valid_start_time TIMESTAMPTZ NOT NULL,
    valid_end_time TIMESTAMPTZ,
    once_per_member BOOLEAN DEFAULT true,     -- 是否仅首次直升
    member_scope VARCHAR(20) DEFAULT 'ALL',   -- ALL / NEW_ONLY / EXISTING_ONLY
    status VARCHAR(20) DEFAULT 'DRAFT',       -- DRAFT / ACTIVE / INACTIVE
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, activity_code)
);
CREATE INDEX idx_tier_act_program ON tier_activity(program_code);
CREATE INDEX idx_tier_act_time ON tier_activity(valid_start_time, valid_end_time);
CREATE INDEX idx_tier_act_status ON tier_activity(status);
```
**`trigger_config` 示例**：
```json
// 支付直升：单笔订单金额≥5000元
{
    "trigger_type": "PAYMENT",
    "conditions": {
        "operator": "AND",
        "conditions": [
            { "type": "order_amount", "operator": ">=", "value": 5000 }
        ]
    }
}
// 任务直升：完成指定任务
{
    "trigger_type": "TASK",
    "conditions": {
        "operator": "AND",
        "conditions": [
            { "type": "task_completed", "value": "SHARE_10_TIMES" }
        ]
    }
}
```
#### 3.2.3 会员直升记录表 `member_tier_activity_log`
记录会员参与等级直升活动的历史，用于幂等控制和审计。
```sql
CREATE TABLE member_tier_activity_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    activity_code VARCHAR(64) NOT NULL,
    original_tier VARCHAR(32),
    target_tier VARCHAR(32) NOT NULL,
    trigger_event_id VARCHAR(64),             -- 触发事件ID
    trigger_value JSONB,                      -- 触发时的值（如订单金额）
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, member_id, activity_code)
);
CREATE INDEX idx_mtal_member ON member_tier_activity_log(program_code, member_id);
```
### 3.3 数据模型关系图
```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        等级定义 (tier_definition)                       │
│  program_code │ tier_code │ tier_name │ tier_level │ tier_value       │
│  ─────────────────────────────────────────────────────────────────────  │
│  BRAND_A     │ BASE      │ 普通会员   │ 0          │ 0                │
│  BRAND_A     │ SILVER    │ 白银会员   │ 1          │ 1000             │
│  BRAND_A     │ GOLD      │ 黄金会员   │ 2          │ 3000             │
│  BRAND_A     │ PLATINUM  │ 铂金会员   │ 3          │ 8000             │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   等级规则 (rule_definition)                            │
│  rule_purpose = TIER_UPGRADE / TIER_DOWNGRADE / TIER_RETENTION        │
│  metadata 存储评估维度配置                                              │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   动态变量 (member.ext_attributes)                      │
│  order_count_total, order_count_90days, total_amount,                 │
│  continuous_login_days, last_order_at ...                             │
└─────────────────────────────────────────────────────────────────────────┘
```
## 四、等级规则配置
### 4.1 等级规则存储格式（`rule_definition.metadata`）
等级规则复用 `rule_definition` 表，`rule_purpose` 区分规则类型，`metadata` 存储评估维度和条件配置。
#### 4.1.1 升级规则（`rule_purpose = 'TIER_UPGRADE'`）
```json
{
    "tier_target": "PLATINUM",
    "evaluation": {
        "dimension": "TIER_POINTS",          // 评估维度
        "required_value": 8000,               // 要求值
        "time_window_days": 365,              // 时间窗口（可选）
        "operator": "AND",
        "extra_conditions": [
            { "dimension": "ORDER_COUNT", "operator": ">=", "value": 10 }
        ]
    }
}
```
#### 4.1.2 保级规则（`rule_purpose = 'TIER_RETENTION'`）
```json
{
    "tier_source": "GOLD",
    "evaluation": {
        "dimension": "TIER_POINTS",
        "required_value": 2000,
        "time_window_days": 365,
        "operator": "AND",
        "extra_conditions": []
    },
    "retention_cycle_days": 365,
    "downgrade_target": "SILVER"
}
```
#### 4.1.3 降级规则（`rule_purpose = 'TIER_DOWNGRADE'`）
```json
{
    "tier_source": "GOLD",
    "tier_target": "SILVER",
    "evaluation": {
        "dimension": "ORDER_COUNT",
        "operator": "<",
        "value": 3,
        "time_window_days": 180,
        "operator": "OR",
        "extra_conditions": [
            { "dimension": "LAST_ORDER_DAYS", "operator": ">", "value": 90 }
        ]
    }
}
```
### 4.2 评估维度枚举
| 维度代码               | 显示名称      | 数据来源                                          | 说明        |
| ------------------ | --------- | --------------------------------------------- | --------- |
| `TIER_POINTS`      | 等级积分（成长值） | `member_account`（`account_type='TIER'`）       | 累积的等级积分   |
| `ORDER_COUNT`      | 购买次数      | `member.ext_attributes.order_count_total`     | 累计购买次数    |
| `ORDER_COUNT_DAYS` | 时间窗口购买次数  | `member.ext_attributes.order_count_90days`    | 指定天数内购买次数 |
| `TOTAL_AMOUNT`     | 累计消费金额    | `member.ext_attributes.total_amount`          | 累计消费金额    |
| `CONTINUOUS_DAYS`  | 连续活跃天数    | `member.ext_attributes.continuous_login_days` | 连续签到/登录天数 |
| `LAST_ORDER_DAYS`  | 最近消费间隔天数  | `member.ext_attributes.last_order_at`         | 距上次消费天数   |
## 五、动态变量管理
### 5.1 变量定义（`program_schema` + `ext_attributes`）
动态变量作为会员扩展属性，通过 `program_schema` 定义 Schema，值存储在 `member.ext_attributes` 中。
**变量生命周期管理**：
```sql
-- 变量初始化（会员注册时）
INSERT INTO member (program_code, member_id, ext_attributes, ...)
VALUES ('BRAND_A', 'M123', '{
    "order_count_total": 0,
    "order_count_90days": 0,
    "total_amount": 0,
    "continuous_login_days": 0,
    "last_order_at": null
}', ...);
-- 变量更新（事件驱动）
UPDATE member
SET ext_attributes = jsonb_set(
    ext_attributes,
    '{order_count_total}',
    to_jsonb(COALESCE((ext_attributes->>'order_count_total')::int, 0) + 1)
)
WHERE member_id = 'M123';
```
### 5.2 变量更新触发点
| 事件     | 更新变量                                                                                         | 说明   |
| ------ | -------------------------------------------------------------------------------------------- | ---- |
| 订单完成   | `order_count_total + 1`、`order_count_90days + 1`、`total_amount += 金额`、`last_order_at = 当前时间` | 实时更新 |
| 每日定时任务 | `order_count_90days` 清理过期数据、`continuous_login_days` 检查连续性                                    | 定时维护 |
| 签到事件   | `continuous_login_days + 1` 或重置为 0                                                           | 实时更新 |
### 5.3 变量计算服务（伪代码）
```java
@Service
public class MemberVariableService {
    @Autowired private MemberRepository memberRepo;
    @Autowired private ProgramSchemaService schemaService;
    
    private static final String ORDER_COUNT_90DAYS = "order_count_90days";
    private static final String ORDER_COUNT_TOTAL = "order_count_total";
    private static final String TOTAL_AMOUNT = "total_amount";
    private static final String CONTINUOUS_DAYS = "continuous_login_days";
    private static final String LAST_ORDER_AT = "last_order_at";
    
    /**
     * 订单完成后更新会员变量
     */
    @Transactional
    public void updateVariablesOnOrder(String programCode, String memberId, BigDecimal orderAmount) {
        Member member = memberRepo.findByProgramCodeAndMemberId(programCode, memberId);
        Map<String, Object> ext = member.getExtAttributes();
        
        // 1. 更新累计购买次数（总数）
        int totalCount = (int) ext.getOrDefault(ORDER_COUNT_TOTAL, 0) + 1;
        ext.put(ORDER_COUNT_TOTAL, totalCount);
        
        // 2. 更新累计购买次数（90天窗口）
        // 实际需要查询90天内的订单数，此处简化为计数器累加
        int daysCount = (int) ext.getOrDefault(ORDER_COUNT_90DAYS, 0) + 1;
        ext.put(ORDER_COUNT_90DAYS, daysCount);
        
        // 3. 更新累计消费金额
        BigDecimal totalAmount = (BigDecimal) ext.getOrDefault(TOTAL_AMOUNT, BigDecimal.ZERO);
        totalAmount = totalAmount.add(orderAmount);
        ext.put(TOTAL_AMOUNT, totalAmount);
        
        // 4. 更新最近消费时间
        ext.put(LAST_ORDER_AT, LocalDateTime.now().toString());
        
        member.setExtAttributes(ext);
        memberRepo.save(member);
        
        // 5. 发布变量更新事件，触发等级评估
        eventBridge.publish("loyalty-member-events", memberId,
            new MemberVariableUpdatedEvent(memberId, "ORDER", orderAmount));
    }
    
    /**
     * 更新连续签到天数
     */
    @Transactional
    public void updateContinuousLogin(String programCode, String memberId) {
        Member member = memberRepo.findByProgramCodeAndMemberId(programCode, memberId);
        Map<String, Object> ext = member.getExtAttributes();
        
        // 判断上次签到时间是否连续
        String lastLoginStr = (String) ext.get("last_login_at");
        LocalDate lastLogin = lastLoginStr != null ? LocalDate.parse(lastLoginStr) : null;
        LocalDate today = LocalDate.now();
        
        int days = 0;
        if (lastLogin != null && ChronoUnit.DAYS.between(lastLogin, today) == 1) {
            // 连续签到
            days = (int) ext.getOrDefault(CONTINUOUS_DAYS, 0) + 1;
        } else if (lastLogin != null && ChronoUnit.DAYS.between(lastLogin, today) == 0) {
            // 同一天签到，不累加
            days = (int) ext.getOrDefault(CONTINUOUS_DAYS, 0);
        } else {
            // 中断签到，重置
            days = 1;
        }
        ext.put(CONTINUOUS_DAYS, days);
        ext.put("last_login_at", today.toString());
        
        member.setExtAttributes(ext);
        memberRepo.save(member);
    }
    
    /**
     * 获取会员变量值（供规则引擎使用）
     */
    public BigDecimal getVariable(String programCode, String memberId, String variableName) {
        Member member = memberRepo.findByProgramCodeAndMemberId(programCode, memberId);
        Object value = member.getExtAttributes().get(variableName);
        if (value instanceof Number) {
            return new BigDecimal(value.toString());
        }
        return BigDecimal.ZERO;
    }
}
```
## 六、前端界面设计
### 6.1 等级列表页
```text
┌─ 等级管理 ──────────────────────────────────────────────────────────────┐
│  [+ 新建等级]  [+ 新建直升活动]  [等级规则配置]                         │
├─────────┬─────────┬─────────────┬───────────────────────┬─────────────┤
│ 等级代码 │ 等级名称 │ 等级值(门槛) │ 权益                  │ 操作        │
├─────────┼─────────┼─────────────┼───────────────────────┼─────────────┤
│ BASE    │ 普通会员 │ 0           │ -                     │ [编辑]      │
│ SILVER  │ 白银会员 │ 1000        │ 9.5折、免运费         │ [编辑]      │
│ GOLD    │ 黄金会员 │ 3000        │ 9折、免运费、生日礼   │ [编辑]      │
│ PLATINUM│ 铂金会员 │ 8000        │ 8.8折、专属客服       │ [编辑]      │
└─────────┴─────────┴─────────────┴───────────────────────┴─────────────┘
```
### 6.2 等级编辑页面
```text
┌─ 编辑等级：黄金会员 ────────────────────────────────────────────────────┐
│ ┌─ 基础信息 ──────────────────────────────────────────────────────────┐ │
│ │ 等级代码：[GOLD   ]  等级名称：[黄金会员   ]                        │ │
│ │ 等级层级：[2      ]  等级门槛：[3000     ] 分                      │ │
│ │ 等级图标：[上传图标]                                                │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ┌─ 等级权益配置 ──────────────────────────────────────────────────────┐ │
│ │ 权益类型              │ 值                                          │ │
│ │ 折扣（百分比）        │ [90   ] %  (即9折)                         │ │
│ │ 免运费                │ [✓]                                        │ │
│ │ 生日礼包（积分）      │ [100  ] 分                                │ │
│ │ 专属活动              │ [✓]                                        │ │
│ │ 专属客服              │ [✓]                                        │ │
│ │ 自定义权益：          │ [{"name":"停车券","value":"每月2张"}]      │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ┌─ 升级规则 ──────────────────────────────────────────────────────────┐ │
│ │ 目标等级：[PLATINUM  ]                                               │ │
│ │ 评估维度：[等级积分  ▼]  ≥ [8000  ]                                 │ │
│ │ 时间窗口：[365] 天 (可选)                                           │ │
│ │ 额外条件：[购买次数 ≥ 10次]  [+添加条件]                          │ │
│ │                                                                      │ │
│ │ 规则预览：当会员等级积分 ≥ 8000 分，且购买次数 ≥ 10 次，升级为铂金会员 │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ┌─ 保级规则 ──────────────────────────────────────────────────────────┐ │
│ │ 保级评估周期：[365] 天                                               │ │
│ │ 评估维度：[等级积分  ▼]  ≥ [2000  ]                                 │ │
│ │ 保级失败降级到：[SILVER   ]                                          │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ [保存草稿] [发布] [取消]                                                 │
└──────────────────────────────────────────────────────────────────────────┘
```
### 6.3 等级直升活动配置页面
```text
┌─ 新建等级直升活动 ──────────────────────────────────────────────────────┐
│ ┌─ 基础信息 ──────────────────────────────────────────────────────────┐ │
│ │ 活动代码：[TIER_UP_618   ]  活动名称：[618铂金直升活动  ]            │ │
│ │ 目标等级：[PLATINUM ▼]                                              │ │
│ │ 有效期：  [2026-06-01 00:00] 至 [2026-06-30 23:59]                 │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ┌─ 触发条件 ──────────────────────────────────────────────────────────┐ │
│ │ 触发方式：[支付直升 ▼]  (支付直升 / 任务直升 / 手动操作)             │ │
│ │                                                                      │ │
│ │ 条件1： 订单实付金额 ≥ [5000] 元                                    │ │
│ │ 条件2： 订单渠道 ∈ [天猫, 京东]                                     │ │
│ │ 条件3： 订单商品数 ≥ [2] 件                                         │ │
│ │ [+ 添加条件]                                                         │ │
│ │ 条件关系： ● AND  ○ OR                                             │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ ┌─ 会员限制 ──────────────────────────────────────────────────────────┐ │
│ │ 适用范围： ● 全部会员  ○ 仅新会员  ○ 仅现有会员                    │ │
│ │ 是否仅首次直升：[✓]                                                 │ │
│ │                                                                      │ │
│ │ 说明：每个会员在活动期间只能触发一次直升                             │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│ [保存草稿] [发布] [取消]                                                 │
└──────────────────────────────────────────────────────────────────────────┘
```
## 七、等级评估引擎
### 7.1 评估触发机制
| 触发方式     | 触发时机  | 说明        |
| -------- | ----- | --------- |
| **事件触发** | 积分发放后 | 实时评估升级条件  |
| **定时任务** | 每日凌晨  | 评估保级/降级条件 |
| **手动触发** | 运营后台  | 手动执行等级评估  |
### 7.2 等级评估服务（伪代码）
```java
@Service
public class TierEvaluationService {
    @Autowired private MemberRepository memberRepo;
    @Autowired private TierDefinitionRepository tierRepo;
    @Autowired private RuleDefinitionRepository ruleRepo;
    @Autowired private TierChangeLogRepository tierLogRepo;
    @Autowired private MemberVariableService variableService;
    @Autowired private EventBridge eventBridge;
    @Autowired private MemberAccountRepository accountRepo;
    
    /**
     * 积分发放后触发等级评估
     */
    @EventListener
    @Transactional
    public void onPointsAccrued(PointsAccruedEvent event) {
        String programCode = event.getProgramCode();
        String memberId = event.getMemberId();
        
        evaluateMemberTier(programCode, memberId, "UPGRADE", event.getEventId());
    }
    
    /**
     * 定时任务：每日凌晨执行保级/降级评估
     */
    @Scheduled(cron = "0 0 2 * * ?")
    @Transactional
    public void scheduledRetentionEvaluation() {
        List<String> activePrograms = programRepo.findAllActive();
        for (String programCode : activePrograms) {
            // 查询所有等级大于BASE的会员
            List<Member> members = memberRepo.findByProgramCodeAndTierLevelGreaterThan(
                programCode, 0);
            for (Member member : members) {
                evaluateMemberTier(programCode, member.getMemberId(), "RETENTION", null);
            }
        }
    }
    
    /**
     * 核心评估方法
     */
    public void evaluateMemberTier(String programCode, String memberId, String evalType, String triggerEventId) {
        Member member = memberRepo.findByProgramCodeAndMemberId(programCode, memberId);
        String currentTier = member.getTierCode();
        
        // 1. 检查等级直升活动（最高优先级）
        if ("UPGRADE".equals(evalType)) {
            TierActivity matchedActivity = checkTierActivity(programCode, memberId);
            if (matchedActivity != null) {
                performTierUpgrade(member, matchedActivity.getTargetTierCode(), 
                    "ACTIVITY_UPGRADE", triggerEventId);
                return;
            }
        }
        
        // 2. 查询该等级的升级规则
        if ("UPGRADE".equals(evalType)) {
            RuleDefinition upgradeRule = ruleRepo.findByProgramCodeAndPurposeAndTier(
                programCode, "TIER_UPGRADE", currentTier);
            if (upgradeRule != null && evaluateRule(programCode, memberId, upgradeRule)) {
                JSONObject metadata = upgradeRule.getMetadata();
                String targetTier = metadata.getString("tier_target");
                performTierUpgrade(member, targetTier, "UPGRADE", triggerEventId);
                return;
            }
        }
        
        // 3. 保级评估（仅在定时任务中执行）
        if ("RETENTION".equals(evalType)) {
            RuleDefinition retentionRule = ruleRepo.findByProgramCodeAndPurposeAndTier(
                programCode, "TIER_RETENTION", currentTier);
            if (retentionRule != null) {
                boolean retained = evaluateRule(programCode, memberId, retentionRule);
                if (!retained) {
                    // 保级失败，执行降级
                    JSONObject metadata = retentionRule.getMetadata();
                    String downgradeTarget = metadata.getString("downgrade_target");
                    performTierDowngrade(member, downgradeTarget, "DOWNGRADE", null);
                } else {
                    // 保级成功，记录保级日志
                    tierLogRepo.save(new TierChangeLog(
                        programCode, memberId, currentTier, currentTier, 
                        "RETENTION", LocalDateTime.now()
                    ));
                }
            }
        }
    }
    
    /**
     * 评估单条规则
     */
    private boolean evaluateRule(String programCode, String memberId, RuleDefinition rule) {
        JSONObject metadata = rule.getMetadata();
        JSONObject eval = metadata.getJSONObject("evaluation");
        String dimension = eval.getString("dimension");
        String operator = eval.optString("operator", "AND");
        
        // 获取会员当前值
        BigDecimal actualValue = getActualValue(programCode, memberId, dimension);
        BigDecimal requiredValue = eval.getBigDecimal("required_value");
        
        // 主条件判断
        boolean mainCondition = evaluateComparison(actualValue, operator, requiredValue);
        if (!mainCondition) {
            return false;
        }
        
        // 额外条件判断
        JSONArray extraConditions = eval.optJSONArray("extra_conditions");
        if (extraConditions != null && !extraConditions.isEmpty()) {
            for (int i = 0; i < extraConditions.size(); i++) {
                JSONObject cond = extraConditions.getJSONObject(i);
                String condDim = cond.getString("dimension");
                BigDecimal condValue = getActualValue(programCode, memberId, condDim);
                BigDecimal condRequired = cond.getBigDecimal("value");
                String condOp = cond.getString("operator");
                if (!evaluateComparison(condValue, condOp, condRequired)) {
                    return false;
                }
            }
        }
        return true;
    }
    
    /**
     * 获取评估维度的实际值
     */
    private BigDecimal getActualValue(String programCode, String memberId, String dimension) {
        switch (dimension) {
            case "TIER_POINTS":
                return accountRepo.getTierPoints(programCode, memberId);
            case "ORDER_COUNT":
            case "ORDER_COUNT_DAYS":
            case "TOTAL_AMOUNT":
            case "CONTINUOUS_DAYS":
            case "LAST_ORDER_DAYS":
                return variableService.getVariable(programCode, memberId, dimension);
            default:
                return BigDecimal.ZERO;
        }
    }
    
    /**
     * 执行等级升级
     */
    private void performTierUpgrade(Member member, String targetTier, String reason, String triggerEventId) {
        String oldTier = member.getTierCode();
        if (oldTier.equals(targetTier)) return;
        
        member.setTierCode(targetTier);
        memberRepo.save(member);
        
        tierLogRepo.save(new TierChangeLog(
            member.getProgramCode(), member.getMemberId(), 
            oldTier, targetTier, reason, LocalDateTime.now()
        ));
        
        eventBridge.publish("loyalty-tier-events", member.getMemberId(),
            new TierChangedEvent(member.getMemberId(), oldTier, targetTier, reason, triggerEventId));
    }
    
    /**
     * 执行等级降级
     */
    private void performTierDowngrade(Member member, String targetTier, String reason, String triggerEventId) {
        String oldTier = member.getTierCode();
        if (oldTier.equals(targetTier)) return;
        
        member.setTierCode(targetTier);
        memberRepo.save(member);
        
        tierLogRepo.save(new TierChangeLog(
            member.getProgramCode(), member.getMemberId(), 
            oldTier, targetTier, reason, LocalDateTime.now()
        ));
        
        eventBridge.publish("loyalty-tier-events", member.getMemberId(),
            new TierChangedEvent(member.getMemberId(), oldTier, targetTier, reason, triggerEventId));
    }
    
    /**
     * 检查等级直升活动
     */
    private TierActivity checkTierActivity(String programCode, String memberId) {
        LocalDateTime now = LocalDateTime.now();
        List<TierActivity> activities = tierActivityRepo.findActive(
            programCode, now, "ACTIVE");
        
        for (TierActivity activity : activities) {
            if (activity.isOncePerMember()) {
                // 检查是否已参与过该活动
                boolean hasJoined = tierActivityLogRepo.existsByMemberIdAndActivityCode(
                    memberId, activity.getActivityCode());
                if (hasJoined) continue;
            }
            
            if (evaluateTierActivityTrigger(memberId, activity)) {
                return activity;
            }
        }
        return null;
    }
}
```
## 八、规则引擎中的变量引用
### 8.1 变量在规则中的使用
在规则引擎中，等级规则通过 `metadata` 引用动态变量，DRL 生成器根据配置生成对应的 DRL 代码。
### 8.2 DRL 生成器扩展（伪代码）
```java
@Component
public class TierDrlGenerator {
    /**
     * 生成升级规则 DRL
     */
    public String generateUpgradeDrl(RuleDefinition rule) {
        JSONObject metadata = rule.getMetadata();
        String ruleCode = rule.getRuleCode();
        String targetTier = metadata.getString("tier_target");
        JSONObject eval = metadata.getJSONObject("evaluation");
        String dimension = eval.getString("dimension");
        BigDecimal requiredValue = eval.getBigDecimal("required_value");
        
        StringBuilder drl = new StringBuilder();
        drl.append("import com.loyalty.platform.domain.points.model.*;\n");
        drl.append("import com.loyalty.platform.domain.tier.TierEvaluationService;\n\n");
        drl.append("rule \"").append(ruleCode).append("\"\n");
        drl.append("when\n");
        drl.append("    $event: PointsAccruedEvent()\n");
        drl.append("    $member: MemberFact(memberId == $event.memberId)\n");
        
        // 生成变量引用
        String variableAccess = getVariableAccess(dimension);
        drl.append("    eval( ").append(variableAccess).append(" >= ").append(requiredValue).append(" )\n");
        
        // 额外条件
        JSONArray extraConditions = eval.optJSONArray("extra_conditions");
        if (extraConditions != null) {
            for (int i = 0; i < extraConditions.size(); i++) {
                JSONObject cond = extraConditions.getJSONObject(i);
                String condDim = cond.getString("dimension");
                String condOp = cond.getString("operator");
                BigDecimal condValue = cond.getBigDecimal("value");
                drl.append("    eval( ").append(getVariableAccess(condDim))
                   .append(" ").append(condOp).append(" ").append(condValue).append(" )\n");
            }
        }
        
        drl.append("then\n");
        drl.append("    tierEvaluationService.upgradeMember($member.memberId, \"")
           .append(targetTier).append("\", \"UPGRADE\", $event.getEventId());\n");
        drl.append("end\n");
        return drl.toString();
    }
    
    /**
     * 获取变量访问表达式
     */
    private String getVariableAccess(String dimension) {
        switch (dimension) {
            case "TIER_POINTS":
                return "tierEvaluationService.getTierPoints($member.memberId)";
            default:
                return "tierEvaluationService.getMemberVariable($member.memberId, \"" + dimension + "\")";
        }
    }
}
```
## 九、API 接口设计
### 9.1 等级定义 API
| 方法     | 路径                      | 说明     |
| ------ | ----------------------- | ------ |
| GET    | `/api/tiers`            | 获取等级列表 |
| GET    | `/api/tiers/{tierCode}` | 获取等级详情 |
| POST   | `/api/tiers`            | 创建等级   |
| PUT    | `/api/tiers/{tierCode}` | 更新等级   |
| DELETE | `/api/tiers/{tierCode}` | 删除等级   |
### 9.2 等级规则 API
| 方法   | 路径                                  | 说明                        |
| ---- | ----------------------------------- | ------------------------- |
| GET  | `/api/rules?purpose=TIER_UPGRADE`   | 获取升级规则                    |
| GET  | `/api/rules?purpose=TIER_RETENTION` | 获取保级规则                    |
| POST | `/api/rules`                        | 创建规则（`rule_purpose` 指定类型） |
| PUT  | `/api/rules/{ruleCode}`             | 更新规则                      |
| POST | `/api/rules/{ruleCode}/publish`     | 发布规则                      |
### 9.3 等级直升活动 API
| 方法   | 路径                                                       | 说明       |
| ---- | -------------------------------------------------------- | -------- |
| GET  | `/api/tier-activities`                                   | 获取直升活动列表 |
| GET  | `/api/tier-activities/{activityCode}`                    | 获取活动详情   |
| POST | `/api/tier-activities`                                   | 创建活动     |
| PUT  | `/api/tier-activities/{activityCode}`                    | 更新活动     |
| POST | `/api/tier-activities/{activityCode}/publish`            | 发布活动     |
| POST | `/api/tier-activities/{activityCode}/trigger/{memberId}` | 手动触发直升   |
### 9.4 等级评估 API
| 方法   | 路径                                      | 说明        |
| ---- | --------------------------------------- | --------- |
| POST | `/api/members/{memberId}/tier/evaluate` | 手动触发等级评估  |
| GET  | `/api/members/{memberId}/tier/history`  | 获取等级变更历史  |
| GET  | `/api/members/{memberId}/tier/current`  | 获取当前等级及权益 |
## 十、与积分系统联动
### 10.1 积分类型与等级的关系
| 积分类型                  | 用途     | 与等级的关系     |
| --------------------- | ------ | ---------- |
| `REWARD`（消费积分）        | 可兑换礼品  | 不直接影响等级    |
| `TIER`（等级成长值）         | 计算会员等级 | **直接影响等级** |
| `CREDIT`（授信积分）        | 可透支使用  | 不直接影响等级    |
| `PREPAY_CREDIT`（预售积分） | 预售临时积分 | 不直接影响等级    |
### 10.2 等级积分联动流程
```text
┌─────────────────────────────────────────────────────────────────────────┐
│  积分发放（PointGrantService.grantPoints）                             │
│  积分类型：TIER（等级成长值）                                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  更新 member_account.total_accrued（TIER 账户）                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  发布 PointsAccruedEvent（事件）                                       │
│  包含：memberId, accountType='TIER', amount                            │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  TierEvaluationService 监听事件                                        │
│  1. 查询会员当前等级                                                   │
│  2. 获取当前等级的升级规则                                             │
│  3. 检查等级门槛是否满足                                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│  条件满足 → 执行升级                                                  │
└─────────────────────────────────────────────────────────────────────────┘
```
### 10.3 积分规则配置中的等级引用
在积分规则配置中，可以引用会员等级作为触发条件：
```drools
rule "GOLD_MEMBER_BONUS"
when
    $event: EventFact(eventType == "ORDER")
    $member: MemberFact(memberId == $event.memberId, tierCode == "GOLD")
then
    // 黄金会员额外获得 10% 积分
    BigDecimal bonus = $event.getPayloadNumber("total_amount").multiply(0.1);
    ActionCollector.get().awardPoints($event.getEventId(), bonus, "REWARD").execute(drools);
end
```
## 十一、开发实施步骤
| 序号 | 任务           | 内容                                                                                          | 优先级 |
| -- | ------------ | ------------------------------------------------------------------------------------------- | --- |
| 1  | **数据库变更**    | 执行 DDL：扩展 `rule_definition`，创建 `tier_definition`、`tier_activity`、`member_tier_activity_log` | P0  |
| 2  | **后端实体类**    | 创建 `TierDefinition`、`TierActivity`、`MemberTierActivityLog` 实体类                              | P0  |
| 3  | **动态变量支持**   | 在 `Member` 实体中增加 `ext_attributes` 处理逻辑，实现变量更新服务                                             | P0  |
| 4  | **等级评估引擎**   | 实现 `TierEvaluationService`，支持升级/降级/保级评估                                                     | P0  |
| 5  | **积分与等级联动**  | 在 `PointGrantService` 中发布 `PointsAccruedEvent`，`TierEvaluationService` 监听                   | P0  |
| 6  | **规则生成器扩展**  | 扩展 DRL 生成器，支持 `TIER_UPGRADE`、`TIER_RETENTION` 规则生成                                          | P1  |
| 7  | **等级规则配置界面** | 实现等级列表、编辑页面（含升级/降级/保级规则配置）                                                                  | P1  |
| 8  | **等级直升活动界面** | 实现直升活动列表、编辑页面                                                                               | P1  |
| 9  | **定时任务**     | 实现保级/降级定时评估任务                                                                               | P1  |
| 10 | **API 接口**   | 实现等级、规则、活动、评估相关接口                                                                           | P1  |
| 11 | **联调测试**     | 完整流程测试（积分发放 → 等级升级 → 权益生效 → 保级/降级）                                                          | P2  |
## 十二、总结
本设计文档在 v7.3 基础上，补全了等级生命周期管理的全部缺失环节：
| 缺失项     | 解决方案                                                            |
| ------- | --------------------------------------------------------------- |
| 等级定义    | 新增 `tier_definition` 表 + 等级列表/编辑界面                              |
| 升级规则    | 复用 `rule_definition` 表（`rule_purpose='TIER_UPGRADE'`）+ 规则配置界面   |
| 保级规则    | 复用 `rule_definition` 表（`rule_purpose='TIER_RETENTION'`）+ 保级配置界面 |
| 降级规则    | 复用 `rule_definition` 表（`rule_purpose='TIER_DOWNGRADE'`）+ 降级配置界面 |
| 多维度评估   | 支持等级积分、购买次数、累计金额、连续活跃等多种维度                                      |
| 动态变量    | 通过 `program_schema` + `member.ext_attributes` 管理                |
| 等级直升活动  | 新增 `tier_activity` 表 + 活动配置界面                                   |
| 积分与等级联动 | 事件驱动：`PointsAccruedEvent` → `TierEvaluationService`             |
| 等级变更审计  | 复用 `tier_change_log` 表                                          |
