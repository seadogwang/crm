package com.loyalty.platform.rules;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.domain.entity.RuleDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 规则 DRL 生成器 — 将 metadata JSON 配置转换为 Drools DRL 代码。
 */
@Service
public class RuleDrlGenerator {

    private static final Logger log = LoggerFactory.getLogger(RuleDrlGenerator.class);

    private final ObjectMapper mapper = new ObjectMapper();

    /**
     * 根据规则 metadata 生成 DRL 代码。
     */
    public String generate(RuleDefinition rule) {
        String ruleName = safeName(rule.getRuleName() != null ? rule.getRuleName() : rule.getRuleCode());
        String ruleGroup = rule.getRuleGroup() != null ? rule.getRuleGroup() : "base";
        int priority = rule.getPriority() != null ? rule.getPriority() : 100;

        StringBuilder sb = new StringBuilder();
        sb.append("package com.loyalty.platform.rules;\n");
        sb.append("import com.loyalty.platform.rules.drl.MemberFact;\n");
        sb.append("import com.loyalty.platform.rules.drl.EventFact;\n");
        sb.append("import com.loyalty.platform.domain.entity.VariableFact;\n");
        sb.append("import com.loyalty.platform.rules.action.ActionCollector;\n\n");

        sb.append("rule \"").append(ruleName).append("\"\n");
        sb.append("  salience ").append(priority).append("\n");
        sb.append("  agenda-group \"").append(ruleGroup).append("\"\n");
        sb.append("  when\n");

        @SuppressWarnings("unchecked")
        Map<String, Object> meta = rule.getMetadata();
        if (meta == null) {
            sb.append("    // no conditions\n");
            sb.append("  then\n");
            sb.append("    System.out.println(\"rule fired: ").append(ruleName).append("\");\n");
            sb.append("end\n");
            return sb.toString();
        }

        List<String> conditions = new ArrayList<>();
        conditions.add("    $event: EventFact()");
        conditions.add("    $member: MemberFact(memberId == $event.memberId)");

        // 解析条件
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> conds = (List<Map<String, Object>>) meta.getOrDefault("conditions", List.of());
        boolean hasVariable = false;
        for (Map<String, Object> cond : conds) {
            String type = (String) cond.get("type");
            if ("VARIABLE".equals(type)) {
                hasVariable = true;
                String varCode = (String) cond.get("varCode");
                String op = (String) cond.getOrDefault("operator", ">=");
                Object threshold = cond.get("threshold");
                conditions.add("    $vars: VariableFact(getValue(\"" + varCode + "\") " + op + " " + threshold + ")");
            } else if ("EVENT_ATTRIBUTE".equals(type) || "MEMBER_ATTRIBUTE".equals(type)) {
                String field = (String) cond.get("field");
                String op = (String) cond.getOrDefault("operator", ">=");
                Object value = cond.get("value");
                boolean isMember = "MEMBER_ATTRIBUTE".equals(type);
                String obj = isMember ? "$member" : "$event";
                String fn = isMember ? "getExtNumber" : "getPayloadNumber";
                if (value instanceof List) {
                    conditions.add("    eval(java.util.Arrays.asList(" + value + ").contains(" + obj + "." + fn + "(\"" + field + "\")))");
                } else {
                    conditions.add("    eval(" + obj + "." + fn + "(\"" + field + "\") " + op + " " + value + ")");
                }
            }
        }

        sb.append(String.join(",\n", conditions));
        sb.append("\n  then\n");

        // 解析奖励规则
        @SuppressWarnings("unchecked")
        Map<String, Object> reward = (Map<String, Object>) meta.get("reward");
        if (reward != null) {
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> types = (List<Map<String, Object>>) reward.getOrDefault("types", List.of());
            for (Map<String, Object> rt : types) {
                String pointType = (String) rt.get("pointType");
                String mode = (String) rt.get("mode");
                if (pointType == null) continue;

                if ("FIXED_VALUE".equals(mode)) {
                    int points = rt.get("points") instanceof Number n ? n.intValue() : 0;
                    sb.append("    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), \"")
                      .append(pointType).append("\", new java.math.BigDecimal(\"").append(points).append("\"), \"")
                      .append(ruleName).append("\", null);\n");
                } else if ("FIXED_MULTIPLIER".equals(mode)) {
                    double multiplier = rt.get("multiplier") instanceof Number n ? n.doubleValue() : 1.0;
                    sb.append("    java.math.BigDecimal _base = $event.getPayloadNumber(\"total_amount\");\n");
                    sb.append("    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), \"")
                      .append(pointType).append("\", _base.multiply(new java.math.BigDecimal(\"").append(multiplier)
                      .append("\")).setScale(0, java.math.RoundingMode.DOWN), \"").append(ruleName).append("\", null);\n");
                } else if ("STEP".equals(mode) || "STEP_CYCLE".equals(mode)) {
                    @SuppressWarnings("unchecked")
                    List<Map<String, Object>> steps = (List<Map<String, Object>>) rt.getOrDefault("steps", List.of());
                    sb.append("    java.math.BigDecimal _amount = $event.getPayloadNumber(\"total_amount\");\n");
                    sb.append("    java.math.BigDecimal _pts = java.math.BigDecimal.ZERO;\n");
                    for (Map<String, Object> step : steps) {
                        int lower = step.get("lower") instanceof Number n ? n.intValue() : 0;
                        Object upperObj = step.get("upper");
                        boolean isCycle = Boolean.TRUE.equals(step.get("isCycleThreshold"));
                        double mul = step.get("multiplier") instanceof Number n ? n.doubleValue() : 1.0;
                        if (isCycle) {
                            String upper = upperObj != null ? String.valueOf(upperObj) : "999999";
                            sb.append("    java.math.BigDecimal _seg = new java.math.BigDecimal(\"").append(upper).append("\").subtract(new java.math.BigDecimal(\"").append(lower).append("\"));\n");
                            sb.append("    while (_amount.compareTo(_seg) > 0) { _pts = _pts.add(_seg.multiply(new java.math.BigDecimal(\"").append(mul).append("\"))); _amount = _amount.subtract(_seg); }\n");
                        } else {
                            String upper = upperObj != null ? String.valueOf(upperObj) : "999999";
                            sb.append("    if (_amount.compareTo(new java.math.BigDecimal(\"").append(lower).append("\")) > 0 && _amount.compareTo(new java.math.BigDecimal(\"").append(upper).append("\")) <= 0) { _pts = _pts.add(_amount.multiply(new java.math.BigDecimal(\"").append(mul).append("\"))); }\n");
                        }
                    }
                    @SuppressWarnings("unchecked")
                    Map<String, Object> limits = (Map<String, Object>) rt.get("limits");
                    if (limits != null) {
                        int perOrder = limits.get("perOrderLimit") instanceof Number n ? n.intValue() : 0;
                        boolean unlimited = Boolean.TRUE.equals(limits.get("unlimitedPerOrder"));
                        if (!unlimited && perOrder > 0) {
                            sb.append("    if (_pts.compareTo(new java.math.BigDecimal(\"").append(perOrder).append("\")) > 0) _pts = new java.math.BigDecimal(\"").append(perOrder).append("\");\n");
                        }
                    }
                    sb.append("    collector.awardPoints($event.getProgramCode(), $event.getMemberId(), \"")
                      .append(pointType).append("\", _pts, \"").append(ruleName).append("\", null);\n");
                }
            }
        }

        sb.append("end\n");
        log.info("[DRL] 生成规则: {}", rule.getRuleCode());
        return sb.toString();
    }

    private String safeName(String name) {
        return name.replaceAll("[^a-zA-Z0-9_]", "_");
    }
}