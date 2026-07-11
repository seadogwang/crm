# 等级规则配置设计（独立模块）
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **版本**：1.0
> **设计原则**：
>
> * **积分与等级完全解耦**：积分负责“怎么获得”，等级负责“怎么评估”，两者通过数据关联而非事件联动
>
> * **等级积分是独立积分类型**：`TIER` 类型积分有独立的发放规则，与 `REWARD` 等积分类型平级
>
> * **变量统一管理**：购买次数、累计金额等动态变量可在积分规则和等级规则中统一引用
>
> * **升级/降级/保级独立配置**：等级评估规则独立于积分累积规则
## 一、核心概念澄清
### 1.1 积分与等级的正确关系
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         积分系统（独立）                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                    │
│  │ REWARD       │  │ TIER         │  │ PREPAY_CREDIT│                    │
│  │ 消费积分     │  │ 等级积分     │  │ 预售积分     │                    │
│  │ (可兑换)     │  │ (算等级)     │  │ (可冲抵)     │                    │
│  └──────────────┘  └──────────────┘  └──────────────┘                    │
│         │                  │                  │                           │
│         └──────────────────┼──────────────────┘                           │
│                            │                                              │
│                    统一积分规则引擎                                        │
│              （每种积分类型都有独立的发放规则）                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ 数据关联（读取会员的 TIER 积分余额）
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         等级系统（独立）                                    │
│  ┌──────────────────────────────────────────────────────────────────────┐ │
│  │  等级评估引擎                                                       │ │
│  │  输入：会员的 TIER 积分 + 购买次数 + 累计金额 + 其他变量             │ │
│  │  输出：升级 / 降级 / 保级                                           │ │
│  └──────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  升级规则    降级规则    保级规则    直升活动                               │
│  (配置)      (配置)      (配置)      (配置)                                │
└─────────────────────────────────────────────────────────────────────────────┘
```
**关键区别**：
| 原设计（联动）        | 修正后（独立）                |
| -------------- | ---------------------- |
| 积分发放 → 触发等级评估  | 积分发放和等级评估是两个独立过程       |
| 等级积分是“副产品”     | 等级积分是独立积分类型，有独立配置      |
| 升级规则只能引用等级积分   | 升级规则可引用等级积分、购买次数、累计金额等 |
| 积分规则和等级规则耦合在一起 | 积分规则和等级规则完全分离          |
### 1.2 等级积分的本质
**等级积分（TIER）与消费积分（REWARD）一样，都是积分类型，只是用途不同。**
| 积分类型            | 用途     | 是否可兑换 | 是否算等级 |
| --------------- | ------ | ----- | ----- |
| `REWARD`        | 兑换礼品   | ✅     | ❌     |
| `TIER`          | 计算等级   | ❌     | ✅     |
| `CREDIT`        | 授信额度   | ✅     | ❌     |
| `PREPAY_CREDIT` | 预售临时积分 | ✅     | ❌     |
等级积分的发放规则，与消费积分的发放规则**完全一样**，只是选择的积分类型不同。
## 二、等级积分规则配置
### 2.1 积分类型扩展
在积分类型定义中，`TIER` 类型的积分与其他积分类型一样，只是 `is_tier_calc = true`：
```sql
-- 积分类型定义（已有）
INSERT INTO point_type_definition (program_code, type_code, type_name, is_redeemable, is_tier_calc, allow_negative, allow_repay)
VALUES 
('BRAND_A', 'REWARD', '消费积分', true, false, false, false),
('BRAND_A', 'TIER', '等级积分', false, true, false, false),
('BRAND_A', 'CREDIT', '授信积分', true, false, true, false);
```
### 2.2 等级积分规则配置界面
等级积分规则的配置方式与消费积分规则完全一致，只是积分类型固定选择 `TIER`：
```text
┌─ 新建积分规则 ──────────────────────────────────────────────────────────────┐
│ 规则类型： [积分累积规则 ▼]  规则分类： [基础规则 ▼]                       │
│ 规则名称： [ 订单消费累积等级积分                 ]                         │
│ 积分类型： [ 等级积分(TIER) ▼]  ← 从积分类型列表选择                       │
│                                                                             │
│ ┌─ 触发条件 ───────────────────────────────────────────────────────────────┐ │
│ │ [订单 ▼] [实付金额 ▼] [≥ ▼] [100] [元]                                 │ │
│ │ [会员 ▼] [会员等级 ▼] [∈ ▼] [黄金] [铂金]                             │ │
│ │ 并且  [变量 ▼] [累计购买次数 ▼] [≥ ▼] [5] [次]  ← 变量引用             │ │
│ │ [+ 添加条件]                                                            │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 奖励设置 ───────────────────────────────────────────────────────────────┐ │
│ │ 奖励方式： [固定倍数 ▼]  倍数： [1.0] 倍                               │ │
│ │ 每满 [10] 元，奖励 [1] 倍                                              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ [保存] [取消]                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 2.3 与消费积分规则的关系
| 维度   | 消费积分规则            | 等级积分规则            |
| ---- | ----------------- | ----------------- |
| 配置界面 | 相同                | 相同                |
| 积分类型 | `REWARD`          | `TIER`            |
| 触发条件 | 订单/行为/等级/变量       | 订单/行为/等级/变量       |
| 奖励方式 | 固定倍数/固定积分/阶梯      | 固定倍数/固定积分/阶梯      |
| 有效期  | 可配置               | 可配置               |
| 存储位置 | `rule_definition` | `rule_definition` |
## 三、等级评估规则配置（升级/降级/保级）
### 3.1 升级规则配置
升级规则独立于积分规则，配置“满足什么条件时，从当前等级升级到目标等级”。
**评估维度**：
| 维度                 | 数据来源          | 说明        |
| ------------------ | ------------- | --------- |
| `TIER_POINTS`      | 会员的 TIER 积分余额 | 累积等级积分    |
| `ORDER_COUNT`      | 累计购买次数（变量）    | 会员总购买次数   |
| `ORDER_COUNT_DAYS` | 时间窗口购买次数（变量）  | 指定天数内购买次数 |
| `TOTAL_AMOUNT`     | 累计消费金额（变量）    | 会员总消费金额   |
| `CONTINUOUS_DAYS`  | 连续活跃天数（变量）    | 连续签到/登录天数 |
```text
┌─ 升级规则配置 ────────────────────────────────────────────────────────────┐
│ 当前等级： [ 黄金 ▼ ]  目标等级： [ 铂金 ▼ ]                              │
│                                                                             │
│ ┌─ 升级条件 ───────────────────────────────────────────────────────────────┐ │
│ │ 评估维度： [等级积分 ▼]  要求值： [8000] 分                            │ │
│ │ 并且/或者   [变量 ▼] [累计购买次数 ▼] [≥ ▼] [10] [次]                  │ │
│ │ 并且/或者   [变量 ▼] [累计消费金额 ▼] [≥ ▼] [5000] [元]               │ │
│ │                                                                          │ │
│ │ ┌─ 条件组合 ─────────────────────────────────────────────────────────┐  │ │
│ │ │ ● 所有条件都满足（AND）                                            │  │ │
│ │ │ ○ 任一条件满足（OR）                                              │  │ │
│ │ └────────────────────────────────────────────────────────────────────┘  │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 时间窗口（可选） ───────────────────────────────────────────────────────┐ │
│ │ □ 限制在 [365] 天内达到                                              │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 执行策略 ───────────────────────────────────────────────────────────────┐ │
│ │ 升级方式： ● 自动升级   ○ 需审批                                       │ │
│ │ 升级通知： [✓] 发送站内消息                                            │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ [保存] [取消]                                                               │
└───────────────────────────────────────────────────────────────────────────┘
```
### 3.2 保级规则配置
保级规则定义“维持当前等级需要满足什么条件”。
```text
┌─ 保级规则配置 ────────────────────────────────────────────────────────────┐
│ 当前等级： [ 黄金 ▼ ]                                                     │
│ 保级评估周期： [365] 天                                                   │
│                                                                             │
│ ┌─ 保级条件 ───────────────────────────────────────────────────────────────┐ │
│ │ 评估维度： [等级积分 ▼]  要求值： [2000] 分                            │ │
│ │ 并且   [变量 ▼] [累计购买次数 ▼] [≥ ▼] [5] [次]                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 保级失败处理 ───────────────────────────────────────────────────────────┐ │
│ │ 降级目标： [ 白银 ▼ ]                                                   │ │
│ │ 降级方式： ● 自动降级   ○ 需审批                                       │ │
│ │ 宽限期： [ 30 ] 天（宽限期内发送提醒）                                 │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ [保存] [取消]                                                               │
└──────────────────────────────────────────────────────────────────────────┘
```
### 3.3 降级规则配置
降级规则定义“在什么情况下会员会被降级”（通常保级失败自动触发，也可配置主动降级条件）。
```text
┌─ 降级规则配置 ────────────────────────────────────────────────────────────┐
│ 当前等级： [ 黄金 ▼ ]  降级目标： [ 白银 ▼ ]                              │
│                                                                             │
│ ┌─ 降级触发条件 ───────────────────────────────────────────────────────────┐ │
│ │ ● 保级失败时自动触发                                                   │ │
│ │ ○ 主动触发：满足以下条件时降级                                        │ │
│ │   评估维度： [连续不活跃天数 ▼]  [> ▼] [90] [天]                       │ │
│ └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ [保存] [取消]                                                               │
└──────────────────────────────────────────────────────────────────────────┘
```
### 3.4 等级评估引擎执行逻辑
```java
@Service
public class TierEvaluationService {
    @Autowired
    private MemberRepository memberRepo;
    @Autowired
    private TierRuleRepository tierRuleRepo;
    @Autowired
    private MemberVariableService variableService;
    @Autowired
    private PointTypeDefinitionRepository pointTypeRepo;
    @Autowired
    private TierChangeLogRepository tierLogRepo;
    
    @Autowired
    private EventBridge eventBridge;
    @Autowired
    private RuleEvaluationService ruleEngine;
    public void evaluateMemberTier(String programCode, String memberId, String triggerEventId) {
        // 1. 获取会员当前等级
        Member member = memberRepo.findByMemberId(programCode, memberId);
        String currentTier = member.getTierCode();
        
        // 2. 查询升级规则（从 rule_definition 中查询 rule_purpose = 'TIER_UPGRADE'）
        List<RuleDefinition> upgradeRules = tierRuleRepo.findUpgradeRules(programCode, currentTier);
        for (RuleDefinition rule : upgradeRules) {
            boolean satisfied = evaluateRule(programCode, memberId, rule);
            if (satisfied) {
                String targetTier = extractTargetTier(rule);
                performTierChange(member, currentTier, targetTier, "UPGRADE", triggerEventId);
                return; // 升级成功，结束评估
            }
        }
        
        // 3. 查询保级规则（从 rule_definition 中查询 rule_purpose = 'TIER_RETENTION'）
        RuleDefinition retentionRule = tierRuleRepo.findRetentionRule(programCode, currentTier);
        if (retentionRule != null) {
            boolean retained = evaluateRule(programCode, memberId, retentionRule);
            if (!retained) {
                // 保级失败 → 降级
                String downgradeTarget = extractDowngradeTarget(retentionRule);
                performTierChange(member, currentTier, downgradeTarget, "DOWNGRADE", triggerEventId);
            }
        }
    }
    
    private boolean evaluateRule(String programCode, String memberId, RuleDefinition rule) {
        // 复用规则引擎：将 rule 转换为条件表达式，直接调用 Drools 或条件引擎
        JSONObject metadata = rule.getMetadata();
        JSONArray conditions = metadata.getJSONArray("conditions");
        
        // 从 metadata 中读取条件，评估每个条件
        for (int i = 0; i < conditions.size(); i++) {
            JSONObject condition = conditions.getJSONObject(i);
            String dimension = condition.getString("dimension");
            String operator = condition.getString("operator");
            BigDecimal requiredValue = condition.getBigDecimal("required_value");
            
            // 获取实际值（从会员属性或变量中读取）
            BigDecimal actualValue = getActualValue(programCode, memberId, dimension);
            
            // 比较
            if (!compare(actualValue, operator, requiredValue)) {
                return false;
            }
        }
        return true;
    }
    
    private BigDecimal getActualValue(String programCode, String memberId, String dimension) {
        switch (dimension) {
            case "TIER_POINTS":
                // 从 member_account 中查询 TIER 类型积分余额
                return accountRepo.getTierPoints(programCode, memberId);
            case "ORDER_COUNT":
            case "ORDER_COUNT_DAYS":
            case "TOTAL_AMOUNT":
            case "CONTINUOUS_DAYS":
                // 从 member.ext_attributes 中读取变量值
                return variableService.getVariable(programCode, memberId, dimension);
            default:
                return BigDecimal.ZERO;
        }
    }
    
    private void performTierChange(Member member, String oldTier, String newTier, String reason, String triggerEventId) {
        member.setTierCode(newTier);
        memberRepo.save(member);
        
        // 记录等级变更历史
        TierChangeLog log = new TierChangeLog();
        log.setProgramCode(member.getProgramCode());
        log.setMemberId(member.getMemberId());
        log.setOldTier(oldTier);
        log.setNewTier(newTier);
        log.setChangeReason(reason);
        log.setChangedAt(LocalDateTime.now());
        tierLogRepo.save(log);
        
        // 发布事件（仅记录，不触发积分计算）
        eventBridge.publish("loyalty-tier-events", member.getMemberId(),
            new TierChangedEvent(member.getMemberId(), oldTier, newTier, reason, triggerEventId));
    }
}
```
## 四、动态变量管理
### 4.1 变量定义
变量是系统预定义的、可自动更新的会员动态属性。变量可以在积分规则和等级规则中作为条件引用。
| 变量代码                    | 变量名称     | 变量类型 | 说明        | 更新方式     |
| ----------------------- | -------- | ---- | --------- | -------- |
| `ORDER_COUNT_TOTAL`     | 累计购买次数   | 计数器  | 会员总购买次数   | 订单完成时 +1 |
| `ORDER_COUNT_90DAYS`    | 近90天购买次数 | 计数器  | 近90天内购买次数 | 每日定时更新   |
| `TOTAL_AMOUNT`          | 累计消费金额   | 金额   | 会员总消费金额   | 订单完成时累加  |
| `CONTINUOUS_LOGIN_DAYS` | 连续签到天数   | 计数器  | 连续签到天数    | 签到事件时更新  |
| `LAST_ORDER_DAYS`       | 距上次消费天数  | 天数   | 距上次购买的天数  | 每日定时更新   |
| `IS_BIRTHDAY_MONTH`     | 是否生日月    | 布尔值  | 当前月是否是生日月 | 每日定时更新   |
### 4.2 变量存储
变量存储在会员的 `ext_attributes` JSONB 字段中，通过 `program_schema` 定义结构。
```sql
-- 通过 program_schema 定义变量结构
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
### 4.3 变量在积分规则中的使用
积分规则编辑器中，条件构建器可以选择“变量”作为条件来源：
```text
┌─ 触发条件 ───────────────────────────────────────────────────────────────┐
│ 条件来源： [会员属性 ▼]  字段： [会员等级 ▼]  运算符： [∈ ▼]  值： [黄金] │
│ 条件来源： [变量 ▼]      字段： [累计购买次数 ▼]  运算符： [≥ ▼]  值： [5] │
│ 条件来源： [变量 ▼]      字段： [近90天购买次数 ▼]  运算符： [≥ ▼] 值： [3] │
│ 条件来源： [变量 ▼]      字段： [累计消费金额 ▼]  运算符： [≥ ▼] 值：[1000] │
│ [+ 添加条件]                                                            │
└──────────────────────────────────────────────────────────────────────────┘
```
### 4.4 变量在等级规则中的使用
等级规则中，升级/保级条件可以引用变量：
```text
┌─ 升级条件 ───────────────────────────────────────────────────────────────┐
│ 评估维度： [等级积分 ▼]  要求值： [8000] 分                            │
│ 并且   [变量 ▼] [累计购买次数 ▼] [≥ ▼] [10] [次]                       │
│ 并且   [变量 ▼] [累计消费金额 ▼] [≥ ▼] [5000] [元]                     │
│ 并且   [变量 ▼] [连续签到天数 ▼] [≥ ▼] [30] [天]                       │
└──────────────────────────────────────────────────────────────────────────┘
```
### 4.5 变量更新服务
```java
@Service
public class MemberVariableService {
    
