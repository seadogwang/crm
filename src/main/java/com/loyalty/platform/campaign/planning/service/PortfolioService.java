package com.loyalty.platform.campaign.planning.service;

import com.loyalty.platform.campaign.planning.dto.CreatePortfolioRequest;
import com.loyalty.platform.campaign.planning.dto.OptimizationCandidate;
import com.loyalty.platform.campaign.planning.dto.PortfolioContext;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.common.exception.ResourceNotFoundException;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 组合管理服务 — 含贪心优化算法。
 */
@Service
@Transactional
public class PortfolioService {

    private static final Logger log = LoggerFactory.getLogger(PortfolioService.class);

    private final CampaignPortfolioRepository portfolioRepository;
    private final CampaignPortfolioInitiativeRelationRepository relationRepository;
    private final CampaignPortfolioKpiRepository kpiRepository;
    private final InitiativeService initiativeService;
    private final WorkspaceLockService lockService;

    public PortfolioService(CampaignPortfolioRepository portfolioRepository,
                            CampaignPortfolioInitiativeRelationRepository relationRepository,
                            CampaignPortfolioKpiRepository kpiRepository,
                            InitiativeService initiativeService,
                            WorkspaceLockService lockService) {
        this.portfolioRepository = portfolioRepository;
        this.relationRepository = relationRepository;
        this.kpiRepository = kpiRepository;
        this.initiativeService = initiativeService;
        this.lockService = lockService;
    }

    /**
     * 创建 Portfolio（DRAFT 状态）。
     */
    public CampaignPortfolio createPortfolio(CreatePortfolioRequest request) {
        CampaignPortfolio portfolio = CampaignPortfolio.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(request.getWorkspaceId())
                .name(request.getName())
                .description(request.getDescription())
                .status("DRAFT")
                .optimizationMode(request.getOptimizationMode() != null
                        ? request.getOptimizationMode() : "ROI_MAXIMIZATION")
                .totalBudget(request.getTotalBudget())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .createdBy(getCurrentUserId())
                .build();
        portfolio = portfolioRepository.save(portfolio);

        log.info("Portfolio created: id={}, name={}, workspace={}",
                portfolio.getId(), portfolio.getName(), portfolio.getWorkspaceId());
        return portfolio;
    }

    /**
     * 获取 Portfolio。
     */
    @Transactional(readOnly = true)
    public CampaignPortfolio getPortfolio(String portfolioId) {
        return portfolioRepository.findById(portfolioId)
                .orElseThrow(() -> new ResourceNotFoundException("Portfolio not found: " + portfolioId));
    }

    /**
     * 获取 Workspace 下所有 Portfolio。
     */
    @Transactional(readOnly = true)
    public List<CampaignPortfolio> getPortfoliosByWorkspace(String workspaceId) {
        return portfolioRepository.findByWorkspaceId(workspaceId);
    }

    /**
     * 运行优化（核心算法：基于 ROI 的贪心分配）。
     *
     * <p>算法步骤：
     * <ol>
     *   <li>获取 Workspace 下所有 ACTIVE Initiative</li>
     *   <li>对每个 Initiative 预测 ROI（当前为模拟值，生产接入 Simulation Engine）</li>
     *   <li>按 ROI 降序分配预算</li>
     *   <li>输出优化后的 allocation</li>
     * </ol>
     */
    public CampaignPortfolio optimizePortfolio(String portfolioId) {
        final CampaignPortfolio portfolio = getPortfolio(portfolioId);
        if (!"DRAFT".equals(portfolio.getStatus())) {
            throw new BusinessException("ERR_PORTFOLIO_NOT_DRAFT", "Only DRAFT portfolio can be optimized");
        }

        return lockService.executeWithLock(portfolio.getWorkspaceId(), () -> {
            // 1. 获取 Workspace 下所有 ACTIVE Initiative
            List<CampaignInitiative> initiatives = initiativeService.getActiveInitiatives(
                    portfolio.getWorkspaceId());
            if (initiatives.isEmpty()) {
                throw new BusinessException("ERR_NO_ACTIVE_INITIATIVES", "No active initiatives found for optimization");
            }

            // 2. 构建候选列表（含预测 ROI）
            List<OptimizationCandidate> candidates = buildCandidates(initiatives, portfolio.getTotalBudget());

            // 3. 执行优化算法（贪心 + ROI 排序）
            Map<String, BigDecimal> allocation = runOptimization(candidates, portfolio.getTotalBudget());

            // 4. 删除旧分配结果，保存新分配
            List<CampaignPortfolioInitiativeRelation> existingRelations =
                    relationRepository.findByPortfolioId(portfolioId);
            relationRepository.deleteAll(existingRelations);
            relationRepository.flush();

            for (Map.Entry<String, BigDecimal> entry : allocation.entrySet()) {
                OptimizationCandidate candidate = candidates.stream()
                        .filter(c -> c.getInitiativeId().equals(entry.getKey()))
                        .findFirst().orElse(null);

                CampaignPortfolioInitiativeRelation relation = CampaignPortfolioInitiativeRelation.builder()
                        .id(UUID.randomUUID().toString())
                        .portfolioId(portfolioId)
                        .initiativeId(entry.getKey())
                        .allocatedBudget(entry.getValue())
                        .expectedRoi(candidate != null ? candidate.getExpectedROI() : BigDecimal.ZERO)
                        .priorityWeight(BigDecimal.ONE)
                        .build();
                relationRepository.save(relation);
            }

            // 5. 更新 Portfolio 状态
            portfolio.setStatus("OPTIMIZED");
            portfolio.setUpdatedAt(LocalDateTime.now());
            CampaignPortfolio savedPortfolio = portfolioRepository.save(portfolio);

            log.info("Portfolio optimized: id={}, allocated {} initiatives",
                    portfolioId, allocation.size());
            return savedPortfolio;
        });
    }

