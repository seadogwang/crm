package com.loyalty.platform.domain.entity.campaign;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 实验学习记录 — 每次实验完成后存储的关键发现。
 *
 * <p>供 AI Planner 和后续实验参考，形成知识积累闭环。
 */
@Entity
@Table(name = "campaign_experiment_learning")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ExperimentLearning {

    @Id
    @Column(name = "id", nullable = false, length = 64)
    private String id;

    @Column(name = "experiment_id", nullable = false, length = 64)
    private String experimentId;

    @Column(name = "plan_id", nullable = false, length = 64)
    private String planId;

    @Column(name = "workspace_id", nullable = false, length = 64)
    private String workspaceId;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    /** 实验名称 */
    @Column(name = "experiment_name", length = 255)
    private String experimentName;

    /** 胜者变体 ID */
    @Column(name = "winning_variant_id", length = 64)
    private String winningVariantId;

    /** 胜者变体名称 */
    @Column(name = "winning_variant_name", length = 64)
    private String winningVariantName;

    /** 胜者变体代码 (A/B/C) */
    @Column(name = "winning_variant_code", length = 16)
    private String winningVariantCode;

    /** 目标指标 */
    @Column(name = "objective_metric", length = 64)
    private String objectiveMetric;

    /** 相对提升 (%) */
    @Column(name = "overall_improvement", precision = 10, scale = 4)
    private BigDecimal overallImprovement;

    /** 胜者相对于控制组的 P 值 */
    @Column(name = "winner_p_value", precision = 10, scale = 6)
    private BigDecimal winnerPValue;

    /** 胜者指标值 */
    @Column(name = "winner_metric_value", precision = 18, scale = 4)
    private BigDecimal winnerMetricValue;

    /** 控制组指标值 */
    @Column(name = "control_metric_value", precision = 18, scale = 4)
    private BigDecimal controlMetricValue;

    /** 总样本量 */
    @Column(name = "total_sample_size")
    private Integer totalSampleSize;

    /** 胜者的 nodeOverrides 配置 */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "winner_config_json", columnDefinition = "jsonb")
    private String winnerConfigJson;

    /** AI 可读的摘要 */
    @Column(name = "ai_summary", columnDefinition = "TEXT")
    private String aiSummary;

    /** 是否已应用到生产配置 */
    @Column(name = "applied_to_config")
    @Builder.Default
    private boolean appliedToConfig = false;

    /** 预算调整幅度 (%) */
    @Column(name = "budget_adjustment_pct", precision = 10, scale = 4)
    private BigDecimal budgetAdjustmentPct;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}
