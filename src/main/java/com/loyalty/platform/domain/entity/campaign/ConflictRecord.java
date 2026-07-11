package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "campaign_conflict_record")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ConflictRecord {
    @Id @Column(name = "id", nullable = false, length = 64) private String id;
    @Column(name = "workspace_id", nullable = false, length = 64) private String workspaceId;
    @Column(name = "plan_id_1", nullable = false, length = 64) private String planId1;
    @Column(name = "plan_id_2", nullable = false, length = 64) private String planId2;
    @Column(name = "plan_name_1", length = 255) private String planName1;
    @Column(name = "plan_name_2", length = 255) private String planName2;
    @Column(name = "conflict_type", nullable = false, length = 32) private String conflictType;
    @Column(name = "severity", length = 16) @Builder.Default private String severity = "WARNING";
    @Column(name = "overlap_audience_count") private Integer overlapAudienceCount;
    @Column(name = "overlap_percentage", precision = 5, scale = 2) private BigDecimal overlapPercentage;
    @Column(name = "affected_channel", length = 32) private String affectedChannel;
    @Column(name = "overload_ratio", precision = 5, scale = 2) private BigDecimal overloadRatio;
    @Column(name = "conflict_detail", columnDefinition = "TEXT") private String conflictDetail;
    @Column(name = "conflict_start_date") private LocalDate conflictStartDate;
    @Column(name = "conflict_end_date") private LocalDate conflictEndDate;
    @Column(name = "status", length = 32) @Builder.Default private String status = "ACTIVE";
    @Column(name = "resolved_at") private Instant resolvedAt;
    @Column(name = "resolved_by", length = 64) private String resolvedBy;
    @Column(name = "resolution_note", columnDefinition = "TEXT") private String resolutionNote;
    @Column(name = "detected_at") @Builder.Default private Instant detectedAt = Instant.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
