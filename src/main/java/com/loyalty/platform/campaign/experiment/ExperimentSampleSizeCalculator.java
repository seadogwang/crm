package com.loyalty.platform.campaign.experiment;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * 实验样本量估算器 — 基于统计公式计算 A/B 测试所需的最小样本量。
 *
 * <p>支持两种指标类型：
 * <ul>
 *   <li><b>比例类指标</b>（CLICK_RATE, CONVERSION_RATE, OPEN_RATE）：
 *       使用二项分布比例检验公式</li>
 *   <li><b>连续类指标</b>（REVENUE_PER_USER）：
 *       使用双样本 Z 检验公式（需要标准差估计）</li>
 * </ul>
 *
 * <p>公式（比例类）：
 * <pre>
 *   n = (Z_α/2 + Z_β)² × (p₁(1-p₁) + p₂(1-p₂)) / (p₂ - p₁)²
 * </pre>
 * 其中：
 * <ul>
 *   <li>Z_α/2：显著性水平对应的 Z 值（95% → 1.96）</li>
 *   <li>Z_β：统计功效对应的 Z 值（80% → 0.842）</li>
 *   <li>p₁：基线转化率</li>
 *   <li>p₂：期望转化率 = p₁ × (1 + MDE)</li>
 * </ul>
 *
 * <p>参考：设计文档 campaign_final_update_4.md 第7.1节
 */
@Component
public class ExperimentSampleSizeCalculator {

    private static final Logger log = LoggerFactory.getLogger(ExperimentSampleSizeCalculator.class);

    // Z-score 常量
    private static final double Z_90_PCT = 1.645;
    private static final double Z_95_PCT = 1.960;
    private static final double Z_99_PCT = 2.576;

    // 统计功效对应的 Z 值
    private static final double Z_POWER_80 = 0.842;
    private static final double Z_POWER_85 = 1.036;
    private static final double Z_POWER_90 = 1.282;
    private static final double Z_POWER_95 = 1.645;

    /**
     * 样本量估算请求。
     */
    public record SampleSizeRequest(
            String objectiveMetric,       // CLICK_RATE / CONVERSION_RATE / REVENUE_PER_USER / OPEN_RATE
            BigDecimal baselineRate,       // 基线转化率 (0-1)
            BigDecimal minimumDetectableEffect, // MDE 相对提升 (如 0.05 = 5%)
            BigDecimal statisticalSignificance, // 显著性水平 (0.90/0.95/0.99, 默认 0.95)
            BigDecimal statisticalPower,   // 统计功效 (0.80/0.85/0.90/0.95, 默认 0.80)
            Integer variantCount,           // 变体数量（含控制组, 默认 2）
            BigDecimal stdDevEstimate,      // 标准差估计（仅 REVENUE_PER_USER 需要）
            Long dailyTraffic               // 每日可分配流量（用于估算实验时长）
    ) {}

    /**
     * 样本量估算响应。
     */
    public record SampleSizeResponse(
            long sampleSizePerGroup,    // 每组所需样本量
            long totalSampleSize,       // 总样本量（所有组）
            double baselineRate,        // 基线转化率
            double expectedRate,        // 期望转化率
            double absoluteEffect,      // 绝对效应量
            double statisticalSignificance,
            double statisticalPower,
            int variantCount,
            Integer estimatedDays,      // 预计实验天数（如果有 dailyTraffic）
            String objectiveMetric,
            String formula              // 使用的公式说明
    ) {}

