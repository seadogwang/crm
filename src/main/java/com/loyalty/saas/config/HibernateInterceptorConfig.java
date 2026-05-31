package com.loyalty.saas.config;

import com.loyalty.saas.common.interceptor.TenantHibernateInterceptor;
import org.hibernate.cfg.AvailableSettings;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Set;

/**
 * Hibernate 拦截器配置。
 *
 * <p>负责将 {@link TenantHibernateInterceptor} 注册到 Hibernate 的
 * {@code StatementInspector} 中，实现 SQL 层面的租户过滤。
 *
 * <p>通过 {@link HibernatePropertiesCustomizer} 机制，将拦截器注入到
 * Hibernate 的 SessionFactory 配置中，无需直接操作 EntityManagerFactory。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Configuration
public class HibernateInterceptorConfig {

    private static final Logger log = LoggerFactory.getLogger(HibernateInterceptorConfig.class);

    /**
     * 多租户表名集合。
     * 注：loyalty_dev 数据库已通过 PostgreSQL RLS Policy 实现隔离，
     * 此列表用于 Hibernate SQL 拦截器的辅助防御。
     */
    private static final Set<String> MULTI_TENANT_TABLES = Set.of(
            "program", "member", "member_unique_key", "account_transaction",
            "redemption_allocation", "member_account", "channel_adapter_config",
            "event_inbox", "tier_change_log", "rule_snapshot",
            "transaction_event", "rule_definition", "member_tier", "tenant"
    );

    /**
     * 注册 Hibernate 租户 SQL 拦截器。
     *
     * <p>通过 {@link HibernatePropertiesCustomizer} 将拦截器注入到
     * {@code hibernate.session_factory.statement_inspector} 属性中。
     *
     * @return HibernatePropertiesCustomizer 实例
     */
    @Bean
    public HibernatePropertiesCustomizer tenantHibernatePropertiesCustomizer() {
        TenantHibernateInterceptor interceptor = new TenantHibernateInterceptor(MULTI_TENANT_TABLES);
        log.info("[HibernateInterceptorConfig] 租户 SQL 拦截器已配置，多租户表: {}", MULTI_TENANT_TABLES);
        return hibernateProperties ->
                hibernateProperties.put(AvailableSettings.STATEMENT_INSPECTOR, interceptor);
    }
}