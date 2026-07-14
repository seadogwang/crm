package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "master_data_definition",
        uniqueConstraints = @UniqueConstraint(columnNames = {"program_code", "data_code"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MasterDataDefinition {
    @Id @Column(name = "id", length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "data_type", nullable = false, length = 32) private String dataType;
    @Column(name = "data_code", nullable = false, length = 64) private String dataCode;
    @Column(name = "data_name", nullable = false, length = 128) private String dataName;
    @Column(name = "description", columnDefinition = "text") private String description;
    @Column(name = "config", columnDefinition = "text") private String config;
    @Column(name = "status", length = 20) @Builder.Default private String status = "ACTIVE";
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
