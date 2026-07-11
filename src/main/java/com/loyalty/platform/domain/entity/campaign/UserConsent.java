package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalTime;
import java.util.Map;

/**
 * 用户营销偏好 — 全局退订、渠道偏好、品类偏好、静默时段。
 *
 * <p>所有 Channel Worker 发送前必须检查此表的偏好设置。
 */
@Entity
@Table(name = "campaign_user_consent")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserConsent {

    @Id
    @Column(name = "member_id", nullable = false, length = 64)
    private String memberId;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    // ===== 全局退订 =====

    @Column(name = "global_unsubscribe")
    @Builder.Default
    private boolean globalUnsubscribe = false;

    /** SPAM / NOT_INTERESTED / TOO_FREQUENT / OTHER */
    @Column(name = "unsubscribe_reason", length = 64)
    private String unsubscribeReason;

    @Column(name = "unsubscribe_channel", length = 32)
    private String unsubscribeChannel;

    @Column(name = "unsubscribe_at")
    private Instant unsubscribeAt;

    // ===== 渠道偏好 =====

    @Column(name = "email_opt_in")
    @Builder.Default
    private boolean emailOptIn = true;

    @Column(name = "sms_opt_in")
    @Builder.Default
    private boolean smsOptIn = true;

    @Column(name = "push_opt_in")
    @Builder.Default
    private boolean pushOptIn = true;

    @Column(name = "email_opt_out_at")
    private Instant emailOptOutAt;

    @Column(name = "sms_opt_out_at")
    private Instant smsOptOutAt;

    @Column(name = "push_opt_out_at")
    private Instant pushOptOutAt;

    // ===== 品类偏好 =====

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "category_preferences", columnDefinition = "jsonb")
    @Builder.Default
    private String categoryPreferences = "{\"included\": [], \"excluded\": []}";

    @Column(name = "category_preferences_updated_at")
    private Instant categoryPreferencesUpdatedAt;

    // ===== 静默时段 =====

    @Column(name = "quiet_hours_enabled")
    @Builder.Default
    private boolean quietHoursEnabled = false;

    @Column(name = "quiet_hours_start")
    private LocalTime quietHoursStart;

    @Column(name = "quiet_hours_end")
    private LocalTime quietHoursEnd;

    @Column(name = "timezone", length = 64)
    @Builder.Default
    private String timezone = "Asia/Shanghai";

    // ===== 元数据 =====

    @Column(name = "preference_source", length = 32)
    @Builder.Default
    private String preferenceSource = "DEFAULT";

    @Column(name = "last_updated_by", length = 64)
    private String lastUpdatedBy;

    @Column(name = "last_updated_at")
    @Builder.Default
    private Instant lastUpdatedAt = Instant.now();

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
