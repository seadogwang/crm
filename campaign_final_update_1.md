# 人群筛选能力升级——产品化设计重构
**版本**：2.0
**变更类型**：架构重构（彻底去除预聚合字段）
**核心原则**：产品化 + 行业无关 + 完全可配置
***
## 一、你的质疑完全正确
### 问题本质
| 原设计缺陷     | 说明                                                                         |
| --------- | -------------------------------------------------------------------------- |
| **行业定制化** | `last_30_days_order_count`、`total_order_amount` 是零售业口径，换到SaaS、金融、教育等行业完全失效 |
| **产品化失败** | 每接一个新行业/客户，就要改表结构、改同步逻辑、改查询代码——这是项目定制，不是产品                                 |
| **字段爆炸**  | 如果支持 N 种统计维度（7天/15天/30天/60天/90天），字段数 = 指标数 × 时间窗口数，无限膨胀                    |
### 产品化设计的核心要求
> **产品不应该为特定行业预定义任何统计指标，应该允许用户在配置规则时“动态定义”自己需要的统计指标。**
***
## 二、重新设计：完全动态的统计查询引擎
### 2.1 核心思路
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  产品化设计核心                                                             │
│                                                                             │
│  1. 原始数据层（Row Data）—— 不变                                          │
│     · 订单明细、积分流水、行为事件、等级变更                               │
│     · 这些是业务事实，所有行业通用                                          │
│                                                                             │
│  2. 统计定义层（完全动态）—— 由用户在配置时定义                             │
│     · 用户说："我要统计近30天订单数 ≥ 3"                                  │
│     · 系统不预知这个字段，而是根据规则动态生成 SQL 聚合                    │
│                                                                             │
│  3. 查询执行层（实时聚合）—— 每次查询时动态计算                             │
│     · 无需任何预聚合字段                                                   │
│     · 性能由数据库引擎 + 索引保证                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 2.2 用户配置示例（完全动态）
用户在界面上配置时，**自己定义统计指标**：
```json
{
  "conditions": [
    {
      "type": "DYNAMIC_STAT",
      "name": "近30天订单数",
      "definition": {
        "dataSource": "order_fact",
        "aggregation": {
          "func": "COUNT",
          "field": "order_id"
        },
        "filter": {
          "field": "order_date",
          "operator": "gte",
          "value": "{{NOW - 30 days}}"
        },
        "groupBy": "member_id"
      },
      "operator": "gte",
      "value": 3
    },
    {
      "type": "DYNAMIC_STAT",
      "name": "累计消费金额",
      "definition": {
        "dataSource": "order_fact",
        "aggregation": {
          "func": "SUM",
          "field": "net_amount"
        },
        "filter": {},  // 全部历史
        "groupBy": "member_id"
      },
      "operator": "gte",
      "value": 5000
    },
    {
      "type": "STATIC_ATTR",
      "field": "tier_code",
      "operator": "in",
      "value": ["GOLD", "PLATINUM"]
    }
  ],
  "logic": "AND"
}
```
### 2.3 数据模型：仅存原始明细表
```sql
-- ============================================================
-- 1. 订单明细表（从 Loyalty 同步，行业通用）
-- ============================================================
CREATE TABLE campaign_order_fact (
    id BIGSERIAL PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    order_date TIMESTAMPTZ NOT NULL,
    order_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2) DEFAULT 0,
    net_amount DECIMAL(18,2),
    channel VARCHAR(32),
    -- 这些字段是业务事实，所有行业共用，不需要针对行业定制
    sku_code VARCHAR(64),
    sku_name VARCHAR(255),
    category_code VARCHAR(64),
    category_name VARCHAR(64),
    brand_code VARCHAR(64),
    brand_name VARCHAR(64),
    quantity INT,
    unit_price DECIMAL(18,4),
    line_amount DECIMAL(18,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================================
-- 2. 积分流水表（从 Loyalty 同步）
-- ============================================================
CREATE TABLE campaign_points_transaction (
    id BIGSERIAL PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    transaction_date TIMESTAMPTZ NOT NULL,
    point_type VARCHAR(32),
    amount DECIMAL(18,4),
    balance_after DECIMAL(18,4),
    reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================================
-- 3. 会员属性表（从 Loyalty 同步，仅静态属性）
-- ============================================================
CREATE TABLE campaign_member_attr (
    member_id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    name VARCHAR(100),
    gender VARCHAR(10),
    birthday DATE,
    register_date DATE,
    tier_code VARCHAR(16),
    tier_name VARCHAR(50),
    tier_level INT,
    status VARCHAR(16),
    blacklist_flag BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- ============================================================
-- 4. 等级变更日志表
-- ============================================================
CREATE TABLE campaign_tier_change_log (
    id BIGSERIAL PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    change_date TIMESTAMPTZ NOT NULL,
    from_tier VARCHAR(16),
    to_tier VARCHAR(16),
    reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```
