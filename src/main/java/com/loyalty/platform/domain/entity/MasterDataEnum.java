package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "master_data_enum",
        uniqueConstraints = @UniqueConstraint(columnNames = {"program_code", "data_code", "enum_code"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MasterDataEnum {
    @Id @Column(name = "id", length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "data_code", nullable = false, length = 64) private String dataCode;
    @Column(name = "enum_code", nullable = false, length = 64) private String enumCode;
    @Column(name = "enum_label", nullable = false, length = 128) private String enumLabel;
    @Column(name = "enum_value", columnDefinition = "text") private String enumValue;
    @Column(name = "sort_order") @Builder.Default private Integer sortOrder = 0;
    @Column(name = "status", length = 20) @Builder.Default private String status = "ACTIVE";
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
