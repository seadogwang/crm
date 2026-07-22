package com.loyalty.platform.campaign.execution.worker;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class DynamicStatSqlGenerator {

    private static final Pattern TIME_VAR_PATTERN = Pattern.compile("\\{\\{NOW\\s*-\\s*(\\d+)\\s*days\\}\\}");
    private static final int MAX_LIMIT = 100_000;

    private static final Set<String> STATIC_FIELDS = Set.of(
            "member_id", "status", "tier_code", "gender", "age", "city", "province",
            "channel", "blacklist_flag", "created_at", "registered_at"
    );

    private static final Map<String, SourceSpec> SOURCES = buildSources();

    public record SqlFragment(String sql, List<Object> parameters) {}

    public record GeneratedSql(String sql, List<Object> parameters) {}

    public GeneratedSql generateSubQuery(String programCode, String dataSource, String aggFunc, String aggField,
                                         String timeWindowType, Integer timeWindowDays,
                                         String operator, Object value) {
        SourceSpec source = sourceFor(dataSource);
        String func = mapAggFunc(source, aggFunc, aggField);
        String sqlOp = mapOperator(operator);
        List<Object> parameters = new ArrayList<>();

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT member_id, ").append(func).append(" AS stat_value ");
        sql.append("FROM ").append(source.tableName()).append(" WHERE program_code = ? ");
        parameters.add(programCode);

        if ("LAST_N_DAYS".equals(timeWindowType) && timeWindowDays != null && timeWindowDays > 0) {
            int days = Math.min(timeWindowDays, 3650);
            sql.append("AND ").append(source.dateField()).append(" >= NOW() - (")
                    .append(days).append(" * INTERVAL '1 day') ");
        }

        sql.append("GROUP BY member_id ");
        sql.append("HAVING ").append(func).append(" ").append(sqlOp).append(" ? ");
        parameters.add(value);

        return new GeneratedSql(sql.toString(), parameters);
    }

    public SqlFragment buildStaticCondition(String field, String operator, Object value) {
        String safeField = validateField(field, STATIC_FIELDS, "static field");
        String sqlOp = mapOperator(operator);

        if ("in".equalsIgnoreCase(operator)) {
            List<Object> values = normalizeInValues(value);
            if (values.isEmpty()) {
                throw new IllegalArgumentException("IN condition requires at least one value");
            }
            String placeholders = String.join(", ", values.stream().map(v -> "?").toList());
            return new SqlFragment("ma." + safeField + " IN (" + placeholders + ")", values);
        }

        return new SqlFragment("ma." + safeField + " " + sqlOp + " ?", List.of(value));
    }

    public GeneratedSql buildFinalSql(String programCode, List<SqlFragment> staticConds, List<GeneratedSql> subQueries,
                                      String logic, boolean excludeBlacklist, int limit) {
        List<Object> parameters = new ArrayList<>();
        StringBuilder sql = new StringBuilder();
        sql.append("SELECT DISTINCT ma.member_id FROM campaign_member_attr ma ");

        int idx = 0;
        for (GeneratedSql subQuery : subQueries) {
            String alias = "stat_" + (idx++);
            sql.append(" INNER JOIN (").append(subQuery.sql()).append(") ")
                    .append(alias).append(" ON ma.member_id = ").append(alias).append(".member_id ");
            parameters.addAll(subQuery.parameters());
        }

        sql.append(" WHERE 1=1 ");
        sql.append(" AND ma.program_code = ? ");
        parameters.add(programCode);
        if (excludeBlacklist) {
            sql.append(" AND (ma.blacklist_flag IS NULL OR ma.blacklist_flag = false) ");
        }

        String joiner = "OR".equalsIgnoreCase(logic) ? " OR " : " AND ";
        if (!staticConds.isEmpty()) {
            sql.append(" AND (");
            for (int i = 0; i < staticConds.size(); i++) {
                if (i > 0) {
                    sql.append(joiner);
                }
                SqlFragment cond = staticConds.get(i);
                sql.append(cond.sql());
                parameters.addAll(cond.parameters());
            }
            sql.append(") ");
        }

        int safeLimit = Math.max(1, Math.min(limit, MAX_LIMIT));
        sql.append(" LIMIT ").append(safeLimit);
        return new GeneratedSql(sql.toString(), parameters);
    }

    private static Map<String, SourceSpec> buildSources() {
        Map<String, SourceSpec> sources = new LinkedHashMap<>();
        sources.put("order_fact", new SourceSpec("campaign_order_fact", "order_date",
                Set.of("order_amount", "total_amount", "paid_amount", "quantity", "member_id")));
        sources.put("points_transaction", new SourceSpec("campaign_points_transaction", "transaction_date",
                Set.of("points", "amount", "member_id")));
        sources.put("tier_change_log", new SourceSpec("campaign_tier_change_log", "change_date",
                Set.of("member_id", "old_tier", "new_tier")));
        return Map.copyOf(sources);
    }

    private SourceSpec sourceFor(String dataSource) {
        SourceSpec source = SOURCES.get(dataSource);
        if (source == null) {
            throw new IllegalArgumentException("Unsupported data source: " + dataSource);
        }
        return source;
    }

    private String mapAggFunc(SourceSpec source, String func, String field) {
        String safeFunc = func != null ? func.toUpperCase() : "COUNT";
        String safeField = field != null && !field.isBlank() ? validateField(field, source.fields(), "aggregate field") : "*";

        return switch (safeFunc) {
            case "SUM" -> numericAgg("SUM", safeField);
            case "AVG" -> numericAgg("AVG", safeField);
            case "MAX" -> fieldAgg("MAX", safeField);
            case "MIN" -> fieldAgg("MIN", safeField);
            case "COUNT_DISTINCT" -> {
                if ("*".equals(safeField)) {
                    throw new IllegalArgumentException("COUNT_DISTINCT requires a field");
                }
                yield "COUNT(DISTINCT " + safeField + ")";
            }
            case "COUNT" -> "COUNT(" + ("*".equals(safeField) ? "*" : safeField) + ")";
            default -> throw new IllegalArgumentException("Unsupported aggregate function: " + func);
        };
    }

    private String numericAgg(String func, String field) {
        if ("*".equals(field)) {
            throw new IllegalArgumentException(func + " requires a field");
        }
        return func + "(" + field + ")";
    }

    private String fieldAgg(String func, String field) {
        if ("*".equals(field)) {
            throw new IllegalArgumentException(func + " requires a field");
        }
        return func + "(" + field + ")";
    }

    private String mapOperator(String op) {
        String safeOp = op != null ? op.toLowerCase() : "eq";
        return switch (safeOp) {
            case "eq" -> "=";
            case "ne" -> "!=";
            case "gt" -> ">";
            case "gte" -> ">=";
            case "lt" -> "<";
            case "lte" -> "<=";
            default -> "=";
        };
    }

    private String validateField(String field, Set<String> allowedFields, String label) {
        if (field == null || !allowedFields.contains(field)) {
            throw new IllegalArgumentException("Unsupported " + label + ": " + field);
        }
        return field;
    }

    private List<Object> normalizeInValues(Object value) {
        if (value instanceof Collection<?> collection) {
            return collection.stream().map(Object.class::cast).toList();
        }
        if (value instanceof String text) {
            return Pattern.compile(",").splitAsStream(text)
                    .map(String::trim)
                    .filter(v -> !v.isEmpty())
                    .map(Object.class::cast)
                    .toList();
        }
        return List.of(value);
    }

    public static String parseTimeVariable(String expr) {
        if (expr == null) return null;
        Matcher m = TIME_VAR_PATTERN.matcher(expr);
        if (m.find()) {
            int days = Integer.parseInt(m.group(1));
            return "NOW() - INTERVAL '" + Math.min(days, 3650) + " days'";
        }
        return expr;
    }

    private record SourceSpec(String tableName, String dateField, Set<String> fields) {}
}
