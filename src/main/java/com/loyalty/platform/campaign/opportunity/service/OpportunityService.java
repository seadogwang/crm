package com.loyalty.platform.campaign.opportunity.service;

import com.loyalty.platform.campaign.opportunity.OpportunityErrorCode;
import com.loyalty.platform.campaign.opportunity.dto.*;
import com.loyalty.platform.campaign.opportunity.entity.CampaignMemberDim;
import com.loyalty.platform.campaign.opportunity.repository.CampaignMemberDimRepository;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.domain.entity.campaign.CampaignGoal;
import com.loyalty.platform.domain.entity.campaign.CampaignInitiative;
import com.loyalty.platform.domain.entity.campaign.CampaignOpportunity;
import com.loyalty.platform.domain.entity.campaign.CampaignWorkspace;
import com.loyalty.platform.domain.entity.campaign.ExternalSignal;
import com.loyalty.platform.domain.repository.campaign.CampaignGoalRepository;
import com.loyalty.platform.domain.repository.campaign.CampaignInitiativeRepository;
import com.loyalty.platform.domain.repository.campaign.CampaignOpportunityRepository;
import com.loyalty.platform.domain.repository.campaign.CampaignWorkspaceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 机会发现引擎（核心服务）— 双引擎混合驱动。
 *
 * <p>执行流程：
 * <ol>
 *   <li>SQL 预过滤（硬性门槛）</li>
 *   <li>ML 预测评分（调用 Python 服务）</li>
 *   <li>计算 RFM 基础分</li>
 *   <li>获取外部信号并加权</li>
 *   <li>组合生成 Opportunity</li>
 *   <li>排序截取 Top N</li>
 * </ol>
 */
@Service
@Transactional
public class OpportunityService {

    private static final Logger log = LoggerFactory.getLogger(OpportunityService.class);

    private static final int MAX_OPPORTUNITIES_PER_RUN = 10000;
    private static final double EXTERNAL_WEIGHT_CAP = 2.0;

    private final CampaignMemberDimRepository memberDimRepository;
    private final CampaignOpportunityRepository opportunityRepository;
    private final CampaignGoalRepository goalRepository;
    private final CampaignWorkspaceRepository workspaceRepository;
    private final CampaignInitiativeRepository initiativeRepository;
    private final MLScoringClient mlScoringClient;
    private final ExternalSignalService externalSignalService;

    public OpportunityService(CampaignMemberDimRepository memberDimRepository,
                               CampaignOpportunityRepository opportunityRepository,
                               CampaignGoalRepository goalRepository,
                               CampaignWorkspaceRepository workspaceRepository,
                               CampaignInitiativeRepository initiativeRepository,
                               MLScoringClient mlScoringClient,
                               ExternalSignalService externalSignalService) {
        this.memberDimRepository = memberDimRepository;
        this.opportunityRepository = opportunityRepository;
        this.goalRepository = goalRepository;
        this.workspaceRepository = workspaceRepository;
        this.initiativeRepository = initiativeRepository;
        this.mlScoringClient = mlScoringClient;
        this.externalSignalService = externalSignalService;
    }

    /**
     * 发现机会（核心方法）。
     */
    public DiscoverOpportunitiesResponse discoverOpportunities(DiscoverOpportunitiesRequest request) {
        String workspaceId = request.getWorkspaceId();
        String goalId = request.getGoalId();

        // 1. 获取 Goal 信息并校验
        CampaignGoal goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new BusinessException(OpportunityErrorCode.GOAL_NOT_ACTIVE.code(),
                        OpportunityErrorCode.GOAL_NOT_ACTIVE.message()));
        if (!"ACTIVE".equals(goal.getStatus())) {
            throw new BusinessException(OpportunityErrorCode.GOAL_NOT_ACTIVE.code(),
                    OpportunityErrorCode.GOAL_NOT_ACTIVE.message());
        }
        log.info("Starting opportunity discovery: workspace={}, goal={}", workspaceId, goalId);

