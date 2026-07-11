package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "program_schema",
        uniqueConstraints = {@UniqueConstraint(name = "program_schema_program_code_entity_type_key",
                columnNames = {"program_code", "entity_type"})})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ProgramSchema {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Column(name = "entity_type", nullable = false, length = 100)
    private String entityType;

    @Column(name = "entity_category", length = 20)
    @Builder.Default
    private String entityCategory = "BUSINESS";

    @Column(name = "version", length = 10)
    @Builder.Default
    private String version = "v1";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_schema", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> fieldSchema;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "api_config", columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> apiConfig = Map.of();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "entity_relations", columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> entityRelations = new java.util.HashMap<>();

    @Column(name = "description", columnDefinition = "text")
    private String description;

    @Column(name = "status", length = 20)
    @Builder.Default
    private String status = "DRAFT";

    @Column(name = "schema_code", length = 100)
    private String schemaCode;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "impact_report", columnDefinition = "jsonb")
    private Map<String, Object> impactReport;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "layout_position", columnDefinition = "jsonb")
    private Map<String, Object> layoutPosition;

    /** 映射的实体表名: member / transaction_event */
    @Column(name = "table_name", length = 64)
    private String tableName;

    /** 固定字段映射: {"memberId":"member_id","name":"name",...} */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "fixed_field_mapping", columnDefinition = "jsonb")
    private Map<String, Object> fixedFieldMapping;

    /** 扩展属性存储列名，默认 ext_attributes */
    @Column(name = "ext_column", length = 64)
    private String extColumn;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    /** 获取版本标签: schema_code:v{version} */
    public String getVersionTag() {
        // 兼容 "v2" 和 "2" 两种存储格式，统一输出 member:v2
        String raw = version;
        String num;
        if (raw == null || raw.isEmpty()) {
            num = "0";
        } else if (raw.startsWith("v") || raw.startsWith("V")) {
            num = raw.substring(1);
        } else {
            num = raw;
        }
        String prefix = schemaCode != null ? schemaCode :
                        (entityType != null ? entityType.toLowerCase() : "unknown");
        return prefix + ":v" + num;
    }
}