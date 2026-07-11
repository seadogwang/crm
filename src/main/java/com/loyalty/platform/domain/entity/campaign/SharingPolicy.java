package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import java.time.Instant;
import java.time.LocalDateTime;

@Entity @Table(name = "campaign_sharing_policy")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SharingPolicy {
    @Id @Column(name = "id", nullable = false, length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "sharing_scope", nullable = false, length = 32) private String sharingScope;
    @Column(name = "target_programs", columnDefinition = "TEXT[]") private String[] targetPrograms;
    @Column(name = "parent_program_code", length = 32) private String parentProgramCode;
    @Column(name = "shared_resource_types", nullable = false, columnDefinition = "TEXT[]") private String[] sharedResourceTypes;
    @Column(name = "permission_type", length = 32) @Builder.Default private String permissionType = "READ_ONLY";
    @Column(name = "enabled") @Builder.Default private boolean enabled = true;
    @Column(name = "expires_at") private Instant expiresAt;
    @Column(name = "created_by", length = 64) private String createdBy;
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