        // 1.5 获取 Goal 下的所有 ACTIVE Initiative，收集目标分群
        List<CampaignInitiative> initiatives = initiativeRepository.findByGoalId(goalId);
        List<CampaignInitiative> activeInitiatives = initiatives.stream()
                .filter(i -> "ACTIVE".equals(i.getStatus()))
                .collect(Collectors.toList());
        Set<String> targetSegments = activeInitiatives.stream()
                .filter(i -> i.getRuleConfig() != null && i.getRuleConfig().get("segment") != null)
                .map(i -> i.getRuleConfig().get("segment").toString())
                .collect(Collectors.toSet());
        log.info("Active initiatives: {}, target segments: {}", activeInitiatives.size(), targetSegments);

        // 2. SQL 预过滤：硬性门槛（按举措目标分群过滤）
        String programCode = getProgramCodeFromGoal(goal);
        String segmentFilter = targetSegments.isEmpty() ? null : String.join(",", targetSegments);
        List<CampaignMemberDim> eligibleMembers = memberDimRepository.findEligibleMembers(
                programCode,
                List.of("ACTIVE"),       // 会员状态
                null                     // tierCodes（全部等级）
        );

        if (eligibleMembers.isEmpty()) {
            log.warn("No eligible members found for goal: {}", goalId);
            return DiscoverOpportunitiesResponse.builder()
                    .goalId(goalId)
                    .totalDiscovered(0)
                    .returnedCount(0)
                    .opportunities(Collections.emptyList())
                    .summary(Map.of("byType", Collections.emptyMap(), "avgScore", 0, "highValueCount", 0))
                    .build();
        }
        log.info("Found {} eligible members after SQL pre-filter", eligibleMembers.size());

        // 3. 获取外部信号（当前有效的）
        List<ExternalSignal> activeSignals = externalSignalService.getActiveSignals(programCode);
        log.info("Found {} active external signals", activeSignals.size());

        // 4. 批量调用 ML 服务预测
        List<MemberFeature> features = eligibleMembers.stream()
                .map(this::buildMemberFeature)
                .collect(Collectors.toList());

        List<MLScoreResult> mlResults = mlScoringClient.predictBatch(features);
        log.info("ML prediction completed for {} members", mlResults.size());

        // 5. 逐个生成 Opportunity
        List<CampaignOpportunity> opportunities = new ArrayList<>();
        for (int i = 0; i < eligibleMembers.size(); i++) {
            CampaignMemberDim member = eligibleMembers.get(i);
            MLScoreResult mlResult = i < mlResults.size() ? mlResults.get(i) : MLScoreResult.fallback(member.getMemberId());

            // 5a. 计算 RFM 基础分
            double rfmScore = calculateRFMScore(member);

            // 5b. 计算内部基础分（ML + RFM 融合）
            double baseScore = calculateInternalScore(mlResult, rfmScore);

            // 5c. 计算外部影响因子
            double externalWeight = externalSignalService.calculateExternalWeight(activeSignals, member.getSegmentCode());
            List<String> affectingSignalIds = externalSignalService.getAffectingSignalIds(activeSignals, member.getSegmentCode());

            // 5d. 最终评分
            double finalScore = Math.min(baseScore * externalWeight, 1.0);

            // 5e. 确定机会类型和推荐动作
            String opportunityType = determineOpportunityType(mlResult, member);
            String recommendedAction = determineRecommendedAction(opportunityType);
            String recommendedChannel = determineRecommendedChannel(member);

            // 5f. 构建 Opportunity
            CampaignOpportunity opp = CampaignOpportunity.builder()
                    .id(UUID.randomUUID().toString())
                    .workspaceId(workspaceId)
                    .goalId(goalId)
                    .memberId(member.getMemberId())
                    .segmentCode(member.getSegmentCode())
                    .opportunityType(opportunityType)
                    .score(BigDecimal.valueOf(finalScore))
                    .churnProbability(BigDecimal.valueOf(mlResult.getChurnProbability()))
                    .upliftScore(BigDecimal.valueOf(mlResult.getUpliftScore()))
                    .conversionProbability(BigDecimal.valueOf(mlResult.getConversionProbability()))
                    .rfmScore(BigDecimal.valueOf(rfmScore))
                    .externalInfluence(BigDecimal.valueOf(externalWeight))
                    .externalSignalIds(affectingSignalIds.toArray(new String[0]))
                    .recommendedAction(recommendedAction)
                    .recommendedChannel(recommendedChannel)
                    .confidence(BigDecimal.valueOf(mlResult.getConfidence()))
                    .status("ACTIVE")
                    .source("HYBRID")
                    .detectedAt(Instant.now())
                    .expiresAt(calculateExpiry(opportunityType))
                    .build();

            opportunities.add(opp);
        }

