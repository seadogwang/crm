package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

/**
 * 当前活动章程版本表（Terms Master）。
 *
 * <p>维护当前生效的条款版本（俱乐部章程、隐私政策、服务条款等）。
 * 当法务更新章程时，创建新版本并激活，旧版本自动失效。
 */
@Entity
@Table(name = "loyalty_terms_master")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TermsMaster {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    /** CHARTER / PRIVACY_POLICY / TERMS_OF_SERVICE / DATA_PROCESSING */
    @Column(name = "terms_type", nullable = false, length = 32)
    private String termsType;

    @Column(name = "terms_version", nullable = false, length = 32)
    private String termsVersion;

    @Column(name = "terms_content", columnDefinition = "TEXT")
    private String termsContent;

    @Column(name = "effective_date", nullable = false)
    private Instant effectiveDate;

    @Column(name = "is_active")
    @Builder.Default
    private boolean isActive = true;

    @Column(name = "released_by", length = 64)
    private String releasedBy;

    @Column(name = "released_at")
    @Builder.Default
    private Instant releasedAt = Instant.now();

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}