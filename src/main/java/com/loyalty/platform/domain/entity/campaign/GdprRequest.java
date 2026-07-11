package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;

/**
 * GDPR 数据删除/匿名化/导出请求。
 */
@Entity
@Table(name = "campaign_gdpr_request")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GdprRequest {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "member_id", nullable = false, length = 64)
    private String memberId;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    /** DELETE / ANONYMIZE / EXPORT */
    @Column(name = "request_type", length = 32)
    @Builder.Default
    private String requestType = "DELETE";

    /** USER / ADMIN / API */
    @Column(name = "request_source", length = 32)
    @Builder.Default
    private String requestSource = "USER";

    @Column(name = "request_reason", columnDefinition = "TEXT")
    private String requestReason;

    @Column(name = "request_time")
    @Builder.Default
    private Instant requestTime = Instant.now();

    /** PENDING / PROCESSING / COMPLETED / REJECTED */
    @Column(name = "status", length = 32)
    @Builder.Default
    private String status = "PENDING";

    @Column(name = "processed_by", length = 64)
    private String processedBy;

    @Column(name = "processed_at")
    private Instant processedAt;

    @Column(name = "completion_summary", columnDefinition = "TEXT")
    private String completionSummary;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private Instant createdAt = Instant.now();
}
