package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "master_data_tag",
        uniqueConstraints = @UniqueConstraint(columnNames = {"program_code", "tag_code"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MasterDataTag {
    @Id @Column(name = "id", length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "tag_group", length = 64) private String tagGroup;
    @Column(name = "tag_code", nullable = false, length = 64) private String tagCode;
    @Column(name = "tag_name", nullable = false, length = 128) private String tagName;
    @Column(name = "tag_color", length = 16) private String tagColor;
    @Column(name = "status", length = 20) @Builder.Default private String status = "ACTIVE";
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
