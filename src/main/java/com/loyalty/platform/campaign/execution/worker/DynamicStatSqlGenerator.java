package com.loyalty.platform.campaign.execution.worker;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 动态统计 SQL 生成器 — 根据用户定义的统计条件实时生成 SQL 聚合查询。
 *
 * <p>核心设计：放弃所有预聚合字段，完全由用户在配置时动态定义统计指标。
 * 适用于任意行业，不依赖任何预计算数据。
 */
public class DynamicStatSqlGenerator {

    private static final Pattern TIME_VAR_PATTERN = Pattern.compile("\\{\\{NOW\\s*-\\s*(\\d+)\\s*days\\}\\}");

    /**
     * 生成动态统计条件的子查询 SQL。
     *
     * @param dataSource 数据源表名
     * @param aggFunc 聚合函数 (COUNT/SUM/AVG/MAX/MIN/COUNT_DISTINCT)
     * @param aggField 聚合字段
     * @param timeWindowType 时间窗口类型 (ALL/LAST_N_DAYS/CUSTOM)
     * @param timeWindowDays 天数
     * @param operator 条件操作符
     * @param value 条件值
     * @return 子查询 SQL
     */
    public String generateSubQuery(String dataSource, String aggFunc, String aggField,
                                    String timeWindowType, Integer timeWindowDays,
                                    String operator, Object value) {
        String tableName = mapTableName(dataSource);
        String func = mapAggFunc(aggFunc, aggField);
        String sqlOp = mapOperator(operator);

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT member_id, ").append(func).append(" AS stat_value ");
        sql.append("FROM ").append(tableName).append(" WHERE 1=1 ");

        // 时间窗口过滤
        if ("LAST_N_DAYS".equals(timeWindowType) && timeWindowDays != null && timeWindowDays > 0) {
            String dateField = getDateField(dataSource);
            sql.append("AND ").append(dateField).append(" >= NOW() - INTERVAL '")
               .append(timeWindowDays).append(" days' ");
        }

        sql.append("GROUP BY member_id ");
        sql.append("HAVING ").append(func).append(" ").append(sqlOp).append(" ").append(value);

        return sql.toString();
    }

    /**
     * 生成静态属性条件 SQL。
     */
    public String buildStaticCondition(String field, String operator, Object value) {
        String sqlOp = mapOperator(operator);
        if ("in".equals(operator)) {
            return "ma." + field + " IN (" + value + ")";
        }
        return "ma." + field + " " + sqlOp + " '" + value + "'";
    }

    /**
     * 组装最终查询 SQL。
     */
    public String buildFinalSql(List<String> staticConds, List<String> subQueries,
                                 String logic, boolean excludeBlacklist, int limit) {
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT DISTINCT ma.member_id FROM campaign_member_attr ma ");

        int idx = 0;
        for (String subQuery : subQueries) {
            String alias = "stat_" + (idx++);
            sql.append(" INNER JOIN (").append(subQuery).append(") ")
               .append(alias).append(" ON ma.member_id = ").append(alias).append(".member_id ");
        }

        sql.append(" WHERE 1=1 ");
        if (excludeBlacklist) {
            sql.append(" AND (ma.blacklist_flag IS NULL OR ma.blacklist_flag = false) ");
        }
        for (String cond : staticConds) {
            sql.append(" AND ").append(cond);
        }

        sql.append(" LIMIT ").append(limit);
        return sql.toString();
    }

    // ====== 映射方法 ======

    private String mapTableName(String dataSource) {
        return switch (dataSource) {
            case "order_fact" -> "campaign_order_fact";
            case "points_transaction" -> "campaign_points_transaction";
            case "tier_change_log" -> "campaign_tier_change_log";
            default -> "campaign_order_fact";
        };
    }

    private String mapAggFunc(String func, String field) {
        String safeField = field != null ? field : "*";
        return switch (func) {
            case "SUM" -> "SUM(" + safeField + ")";
            case "AVG" -> "AVG(" + safeField + ")";
            case "MAX" -> "MAX(" + safeField + ")";
            case "MIN" -> "MIN(" + safeField + ")";
            case "COUNT_DISTINCT" -> "COUNT(DISTINCT " + safeField + ")";
            default -> "COUNT(" + safeField + ")";
        };
    }

    private String mapOperator(String op) {
        return switch (op) {
            case "eq" -> "=";
            case "ne" -> "!=";
            case "gt" -> ">";
            case "gte" -> ">=";
            case "lt" -> "<";
            case "lte" -> "<=";
            default -> "=";
        };
    }

    private String getDateField(String dataSource) {
        return switch (dataSource) {
            case "points_transaction" -> "transaction_date";
            case "tier_change_log" -> "change_date";
            default -> "order_date";
        };
    }

    /**
     * 解析时间变量表达式 {{NOW - 30 days}} → NOW() - INTERVAL '30 days'
     */
    public static String parseTimeVariable(String expr) {
        if (expr == null) return null;
        Matcher m = TIME_VAR_PATTERN.matcher(expr);
        if (m.find()) {
            return "NOW() - INTERVAL '" + m.group(1) + " days'";
        }
        return expr;
    }
}