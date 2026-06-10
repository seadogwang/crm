package com.loyalty.platform.domain.entity;

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

    /** 规则分类: base=基础规则, promo=促销活动 */
    @Column(name = "rule_category", length = 50)
    @Builder.Default
    private String ruleCategory = "base";

    /** 规则组，同组内按 priority 排序执行 */
    @Column(name = "rule_group", length = 50)
    private String ruleGroup;

    /** 组内优先级，数字越小越先执行 */
    @Column(name = "priority")
    @Builder.Default
    private Integer priority = 0;

    /** 生效开始时间 */
    @Column(name = "effective_start")
    private LocalDateTime effectiveStart;

    /** 生效结束时间（null=永久有效） */
    @Column(name = "effective_end")
    private LocalDateTime effectiveEnd;

    /** DRL 脚本内容 */
    @Column(name = "drl_content", columnDefinition = "TEXT")
    private String drlContent;

    /** 版本号 */
    @Column(name = "version")
    @Builder.Default
    private Integer version = 1;

    /** 状态: DRAFT / ACTIVE / INACTIVE */
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