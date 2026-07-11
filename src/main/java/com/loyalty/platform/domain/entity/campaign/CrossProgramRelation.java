package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;

@Entity @Table(name = "campaign_cross_program_relation")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CrossProgramRelation {
    @Id @Column(name = "id", nullable = false, length = 64) private String id;
    @Column(name = "plan_id", nullable = false, length = 64) private String planId;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "role", length = 32) @Builder.Default private String role = "PARTICIPANT";
    @Column(name = "can_edit") @Builder.Default private boolean canEdit = false;
    @Column(name = "can_trigger") @Builder.Default private boolean canTrigger = true;
    @Column(name = "can_view_results") @Builder.Default private boolean canViewResults = true;
    @Column(name = "budget_allocation", precision = 18, scale = 4) private BigDecimal budgetAllocation;
    @Column(name = "budget_currency", length = 8) @Builder.Default private String budgetCurrency = "CNY";
    @Column(name = "joined_at") @Builder.Default private Instant joinedAt = Instant.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
