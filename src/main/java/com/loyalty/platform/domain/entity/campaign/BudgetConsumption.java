package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;

@Entity
@Table(name = "campaign_budget_consumption")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BudgetConsumption {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "plan_id", nullable = false, length = 64)
    private String planId;

    @Column(name = "node_id", length = 64)
    private String nodeId;

    @Column(name = "member_id", length = 64)
    private String memberId;

    @Column(name = "amount", nullable = false, precision = 18, scale = 4)
    private BigDecimal amount;

    @Column(name = "unit_cost", precision = 18, scale = 4)
    private BigDecimal unitCost;

    @Column(name = "quantity")
    private Integer quantity;

    @Column(name = "consumption_type", nullable = false, length = 32)
    private String consumptionType;

    @Column(name = "channel", length = 32)
    private String channel;

    @Column(name = "total_consumed_before", precision = 18, scale = 4)
    private BigDecimal totalConsumedBefore;

    @Column(name = "total_consumed_after", precision = 18, scale = 4)
    private BigDecimal totalConsumedAfter;

    @Column(name = "today_consumed_before", precision = 18, scale = 4)
    private BigDecimal todayConsumedBefore;

    @Column(name = "today_consumed_after", precision = 18, scale = 4)
    private BigDecimal todayConsumedAfter;

    @Column(name = "consumed_at")
    @Builder.Default
    private Instant consumedAt = Instant.now();

    @Column(name = "process_instance_key")
    private Long processInstanceKey;

    @Column(name = "job_key")
    private Long jobKey;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
