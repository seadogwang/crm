package com.loyalty.platform.campaign.decision.service;

import com.loyalty.platform.campaign.decision.dto.CampaignCandidate;
import com.loyalty.platform.campaign.decision.dto.SimulationCompareResult;
import com.loyalty.platform.campaign.decision.dto.SimulationResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.*;

/**
 * 三层模拟引擎 — 营销效果预测。
 *
 * <p>模型层次：
 * <ol>
 *   <li><b>Exposure Model</b>：曝光概率（渠道容量 + 用户注意力）</li>
 *   <li><b>Behavior Model</b>：行为概率（Offer强度 + 兴趣 - 疲劳）</li>
 *   <li><b>Conversion Model</b>：转化概率（Uplift × Intent × OfferMatch）</li>
 * </ol>
 */
@Service("decisionSimulationEngine")
public class SimulationEngine {

    private static final Logger log = LoggerFactory.getLogger(SimulationEngine.class);

    // 默认渠道容量
    private static final Map<String, Integer> DEFAULT_CHANNEL_CAPACITY = Map.of(
            "EMAIL", 100000,
            "SMS", 50000,
            "PUSH", 200000,
            "WECHAT", 150000
    );

    // 默认各渠道曝光率基数
    private static final Map<String, Double> BASE_EXPOSURE_RATE = Map.of(
            "EMAIL", 0.85,
            "SMS", 0.90,
            "PUSH", 0.70,
            "WECHAT", 0.80
    );

    // 各渠道 Offer 强度系数
    private static final Map<String, Double> OFFER_STRENGTH = Map.of(
            "COUPON", 1.3,
            "POINTS", 1.2,
            "MESSAGE", 0.9,
            "EMAIL", 0.8
    );

    /**
     * 对单个候选活动执行三层模拟预测。
     */
    public SimulationResult simulate(CampaignCandidate candidate, long audienceSize) {
        String channel = candidate.getChannel() != null ? candidate.getChannel() : "EMAIL";
        String offerType = determineOfferType(candidate);

        // === 第1层：Exposure Model（曝光概率） ===
        double baseExposure = BASE_EXPOSURE_RATE.getOrDefault(channel, 0.8);
        Integer channelCapacity = DEFAULT_CHANNEL_CAPACITY.getOrDefault(channel, 100000);
        double capacityFactor = Math.min(1.0, channelCapacity / (double) Math.max(audienceSize, 1));
        double attentionFactor = 1.0 - (candidate.getRecencyBoost() * 0.1); // 近期触达多则疲劳

        double exposureRate = baseExposure * capacityFactor * attentionFactor;
        exposureRate = Math.max(0, Math.min(1, exposureRate));

        long estimatedReach = (long) (audienceSize * exposureRate);

        // === 第2层：Behavior Model（行为概率） ===
        double offerStrength = OFFER_STRENGTH.getOrDefault(offerType, 1.0);
        double interestFactor = 0.3 + candidate.getOpportunityScore() * 0.5; // 机会分越高兴趣越高
        double fatigueFactor = 1.0 - (candidate.getRecencyBoost() * 0.15);

        double behaviorRate = offerStrength * interestFactor * fatigueFactor;
        behaviorRate = Math.max(0, Math.min(1, behaviorRate));

        // === 第3层：Conversion Model（转化概率） ===
        double upliftFactor = 0.3 + candidate.getOpportunityScore() * 0.4;
        double intentFactor = 0.4 + candidate.getStrategicWeight() * 0.3;
        double offerMatch = 0.5 + normalizeROI(candidate.getExpectedROI()) * 0.3;

        double conversionRate = upliftFactor * intentFactor * offerMatch;
        conversionRate = Math.max(0, Math.min(1, conversionRate));

        long estimatedConversions = (long) (estimatedReach * behaviorRate * conversionRate);

        // === 预期收入/ROI ===
        BigDecimal avgOrderValue = BigDecimal.valueOf(300); // 模拟值
        BigDecimal expectedRevenue = avgOrderValue.multiply(BigDecimal.valueOf(estimatedConversions));
        BigDecimal expectedROI = candidate.getExpectedROI();

        if (candidate.getRecommendedBudget().compareTo(BigDecimal.ZERO) > 0) {
            expectedROI = expectedRevenue.divide(candidate.getRecommendedBudget(), 4, RoundingMode.HALF_UP);
        }

        // 模型明细
        Map<String, Object> details = new LinkedHashMap<>();
        details.put("channelCapacity", channelCapacity);
        details.put("capacityFactor", roundTo4(capacityFactor));
        details.put("attentionFactor", roundTo4(attentionFactor));
        details.put("offerStrength", roundTo4(offerStrength));
        details.put("interestFactor", roundTo4(interestFactor));
        details.put("fatigueFactor", roundTo4(fatigueFactor));
        details.put("upliftFactor", roundTo4(upliftFactor));
        details.put("intentFactor", roundTo4(intentFactor));
        details.put("offerMatch", roundTo4(offerMatch));

        return SimulationResult.builder()
                .candidateId(candidate.getId())
                .exposureRate(roundTo4(exposureRate))
                .behaviorRate(roundTo4(behaviorRate))
                .conversionRate(roundTo4(conversionRate))
                .expectedRevenue(expectedRevenue)
                .expectedROI(expectedROI)
                .estimatedReach(estimatedReach)
                .estimatedConversions(estimatedConversions)
                .modelDetails(details)
                .build();
    }

