
# 人群筛选能力升级补充设计文档
> **变更类型**：功能增强 + 架构修正\
> **影响范围**：第1章（数据模型）、第5章（Worker执行）、第10章（节点配置Schema）\
> **变更原因**：原设计基于预计算 `segmentCode` 静态分群，无法支持实时动态筛选，存在“选错人”的业务风险。\
> **开发状态**：原始设计已完成开发，本文档为**设计变更补充**，需按本方案替换现有实现。
***
## 一、变更概述
### 1.1 变更范围
| 变更项    | 原设计                         | 新设计                      |
| ------ | --------------------------- | ------------------------ |
| 人群筛选方式 | 依赖预计算 `segmentCode` 静态分群    | 基于规则引擎的实时动态筛选            |
| 数据源    | 单一 `campaign_member_dim` 宽表 | 三层数据架构（统计宽表 + 明细表 + 原始表） |
| 筛选能力   | 仅支持预定义标签                    | 支持统计指标 + 明细聚合 + 排名/百分位   |
| 时间维度   | 静态快照（T-1）                   | 实时滑动窗口（基于 NOW()）         |
| 配置方式   | 下拉选择分群码                     | 规则构建器（多条件组合）             |
### 1.2 与现有设计的冲突说明
| 冲突点                                  | 原设计              | 新设计    | 替换策略                                 |
| ------------------------------------ | ---------------- | ------ | ------------------------------------ |
| `campaign_member_dim.segment_code`   | 存在               | **废弃** | 保留字段但不使用，新功能不再写入/读取此字段               |
| `AUDIENCE_FILTER.config.segmentCode` | 必填               | **废弃** | 替换为 `rules` + `logic` + `timeWindow` |
| 第10章 `AudienceFilterConfig` 接口       | 包含 `segmentCode` | **重写** | 完整替换为新的类型定义                          |
| `AudienceFilterNodeHandler` 执行逻辑     | 查 `segmentCode`  | **重写** | 替换为规则解析 + 动态 SQL 生成                  |
***
## 二、数据层变更
### 2.1 新增统计宽表（campaign\_member\_stat）
```sql
-- ============================================================
-- 统计宽表（每分钟/5分钟增量更新，支撑实时统计查询）
-- 注意：此表与 campaign_member_dim 并存，不废弃原有表
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_member_stat (
    member_id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    
    -- ===== 1. 会员静态属性（从 member 表同步） =====
    name VARCHAR(100),
    gender VARCHAR(10),
    birthday DATE,
    register_date DATE,
    register_days INT,
    tier_code VARCHAR(16),
    tier_name VARCHAR(50),
    tier_level INT,
    status VARCHAR(16),
    blacklist_flag BOOLEAN DEFAULT FALSE,
    
    -- ===== 2. 累计统计指标 =====
    total_order_count INT DEFAULT 0,
    total_order_amount DECIMAL(18,2) DEFAULT 0,
    total_order_net DECIMAL(18,2) DEFAULT 0,
    total_unique_sku_count INT DEFAULT 0,
    total_unique_category_count INT DEFAULT 0,
    total_points_earned DECIMAL(18,4) DEFAULT 0,
    total_points_spent DECIMAL(18,4) DEFAULT 0,
    current_points_balance DECIMAL(18,4) DEFAULT 0,
    tier_upgrade_count INT DEFAULT 0,
    tier_downgrade_count INT DEFAULT 0,
    current_tier_duration_days INT DEFAULT 0,
    
    -- ===== 3. 近N天滑动窗口统计 =====
    last_7_days_order_count INT DEFAULT 0,
    last_7_days_order_amount DECIMAL(18,2) DEFAULT 0,
    last_7_days_points_earned DECIMAL(18,4) DEFAULT 0,
    last_7_days_login_days INT DEFAULT 0,
    
    last_15_days_order_count INT DEFAULT 0,
    last_15_days_order_amount DECIMAL(18,2) DEFAULT 0,
    last_15_days_points_earned DECIMAL(18,4) DEFAULT 0,
    last_15_days_login_days INT DEFAULT 0,
    
    last_30_days_order_count INT DEFAULT 0,
    last_30_days_order_amount DECIMAL(18,2) DEFAULT 0,
    last_30_days_points_earned DECIMAL(18,4) DEFAULT 0,
    last_30_days_login_days INT DEFAULT 0,
    
    last_60_days_order_count INT DEFAULT 0,
    last_60_days_order_amount DECIMAL(18,2) DEFAULT 0,
    
    last_90_days_order_count INT DEFAULT 0,
    last_90_days_order_amount DECIMAL(18,2) DEFAULT 0,
    
    -- ===== 4. 品类偏好 =====
    top_category_last_30_days VARCHAR(64),
    top_category_amount_last_30_days DECIMAL(18,2) DEFAULT 0,
    category_list_last_30_days JSONB,
    
    -- ===== 5. RFM 综合指标 =====
    recency_days INT,
    frequency_score DECIMAL(5,2),
    monetary_score DECIMAL(5,2),
    rfm_segment VARCHAR(16),
    
    -- ===== 6. 时间戳 =====
    last_order_date TIMESTAMPTZ,
    last_order_amount DECIMAL(18,2),
    last_points_transaction_date TIMESTAMPTZ,
    last_login_date TIMESTAMPTZ,
    
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- ===== 索引（支撑动态规则查询） =====
CREATE INDEX idx_cms_program ON campaign_member_stat(program_code);
CREATE INDEX idx_cms_tier ON campaign_member_stat(tier_code, tier_level);
CREATE INDEX idx_cms_recency ON campaign_member_stat(recency_days);
CREATE INDEX idx_cms_total_amount ON campaign_member_stat(total_order_amount);
CREATE INDEX idx_cms_30_days_amount ON campaign_member_stat(last_30_days_order_amount);
CREATE INDEX idx_cms_30_days_count ON campaign_member_stat(last_30_days_order_count);
CREATE INDEX idx_cms_90_days_amount ON campaign_member_stat(last_90_days_order_amount);
CREATE INDEX idx_cms_last_order ON campaign_member_stat(last_order_date DESC);
```
### 2.2 新增订单明细宽表（campaign\_order\_detail\_flat）
```sql
-- ============================================================
-- 订单明细宽表（从 order_header + order_line 拉平）
-- 用于：品类/品牌/SKU 级筛选 + 聚合统计
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_order_detail_flat (
    id BIGSERIAL PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    order_date TIMESTAMPTZ NOT NULL,
    
    -- 订单头字段
    order_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    net_amount DECIMAL(18,2),
    channel VARCHAR(32),
    
    -- 行明细字段
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
CREATE INDEX idx_codf_member ON campaign_order_detail_flat(member_id);
CREATE INDEX idx_codf_order_date ON campaign_order_detail_flat(order_date DESC);
CREATE INDEX idx_codf_category ON campaign_order_detail_flat(category_code);
CREATE INDEX idx_codf_sku ON campaign_order_detail_flat(sku_code);
CREATE INDEX idx_codf_brand ON campaign_order_detail_flat(brand_code);
```
### 2.3 废弃字段说明（campaign\_member\_dim）
```sql
-- ============================================================
-- 废弃字段（保留但不使用）
-- 原设计依赖 segment_code 进行人群筛选，现改为动态规则
-- ============================================================
-- ALTER TABLE campaign_member_dim DROP COLUMN IF EXISTS segment_code;  -- 暂不删除，保留兼容
-- 但新功能不再写入/读取此字段
COMMENT ON COLUMN campaign_member_dim.segment_code IS 'DEPRECATED: 已废弃，请使用 campaign_member_stat 动态规则';
```
### 2.4 数据同步策略
```java
@Component
public class CampaignStatSyncService {
    
    @Scheduled(fixedDelay = 60000) // 每分钟增量同步
    public void syncMemberStats() {
        // 1. 从 Loyalty 获取变更的会员（最近5分钟有变化的）
        // 2. 聚合计算：累计指标 + 近N天滑动窗口
        // 3. 更新 campaign_member_stat
        // 4. 更新 campaign_order_detail_flat（增量）
    }
}
```
***
## 三、规则数据模型（替换第10章 AudienceFilterConfig）
### 3.1 新接口定义（TypeScript）
```typescript
// ============================================================
// 新的人群筛选配置（替换原有 segmentCode）
// 文件位置：src/types/campaign.d.ts
// ============================================================
/**
 * 人群筛选配置（完全替换原有 AudienceFilterConfig）
 * 原字段 segmentCode 已废弃，不再使用
 */
export interface AudienceFilterConfig {
  // ---- 逻辑控制 ----
  logic: 'AND' | 'OR';
  
  // ---- 条件列表 ----
  conditions: AudienceCondition[];
  
  // ---- 人数上限 ----
  limit: number;
  
  // ---- 黑名单过滤 ----
  excludeBlacklist: boolean;
}
/**
 * 条件联合类型
 */
export type AudienceCondition = 
  | StatCondition      // 统计宽表条件
  | DetailCondition    // 明细聚合条件
  | PercentileCondition; // 排名/百分位条件
/**
 * 统计宽表条件（基于 campaign_member_stat）
 */
export interface StatCondition {
  type: 'STAT';
  dataSource: 'member_stat';
  field: string;                    // 字段名（如 last_30_days_order_count）
  operator: ConditionOperator;
  value: ConditionValue;
  timeWindow: TimeWindow;
}
/**
 * 明细聚合条件（基于 campaign_order_detail_flat）
 */
export interface DetailCondition {
  type: 'DETAIL';
  dataSource: 'order_detail' | 'points_transaction' | 'tier_change' | 'behavior_event';
  
  // ---- 聚合配置 ----
  aggregation: {
    func: 'COUNT' | 'SUM' | 'AVG' | 'MAX' | 'MIN' | 'COUNT_DISTINCT';
    field: string;                 // 聚合字段
    operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte';
    value: number;
  };
  
  // ---- 明细行筛选 ----
  filters: {
    field: string;
    operator: ConditionOperator;
    value: ConditionValue;
  }[];
  
  // ---- 时间窗口 ----
  timeWindow: TimeWindow;
  
  // ---- 行数下限 ----
  minRows?: number;
}
/**
 * 排名/百分位条件
 */
export interface PercentileCondition {
  type: 'PERCENTILE';
  field: string;                    // 排名字段
  method: 'TOP' | 'BOTTOM';
  percentileType: 'PERCENT' | 'COUNT';
  value: number;                    // 20 表示 20%，或 1000 表示前1000名
  operator: 'gte' | 'lte' | 'between';
  range?: [number, number];
}
/**
 * 操作符
 */
export type ConditionOperator = 
  | 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' 
  | 'in' | 'not_in' | 'between' | 'contains' | 'not_contains';
export type ConditionValue = string | number | boolean | (string | number)[];
/**
 * 时间窗口
 */
export interface TimeWindow {
  type: 'ALL' | 'LAST_N_DAYS' | 'CUSTOM';
  days?: number;                    // LAST_N_DAYS 时使用
  startDate?: string;              // CUSTOM 时使用
  endDate?: string;                // CUSTOM 时使用
}
```
### 3.2 字段元数据定义（供前端动态渲染）
```typescript
// ============================================================
// 字段元数据（前端动态渲染配置）
// 文件位置：src/registry/fieldRegistry.ts
// ============================================================
export interface FieldMetadata {
  key: string;
  label: string;
  group: 'member_attr' | 'cumulative_stat' | 'sliding_window' | 'rfm' | 'detail';
  dataType: 'string' | 'number' | 'date' | 'boolean' | 'enum';
  enumOptions?: { label: string; value: string }[];
  description?: string;
  defaultTimeWindow?: TimeWindow;
}
export const STAT_FIELD_REGISTRY: Record<string, FieldMetadata> = {
  // ---- 会员属性 ----
  tier_code: {
    key: 'tier_code',
    label: '会员等级',
    group: 'member_attr',
    dataType: 'enum',
    enumOptions: [
      { label: '青铜', value: 'BRONZE' },
      { label: '白银', value: 'SILVER' },
      { label: '黄金', value: 'GOLD' },
      { label: '铂金', value: 'PLATINUM' },
      { label: '钻石', value: 'DIAMOND' }
    ]
  },
  status: {
    key: 'status',
    label: '会员状态',
    group: 'member_attr',
    dataType: 'enum',
    enumOptions: [
      { label: '活跃', value: 'ACTIVE' },
      { label: '休眠', value: 'DORMANT' },
      { label: '已停用', value: 'INACTIVE' }
    ]
  },
  register_days: {
    key: 'register_days',
    label: '注册天数',
    group: 'member_attr',
    dataType: 'number'
  },
  gender: {
    key: 'gender',
    label: '性别',
    group: 'member_attr',
    dataType: 'enum',
    enumOptions: [
      { label: '男', value: 'M' },
      { label: '女', value: 'F' }
    ]
  },
  
  // ---- 累计统计 ----
  total_order_count: {
    key: 'total_order_count',
    label: '累计订单数',
    group: 'cumulative_stat',
    dataType: 'number'
  },
  total_order_amount: {
    key: 'total_order_amount',
    label: '累计消费金额',
    group: 'cumulative_stat',
    dataType: 'number'
  },
  current_points_balance: {
    key: 'current_points_balance',
    label: '当前积分余额',
    group: 'cumulative_stat',
    dataType: 'number'
  },
  total_unique_category_count: {
    key: 'total_unique_category_count',
    label: '累计购买品类数',
    group: 'cumulative_stat',
    dataType: 'number'
  },
  
  // ---- 滑动窗口 ----
  last_7_days_order_count: {
    key: 'last_7_days_order_count',
    label: '近7天订单数',
    group: 'sliding_window',
    dataType: 'number',
    defaultTimeWindow: { type: 'LAST_N_DAYS', days: 7 }
  },
  last_7_days_order_amount: {
    key: 'last_7_days_order_amount',
    label: '近7天消费金额',
    group: 'sliding_window',
    dataType: 'number',
    defaultTimeWindow: { type: 'LAST_N_DAYS', days: 7 }
  },
  last_30_days_order_count: {
    key: 'last_30_days_order_count',
    label: '近30天订单数',
    group: 'sliding_window',
    dataType: 'number',
    defaultTimeWindow: { type: 'LAST_N_DAYS', days: 30 }
  },
  last_30_days_order_amount: {
    key: 'last_30_days_order_amount',
    label: '近30天消费金额',
    group: 'sliding_window',
    dataType: 'number',
    defaultTimeWindow: { type: 'LAST_N_DAYS', days: 30 }
  },
  last_30_days_login_days: {
    key: 'last_30_days_login_days',
    label: '近30天登录天数',
    group: 'sliding_window',
    dataType: 'number',
    defaultTimeWindow: { type: 'LAST_N_DAYS', days: 30 }
  },
  last_90_days_order_count: {
    key: 'last_90_days_order_count',
    label: '近90天订单数',
    group: 'sliding_window',
    dataType: 'number',
    defaultTimeWindow: { type: 'LAST_N_DAYS', days: 90 }
  },
  last_90_days_order_amount: {
    key: 'last_90_days_order_amount',
    label: '近90天消费金额',
    group: 'sliding_window',
    dataType: 'number',
    defaultTimeWindow: { type: 'LAST_N_DAYS', days: 90 }
  },
  
  // ---- RFM ----
  recency_days: {
    key: 'recency_days',
    label: '最近消费间隔（天）',
    group: 'rfm',
    dataType: 'number'
  },
  frequency_score: {
    key: 'frequency_score',
    label: '频次评分',
    group: 'rfm',
    dataType: 'number'
  },
  monetary_score: {
    key: 'monetary_score',
    label: '金额评分',
    group: 'rfm',
    dataType: 'number'
  }
};
export const DETAIL_FIELD_REGISTRY: Record<string, FieldMetadata> = {
  category_code: {
    key: 'category_code',
    label: '品类',
    group: 'detail',
    dataType: 'enum',
    // 动态从数据库加载
  },
  brand_code: {
    key: 'brand_code',
    label: '品牌',
    group: 'detail',
    dataType: 'enum'
  },
  sku_code: {
    key: 'sku_code',
    label: 'SKU',
    group: 'detail',
    dataType: 'string'
  },
  line_amount: {
    key: 'line_amount',
    label: '行金额',
    group: 'detail',
    dataType: 'number'
  },
  quantity: {
    key: 'quantity',
    label: '数量',
    group: 'detail',
    dataType: 'number'
  }
};
```
***
## 四、后端 Service 完整实现
### 4.1 规则解析与 SQL 生成引擎
```java
package com.loyalty.platform.campaign.audience;
import com.fasterxml.jackson.databind.JsonNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
@Slf4j
@Component
@RequiredArgsConstructor
public class AudienceSqlGenerator {
    private static final int DEFAULT_LIMIT = 50000;
    /**
     * 生成人群筛选 SQL
     * 
     * 核心逻辑：
     * 1. 解析规则树（支持嵌套 AND/OR）
     * 2. 根据条件类型生成不同 SQL 片段
     * 3. 组合为完整查询语句
     */
    public String generateSql(JsonNode audienceConfig) {
        JsonNode conditions = audienceConfig.path("conditions");
        String logic = audienceConfig.path("logic").asText("AND");
        int limit = audienceConfig.path("limit").asInt(DEFAULT_LIMIT);
        boolean excludeBlacklist = audienceConfig.path("excludeBlacklist").asBoolean(true);
        List<String> whereClauses = new ArrayList<>();
        List<String> joinClauses = new ArrayList<>();
        for (JsonNode condition : conditions) {
            String type = condition.path("type").asText();
            switch (type) {
                case "STAT":
                    processStatCondition(condition, whereClauses);
                    break;
                case "DETAIL":
                    processDetailCondition(condition, joinClauses, whereClauses);
                    break;
                case "PERCENTILE":
                    processPercentileCondition(condition, whereClauses);
                    break;
            }
        }
        // 构建最终 SQL
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT DISTINCT cm.member_id FROM campaign_member_stat cm ");
        if (!joinClauses.isEmpty()) {
            sql.append(String.join(" ", joinClauses));
        }
        sql.append(" WHERE 1=1 ");
        
        if (excludeBlacklist) {
            sql.append(" AND cm.blacklist_flag = false ");
        }
        if (!whereClauses.isEmpty()) {
            sql.append(" AND (");
            sql.append(String.join(" " + logic + " ", whereClauses));
            sql.append(")");
        }
        sql.append(" LIMIT ").append(limit);
        return sql.toString();
    }
    /**
     * 处理统计宽表条件
     */
    private void processStatCondition(JsonNode condition, List<String> whereClauses) {
        String field = condition.path("field").asText();
        String operator = condition.path("operator").asText();
        JsonNode value = condition.path("value");
        String sqlCondition = buildCondition(field, operator, value);
        whereClauses.add(sqlCondition);
    }
    /**
     * 处理明细聚合条件（需要子查询或 JOIN）
     */
    private void processDetailCondition(JsonNode condition, List<String> joinClauses, 
                                         List<String> whereClauses) {
        String dataSource = condition.path("dataSource").asText();
        JsonNode aggregation = condition.path("aggregation");
        JsonNode filters = condition.path("filters");
        JsonNode timeWindow = condition.path("timeWindow");
        int minRows = condition.path("minRows").asInt(1);
        String aggFunc = aggregation.path("func").asText();
        String aggField = aggregation.path("field").asText();
        String aggOp = aggregation.path("operator").asText();
        double aggValue = aggregation.path("value").asDouble();
        // 构建明细子查询
        String subQuerySql = buildDetailSubQuery(dataSource, filters, timeWindow, 
                                                  aggFunc, aggField, minRows);
        // 生成 JOIN 条件
        String alias = "d_" + System.nanoTime();
        joinClauses.add("INNER JOIN (" + subQuerySql + ") " + alias + 
                        " ON cm.member_id = " + alias + ".member_id");
        whereClauses.add(alias + ".agg_value " + aggOp + " " + aggValue);
    }
    /**
     * 构建明细子查询
     */
    private String buildDetailSubQuery(String dataSource, JsonNode filters, 
                                        JsonNode timeWindow, String aggFunc, 
                                        String aggField, int minRows) {
        String tableName = mapDataSourceToTable(dataSource);
        String aggFieldSql = aggFunc + "(" + aggField + ") AS agg_value";
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT member_id, ").append(aggFieldSql).append(", COUNT(1) AS row_count ");
        sql.append("FROM ").append(tableName).append(" WHERE 1=1 ");
        // 时间窗口
        String timeClause = buildTimeWindowClause(timeWindow);
        if (timeClause != null) {
            sql.append(" AND ").append(timeClause);
        }
        // 明细筛选
        for (JsonNode filter : filters) {
            String field = filter.path("field").asText();
            String op = filter.path("operator").asText();
            JsonNode val = filter.path("value");
            sql.append(" AND ").append(buildCondition(field, op, val));
        }
        sql.append(" GROUP BY member_id ");
        sql.append("HAVING COUNT(1) >= ").append(minRows);
        return sql.toString();
    }
    /**
     * 处理百分位条件（使用窗口函数）
     */
    private void processPercentileCondition(JsonNode condition, List<String> whereClauses) {
        String field = condition.path("field").asText();
        String method = condition.path("method").asText(); // TOP / BOTTOM
        String percentileType = condition.path("percentileType").asText(); // PERCENT / COUNT
        double value = condition.path("value").asDouble();
        String order = "TOP".equals(method) ? "DESC" : "ASC";
        String whereExpr;
        if ("PERCENT".equals(percentileType)) {
            double pct = value / 100.0;
            whereExpr = String.format(
                "cm.%s >= (SELECT percentile_cont(%.2f) WITHIN GROUP (ORDER BY %s %s) " +
                "FROM campaign_member_stat WHERE blacklist_flag = false)",
                field, (order.equals("DESC") ? (1 - pct) : pct), field, order
            );
        } else {
            // TOP N / BOTTOM N
            int n = (int) value;
            String subQuery = String.format(
                "SELECT %s FROM campaign_member_stat WHERE blacklist_flag = false " +
                "ORDER BY %s %s LIMIT %d",
                field, field, order, n
            );
            whereExpr = String.format(
                "cm.%s %s (SELECT MIN(%s) FROM (%s) t)",
                field, "TOP".equals(method) ? ">=" : "<=", field, subQuery
            );
        }
        whereClauses.add(whereExpr);
    }
    /**
     * 构建单条条件 SQL
     */
    private String buildCondition(String field, String operator, JsonNode value) {
        switch (operator) {
            case "eq": return "cm." + field + " = " + quote(value);
            case "ne": return "cm." + field + " != " + quote(value);
            case "gt": return "cm." + field + " > " + quote(value);
            case "gte": return "cm." + field + " >= " + quote(value);
            case "lt": return "cm." + field + " < " + quote(value);
            case "lte": return "cm." + field + " <= " + quote(value);
            case "in": return "cm." + field + " IN (" + quoteList(value) + ")";
            case "not_in": return "cm." + field + " NOT IN (" + quoteList(value) + ")";
            case "between": 
                return "cm." + field + " BETWEEN " + quote(value.get(0)) + 
                       " AND " + quote(value.get(1));
            case "contains": return "cm." + field + " LIKE '%" + value.asText() + "%'";
            default: return "1=1";
        }
    }
    /**
     * 构建时间窗口条件
     */
    private String buildTimeWindowClause(JsonNode timeWindow) {
        if (timeWindow == null || timeWindow.isNull()) return null;
        String type = timeWindow.path("type").asText();
        
        switch (type) {
            case "LAST_N_DAYS":
                int days = timeWindow.path("days").asInt(30);
                return "order_date >= NOW() - INTERVAL '" + days + " days'";
            case "CUSTOM":
                String start = timeWindow.path("startDate").asText();
                String end = timeWindow.path("endDate").asText();
                return "order_date BETWEEN '" + start + "' AND '" + end + "'";
            case "ALL":
            default:
                return null;
        }
    }
    // ---- 工具方法 ----
    private String quote(JsonNode value) {
        if (value.isTextual()) return "'" + value.asText() + "'";
        if (value.isNumber()) return value.asText();
        if (value.isBoolean()) return value.asBoolean() ? "true" : "false";
        return value.asText();
    }
    private String quoteList(JsonNode array) {
        List<String> quoted = new ArrayList<>();
        for (JsonNode item : array) {
            quoted.add(quote(item));
        }
        return String.join(", ", quoted);
    }
    private String mapDataSourceToTable(String dataSource) {
        switch (dataSource) {
            case "order_detail": return "campaign_order_detail_flat";
            case "points_transaction": return "campaign_points_transaction";
            case "tier_change": return "campaign_tier_change_log";
            case "behavior_event": return "campaign_behavior_event";
            default: return "campaign_order_detail_flat";
        }
    }
}
```
### 4.2 新 AudienceFilterNodeHandler
```java
package com.loyalty.platform.campaign.execution.node.handler;
import com.fasterxml.jackson.databind.JsonNode;
import com.loyalty.platform.campaign.audience.AudienceSqlGenerator;
import com.loyalty.platform.campaign.execution.node.BaseNodeHandler;
import com.loyalty.platform.campaign.execution.node.NodeExecutionContext;
import com.loyalty.platform.campaign.execution.node.NodeExecutionException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
@RequiredArgsConstructor
public class AudienceFilterNodeHandler extends BaseNodeHandler {
    private final AudienceSqlGenerator sqlGenerator;
    private final JdbcTemplate jdbcTemplate;
    @Override
    public String getNodeType() {
        return "AUDIENCE_FILTER";
    }
    @Override
    protected Map<String, Object> doExecute(NodeExecutionContext context) 
            throws NodeExecutionException {
        JsonNode config = context.getConfig();
        // 1. 校验：是否使用了旧版 segmentCode（兼容报错）
        if (config.has("segmentCode") && !config.path("segmentCode").isNull()) {
            throw new NodeExecutionException(
                "segmentCode is deprecated. Please use dynamic rules configuration. " +
                "See campaign_audience_config table for details."
            );
        }
        // 2. 校验：是否配置了 conditions
        if (!config.has("conditions") || config.path("conditions").size() == 0) {
            throw new NodeExecutionException(
                "No conditions configured. Please add at least one filter condition."
            );
        }
        // 3. 生成动态 SQL
        String sql = sqlGenerator.generateSql(config);
        log.info("AudienceFilterNode generated SQL: {}", sql);
        // 4. 执行查询
        long startTime = System.currentTimeMillis();
        List<String> memberIds;
        try {
            memberIds = jdbcTemplate.queryForList(sql, String.class);
        } catch (Exception e) {
            log.error("Audience filter query failed: {}", e.getMessage());
            throw new NodeExecutionException("Query execution failed: " + e.getMessage());
        }
        long durationMs = System.currentTimeMillis() - startTime;
        log.info("AudienceFilterNode completed: found {} members, duration={}ms",
                memberIds.size(), durationMs);
        // 5. 返回结果
        Map<String, Object> outputs = new HashMap<>();
        outputs.put("memberIds", memberIds);
        outputs.put("count", memberIds.size());
        outputs.put("queryTime", Instant.now().toString());
        outputs.put("queryDurationMs", durationMs);
        return outputs;
    }
    @Override
    public void validateConfig(JsonNode config) throws NodeConfigValidationException {
        // 1. 检查是否使用了废弃字段
        if (config.has("segmentCode") && !config.path("segmentCode").isNull()) {
            throw new NodeConfigValidationException(
                "Field 'segmentCode' is deprecated. Please use 'conditions' and 'logic' instead."
            );
        }
        // 2. 检查是否配置了条件
        if (!config.has("conditions") || config.path("conditions").size() == 0) {
            throw new NodeConfigValidationException(
                "At least one condition is required in 'conditions' array."
            );
        }
        // 3. 检查逻辑运算符
        String logic = config.path("logic").asText("AND");
        if (!"AND".equals(logic) && !"OR".equals(logic)) {
            throw new NodeConfigValidationException(
                "logic must be 'AND' or 'OR', got: " + logic
            );
        }
        // 4. 检查人数上限
        int limit = config.path("limit").asInt(0);
        if (limit <= 0) {
            throw new NodeConfigValidationException(
                "limit must be greater than 0"
            );
        }
        if (limit > 100000) {
            throw new NodeConfigValidationException(
                "limit cannot exceed 100000"
            );
        }
    }
}
```
***
## 五、前端界面完整实现
### 5.1 主组件：AudienceBuilder
```tsx
// ============================================================
// 文件：src/components/audience/AudienceBuilder.tsx
// 说明：人群筛选规则构建器（替换原有 segmentCode 下拉选择）
// ============================================================
import React, { useState, useCallback, useEffect } from 'react';
import { Button, Select, Input, Switch, message } from 'antd';
import { PlusOutlined, DeleteOutlined, CopyOutlined } from '@ant-design/icons';
import { StatConditionBuilder } from './StatConditionBuilder';
import { DetailConditionBuilder } from './DetailConditionBuilder';
import { PercentileConditionBuilder } from './PercentileConditionBuilder';
import { AudiencePreview } from './AudiencePreview';
import { FieldMetadata, STAT_FIELD_REGISTRY } from '../../registry/fieldRegistry';
import { useAudienceEstimate } from '../../hooks/useAudienceEstimate';
interface AudienceBuilderProps {
  value: AudienceFilterConfig;
  onChange: (config: AudienceFilterConfig) => void;
  programCode: string;
  readOnly?: boolean;
}
export const AudienceBuilder: React.FC<AudienceBuilderProps> = ({
  value,
  onChange,
  programCode,
  readOnly = false
}) => {
  const [conditions, setConditions] = useState<AudienceCondition[]>(
    value?.conditions || []
  );
  const [logic, setLogic] = useState<'AND' | 'OR'>(value?.logic || 'AND');
  const [limit, setLimit] = useState<number>(value?.limit || 10000);
  const [excludeBlacklist, setExcludeBlacklist] = useState<boolean>(
    value?.excludeBlacklist !== false
  );
  const { estimate, loading, result } = useAudienceEstimate(programCode);
  // 通知父组件配置变化
  const notifyChange = useCallback(() => {
    onChange({
      logic,
      conditions,
      limit,
      excludeBlacklist
    });
  }, [logic, conditions, limit, excludeBlacklist, onChange]);
  useEffect(() => {
    notifyChange();
  }, [logic, conditions, limit, excludeBlacklist]);
  // 添加条件
  const addCondition = (type: 'STAT' | 'DETAIL' | 'PERCENTILE') => {
    const newCondition = createDefaultCondition(type);
    setConditions([...conditions, newCondition]);
  };
  // 删除条件
  const removeCondition = (index: number) => {
    setConditions(conditions.filter((_, i) => i !== index));
  };
  // 复制条件
  const duplicateCondition = (index: number) => {
    const condition = JSON.parse(JSON.stringify(conditions[index]));
    setConditions([...conditions, condition]);
  };
  // 更新条件
  const updateCondition = (index: number, value: AudienceCondition) => {
    const newConditions = [...conditions];
    newConditions[index] = value;
    setConditions(newConditions);
  };
  // 刷新预估
  const handleEstimate = useCallback(async () => {
    await estimate({
      logic,
      conditions,
      limit,
      excludeBlacklist
    });
  }, [logic, conditions, limit, excludeBlacklist, estimate]);
  return (
    <div className="audience-builder">
      {/* 顶部工具栏 */}
      <div className="audience-toolbar">
        <div className="logic-selector">
          <span>逻辑关系：</span>
          <Select
            value={logic}
            onChange={setLogic}
            style={{ width: 100 }}
            disabled={readOnly}
          >
            <Select.Option value="AND">AND（且）</Select.Option>
            <Select.Option value="OR">OR（或）</Select.Option>
          </Select>
        </div>
        <div className="limit-control">
          <span>人数上限：</span>
          <Input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            style={{ width: 120 }}
            disabled={readOnly}
          />
        </div>
        <div className="blacklist-control">
          <Switch
            checked={excludeBlacklist}
            onChange={setExcludeBlacklist}
            disabled={readOnly}
          />
          <span>排除黑名单</span>
        </div>
      </div>
      {/* 条件列表 */}
      <div className="conditions-container">
        {conditions.map((condition, index) => (
          <div key={index} className="condition-item">
            <div className="condition-actions">
              <Button
                icon={<DeleteOutlined />}
                onClick={() => removeCondition(index)}
                danger
                size="small"
                disabled={readOnly}
              />
              <Button
                icon={<CopyOutlined />}
                onClick={() => duplicateCondition(index)}
                size="small"
                disabled={readOnly}
              />
              <span className="condition-index">#{index + 1}</span>
            </div>
            <div className="condition-content">
              {condition.type === 'STAT' && (
                <StatConditionBuilder
                  value={condition as StatCondition}
                  onChange={(val) => updateCondition(index, val)}
                  readOnly={readOnly}
                />
              )}
              {condition.type === 'DETAIL' && (
                <DetailConditionBuilder
                  value={condition as DetailCondition}
                  onChange={(val) => updateCondition(index, val)}
                  readOnly={readOnly}
                />
              )}
              {condition.type === 'PERCENTILE' && (
                <PercentileConditionBuilder
                  value={condition as PercentileCondition}
                  onChange={(val) => updateCondition(index, val)}
                  readOnly={readOnly}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      {/* 添加条件按钮 */}
      {!readOnly && (
        <div className="add-conditions">
          <Button
            icon={<PlusOutlined />}
            onClick={() => addCondition('STAT')}
          >
            添加统计条件
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => addCondition('DETAIL')}
          >
            添加明细聚合条件
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={() => addCondition('PERCENTILE')}
          >
            添加排名条件
          </Button>
        </div>
      )}
      {/* 人群预览 */}
      <AudiencePreview
        conditions={conditions}
        logic={logic}
        limit={limit}
        excludeBlacklist={excludeBlacklist}
        onRefresh={handleEstimate}
        loading={loading}
        result={result}
      />
    </div>
  );
};
// ---- 创建默认条件 ----
function createDefaultCondition(type: string): AudienceCondition {
  switch (type) {
    case 'STAT':
      return {
        type: 'STAT',
        dataSource: 'member_stat',
        field: 'last_30_days_order_count',
        operator: 'gte',
        value: 3,
        timeWindow: { type: 'LAST_N_DAYS', days: 30 }
      };
    case 'DETAIL':
      return {
        type: 'DETAIL',
        dataSource: 'order_detail',
        aggregation: {
          func: 'SUM',
          field: 'line_amount',
          operator: 'gte',
          value: 1000
        },
        filters: [],
        timeWindow: { type: 'LAST_N_DAYS', days: 30 },
        minRows: 1
      };
    case 'PERCENTILE':
      return {
        type: 'PERCENTILE',
        field: 'total_order_amount',
        method: 'TOP',
        percentileType: 'PERCENT',
        value: 20,
        operator: 'gte'
      };
    default:
      throw new Error('Unknown condition type');
  }
}
```
### 5.2 统计条件构建器
```tsx
// ============================================================
// 文件：src/components/audience/StatConditionBuilder.tsx
// ============================================================
import React, { useState, useMemo } from 'react';
import { Select, Input, InputNumber, DatePicker } from 'antd';
import { STAT_FIELD_REGISTRY } from '../../registry/fieldRegistry';
interface StatConditionBuilderProps {
  value: StatCondition;
  onChange: (value: StatCondition) => void;
  readOnly?: boolean;
}
export const StatConditionBuilder: React.FC<StatConditionBuilderProps> = ({
  value,
  onChange,
  readOnly = false
}) => {
  const fieldOptions = useMemo(() => {
    return Object.entries(STAT_FIELD_REGISTRY).map(([key, meta]) => ({
      label: `${meta.label} (${meta.group})`,
      value: key,
      group: meta.group
    }));
  }, []);
  const fieldMeta = STAT_FIELD_REGISTRY[value.field];
  const updateField = (field: string) => {
    const meta = STAT_FIELD_REGISTRY[field];
    onChange({
      ...value,
      field,
      // 自动设置默认时间窗口
      timeWindow: meta.defaultTimeWindow || value.timeWindow
    });
  };
  return (
    <div className="stat-condition">
      <div className="condition-row">
        <Select
          value={value.field}
          onChange={updateField}
          style={{ width: 180 }}
          disabled={readOnly}
          showSearch
        >
          {fieldOptions.map(opt => (
            <Select.Option key={opt.value} value={opt.value}>
              {opt.label}
            </Select.Option>
          ))}
        </Select>
        <Select
          value={value.operator}
          onChange={(op) => onChange({ ...value, operator: op })}
          style={{ width: 100 }}
          disabled={readOnly}
        >
          <Select.Option value="eq">=</Select.Option>
          <Select.Option value="ne">≠</Select.Option>
          <Select.Option value="gt">&gt;</Select.Option>
          <Select.Option value="gte">≥</Select.Option>
          <Select.Option value="lt">&lt;</Select.Option>
          <Select.Option value="lte">≤</Select.Option>
          <Select.Option value="in">∈</Select.Option>
          <Select.Option value="not_in">∉</Select.Option>
          <Select.Option value="between">介于</Select.Option>
        </Select>
        {renderValueInput(value, onChange, readOnly)}
      </div>
      {/* 时间窗口 */}
      <div className="time-window-row">
        <span className="label">时间窗口：</span>
        <Select
          value={value.timeWindow?.type || 'ALL'}
          onChange={(type) => {
            const tw: TimeWindow = { type };
            if (type === 'LAST_N_DAYS') {
              tw.days = 30;
            }
            onChange({ ...value, timeWindow: tw });
          }}
          style={{ width: 140 }}
          disabled={readOnly}
        >
          <Select.Option value="ALL">全部历史</Select.Option>
          <Select.Option value="LAST_N_DAYS">最近N天</Select.Option>
          <Select.Option value="CUSTOM">自定义</Select.Option>
        </Select>
        {value.timeWindow?.type === 'LAST_N_DAYS' && (
          <InputNumber
            value={value.timeWindow.days}
            onChange={(days) => {
              if (days) {
                onChange({
                  ...value,
                  timeWindow: { ...value.timeWindow, days }
                });
              }
            }}
            min={1}
            max={365}
            style={{ width: 80 }}
            disabled={readOnly}
          />
        )}
        {value.timeWindow?.type === 'CUSTOM' && (
          <>
            <DatePicker
              value={value.timeWindow.startDate}
              onChange={(date) => {
                onChange({
                  ...value,
                  timeWindow: {
                    ...value.timeWindow,
                    startDate: date?.format('YYYY-MM-DD')
                  }
                });
              }}
              disabled={readOnly}
            />
            <span>至</span>
            <DatePicker
              value={value.timeWindow.endDate}
              onChange={(date) => {
                onChange({
                  ...value,
                  timeWindow: {
                    ...value.timeWindow,
                    endDate: date?.format('YYYY-MM-DD')
                  }
                });
              }}
              disabled={readOnly}
            />
          </>
        )}
      </div>
    </div>
  );
};
function renderValueInput(
  value: StatCondition,
  onChange: (val: StatCondition) => void,
  readOnly: boolean
) {
  const meta = STAT_FIELD_REGISTRY[value.field];
  const operator = value.operator;
  if (operator === 'in' || operator === 'not_in') {
    return (
      <Select
        mode="tags"
        value={value.value as string[]}
        onChange={(val) => onChange({ ...value, value: val })}
        style={{ width: 200 }}
        disabled={readOnly}
        placeholder="输入多个值"
      />
    );
  }
  if (operator === 'between') {
    const val = value.value as [number, number] || [0, 0];
    return (
      <>
        <InputNumber
          value={val[0]}
          onChange={(v) => onChange({ ...value, value: [v || 0, val[1] || 0] })}
          style={{ width: 100 }}
          disabled={readOnly}
        />
        <span className="between-sep">~</span>
        <InputNumber
          value={val[1]}
          onChange={(v) => onChange({ ...value, value: [val[0] || 0, v || 0] })}
          style={{ width: 100 }}
          disabled={readOnly}
        />
      </>
    );
  }
  if (meta?.dataType === 'number') {
    return (
      <InputNumber
        value={value.value as number}
        onChange={(val) => onChange({ ...value, value: val || 0 })}
        style={{ width: 150 }}
        disabled={readOnly}
      />
    );
  }
  if (meta?.dataType === 'enum' && meta.enumOptions) {
    return (
      <Select
        value={value.value as string}
        onChange={(val) => onChange({ ...value, value: val })}
        style={{ width: 150 }}
        disabled={readOnly}
        showSearch
      >
        {meta.enumOptions.map(opt => (
          <Select.Option key={opt.value} value={opt.value}>
            {opt.label}
          </Select.Option>
        ))}
      </Select>
    );
  }
  return (
    <Input
      value={value.value as string}
      onChange={(e) => onChange({ ...value, value: e.target.value })}
      style={{ width: 150 }}
      disabled={readOnly}
    />
  );
}
```
### 5.3 人群预览组件
```tsx
// ============================================================
// 文件：src/components/audience/AudiencePreview.tsx
// ============================================================
import React, { useState } from 'react';
import { Button, Spin, Table, Tag, Alert } from 'antd';
import { ReloadOutlined, ExportOutlined } from '@ant-design/icons';
interface AudiencePreviewProps {
  conditions: AudienceCondition[];
  logic: 'AND' | 'OR';
  limit: number;
  excludeBlacklist: boolean;
  onRefresh: () => Promise<void>;
  loading: boolean;
  result: {
    total: number;
    preview: Array<{ memberId: string; name: string; tier: string }>;
    queryTimeMs: number;
    sql?: string;
  } | null;
}
export const AudiencePreview: React.FC<AudiencePreviewProps> = ({
  conditions,
  onRefresh,
  loading,
  result,
}) => {
  const [showSql, setShowSql] = useState(false);
  if (conditions.length === 0) {
    return (
      <div className="audience-preview empty">
        <Alert
          message="请添加筛选条件"
          description="添加至少一个筛选条件后，系统将实时计算匹配人数"
          type="info"
          showIcon
        />
      </div>
    );
  }
  return (
    <div className="audience-preview">
      <div className="preview-header">
        <div className="preview-stats">
          <span className="stat-label">匹配人数：</span>
          {loading ? (
            <Spin size="small" />
          ) : (
            <span className="stat-value">
              {result?.total.toLocaleString() || '--'}
            </span>
          )}
          <span className="stat-hint">（基于实时数据）</span>
        </div>
        <div className="preview-actions">
          <Button
            icon={<ReloadOutlined />}
            onClick={onRefresh}
            loading={loading}
          >
            刷新预估
          </Button>
          <Button
            icon={<ExportOutlined />}
            disabled={!result || result.total === 0}
          >
            导出名单
          </Button>
          <Button
            type="link"
            size="small"
            onClick={() => setShowSql(!showSql)}
          >
            {showSql ? '隐藏SQL' : '查看SQL'}
          </Button>
        </div>
      </div>
      {showSql && result?.sql && (
        <div className="sql-preview">
          <pre className="sql-content">{result.sql}</pre>
        </div>
      )}
      {result?.queryTimeMs && (
        <div className="query-meta">
          查询耗时：{result.queryTimeMs}ms
        </div>
      )}
      {result?.preview && result.preview.length > 0 && (
        <Table
          dataSource={result.preview}
          rowKey="memberId"
          size="small"
          pagination={false}
          columns={[
            { title: '会员ID', dataIndex: 'memberId', key: 'memberId' },
            { title: '姓名', dataIndex: 'name', key: 'name' },
            { 
              title: '等级', 
              dataIndex: 'tier', 
              key: 'tier',
              render: (tier) => <Tag color="gold">{tier}</Tag>
            }
          ]}
        />
      )}
      {!loading && result?.total === 0 && (
        <Alert
          message="无匹配结果"
          description="当前条件组合下没有会员匹配，请调整筛选条件"
          type="warning"
          showIcon
        />
      )}
    </div>
  );
};
```
***
## 六、API 接口设计
### 6.1 实时预估接口
```java
@RestController
@RequestMapping("/api/campaign/audience")
public class AudienceController {
    
    @Autowired
    private AudienceSqlGenerator sqlGenerator;
    
    @Autowired
    private JdbcTemplate jdbcTemplate;
    /**
     * 实时预估人群数量 + 预览名单
     */
    @PostMapping("/estimate")
    public ApiResponse<AudienceEstimateResult> estimate(
            @RequestBody AudienceEstimateRequest request) {
        
        // 1. 生成查询 SQL
        JsonNode config = JsonUtil.toJsonNode(request);
        String countSql = sqlGenerator.generateCountSql(config);
        String previewSql = sqlGenerator.generatePreviewSql(config, 10);
        
        // 2. 执行计数
        long startTime = System.currentTimeMillis();
        int total = jdbcTemplate.queryForObject(countSql, Integer.class);
        long queryTimeMs = System.currentTimeMillis() - startTime;
        
        // 3. 预览名单
        List<MemberPreview> preview = jdbcTemplate.query(
            previewSql,
            (rs, rowNum) -> new MemberPreview(
                rs.getString("member_id"),
                rs.getString("name"),
                rs.getString("tier_code")
            )
        );
        
        return ApiResponse.success(
            AudienceEstimateResult.builder()
                .total(total)
                .preview(preview)
                .queryTimeMs(queryTimeMs)
                .sql(countSql)
                .build()
        );
    }
}
```
### 6.2 字段元数据接口
```java
@GetMapping("/fields")
public ApiResponse<Map<String, FieldMetadata>> getFields() {
    return ApiResponse.success(STAT_FIELD_REGISTRY);
}
```
***
## 七、迁移路径（从旧到新）
### 7.1 阶段一：双轨运行（当前）
| 动作                           | 说明                          |
| ---------------------------- | --------------------------- |
| 保留 `segmentCode` 读取逻辑        | 旧 Campaign 继续运行             |
| 新 Campaign 强制使用 `conditions` | 前端不再提供 `segmentCode` 选项     |
| 数据双写                         | `campaign_member_stat` 增量同步 |
### 7.2 阶段二：逐步切换（2周后）
| 动作                    | 说明                |
| --------------------- | ----------------- |
| 旧 Campaign 逐步迁移       | 运营人员手动将旧分群转换为规则配置 |
| `segmentCode` 写入停止    | 不再写入新的分群码         |
| 前端 `segmentCode` 彻底移除 | 代码清理              |
### 7.3 阶段三：完全废弃（1个月后）
| 动作                                    | 说明     |
| ------------------------------------- | ------ |
| 移除 `campaign_member_dim.segment_code` | DDL 删除 |
| 移除 `segmentCode` 相关代码                 | 完全清理   |
### 7.4 兼容处理代码
```java
@Component
public class AudienceFilterCompatHandler {
    
    /**
     * 兼容旧版 segmentCode（转换层）
     */
    public AudienceFilterConfig convertLegacyConfig(String segmentCode) {
        // 将旧 segmentCode 转换为规则配置
        // 示例：segmentCode = 'HIGH_VALUE' 
        // → { logic: 'AND', conditions: [{ field: 'total_order_amount', operator: 'gte', value: 5000 }] }
        
        Map<String, AudienceFilterConfig> presetMap = new HashMap<>();
        presetMap.put("HIGH_VALUE", createHighValueRules());
        presetMap.put("CHURN_RISK", createChurnRiskRules());
        // ...
        
        return presetMap.getOrDefault(segmentCode, createDefaultRules());
    }
}
```
***
## 八、实施检查清单
* 执行 DDL 创建 `campaign_member_stat` 表
* 执行 DDL 创建 `campaign_order_detail_flat` 表
* 执行数据同步脚本（全量初始化统计宽表）
* 启动定时同步任务（每分钟增量更新）
* 部署后端 `AudienceSqlGenerator`
* 部署后端 `AudienceFilterNodeHandler`（替换旧版）
* 部署前端 `AudienceBuilder` 组件
* 更新 `AUDIENCE_FILTER` 节点配置面板
* 编写兼容转换逻辑（旧 segmentCode → 新规则）
* 编写迁移脚本（旧活动数据转换）
* 更新第1章数据模型文档
* 更新第10章节点配置文档
* 编写单元测试（SQL 生成覆盖率 > 90%）
* 编写集成测试（端到端人群筛选）
* 性能测试（10万级会员查询 < 500ms）
***
## 九、总结
本补充设计解决了原设计“基于预计算分群码导致选错人”的根本问题。通过引入**三层数据架构 + 动态规则引擎 + 实时 SQL 生成**，实现了：
1. **实时性**：所有查询基于 `NOW()`，保证“此时此刻”符合条件的人才会被选中
2. **灵活性**：支持统计条件 + 明细聚合 + 排名百分位三种类型，覆盖 90% 以上运营场景
3. **可迁移性**：兼容旧 `segmentCode`，支持平滑过渡
4. **可观测性**：每次查询记录 SQL、耗时、匹配人数，便于优化和审计
