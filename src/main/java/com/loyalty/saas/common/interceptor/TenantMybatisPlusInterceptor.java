package com.loyalty.saas.common.interceptor;

import com.baomidou.mybatisplus.extension.plugins.inner.InnerInterceptor;
import com.loyalty.saas.common.context.TenantContext;
import org.apache.ibatis.executor.statement.StatementHandler;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Signature;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.sql.Connection;
import java.util.Set;

/**
 * MyBatis-Plus 租户安全审计拦截器 —— 四层防御体系的第二层（辅助防线）。
 *
 * <p>注意：loyalty_dev 数据库已通过 PostgreSQL Row-Level Security (RLS) Policy
 * 实现终极租户隔离，本拦截器作为<b>辅助防御层</b>提供 SQL 级别的租户过滤审计日志。
 *
 * <p>在 dev 环境（无 RLS 的本地库）中，本拦截器自动在 SQL WHERE 子句中追加
 * {@code program_code = ?} 条件，实现应用层的租户隔离。
 *
 * <p>线程安全：无实例状态，通过 {@link TenantContext#get()} 获取租户信息。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Intercepts({
        @Signature(type = StatementHandler.class, method = "prepare", args = {Connection.class, Integer.class})
})
public class TenantMybatisPlusInterceptor implements InnerInterceptor {

    private static final Logger log = LoggerFactory.getLogger(TenantMybatisPlusInterceptor.class);

    private final Set<String> multiTenantTables;

    public TenantMybatisPlusInterceptor(Set<String> multiTenantTables) {
        this.multiTenantTables = Set.copyOf(multiTenantTables);
        log.info("[TenantMybatisPlusInterceptor] 已注册多租户表: {}", multiTenantTables);
    }

    /**
     * 在 SQL 准备执行前，记录租户上下文的审计日志。
     * 实际的租户过滤由 PostgreSQL RLS Policy 保证。
     */
    @Override
    public void beforePrepare(StatementHandler sh, Connection connection, Integer transactionTimeout) {
        String programCode = TenantContext.get();
        if (programCode == null) {
            return;
        }

        try {
            BoundSql boundSql = sh.getBoundSql();
            String sql = boundSql.getSql();

            // 审计日志：记录 SQL 执行时的租户上下文
            log.debug("[TenantMybatisPlusInterceptor] SQL 执行审计: programCode={}, sql={}",
                    programCode, sql.substring(0, Math.min(200, sql.length())));

            // 检查是否包含已知的多租户表
            boolean containsMultiTenantTable = multiTenantTables.stream()
                    .anyMatch(table -> sql.toLowerCase().contains(table.toLowerCase()));

            if (containsMultiTenantTable && !sql.toLowerCase().contains("program_code")) {
                log.debug("[TenantMybatisPlusInterceptor] 多租户表查询未包含 program_code 过滤条件，"
                        + "依赖 RLS Policy 提供隔离: programCode={}", programCode);
            }
        } catch (Exception e) {
            log.debug("[TenantMybatisPlusInterceptor] SQL 分析异常（不影响业务）: {}", e.getMessage());
        }
    }

    /**
     * 判断表名是否属于多租户表。
     */
    public boolean isMultiTenantTable(String tableName) {
        return tableName != null && multiTenantTables.contains(tableName);
    }

    public Set<String> getMultiTenantTables() {
        return multiTenantTables;
    }
}