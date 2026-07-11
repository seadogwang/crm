package com.loyalty.platform.rules;

import com.googlecode.aviator.AviatorEvaluator;
import com.loyalty.platform.domain.entity.RuleVariableDefinition;
import com.loyalty.platform.domain.repository.AccountTransactionRepository;
import com.loyalty.platform.domain.repository.RuleVariableDefinitionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 变量计算服务 — 按需预加载 + 表达式计算。
 *
 * <p>设计文档 point_design_update.md §6.3：
 * <ol>
 *   <li>获取变量定义列表</li>
 *   <li>解析所有变量的表达式，提取原子积分类型（去重）</li>
 *   <li>批量查询所有原子类型的汇总值（一次数据库查询）</li>
 *   <li>替换表达式中的函数调用为实际数值</li>
 *   <li>使用 Aviator 表达式引擎执行算术运算</li>
 * </ol>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 2.0.0
 */
@Service
public class VariableCalculationService {

    private static final Logger log = LoggerFactory.getLogger(VariableCalculationService.class);

    /** 匹配 sum('TYPE') / count('TYPE') / balance('TYPE') */
    private static final Pattern FUNCTION_PATTERN =
            Pattern.compile("(sum|count|balance)\\s*\\(\\s*'([^']+)'\\s*\\)");

    private final RuleVariableDefinitionRepository varRepo;
    private final AccountTransactionRepository txRepo;
    private final VariableExpressionParser parser;

    public VariableCalculationService(RuleVariableDefinitionRepository varRepo,
                                       AccountTransactionRepository txRepo,
                                       VariableExpressionParser parser) {
        this.varRepo = varRepo;
        this.txRepo = txRepo;
        this.parser = parser;
    }

    /**
     * 按需预加载：解析变量表达式，批量查询原子数据，计算所有变量值。
     *
     * @param programCode 租户代码
     * @param varCodes    需要计算的变量编码列表
     * @param memberId    会员 ID
     * @param windowDays  时间窗口天数（用于 sum/count 函数）
     * @return Map<变量编码, 变量值>
     */
    public Map<String, BigDecimal> calculateVariables(String programCode,
                                                       List<String> varCodes,
                                                       Long memberId,
                                                       int windowDays) {
        if (varCodes == null || varCodes.isEmpty()) {
            return Collections.emptyMap();
        }

        // 1. 获取变量定义
        List<RuleVariableDefinition> vars = varRepo.findByProgramCodeAndVarCodeIn(programCode, varCodes);
        if (vars.isEmpty()) {
            log.warn("[VarCalc] 未找到变量定义: program={}, varCodes={}", programCode, varCodes);
            return Collections.emptyMap();
        }

        // 2. 提取所有原子积分类型（去重）并记录每个变量的表达式
        Set<String> allAtomicTypes = new LinkedHashSet<>();
        Map<String, String> varExpressionMap = new LinkedHashMap<>();
        for (RuleVariableDefinition var : vars) {
            String expr = var.getExpression();
            varExpressionMap.put(var.getVarCode(), expr);
            allAtomicTypes.addAll(parser.extractAtomicTypes(expr));
        }

        log.debug("[VarCalc] 变量数={}, 原子类型数={}, 窗口天数={}", vars.size(), allAtomicTypes.size(), windowDays);

        // 3. 批量查询所有原子类型的汇总值
        Map<String, BigDecimal> sumValues = loadSumValues(memberId, programCode, allAtomicTypes, windowDays);
        Map<String, BigDecimal> countValues = loadCountValues(memberId, programCode, allAtomicTypes, windowDays);
        Map<String, BigDecimal> balanceValues = loadBalanceValues(memberId, programCode, allAtomicTypes);

        // 4. 计算每个变量的值
        Map<String, BigDecimal> results = new LinkedHashMap<>();
        for (RuleVariableDefinition var : vars) {
            String expr = varExpressionMap.get(var.getVarCode());
            try {
                String calculableExpr = replaceFunctionsWithValues(expr, sumValues, countValues, balanceValues);
                BigDecimal value = evaluateExpression(calculableExpr);
                results.put(var.getVarCode(), value);
                log.debug("[VarCalc] {} = {} (expr: {})", var.getVarCode(), value, calculableExpr);
            } catch (Exception e) {
                log.error("[VarCalc] 变量计算失败: varCode={}, expr={}", var.getVarCode(), expr, e);
                results.put(var.getVarCode(), BigDecimal.ZERO);
            }
        }

        return results;
    }

    /**
     * 计算单个变量的值（用于预览测试）。
     */
    public BigDecimal calculateSingleVariable(String programCode, String varCode, Long memberId, int windowDays) {
        Map<String, BigDecimal> results = calculateVariables(programCode, List.of(varCode), memberId, windowDays);
        return results.getOrDefault(varCode, BigDecimal.ZERO);
    }

