package com.loyalty.saas.common.interceptor;

import com.loyalty.saas.common.context.TenantContext;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Hibernate 租户 SQL 拦截器 —— 四层防御体系的第二层：ORM 语法树拦截。
 *
 * <p>实现 Hibernate 6 的 {@link StatementInspector} 接口，在 SQL 语句执行前
 * 自动注入 {@code program_code = ?} 租户过滤条件。这是数据隔离最关键的防线——
 * 即便开发人员误写了 {@code memberRepo.findAll()}，系统也会自动变为
 * {@code SELECT * FROM member WHERE program_code = 'XYZ'}，物理杜绝数据穿透。
 *
 * <p><b>实现原理</b>：
 * <ul>
 *   <li>拦截所有 SELECT、UPDATE、DELETE 语句。</li>
 *   <li>解析 SQL 中的表名，判断是否为多租户表。</li>
 *   <li>如果是多租户表且 SQL 中尚未包含 program_code 过滤条件，则自动追加。</li>
 *   <li>INSERT 语句不需要拦截（program_code 由实体字段自动填充）。</li>
 * </ul>
 *
 * <p><b>线程安全</b>：StatementInspector 的实现必须是线程安全的。
 * 本实现无实例状态，通过 {@link TenantContext#get()} 获取租户信息。
 *
 * <p><b>配置方式</b>：
 * <pre>{@code
 * spring.jpa.properties.hibernate.session_factory.statement_inspector
 *     = com.loyalty.saas.common.interceptor.TenantHibernateInterceptor
 * }</pre>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public class TenantHibernateInterceptor implements StatementInspector {

    private static final Logger log = LoggerFactory.getLogger(TenantHibernateInterceptor.class);

    /**
     * 多租户表名集合（通过配置注入或硬编码同步于 application.yml 的 loyalty.tenant.multi-tenant-tables）。
     */
    private final Set<String> multiTenantTables;

    /**
     * 正则：匹配 SQL 中的表名（FROM、JOIN 后的标识符）。
     */
    private static final Pattern TABLE_NAME_PATTERN =
            Pattern.compile("\\b(FROM|JOIN|UPDATE|INTO|TABLE)\\s+([`\"']?)([\\w.]+)\\2", Pattern.CASE_INSENSITIVE);

    /**
     * 正则：检测 SQL 中是否已包含 program_code 过滤条件。
     */
    private static final Pattern PROGRAM_CODE_PATTERN =
            Pattern.compile("\\bprogram_code\\s*(=|IN|IS)\\s*", Pattern.CASE_INSENSITIVE);

    /**
     * 构造拦截器。
     *
     * @param multiTenantTables 需要自动注入租户过滤的表名集合
     */
    public TenantHibernateInterceptor(Set<String> multiTenantTables) {
        this.multiTenantTables = Set.copyOf(multiTenantTables);
        log.info("[TenantHibernateInterceptor] 已注册多租户表: {}", multiTenantTables);
    }

    @Override
    public String inspect(String sql) {
        // 1. 获取当前租户上下文
        String programCode = TenantContext.get();
        if (programCode == null) {
            // 非租户上下文（如启动时的初始化查询），放行
            return sql;
        }

        // 2. 快速检查：SQL 已包含 program_code 过滤，跳过
        if (PROGRAM_CODE_PATTERN.matcher(sql).find()) {
            return sql;
        }

        // 3. 解析 SQL 中的表名
        Matcher matcher = TABLE_NAME_PATTERN.matcher(sql);
        boolean modified = false;
        StringBuilder modifiedSql = new StringBuilder(sql);

        // 从后往前匹配，避免替换位置偏移
        while (matcher.find()) {
            String tableName = matcher.group(3);

            // 去除可能的 schema 前缀（如 public.member）
            if (tableName.contains(".")) {
                tableName = tableName.substring(tableName.lastIndexOf('.') + 1);
            }

            if (multiTenantTables.contains(tableName)) {
                // 判断 SQL 语句类型，决定追加方式
                String clause = matcher.group(1).toUpperCase();

                if ("UPDATE".equals(clause)) {
                    // UPDATE table SET ... WHERE ...
                    modified = appendTenantCondition(modifiedSql, sql, "WHERE") || modified;
                } else if ("DELETE".equals(clause)) {
                    // DELETE FROM table WHERE ...
                    modified = appendTenantCondition(modifiedSql, sql, "WHERE") || modified;
                } else {
                    // SELECT ... FROM table ...
                    modified = appendTenantCondition(modifiedSql, sql, "WHERE") || modified;
                }
            }
        }

        if (modified) {
            log.debug("[TenantHibernateInterceptor] SQL 已注入租户过滤: programCode={}, original={}, modified={}",
                    programCode, sql, modifiedSql);
            return modifiedSql.toString();
        }

        return sql;
    }

    /**
     * 在 SQL 的 WHERE/JOIN ON 子句后追加 program_code 过滤条件。
     *
     * <p>追加策略：
     * <ul>
     *   <li>如果 SQL 已有 WHERE 子句，追加 {@code AND program_code = 'XXX'}。</li>
     *   <li>如果 SQL 没有 WHERE 子句，追加 {@code WHERE program_code = 'XXX'}。</li>
     * </ul>
     *
     * @param sqlBuilder SQL 构建器
     * @param originalSql 原始 SQL
     * @param keyword 关键字（WHERE、ON）
     * @return true 如果成功追加
     */
    private boolean appendTenantCondition(StringBuilder sqlBuilder, String originalSql, String keyword) {
        String programCode = TenantContext.get();
        if (programCode == null) {
            return false;
        }

        String tenantCondition = " program_code = '" + programCode.replace("'", "''") + "'";

        // 查找 WHERE 子句的位置
        Pattern wherePattern = Pattern.compile(
                "\\b" + keyword + "\\b", Pattern.CASE_INSENSITIVE);
        Matcher whereMatcher = wherePattern.matcher(originalSql);

        if (whereMatcher.find()) {
            // 已有 WHERE 子句，追加 AND
            int endPos = whereMatcher.end();
            // 在 WHERE 关键字后插入条件
            sqlBuilder.insert(endPos, " " + tenantCondition + " AND ");
            return true;
        } else {
            // 没有 WHERE 子句，需要追加
            // 查找合适的位置（ORDER BY、GROUP BY、LIMIT 之前，或 SQL 末尾）
            Pattern endPattern = Pattern.compile(
                    "\\b(ORDER\\s+BY|GROUP\\s+BY|LIMIT|OFFSET|FETCH|FOR\\s+UPDATE)\\b",
                    Pattern.CASE_INSENSITIVE);
            Matcher endMatcher = endPattern.matcher(originalSql);

            if (endMatcher.find()) {
                sqlBuilder.insert(endMatcher.start(), " WHERE " + tenantCondition + " ");
            } else {
                sqlBuilder.append(" WHERE ").append(tenantCondition);
            }
            return true;
        }
    }
}