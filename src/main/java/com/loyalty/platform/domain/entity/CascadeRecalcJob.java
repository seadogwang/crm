package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "cascade_recalc_job")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CascadeRecalcJob {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Column(name = "job_id", nullable = false, length = 100)
    private String jobId;

    @Column(name = "async_job_id")
    private Long asyncJobId;

    @Column(name = "reverse_event_id", nullable = false, length = 100)
    private String reverseEventId;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    /** PENDING / RUNNING / SUCCEEDED / FAILED */
    @Column(name = "status", nullable = false, length = 30)
    @Builder.Default
    private String status = "PENDING";

    /** 影子回放的时间轴游标（回放到哪个时间点了） */
    @Column(name = "cursor_event_time")
    private LocalDateTime cursorEventTime;

    @Column(name = "affected_count")
    @Builder.Default
    private Integer affectedCount = 0;

    @Column(name = "compensation_status", length = 30)
    private String compensationStatus;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    @Column(name = "started_at")
    private LocalDateTime startedAt;

    @Column(name = "finished_at")
    private LocalDateTime finishedAt;

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