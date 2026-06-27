package com.loyalty.platform.campaign.decision.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.decision.DecisionErrorCode;
import com.loyalty.platform.campaign.decision.dto.*;
import com.loyalty.platform.campaign.event.CampaignEventService;
import com.loyalty.platform.campaign.planning.service.InitiativeService;
import com.loyalty.platform.campaign.planning.service.PortfolioService;
import com.loyalty.platform.campaign.planning.service.WorkspaceLockService;
import com.loyalty.platform.campaign.planning.service.WorkspaceService;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.common.exception.ResourceNotFoundException;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 营销决策引擎 — 预算分配 + 冲突仲裁 + 注意力校验 + 优先级排序。
 *
 * <p>核心流程：
 * <ol>
 *   <li>加载工作区上下文（Goal/Initiative/Portfolio）</li>
 *   <li>从 Opportunity 构建决策候选</li>
 *   <li>贪心预算分配（ROI 排序 + 二次优先级分配）</li>
 *   <li>注意力预算校验（频控过滤）</li>
 *   <li>冲突仲裁（用户/预算/渠道三维冲突）</li>
 *   <li>优先级排序（加权评分）</li>
 *   <li>持久化决策结果</li>
 * </ol>
 */
@Service
@Transactional
public class DecisionEngineService {

    private static final Logger log = LoggerFactory.getLogger(DecisionEngineService.class);

    // 冲突仲裁权重
    private static final double WEIGHT_ROI = 0.4;
    private static final double WEIGHT_OPPORTUNITY = 0.3;
    private static final double WEIGHT_STRATEGIC = 0.2;
    private static final double WEIGHT_RECENCY = 0.1;

    private static final double MIN_ROI_THRESHOLD = 1.2;
    private static final int MAX_BUDGET_ITERATIONS = 1000;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // --- existing dependencies ---
    private final UserAttentionBudgetRepository attentionBudgetRepository;

    // --- new dependencies ---
    private final CampaignDecisionResultRepository decisionResultRepository;
    private final CampaignBudgetAllocationRepository budgetAllocationRepository;
    private final CampaignArbitrationLogRepository arbitrationLogRepository;
    private final CampaignOpportunityRepository opportunityRepository;
    private final InitiativeService initiativeService;
    private final PortfolioService portfolioService;
    private final WorkspaceService workspaceService;
    private final WorkspaceLockService lockService;
    private final SimulationEngine simulationEngine;
    private final CampaignEventService eventService;

    public DecisionEngineService(UserAttentionBudgetRepository attentionBudgetRepository,
                                  CampaignDecisionResultRepository decisionResultRepository,
                                  CampaignBudgetAllocationRepository budgetAllocationRepository,
                                  CampaignArbitrationLogRepository arbitrationLogRepository,
                                  CampaignOpportunityRepository opportunityRepository,
                                  InitiativeService initiativeService,
                                  PortfolioService portfolioService,
                                  WorkspaceService workspaceService,
                                  WorkspaceLockService lockService,
                                  SimulationEngine simulationEngine,
                                  CampaignEventService eventService) {
        this.attentionBudgetRepository = attentionBudgetRepository;
        this.decisionResultRepository = decisionResultRepository;
        this.budgetAllocationRepository = budgetAllocationRepository;
        this.arbitrationLogRepository = arbitrationLogRepository;
        this.opportunityRepository = opportunityRepository;
        this.initiativeService = initiativeService;
        this.portfolioService = portfolioService;
        this.workspaceService = workspaceService;
        this.lockService = lockService;
        this.simulationEngine = simulationEngine;
        this.eventService = eventService;
    }

    // ========================================================================
    // 完整决策流程（核心方法）
    // ========================================================================

    /**
     * 执行完整决策 — 从机会加载到结果持久化的全链路。
     *
     * <p>执行流程：
     * <ol>
     *   <li>加载决策输入（Workspace/Portfolio/Initiative/Opportunity）</li>
     *   <li>构建候选列表（Initiative 级别聚合）</li>
     *   <li>预算分配（贪心 + ROI 排序）</li>
     *   <li>注意力预算校验（频控）</li>
     *   <li>冲突仲裁（用户/渠道/预算冲突）</li>
     *   <li>优先级排序（执行顺序）</li>
     *   <li>保存决策结果</li>
     * </ol>
     */
    public DecisionResultResponse executeFullDecision(DecisionRequest request) {
        String workspaceId = request.getWorkspaceId();
        String portfolioId = request.getPortfolioId();

        log.info("Starting full decision execution: workspace={}, portfolio={}", workspaceId, portfolioId);

        return lockService.executeWithLock(workspaceId, () -> {
            // 1. 加载工作区上下文
            workspaceService.loadContext(workspaceId);
            CampaignPortfolio portfolio = portfolioService.getPortfolio(portfolioId);

            // 校验 Portfolio 状态
            if (!"OPTIMIZED".equals(portfolio.getStatus()) && !"DRAFT".equals(portfolio.getStatus())) {
                throw new BusinessException(DecisionErrorCode.PORTFOLIO_NOT_OPTIMIZED.getCode(), DecisionErrorCode.PORTFOLIO_NOT_OPTIMIZED.getMessage());
            }

            // 2. 获取活跃的 Initiatives
            List<CampaignInitiative> initiatives = initiativeService.getActiveInitiatives(workspaceId);
            if (initiatives.isEmpty()) {
                throw new BusinessException(DecisionErrorCode.NO_CANDIDATES.getCode(), DecisionErrorCode.NO_CANDIDATES.getMessage());
            }

            // 3. 获取活跃的机会（按 Initiative 分组）
            Map<String, List<CampaignOpportunity>> opportunitiesByInitiative =
                    loadOpportunitiesByInitiative(initiatives);

            // 4. 构建候选列表
            List<DecisionCandidateInternal> candidates = buildCandidates(
                    initiatives, opportunitiesByInitiative, portfolio.getTotalBudget());

            if (candidates.isEmpty()) {
                throw new BusinessException(DecisionErrorCode.NO_CANDIDATES.getCode(), DecisionErrorCode.NO_CANDIDATES.getMessage());
            }

            // 5. 预算分配
            List<BudgetAllocationInternal> allocations = allocateBudgetInternal(
                    candidates, portfolio.getTotalBudget());

            // 6. 注意力预算校验
            List<BudgetAllocationInternal> validatedAllocations = validateAttentionBudget(allocations);

            // 7. 冲突仲裁
            List<BudgetAllocationInternal> arbitratedAllocations = arbitrateConflicts(validatedAllocations,
                    candidates);

            // 8. 优先级排序
            List<BudgetAllocationInternal> prioritizedAllocations = prioritizeInternal(
                    arbitratedAllocations, candidates);

            // 9. 构建决策结果实体
            CampaignDecisionResult resultEntity = buildDecisionResultEntity(
                    request, candidates, prioritizedAllocations, portfolio);

            // 10. 持久化
            resultEntity = decisionResultRepository.save(resultEntity);
            persistAllocations(prioritizedAllocations, resultEntity.getId());
            persistArbitrationLogs(prioritizedAllocations, resultEntity.getId());

            // 11. 构建响应
            DecisionResultResponse response = buildResponse(resultEntity, prioritizedAllocations,
                    candidates, initiatives);

            log.info("Decision completed: id={}, allocated={}, conflicts={}",
                    resultEntity.getId(), resultEntity.getTotalAllocated(),
                    resultEntity.getConflictsResolved());

            return response;
        });
    }