### 2.4 关键设计：无任何预聚合字段
| 表名                            | 字段类型 | 说明                 |
| ----------------------------- | ---- | ------------------ |
| `campaign_order_fact`         | 原始明细 | 每行一条订单记录，包含订单头和行明细 |
| `campaign_points_transaction` | 原始明细 | 每行一条积分流水记录         |
| `campaign_member_attr`        | 静态属性 | 仅静态属性，不含任何统计字段     |
| `campaign_tier_change_log`    | 原始明细 | 每行一条等级变更记录         |
**没有任何 `last_30_days_order_count`、`total_order_amount` 这类预聚合字段。**
***
## 三、查询引擎设计（实时聚合）
### 3.1 SQL 动态生成逻辑
```java
@Component
public class DynamicStatSqlGenerator {
    /**
     * 生成动态统计条件的 SQL
     * 
     * 示例输入：
     * {
     *   "dataSource": "order_fact",
     *   "aggregation": { "func": "COUNT", "field": "order_id" },
     *   "filter": { "field": "order_date", "operator": "gte", "value": "{{NOW - 30 days}}" },
     *   "groupBy": "member_id"
     * }
     * 
     * 生成 SQL：
     * SELECT member_id, COUNT(order_id) AS stat_value
     * FROM campaign_order_fact
     * WHERE order_date >= NOW() - INTERVAL '30 days'
     * GROUP BY member_id
     * HAVING COUNT(order_id) >= 3
     */
    public String generateSql(JsonNode statDefinition, String operator, Object value) {
        String dataSource = statDefinition.path("dataSource").asText();
        JsonNode aggregation = statDefinition.path("aggregation");
        JsonNode filter = statDefinition.path("filter");
        String groupBy = statDefinition.path("groupBy").asText("member_id");
        String tableName = mapDataSource(dataSource);
        String aggFunc = aggregation.path("func").asText("COUNT");
        String aggField = aggregation.path("field").asText("*");
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ").append(groupBy)
           .append(", ").append(aggFunc).append("(").append(aggField).append(") AS stat_value ")
           .append("FROM ").append(tableName).append(" WHERE 1=1 ");
        // 时间过滤
        if (filter != null && !filter.isNull()) {
            String filterSql = buildFilterSql(filter);
            sql.append(" AND ").append(filterSql);
        }
        sql.append(" GROUP BY ").append(groupBy);
        sql.append(" HAVING ").append(aggFunc).append("(").append(aggField).append(") ")
           .append(operator).append(" ").append(value);
        return sql.toString();
    }
    private String buildFilterSql(JsonNode filter) {
        String field = filter.path("field").asText();
        String operator = filter.path("operator").asText();
        String value = filter.path("value").asText();
        // 处理时间变量替换
        if (value.contains("{{NOW")) {
            value = parseTimeVariable(value);
        }
        switch (operator) {
            case "eq": return field + " = " + quote(value);
            case "gte": return field + " >= " + quote(value);
            case "lte": return field + " <= " + quote(value);
            case "in": return field + " IN (" + value + ")";
            default: return field + " " + operator + " " + quote(value);
        }
    }
    private String parseTimeVariable(String expr) {
        // {{NOW - 30 days}} → NOW() - INTERVAL '30 days'
        return expr.replace("{{NOW", "NOW()").replace("}}", "");
    }
}
```
### 3.2 完整规则执行流程
```java
@Component
public class AudienceQueryEngine {
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private DynamicStatSqlGenerator sqlGenerator;
    /**
     * 执行完整的人群筛选查询
     */
    public List<String> execute(AudienceConfig config) {
        // 1. 分别处理静态条件和动态统计条件
        List<String> staticConditions = new ArrayList<>();
        List<String> statSubQueries = new ArrayList<>();
        for (AudienceCondition condition : config.getConditions()) {
            if (condition.getType().equals("STATIC_ATTR")) {
                // 静态属性条件 → 直接作为 WHERE 子句
                staticConditions.add(buildStaticCondition(condition));
            } else if (condition.getType().equals("DYNAMIC_STAT")) {
                // 动态统计条件 → 生成子查询
                String subQuery = sqlGenerator.generateSql(
                    condition.getDefinition(),
                    condition.getOperator(),
                    condition.getValue()
                );
                statSubQueries.add(subQuery);
            }
        }
        // 2. 组装最终 SQL
        String finalSql = buildFinalSql(staticConditions, statSubQueries, config.getLogic());
        // 3. 执行查询
        return jdbcTemplate.queryForList(finalSql, String.class);
    }
    private String buildFinalSql(List<String> staticConds, 
                                  List<String> statSubQueries,
                                  String logic) {
        // 如果有统计子查询，需要做 JOIN
        if (!statSubQueries.isEmpty()) {
            StringBuilder sql = new StringBuilder();
            sql.append("SELECT DISTINCT ma.member_id FROM campaign_member_attr ma ");
            int idx = 0;
            for (String subQuery : statSubQueries) {
                String alias = "stat_" + (idx++);
                sql.append(" INNER JOIN (").append(subQuery).append(") ")
                   .append(alias).append(" ON ma.member_id = ").append(alias).append(".member_id ");
            }
            sql.append(" WHERE 1=1 ");
            for (String cond : staticConds) {
                sql.append(" AND ").append(cond);
            }
            return sql.toString();
        }
        // 只有静态条件
        return "SELECT member_id FROM campaign_member_attr WHERE " + 
               String.join(" " + logic + " ", staticConds);
    }
}
```
***
## 四、前端界面设计（统计定义器）
### 4.1 核心交互：让用户“定义”统计指标
```text
┌─ 添加统计条件 ──────────────────────────────────────────────────────────────┐
│                                                                             │
│  条件名称: [ 近30天订单数               ]                                   │
│                                                                             │
│  ┌─ 数据源 ───────────────────────────────────────────────────────────────┐ │
│  │  数据源: [订单明细 ▼]                                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 聚合定义 ─────────────────────────────────────────────────────────────┐ │
│  │  聚合函数: [COUNT ▼]  字段: [订单ID ▼]                                 │ │
│  │  说明: 统计订单数量                                                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 过滤条件（可选） ─────────────────────────────────────────────────────┐ │
│  │  字段: [订单日期]  操作符: [≥]  值: [最近 30 天]                      │ │
│  │  [+ 添加过滤]                                                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 分组 ─────────────────────────────────────────────────────────────────┐ │
│  │  分组字段: [会员ID]  ← 固定，不可修改                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 条件判断 ─────────────────────────────────────────────────────────────┐ │
│  │  聚合结果 [≥] [3]                                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [✅ 确认] [取消]                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.2 支持的数据源与聚合函数（完全动态）
| 数据源      | 可用字段              | 可用聚合函数                                     |
| -------- | ----------------- | ------------------------------------------ |
| **订单明细** | 订单日期、金额、SKU、品类、品牌 | COUNT, SUM, AVG, MAX, MIN, COUNT_DISTINCT |
| **积分流水** | 日期、积分类型、变动金额、余额   | COUNT, SUM, AVG, MAX, MIN                  |
| **等级变更** | 日期、变更前等级、变更后等级    | COUNT, COUNT_DISTINCT                     |
| **行为事件** | 日期、事件类型、事件属性      | COUNT, COUNT_DISTINCT                     |
### 4.3 前端配置数据结构（TypeScript）
typescript
```
// ============================================================
// 完全动态的统计条件定义
// ============================================================
interface DynamicStatCondition {
  type: 'DYNAMIC_STAT';
  
