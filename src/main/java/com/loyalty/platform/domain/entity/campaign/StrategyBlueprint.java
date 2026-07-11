package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;

@Entity @Table(name = "campaign_strategy_blueprint")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class StrategyBlueprint {
    @Id @Column(name = "id", length = 64) private String id;
    @Column(name = "blueprint_name", length = 255) private String blueprintName;
    @Column(name = "industry_type", length = 64) private String industryType;
    @Column(name = "description", columnDefinition = "TEXT") private String description;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "formula_json", columnDefinition = "jsonb") private String formulaJson;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "levers_json", columnDefinition = "jsonb") private String leversJson;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "initiative_mapping_json", columnDefinition = "jsonb") private String initiativeMappingJson;
    @Builder.Default @Column(name = "version") private Integer version = 1;
    @Builder.Default @Column(name = "is_active") private boolean isActive = true;
    @Builder.Default @Column(name = "is_system_default") private boolean isSystemDefault = false;
    @Column(name = "fallback_mode", length = 32) @Builder.Default private String fallbackMode = "CORRELATION";
    @Column(name = "created_by", length = 64) private String createdBy;
    @Builder.Default @Column(name = "created_at", updatable = false) private LocalDateTime createdAt = LocalDateTime.now();
    @Builder.Default @Column(name = "updated_at") private LocalDateTime updatedAt = LocalDateTime.now();
}