    @Autowired
    private MemberRepository memberRepo;
    @Autowired
    private EventBridge eventBridge;
    
    // 订单完成后更新变量
    @EventListener
    public void onOrderCompleted(OrderCompletedEvent event) {
        String programCode = event.getProgramCode();
        String memberId = event.getMemberId();
        BigDecimal orderAmount = event.getTotalAmount();
        
        Member member = memberRepo.findByMemberId(programCode, memberId);
        Map<String, Object> ext = member.getExtAttributes();
        
        // 更新累计购买次数
        int totalCount = (int) ext.getOrDefault("order_count_total", 0) + 1;
        ext.put("order_count_total", totalCount);
        
        // 更新近90天购买次数（需要查询近90天订单数）
        int daysCount = orderRepo.countOrdersInDays(programCode, memberId, 90);
        ext.put("order_count_90days", daysCount);
        
        // 更新累计消费金额
        BigDecimal totalAmount = (BigDecimal) ext.getOrDefault("total_amount", BigDecimal.ZERO);
        totalAmount = totalAmount.add(orderAmount);
        ext.put("total_amount", totalAmount);
        
        // 更新最近下单时间
        ext.put("last_order_at", LocalDateTime.now().toString());
        
        member.setExtAttributes(ext);
        memberRepo.save(member);
        
        // 发布变量更新事件（等级评估引擎监听）
        eventBridge.publish("loyalty-member-events", memberId,
            new MemberVariableUpdatedEvent(memberId, "ORDER", event.getOrderId()));
    }
    
