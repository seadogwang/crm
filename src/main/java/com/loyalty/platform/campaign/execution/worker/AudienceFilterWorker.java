package com.loyalty.platform.campaign.execution.worker;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.intervention.service.InterventionService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 人群筛选 Worker — 完全动态的实时统计查询引擎。
 *
 * <p>废弃所有预聚合字段，用户自己定义统计指标（DYNAMIC_STAT）和静态属性条件（STATIC_ATTR）。
 * 每次查询时实时生成 SQL 聚合，不依赖任何预计算数据。
 *
 * <p>Zeebe Job Type: {@code campaign-audience-filter}
 */
@Component
public class AudienceFilterWorker extends BaseCampaignWorker {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final DynamicStatSqlGenerator sqlGenerator = new DynamicStatSqlGenerator();

    /** 允许的聚合函数白名单 */
    private static final Set<String> ALLOWED_AGG_FUNCS = Set.of(
            "COUNT", "SUM", "AVG", "MAX", "MIN", "COUNT_DISTINCT");

    public AudienceFilterWorker(InterventionService interventionService,
                                 JdbcTemplate jdbcTemplate) {
        super(interventionService);
        this.jdbcTemplate = jdbcTemplate;
    }

    @Override
    public String getJobType() {
        return "campaign-audience-filter";
    }

    @Override
    @SuppressWarnings("unchecked")
    public Map<String, Object> handle(Map<String, Object> variables) {
        String planId = getString(variables, "planId");
        String nodeId = getString(variables, "nodeId");
        String programCode = getString(variables, "programCode");
        String logic = getString(variables, "logic");
        if (logic == null) logic = "AND";
        Integer limit = getInt(variables, "limit");
        if (limit == null || limit <= 0) limit = 10000;
        Boolean excludeBlacklist = getBoolean(variables, "excludeBlacklist");
        if (excludeBlacklist == null) excludeBlacklist = true;

        List<Map<String, Object>> conditions = parseConditions(variables.get("conditions"));
        log.info("AudienceFilter: program={}, logic={}, conditions={}, limit={}",
                programCode, logic, conditions != null ? conditions.size() : 0, limit);

        try {
            List<String> staticConds = new ArrayList<>();
            List<String> subQueries = new ArrayList<>();

            if (conditions != null) {
                for (Map<String, Object> cond : conditions) {
                    String type = (String) cond.get("type");
                    if ("STATIC_ATTR".equals(type)) {
                        String field = (String) cond.get("field");
                        String operator = (String) cond.get("operator");
                        Object value = cond.get("value");
                        if (field != null && operator != null && value != null) {
                            staticConds.add(sqlGenerator.buildStaticCondition(field, operator, value));
                        }
                    } else if ("DYNAMIC_STAT".equals(type)) {
                        String dataSource = (String) cond.get("dataSource");
                        String aggFunc = (String) cond.get("aggFunc");
                        String aggField = (String) cond.get("aggField");
                        String twType = (String) cond.get("timeWindowType");
                        Integer twDays = getIntValue(cond, "timeWindowDays");
                        String operator = (String) cond.get("operator");
                        Object value = cond.get("value");

                        if (dataSource != null && aggFunc != null && ALLOWED_AGG_FUNCS.contains(aggFunc)) {
                            String subQuery = sqlGenerator.generateSubQuery(
                                    dataSource, aggFunc, aggField, twType, twDays, operator, value);
                            subQueries.add(subQuery);
                        }
                    }
                }
            }

            if (staticConds.isEmpty() && subQueries.isEmpty()) {
                staticConds.add("ma.status = 'ACTIVE'");
            }
            // 添加 program 过滤
            staticConds.add(0, "ma.program_code = '" + programCode + "'");

            String finalSql = sqlGenerator.buildFinalSql(staticConds, subQueries, logic, excludeBlacklist, limit);
            log.debug("AudienceFilter SQL: {}", finalSql);

            List<String> memberIds = jdbcTemplate.queryForList(finalSql, String.class);
            log.info("AudienceFilter result: {} members (queryTime={})", memberIds.size(), Instant.now());

            return Map.of(
                    "memberIds", memberIds,
                    "queryTime", Instant.now().toString(),
                    "count", memberIds.size(),
                    "status", "COMPLETED"
            );
        } catch (Exception e) {
            log.error("AudienceFilter query failed: {}", e.getMessage(), e);
            return errorResult("Query failed: " + e.getMessage());
        }
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> parseConditions(Object obj) {
        if (obj == null) return Collections.emptyList();
        if (obj instanceof List) return (List<Map<String, Object>>) obj;
        if (obj instanceof String) {
            try {
                return objectMapper.readValue((String) obj,
                        new TypeReference<List<Map<String, Object>>>() {});
            } catch (Exception e) {
                log.warn("Failed to parse conditions JSON: {}", e.getMessage());
                return Collections.emptyList();
            }
        }
        return Collections.emptyList();
    }

    private Integer getIntValue(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val instanceof Number) return ((Number) val).intValue();
        if (val instanceof String) {
            try { return Integer.parseInt((String) val); } catch (NumberFormatException ignored) {}
        }
        return null;
    }

    private Boolean getBoolean(Map<String, Object> variables, String key) {
        Object val = variables.get(key);
        if (val instanceof Boolean) return (Boolean) val;
        if (val instanceof String) return Boolean.parseBoolean((String) val);
        return null;
    }
}