package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Map;

/**
 * 事件触发器配置 — 定义事件与 Campaign 的绑定关系。
 *
 * <p>每个事件驱动的 Campaign 可配置一个或多个触发器，
 * 当匹配的事件到达时自动启动 Zeebe 流程实例。
 */
@Entity
@Table(name = "campaign_event_trigger")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CampaignEventTrigger {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "plan_id", nullable = false, length = 64)
    private String planId;

    @Column(name = "workspace_id", nullable = false, length = 64)
    private String workspaceId;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    // ===== 事件定义 =====

    /** ORDER_CREATED, CART_ABANDONED, TIER_CHANGED, LOGIN_7_DAYS ... */
    @Column(name = "event_type", nullable = false, length = 128)
    private String eventType;

    /** loyalty_event / kafka_topic / custom_webhook */
    @Column(name = "event_source", length = 64)
    @Builder.Default
    private String eventSource = "loyalty_event";

    /** Kafka Topic 名称 */
    @Column(name = "event_topic", length = 128)
    private String eventTopic;

    // ===== 事件过滤 =====

    /** JSON: {"field":"order_amount","operator":"gt","value":100} */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "event_filter", columnDefinition = "jsonb")
    private String eventFilter;

    // ===== 去重与防抖 =====

    @Column(name = "dedup_window_minutes")
    @Builder.Default
    private Integer dedupWindowMinutes = 60;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "dedup_key_fields", columnDefinition = "jsonb")
    @Builder.Default
    private String dedupKeyFields = "[\"member_id\",\"event_type\"]";

    // ===== Webhook 配置 =====

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "webhook_config", columnDefinition = "jsonb")
    private String webhookConfig;

    // ===== 触发控制 =====

    @Column(name = "enabled")
    @Builder.Default
    private Boolean enabled = true;

    @Column(name = "start_time")
    private Instant startTime;

    @Column(name = "end_time")
    private Instant endTime;

    // ===== 元数据 =====

    @Column(name = "created_by", length = 64)
    private String createdBy;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}