        // 6. 按评分降序排序，截取 Top N
        int maxResults = request.getMaxResults() > 0 ? request.getMaxResults() : MAX_OPPORTUNITIES_PER_RUN;
        opportunities.sort((a, b) -> b.getScore().compareTo(a.getScore()));
        List<CampaignOpportunity> topOpportunities = opportunities.stream()
                .limit(maxResults)
                .collect(Collectors.toList());

        // 7. 批量保存
        opportunityRepository.saveAll(topOpportunities);
        log.info("Saved {} opportunities for goal: {}", topOpportunities.size(), goalId);

        // 8. 构建响应
        long totalCount = opportunityRepository.countByWorkspaceAndGoal(workspaceId, goalId);
        BigDecimal highValueThreshold = BigDecimal.valueOf(0.8);
        long highValueCount = opportunityRepository.countHighValue(workspaceId, goalId, highValueThreshold);
        Double avgScore = opportunityRepository.avgScore(workspaceId, goalId);
        List<Object[]> typeCounts = opportunityRepository.countByType(workspaceId, goalId);

        Map<String, Object> byType = new LinkedHashMap<>();
        for (Object[] row : typeCounts) {
            byType.put((String) row[0], row[1]);
        }

        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("byType", byType);
        summary.put("avgScore", avgScore != null ? BigDecimal.valueOf(avgScore).setScale(2, RoundingMode.HALF_UP) : 0);
        summary.put("highValueCount", highValueCount);

        // 8.5 检测未被举措覆盖的高价值机会分群
        Set<String> coveredSegments = targetSegments;
        Map<String, Long> segmentDistribution = topOpportunities.stream()
                .collect(Collectors.groupingBy(
                        o -> o.getSegmentCode() != null ? o.getSegmentCode() : "unknown",
                        Collectors.counting()));
        List<Map<String, Object>> uncoveredSegments = new ArrayList<>();
        for (Map.Entry<String, Long> entry : segmentDistribution.entrySet()) {
            if (!coveredSegments.contains(entry.getKey()) && !"unknown".equals(entry.getKey())) {
                Map<String, Object> uncovered = new LinkedHashMap<>();
                uncovered.put("segmentCode", entry.getKey());
                uncovered.put("opportunityCount", entry.getValue());
                uncovered.put("suggestion", "建议创建针对「" + entry.getKey() + "」分群的举措");
                uncoveredSegments.add(uncovered);
            }
        }

        // 构建 DTO 列表
        List<Opportunity> opportunityDTOs = topOpportunities.stream()
                .map(this::toDTO)
                .collect(Collectors.toList());