    // 每日定时维护变量
    @Scheduled(cron = "0 0 2 * * ?")
    public void dailyMaintainVariables() {
        // 1. 计算近90天购买次数（所有会员）
        // 2. 计算距上次消费天数
        // 3. 更新连续签到天数（检查签到连续性）
        // 4. 标记生日月
    }
}
```
## 五、等级管理界面完整设计
### 5.1 菜单结构
```text
等级管理
  ├── 等级列表（定义等级）
  ├── 等级积分规则（配置 TIER 积分发放规则）
  ├── 升级/降级/保级规则（配置等级评估规则）
  └── 等级直升活动（配置临时直升活动）
```
### 5.2 等级列表
```text
┌─ 等级管理 ────────────────────────────────────────────────────────────────┐
│ [+ 新建等级]  [配置规则]                                                  │
├────────┬──────────┬──────────────┬───────────────────┬───────────────────┤
│ 等级代码│ 等级名称 │ 等级门槛(分) │ 权益              │ 操作              │
├────────┼──────────┼──────────────┼───────────────────┼───────────────────┤
│ BASE   │ 普通会员 │ 0            │ -                 │ [编辑] [删除]     │
│ SILVER │ 白银会员 │ 1000         │ 9.5折、免运费      │ [编辑] [删除]     │
│ GOLD   │ 黄金会员 │ 3000         │ 9折、免运费        │ [编辑] [删除]     │
│ PLATINUM│铂金会员 │ 8000         │ 8.8折、专属客服    │ [编辑] [删除]     │
└────────┴──────────┴──────────────┴───────────────────┴───────────────────┘
```
### 5.3 等级编辑
```text
┌─ 编辑等级：黄金会员 ──────────────────────────────────────────────────────┐
│ 基础信息                                                                  │
│   等级代码： [GOLD   ]  等级名称： [黄金会员   ]                          │
│   等级层级： [2      ]  等级门槛： [3000     ] 分                        │
│   等级图标： [上传图标]                                                   │
│                                                                             │
│ ┌─ 等级权益 ─────────────────────────────────────────────────────────────┐ │
│ │ 折扣（%）： [90]   免运费： [✓]   生日礼包： [100] 分                 │ │
│ │ 专属活动： [✓]   专属客服： [✓]                                        │ │
│ │ 自定义权益： [{"name":"停车券","value":"每月2张"}]                     │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ [保存] [取消]                                                               │
└──────────────────────────────────────────────────────────────────────────┘
```
### 5.4 等级积分规则列表
```text
┌─ 等级积分规则 ────────────────────────────────────────────────────────────┐
│ 说明：等级积分规则定义“如何获得等级积分（TIER）”，与消费积分规则独立。    │
│ [+ 新建等级积分规则]                                                      │
├──────────────┬─────────────────────────────────────────┬──────────────────┤
│ 规则名称     │ 触发条件                                │ 状态   │ 操作    │
├──────────────┼─────────────────────────────────────────┼──────────────────┤
│ 订单消费得积分│ 订单实付金额 ≥ 100 元                   │ 启用   │ [编辑]  │
│ 等级成长      │ 等级积分 × 1.0 倍                      │        │ [停用]  │
├──────────────┼─────────────────────────────────────────┼──────────────────┤
│ 新会员奖励    │ 入会时间 ≤ 30 天                        │ 启用   │ [编辑]  │
│              │ 奖励 100 等级积分                       │        │ [停用]  │
├──────────────┼─────────────────────────────────────────┼──────────────────┤
│ 黄金以上双倍  │ 会员等级 ∈ [黄金, 铂金]                 │ 草稿   │ [编辑]  │
│              │ 等级积分 × 1.5 倍                      │        │ [发布]  │
└──────────────┴─────────────────────────────────────────┴──────────────────┘
```
### 5.5 升级/降级/保级规则配置页
```text
┌─ 等级评估规则 ────────────────────────────────────────────────────────────┐
│ 当前等级： [黄金 ▼]                                                       │
│                                                                             │
│ ┌─ 升级规则 ─────────────────────────────────────────────────────────────┐ │
│ │ 目标等级： [铂金 ▼]                                                    │ │
│ │ 升级条件：                                                             │ │
│ │   等级积分 ≥ [8000] 分                                                │ │
│ │   累计购买次数 ≥ [10] 次                                              │ │
│ │   累计消费金额 ≥ [5000] 元                                            │ │
│ │ 条件组合： [所有条件都满足 ▼]                                          │ │
│ │ [保存] [取消]                                                          │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 保级规则 ─────────────────────────────────────────────────────────────┐ │
│ │ 评估周期： [365] 天                                                    │ │
│ │ 保级条件： 等级积分 ≥ [2000] 分                                       │ │
│ │ 保级失败降级到： [白银 ▼]                                              │ │
│ │ 降级方式： [自动降级 ▼]                                               │ │
│ │ [保存] [取消]                                                          │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│ ┌─ 降级规则 ─────────────────────────────────────────────────────────────┐ │
│ │ 降级目标： [白银 ▼]                                                    │ │
│ │ 触发方式： [保级失败自动触发 ▼]                                        │ │
│ │ [保存] [取消]                                                          │ │
│ └─────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```
## 六、数据模型补充
### 6.1 等级定义表（`tier_definition`）
```sql
CREATE TABLE tier_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    tier_code VARCHAR(32) NOT NULL,
    tier_name VARCHAR(100) NOT NULL,
    tier_level INT NOT NULL,
    tier_value INT NOT NULL,                  -- 等级门槛值（等级积分要求）
    tier_icon VARCHAR(255),
    tier_benefits JSONB,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, tier_code)
);
```
### 6.2 等级变更日志（`tier_change_log`，已有）
```sql
-- 已有表（v7.3）
CREATE TABLE tier_change_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    old_tier VARCHAR(16),
    new_tier VARCHAR(16) NOT NULL,
    change_reason VARCHAR(50) NOT NULL,  -- UPGRADE / DOWNGRADE / RETENTION / ACTIVITY / MANUAL
    changed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 6.3 等级积分规则
