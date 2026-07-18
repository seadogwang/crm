package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Entity
@Table(name = "rule_snapshot")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RuleSnapshot {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    /** 快照版本号 */
    @Column(name = "snapshot_version", nullable = false, length = 100)
    private String snapshotVersion;

    /** KIE 发布 ID */
    @Column(name = "kie_release_id", length = 100)
    private String kieReleaseId;

    /** 包含的规则 ID 列表 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "rule_ids", nullable = false, columnDefinition = "jsonb")
    private List<Long> ruleIds;

    /** DRL 规则包 */
    @Column(name = "drl_bundle", nullable = false, columnDefinition = "TEXT")
    private String drlBundle;

    @Column(name = "created_by")
    private Long createdBy;

    @Column(name = "approved_by")
    private Long approvedBy;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "published_at")
    private LocalDateTime publishedAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}