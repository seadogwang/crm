package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "notification_outbox")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class NotificationOutbox {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Column(name = "member_id")
    private Long memberId;

    /** 触发的事件类型: TIER_CHANGE, POINTS_ACCRUED, POINTS_EXPIRED, REDEMPTION_COMPLETE */
    @Column(name = "event_type", nullable = false, length = 50)
    private String eventType;

    /** 触达渠道: SMS, WECHAT_TEMPLATE, APP_PUSH, EMAIL */
    @Column(name = "channel", nullable = false, length = 20)
    private String channel;

    /** 接收方: 手机号/OpenID/DeviceToken */
    @Column(name = "recipient", nullable = false, length = 200)
    private String recipient;

    /** 模板编码 */
    @Column(name = "template_code", length = 100)
    private String templateCode;

    /** 模板参数 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "payload", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> payload = Map.of();

    /** PENDING / SENDING / SENT / RETRY / FAILED / DEAD */
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "retry_count")
    @Builder.Default
    private Integer retryCount = 0;

    @Column(name = "max_retry")
    @Builder.Default
    private Integer maxRetry = 3;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;

    /** 分布式锁持有者（worker ID） */
    @Column(name = "locked_by", length = 100)
    private String lockedBy;

    @Column(name = "locked_at")
    private LocalDateTime lockedAt;

    @Column(name = "next_retry_at")
    private LocalDateTime nextRetryAt;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

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