    /**
     * 加载 Initiatives 对应的活跃机会，按 Initiative ID 分组。
     */
    private Map<String, List<CampaignOpportunity>> loadOpportunitiesByInitiative(
            List<CampaignInitiative> initiatives) {
        List<String> initiativeIds = initiatives.stream()
                .map(CampaignInitiative::getId)
                .collect(Collectors.toList());

        List<CampaignOpportunity> allOpportunities =
                opportunityRepository.findByGoalIdInAndStatus(
                        initiativeIds.stream().distinct().collect(Collectors.toList()), "ACTIVE");

        // 通过 initiative → goal → opportunity 的间接关系分组
        // 实际上 Opportunity 关联的是 goal_id，Initiative 也关联 goal_id
        Map<String, String> initiativeGoalMap = initiatives.stream()
                .collect(Collectors.toMap(CampaignInitiative::getId, CampaignInitiative::getGoalId));

        Map<String, List<CampaignOpportunity>> result = new HashMap<>();
        for (CampaignInitiative initiative : initiatives) {
            String goalId = initiativeGoalMap.get(initiative.getId());
            List<CampaignOpportunity> goalOpps = allOpportunities.stream()
                    .filter(o -> goalId.equals(o.getGoalId()))
                    .collect(Collectors.toList());
            result.put(initiative.getId(), goalOpps);
        }
        return result;
    }

    // ========================================================================
    // 候选构建
    // ========================================================================

    /**
     * 构建决策候选列表（内部表示）。
     *
     * <p>对每个 Initiative：
     * <ol>
     *   <li>聚合其下的 Opportunity 指标</li>
     *   <li>调用 Simulation Engine 预测 ROI</li>
     *   <li>计算最小/最大有效预算</li>
     *   <li>生成 DecisionCandidateInternal</li>
     * </ol>
     */
    private List<DecisionCandidateInternal> buildCandidates(
            List<CampaignInitiative> initiatives,
            Map<String, List<CampaignOpportunity>> opportunitiesByInitiative,
            BigDecimal totalBudget) {

        List<DecisionCandidateInternal> candidates = new ArrayList<>();

        for (CampaignInitiative initiative : initiatives) {
            List<CampaignOpportunity> opportunities = opportunitiesByInitiative.getOrDefault(
                    initiative.getId(), Collections.emptyList());

            if (opportunities.isEmpty()) {
                log.debug("Skipping initiative {} — no active opportunities", initiative.getId());
                continue;
            }

            // 计算聚合指标
            double avgScore = opportunities.stream()
                    .mapToDouble(o -> o.getScore() != null ? o.getScore().doubleValue() : 0)
                    .average()
                    .orElse(0);

            double totalEstimatedCost = opportunities.stream()
                    .mapToDouble(o -> o.getUpliftScore() != null
                            ? o.getUpliftScore().doubleValue() * 100
                            : 50)
                    .sum();

            // 调用 Simulation Engine 预测 Initiative ROI
            SimulationResult simResult = simulationEngine.predictInitiativeROI(
                    initiative.getId(),
                    totalBudget != null ? totalBudget.multiply(BigDecimal.valueOf(0.1)) : BigDecimal.valueOf(50000));

            // 计算最小/最大有效预算
            long opportunityCount = opportunities.size();
            BigDecimal minBudget = BigDecimal.valueOf(opportunityCount * 5L);
            BigDecimal maxBudget = BigDecimal.valueOf(opportunityCount * 200L);

            // 确定最佳渠道
            String bestChannel = determineBestChannel(opportunities);

            // 获取战略权重和分群配置
            double strategicWeight = initiative.getPriority() != null
                    ? Math.min(initiative.getPriority() / 100.0, 1.0)
                    : 0.5;
            String segment = initiative.getRuleConfig() != null
                    ? (String) initiative.getRuleConfig().get("segment")
                    : null;

            candidates.add(DecisionCandidateInternal.builder()
                    .initiativeId(initiative.getId())
                    .initiativeName(initiative.getName())
                    .opportunityIds(opportunities.stream()
                            .map(CampaignOpportunity::getId)
                            .collect(Collectors.toList()))
                    .opportunityCount(opportunityCount)
                    .avgOpportunityScore(avgScore)
                    .expectedROI(simResult.getExpectedROI() != null
                            ? simResult.getExpectedROI()
                            : BigDecimal.valueOf(1.0))
                    .estimatedTotalCost(BigDecimal.valueOf(totalEstimatedCost))
                    .recommendedChannel(bestChannel)
                    .targetSegment(segment)
                    .priority(initiative.getPriority() != null ? initiative.getPriority() : 100)
                    .minBudget(minBudget)
                    .maxBudget(maxBudget)
                    .strategicWeight(strategicWeight)
                    .recencyBoost(calculateRecencyBoost(opportunities))
                    .build());
        }

        // 按优先级和 ROI 排序
        candidates.sort((a, b) -> {
            int priorityCompare = Integer.compare(a.getPriority(), b.getPriority());
            if (priorityCompare != 0) return priorityCompare;
            return b.getExpectedROI().compareTo(a.getExpectedROI());
        });

        return candidates;
    }

