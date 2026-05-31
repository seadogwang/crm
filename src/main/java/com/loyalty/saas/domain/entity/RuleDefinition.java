package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "rule_definition")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RuleDefinition {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    /** 规则代码 */
    @Column(name = "rule_code", nullable = false, length = 100)
    private String ruleCode;

    /** 规则名称 */
    @Column(name = "rule_name", length = 200)
    private String ruleName;

    /** 规则类型 */
    @Column(name = "rule_type", length = 50)
    private String ruleType;

    /** 议程组: forward / backward */
    @Column(name = "agenda_group", length = 50)
    @Builder.Default
    private String agendaGroup = "forward";

    /** DRL 脚本内容 */
    @Column(name = "drl_content", nullable = false, columnDefinition = "TEXT")
    private String drlContent;

    /** 版本号 */
    @Column(name = "version")
    @Builder.Default
    private Integer version = 1;

    /** 状态: DRAFT / TESTED / ACTIVE / ARCHIVED */
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "DRAFT";

    /** 元数据 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "metadata", columnDefinition = "jsonb")
    private Map<String, Object> metadata;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}