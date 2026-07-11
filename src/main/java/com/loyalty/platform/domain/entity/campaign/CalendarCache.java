package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "campaign_calendar_cache")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class CalendarCache {
    @Id @Column(name = "id", nullable = false, length = 64) private String id;
    @Column(name = "workspace_id", nullable = false, length = 64) private String workspaceId;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "plan_id", nullable = false, length = 64) private String planId;
    @Column(name = "plan_name", length = 255) private String planName;
    @Column(name = "trigger_type", length = 32) private String triggerType;
    @Column(name = "start_date", nullable = false) private LocalDate startDate;
    @Column(name = "end_date", nullable = false) private LocalDate endDate;
    @Column(name = "actual_start_time") private Instant actualStartTime;
    @Column(name = "estimated_audience_size") private Integer estimatedAudienceSize;
    @Column(name = "audience_hash", length = 64) private String audienceHash;
    @Column(name = "estimated_daily_volume_email") @Builder.Default private Integer estimatedDailyVolumeEmail = 0;
    @Column(name = "estimated_daily_volume_sms") @Builder.Default private Integer estimatedDailyVolumeSms = 0;
    @Column(name = "estimated_daily_volume_push") @Builder.Default private Integer estimatedDailyVolumePush = 0;
    @Column(name = "status", length = 32) private String status;
    @Column(name = "cache_generated_at") @Builder.Default private Instant cacheGeneratedAt = Instant.now();
    @Column(name = "cache_version") @Builder.Default private Integer cacheVersion = 1;
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
}