    /**
     * 批量模拟预测。
     */
    public List<SimulationResult> simulateBatch(List<CampaignCandidate> candidates, long audienceSize) {
        List<SimulationResult> results = new ArrayList<>();
        for (CampaignCandidate c : candidates) {
            results.add(simulate(c, audienceSize));
        }
        log.info("Batch simulation completed for {} candidates, audience={}", candidates.size(), audienceSize);
        return results;
    }

    /**
     * What-if 模拟对比 — 比较两套预算分配方案的预期效果。
     */
    public SimulationCompareResult comparePlans(String planAId, String planAName,
                                                  List<CampaignCandidate> candidatesA,
                                                  String planBId, String planBName,
                                                  List<CampaignCandidate> candidatesB,
                                                  long audienceSize) {
        List<SimulationResult> resultsA = simulateBatch(candidatesA, audienceSize);
        List<SimulationResult> resultsB = simulateBatch(candidatesB, audienceSize);

        // 计算汇总对比指标
        double totalROIA = resultsA.stream()
                .mapToDouble(r -> r.getExpectedROI().doubleValue()).average().orElse(0);
        double totalROIB = resultsB.stream()
                .mapToDouble(r -> r.getExpectedROI().doubleValue()).average().orElse(0);
        long totalConversionsA = resultsA.stream().mapToLong(SimulationResult::getEstimatedConversions).sum();
        long totalConversionsB = resultsB.stream().mapToLong(SimulationResult::getEstimatedConversions).sum();

        Map<String, Object> comparison = new LinkedHashMap<>();
        comparison.put("planA_avgROI", roundTo4(totalROIA));
        comparison.put("planB_avgROI", roundTo4(totalROIB));
        comparison.put("planA_totalConversions", totalConversionsA);
        comparison.put("planB_totalConversions", totalConversionsB);
        comparison.put("roiImprovement", roundTo4(totalROIB > 0 ? (totalROIA - totalROIB) / totalROIB : 0));
        comparison.put("winner", totalROIA >= totalROIB ? planAName : planBName);

        return SimulationCompareResult.builder()
                .planAId(planAId)
                .planBId(planBId)
                .planAName(planAName)
                .planBName(planBName)
                .planAResults(resultsA)
                .planBResults(resultsB)
                .comparison(comparison)
                .build();
    }

    /**
     * 对单个 Initiative 预测 ROI（供 PortfolioService 调用）。
     */
    public SimulationResult predictInitiativeROI(String initiativeId, BigDecimal budget) {
        CampaignCandidate dummy = CampaignCandidate.builder()
                .id(initiativeId)
                .recommendedBudget(budget)
                .opportunityScore(0.5)
                .strategicWeight(0.5)
                .build();
        return simulate(dummy, 10000);
    }

    private String determineOfferType(CampaignCandidate c) {
        if (c.getName() == null) return "MESSAGE";
        String name = c.getName().toLowerCase();
        if (name.contains("优惠券") || name.contains("coupon")) return "COUPON";
        if (name.contains("积分") || name.contains("point") || name.contains("points")) return "POINTS";
        if (name.contains("邮件") || name.contains("email")) return "EMAIL";
        return "MESSAGE";
    }

    private double normalizeROI(BigDecimal roi) {
        if (roi == null || roi.compareTo(BigDecimal.ZERO) <= 0) return 0;
        return Math.min(roi.doubleValue() / 5.0, 1.0);
    }

    private double roundTo4(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}
