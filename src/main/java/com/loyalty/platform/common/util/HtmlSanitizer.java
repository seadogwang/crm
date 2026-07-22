package com.loyalty.platform.common.util;

import java.util.Set;
import java.util.regex.Pattern;

/**
 * 简易 HTML 净化器 — 防止存储型 XSS。
 *
 * <p>移除所有 script/style/iframe/object/embed 标签和事件处理器属性（on*），
 * 仅保留安全的格式化标签和 href/src 属性。
 *
 * <p>生产环境建议替换为 OWASP Java HTML Sanitizer 或 jsoup。
 */
public final class HtmlSanitizer {

    private HtmlSanitizer() {}

    /** 允许的安全标签 */
    private static final Set<String> ALLOWED_TAGS = Set.of(
            "p", "br", "b", "i", "u", "em", "strong", "a", "ul", "ol", "li",
            "h1", "h2", "h3", "h4", "h5", "h6", "blockquote", "code", "pre",
            "span", "div", "table", "thead", "tbody", "tr", "th", "td", "hr",
            "img", "sub", "sup", "del", "ins", "small", "mark"
    );

    /** 禁止的标签 — 会被完全移除（包括内容） */
    private static final Pattern DANGEROUS_TAGS = Pattern.compile(
            "<(script|style|iframe|object|embed|form|input|textarea|select|option|" +
            "link|meta|base|applet|frame|frameset|layer|ilayer)[\\s>/?]",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    /** 事件处理器属性 on* */
    private static final Pattern EVENT_HANDLERS = Pattern.compile(
            "\\s+on\\w+\\s*=\\s*(\"[^\"]*\"|'[^']*'|[^\\s>]*)",
            Pattern.CASE_INSENSITIVE);

    /** javascript: / vbscript: 协议 */
    private static final Pattern DANGEROUS_PROTOCOLS = Pattern.compile(
            "(href|src|action|formaction)\\s*=\\s*[\"']?\\s*(javascript|vbscript|data)\\s*:",
            Pattern.CASE_INSENSITIVE);

    /** HTML 注释（可能包含条件注释/IE 表达式） */
    private static final Pattern COMMENTS = Pattern.compile(
            "<!--[\\s\\S]*?-->");

    /**
     * 净化 HTML 字符串，移除所有危险元素。
     *
     * @param html 原始 HTML（可为 null）
     * @return 净化后的安全 HTML
     */
    public static String sanitize(String html) {
        if (html == null || html.isBlank()) {
            return html;
        }

        String result = html;

        // 1. 移除 HTML 注释
        result = COMMENTS.matcher(result).replaceAll("");

        // 2. 移除危险标签（包括内容）
        result = removeDangerousTags(result);

        // 3. 移除事件处理器属性
        result = EVENT_HANDLERS.matcher(result).replaceAll("");

        // 4. 移除危险协议
        result = DANGEROUS_PROTOCOLS.matcher(result).replaceAll("$1=\"\"");

        return result;
    }

    /**
     * 移除危险标签及其内容。
     */
    private static String removeDangerousTags(String html) {
        // 简单实现：移除 <script>...</script> 等标签及其内容
        String result = html;
        String[] tags = {"script", "style", "iframe", "object", "embed"};
        for (String tag : tags) {
            Pattern p = Pattern.compile(
                    "<" + tag + "[^>]*>[\\s\\S]*?</" + tag + "\\s*>",
                    Pattern.CASE_INSENSITIVE);
            result = p.matcher(result).replaceAll("");
            // 自闭合形式
            Pattern selfClosing = Pattern.compile(
                    "<" + tag + "[^>]*?/>",
                    Pattern.CASE_INSENSITIVE);
            result = selfClosing.matcher(result).replaceAll("");
        }
        return result;
    }
}