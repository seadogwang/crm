package com.loyalty.platform.activity;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.domain.entity.RuleDefinition;
import com.loyalty.platform.rules.DrlSanitizer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.*;
import java.util.stream.Collectors;

/**
 * DRL generator for promo (ACTIVITY_PROMO) rules.
 */
@Component
public class UnifiedPromoDrlGenerator {

    private static final Logger log = LoggerFactory.getLogger(UnifiedPromoDrlGenerator.class);
    private static final ObjectMapper mapper = new ObjectMapper();

    public String generate(RuleDefinition rule) {
        Map<String, Object> meta = rule.getMetadata();
        if (meta == null) meta = Map.of();
        String ruleCode = rule.getRuleCode();
        String ruleGroup = rule.getRuleGroup();
        int priority = rule.getPriority() != null ? rule.getPriority() : 0;

        StringBuilder drl = new StringBuilder();
        drl.append("package com.loyalty.platform.rules;\n");
        drl.append("import com.loyalty.platform.rules.drl.MemberFact;\n");
        drl.append("import com.loyalty.platform.rules.drl.EventFact;\n");
        drl.append("import com.loyalty.platform.rules.action.ActionCollector;\n");
        drl.append("\n");
        drl.append("rule \"").append(DrlSanitizer.escapeDrlString(ruleCode)).append("\"\n");
        if (ruleGroup != null && !ruleGroup.isBlank()) {
            drl.append("    ruleflow-group \"").append(DrlSanitizer.escapeDrlString(ruleGroup)).append("\"\n");
        }
        drl.append("    salience ").append((priority)).append("\n");
        drl.append("when\n");
        drl.append("    $event: EventFact()\n");
        drl.append("    $member: MemberFact(memberId == $event.memberId)\n");

        // Generate conditions
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> conditions = (List<Map<String, Object>>) meta.getOrDefault("entity_conditions", List.of());
        for (Map<String, Object> cond : conditions) {
            String entity = (String) cond.get("entity");
            String attr = (String) cond.get("attribute");
            String operator = (String) cond.get("operator");
            Object value = cond.get("value");

            if ("Order".equals(entity) && "total_amount".equals(attr)) {
                @SuppressWarnings("unchecked")
                Map<String, Object> range = (Map<String, Object>) value;
                if (range != null) {
                    Object min = range.get("min");
                    Object max = range.get("max");
                    if (min instanceof Number) {
                        drl.append("    eval($event.getPayloadNumber(\"total_amount\").compareTo(new java.math.BigDecimal(\"").append(min).append("\")) >= 0)\n");
                    }
                    if (max instanceof Number) {
                        drl.append("    eval($event.getPayloadNumber(\"total_amount\").compareTo(new java.math.BigDecimal(\"").append(max).append("\")) <= 0)\n");
                    }
                }
            } else if ("Member".equals(entity) && "tier_code".equals(attr) && value instanceof List) {
                @SuppressWarnings("unchecked")
                List<String> tiers = (List<String>) value;
                String joined = tiers.stream().map(t -> "$member.getTierCode().equals(\"" + DrlSanitizer.escapeDrlString(t) + "\")").collect(Collectors.joining(" || "));
                drl.append("    eval(").append(joined).append(")\n");
            } else if ("Order".equals(entity) && "combination_sku_set".equals(attr) && "CONTAINS_ALL".equals(operator) && value instanceof List) {
                @SuppressWarnings("unchecked")
                List<String> skus = (List<String>) value;
                String skuList = skus.stream().map(s -> "\"" + DrlSanitizer.escapeDrlString(s) + "\"").collect(Collectors.joining(","));
                drl.append("    eval($event.containsAllSkus(new java.util.HashSet<>(java.util.Arrays.asList(").append(skuList).append("))))\n");
            }
        }

        // Reward calculation
        @SuppressWarnings("unchecked")
        Map<String, Object> reward = (Map<String, Object>) meta.getOrDefault("reward", Map.of());
        String rewardType = (String) reward.getOrDefault("type", "STEP_CYCLE");
        String calcMode = (String) reward.getOrDefault("calc_mode", "HEADER");

        // Accumulative limit parameters (extracted once, used in awardPoints call)
        Object accLimitObj = reward.get("accumulativeLimit");
        BigDecimal accLimit = toBigDecimal(accLimitObj);
        String excessStrategy = (String) reward.getOrDefault("excessStrategy", "STOP");
        Object dwMultObj = reward.getOrDefault("downgradeMultiplier", 1.0);
        BigDecimal dwMult = toBigDecimal(dwMultObj);
        if (dwMult == null) dwMult = BigDecimal.ONE;
        Object dwContinueObj = reward.getOrDefault("downgradeContinueCycle", false);
        boolean dwContinue = Boolean.TRUE.equals(dwContinueObj);

        if ("SIMPLE".equals(rewardType)) {
            // ===== Simple mode =====
            String simpleType = (String) reward.getOrDefault("simple_type", "MULTIPLIER");
            Object multObj = reward.getOrDefault("simple_multiplier", 1.0);
            BigDecimal multVal = toBigDecimal(multObj);
            if (multVal == null) multVal = BigDecimal.ONE;
            Object fixedObj = reward.getOrDefault("simple_fixed_points", 0);
            BigDecimal fixedVal = toBigDecimal(fixedObj);
            if (fixedVal == null) fixedVal = BigDecimal.ZERO;

            if ("LINE".equals(calcMode)) {
                // LINE mode — iterate payload line_items
                drl.append("    $lineItems: java.util.List() from $event.payload.get(\"line_items\")\n");
                drl.append("then\n");
                if ("FIXED_POINTS".equals(simpleType)) {
                    drl.append("    java.math.BigDecimal _pts = $lineItems != null ? new java.math.BigDecimal($lineItems.size() * ").append(fixedVal).append(") : java.math.BigDecimal.ZERO;\n");
                } else {
                    drl.append("    java.math.BigDecimal _pts = java.math.BigDecimal.ZERO;\n");
                    drl.append("    if ($lineItems != null) {\n");
                    drl.append("        for (Object _li : $lineItems) {\n");
                    drl.append("            java.util.Map _item = (java.util.Map) _li;\n");
                    drl.append("            java.math.BigDecimal _lineAmt = new java.math.BigDecimal(String.valueOf(_item.get(\"amount\")));\n");
                    drl.append("            _pts = _pts.add(_lineAmt.multiply(new java.math.BigDecimal(\"").append(multVal).append("\")));\n");
                    drl.append("        }\n");
                    drl.append("    }\n");
                }
            } else {
                // HEADER mode
                drl.append("    $orderAmount: java.math.BigDecimal($event.getPayloadNumber(\"total_amount\"))\n");
                drl.append("then\n");
                if ("FIXED_POINTS".equals(simpleType)) {
                    drl.append("    java.math.BigDecimal _pts = new java.math.BigDecimal(").append(fixedVal).append(");\n");
                } else {
                    drl.append("    java.math.BigDecimal _pts = $orderAmount.multiply(new java.math.BigDecimal(\"").append(multVal).append("\"));\n");
                }
            }
        } else {
            // ===== Step/Cycle mode =====
            @SuppressWarnings("unchecked")
            List<Map<String, Object>> steps = (List<Map<String, Object>>) reward.getOrDefault("steps", List.of());

            if ("LINE".equals(calcMode)) {
                // LINE mode for step rewards — iterate line_items, match each line to step
                drl.append("    $lineItems: java.util.List() from $event.payload.get(\"line_items\")\n");
                drl.append("then\n");
                drl.append("    java.math.BigDecimal _pts = java.math.BigDecimal.ZERO;\n");
                drl.append("    if ($lineItems != null) {\n");
                drl.append("        for (Object _li : $lineItems) {\n");
                drl.append("            java.util.Map _item = (java.util.Map) _li;\n");
                drl.append("            java.math.BigDecimal _lineAmt = new java.math.BigDecimal(String.valueOf(_item.get(\"amount\")));\n");
                drl.append("            java.math.BigDecimal _remaining = _lineAmt;\n");

                String cycleMode = (String) reward.getOrDefault("cycleMode", "SINGLE_MATCH");
                @SuppressWarnings("unchecked")
                List<Number> cycleThresholds = (List<Number>) reward.getOrDefault("cycleThresholdOrder", List.of());

                if ("THRESHOLD_LOOP".equals(cycleMode) && !cycleThresholds.isEmpty()) {
                    BigDecimal highest = new BigDecimal(cycleThresholds.get(0).toString());
                    drl.append("            while (_remaining.compareTo(new java.math.BigDecimal(\"").append(highest).append("\")) >= 0) {\n");
                    for (Map<String, Object> step : steps) {
                        if (Boolean.TRUE.equals(step.get("isCycleThreshold"))) {
                            drl.append("                _pts = _pts.add(new java.math.BigDecimal(\"").append(highest).append("\").multiply(new java.math.BigDecimal(\"").append(step.get("multiplier")).append("\")));\n");
                            break;
                        }
                    }
                    drl.append("                _remaining = _remaining.subtract(new java.math.BigDecimal(\"").append(highest).append("\"));\n");
                    drl.append("            }\n");
                }

                if (steps.isEmpty()) {
                    drl.append("                _pts = _pts.add(_remaining);\n");
                } else {
                    for (Map<String, Object> step : steps) {
                        Object lower = step.get("lower");
                        Object upper = step.get("upper");
                        Object mult = step.get("multiplier");
                        boolean lowerInc = !Boolean.FALSE.equals(step.get("lowerInclusive"));
                        boolean upperInc = Boolean.TRUE.equals(step.get("upperInclusive"));
                        String lowerOp = lowerInc ? ">= 0" : "> 0";
                        String cond = "_remaining.compareTo(new java.math.BigDecimal(\"" + lower + "\")) " + lowerOp;
                        if (upper != null && !String.valueOf(upper).isBlank()) {
                            cond += " && _remaining.compareTo(new java.math.BigDecimal(\"" + upper + "\")) " + (upperInc ? "<= 0" : "< 0");
                        }
                        drl.append("            if (").append(cond).append(") {\n");
                        drl.append("                _pts = _pts.add(_remaining.multiply(new java.math.BigDecimal(\"").append(mult).append("\")));\n");
                        drl.append("            }\n");
                    }
                }
                drl.append("        }\n");
                drl.append("    }\n");
            } else {
                // HEADER mode for step rewards
                drl.append("    $orderAmount: java.math.BigDecimal($event.getPayloadNumber(\"total_amount\"))\n");
                drl.append("then\n");
                drl.append("    java.math.BigDecimal _pts = java.math.BigDecimal.ZERO;\n");
                drl.append("    java.math.BigDecimal _remaining = $orderAmount;\n");

                String cycleMode = (String) reward.getOrDefault("cycleMode", "SINGLE_MATCH");
                @SuppressWarnings("unchecked")
                List<Number> cycleThresholds = (List<Number>) reward.getOrDefault("cycleThresholdOrder", List.of());

                if ("THRESHOLD_LOOP".equals(cycleMode) && !cycleThresholds.isEmpty()) {
                    BigDecimal highest = new BigDecimal(cycleThresholds.get(0).toString());
                    drl.append("    while (_remaining.compareTo(new java.math.BigDecimal(\"").append(highest).append("\")) >= 0) {\n");
                    for (Map<String, Object> step : steps) {
                        if (Boolean.TRUE.equals(step.get("isCycleThreshold"))) {
                            drl.append("        _pts = _pts.add(new java.math.BigDecimal(\"").append(highest).append("\").multiply(new java.math.BigDecimal(\"").append(step.get("multiplier")).append("\")));\n");
                            break;
                        }
                    }
                    drl.append("        _remaining = _remaining.subtract(new java.math.BigDecimal(\"").append(highest).append("\"));\n");
                    drl.append("    }\n");
                }

                if (steps.isEmpty()) {
                    drl.append("    _pts = $orderAmount;\n");
                } else {
                    for (Map<String, Object> step : steps) {
                        Object lower = step.get("lower");
                        Object upper = step.get("upper");
                        Object mult = step.get("multiplier");
                        boolean lowerInc = !Boolean.FALSE.equals(step.get("lowerInclusive"));
                        boolean upperInc = Boolean.TRUE.equals(step.get("upperInclusive"));
                        String lowerOp = lowerInc ? ">= 0" : "> 0";
                        String cond = "_remaining.compareTo(new java.math.BigDecimal(\"" + lower + "\")) " + lowerOp;
                        if (upper != null && !String.valueOf(upper).isBlank()) {
                            cond += " && _remaining.compareTo(new java.math.BigDecimal(\"" + upper + "\")) " + (upperInc ? "<= 0" : "< 0");
                        }
                        drl.append("    if (").append(cond).append(") {\n");
                        drl.append("        _pts = _pts.add(_remaining.multiply(new java.math.BigDecimal(\"").append(mult).append("\")));\n");
                        drl.append("    }\n");
                    }
                }
            }
        }

        // Per-order limit (shared across all modes)
        Object perOrderLimit = reward.get("perOrderLimit");
        if (perOrderLimit != null) {
            BigDecimal pol = toBigDecimal(perOrderLimit);
            drl.append("    if (_pts.compareTo(new java.math.BigDecimal(\"").append(pol).append("\")) > 0) {\n");
            drl.append("        _pts = new java.math.BigDecimal(\"").append(pol).append("\");\n");
            drl.append("    }\n");
        }

        // Award with accumulative limit parameters
        drl.append("    if (_pts.compareTo(java.math.BigDecimal.ZERO) > 0) {\n");
        if (accLimit != null) {
            drl.append("        collector.awardPoints($event.getProgramCode(), $event.getMemberId(), \"REWARD\", _pts, \"")
               .append(DrlSanitizer.escapeDrlString(ruleCode)).append("\", null, new java.math.BigDecimal(\"")
               .append(accLimit).append("\"), \"")
               .append(DrlSanitizer.escapeDrlString(excessStrategy)).append("\", new java.math.BigDecimal(\"")
               .append(dwMult).append("\"), ").append(dwContinue).append(");\n");
        } else {
            drl.append("        collector.awardPoints($event.getProgramCode(), $event.getMemberId(), \"REWARD\", _pts, \"")
               .append(DrlSanitizer.escapeDrlString(ruleCode)).append("\", null);\n");
        }
        drl.append("    }\n");

        drl.append("end\n");
        return drl.toString();
    }

    private static BigDecimal toBigDecimal(Object obj) {
        if (obj == null) return null;
        if (obj instanceof BigDecimal bd) return bd;
        if (obj instanceof Number n) return new BigDecimal(n.toString());
        String s = obj.toString();
        if (s.isBlank()) return null;
        // 安全校验：仅接受纯数字字符串
        if (!s.matches("-?\\d+(\\.\\d+)?")) {
            throw new IllegalArgumentException("Invalid numeric value: " + s);
        }
        return new BigDecimal(s);
    }
}