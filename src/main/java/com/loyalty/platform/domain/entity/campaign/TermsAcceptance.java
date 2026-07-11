package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

/**
 * 法律/服务同意记录表（Terms & Conditions / Privacy Policy / Club Charter）。
 *
 * <p>记录会员对特定条款版本的接受情况，包含审计关键信息（IP、User-Agent、时间）。
 * 每个会员 + 条款类型 + 版本唯一，确保同一版本不会重复接受。
 */
@Entity
@Table(name = "loyalty_terms_acceptance")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TermsAcceptance {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "member_id", nullable = false, length = 64)
    private String memberId;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    /** CHARTER / PRIVACY_POLICY / TERMS_OF_SERVICE / DATA_PROCESSING */
    @Column(name = "terms_type", nullable = false, length = 32)
    private String termsType;

    @Column(name = "terms_version", nullable = false, length = 32)
    private String termsVersion;

    @Column(name = "is_accepted", nullable = false)
    @Builder.Default
    private boolean isAccepted = false;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @Column(name = "accepted_ip", length = 45)
    private String acceptedIp;

    @Column(name = "user_agent", columnDefinition = "TEXT")
    private String userAgent;

    /** WEB_APP / MOBILE_APP / MINI_PROGRAM / ADMIN */
    @Column(name = "source", length = 32)
    private String source;

    @Column(name = "revoked_at")
    private Instant revokedAt;

    @Column(name = "revoked_by", length = 64)
    private String revokedBy;

    @Column(name = "revoked_reason", length = 255)
    private String revokedReason;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();

    @Column(name = "updated_at")
    @Builder.Default
    private Instant updatedAt = Instant.now();
}