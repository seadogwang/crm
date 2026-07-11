package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * 偏好变更审计日志 — 满足 GDPR 审计要求。
 */
@Entity
@Table(name = "campaign_consent_change_log")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ConsentChangeLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false, length = 64)
    private String memberId;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    /** 变更字段: global_unsubscribe / email_opt_in / category_preferences */
    @Column(name = "field_changed", length = 64)
    private String fieldChanged;

    @Column(name = "old_value", columnDefinition = "TEXT")
    private String oldValue;

    @Column(name = "new_value", columnDefinition = "TEXT")
    private String newValue;

    /** WEB_UI / EMAIL_LINK / SMS_REPLY / API / SYSTEM */
    @Column(name = "source", length = 32)
    private String source;

    @Column(name = "source_detail", columnDefinition = "TEXT")
    private String sourceDetail;

    @Column(name = "ip_address")
    private String ipAddress;

    @Column(name = "user_agent", columnDefinition = "TEXT")
    private String userAgent;

    @Column(name = "operated_by", length = 64)
    private String operatedBy;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
