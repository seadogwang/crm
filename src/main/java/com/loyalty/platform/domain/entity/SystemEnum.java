package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "system_enum")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class SystemEnum {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", length = 32, nullable = false)
    @Builder.Default
    private String programCode = "SYSTEM";

    @Column(name = "enum_type", length = 50, nullable = false)
    private String enumType;

    @Column(name = "enum_code", length = 100, nullable = false)
    private String enumCode;

    @Column(name = "enum_name", length = 200, nullable = false)
    private String enumName;

    @Column(name = "sort_order")
    @Builder.Default
    private Integer sortOrder = 0;

    @Column(name = "is_active")
    @Builder.Default
    private Boolean isActive = true;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

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