复用 `rule_definition` 表，`rule_purpose` 为 `'EARN_POINTS'`，`metadata` 中 `pointType='TIER'`。
## 七、与现有设计的关系
### 7.1 复用 Loyalty 现有能力
| 能力        | 复用方式                                             |
| --------- | ------------------------------------------------ |
| 积分类型定义    | 复用 `point_type_definition` 表，新增 `TIER` 类型        |
| 积分流水表     | 复用 `account_transaction` 表，`account_type='TIER'` |
| 规则定义      | 复用 `rule_definition` 表，通过 `rule_purpose` 区分      |
| 会员属性      | 复用 `member.ext_attributes` 存储变量                  |
| Schema 定义 | 复用 `program_schema` 定义变量结构                       |
### 7.2 新增能力
| 新增能力       | 实现方式                                                                                   |
| ---------- | -------------------------------------------------------------------------------------- |
| 等级定义       | 新增 `tier_definition` 表                                                                 |
| 升级/降级/保级规则 | 复用 `rule_definition` 表，`rule_purpose='TIER_UPGRADE'/'TIER_DOWNGRADE'/'TIER_RETENTION'` |
| 等级评估引擎     | 新增 `TierEvaluationService`                                                             |
## 八、总结
| 关键点                 | 说明                               |
| ------------------- | -------------------------------- |
| **积分与等级完全解耦**       | 积分负责“发放”，等级负责“评估”，两者独立运行         |
| **等级积分是独立积分类型**     | `TIER` 类型积分有独立配置界面，与 `REWARD` 平级 |
| **变量统一管理**          | 购买次数、累计金额等变量可在积分规则和等级规则中统一引用     |
| **等级评估独立配置**        | 升级/降级/保级规则独立配置，规则编辑器引用变量和等级积分    |
| **复用 Loyalty 基础设施** | 规则定义、积分流水、会员属性全部复用现有表结构          |
