package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "master_data_record")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MasterDataRecord {
    @Id @Column(name = "id", length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "entity_type", nullable = false, length = 100) private String entityType;
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "field_values", nullable = false, columnDefinition = "jsonb")
    private Map<String, Object> fieldValues;
    @Column(name = "status", length = 20) @Builder.Default private String status = "ACTIVE";
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();
}
