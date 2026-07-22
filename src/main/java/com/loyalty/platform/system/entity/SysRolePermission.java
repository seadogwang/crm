package com.loyalty.platform.system.entity;

import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "sys_role_permission",
       uniqueConstraints = @UniqueConstraint(columnNames = {"role_id", "permission_code"}))
@Getter @Setter
@NoArgsConstructor @AllArgsConstructor @Builder
public class SysRolePermission {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "role_id", nullable = false)
    private Long roleId;

    @Column(name = "permission_code", nullable = false, length = 128)
    private String permissionCode;

    @Column(name = "program_code", length = 64)
    private String programCode;
}
