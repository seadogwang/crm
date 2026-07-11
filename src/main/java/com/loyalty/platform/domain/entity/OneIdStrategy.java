package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "one_id_strategy",
        uniqueConstraints = {@UniqueConstraint(name = "one_id_strategy_code_unique",
                columnNames = {"program_code", "strategy_code"})})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class OneIdStrategy {
    @Id @Column(name = "id", length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "strategy_code", nullable = false, length = 64) private String strategyCode;
    @Column(name = "strategy_name", nullable = false, length = 128) private String strategyName;
    @Column(name = "priority_fields", nullable = false, columnDefinition = "jsonb")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private Map<String, Object> priorityFields;
    @Column(name = "matching_rules", columnDefinition = "jsonb")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private Map<String, Object> matchingRules;
    @Column(name = "status", length = 20) @Builder.Default private String status = "ACTIVE";
    @Column(name = "is_default") @Builder.Default private Boolean isDefault = false;
    @Column(name = "description", columnDefinition = "text") private String description;
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}