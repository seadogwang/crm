package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.time.LocalDateTime;

/**
 * 事件触发日志 — 记录每次事件触发的结果，用于审计和去重辅助。
 */
@Entity
@Table(name = "campaign_event_trigger_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CampaignEventTriggerLog {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "plan_id", nullable = false, length = 64)
    private String planId;

    @Column(name = "trigger_id", nullable = false, length = 64)
    private String triggerId;

    // ===== 事件信息 =====

    /** 原始事件ID */
    @Column(name = "event_id", length = 128)
    private String eventId;

    @Column(name = "event_type", length = 128)
    private String eventType;

    @Column(name = "member_id", length = 64)
    private String memberId;

    // ===== 触发结果 =====

    @Column(name = "triggered")
    @Builder.Default
    private Boolean triggered = false;

    /** DUPLICATE / FILTER_NOT_MATCH / DISABLED / OUT_OF_WINDOW */
    @Column(name = "skip_reason", length = 64)
    private String skipReason;

    /** Zeebe 流程实例 Key */
    @Column(name = "process_instance_key")
    private Long processInstanceKey;

    // ===== 去重指纹 =====

    @Column(name = "dedup_key", length = 255)
    private String dedupKey;

    // ===== 时间 =====

    @Column(name = "event_time")
    private Instant eventTime;

    @Column(name = "trigger_time")
    @Builder.Default
    private Instant triggerTime = Instant.now();

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
