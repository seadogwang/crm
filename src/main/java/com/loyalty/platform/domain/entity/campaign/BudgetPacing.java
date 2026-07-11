package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "campaign_budget_pacing")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BudgetPacing {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "plan_id", nullable = false, unique = true, length = 64)
    private String planId;

    @Column(name = "workspace_id", nullable = false, length = 64)
    private String workspaceId;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    @Column(name = "total_budget", nullable = false, precision = 18, scale = 4)
    private BigDecimal totalBudget;

    @Column(name = "total_budget_currency", length = 8)
    @Builder.Default
    private String totalBudgetCurrency = "CNY";

    @Column(name = "pacing_mode", nullable = false, length = 32)
    @Builder.Default
    private String pacingMode = "EVEN";

    @Column(name = "daily_cap_enabled")
    @Builder.Default
    private boolean dailyCapEnabled = true;

    @Column(name = "daily_cap_amount", precision = 18, scale = 4)
    private BigDecimal dailyCapAmount;

    @Column(name = "daily_cap_type", length = 32)
    @Builder.Default
    private String dailyCapType = "HARD";

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "dynamic_pacing_config", columnDefinition = "jsonb")
    private String dynamicPacingConfig;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "alert_thresholds", columnDefinition = "jsonb")
    @Builder.Default
    private String alertThresholds = "{\"warn\": 0.8, \"critical\": 0.95, \"stop\": 1.0}";

    @Column(name = "total_consumed", precision = 18, scale = 4)
    @Builder.Default
    private BigDecimal totalConsumed = BigDecimal.ZERO;

    @Column(name = "today_consumed", precision = 18, scale = 4)
    @Builder.Default
    private BigDecimal todayConsumed = BigDecimal.ZERO;

    @Column(name = "yesterday_consumed", precision = 18, scale = 4)
    @Builder.Default
    private BigDecimal yesterdayConsumed = BigDecimal.ZERO;

    @Column(name = "last_reset_date")
    private LocalDate lastResetDate;

    @Column(name = "is_paused_by_budget")
    @Builder.Default
    private boolean pausedByBudget = false;

    @Column(name = "paused_at")
    private Instant pausedAt;

    @Column(name = "created_by", length = 64)
    private String createdBy;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}
