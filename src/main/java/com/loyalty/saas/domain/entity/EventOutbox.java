package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * 事件发件箱 — 保证领域事件至少投递一次。
 *
 * <p>与 notification_outbox（通知外送箱）不同，event_outbox 用于
 * 核心领域事件的可靠性投递。在写入业务数据的同时，将事件写入此表，
 * 再由异步 Worker 投递到 EventBridge（Kafka/LocalEventBus）。
 */
@Entity
@Table(name = "event_outbox")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class EventOutbox {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    /** 聚合根类型 */
    @Column(name = "aggregate_type", nullable = false, length = 50)
    private String aggregateType;

    /** 聚合根 ID */
    @Column(name = "aggregate_id", nullable = false, length = 100)
    private String aggregateId;

    /** 事件类型 */
    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    /** 事件负载 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> payload;

    /** 投递状态: PENDING / SENT / FAILED */
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "retry_count")
    @Builder.Default
    private Integer retryCount = 0;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "sent_at")
    private LocalDateTime sentAt;
}