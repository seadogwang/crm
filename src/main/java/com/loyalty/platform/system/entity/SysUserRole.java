package com.loyalty.platform.system.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "sys_user_role",
       uniqueConstraints = @UniqueConstraint(columnNames = {"user_id", "role_id"}))
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class SysUserRole {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "role_id", nullable = false)
    private Long roleId;

    @Column(name = "program_code", length = 64)
    private String programCode;
}