    /**
     * 构建优化候选列表。
     */
    private List<OptimizationCandidate> buildCandidates(List<CampaignInitiative> initiatives,
                                                        BigDecimal totalBudget) {
        List<OptimizationCandidate> candidates = new ArrayList<>();
        for (CampaignInitiative initiative : initiatives) {
            // 模拟 ROI 预测（生产环境应调用 SimulationEngine）
            BigDecimal expectedROI = simulateROI(initiative);
            BigDecimal minBudget = totalBudget.multiply(BigDecimal.valueOf(0.05)); // 5% 最低预算
            BigDecimal maxBudget = totalBudget.multiply(BigDecimal.valueOf(0.6));  // 60% 最高预算

            OptimizationCandidate candidate = OptimizationCandidate.builder()
                    .initiativeId(initiative.getId())
                    .initiativeName(initiative.getName())
                    .priority(initiative.getPriority())
                    .expectedROI(expectedROI)
                    .minBudget(minBudget)
                    .maxBudget(maxBudget)
                    .build();
            candidates.add(candidate);
        }
        return candidates;
    }

    /**
     * 模拟 ROI 计算（基于 Initiative 类型）。
     * <p>生产环境应替换为 ML 模型预测或历史数据分析。</p>
     */
    private BigDecimal simulateROI(CampaignInitiative initiative) {
        String type = initiative.getInitiativeType();
        if ("WINBACK".equals(type)) return BigDecimal.valueOf(2.3);
        if ("GROWTH".equals(type)) return BigDecimal.valueOf(2.1);
        if ("ENGAGEMENT".equals(type)) return BigDecimal.valueOf(1.8);
        if ("ACQUISITION".equals(type)) return BigDecimal.valueOf(1.5);
        return BigDecimal.valueOf(2.0);
    }

    /**
     * 贪心优化算法。
     *
     * <p>伪代码：
     * <ol>
     *   <li>candidates 按 expectedROI 降序排序</li>
     *   <li>remaining = totalBudget</li>
     *   <li>for each candidate: budget = min(candidate.maxBudget, remaining)</li>
     *   <li>if budget >= candidate.minBudget: allocation[candidate.id] = budget</li>
     *   <li>如果 remaining > 0，按优先级二次分配</li>
     * </ol>
     */
    private Map<String, BigDecimal> runOptimization(List<OptimizationCandidate> candidates,
                                                     BigDecimal totalBudget) {
        // 按 ROI 降序排序
        List<OptimizationCandidate> sorted = candidates.stream()
                .sorted((a, b) -> b.getExpectedROI().compareTo(a.getExpectedROI()))
                .collect(Collectors.toList());

        Map<String, BigDecimal> allocation = new LinkedHashMap<>();
        BigDecimal remaining = totalBudget;

        // 第一轮：按 ROI 分配
        for (OptimizationCandidate candidate : sorted) {
            BigDecimal budget = candidate.getMaxBudget().min(remaining);

            if (budget.compareTo(candidate.getMinBudget()) >= 0) {
                allocation.put(candidate.getInitiativeId(), budget);
                remaining = remaining.subtract(budget);
            }

            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                break;
            }
        }

        // 第二轮：如果还有剩余预算，按优先级二次分配
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            List<OptimizationCandidate> byPriority = candidates.stream()
                    .sorted(Comparator.comparingInt(OptimizationCandidate::getPriority))
                    .collect(Collectors.toList());

            for (OptimizationCandidate candidate : byPriority) {
                if (!allocation.containsKey(candidate.getInitiativeId())) {
                    BigDecimal budget = candidate.getMinBudget().min(remaining);
                    if (budget.compareTo(BigDecimal.ZERO) > 0) {
                        allocation.put(candidate.getInitiativeId(), budget);
                        remaining = remaining.subtract(budget);
                    }
                }
                if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            }
        }

        return allocation;
    }

    /**
     * 锁定 Portfolio（不可再修改）。
     */
    public CampaignPortfolio lockPortfolio(String portfolioId) {
        CampaignPortfolio portfolio = getPortfolio(portfolioId);
        if (!"OPTIMIZED".equals(portfolio.getStatus())) {
            throw new BusinessException("ERR_PORTFOLIO_NOT_OPTIMIZED", "Only OPTIMIZED portfolio can be locked");
        }
        portfolio.setStatus("LOCKED");
        portfolio.setUpdatedAt(LocalDateTime.now());
        portfolio = portfolioRepository.save(portfolio);
        log.info("Portfolio locked: id={}", portfolioId);
        return portfolio;
    }

    /**
     * 获取 Portfolio 上下文。
     */
    @Transactional(readOnly = true)
    public PortfolioContext loadContext(String portfolioId) {
        CampaignPortfolio portfolio = getPortfolio(portfolioId);
        List<CampaignPortfolioInitiativeRelation> relations =
                relationRepository.findByPortfolioId(portfolioId);
        List<CampaignPortfolioKpi> kpis = kpiRepository.findByPortfolioId(portfolioId);

        return PortfolioContext.builder()
                .portfolio(portfolio)
                .initiativeRelations(relations)
                .kpis(kpis)
                .build();
    }

    /** 获取当前用户 ID */
    private String getCurrentUserId() {
        // TODO: 替换为真实的 SecurityContext.getCurrentUserId()
        return "system";
    }
}
