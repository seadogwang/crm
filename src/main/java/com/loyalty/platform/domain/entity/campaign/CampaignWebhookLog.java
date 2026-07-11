package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.Instant;

@Entity @Table(name = "campaign_webhook_log")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CampaignWebhookLog {
    @Id @Column(name = "id", nullable = false, length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "trigger_id", length = 64) private String triggerId;
    @Column(name = "request_path", length = 255) private String requestPath;
    @Column(name = "request_method", length = 16) private String requestMethod;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "request_headers", columnDefinition = "jsonb") private String requestHeaders;
    @Column(name = "request_body", columnDefinition = "TEXT") private String requestBody;
    @Column(name = "request_ip") private String requestIp;
    @Column(name = "auth_status", length = 32) private String authStatus;
    @Column(name = "auth_error", columnDefinition = "TEXT") private String authError;
    @Column(name = "mapped_event_type", length = 128) private String mappedEventType;
    @Column(name = "mapped_member_id", length = 64) private String mappedMemberId;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "mapped_payload", columnDefinition = "jsonb") private String mappedPayload;
    @Column(name = "triggered_campaign") @Builder.Default private boolean triggeredCampaign = false;
    @Column(name = "skip_reason", length = 64) private String skipReason;
    @Column(name = "response_status") private Integer responseStatus;
    @Column(name = "processing_time_ms") private Long processingTimeMs;
    @Column(name = "received_at") @Builder.Default private Instant receivedAt = Instant.now();
    @Column(name = "processed_at") private Instant processedAt;
}
