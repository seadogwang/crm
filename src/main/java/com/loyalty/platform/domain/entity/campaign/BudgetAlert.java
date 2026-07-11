package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;

@Entity
@Table(name = "campaign_budget_alert")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BudgetAlert {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "plan_id", nullable = false, length = 64)
    private String planId;

    @Column(name = "alert_type", nullable = false, length = 32)
    private String alertType;

    @Column(name = "alert_message", columnDefinition = "TEXT")
    private String alertMessage;

    @Column(name = "threshold", precision = 5, scale = 2)
    private BigDecimal threshold;

    @Column(name = "current_consumption", precision = 18, scale = 4)
    private BigDecimal currentConsumption;

    @Column(name = "total_budget", precision = 18, scale = 4)
    private BigDecimal totalBudget;

    @Column(name = "status", length = 32)
    @Builder.Default
    private String status = "ACTIVE";

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "resolved_by", length = 64)
    private String resolvedBy;

    @Column(name = "triggered_at")
    @Builder.Default
    private Instant triggeredAt = Instant.now();

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