  // 用户给这个统计起个名字（用于展示）
  name: string;
  
  // ---- 统计定义 ----
  definition: {
    // 数据源
    dataSource: 'order_fact' | 'points_transaction' | 'tier_change_log' | 'behavior_event';
    
    // 聚合
    aggregation: {
      func: 'COUNT' | 'SUM' | 'AVG' | 'MAX' | 'MIN' | 'COUNT_DISTINCT';
      field: string;  // 对应数据源中的字段名
    };
    
    // 过滤（可选）
    filters?: {
      field: string;
      operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';
      value: any;
    }[];
    
    // 时间窗口（可选）
    timeWindow?: {
      type: 'ALL' | 'LAST_N_DAYS' | 'CUSTOM';
      days?: number;
      startDate?: string;
      endDate?: string;
    };
  };
  
  // ---- 条件判断 ----
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
  value: number | string;
}
// 完整的人群配置
interface AudienceConfig {
  logic: 'AND' | 'OR';
  conditions: Array<
    | DynamicStatCondition   // 完全由用户定义的统计指标
    | StaticAttrCondition    // 静态属性条件（如会员等级、状态）
  >;
  limit?: number;
}
```
***
## 五、性能优化策略（无预聚合）
### 5.1 索引设计（关键）
```sql
-- ============================================================
-- 核心索引（支撑所有动态聚合查询）
-- ============================================================
-- 1. 订单明细表复合索引（覆盖最常见的过滤+聚合）
CREATE INDEX idx_order_fact_member_date ON campaign_order_fact(member_id, order_date DESC);
CREATE INDEX idx_order_fact_date ON campaign_order_fact(order_date DESC);
-- 品类/品牌查询支持
CREATE INDEX idx_order_fact_category ON campaign_order_fact(category_code, order_date DESC);
CREATE INDEX idx_order_fact_brand ON campaign_order_fact(brand_code, order_date DESC);
-- 2. 积分流水表
CREATE INDEX idx_points_member_date ON campaign_points_transaction(member_id, transaction_date DESC);
CREATE INDEX idx_points_date ON campaign_points_transaction(transaction_date DESC);
-- 3. 行为事件表
CREATE INDEX idx_behavior_member_date ON campaign_behavior_event(member_id, event_date DESC);
CREATE INDEX idx_behavior_date ON campaign_behavior_event(event_date DESC);
```
### 5.2 查询优化策略
| 场景                     | 策略                                                 |
| ---------------------- | -------------------------------------------------- |
| **小数据集（< 10万会员）**      | 直接实时聚合，无需额外优化                                      |
| **中等数据集（10万~100万会员）** | 使用覆盖索引 + 并行查询                                      |
| **大数据集（> 100万会员）**     | 先通过静态属性过滤候选集（如 `status='ACTIVE'`），再对候选集做聚合         |
| **高频查询**               | 利用 PostgreSQL 的 `pg_stat_statements` 分析慢查询，针对性增加索引 |
| **极端情况**               | 切换到 ClickHouse（列式存储 + 向量化执行），所有聚合查询性能提升 10~100 倍  |
### 5.3 切换 ClickHouse 的兼容设计
```java
/**
 * 切换到 ClickHouse 时，只需修改 SQL 方言生成器
 * 接口不变，业务代码完全无需修改
 */
