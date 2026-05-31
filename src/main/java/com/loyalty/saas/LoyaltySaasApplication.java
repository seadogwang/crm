package com.loyalty.saas;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.scheduling.annotation.EnableAsync;

/**
 * 金融级全渠道忠诚度管理 SaaS 平台 —— 启动入口。
 *
 * <p>本平台基于 Spring Boot 3 + Java 17 构建，采用多租户强隔离架构。
 * 核心特性：
 * <ul>
 *   <li><b>四层防御体系</b>：入口过滤 → ORM 拦截 → 中间件沙箱 → 查询哨兵</li>
 *   <li><b>轻量化事件总线</b>：dev 环境使用内存队列模拟 Kafka 分区有序消费</li>
 *   <li><b>动态实体模型</b>：核心字段 + JSONB 扩展属性双轨模型</li>
 *   <li><b>金融级账务</b>：FIFO 核销、瀑布流冲抵、级联重算</li>
 * </ul>
 *
 * <p><b>启动要求</b>：
 * <ul>
 *   <li>Java 17+</li>
 *   <li>PostgreSQL 15+</li>
 *   <li>Redis 6.x+</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@SpringBootApplication(exclude = {
        org.redisson.spring.starter.RedissonAutoConfigurationV2.class,
        org.springframework.boot.autoconfigure.data.redis.RedisAutoConfiguration.class
})
@EnableAsync
@ConfigurationPropertiesScan
public class LoyaltySaasApplication {

    public static void main(String[] args) {
        SpringApplication.run(LoyaltySaasApplication.class, args);
    }
}