package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "campaign_experiment_variant")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExperimentVariant {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "experiment_id", nullable = false, length = 64)
    private String experimentId;

    @Column(name = "variant_name", nullable = false, length = 64)
    private String variantName;

    @Column(name = "variant_code", nullable = false, length = 16)
    private String variantCode;

    @Column(name = "traffic_percentage", nullable = false, precision = 5, scale = 2)
    private BigDecimal trafficPercentage;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "node_overrides", columnDefinition = "jsonb")
    private String nodeOverrides;

    @Column(name = "subgraph_node_id", length = 64)
    private String subgraphNodeId;

    @Column(name = "exposure_count")
    @Builder.Default
    private Integer exposureCount = 0;

    @Column(name = "event_count")
    @Builder.Default
    private Integer eventCount = 0;

    @Column(name = "metric_value", precision = 18, scale = 4)
    private BigDecimal metricValue;

    @Column(name = "total_revenue", precision = 18, scale = 4)
    @Builder.Default
    private BigDecimal totalRevenue = BigDecimal.ZERO;

    @Column(name = "p_value", precision = 10, scale = 6)
    private BigDecimal pValue;

    @Column(name = "relative_improvement", precision = 10, scale = 4)
    private BigDecimal relativeImprovement;

    @Column(name = "confidence_interval", length = 32)
    private String confidenceInterval;

    @Column(name = "is_winner")
    @Builder.Default
    private boolean isWinner = false;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}