@Component
@ConditionalOnProperty(name = "audience.engine", havingValue = "clickhouse")
public class ClickHouseStatSqlGenerator implements StatSqlGenerator {
    
    @Override
    public String generateSql(JsonNode statDefinition, String operator, Object value) {
        // ClickHouse 语法
        // 列式存储 + 向量化执行，聚合查询极快
        // 无需任何预聚合字段
    }
}
```
***
## 六、总结：为什么这个设计是“产品化”的
| 对比维度      | 原设计（预聚合字段）  | 新设计（完全动态）                  |
| --------- | ----------- | -------------------------- |
| **行业适配**  | 需为不同行业定制字段  | **零定制**，任意行业通用             |
| **扩展性**   | 增加指标需改表结构   | **零代码**，用户在界面自己定义          |
| **数据新鲜度** | 依赖同步频率（分钟级） | **实时**，基于 NOW()            |
| **存储成本**  | 高（大量冗余字段）   | **低**，仅存原始明细               |
| **查询性能**  | 快（100ms）    | 通过索引 + 候选集过滤，**可接受（< 1s）** |
| **产品化程度** | ❌ 项目定制      | ✅ **标准产品**                 |
**核心结论**：
放弃预聚合字段，接受动态聚合查询带来的性能开销，换取**真正产品化的可配置能力**。
对于性能敏感的场景，可通过切换到 ClickHouse 解决，而不是在 PostgreSQL 中堆砌字段。
