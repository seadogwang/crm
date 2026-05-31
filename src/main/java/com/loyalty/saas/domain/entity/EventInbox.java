package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "event_inbox")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class EventInbox {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    /** 来源渠道 */
    @Column(name = "source_channel", nullable = false, length = 50)
    private String sourceChannel;

    /** 外部事件 ID */
    @Column(name = "source_event_id", length = 200)
    private String sourceEventId;

    /** 幂等键 */
    @Column(name = "idempotency_key", nullable = false, length = 300)
    private String idempotencyKey;

    /** 负载哈希 (SHA-256) */
    @Column(name = "payload_hash", nullable = false, length = 128)
    private String payloadHash;

    /** 事件负载 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> payload;

    /** 签名是否已验证 */
    @Column(name = "signature_verified")
    @Builder.Default
    private Boolean signatureVerified = false;

    /** 签名详情 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "signature_detail", columnDefinition = "jsonb")
    private Map<String, Object> signatureDetail;

    /** 状态: RECEIVED / VALIDATED / PROCESSING / WAITING_DEPENDENCY / SUCCEEDED / FAILED / DEAD_LETTER */
    @Column(name = "status", nullable = false, length = 30)
    @Builder.Default
    private String status = "RECEIVED";

    /** 重试次数 */
    @Column(name = "retry_count")
    @Builder.Default
    private Integer retryCount = 0;

    /** 错误信息 */
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    /** 链路追踪 ID */
    @Column(name = "trace_id", length = 100)
    private String traceId;

    @Column(name = "first_seen_at", updatable = false)
    @Builder.Default
    private LocalDateTime firstSeenAt = LocalDateTime.now();

    @Column(name = "processed_at")
    private LocalDateTime processedAt;

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}