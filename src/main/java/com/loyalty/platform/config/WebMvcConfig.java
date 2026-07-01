package com.loyalty.platform.config;

import com.loyalty.platform.common.interceptor.TermsInterceptor;
import com.loyalty.platform.security.MultiTenantRbacInterceptor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC 配置 — 注册 RBAC 拦截器和条款同意拦截器。
 *
 * <p>独立于 CorsConfig，确保拦截器正确注册到 Spring MVC 拦截器链。
 */
@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebMvcConfig.class);

    private final MultiTenantRbacInterceptor rbacInterceptor;
    private final TermsInterceptor termsInterceptor;

    public WebMvcConfig(MultiTenantRbacInterceptor rbacInterceptor,
                        TermsInterceptor termsInterceptor) {
        this.rbacInterceptor = rbacInterceptor;
        this.termsInterceptor = termsInterceptor;
        log.info("[WebMvcConfig] RBAC 拦截器已注入: {}", rbacInterceptor.getClass().getName());
        log.info("[WebMvcConfig] Terms 拦截器已注入: {}", termsInterceptor.getClass().getName());
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        log.info("[WebMvcConfig] 注册 RBAC 拦截器到拦截器链...");
        registry.addInterceptor(rbacInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/auth/login",
                        "/api/open/**",
                        "/actuator/**",
                        "/error"
                );
        log.info("[WebMvcConfig] RBAC 拦截器注册完成");

        // Terms 拦截器在 RBAC 之后执行，依赖 SecurityContext
        log.info("[WebMvcConfig] 注册 Terms 拦截器到拦截器链...");
        registry.addInterceptor(termsInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns(
                        "/api/auth/login",
                        "/api/open/**",
                        "/api/campaign/terms/**",
                        "/actuator/**",
                        "/error"
                );
        log.info("[WebMvcConfig] Terms 拦截器注册完成");
    }
}
