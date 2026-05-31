package com.loyalty.saas.config;

import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.loyalty.saas.common.interceptor.TenantMybatisPlusInterceptor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Set;

@Configuration
public class MybatisPlusConfig {

    private static final Logger log = LoggerFactory.getLogger(MybatisPlusConfig.class);

    private static final Set<String> MULTI_TENANT_TABLES = Set.of(
            "program", "member", "member_unique_key", "account_transaction",
            "redemption_allocation", "member_account", "channel_adapter_config",
            "event_inbox", "tier_change_log", "rule_snapshot",
            "transaction_event", "rule_definition", "member_tier", "tenant"
    );

    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();
        TenantMybatisPlusInterceptor tenantInterceptor =
                new TenantMybatisPlusInterceptor(MULTI_TENANT_TABLES);
        interceptor.addInnerInterceptor(tenantInterceptor);
        log.info("[MybatisPlusConfig] Tenant SQL interceptor registered, tables: {}", MULTI_TENANT_TABLES);
        return interceptor;
    }
}