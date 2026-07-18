package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;
import java.util.Map;

@Entity @Table(name = "tier_activity")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class TierActivity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    @Column(name = "activity_code", nullable = false, length = 64)
    private String activityCode;

    @Column(name = "activity_name", nullable = false, length = 200)
    private String activityName;

    @Column(name = "target_tier_code", nullable = false, length = 32)
    private String targetTierCode;

    @Column(name = "trigger_type", nullable = false, length = 30)
    private String triggerType; // EVENT / MANUAL / PAYMENT / TASK

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "trigger_config", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> triggerConfig;

    @Column(name = "valid_start_time", nullable = false)
    private LocalDateTime validStartTime;

    @Column(name = "valid_end_time")
    private LocalDateTime validEndTime;

    @Column(name = "once_per_member")
    @Builder.Default
    private Boolean oncePerMember = true;

    @Column(name = "member_scope", length = 20)
    @Builder.Default
    private String memberScope = "ALL";

    @Column(name = "status", length = 20)
    @Builder.Default
    private String status = "DRAFT";

    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

}