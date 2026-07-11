package com.loyalty.platform.rules;

import org.springframework.stereotype.Component;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 变量表达式解析器。
 *
 * <p>设计文档 point_design_update.md §6.2：
 * <ul>
 *   <li>提取表达式中的原子积分类型：sum('ACT_A') → ACT_A</li>
 *   <li>验证表达式语法：括号匹配、函数名合法性、类型存在性</li>
 *   <li>安全检查：防止注入攻击</li>
 * </ul>
 *
 * <p>支持的函数：
 * <ul>
 *   <li>{@code sum('TYPE')} — 指定类型在时间窗口内的发分累计</li>
 *   <li>{@code count('TYPE')} — 指定类型在时间窗口内的交易次数</li>
 *   <li>{@code balance('TYPE')} — 指定类型的当前余额</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 2.0.0
 */
@Component
public class VariableExpressionParser {

    /** 匹配 sum('TYPE') / count('TYPE') / balance('TYPE') */
    private static final Pattern FUNCTION_PATTERN =
            Pattern.compile("(sum|count|balance)\\s*\\(\\s*'([^']+)'\\s*\\)");

    /** 匹配任意函数调用 word('TYPE')，用于检测未知函数 */
    private static final Pattern ANY_FUNCTION_PATTERN =
            Pattern.compile("(\\w+)\\s*\\(\\s*'([^']+)'\\s*\\)");

    /** 允许的字符：字母、数字、运算符、括号、引号、空格、点 */
    private static final Pattern SAFE_EXPRESSION =
            Pattern.compile("^[a-zA-Z0-9\\s+\\-*/()',._%<>!=&|]+$");

    private static final Set<String> VALID_FUNCTIONS = Set.of("sum", "count", "balance");

    /**
     * 提取表达式中所有原子积分类型（去重）。
     *
     * @param expression 变量表达式，如 sum('ACT_A') + sum('ACT_B')
     * @return 去重后的积分类型编码集合
     */
    public Set<String> extractAtomicTypes(String expression) {
        if (expression == null || expression.isBlank()) {
            return Collections.emptySet();
        }
        Set<String> types = new LinkedHashSet<>();
        Matcher matcher = FUNCTION_PATTERN.matcher(expression);
        while (matcher.find()) {
            types.add(matcher.group(2));
        }
        return types;
    }

    /**
     * 验证表达式语法。
     *
     * @param expression     表达式字符串
     * @param availableTypes 可用的积分类型编码集合
     * @return 验证结果
     */
    public ValidationResult validate(String expression, Set<String> availableTypes) {
        if (expression == null || expression.isBlank()) {
            return ValidationResult.error("表达式不能为空");
        }

        // 1. 检查括号匹配
        if (!isBalanced(expression)) {
            return ValidationResult.error("括号不匹配");
        }

        // 2. 检查是否包含非法字符
        if (!SAFE_EXPRESSION.matcher(expression).matches()) {
            return ValidationResult.error("表达式包含非法字符，仅允许字母、数字、运算符和括号");
        }

        // 3. 检查函数名是否合法 + 类型是否存在
        Matcher anyMatcher = ANY_FUNCTION_PATTERN.matcher(expression);
        boolean hasValidFunction = false;
        while (anyMatcher.find()) {
            String functionName = anyMatcher.group(1);
            String typeCode = anyMatcher.group(2);

            if (!VALID_FUNCTIONS.contains(functionName)) {
                return ValidationResult.error("未知函数: " + functionName + "，支持: sum, count, balance");
            }
            if (availableTypes != null && !availableTypes.contains(typeCode)) {
                return ValidationResult.error("积分类型不存在: " + typeCode);
            }
            hasValidFunction = true;
        }

        // 4. 检查至少有一个函数调用
        if (!hasValidFunction) {
            return ValidationResult.error("表达式至少需要包含一个函数调用 (sum/count/balance)");
        }

        return ValidationResult.success();
    }

    /**
     * 快速验证（不检查类型存在性）。
     */
    public ValidationResult validate(String expression) {
        return validate(expression, null);
    }

    /**
     * 提取表达式中的函数类型映射：sum('X') → {function: sum, type: X}。
     */
    public List<FunctionCall> extractFunctionCalls(String expression) {
        if (expression == null || expression.isBlank()) {
            return Collections.emptyList();
        }
        List<FunctionCall> calls = new ArrayList<>();
        Matcher matcher = FUNCTION_PATTERN.matcher(expression);
        while (matcher.find()) {
            calls.add(new FunctionCall(matcher.group(1), matcher.group(2), matcher.group(0)));
        }
        return calls;
    }

    /**
     * 检查括号是否平衡。
     */
    private boolean isBalanced(String expression) {
        int count = 0;
        for (char c : expression.toCharArray()) {
            if (c == '(') count++;
            if (c == ')') count--;
            if (count < 0) return false;
        }
        return count == 0;
    }

    // ===== 内部类 =====

    public record FunctionCall(String function, String typeCode, String raw) {}

    public record ValidationResult(boolean valid, String message) {
        public static ValidationResult success() {
            return new ValidationResult(true, "OK");
        }
        public static ValidationResult error(String message) {
            return new ValidationResult(false, message);
        }
    }
}