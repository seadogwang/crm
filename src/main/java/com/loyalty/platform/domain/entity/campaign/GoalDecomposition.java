package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity @Table(name = "campaign_goal_decomposition")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GoalDecomposition {
    @Id @Column(name = "id", length = 64) private String id;
    @Column(name = "goal_id", length = 64) private String goalId;
    @Column(name = "blueprint_id", length = 64) private String blueprintId;
    @Column(name = "workspace_id", length = 64) private String workspaceId;
    @Column(name = "target_value", precision = 18, scale = 4) private BigDecimal targetValue;
    @Column(name = "baseline_value", precision = 18, scale = 4) private BigDecimal baselineValue;
    @Column(name = "total_gap", precision = 18, scale = 4) private BigDecimal totalGap;
    @Column(name = "decomposition_mode", length = 32) private String decompositionMode;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "lever_gaps", columnDefinition = "jsonb") private String leverGaps;
    @JdbcTypeCode(SqlTypes.JSON) @Column(name = "initiative_suggestions", columnDefinition = "jsonb") private String initiativeSuggestions;
    @Column(name = "adopted_plan_id", length = 64) private String adoptedPlanId;
    @Column(name = "created_by", length = 64) private String createdBy;
    @Builder.Default @Column(name = "created_at", updatable = false) private LocalDateTime createdAt = LocalDateTime.now();
    @Builder.Default @Column(name = "updated_at") private LocalDateTime updatedAt = LocalDateTime.now();
}
