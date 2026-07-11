package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;

@Entity
@Table(name = "campaign_experiment_assignment",
       uniqueConstraints = @UniqueConstraint(columnNames = {"experiment_id", "member_id"}))
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExperimentAssignment {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "experiment_id", nullable = false, length = 64)
    private String experimentId;

    @Column(name = "member_id", nullable = false, length = 64)
    private String memberId;

    @Column(name = "variant_id", nullable = false, length = 64)
    private String variantId;

    @Column(name = "bucket_key", length = 255)
    private String bucketKey;

    @Column(name = "assignment_time")
    @Builder.Default
    private Instant assignmentTime = Instant.now();

    @Column(name = "exposed")
    @Builder.Default
    private boolean exposed = false;

    @Column(name = "exposed_at")
    private Instant exposedAt;

    @Column(name = "converted")
    @Builder.Default
    private boolean converted = false;

    @Column(name = "converted_at")
    private Instant convertedAt;

    @Column(name = "conversion_value", precision = 18, scale = 4)
    private BigDecimal conversionValue;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}
