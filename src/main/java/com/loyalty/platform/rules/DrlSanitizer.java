package com.loyalty.platform.rules;

import java.math.BigDecimal;
import java.util.regex.Pattern;

/**
 * DRL 代码安全工具 — 防止 DRL 注入。
 *
 * <p>Drools DRL 中的字符串上下文使用双引号界定。如果用户输入包含未转义的
 * 双引号、反斜杠或换行符，攻击者可以逃逸字符串上下文并在 {@code eval()} 中
 * 执行任意 Java 代码。
 *
 * <p>本工具提供安全的字符串转义和白名单校验，所有 DRL 生成器均须使用。
 */
public final class DrlSanitizer {

    private DrlSanitizer() {}

    /** DRL 标识符安全字符：字母、数字、下划线、连字符、点 */
    private static final Pattern SAFE_IDENTIFIER = Pattern.compile("^[a-zA-Z0-9_.\\-]+$");

    /** DRL 标识符安全字符（含中文等） */
    private static final Pattern SAFE_LABEL = Pattern.compile("^[a-zA-Z0-9_\\-\\u4e00-\\u9fa5]+$");

    /**
     * 转义 DRL 字符串上下文中的特殊字符。
     * 将 \、"、换行符转义后，值可安全地放入 {@code "..."} 字符串字面量中。
     *
     * @param value 原始值（可为 null）
     * @return 转义后的安全字符串
     */
    public static String escapeDrlString(String value) {
        if (value == null) return "";
        return value
                .replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }

    /**
     * 校验标识符仅包含安全字符（字母/数字/下划线/连字符/点）。
     * 用于 DRL 中的变量名、字段名、规则代码等。
     *
     * @throws IllegalArgumentException 如果包含不安全字符
     */
    public static String validateIdentifier(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " must not be empty");
        }
        if (!SAFE_IDENTIFIER.matcher(value).matches()) {
            throw new IllegalArgumentException(
                    "Invalid " + label + ": \"" + value + "\" contains unsafe characters");
        }
        return value;
    }

    /**
     * 校验标签仅包含安全字符（字母/数字/下划线/连字符/中文）。
     *
     * @throws IllegalArgumentException 如果包含不安全字符
     */
    public static String validateLabel(String value, String label) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(label + " must not be empty");
        }
        if (!SAFE_LABEL.matcher(value).matches()) {
            throw new IllegalArgumentException(
                    "Invalid " + label + ": \"" + value + "\" contains unsafe characters");
        }
        return value;
    }

    /**
     * 将 Object 安全转换为 BigDecimal 字符串。
     * 仅接受 Number 类型，拒绝字符串以避免注入。
     *
     * @throws IllegalArgumentException 如果值不是 Number
     */
    public static String toSafeBigDecimalStr(Object value, String label) {
        if (value instanceof Number n) {
            return "new java.math.BigDecimal(\"" + new BigDecimal(n.toString()).toPlainString() + "\")";
        }
        throw new IllegalArgumentException(
                label + " must be a number, got: " + (value != null ? value.getClass().getSimpleName() : "null"));
    }

    /**
     * 将 Object 安全转换为整数。
     * 仅接受 Number 类型。
     */
    public static int toSafeInt(Object value, String label) {
        if (value instanceof Number n) {
            return n.intValue();
        }
        throw new IllegalArgumentException(
                label + " must be a number, got: " + (value != null ? value.getClass().getSimpleName() : "null"));
    }

    /**
     * 将 Object 安全转换为 double。
     * 仅接受 Number 类型。
     */
    public static double toSafeDouble(Object value, String label) {
        if (value instanceof Number n) {
            return n.doubleValue();
        }
        throw new IllegalArgumentException(
                label + " must be a number, got: " + (value != null ? value.getClass().getSimpleName() : "null"));
    }
}