    /**
     * 确定 Initiative 下机会的最佳渠道（按出现频率）。
     */
    private String determineBestChannel(List<CampaignOpportunity> opportunities) {
        return opportunities.stream()
                .map(CampaignOpportunity::getRecommendedChannel)
                .filter(Objects::nonNull)
                .collect(Collectors.groupingBy(c -> c, Collectors.counting()))
                .entrySet().stream()
                .max(Map.Entry.comparingByValue())
                .map(Map.Entry::getKey)
                .orElse("EMAIL");
    }

    /**
     * 计算时效性 boost — 机会越新权重越高。
     */
    private double calculateRecencyBoost(List<CampaignOpportunity> opportunities) {
        long freshCount = opportunities.stream()
                .filter(o -> o.getDetectedAt() != null
                        && o.getDetectedAt().isAfter(Instant.now().minusSeconds(86400 * 7)))
                .count();
        return opportunities.isEmpty() ? 0.5 : (double) freshCount / opportunities.size();
    }

    // ========================================================================
    // 预算分配（内部版本 — 含 minBudget/maxBudget 约束）
    // ========================================================================

    /**
     * 预算分配 — 含最小/最大预算约束的贪心分配。
     *
     * <p>算法：
     * <ol>
     *   <li>候选按 expectedROI 降序排序</li>
     *   <li>贪心分配：每个候选取 maxBudget 和 remaining 的较小值</li>
     *   <li>只有达到 minBudget 才分配</li>
     *   <li>剩余预算按优先级二次分配</li>
     * </ol>
     */
    private List<BudgetAllocationInternal> allocateBudgetInternal(
            List<DecisionCandidateInternal> candidates, BigDecimal totalBudget) {

        if (totalBudget == null || totalBudget.compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException(DecisionErrorCode.INSUFFICIENT_BUDGET.getCode(), DecisionErrorCode.INSUFFICIENT_BUDGET.getMessage());
        }

        List<BudgetAllocationInternal> allocations = new ArrayList<>();

        // 按 ROI 降序排序
        candidates.sort((a, b) -> b.getExpectedROI().compareTo(a.getExpectedROI()));

        BigDecimal remaining = totalBudget;
        int iteration = 0;

        for (DecisionCandidateInternal candidate : candidates) {
            if (++iteration > MAX_BUDGET_ITERATIONS) {
                log.warn("Budget allocation reached max iterations ({})", MAX_BUDGET_ITERATIONS);
                break;
            }

            BigDecimal suggestedBudget = candidate.getMaxBudget().min(remaining);

            if (suggestedBudget.compareTo(candidate.getMinBudget()) >= 0) {
                allocations.add(BudgetAllocationInternal.builder()
                        .initiativeId(candidate.getInitiativeId())
                        .initiativeName(candidate.getInitiativeName())
                        .allocatedBudget(suggestedBudget)
                        .expectedROI(candidate.getExpectedROI())
                        .channel(candidate.getRecommendedChannel())
                        .opportunityCount(candidate.getOpportunityCount())
                        .status("PENDING")
                        .build());
                remaining = remaining.subtract(suggestedBudget);

                log.debug("Allocated {} to initiative {} (ROI: {})",
                        suggestedBudget, candidate.getInitiativeName(), candidate.getExpectedROI());
            }

            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
        }

        // 剩余预算按优先级二次分配
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            candidates.sort(Comparator.comparingInt(DecisionCandidateInternal::getPriority));
            for (DecisionCandidateInternal candidate : candidates) {
                boolean alreadyAllocated = allocations.stream()
                        .anyMatch(a -> a.getInitiativeId().equals(candidate.getInitiativeId()));
                if (alreadyAllocated) continue;

                BigDecimal budget = candidate.getMinBudget().min(remaining);
                if (budget.compareTo(BigDecimal.ZERO) > 0) {
                    allocations.add(BudgetAllocationInternal.builder()
                            .initiativeId(candidate.getInitiativeId())
                            .initiativeName(candidate.getInitiativeName())
                            .allocatedBudget(budget)
                            .expectedROI(candidate.getExpectedROI())
                            .channel(candidate.getRecommendedChannel())
                            .opportunityCount(candidate.getOpportunityCount())
                            .status("PENDING")
                            .build());
                    remaining = remaining.subtract(budget);
                }
                if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            }
        }

