package com.loyalty.platform.rules;

import com.loyalty.platform.domain.entity.RuleDefinition;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 等级规则 DRL 生成器 — 将等级升级/保级规则转换为 Drools DRL。
 *
 * <p>支持的 rule_purpose:
 * <ul>
 *   <li>{@code TIER_UPGRADE} — 等级升级规则</li>
 *   <li>{@code TIER_RETENTION} — 等级保级规则</li>
 * </ul>
 *
 * <p>生成的 DRL 规则在事件触发时评估会员条件，满足条件则调用
 * {@link TierEvaluationService} 执行等级变更。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.8.0
 */
@Component
public class TierDrlGenerator {

    private static final Logger log = LoggerFactory.getLogger(TierDrlGenerator.class);

    /**
     * 根据规则定义生成 DRL 内容。
     *
     * @param rule 等级规则定义（metadata 含 tier_target / evaluation 等配置）
     * @return 生成的 DRL 字符串，若无法生成返回 null
     */
    public String generate(RuleDefinition rule) {
        Map<String, Object> meta = rule.getMetadata();
        if (meta == null) {
            log.warn("[TierDrlGen] 规则 {} 缺少 metadata，跳过生成", rule.getRuleCode());
            return null;
        }

        String rulePurpose = rule.getRulePurpose();
        if ("TIER_UPGRADE".equals(rulePurpose)) {
            return generateUpgradeDrl(rule);
        } else if ("TIER_RETENTION".equals(rulePurpose)) {
            return generateRetentionDrl(rule);
        }

        log.warn("[TierDrlGen] 不支持的 rule_purpose: {}", rulePurpose);
        return null;
    }

    /**
     * 生成升级规则 DRL。
     *
     * <p>metadata 结构：
     * <pre>{@code
     * {
     *   "tier_target": "PLATINUM",
     *   "evaluation": {
     *     "dimension": "TIER_POINTS",
     *     "required_value": 8000,
     *     "operator": "AND",
     *     "extra_conditions": [
     *       { "dimension": "ORDER_COUNT", "operator": ">=", "value": 10 }
     *     ]
     *   }
     * }
     * }</pre>
     */
    @SuppressWarnings("unchecked")
    private String generateUpgradeDrl(RuleDefinition rule) {
        Map<String, Object> meta = rule.getMetadata();
        String ruleCode = rule.getRuleCode();
        String targetTier = (String) meta.get("tier_target");

        if (targetTier == null) {
            log.warn("[TierDrlGen] 升级规则 {} 缺少 tier_target", ruleCode);
            return null;
        }

        Map<String, Object> eval = (Map<String, Object>) meta.get("evaluation");
        if (eval == null) {
            log.warn("[TierDrlGen] 升级规则 {} 缺少 evaluation 配置", ruleCode);
            return null;
        }

        StringBuilder drl = new StringBuilder();
        appendHeader(drl, rule);

        drl.append("when\n");
        drl.append("    $event: EventFact()\n");
        drl.append("    $member: MemberFact(memberId == $event.memberId)\n");

        // 主条件
        String mainDim = (String) eval.get("dimension");
        Object requiredValue = eval.get("required_value");
        appendCondition(drl, mainDim, ">=", requiredValue, "    ");

        // 额外条件
        List<Map<String, Object>> extraConditions = (List<Map<String, Object>>) eval.get("extra_conditions");
        if (extraConditions != null) {
            for (Map<String, Object> cond : extraConditions) {
                String dim = (String) cond.get("dimension");
                String op = (String) cond.getOrDefault("operator", ">=");
                Object val = cond.get("value");
                appendCondition(drl, dim, op, val, "    ");
            }
        }

        drl.append("then\n");
        drl.append("    collector.upgradeTier($member.getMemberId(), \"")
                .append(DrlSanitizer.escapeDrlString(targetTier)).append("\", \"UPGRADE\", \"")
                .append(DrlSanitizer.escapeDrlString(ruleCode)).append("\", null);\n");
        drl.append("end\n");

        return drl.toString();
    }

