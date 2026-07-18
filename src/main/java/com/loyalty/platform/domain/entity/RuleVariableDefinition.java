package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

/**
 * 变量定义实体 — 对应 rule_variable_definition 表。
 *
 * <p>设计文档 point_design_update.md §2.2：
 * 变量通过表达式（sum/count/balance + 四则运算）引用积分类型，
 * 规则中只引用变量，不关心底层积分类型，实现解耦。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 2.0.0
 */
@Entity
@Table(name = "rule_variable_definition",
        uniqueConstraints = {@UniqueConstraint(name = "rule_variable_definition_program_code_var_code_key",
                columnNames = {"program_code", "var_code"})})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RuleVariableDefinition {

    @Id
    @Column(name = "id", length = 64)
    private String id;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    /** 变量编码，如 total_activity */
    @Column(name = "var_code", nullable = false, length = 64)
    private String varCode;

    /** 变量名称，如 "活动总积分" */
    @Column(name = "var_name", nullable = false, length = 128)
    private String varName;

    /** 变量类型: DECIMAL / INTEGER / BOOLEAN */
    @Column(name = "var_type", length = 20)
    @Builder.Default
    private String varType = "DECIMAL";

    /** 表达式：sum('ACT_A') + sum('ACT_B') */
    @Column(name = "expression", nullable = false, columnDefinition = "TEXT")
    private String expression;

    /** 描述 */
    @Column(name = "description", columnDefinition = "TEXT")
    private String description;

    /** 状态: ACTIVE / INACTIVE */
    @Column(name = "status", length = 20)
    @Builder.Default
    private String status = "ACTIVE";

    @Column(name = "created_by", length = 64)
    private String createdBy;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

}