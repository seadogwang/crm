package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 核心租户计划表 (Program) 实体 — 匹配 loyalty_dev 数据库实际 schema。
 *
 * <p>主键为 {@code code} (varchar)，作为 program_code 的唯一标识。
 * 通过 {@code tenant_id} 外键关联到 {@link Tenant} 表。
 * 多租户隔离依赖 PostgreSQL Row-Level Security (RLS) Policy。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Entity
@Table(name = "program")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Program {

    /** 计划唯一代码（主键），如 "PROG001"、"CLUB-SH001" */
    @Id
    @Column(name = "code", nullable = false, length = 100)
    private String code;

    /** 多租户代码（与 code 同值），兼容 TenantHibernateInterceptor */
    @Column(name = "program_code", length = 100)
    private String programCode;

    /** 归属租户 ID */
    @Column(name = "tenant_id", nullable = false)
    private Long tenantId;

    /** 计划名称 */
    @Column(name = "name", nullable = false, length = 200)
    private String name;

    /** 时区，默认 Asia/Shanghai */
    @Column(name = "timezone", length = 50)
    @Builder.Default
    private String timezone = "Asia/Shanghai";

    /** 货币，默认 CNY */
    @Column(name = "currency", length = 10)
    @Builder.Default
    private String currency = "CNY";

    /** 计划完整配置 JSON（等级阶梯、逆向策略、积分类型字典等） */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "config_json", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> configJson = new LinkedHashMap<>();

    /** 计划状态: DRAFT / ACTIVE / PAUSED / ARCHIVED */
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "DRAFT";

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "updated_by")
    private Long updatedBy;

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

}