    /**
     * 计算样本量。
     */
    public SampleSizeResponse calculate(SampleSizeRequest request) {
        double baseline = request.baselineRate().doubleValue();
        double mde = request.minimumDetectableEffect().doubleValue();
        double significance = request.statisticalSignificance() != null
                ? request.statisticalSignificance().doubleValue() : 0.95;
        double power = request.statisticalPower() != null
                ? request.statisticalPower().doubleValue() : 0.80;
        int variants = request.variantCount() != null ? request.variantCount() : 2;

        double zAlpha = getZAlpha(significance);
        double zBeta = getZBeta(power);
        String metric = request.objectiveMetric() != null ? request.objectiveMetric() : "CLICK_RATE";

        long nPerGroup;
        String formula;

        if ("REVENUE_PER_USER".equals(metric)) {
            // 连续变量公式: n = 2 × (Zα + Zβ)² × (σ/δ)²
            double stdDev = request.stdDevEstimate() != null
                    ? request.stdDevEstimate().doubleValue() : estimateDefaultStdDev(baseline);
            double absoluteEffect = baseline * mde; // MDE 转为绝对量
            if (absoluteEffect <= 0) absoluteEffect = 0.01;
            double se = stdDev / absoluteEffect;
            nPerGroup = Math.round(2 * Math.pow(zAlpha + zBeta, 2) * se * se);
            formula = String.format("n = 2×(Zα+Zβ)²×(σ/δ)², σ=%.2f, δ=%.4f", stdDev, absoluteEffect);
        } else {
            // 比例类公式: n = (Zα+Zβ)² × (p₁(1-p₁) + p₂(1-p₂)) / (p₂-p₁)²
            double p1 = Math.max(0.001, Math.min(0.999, baseline));
            double p2 = p1 * (1 + mde);
            p2 = Math.max(0.001, Math.min(0.999, p2));
            double absoluteEffect = p2 - p1;

            if (Math.abs(absoluteEffect) < 0.0001) {
                nPerGroup = Long.MAX_VALUE; // 效应量太小，无法估算
                formula = "效应量过小 (|p₂-p₁| < 0.01%)，无法估算有效样本量";
            } else {
                double numerator = Math.pow(zAlpha + zBeta, 2) * (p1 * (1 - p1) + p2 * (1 - p2));
                double denominator = Math.pow(absoluteEffect, 2);
                nPerGroup = Math.round(numerator / denominator);
                formula = String.format("n = (Zα+Zβ)²×(p₁(1-p₁)+p₂(1-p₂))/(p₂-p₁)², "
                                + "p₁=%.1f%%, p₂=%.1f%%",
                        p1 * 100, p2 * 100);
            }
        }

        long totalN = nPerGroup * variants;

        // 估算实验天数
        Integer estimatedDays = null;
        if (request.dailyTraffic() != null && request.dailyTraffic() > 0) {
            estimatedDays = (int) Math.ceil((double) totalN / request.dailyTraffic());
        }

        log.info("Sample size calculated: metric={}, baseline={}, MDE={}%, n/group={}, total={}, days={}",
                metric, String.format("%.1f%%", baseline * 100),
                String.format("%.1f%%", mde * 100),
                nPerGroup, totalN, estimatedDays);

        return new SampleSizeResponse(
                nPerGroup, totalN,
                baseline, baseline * (1 + mde),
                baseline * mde,
                significance, power,
                variants,
                estimatedDays,
                metric,
                formula
        );
    }

    /**
     * 根据显著性水平返回 Z_α/2 值。
     */
    private double getZAlpha(double significance) {
        if (significance >= 0.99) return Z_99_PCT;
        if (significance >= 0.95) return Z_95_PCT;
        return Z_90_PCT;
    }

    /**
     * 根据统计功效返回 Z_β 值。
     */
    private double getZBeta(double power) {
        if (power >= 0.95) return Z_POWER_95;
        if (power >= 0.90) return Z_POWER_90;
        if (power >= 0.85) return Z_POWER_85;
        return Z_POWER_80;
    }

    /**
     * 当未提供标准差时，根据基准值估算。
     */
    private double estimateDefaultStdDev(double baseline) {
        // 对于收入类指标，使用基线值的 50% 作为标准差估计
        return Math.max(baseline * 0.5, 1.0);
    }
}
