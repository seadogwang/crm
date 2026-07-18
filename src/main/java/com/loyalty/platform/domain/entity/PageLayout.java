package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 页面布局配置实体 — 对应 program_page_layout 表。
 * 支持会员详情页/编辑页/列表页的拖拽式可视化布局设计。
 *
 * @see Loyalty_member_page_config.md §3.1
 */
@Entity
@Table(name = "program_page_layout",
        uniqueConstraints = {@UniqueConstraint(name = "program_page_layout_program_code_entity_type_page_key",
                columnNames = {"program_code", "entity_type", "page_type", "version"})})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PageLayout {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    @Column(name = "entity_type", nullable = false, length = 32)
    private String entityType;

    @Column(name = "page_type", nullable = false, length = 20)
    private String pageType;

    /** 完整的布局配置 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "layout_config", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> layoutConfig;

    /** 字段级覆盖配置 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_config", columnDefinition = "jsonb")
    private Map<String, Object> fieldConfig;

    @Column(name = "version")
    @Builder.Default
    private Integer version = 1;

    @Column(name = "schema_version", length = 16)
    private String schemaVersion;

    @Column(name = "status", length = 20)
    @Builder.Default
    private String status = "DRAFT";

    @Column(name = "created_by", length = 64)
    private String createdBy;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_by", length = 64)
    private String updatedBy;

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

}