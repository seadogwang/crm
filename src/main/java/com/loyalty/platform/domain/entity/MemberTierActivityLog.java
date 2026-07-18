package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;
import java.util.Map;

@Entity @Table(name = "member_tier_activity_log")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MemberTierActivityLog {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    @Column(name = "member_id", nullable = false, length = 64)
    private String memberId;

    @Column(name = "activity_code", nullable = false, length = 64)
    private String activityCode;

    @Column(name = "original_tier", length = 32)
    private String originalTier;

    @Column(name = "target_tier", nullable = false, length = 32)
    private String targetTier;

    @Column(name = "trigger_event_id", length = 64)
    private String triggerEventId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "trigger_value", columnDefinition = "jsonb")
    private Map<String, Object> triggerValue;

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