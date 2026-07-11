package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;

@Entity @Table(name = "campaign_recommendation_strategy")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RecommendationStrategy {
    @Id @Column(name = "id", nullable = false, length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "strategy_name", nullable = false, length = 255) private String strategyName;
    @Column(name = "strategy_type", nullable = false, length = 64) private String strategyType;
    @Column(name = "description", columnDefinition = "TEXT") private String description;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "recommendation_config", nullable = false, columnDefinition = "jsonb") private String recommendationConfig;
    @Column(name = "fallback_strategy_id", length = 64) private String fallbackStrategyId;
    @Column(name = "fallback_content", columnDefinition = "TEXT") private String fallbackContent;
    @Column(name = "cache_ttl_seconds") @Builder.Default private Integer cacheTtlSeconds = 3600;
    @Column(name = "enabled") @Builder.Default private boolean enabled = true;
    @Column(name = "is_default") @Builder.Default private boolean isDefault = false;
    @Column(name = "created_by", length = 64) private String createdBy;
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