        return DiscoverOpportunitiesResponse.builder()
                .goalId(goalId)
                .totalDiscovered((int) totalCount)
                .returnedCount(opportunityDTOs.size())
                .opportunities(opportunityDTOs)
                .summary(summary)
                .uncoveredSegments(uncoveredSegments)
                .build();
    }

    /**
     * 计算内部基础分（ML + RFM 融合）。
     *
     * <p>权重：churn=0.35, uplift=0.35, conversion=0.20, rfm=0.10
     */
    private double calculateInternalScore(MLScoreResult mlResult, double rfmScore) {
        double score = 0.0;
        score += mlResult.getChurnProbability() * 0.35;
        score += mlResult.getUpliftScore() * 0.35;
        score += mlResult.getConversionProbability() * 0.20;
        score += rfmScore * 0.10;
        return Math.min(score, 1.0);
    }

    /**
     * 计算 RFM 基础分（归一化 0~1）。
     */
    private double calculateRFMScore(CampaignMemberDim member) {
        // R: Recency（最近消费天数，越近越高）
        double rScore = Math.max(0, 1 - (member.getRecencyDays() == null ? 90 : member.getRecencyDays()) / 90.0);
        // F: Frequency（订单数量，取对数缩放）
        double fScore = Math.min(1, Math.log1p(member.getTotalOrderCount() != null ? member.getTotalOrderCount() : 0) / Math.log1p(50));
        // M: Monetary（总金额，取对数缩放）
        double mScore = Math.min(1, Math.log1p(
                member.getTotalOrderAmount() != null ? member.getTotalOrderAmount().doubleValue() : 0) / Math.log1p(10000));

        // RFM 加权
        return 0.3 * rScore + 0.3 * fScore + 0.4 * mScore;
    }

    /**
     * 确定机会类型。
     */
    private String determineOpportunityType(MLScoreResult mlResult, CampaignMemberDim member) {
        double churnProb = mlResult.getChurnProbability();
        double uplift = mlResult.getUpliftScore();

        if (churnProb > 0.7) {
            return "CHURN_RISK";
        } else if (uplift > 0.6 && member.getTotalOrderAmount() != null
                && member.getTotalOrderAmount().doubleValue() > 5000) {
            return "UPSELL";
        } else if (churnProb > 0.4 && member.getTotalOrderAmount() != null
                && member.getTotalOrderAmount().doubleValue() > 3000) {
            return "WINBACK";
        } else if (mlResult.getConversionProbability() > 0.6) {
            return "CROSS_SELL";
        } else {
            return "ENGAGEMENT";
        }
    }

    /**
     * 确定推荐动作。
     */
    private String determineRecommendedAction(String opportunityType) {
        return switch (opportunityType) {
            case "CHURN_RISK" -> "WINBACK_DISCOUNT";
            case "UPSELL" -> "BUNDLE_OFFER";
            case "WINBACK" -> "REACTIVATION_OFFER";
            case "CROSS_SELL" -> "PRODUCT_RECOMMENDATION";
            case "ENGAGEMENT" -> "CONTENT_ENGAGEMENT";
            default -> "STANDARD_PROMOTION";
        };
    }

    /**
     * 确定推荐渠道。
     */
    private String determineRecommendedChannel(CampaignMemberDim member) {
        if (member.getTotalOrderAmount() != null && member.getTotalOrderAmount().doubleValue() > 10000) {
            return "SMS";
        }
        return "EMAIL";
    }

    /**
     * 计算机会有效期。
     */
    private Instant calculateExpiry(String opportunityType) {
        int days = switch (opportunityType) {
            case "CHURN_RISK", "WINBACK" -> 7;
            case "UPSELL", "CROSS_SELL" -> 14;
            default -> 30;
        };
        return Instant.now().plus(days, ChronoUnit.DAYS);
    }

    /**
     * 构建会员特征（供 ML 服务使用）。
     */
    private MemberFeature buildMemberFeature(CampaignMemberDim member) {
        // 从 tierCode 解析等级数值（如 "TIER_3" → 3）
        int tierLevel = 0;
        if (member.getTierCode() != null) {
            try {
                String[] parts = member.getTierCode().split("_");
                tierLevel = Integer.parseInt(parts[parts.length - 1]);
            } catch (NumberFormatException e) {
                tierLevel = 0;
            }
        }

        // 从 registeredAt 计算注册天数
        int daysSinceRegister = 0;
        if (member.getRegisteredAt() != null) {
            daysSinceRegister = (int) ChronoUnit.DAYS.between(
                    member.getRegisteredAt().toLocalDate(), LocalDate.now());
        }

        return MemberFeature.builder()
                .memberId(member.getMemberId())
                .recency(member.getRecencyDays() != null ? member.getRecencyDays() : 90)
                .frequency(member.getTotalOrderCount() != null ? member.getTotalOrderCount() : 0)
                .monetary(member.getTotalOrderAmount() != null ? member.getTotalOrderAmount().doubleValue() : 0)
                .avgOrderValue(member.getAvgOrderValue() != null ? member.getAvgOrderValue().doubleValue() : 0)
                .tierLevel(tierLevel)
                .totalLoginDays(0)
                .continuousLoginDays(0)
                .daysSinceRegister(daysSinceRegister)
                .build();
    }

    /**
     * 查询机会列表（含筛选）。
     */
    @Transactional(readOnly = true)
    public List<Opportunity> findOpportunities(String workspaceId, String goalId,
                                                List<String> types, BigDecimal minScore,
                                                String status, int limit, int offset) {
        PageRequest page = PageRequest.of(offset / Math.max(limit, 1), limit);
        List<CampaignOpportunity> entities = opportunityRepository.findByFilters(
                workspaceId, goalId, types, minScore, status, page);
        return entities.stream().map(this::toDTO).collect(Collectors.toList());
    }

    /**
     * 消费机会（标记为已用）。
     */
    @Transactional
    public Opportunity consumeOpportunity(String opportunityId) {
        CampaignOpportunity opp = opportunityRepository.findById(opportunityId)
                .orElseThrow(() -> new BusinessException(
                        OpportunityErrorCode.OPPORTUNITY_NOT_FOUND.code(),
                        OpportunityErrorCode.OPPORTUNITY_NOT_FOUND.message()));

        if ("CONSUMED".equals(opp.getStatus())) {
            throw new BusinessException(OpportunityErrorCode.OPPORTUNITY_ALREADY_CONSUMED.code(),
                    OpportunityErrorCode.OPPORTUNITY_ALREADY_CONSUMED.message());
        }
        if ("EXPIRED".equals(opp.getStatus())) {
            throw new BusinessException(OpportunityErrorCode.OPPORTUNITY_EXPIRED.code(),
                    OpportunityErrorCode.OPPORTUNITY_EXPIRED.message());
        }

        opp.setStatus("CONSUMED");
        opp.setConsumedAt(Instant.now());
        opp.setUpdatedAt(java.time.LocalDateTime.now());
        opportunityRepository.save(opp);

        log.info("Opportunity consumed: id={}, member={}", opportunityId, opp.getMemberId());
        return toDTO(opp);
    }

    /**
     * 内部 Entity → DTO。
     */
    private Opportunity toDTO(CampaignOpportunity entity) {
        return Opportunity.builder()
                .id(entity.getId())
                .memberId(entity.getMemberId())
                .segmentCode(entity.getSegmentCode())
                .opportunityType(entity.getOpportunityType())
                .score(entity.getScore())
                .churnProbability(entity.getChurnProbability())
                .upliftScore(entity.getUpliftScore())
                .conversionProbability(entity.getConversionProbability())
                .rfmScore(entity.getRfmScore())
                .externalInfluence(entity.getExternalInfluence())
                .externalSignalIds(entity.getExternalSignalIds() != null
                        ? List.of(entity.getExternalSignalIds()) : List.of())
                .recommendedAction(entity.getRecommendedAction())
                .recommendedChannel(entity.getRecommendedChannel())
                .confidence(entity.getConfidence())
                .status(entity.getStatus())
                .source(entity.getSource())
                .detectedAt(entity.getDetectedAt())
                .expiresAt(entity.getExpiresAt())
                .build();
    }

    private String getProgramCodeFromGoal(CampaignGoal goal) {
        // 从 Goal → Workspace → programCode 推导
        if (goal.getWorkspaceId() != null) {
            return workspaceRepository.findById(goal.getWorkspaceId())
                    .map(CampaignWorkspace::getProgramCode)
                    .orElse("PROG001");
        }
        return "PROG001";
    }
}
