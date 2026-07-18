package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "cascade_recalc_log")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CascadeRecalcLog {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Column(name = "reverse_event_id", nullable = false, length = 100)
    private String reverseEventId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "affected_event_id", length = 100)
    private String affectedEventId;

    @Column(name = "original_points", precision = 20, scale = 2)
    private BigDecimal originalPoints;

    @Column(name = "recalculated_points", precision = 20, scale = 2)
    private BigDecimal recalculatedPoints;

    @Column(name = "points_diff", precision = 20, scale = 2)
    private BigDecimal pointsDiff;

    @Column(name = "original_tier", length = 50)
    private String originalTier;

    @Column(name = "recalculated_tier", length = 50)
    private String recalculatedTier;

    @Column(name = "recalc_order")
    private Integer recalcOrder;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}