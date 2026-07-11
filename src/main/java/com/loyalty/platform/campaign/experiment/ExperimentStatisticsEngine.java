package com.loyalty.platform.campaign.experiment;

import com.loyalty.platform.domain.entity.campaign.Experiment;
import com.loyalty.platform.domain.entity.campaign.ExperimentAssignment;
import com.loyalty.platform.domain.entity.campaign.ExperimentVariant;
import com.loyalty.platform.domain.repository.campaign.ExperimentAssignmentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 实验统计引擎 — 计算指标值、P值、相对提升、置信区间。
 *
 * <p>简化实现：使用 Z-test 近似（不依赖 Apache Commons Math3），
 * 当样本量 >= 100 时提供有意义的统计结果。
 */
@Component
public class ExperimentStatisticsEngine {

    private static final Logger log = LoggerFactory.getLogger(ExperimentStatisticsEngine.class);

    private final ExperimentAssignmentRepository assignmentRepository;

    public ExperimentStatisticsEngine(ExperimentAssignmentRepository assignmentRepository) {
        this.assignmentRepository = assignmentRepository;
    }

    /**
     * 计算实验统计结果。
     */
    public ExperimentStats calculate(Experiment experiment, List<ExperimentVariant> variants,
                                      List<ExperimentAssignment> assignments) {

        ExperimentStats stats = new ExperimentStats();
        ExperimentVariant winner = null;
        double bestImprovement = 0;

        // 找出控制组（variant_code = "A"）
        ExperimentVariant control = variants.stream()
                .filter(v -> "A".equals(v.getVariantCode()))
                .findFirst().orElse(variants.isEmpty() ? null : variants.get(0));

        // 计算每个变体的指标值
        for (ExperimentVariant variant : variants) {
            double metricValue = calculateMetric(experiment.getObjectiveMetric(), variant, assignments);
            variant.setMetricValue(BigDecimal.valueOf(metricValue));
            stats.metricValues.put(variant.getId(), metricValue);
        }

        // 与控制组比较
        if (control != null) {
            double controlMetric = stats.metricValues.getOrDefault(control.getId(), 0.0);

            for (ExperimentVariant variant : variants) {
                if (variant.getId().equals(control.getId())) continue;

                double variantMetric = stats.metricValues.getOrDefault(variant.getId(), 0.0);
                double improvement = controlMetric > 0
                        ? (variantMetric - controlMetric) / controlMetric : 0;

                // 简化 Z-test（二项分布近似）
                double zScore = calculateZScore(variant, control, assignments);
                double pValue = zScoreToPValue(Math.abs(zScore));

                variant.setPValue(BigDecimal.valueOf(pValue));
                variant.setRelativeImprovement(BigDecimal.valueOf(improvement));
                variant.setConfidenceInterval(calculateCI(variantMetric,
                        variant.getExposureCount() != null ? variant.getExposureCount() : 0));

                // 判断显著性
                double significanceLevel = experiment.getStatisticalSignificance() != null
                        ? experiment.getStatisticalSignificance().doubleValue() : 0.95;
                boolean isSignificant = pValue < (1.0 - significanceLevel);

                if (isSignificant) {
                    boolean better = "HIGHER".equals(experiment.getObjectiveDirection())
                            ? improvement > 0 : improvement < 0;
                    if (better && improvement > bestImprovement) {
                        bestImprovement = improvement;
                        winner = variant;
                    }
                    variant.setWinner(better);
                    stats.significantVariants.add(variant.getId());
                }
            }
        }

        stats.overallWinnerId = winner != null ? winner.getId() : null;
        stats.overallImprovement = bestImprovement;

        log.info("Experiment stats calculated: experiment={}, winner={}, improvement={}%",
                experiment.getId(), stats.overallWinnerId,
                String.format("%.1f", bestImprovement * 100));

        return stats;
    }

    private double calculateMetric(String objectiveMetric, ExperimentVariant variant,
                                    List<ExperimentAssignment> assignments) {
        int exposure = variant.getExposureCount() != null ? variant.getExposureCount() : 0;
        if (exposure == 0) return 0;

        return switch (objectiveMetric) {
            case "CLICK_RATE", "CONVERSION_RATE", "OPEN_RATE" -> {
                int events = variant.getEventCount() != null ? variant.getEventCount() : 0;
                yield (double) events / exposure;
            }
            case "REVENUE_PER_USER" ->
                variant.getTotalRevenue() != null
                        ? variant.getTotalRevenue().doubleValue() / exposure : 0;
            default -> 0;
        };
    }

    /**
     * 简化 Z 检验（二项分布比例差检验）。
     */
    private double calculateZScore(ExperimentVariant variant, ExperimentVariant control,
                                    List<ExperimentAssignment> assignments) {
        int n1 = control.getExposureCount() != null ? control.getExposureCount() : 0;
        int n2 = variant.getExposureCount() != null ? variant.getExposureCount() : 0;
        if (n1 == 0 || n2 == 0) return 0;

        double p1 = control.getEventCount() != null
                ? (double) control.getEventCount() / n1 : 0;
        double p2 = variant.getEventCount() != null
                ? (double) variant.getEventCount() / n2 : 0;
        double pPooled = ((p1 * n1) + (p2 * n2)) / (n1 + n2);

        double se = Math.sqrt(pPooled * (1 - pPooled) * (1.0 / n1 + 1.0 / n2));
        return se > 0 ? (p2 - p1) / se : 0;
    }

    /**
     * Z-score → P-value（标准正态累积分布近似）。
     */
    private double zScoreToPValue(double z) {
        // 使用 Abramowitz & Stegun 近似公式
        double t = 1.0 / (1.0 + 0.2316419 * z);
        double d = 0.3989423 * Math.exp(-z * z / 2);
        double prob = 1.0 - d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
        return 2.0 * (1.0 - prob); // 双侧检验
    }

    private String calculateCI(double metric, int sampleSize) {
        if (sampleSize == 0) return "±∞";
        double se = Math.sqrt(metric * (1 - metric) / sampleSize);
        double margin = 1.96 * se; // 95% CI
        double ci = margin * 100;
        return String.format("±%.1f%%", ci);
    }

    // ========================================================================
    // Stats data class
    // ========================================================================

    @lombok.Data
    public static class ExperimentStats {
        private Map<String, Double> metricValues = new LinkedHashMap<>();
        private List<String> significantVariants = new ArrayList<>();
        private String overallWinnerId;
        private double overallImprovement;
    }
}
