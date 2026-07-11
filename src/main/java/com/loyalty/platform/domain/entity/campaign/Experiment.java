package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;

@Entity
@Table(name = "campaign_experiment")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Experiment {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "plan_id", nullable = false, length = 64)
    private String planId;

    @Column(name = "workspace_id", nullable = false, length = 64)
    private String workspaceId;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    @Column(name = "name", nullable = false, length = 255)
    private String name;

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "status", length = 32)
    @Builder.Default
    private String status = "DRAFT";

    @Column(name = "traffic_allocation_pct", precision = 5, scale = 2)
    @Builder.Default
    private BigDecimal trafficAllocationPct = BigDecimal.valueOf(100);

    @Column(name = "total_sample_size")
    private Integer totalSampleSize;

    @Column(name = "objective_metric", nullable = false, length = 64)
    private String objectiveMetric;

    @Column(name = "objective_direction", length = 16)
    @Builder.Default
    private String objectiveDirection = "HIGHER";

    @Column(name = "minimum_detectable_effect", precision = 5, scale = 2)
    private BigDecimal minimumDetectableEffect;

    @Column(name = "statistical_significance", precision = 3, scale = 2)
    @Builder.Default
    private BigDecimal statisticalSignificance = BigDecimal.valueOf(0.95);

    @Column(name = "auto_promote_winner")
    @Builder.Default
    private boolean autoPromoteWinner = false;

    @Column(name = "auto_promote_delay_minutes")
    @Builder.Default
    private Integer autoPromoteDelayMinutes = 1440;

    @Column(name = "started_at")
    private Instant startedAt;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "winning_variant_id", length = 64)
    private String winningVariantId;

    @Column(name = "promoted")
    @Builder.Default
    private boolean promoted = false;

    @Column(name = "promoted_at")
    private Instant promotedAt;

    @Column(name = "created_by", length = 64)
    private String createdBy;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}