    // ===== 批量加载原子值 =====

    /**
     * 批量加载 SUM 值（指定类型在时间窗口内的发分累计）。
     */
    private Map<String, BigDecimal> loadSumValues(Long memberId, String programCode,
                                                    Set<String> types, int windowDays) {
        if (types.isEmpty()) return Collections.emptyMap();

        LocalDateTime since = windowDays > 0
                ? LocalDateTime.now().minusDays(windowDays)
                : LocalDateTime.of(2000, 1, 1, 0, 0);

        List<Object[]> results = txRepo.sumAndCountByMemberIdAndTypesAndTimeRange(
                programCode, memberId, new ArrayList<>(types), since);

        Map<String, BigDecimal> valueMap = new LinkedHashMap<>();
        for (Object[] row : results) {
            String type = (String) row[0];
            BigDecimal sum = (BigDecimal) row[1];
            valueMap.put(type, sum != null ? sum : BigDecimal.ZERO);
        }
        // 未查询到的类型默认为 0
        for (String type : types) {
            valueMap.putIfAbsent(type, BigDecimal.ZERO);
        }
        return valueMap;
    }

    /**
     * 批量加载 COUNT 值（从 sumAndCount 查询中提取 count）。
     */
    private Map<String, BigDecimal> loadCountValues(Long memberId, String programCode,
                                                      Set<String> types, int windowDays) {
        if (types.isEmpty()) return Collections.emptyMap();

        LocalDateTime since = windowDays > 0
                ? LocalDateTime.now().minusDays(windowDays)
                : LocalDateTime.of(2000, 1, 1, 0, 0);

        List<Object[]> results = txRepo.sumAndCountByMemberIdAndTypesAndTimeRange(
                programCode, memberId, new ArrayList<>(types), since);

        Map<String, BigDecimal> valueMap = new LinkedHashMap<>();
        for (Object[] row : results) {
            String type = (String) row[0];
            Long count = (Long) row[2];
            valueMap.put(type, count != null ? BigDecimal.valueOf(count) : BigDecimal.ZERO);
        }
        for (String type : types) {
            valueMap.putIfAbsent(type, BigDecimal.ZERO);
        }
        return valueMap;
    }

    /**
     * 批量加载 BALANCE 值（当前净余额）。
     */
    private Map<String, BigDecimal> loadBalanceValues(Long memberId, String programCode,
                                                        Set<String> types) {
        if (types.isEmpty()) return Collections.emptyMap();

        List<Object[]> results = txRepo.balanceByMemberIdAndTypes(
                programCode, memberId, new ArrayList<>(types));

        Map<String, BigDecimal> valueMap = new LinkedHashMap<>();
        for (Object[] row : results) {
            String type = (String) row[0];
            BigDecimal balance = (BigDecimal) row[1];
            valueMap.put(type, balance != null ? balance : BigDecimal.ZERO);
        }
        for (String type : types) {
            valueMap.putIfAbsent(type, BigDecimal.ZERO);
        }
        return valueMap;
    }

    // ===== 表达式替换与计算 =====

    /**
     * 替换表达式中的函数调用为实际数值。
     * <pre>
     * sum('ACT_A') + sum('ACT_B') + 100
     * → 1250.50 + 350.50 + 100
     * </pre>
     */
    String replaceFunctionsWithValues(String expression,
                                       Map<String, BigDecimal> sumValues,
                                       Map<String, BigDecimal> countValues,
                                       Map<String, BigDecimal> balanceValues) {
        StringBuilder result = new StringBuilder();
        Matcher matcher = FUNCTION_PATTERN.matcher(expression);
        int lastEnd = 0;

        while (matcher.find()) {
            // 添加函数调用之前的文本
            result.append(expression, lastEnd, matcher.start());

            String function = matcher.group(1);
            String type = matcher.group(2);

            BigDecimal value = switch (function) {
                case "sum" -> sumValues.getOrDefault(type, BigDecimal.ZERO);
                case "count" -> countValues.getOrDefault(type, BigDecimal.ZERO);
                case "balance" -> balanceValues.getOrDefault(type, BigDecimal.ZERO);
                default -> BigDecimal.ZERO;
            };

            result.append(value.toPlainString());
            lastEnd = matcher.end();
        }
        result.append(expression, lastEnd, expression.length());

        return result.toString();
    }

    /**
     * 使用 Aviator 表达式引擎执行算术运算。
     */
    BigDecimal evaluateExpression(String expression) {
        if (expression == null || expression.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            Object result = AviatorEvaluator.execute(expression.trim());
            if (result instanceof Number) {
                return new BigDecimal(result.toString());
            }
            return BigDecimal.ZERO;
        } catch (Exception e) {
            log.error("[VarCalc] 表达式计算异常: {}", expression, e);
            throw new IllegalArgumentException("表达式计算失败: " + expression, e);
        }
    }
}