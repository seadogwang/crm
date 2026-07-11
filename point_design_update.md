# Loyalty 积分体系重构设计文档
> **版本**：3.0
> **关联主文档**：基于AI的下一代全渠道忠诚度管理SaaS平台 v7.3
> **设计目标**：
>
> * **消除硬编码**：所有积分类型行为由属性驱动，移除 `REWARD`、`TIER`、`CREDIT` 等硬编码依赖
>
> * **变量化配置**：通过变量表达式（`sum/count/balance`）抽象汇总逻辑，运营人员可自由组合
>
> * **规则引擎解耦**：规则中只引用变量，不关心底层积分类型，新增类型无需修改规则
>
> * **按需预加载**：根据变量表达式自动提取原子积分类型，只查询必要数据，性能可控
>
> * **统一界面**：积分类型管理、变量配置、规则配置三合一，运营人员全流程可视化操作
## 一、整体架构
### 1.1 三层模型
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         第一层：积分类型定义                                 │
│  point_type_definition                                                     │
│  · 类型编码 · 类型名称 · 行为属性（可兑换/算等级/允许负分/可冲抵）            │
│  · 有效期配置                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         第二层：变量配置（派生指标）                          │
│  rule_variable_definition                                                  │
│  · 变量编码 · 变量名称 · 表达式（sum/count/balance + 四则运算）              │
│  · 示例：total_activity = sum('ACT_A') + sum('ACT_B')                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                         第三层：规则配置                                     │
│  rule_definition                                                           │
│  · 规则条件直接引用变量：total_activity >= 1000                            │
│  · 规则动作：发放积分/升级等级                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.2 数据流向
```text
运营创建积分类型 → 运营配置变量（引用积分类型） → 运营配置规则（引用变量）
                                    │
                                    ▼
会员触发事件 → 规则引擎解析规则 → 提取变量列表 → 解析变量表达式 → 提取原子积分类型
                                    │
                                    ▼
批量查询数据库（只查需要的类型） → 计算变量值 → 插入 Drools 会话 → 规则匹配 → 执行动作
```
## 二、数据模型设计
### 2.1 积分类型定义表（`point_type_definition`）
```sql
CREATE TABLE point_type_definition (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    type_code VARCHAR(32) NOT NULL,              -- 唯一编码，如 REWARD, ACT_A
    type_name VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- ===== 行为属性（驱动所有业务逻辑） =====
    is_redeemable BOOLEAN DEFAULT false,         -- 是否可兑换（兑换引擎检查此属性）
    is_tier_calc BOOLEAN DEFAULT false,          -- 是否计入等级计算（等级引擎检查此属性）
    allow_negative BOOLEAN DEFAULT false,        -- 是否允许负分（透支）
    allow_repay BOOLEAN DEFAULT false,           -- 是否可被冲抵（负债积分）
    
    -- ===== 有效期配置 =====
    expiry_mode VARCHAR(20) DEFAULT 'NATURAL_YEAR',  -- NONE / FIXED_DAYS / NATURAL_MONTH / NATURAL_YEAR
    expiry_value INT DEFAULT 12,                 -- 0 = 永久有效
    
    -- ===== 展示配置 =====
    visible BOOLEAN DEFAULT true,                -- 是否对用户可见
    sort_order INT DEFAULT 0,
    
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(program_code, type_code)
);
CREATE INDEX idx_ptd_program ON point_type_definition(program_code);
CREATE INDEX idx_ptd_redeemable ON point_type_definition(is_redeemable) WHERE is_redeemable = true;
CREATE INDEX idx_ptd_tier ON point_type_definition(is_tier_calc) WHERE is_tier_calc = true;
```
### 2.2 变量定义表（`rule_variable_definition`）
```sql
CREATE TABLE rule_variable_definition (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    var_code VARCHAR(64) NOT NULL,               -- 变量编码，如 total_activity
    var_name VARCHAR(128) NOT NULL,              -- 变量名称，如 "活动总积分"
    var_type VARCHAR(20) DEFAULT 'DECIMAL',      -- DECIMAL / INTEGER / BOOLEAN
    expression TEXT NOT NULL,                    -- 表达式：sum('ACT_A') + sum('ACT_B')
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',         -- ACTIVE / INACTIVE
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, var_code)
);
CREATE INDEX idx_rvd_program ON rule_variable_definition(program_code);
CREATE INDEX idx_rvd_status ON rule_variable_definition(status);
```
### 2.3 规则定义表（`rule_definition`）—— 复用已有
无需修改表结构，通过 `metadata` JSONB 存储变量引用：
```json
{
  "conditions": [
    {
      "type": "VARIABLE",
      "varCode": "total_activity",
      "operator": ">=",
      "threshold": 1000
    }
  ],
  "actions": [
    {
      "type": "AWARD_POINTS",
      "pointType": "REWARD",
      "amount": 50
    }
  ]
}
```
## 三、积分类型管理界面
### 3.1 积分类型列表页
```text
┌─ 积分类型管理 ─────────────────────────────────────────────────────────────┐
│  Program: [BRAND_A ▼]  [+ 新建积分类型]                                    │
├──────────┬──────────────┬──────────┬──────────┬──────────┬───────────────┤
│ 类型代码 │ 类型名称     │ 可兑换  │ 算等级  │ 可冲抵  │ 有效期        │ 操作 │
├──────────┼──────────────┼──────────┼──────────┼──────────┼───────────────┤
│ REWARD   │ 消费积分     │ ✅      │ ❌      │ ❌      │ 365天        │ [编辑]│
│ TIER_AMT │ 等级金额积分 │ ❌      │ ✅      │ ❌      │ 永久         │ [编辑]│
│ TIER_CNT │ 等级次数积分 │ ❌      │ ✅      │ ❌      │ 永久         │ [编辑]│
│ ACT_A    │ A活动积分    │ ✅      │ ❌      │ ❌      │ 90天         │ [编辑]│
│ PREPAY   │ 预售积分     │ ✅      │ ❌      │ ✅      │ 30天         │ [编辑]│
└──────────┴──────────────┴──────────┴──────────┴──────────┴───────────────┘
```
### 3.2 新建/编辑积分类型
```text
┌─ 编辑积分类型 ─────────────────────────────────────────────────────────────┐
│  类型代码: [ACT_B                 ]  (唯一标识，不可修改)                  │
│  类型名称: [B活动积分             ]                                        │
│  描述:     [B活动期间发放的临时积分]                                        │
│                                                                             │
│  ┌─ 行为属性 ─────────────────────────────────────────────────────────────┐ │
│  │  ☑ 可兑换 (is_redeemable)  兑换时使用 FIFO 过期时间排序              │ │
│  │  ☐ 算等级 (is_tier_calc)   等级评估时会计入此类型                    │ │
│  │  ☐ 允许负分 (allow_negative)  允许账户余额为负（透支）               │ │
│  │  ☑ 可被冲抵 (allow_repay)   发放正式积分时优先冲抵此类型              │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 有效期配置 ───────────────────────────────────────────────────────────┐ │
│  │  有效期模式: [固定天数 ▼]  有效期值: [90] 天                         │ │
│  │  (0 = 永久有效)                                                       │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ☑ 对用户可见                                                               │
│                                                                             │
│  [保存] [取消]                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```
## 四、变量配置界面
### 4.1 变量列表页
```text
┌─ 变量管理 ─────────────────────────────────────────────────────────────────┐
│  Program: [BRAND_A ▼]  [+ 新建变量]                                       │
│  变量可在规则中作为条件使用，系统自动计算其值                               │
├────────────┬──────────────┬──────────────────────────────┬───────────────┤
│ 变量代码   │ 变量名称     │ 表达式                       │ 状态   │ 操作  │
├────────────┼──────────────┼──────────────────────────────┼────────┼───────┤
│ total_act  │ 活动总积分   │ sum('ACT_A') + sum('ACT_B') │ 启用   │ [编辑]│
│ sign_days  │ 签到天数     │ count('SIGN_IN')            │ 启用   │ [编辑]│
│ vip_score  │ VIP综合分    │ sum('REWARD') * 0.5 + 100   │ 启用   │ [编辑]│
│ tier_total │ 等级评估值   │ sum('TIER_AMT')             │ 启用   │ [编辑]│
└────────────┴──────────────┴──────────────────────────────┴────────┴───────┘
```
### 4.2 新建/编辑变量（核心界面）
```text
┌─ 新建变量 ─────────────────────────────────────────────────────────────────┐
│  变量代码: [total_act                ]  (唯一标识，字母数字下划线)         │
│  变量名称: [活动总积分               ]                                     │
│  变量类型: [DECIMAL ▼]  描述: [A活动+B活动积分之和]                        │
│                                                                             │
│  ┌─ 表达式编辑器 ───────────────────────────────────────────────────────┐  │
│  │  sum('ACT_A') + sum('ACT_B') + 100                                  │  │
│  │                                                                      │  │
│  │  ┌──────────────────────────────────────────────────────────┐       │  │
│  │  │  可用函数：                                                   │       │  │
│  │  │  [sum] [count] [balance] + - * / ( )                       │       │  │
│  │  │  可用积分类型：                                               │       │  │
│  │  │  [REWARD] [ACT_A] [ACT_B] [SIGN_IN] [TIER_AMT] [PREPAY]  │       │  │
│  │  └──────────────────────────────────────────────────────────┘       │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌─ 预览测试 ─────────────────────────────────────────────────────────────┐ │
│  │  测试会员: [M12345        ]  [计算]                                   │ │
│  │  计算结果: 1250.50                                                    │ │
│  │  明细: ACT_A: 800.00, ACT_B: 350.50, 常量: 100.00                    │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [保存] [取消]                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.3 表达式辅助功能
| 功能         | 说明                             |
| ---------- | ------------------------------ |
| **函数按钮**   | 点击 sum 自动插入 `sum('')`，光标定位到引号内 |
| **积分类型下拉** | 点击类型自动填入当前光标位置的引号内             |
| **语法高亮**   | 编辑器支持函数名、字符串、运算符颜色区分           |
| **实时校验**   | 括号匹配、函数名正确性、类型是否存在             |
| **预览计算**   | 输入测试会员，后端执行计算并返回结果             |
## 五、规则配置界面（变量引用）
### 5.1 规则列表页（增加变量列）
```text
┌─ 规则管理 ─────────────────────────────────────────────────────────────────┐
│  [基础规则]  [活动规则]                [+ 新建规则]                        │
├────────────┬──────────────┬──────────────────────┬────────────────────────┤
│ 规则名称   │ 类型         │ 条件摘要             │ 状态   │ 操作          │
├────────────┼──────────────┼──────────────────────┼────────┼───────────────┤
│ 活动奖励   │ 积分累积     │ total_act >= 1000   │ 启用   │ [编辑]       │
│ 签到奖励   │ 积分累积     │ sign_days >= 7      │ 启用   │ [编辑]       │
│ 银卡升级   │ 等级规则     │ tier_total >= 5000  │ 草稿   │ [编辑]       │
└────────────┴──────────────┴──────────────────────┴────────┴───────────────┘
```
### 5.2 规则编辑器中引用变量
```text
┌─ 编辑规则：活动奖励 ──────────────────────────────────────────────────────┐
│  规则名称: [活动奖励                ]                                     │
│  规则类型: [积分累积规则 ▼]                                               │
│  奖励积分: [REWARD ▼]  数量: [50]                                        │
│                                                                             │
│  ┌─ 触发条件 ─────────────────────────────────────────────────────────────┐ │
│  │  条件1： [变量 ▼] [total_act ▼] [≥ ▼] [1000]                       │ │
│  │  变量说明：活动总积分 (sum('ACT_A') + sum('ACT_B'))                  │ │
│  │                                                                        │ │
│  │  [+ 添加条件]  条件关系： ● AND  ○ OR                               │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [保存草稿] [测试] [发布]                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 5.3 规则配置存储格式
```json
{
  "ruleCode": "ACTIVITY_BONUS",
  "ruleName": "活动奖励",
  "rulePurpose": "EARN_POINTS",
  "conditions": [
    {
      "type": "VARIABLE",
      "varCode": "total_act",
      "operator": ">=",
      "threshold": 1000
    }
  ],
  "actions": [
    {
      "type": "AWARD_POINTS",
      "pointType": "REWARD",
      "amount": 50
    }
  ]
}
```
## 六、后端核心逻辑（伪代码）
### 6.1 积分类型服务（属性驱动）
```java
@Service
public class PointTypeService {
    @Autowired
    private PointTypeDefinitionRepository typeRepo;
    /**
     * 获取所有可兑换的积分类型（兑换引擎使用）
     */
    public List<PointTypeDefinition> getRedeemableTypes(String programCode) {
        return typeRepo.findByProgramCodeAndIsRedeemableTrue(programCode);
    }
    /**
     * 获取所有可冲抵的积分类型（冲抵引擎使用）
     */
    public List<PointTypeDefinition> getRepayableTypes(String programCode) {
        return typeRepo.findByProgramCodeAndAllowRepayTrue(programCode);
    }
    /**
     * 获取所有计入等级的积分类型（等级引擎使用）
     */
    public List<PointTypeDefinition> getTierCalcTypes(String programCode) {
        return typeRepo.findByProgramCodeAndIsTierCalcTrue(programCode);
    }
}
```
### 6.2 变量表达式解析器
```java
@Component
public class VariableExpressionParser {
    private static final Pattern FUNCTION_PATTERN = 
        Pattern.compile("(sum|count|balance)('([^']+)')");
    /**
     * 提取表达式中所有的原子积分类型
     */
    public Set<String> extractAtomicTypes(String expression) {
        Set<String> types = new HashSet<>();
        Matcher matcher = FUNCTION_PATTERN.matcher(expression);
        while (matcher.find()) {
            types.add(matcher.group(2));
        }
        return types;
    }
    /**
     * 验证表达式语法
     */
    public ValidationResult validate(String expression, Set<String> availableTypes) {
        // 1. 检查括号匹配
        if (!isBalanced(expression)) {
            return ValidationResult.error("括号不匹配");
        }
        // 2. 检查函数名是否合法
        Matcher matcher = FUNCTION_PATTERN.matcher(expression);
        while (matcher.find()) {
            String typeCode = matcher.group(2);
            if (!availableTypes.contains(typeCode)) {
                return ValidationResult.error("积分类型不存在: " + typeCode);
            }
        }
        // 3. 检查是否包含非法字符
        if (!isSafeExpression(expression)) {
            return ValidationResult.error("表达式包含非法字符");
        }
        return ValidationResult.success();
    }
}
```
### 6.3 变量计算服务（核心）
```java
@Service
public class VariableCalculationService {
    @Autowired
    private VariableDefinitionRepository varRepo;
    @Autowired
    private AccountTransactionRepository txRepo;
    @Autowired
    private VariableExpressionParser parser;
    /**
     * 按需预加载：解析变量表达式，批量查询原子数据，计算变量值
     */
    public Map<String, BigDecimal> calculateVariables(String programCode, 
                                                       List<String> varCodes, 
                                                       String memberId, 
                                                       int windowDays) {
        // 1. 获取变量定义
        List<VariableDefinition> vars = varRepo.findByProgramCodeAndVarCodeIn(programCode, varCodes);
        
        // 2. 提取所有原子积分类型（去重）
        Set<String> allAtomicTypes = new HashSet<>();
        Map<String, String> varExpressionMap = new HashMap<>();
        for (VariableDefinition var : vars) {
            String expr = var.getExpression();
            varExpressionMap.put(var.getVarCode(), expr);
            allAtomicTypes.addAll(parser.extractAtomicTypes(expr));
        }
        // 3. 批量查询所有原子类型的汇总值（一次查询）
        Map<String, BigDecimal> atomicValues = loadAtomicSummaries(
            memberId, allAtomicTypes, windowDays
        );
        // 4. 计算每个变量的值
        Map<String, BigDecimal> results = new HashMap<>();
        for (VariableDefinition var : vars) {
            String expr = varExpressionMap.get(var.getVarCode());
            String calculableExpr = replaceFunctionsWithValues(expr, atomicValues);
            BigDecimal value = evaluateExpression(calculableExpr);
            results.put(var.getVarCode(), value);
        }
        return results;
    }
    /**
     * 批量加载原子汇总值（只查一次数据库）
     */
    private Map<String, BigDecimal> loadAtomicSummaries(String memberId, 
                                                         Set<String> types, 
                                                         int windowDays) {
        if (types.isEmpty()) return new HashMap<>();
        
        LocalDateTime windowStart = LocalDateTime.now().minusDays(windowDays);
        List<String> typeList = new ArrayList<>(types);
        
        // 查询 SUM 和 COUNT（一次查询返回所有类型）
        List<Object[]> results = txRepo.sumAndCountByMemberIdAndTypesAndTimeRange(
            memberId, typeList, windowStart, LocalDateTime.now()
        );
        
        Map<String, BigDecimal> valueMap = new HashMap<>();
        for (Object[] row : results) {
            String type = (String) row[0];
            BigDecimal sum = (BigDecimal) row[1];
            Long count = (Long) row[2];
            // 默认使用 SUM，如果为 NULL 则使用 COUNT
            valueMap.put(type, sum != null ? sum : BigDecimal.valueOf(count));
        }
        return valueMap;
    }
    /**
     * 替换表达式中的函数调用为实际数值
     */
    private String replaceFunctionsWithValues(String expression, 
                                               Map<String, BigDecimal> atomicValues) {
        String result = expression;
        Matcher matcher = FUNCTION_PATTERN.matcher(expression);
        while (matcher.find()) {
            String function = matcher.group(1);
            String type = matcher.group(2);
            BigDecimal value = atomicValues.getOrDefault(type, BigDecimal.ZERO);
            result = result.replace(matcher.group(0), value.toPlainString());
        }
        return result;
    }
    /**
     * 执行算术运算（使用 Aviator 或 ScriptEngine）
     */
    private BigDecimal evaluateExpression(String expression) {
        // 使用 Aviator 表达式引擎
        return new BigDecimal(AviatorEvaluator.execute(expression).toString());
    }
}
```
### 6.4 规则执行服务（集成变量）
```java
@Service
public class RuleEvaluationService {
    @Autowired
    private VariableCalculationService varCalcService;
    @Autowired
    private RuleDefinitionRepository ruleRepo;
    @Autowired
    private KieBaseCacheManager kieManager;
    public List<Action> evaluate(String programCode, EventFact event, MemberFact member) {
        // 1. 获取所有 ACTIVE 规则
        List<RuleDefinition> rules = ruleRepo.findActiveByProgramCode(programCode);
        // 2. 提取所有规则中引用的变量（去重）
        Set<String> allVarCodes = extractVariableCodes(rules);
        if (allVarCodes.isEmpty()) {
            // 没有变量条件，直接执行规则
            return executeRules(rules, event, member);
        }
        // 3. 计算所有变量的值（按需预加载）
        int windowDays = getGlobalWindowDays(rules);
        Map<String, BigDecimal> varValues = varCalcService.calculateVariables(
            programCode, new ArrayList<>(allVarCodes), member.getMemberId(), windowDays
        );
        // 4. 构建 Drools 会话
        KieSession session = kieManager.getKieBase(programCode).newKieSession();
        session.insert(event);
        session.insert(member);
        
        // 5. 将变量值封装为 Fact 插入会话
        VariableFact varFact = new VariableFact(varValues);
        session.insert(varFact);
        
        // 6. 执行规则
        ActionCollector collector = ActionCollector.get();
        session.setGlobal("collector", collector);
        session.fireAllRules();
        session.dispose();
        return collector.getActions();
    }
    private Set<String> extractVariableCodes(List<RuleDefinition> rules) {
        Set<String> varCodes = new HashSet<>();
        for (RuleDefinition rule : rules) {
            JSONArray conditions = rule.getMetadata().getJSONArray("conditions");
            for (int i = 0; i < conditions.size(); i++) {
                JSONObject cond = conditions.getJSONObject(i);
                if ("VARIABLE".equals(cond.getString("type"))) {
                    varCodes.add(cond.getString("varCode"));
                }
            }
        }
        return varCodes;
    }
}
```
## 七、API 接口设计
### 7.1 积分类型 API
| 方法     | 路径                            | 说明                |
| ------ | ----------------------------- | ----------------- |
| GET    | `/api/point-types`            | 获取积分类型列表          |
| GET    | `/api/point-types/{typeCode}` | 获取单个类型详情          |
| POST   | `/api/point-types`            | 创建积分类型            |
| PUT    | `/api/point-types/{typeCode}` | 更新积分类型            |
| DELETE | `/api/point-types/{typeCode}` | 删除积分类型（检查是否被变量引用） |
### 7.2 变量 API
| 方法     | 路径                         | 说明              |
| ------ | -------------------------- | --------------- |
| GET    | `/api/variables`           | 获取变量列表          |
| GET    | `/api/variables/{varCode}` | 获取单个变量详情        |
| POST   | `/api/variables`           | 创建变量            |
| PUT    | `/api/variables/{varCode}` | 更新变量            |
| DELETE | `/api/variables/{varCode}` | 删除变量（检查是否被规则引用） |
| POST   | `/api/variables/validate`  | 验证表达式语法         |
| POST   | `/api/variables/calculate` | 预览计算（测试会员）      |
### 7.3 规则 API（扩展）
| 方法   | 路径                           | 说明                   |
| ---- | ---------------------------- | -------------------- |
| GET  | `/api/rules`                 | 获取规则列表（含变量摘要）        |
| POST | `/api/rules`                 | 创建规则（metadata 中引用变量） |
| PUT  | `/api/rules/{ruleCode}`      | 更新规则                 |
| POST | `/api/rules/{ruleCode}/test` | 测试规则（传入模拟变量值）        |
## 八、变量在 DRL 中的最终形态
```drools
package com.loyalty.rules;
import com.loyalty.platform.domain.rules.model.EventFact;
import com.loyalty.platform.domain.rules.model.MemberFact;
import com.loyalty.platform.domain.rules.model.VariableFact;
import com.loyalty.platform.domain.rules.engine.ActionCollector;
global ActionCollector collector;
rule "ACTIVITY_BONUS"
when
    $event: EventFact(eventType == "ORDER")
    $member: MemberFact(memberId == $event.memberId)
    $vars: VariableFact(getValue("total_act") >= 1000)
then
    collector.awardPoints($event.getEventId(), 50, "REWARD");
    collector.addNote("活动总积分: " + $vars.getValue("total_act"));
end
```
## 九、开发实施步骤
| 阶段           | 任务                              | 说明                          | 优先级 |
| ------------ | ------------------------------- | --------------------------- | --- |
| **Phase 1**  | 创建 `rule_variable_definition` 表 | 数据库 DDL                     | P0  |
| **Phase 2**  | 实现积分类型服务                        | 属性驱动查询                      | P0  |
| **Phase 3**  | 实现变量表达式解析器                      | 提取原子类型、语法校验                 | P0  |
| **Phase 4**  | 实现变量计算服务                        | 按需预加载 + 表达式计算               | P0  |
| **Phase 5**  | 改造规则执行服务                        | 集成变量计算                      | P0  |
| **Phase 6**  | 积分类型管理界面                        | 列表 + 编辑                     | P1  |
| **Phase 7**  | 变量管理界面                          | 列表 + 编辑 + 表达式辅助             | P1  |
| **Phase 8**  | 规则编辑器改造                         | 条件中引用变量                     | P1  |
| **Phase 9**  | 移除硬编码                           | 搜索替换 `if ("REWARD".equals)` | P1  |
| **Phase 10** | 迁移现有规则                          | 将硬编码条件转为变量引用                | P2  |
## 十、总结
| 能力           | 实现方式                                                                         |
| ------------ | ---------------------------------------------------------------------------- |
| **积分类型管理**   | `point_type_definition` 表 + 属性驱动（is_redeemable/is_tier_calc/allow_repay） |
| **变量配置**     | `rule_variable_definition` 表 + 表达式（sum/count/balance + 四则运算）                 |
| **规则引用变量**   | `metadata.conditions[].type = "VARIABLE"`                                    |
| **按需预加载**    | 解析变量表达式 → 提取原子类型 → 批量查询数据库                                                   |
| **表达式解析**    | `VariableExpressionParser` 提取 `sum('XXX')` 中的类型                              |
| **变量计算**     | 原子值替换 + Aviator 表达式引擎执行运算                                                    |
| **前端变量编辑器**  | 函数按钮 + 积分类型辅助 + 实时预览                                                         |
| **DRL 最终形态** | `VariableFact(getValue("total_act") >= 1000)`                                |
