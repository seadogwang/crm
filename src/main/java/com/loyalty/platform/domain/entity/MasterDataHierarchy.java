package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "master_data_hierarchy",
        uniqueConstraints = @UniqueConstraint(columnNames = {"program_code", "data_code", "node_code"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MasterDataHierarchy {
    @Id @Column(name = "id", length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "data_code", nullable = false, length = 64) private String dataCode;
    @Column(name = "node_code", nullable = false, length = 64) private String nodeCode;
    @Column(name = "node_name", nullable = false, length = 128) private String nodeName;
    @Column(name = "parent_code", length = 64) private String parentCode;
    @Column(name = "node_level") @Builder.Default private Integer nodeLevel = 1;
    @Column(name = "sort_order") @Builder.Default private Integer sortOrder = 0;
    @Column(name = "status", length = 20) @Builder.Default private String status = "ACTIVE";
    @Column(name = "ext_attributes", columnDefinition = "text") private String extAttributes;
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();

}
