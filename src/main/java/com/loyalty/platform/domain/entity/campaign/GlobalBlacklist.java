package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.time.LocalDateTime;

@Entity @Table(name = "campaign_global_blacklist")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class GlobalBlacklist {
    @Id @Column(name = "id", nullable = false, length = 64) private String id;
    @Column(name = "member_id", nullable = false, length = 64) private String memberId;
    @Column(name = "source_program", nullable = false, length = 32) private String sourceProgram;
    @Column(name = "source_type", nullable = false, length = 32) private String sourceType;
    @Column(name = "reason", columnDefinition = "TEXT") private String reason;
    @Column(name = "sharing_scope", length = 32) @Builder.Default private String sharingScope = "GLOBAL";
    @Column(name = "target_programs", columnDefinition = "TEXT[]") private String[] targetPrograms;
    @Column(name = "is_active") @Builder.Default private boolean isActive = true;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "created_by", length = 64) private String createdBy;
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
