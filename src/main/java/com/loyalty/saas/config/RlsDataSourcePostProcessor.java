package com.loyalty.saas.config;

import com.loyalty.saas.common.context.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;

/**
 * PostgreSQL Row-Level Security (RLS) 上下文自动注入。
 *
 * <p>通过 {@link BeanPostProcessor} 装饰 Spring 容器中的 {@link DataSource}，
 * 在每次从连接池获取连接时，自动执行 {@code SET app.current_program_code = 'XXX'}，
 * 使 PostgreSQL RLS Policy 能够正确过滤租户数据。
 *
 * <p>该机制是 loyalty_dev 数据库多租户隔离的核心——所有表均配置了
 * PostgreSQL RLS Policy，要求 {@code current_setting('app.current_program_code')}
 * 与行的 program_code 匹配。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
public class RlsDataSourcePostProcessor implements BeanPostProcessor {

    private static final Logger log = LoggerFactory.getLogger(RlsDataSourcePostProcessor.class);

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) throws org.springframework.beans.BeansException {
        if (bean instanceof DataSource ds) {
            log.info("[RLS] 已检测到 DataSource bean '{}'，将包装 RLS 上下文注入", beanName);
            return new RlsAwareDataSource(ds);
        }
        return bean;
    }

    /**
     * 支持 RLS 的 DataSource 装饰器。
     * 每次 getConnection() 时自动执行 SET app.current_program_code。
     */
    static class RlsAwareDataSource implements DataSource {

        private final DataSource delegate;

        RlsAwareDataSource(DataSource delegate) {
            this.delegate = delegate;
        }

        @Override
        public Connection getConnection() throws SQLException {
            Connection conn = delegate.getConnection();
            applyRlsContext(conn);
            return conn;
        }

        @Override
        public Connection getConnection(String username, String password) throws SQLException {
            Connection conn = delegate.getConnection(username, password);
            applyRlsContext(conn);
            return conn;
        }

        private void applyRlsContext(Connection conn) {
            String programCode = TenantContext.get();
            if (programCode != null) {
                try (Statement stmt = conn.createStatement()) {
                    stmt.execute("SET app.current_program_code = '"
                            + programCode.replace("'", "''") + "'");
                } catch (SQLException e) {
                    log.error("[RLS] 设置 app.current_program_code 失败: {}", programCode, e);
                }
            }
        }

        // 委派方法
        @Override public <T> T unwrap(Class<T> iface) throws SQLException { return delegate.unwrap(iface); }
        @Override public boolean isWrapperFor(Class<?> iface) throws SQLException { return delegate.isWrapperFor(iface); }
        @Override public java.io.PrintWriter getLogWriter() throws SQLException { return delegate.getLogWriter(); }
        @Override public void setLogWriter(java.io.PrintWriter out) throws SQLException { delegate.setLogWriter(out); }
        @Override public void setLoginTimeout(int seconds) throws SQLException { delegate.setLoginTimeout(seconds); }
        @Override public int getLoginTimeout() throws SQLException { return delegate.getLoginTimeout(); }
        @Override public java.util.logging.Logger getParentLogger() {
            try { return delegate.getParentLogger(); } catch (java.sql.SQLFeatureNotSupportedException e) { return null; }
        }
    }
}