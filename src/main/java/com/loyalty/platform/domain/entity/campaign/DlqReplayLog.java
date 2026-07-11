package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;

@Entity @Table(name = "campaign_dlq_replay_log")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DlqReplayLog {
    @Id @Column(name = "id", nullable = false, length = 64) private String id;
    @Column(name = "task_id", nullable = false, length = 64) private String taskId;
    @Column(name = "plan_id", nullable = false, length = 64) private String planId;
    @Column(name = "replay_type", nullable = false, length = 32) private String replayType;
    @Column(name = "new_job_key") private Long newJobKey;
    @Column(name = "new_process_instance_key") private Long newProcessInstanceKey;
    @Column(name = "status", length = 32) @Builder.Default private String status = "SUCCESS";
    @Column(name = "operator_id", length = 64) private String operatorId;
    @Column(name = "operator_name", length = 255) private String operatorName;
    @Column(name = "reason", columnDefinition = "TEXT") private String reason;
    @Column(name = "replayed_at") @Builder.Default private Instant replayedAt = Instant.now();
    @Column(name = "created_at", updatable = false) @Builder.Default private Instant createdAt = Instant.now();
}