        log.info("Budget allocation: {} initiatives, remaining budget: {}",
                allocations.size(), remaining);
        return allocations;
    }

    // ========================================================================
    // 注意力预算校验
    // ========================================================================

    /**
     * 注意力预算校验 — 过滤因频控限制不可用的分配。
     *
     * <p>如果 Initiative 下可用用户少于 50%，跳过该分配。
     * 否则按可用用户比例调整预算。
     */
    private List<BudgetAllocationInternal> validateAttentionBudget(
            List<BudgetAllocationInternal> allocations) {

        List<BudgetAllocationInternal> validated = new ArrayList<>();

        for (BudgetAllocationInternal allocation : allocations) {
            // 获取该 Initiative 关联的用户（通过 Opportunity）
            List<String> userIds = getInitiativeUserIds(allocation.getInitiativeId());
            String channel = allocation.getChannel();

            if (userIds.isEmpty()) {
                validated.add(allocation);
                continue;
            }

            // 检查频控
            long availableCount = userIds.stream()
                    .filter(uid -> {
                        UserAttentionBudget budget = attentionBudgetRepository
                                .findByUserIdAndDateAndChannel(uid, java.time.LocalDate.now(), channel);
                        return budget == null || budget.getUsedExposure() < budget.getMaxExposure();
                    })
                    .count();

            double ratio = (double) availableCount / userIds.size();

            if (ratio < 0.5) {
                log.warn("Skipping allocation {} — attention budget constraints: {}/{} users available",
                        allocation.getInitiativeId(), availableCount, userIds.size());
                allocation.setAttentionFiltered(true);
                allocation.setAttentionFilterReason(
                        String.format("Only %d/%d users available (%.0f%%)",
                                availableCount, userIds.size(), ratio * 100));
                continue;
            }

            // 按可用用户比例调整预算
            BigDecimal adjustedBudget = allocation.getAllocatedBudget()
                    .multiply(BigDecimal.valueOf(ratio));
            allocation.setAllocatedBudget(adjustedBudget);
            allocation.setAttentionValidated(true);
            validated.add(allocation);
        }

        return validated;
    }

    /**
     * 获取 Initiative 关联的用户 ID 列表（通过 Opportunity）。
     */
    private List<String> getInitiativeUserIds(String initiativeId) {
        // 通过 goal → opportunity → member 关系获取用户
        try {
            CampaignInitiative initiative = initiativeService.getInitiative(initiativeId);
            List<CampaignOpportunity> opportunities =
                    opportunityRepository.findByGoalIdAndStatus(initiative.getGoalId(), "ACTIVE");
            return opportunities.stream()
                    .map(CampaignOpportunity::getMemberId)
                    .distinct()
                    .collect(Collectors.toList());
        } catch (Exception e) {
            log.warn("Failed to load user IDs for initiative {}: {}", initiativeId, e.getMessage());
            return Collections.emptyList();
        }
    }

    // ========================================================================
    // 冲突仲裁
    // ========================================================================

    /**
     * 冲突仲裁 — 解决用户/渠道/预算三维冲突。
     *
     * <p>冲突类型：
     * <ul>
     *   <li>用户冲突：同一用户被多个 Initiative 选中</li>
     *   <li>渠道冲突：同一渠道容量超限</li>
     *   <li>预算冲突：总预算不足</li>
     * </ul>
     */
    private List<BudgetAllocationInternal> arbitrateConflicts(
            List<BudgetAllocationInternal> allocations,
            List<DecisionCandidateInternal> candidates) {

        Map<String, DecisionCandidateInternal> candidateMap = candidates.stream()
                .collect(Collectors.toMap(DecisionCandidateInternal::getInitiativeId, c -> c));

        List<BudgetAllocationInternal> result = new ArrayList<>(allocations);

        // 渠道容量冲突检测
        Map<String, List<BudgetAllocationInternal>> byChannel = result.stream()
                .collect(Collectors.groupingBy(a -> a.getChannel() != null ? a.getChannel() : "EMAIL"));

        for (Map.Entry<String, List<BudgetAllocationInternal>> entry : byChannel.entrySet()) {
            String channel = entry.getKey();
            List<BudgetAllocationInternal> channelAllocs = entry.getValue();

            BigDecimal totalChannelBudget = channelAllocs.stream()
                    .map(BudgetAllocationInternal::getAllocatedBudget)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);

            // 默认渠道容量
            BigDecimal capacity = getDefaultChannelCapacity(channel);

            if (totalChannelBudget.compareTo(capacity) > 0) {
                double ratio = capacity.doubleValue() / totalChannelBudget.doubleValue();
                for (BudgetAllocationInternal alloc : channelAllocs) {
                    BigDecimal adjusted = alloc.getAllocatedBudget()
                            .multiply(BigDecimal.valueOf(ratio));
                    alloc.setAllocatedBudget(adjusted);
                    alloc.setConflictResolved(true);
                    alloc.setConflictReason("CHANNEL_CAPACITY");
                }
                log.info("Channel conflict resolved: {} — scaled by {:.2f}", channel, ratio);
            }
        }

        return result;
    }

    private BigDecimal getDefaultChannelCapacity(String channel) {
        switch (channel.toUpperCase()) {
            case "EMAIL": return BigDecimal.valueOf(50000);
            case "SMS": return BigDecimal.valueOf(20000);
            case "PUSH": return BigDecimal.valueOf(30000);
            case "WECHAT": return BigDecimal.valueOf(15000);
            default: return BigDecimal.valueOf(10000);
        }
    }

    // ========================================================================
    // 优先级排序
    // ========================================================================

    /**
     * 优先级排序 — 按加权评分降序排列并分配执行顺序。
     *
     * <p>公式：PriorityScore = 0.4*ROI + 0.3*OpportunityScore + 0.2*StrategicWeight + 0.1*RecencyBoost
     */
    private List<BudgetAllocationInternal> prioritizeInternal(
            List<BudgetAllocationInternal> allocations,
            List<DecisionCandidateInternal> candidates) {

        Map<String, DecisionCandidateInternal> candidateMap = candidates.stream()
                .collect(Collectors.toMap(DecisionCandidateInternal::getInitiativeId, c -> c));

        // 按优先级分数排序
        allocations.sort((a, b) -> {
            DecisionCandidateInternal ca = candidateMap.get(a.getInitiativeId());
            DecisionCandidateInternal cb = candidateMap.get(b.getInitiativeId());
            double scoreA = ca != null ? calculatePriorityScore(ca) : 0.5;
            double scoreB = cb != null ? calculatePriorityScore(cb) : 0.5;
            return Double.compare(scoreB, scoreA);
        });

        // 设置执行顺序和优先级分数
        for (int i = 0; i < allocations.size(); i++) {
            allocations.get(i).setExecutionOrder(i + 1);
            DecisionCandidateInternal c = candidateMap.get(allocations.get(i).getInitiativeId());
            if (c != null) {
                allocations.get(i).setPriorityScore(roundTo2(calculatePriorityScore(c)));
            }
        }

        return allocations;
    }

    // ========================================================================
    // 持久化
    // ========================================================================

    /**
     * 构建决策结果实体。
     */
    private CampaignDecisionResult buildDecisionResultEntity(
            DecisionRequest request,
            List<DecisionCandidateInternal> candidates,
            List<BudgetAllocationInternal> allocations,
            CampaignPortfolio portfolio) {

        BigDecimal totalAllocated = allocations.stream()
                .map(BudgetAllocationInternal::getAllocatedBudget)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        double totalExpectedROI = allocations.isEmpty() ? 0 :
                allocations.stream()
                        .mapToDouble(a -> a.getExpectedROI().doubleValue()
                                * a.getAllocatedBudget().doubleValue())
                        .sum() / totalAllocated.doubleValue();

        Set<String> allocatedIds = allocations.stream()
                .map(BudgetAllocationInternal::getInitiativeId)
                .collect(Collectors.toSet());

        int rejectedCount = (int) candidates.stream()
                .filter(c -> !allocatedIds.contains(c.getInitiativeId()))
                .count();

        long conflictCount = allocations.stream()
                .filter(a -> a.isConflictResolved())
                .count();

        String decisionId = UUID.randomUUID().toString();

        try {
            return CampaignDecisionResult.builder()
                    .id(decisionId)
                    .workspaceId(request.getWorkspaceId())
                    .portfolioId(request.getPortfolioId())
                    .goalId(request.getGoalId())
                    .decisionType("FULL_DECISION")
                    .status("DRAFT")
                    .inputSnapshot(objectMapper.writeValueAsString(request))
                    .allocationResult(objectMapper.writeValueAsString(buildAllocationMap(allocations)))
                    .arbitrationResult(objectMapper.writeValueAsString(buildArbitrationMap(allocations)))
                    .prioritizationResult(objectMapper.writeValueAsString(buildPrioritizationMap(allocations)))
                    .totalBudget(portfolio.getTotalBudget())
                    .totalAllocated(totalAllocated)
                    .expectedTotalRoi(BigDecimal.valueOf(totalExpectedROI))
                    .conflictsResolved((int) conflictCount)
                    .rejectedCandidates(rejectedCount)
                    .createdBy("system") // TODO: from SecurityContext
                    .createdAt(Instant.now())
                    .build();
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Failed to serialize decision result", e);
        }
    }

    private void persistAllocations(List<BudgetAllocationInternal> allocations, String decisionId) {
        for (BudgetAllocationInternal alloc : allocations) {
            CampaignBudgetAllocation entity = CampaignBudgetAllocation.builder()
                    .id(UUID.randomUUID().toString())
                    .decisionId(decisionId)
                    .initiativeId(alloc.getInitiativeId())
                    .allocatedBudget(alloc.getAllocatedBudget())
                    .expectedRoi(alloc.getExpectedROI())
                    .status(alloc.getStatus())
                    .createdAt(Instant.now())
                    .updatedAt(Instant.now())
                    .build();
            budgetAllocationRepository.save(entity);
        }
    }

    private void persistArbitrationLogs(List<BudgetAllocationInternal> allocations, String decisionId) {
        List<BudgetAllocationInternal> conflicted = allocations.stream()
                .filter(BudgetAllocationInternal::isConflictResolved)
                .collect(Collectors.toList());

        for (BudgetAllocationInternal alloc : conflicted) {
            CampaignArbitrationLog logEntity = CampaignArbitrationLog.builder()
                    .id(UUID.randomUUID().toString())
                    .decisionId(decisionId)
                    .conflictType(alloc.getConflictReason() != null ? alloc.getConflictReason() : "UNKNOWN")
                    .candidateIds(new String[]{alloc.getInitiativeId()})
                    .resolution(alloc.getInitiativeId())
                    .resolutionReason("Budget adjusted due to " + alloc.getConflictReason())
                    .priorityScores("{\"score\":" + alloc.getPriorityScore() + "}")
                    .createdAt(Instant.now())
                    .build();
            arbitrationLogRepository.save(logEntity);
        }
    }

    // ========================================================================
    // 构建响应
    // ========================================================================

    private DecisionResultResponse buildResponse(
            CampaignDecisionResult entity,
            List<BudgetAllocationInternal> allocations,
            List<DecisionCandidateInternal> candidates,
            List<CampaignInitiative> initiatives) {

        Map<String, CampaignInitiative> initiativeMap = initiatives.stream()
                .collect(Collectors.toMap(CampaignInitiative::getId, i -> i));

        BigDecimal totalBudget = entity.getTotalBudget() != null ? entity.getTotalBudget() : BigDecimal.ZERO;

        List<DecisionResultResponse.AllocationDetail> details = allocations.stream()
                .map(a -> {
                    double pct = totalBudget.compareTo(BigDecimal.ZERO) > 0
                            ? a.getAllocatedBudget().divide(totalBudget, 4, RoundingMode.HALF_UP)
                                    .doubleValue() * 100
                            : 0;
                    CampaignInitiative init = initiativeMap.get(a.getInitiativeId());
                    return DecisionResultResponse.AllocationDetail.builder()
                            .initiativeId(a.getInitiativeId())
                            .initiativeName(init != null ? init.getName() : a.getInitiativeName())
                            .allocatedBudget(a.getAllocatedBudget())
                            .expectedRoi(a.getExpectedROI())
                            .percentage(roundTo2(pct))
                            .executionOrder(a.getExecutionOrder())
                            .priorityScore(a.getPriorityScore())
                            .opportunityCount(a.getOpportunityCount())
                            .targetUserCount(a.getTargetUserCount() > 0 ? a.getTargetUserCount() : null)
                            .status(a.getStatus())
                            .build();
                })
                .collect(Collectors.toList());

        // 仲裁摘要
        long userConflicts = allocations.stream()
                .filter(a -> "USER_CONFLICT".equals(a.getConflictReason())).count();
        long budgetConflicts = allocations.stream()
                .filter(a -> "BUDGET".equals(a.getConflictReason())).count();
        long channelConflicts = allocations.stream()
                .filter(a -> "CHANNEL_CAPACITY".equals(a.getConflictReason())).count();
        long resolved = allocations.stream().filter(BudgetAllocationInternal::isConflictResolved).count();

        return DecisionResultResponse.builder()
                .decisionId(entity.getId())
                .workspaceId(entity.getWorkspaceId())
                .portfolioId(entity.getPortfolioId())
                .goalId(entity.getGoalId())
                .decisionType(entity.getDecisionType())
                .status(entity.getStatus())
                .totalBudget(entity.getTotalBudget())
                .totalAllocated(entity.getTotalAllocated())
                .expectedTotalRoi(entity.getExpectedTotalRoi())
                .conflictsResolved(entity.getConflictsResolved())
                .rejectedCandidates(entity.getRejectedCandidates())
                .allocations(details)
                .arbitrationSummary(DecisionResultResponse.ArbitrationSummary.builder()
                        .userConflicts((int) userConflicts)
                        .budgetConflicts((int) budgetConflicts)
                        .channelConflicts((int) channelConflicts)
                        .resolved((int) resolved)
                        .build())
                .createdBy(entity.getCreatedBy())
                .createdAt(entity.getCreatedAt())
                .appliedAt(entity.getAppliedAt())
                .build();
    }

    // ========================================================================
    // 应用决策 / 回滚 / 查询
    // ========================================================================

    /**
     * 应用决策 — 将决策状态从 DRAFT 切换为 APPLIED，触发执行。
     */
    public DecisionResultResponse applyDecision(String decisionId) {
        CampaignDecisionResult decision = decisionResultRepository.findById(decisionId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        DecisionErrorCode.DECISION_NOT_FOUND.getMessage()));

        if ("APPLIED".equals(decision.getStatus())) {
            throw new BusinessException(DecisionErrorCode.DECISION_ALREADY_APPLIED.getCode(), DecisionErrorCode.DECISION_ALREADY_APPLIED.getMessage());
        }

        decision.setStatus("APPLIED");
        decision.setAppliedAt(Instant.now());
        decisionResultRepository.save(decision);

        // 发布 DECISION_APPLIED 事件，触发 Zeebe 执行
        Map<String, Object> eventPayload = new HashMap<>();
        eventPayload.put("decisionId", decision.getId());
        eventPayload.put("workspaceId", decision.getWorkspaceId());
        eventPayload.put("portfolioId", decision.getPortfolioId());
        eventService.publish("DECISION_APPLIED", decision.getPortfolioId(), eventPayload);

        log.info("Decision applied: id={}, triggering execution", decisionId);

        // 构建简易响应
        return DecisionResultResponse.builder()
                .decisionId(decision.getId())
                .status(decision.getStatus())
                .appliedAt(decision.getAppliedAt())
                .build();
    }

    /**
     * 获取 Portfolio 最新决策。
     */
    @Transactional(readOnly = true)
    public DecisionResultResponse getLatestDecision(String portfolioId) {
        CampaignDecisionResult decision = decisionResultRepository
                .findFirstByPortfolioIdOrderByCreatedAtDesc(portfolioId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        DecisionErrorCode.DECISION_NOT_FOUND.getMessage()));

        return buildResponseFromEntity(decision);
    }

    /**
     * 获取决策详情。
     */
    @Transactional(readOnly = true)
    public DecisionResultResponse getDecision(String decisionId) {
        CampaignDecisionResult decision = decisionResultRepository.findById(decisionId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        DecisionErrorCode.DECISION_NOT_FOUND.getMessage()));

        return buildResponseFromEntity(decision);
    }

    /**
     * 获取历史决策列表（按 Workspace）。
     */
    @Transactional(readOnly = true)
    public Page<DecisionSummary> getDecisionHistory(String workspaceId, int page, int size) {
        Page<CampaignDecisionResult> results = decisionResultRepository
                .findByWorkspaceIdOrderByCreatedAtDesc(workspaceId, PageRequest.of(page, size));

        return results.map(r -> DecisionSummary.builder()
                .decisionId(r.getId())
                .workspaceId(r.getWorkspaceId())
                .portfolioId(r.getPortfolioId())
                .decisionType(r.getDecisionType())
                .status(r.getStatus())
                .totalBudget(r.getTotalBudget())
                .totalAllocated(r.getTotalAllocated())
                .expectedTotalRoi(r.getExpectedTotalRoi())
                .allocationCount(0) // 懒加载，列表不查明细
                .conflictsResolved(r.getConflictsResolved())
                .createdBy(r.getCreatedBy())
                .createdAt(r.getCreatedAt())
                .appliedAt(r.getAppliedAt())
                .build());
    }

    private DecisionResultResponse buildResponseFromEntity(CampaignDecisionResult entity) {
        List<CampaignBudgetAllocation> allocations =
                budgetAllocationRepository.findByDecisionId(entity.getId());

        List<DecisionResultResponse.AllocationDetail> details = allocations.stream()
                .map(a -> {
                    double pct = entity.getTotalBudget() != null
                            && entity.getTotalBudget().compareTo(BigDecimal.ZERO) > 0
                            ? a.getAllocatedBudget()
                                    .divide(entity.getTotalBudget(), 4, RoundingMode.HALF_UP)
                                    .doubleValue() * 100
                            : 0;
                    return DecisionResultResponse.AllocationDetail.builder()
                            .initiativeId(a.getInitiativeId())
                            .allocatedBudget(a.getAllocatedBudget())
                            .expectedRoi(a.getExpectedRoi())
                            .percentage(roundTo2(pct))
                            .status(a.getStatus())
                            .build();
                })
                .collect(Collectors.toList());

        return DecisionResultResponse.builder()
                .decisionId(entity.getId())
                .workspaceId(entity.getWorkspaceId())
                .portfolioId(entity.getPortfolioId())
                .goalId(entity.getGoalId())
                .decisionType(entity.getDecisionType())
                .status(entity.getStatus())
                .totalBudget(entity.getTotalBudget())
                .totalAllocated(entity.getTotalAllocated())
                .expectedTotalRoi(entity.getExpectedTotalRoi())
                .conflictsResolved(entity.getConflictsResolved())
                .rejectedCandidates(entity.getRejectedCandidates())
                .allocations(details)
                .createdBy(entity.getCreatedBy())
                .createdAt(entity.getCreatedAt())
                .appliedAt(entity.getAppliedAt())
                .build();
    }

    // ========================================================================
    // 辅助方法
    // ========================================================================

    /**
     * 计算优先级分数。
     *
     * <p>公式：0.4*ROI + 0.3*OpportunityScore + 0.2*StrategicWeight + 0.1*RecencyBoost
     */
    private double calculatePriorityScore(DecisionCandidateInternal candidate) {
        double normalizedROI = candidate.getExpectedROI() != null
                ? Math.min(candidate.getExpectedROI().doubleValue() / 5.0, 1.0)
                : 0;
        double oppScore = candidate.getAvgOpportunityScore();
        double strategic = candidate.getStrategicWeight() != null ? candidate.getStrategicWeight() : 0.5;
        double recency = candidate.getRecencyBoost() != null ? candidate.getRecencyBoost() : 0.5;

        return WEIGHT_ROI * normalizedROI
                + WEIGHT_OPPORTUNITY * oppScore
                + WEIGHT_STRATEGIC * strategic
                + WEIGHT_RECENCY * recency;
    }

    /** 将 ROI 归一化到 0-1 区间 */
    private double normalizeROI(BigDecimal roi) {
        if (roi == null || roi.compareTo(BigDecimal.ZERO) <= 0) return 0;
        return Math.min(roi.doubleValue() / 5.0, 1.0);
    }

    private double roundTo2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    // --- JSON 构建辅助方法 ---

    private Map<String, Object> buildAllocationMap(List<BudgetAllocationInternal> allocations) {
        List<Map<String, Object>> items = allocations.stream().map(a -> {
            Map<String, Object> m = new HashMap<>();
            m.put("initiativeId", a.getInitiativeId());
            m.put("allocatedBudget", a.getAllocatedBudget());
            m.put("expectedROI", a.getExpectedROI());
            m.put("executionOrder", a.getExecutionOrder());
            m.put("status", a.getStatus());
            return m;
        }).collect(Collectors.toList());
        return Map.of("allocations", items);
    }

    private Map<String, Object> buildArbitrationMap(List<BudgetAllocationInternal> allocations) {
        long resolved = allocations.stream().filter(BudgetAllocationInternal::isConflictResolved).count();
        return Map.of(
                "totalConflicts", resolved,
                "details", allocations.stream()
                        .filter(BudgetAllocationInternal::isConflictResolved)
                        .map(a -> Map.of(
                                "initiativeId", a.getInitiativeId(),
                                "reason", a.getConflictReason() != null ? a.getConflictReason() : "UNKNOWN"
                        ))
                        .collect(Collectors.toList())
        );
    }

    private Map<String, Object> buildPrioritizationMap(List<BudgetAllocationInternal> allocations) {
        return Map.of("order", allocations.stream()
                .map(a -> Map.of(
                        "initiativeId", a.getInitiativeId(),
                        "executionOrder", a.getExecutionOrder(),
                        "priorityScore", a.getPriorityScore()
                ))
                .collect(Collectors.toList()));
    }

    // ========================================================================
    // 公开方法（兼容 v1 API）
    // ========================================================================

    /**
     * 预算分配（贪心 + ROI 排序）— 兼容 v1 API。
     */
    public AllocationResult allocateBudget(List<CampaignCandidate> candidates, BigDecimal totalBudget) {
        if (candidates == null || candidates.isEmpty()) {
            return AllocationResult.builder()
                    .totalBudget(totalBudget)
                    .totalExpectedROI(BigDecimal.ZERO)
                    .allocations(Collections.emptyList())
                    .build();
        }

        List<CampaignCandidate> sorted = candidates.stream()
                .sorted((a, b) -> b.getExpectedROI().compareTo(a.getExpectedROI()))
                .collect(Collectors.toList());

        List<AllocationItem> allocations = new ArrayList<>();
        BigDecimal remaining = totalBudget;
        BigDecimal weightedROISum = BigDecimal.ZERO;
        BigDecimal allocatedTotal = BigDecimal.ZERO;

        for (CampaignCandidate c : sorted) {
            BigDecimal budget = c.getRecommendedBudget().min(remaining);
            if (budget.compareTo(BigDecimal.ZERO) <= 0) break;

            double priorityScore = resolveConflict(c);

            double percentage = totalBudget.compareTo(BigDecimal.ZERO) > 0
                    ? budget.divide(totalBudget, 4, RoundingMode.HALF_UP).doubleValue() * 100
                    : 0;

            allocations.add(AllocationItem.builder()
                    .candidateId(c.getId())
                    .candidateName(c.getName())
                    .initiativeId(c.getInitiativeId())
                    .allocatedBudget(budget)
                    .expectedROI(c.getExpectedROI())
                    .priorityScore(roundTo2(priorityScore))
                    .percentage(roundTo2(percentage))
                    .build());

            weightedROISum = weightedROISum.add(c.getExpectedROI().multiply(budget));
            allocatedTotal = allocatedTotal.add(budget);
            remaining = remaining.subtract(budget);
        }

        BigDecimal totalExpectedROI = allocatedTotal.compareTo(BigDecimal.ZERO) > 0
                ? weightedROISum.divide(allocatedTotal, 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        log.info("Budget allocated: {} candidates, total={}, allocated={}, expectedROI={}",
                allocations.size(), totalBudget, allocatedTotal, totalExpectedROI);

        return AllocationResult.builder()
                .totalBudget(totalBudget)
                .totalExpectedROI(totalExpectedROI)
                .allocations(allocations)
                .build();
    }

    /**
     * 冲突仲裁 — 计算活动候选的优先级分数（兼容 v1 API）。
     */
    public double resolveConflict(CampaignCandidate candidate) {
        double roiScore = normalizeROI(candidate.getExpectedROI());
        double oppScore = candidate.getOpportunityScore();
        double strategic = candidate.getStrategicWeight();
        double recency = candidate.getRecencyBoost();

        return roundTo2(WEIGHT_ROI * roiScore
                + WEIGHT_OPPORTUNITY * oppScore
                + WEIGHT_STRATEGIC * strategic
                + WEIGHT_RECENCY * recency);
    }

    /**
     * 批量冲突仲裁 — 按优先级分数排序（兼容 v1 API）。
     */
    public List<CampaignCandidate> prioritize(List<CampaignCandidate> candidates) {
        candidates.sort((a, b) -> Double.compare(resolveConflict(b), resolveConflict(a)));
        return candidates;
    }

    /**
     * 多维度预算分配 — 考虑渠道容量约束（兼容 v1 API）。
     */
    public AllocationResult allocateWithConstraints(List<CampaignCandidate> candidates,
                                                     BigDecimal totalBudget,
                                                     Map<String, Integer> channelCapacity) {
        List<CampaignCandidate> prioritized = prioritize(candidates);

        List<AllocationItem> allocations = new ArrayList<>();
        BigDecimal remaining = totalBudget;
        BigDecimal weightedROISum = BigDecimal.ZERO;
        BigDecimal allocatedTotal = BigDecimal.ZERO;

        for (CampaignCandidate c : prioritized) {
            Integer capacity = channelCapacity.get(c.getChannel());
            if (capacity != null && capacity <= 0) continue;

            BigDecimal budget = c.getRecommendedBudget().min(remaining);
            if (budget.compareTo(BigDecimal.ZERO) <= 0) break;

            double priorityScore = resolveConflict(c);
            double percentage = totalBudget.compareTo(BigDecimal.ZERO) > 0
                    ? budget.divide(totalBudget, 4, RoundingMode.HALF_UP).doubleValue() * 100
                    : 0;

            allocations.add(AllocationItem.builder()
                    .candidateId(c.getId())
                    .candidateName(c.getName())
                    .initiativeId(c.getInitiativeId())
                    .allocatedBudget(budget)
                    .expectedROI(c.getExpectedROI())
                    .priorityScore(roundTo2(priorityScore))
                    .percentage(roundTo2(percentage))
                    .build());

            weightedROISum = weightedROISum.add(c.getExpectedROI().multiply(budget));
            allocatedTotal = allocatedTotal.add(budget);
            remaining = remaining.subtract(budget);

            if (capacity != null) {
                channelCapacity.put(c.getChannel(), capacity - 1);
            }
        }

        BigDecimal totalExpectedROI = allocatedTotal.compareTo(BigDecimal.ZERO) > 0
                ? weightedROISum.divide(allocatedTotal, 4, RoundingMode.HALF_UP)
                : BigDecimal.ZERO;

        return AllocationResult.builder()
                .totalBudget(totalBudget)
                .totalExpectedROI(totalExpectedROI)
                .allocations(allocations)
                .build();
    }

    // ========================================================================
    // 内部数据类型
    // ========================================================================

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    static class DecisionCandidateInternal {
        private String initiativeId;
        private String initiativeName;
        private List<String> opportunityIds;
        private long opportunityCount;
        private double avgOpportunityScore;
        private BigDecimal expectedROI;
        private BigDecimal estimatedTotalCost;
        private String recommendedChannel;
        private String targetSegment;
        private int priority;
        private BigDecimal minBudget;
        private BigDecimal maxBudget;
        private Double strategicWeight;
        private Double recencyBoost;
    }

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    static class BudgetAllocationInternal {
        private String initiativeId;
        private String initiativeName;
        private BigDecimal allocatedBudget;
        private BigDecimal expectedROI;
        private String channel;
        private long opportunityCount;
        private long targetUserCount;
        private String status;
        private int executionOrder;
        private double priorityScore;
        private boolean attentionValidated;
        private boolean attentionFiltered;
        private String attentionFilterReason;
        private boolean conflictResolved;
        private String conflictReason;
    }
}
