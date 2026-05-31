package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "tier_change_log")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class TierChangeLog {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "from_tier", length = 50)
    private String fromTier;

    @Column(name = "to_tier", length = 50)
    private String toTier;

    /** 变更原因: ORDER_ACCRUAL / REFUND_REVERSAL / CASCADE_RECALC / SCHEDULED_EVALUATION / MERGE / MANUAL_ADJUSTMENT */
    @Column(name = "change_reason", length = 200)
    private String changeReason;

    /** 关联事件 ID */
    @Column(name = "event_id", length = 100)
    private String eventId;

    @Column(name = "changed_at", updatable = false)
    @Builder.Default
    private LocalDateTime changedAt = LocalDateTime.now();
}