    /**
     * 生成保级规则 DRL。
     *
     * <p>metadata 结构：
     * <pre>{@code
     * {
     *   "tier_source": "GOLD",
     *   "evaluation": {
     *     "dimension": "TIER_POINTS",
     *     "required_value": 2000,
     *     "retention_cycle_days": 365
     *   },
     *   "downgrade_target": "SILVER"
     * }
     * }</pre>
     */
    @SuppressWarnings("unchecked")
    private String generateRetentionDrl(RuleDefinition rule) {
        Map<String, Object> meta = rule.getMetadata();
        String ruleCode = rule.getRuleCode();
        String tierSource = (String) meta.get("tier_source");

        Map<String, Object> eval = (Map<String, Object>) meta.get("evaluation");
        if (eval == null) {
            log.warn("[TierDrlGen] 保级规则 {} 缺少 evaluation 配置", ruleCode);
            return null;
        }

        StringBuilder drl = new StringBuilder();
        appendHeader(drl, rule);

        drl.append("when\n");
        drl.append("    $event: EventFact()\n");
        drl.append("    $member: MemberFact(memberId == $event.memberId");

        // 仅匹配指定等级的会员
        if (tierSource != null) {
            drl.append(", tierCode == \"").append(DrlSanitizer.escapeDrlString(tierSource)).append("\"");
        }
        drl.append(")\n");

        // 保级条件
        String mainDim = (String) eval.get("dimension");
        Object requiredValue = eval.get("required_value");
        appendCondition(drl, mainDim, ">=", requiredValue, "    ");

        drl.append("then\n");
        String downgradeTarget = (String) meta.getOrDefault("downgrade_target", "BASE");
        drl.append("    collector.downgradeTier($member.getMemberId(), \"")
                .append(DrlSanitizer.escapeDrlString(downgradeTarget)).append("\", \"DOWNGRADE\", \"")
                .append(DrlSanitizer.escapeDrlString(ruleCode)).append("\", null);\n");
        drl.append("end\n");

        return drl.toString();
    }

    /**
     * 生成 DRL 头部（package、import、rule 声明）。
     */
    private void appendHeader(StringBuilder drl, RuleDefinition rule) {
        drl.append("package com.loyalty.platform.rules.tier;\n");
        drl.append("import com.loyalty.platform.rules.drl.MemberFact;\n");
        drl.append("import com.loyalty.platform.rules.drl.EventFact;\n");
        drl.append("import com.loyalty.platform.rules.action.ActionCollector;\n");
        drl.append("\n");
        drl.append("global ActionCollector collector;\n");
        drl.append("\n");
        drl.append("rule \"").append(DrlSanitizer.escapeDrlString(rule.getRuleCode())).append("\"\n");
        if (rule.getRuleGroup() != null && !rule.getRuleGroup().isBlank()) {
            drl.append("    ruleflow-group \"").append(DrlSanitizer.escapeDrlString(rule.getRuleGroup())).append("\"\n");
        }
        int priority = rule.getPriority() != null ? rule.getPriority() : 0;
        drl.append("    salience ").append(priority).append("\n");
    }

    /**
     * 生成评估条件 DRL 片段。
     *
     * @param dim   评估维度代码
     * @param op    比较操作符
     * @param value 要求值
     * @param indent 缩进
     */
    private void appendCondition(StringBuilder drl, String dim, String op, Object value, String indent) {
        if (dim == null || value == null) return;

        String varAccess = getVariableAccess(dim);
        String comparator = toDroolsOperator(op);
        String valStr = toBigDecimalStr(value);

        drl.append(indent).append("eval( ").append(varAccess)
                .append(" ").append(comparator).append(" ")
                .append(valStr).append(" )\n");
    }

    /**
     * 获取变量访问表达式（Drools eval 中使用的 Java 表达式）。
     */
    private String getVariableAccess(String dimension) {
        switch (dimension) {
            case "TIER_POINTS":
                return "$member.getTierPoints()";
            case "ORDER_COUNT":
                return "$member.getExtNumber(\"order_count_total\")";
            case "ORDER_COUNT_DAYS":
                return "$member.getExtNumber(\"order_count_90days\")";
            case "TOTAL_AMOUNT":
                return "$member.getExtNumber(\"total_amount\")";
            case "CONTINUOUS_DAYS":
                return "$member.getExtNumber(\"continuous_login_days\")";
            case "LAST_ORDER_DAYS":
                return "$member.getExtNumber(\"last_order_days\")";
            default:
                return "$member.getExtNumber(\"" + DrlSanitizer.escapeDrlString(dimension) + "\")";
        }
    }

    /**
     * 将比较操作符转换为 Drools 可用的 Java 比较表达式。
     */
    private String toDroolsOperator(String op) {
        if (op == null) return ">=";
        return switch (op) {
            case ">=" -> ">=";
            case ">" -> ">";
            case "<" -> "<";
            case "<=" -> "<=";
            case "==" -> "==";
            default -> ">=";
        };
    }

    /**
     * 将值转换为 BigDecimal 的字符串表示。
     */
    private String toBigDecimalStr(Object value) {
        return DrlSanitizer.toSafeBigDecimalStr(value, "condition value");
    }
}