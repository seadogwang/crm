package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/**
 * 租户 (Tenant) 实体 — 匹配 loyalty_dev 数据库实际 schema。
 *
 * <p>Tenant 是企业实体，一个 Tenant 下可以有多个 Program。
 * 多租户隔离通过 PostgreSQL RLS Policy 实现。
 */
@Entity
@Table(name = "tenant")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Tenant {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "name", nullable = false, length = 200)
    private String name;

    /** 状态: TRIAL / ACTIVE / SUSPENDED / TERMINATED */
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "TRIAL";

    @Column(name = "plan_type", length = 50)
    private String planType;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}