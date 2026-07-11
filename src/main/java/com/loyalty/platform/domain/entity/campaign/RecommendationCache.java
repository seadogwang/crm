package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;
import java.time.LocalDateTime;

@Entity @Table(name = "campaign_recommendation_cache")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RecommendationCache {
    @Id @Column(name = "id", nullable = false, length = 64) private String id;
    @Column(name = "member_id", nullable = false, length = 64) private String memberId;
    @Column(name = "strategy_id", nullable = false, length = 64) private String strategyId;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "recommendation_result", nullable = false, columnDefinition = "jsonb") private String recommendationResult;
    @Column(name = "cache_key", length = 255) private String cacheKey;
    @Column(name = "expires_at", nullable = false) private Instant expiresAt;
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
