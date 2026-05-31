package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 交易事件实体 — 匹配 loyalty_dev 数据库实际 schema。
 *
 * <p>记录所有外部渠道推送的交易事件（订单、退款、入会等），
 * 是规则引擎的事实输入源。event_id 为业务主键（非自增）。
 */
@Entity
@Table(name = "transaction_event")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class TransactionEvent {

    /** 业务事件 ID（主键，非自增） */
    @Id
    @Column(name = "event_id", nullable = false, length = 100)
    private String eventId;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Column(name = "member_id")
    private Long memberId;

    /** 事件类型: ORDER_PAID / SIGN_IN / ENROLLMENT / ORDER_REFUND_FULL / ORDER_REFUND_PARTIAL / REDEMPTION / REDEMPTION_CANCEL / ADJUSTMENT / MERGE / TIER_CHANGE */
    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    @Column(name = "event_time", nullable = false)
    private LocalDateTime eventTime;

    /** 渠道: TMALL / JD / DOUYIN / WECHAT_MINI */
    @Column(name = "channel", length = 50)
    private String channel;

    /** 外部事件 ID */
    @Column(name = "source_event_id", length = 200)
    private String sourceEventId;

    /** 幂等键 */
    @Column(name = "idempotency_key", length = 300)
    private String idempotencyKey;

    /** 关联事件 ID（退款关联原订单） */
    @Column(name = "related_event_id", length = 100)
    private String relatedEventId;

    /** Schema 版本 */
    @Column(name = "schema_version")
    private Integer schemaVersion;

    /** 规则快照版本 */
    @Column(name = "rule_snapshot_version", length = 100)
    private String ruleSnapshotVersion;

    /** 处理状态: RECEIVED / VALIDATED / PROCESSING / WAITING_DEPENDENCY / SUCCEEDED / FAILED / DEAD_LETTER */
    @Column(name = "processing_status", nullable = false, length = 30)
    @Builder.Default
    private String processingStatus = "RECEIVED";

    /** 链路追踪 ID */
    @Column(name = "trace_id", length = 100)
    private String traceId;

    /** 错误信息 */
    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    /** 扩展属性 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ext_attributes", columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> extAttributes = new LinkedHashMap<>();

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}