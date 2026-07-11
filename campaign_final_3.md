## 第3章：Marketing Decision Engine（营销决策引擎）详细设计
Marketing Decision Engine 是 Campaign Tools 的**“全局资源冲突解决器与最优营销决策生成器”**。它在预算、用户注意力、渠道容量等约束下，决定谁该被营销、用什么方式、花多少钱。
***
## 3.0 模块概述
### 3.0.1 本质定义
Decision Engine 是一个**约束优化系统**，在多个 Campaign/Initiative 之间做资源分配与冲突仲裁。它接收 Opportunity Intelligence 输出的机会列表，结合预算、频控、容量等约束，输出可执行的预算分配方案和执行优先级。
### 3.0.2 核心设计原则（与 Loyalty 融合）
| 原则                  | 说明                                                          |
| ------------------- | ----------------------------------------------------------- |
| **AI 辅助，非主导**       | AI 提供 ROI 预测、机会评分，但**不直接分配预算或仲裁**，最终决策由确定性引擎执行              |
| **复用 Loyalty 规则引擎** | 频控规则可引用 `rule_definition` 中定义的 Loyalty 规则                   |
| **数据来源**            | 从 `campaign_opportunity` 读取机会，从 `campaign_portfolio` 读取预算约束 |
| **决策可追溯**           | 每次决策生成完整的 `decision_result` 记录，包含决策理由和输入快照                  |
### 3.0.3 系统架构图
```text
Opportunity Intelligence → Opportunity Set
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                    Marketing Decision Engine                           │
│                                                                        │
│  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐             │
│  │  Budget       │  │  Attention    │  │  Arbitration  │             │
│  │  Allocation   │  │  Budget       │  │  Engine       │             │
│  │  Engine       │→ │  (频控)       │→ │  (冲突仲裁)   │             │
│  └───────────────┘  └───────────────┘  └───────────────┘             │
│           │                  │                  │                     │
│           └──────────────────┼──────────────────┘                     │
│                              ▼                                         │
│                   ┌───────────────────────┐                           │
│                   │  Prioritization       │                           │
│                   │  Engine (执行顺序)     │                           │
│                   └───────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼
                        Decision Result (分配方案 + 执行顺序)
                                  │
                                  ▼
                        Execution Engine (Zeebe)
```
### 3.0.4 决策输入模型
```json
{
  "workspaceId": "ws_001",
  "portfolioId": "port_001",
  "goalId": "goal_001",
  "totalBudget": 650000,
  "constraints": {
    "channelCapacity": {
      "EMAIL": 50000,
      "SMS": 20000,
      "PUSH": 30000
    },
    "maxFrequencyPerUser": 3,
    "minROIThreshold": 1.2,
    "blacklistSegments": ["BLACKLIST", "TEST"]
  },
  "candidates": [
    {
      "initiativeId": "ini_001",
      "opportunityIds": ["opp_001", "opp_002", "opp_003"],
      "expectedROI": 2.3,
      "estimatedCost": 50,
      "recommendedChannel": "SMS",
      "targetSegment": "HIGH_VALUE",
      "priority": 1,
      "minBudget": 50000,
      "maxBudget": 200000
    }
    // ... more candidates
  ]
}
```
***
## 3.1 数据模型设计
### 3.1.1 决策结果表（campaign\_decision\_result）
存储每次决策引擎运行的完整结果。
```sql
CREATE TABLE campaign_decision_result (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    portfolio_id VARCHAR(64),
    goal_id VARCHAR(64),
    decision_type VARCHAR(32) NOT NULL,          -- BUDGET_ALLOCATION / ARBITRATION / FULL_DECISION
    status VARCHAR(32) DEFAULT 'DRAFT',          -- DRAFT / APPLIED / REJECTED / SUPERSEDED
    -- 输入快照
    input_snapshot JSONB NOT NULL,               -- 决策输入完整快照
    -- 输出结果
    allocation_result JSONB NOT NULL,            -- 预算分配结果
    arbitration_result JSONB,                    -- 仲裁结果
    prioritization_result JSONB,                 -- 优先级排序结果
    -- 元数据
    total_budget DECIMAL(18,4),
    total_allocated DECIMAL(18,4),
    expected_total_roi DECIMAL(10,4),
    conflicts_resolved INT DEFAULT 0,
    rejected_candidates INT DEFAULT 0,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    applied_at TIMESTAMPTZ
);
CREATE INDEX idx_cdr_workspace ON campaign_decision_result(workspace_id);
CREATE INDEX idx_cdr_portfolio ON campaign_decision_result(portfolio_id);
CREATE INDEX idx_cdr_status ON campaign_decision_result(status);
CREATE INDEX idx_cdr_created ON campaign_decision_result(created_at DESC);
```
### 3.1.2 预算分配明细表（campaign\_budget\_allocation）
存储每个 Initiative/Campaign 的预算分配明细。
```sql
CREATE TABLE campaign_budget_allocation (
    id VARCHAR(64) PRIMARY KEY,
    decision_id VARCHAR(64) NOT NULL,
    initiative_id VARCHAR(64) NOT NULL,
    campaign_id VARCHAR(64),                     -- 可选：具体 Campaign
    allocated_budget DECIMAL(18,4) NOT NULL,
    expected_roi DECIMAL(10,4),
    actual_roi DECIMAL(10,4),                    -- 执行后回填
    status VARCHAR(32) DEFAULT 'PENDING',        -- PENDING / EXECUTING / COMPLETED / FAILED
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cba_decision ON campaign_budget_allocation(decision_id);
CREATE INDEX idx_cba_initiative ON campaign_budget_allocation(initiative_id);
CREATE INDEX idx_cba_status ON campaign_budget_allocation(status);
```
### 3.1.3 注意力预算表（campaign\_attention\_budget）
**复用 Loyalty 频控概念**，存储用户级别的营销接触配额。
```sql
CREATE TABLE campaign_attention_budget (
    user_id VARCHAR(64) NOT NULL,
    date DATE NOT NULL,
    channel VARCHAR(32) NOT NULL,                -- EMAIL / SMS / PUSH / ALL
    max_exposure INT DEFAULT 3,
    used_exposure INT DEFAULT 0,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY(user_id, date, channel)
);
CREATE INDEX idx_cab_user ON campaign_attention_budget(user_id);
CREATE INDEX idx_cab_date ON campaign_attention_budget(date);
-- 注意力预算消耗记录（审计）
CREATE TABLE campaign_attention_consumption (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL,
    campaign_id VARCHAR(64),
    channel VARCHAR(32) NOT NULL,
    consumed_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT
);
CREATE INDEX idx_cac_user ON campaign_attention_consumption(user_id);
CREATE INDEX idx_cac_campaign ON campaign_attention_consumption(campaign_id);
CREATE INDEX idx_cac_consumed ON campaign_attention_consumption(consumed_at DESC);
```
### 3.1.4 仲裁日志表（campaign\_arbitration\_log）
记录冲突仲裁的详细过程，用于审计和分析。
```sql
CREATE TABLE campaign_arbitration_log (
    id VARCHAR(64) PRIMARY KEY,
    decision_id VARCHAR(64) NOT NULL,
    conflict_type VARCHAR(32) NOT NULL,          -- USER / BUDGET / CHANNEL / TIME
    candidate_ids TEXT[] NOT NULL,               -- 冲突的候选ID列表
    resolution VARCHAR(64) NOT NULL,             -- 被选中的ID
    resolution_reason TEXT,
    priority_scores JSONB,                       -- 每个候选的优先级分数
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cal_decision ON campaign_arbitration_log(decision_id);
CREATE INDEX idx_cal_type ON campaign_arbitration_log(conflict_type);
```
***
## 3.2 后端 Service 详细设计
### 3.2.1 核心服务：DecisionEngine
```java
@Service
@Slf4j
@Transactional
public class DecisionEngine {
    @Autowired
    private CampaignOpportunityRepository opportunityRepository;
    @Autowired
    private InitiativeService initiativeService;
    @Autowired
    private PortfolioService portfolioService;
    @Autowired
    private DecisionResultRepository decisionResultRepository;
    @Autowired
    private BudgetAllocationRepository budgetAllocationRepository;
    @Autowired
    private AttentionBudgetRepository attentionBudgetRepository;
    @Autowired
    private ArbitrationLogRepository arbitrationLogRepository;
    @Autowired
    private SimulationEngine simulationEngine;
    @Autowired
    private WorkspaceLockService lockService;
    private static final double MIN_ROI_THRESHOLD = 1.2;
    private static final int MAX_BUDGET_ITERATIONS = 1000;
    /**
     * 执行完整决策（核心方法）
     * 
     * 执行流程：
     * 1. 加载决策输入（Opportunity、Budget、约束）
     * 2. 构建候选列表（Initiative级别聚合）
     * 3. 预算分配（贪心 + ROI排序）
     * 4. 注意力预算校验（频控）
     * 5. 冲突仲裁（用户/渠道/预算冲突）
     * 6. 优先级排序（执行顺序）
     * 7. 保存决策结果
     */
    public DecisionResult executeFullDecision(DecisionRequest request) {
        String workspaceId = request.getWorkspaceId();
        String portfolioId = request.getPortfolioId();
        
        log.info("Starting full decision execution: workspace={}, portfolio={}", 
                 workspaceId, portfolioId);
        return lockService.executeWithLock(workspaceId, () -> {
            // 1. 加载工作区上下文
            WorkspaceContext context = workspaceService.loadContext(workspaceId);
            Portfolio portfolio = portfolioService.getPortfolio(portfolioId);
            
            // 2. 获取活跃的机会（按 Initiative 分组）
            List<Initiative> initiatives = initiativeService.getActiveInitiatives(workspaceId);
            Map<String, List<Opportunity>> opportunitiesByInitiative = 
                    opportunityRepository.findActiveByInitiatives(
                            initiatives.stream().map(Initiative::getId).collect(Collectors.toList())
                    );
            
            // 3. 构建候选列表
            List<DecisionCandidate> candidates = buildCandidates(
                    initiatives, 
                    opportunitiesByInitiative,
                    portfolio.getTotalBudget()
            );
            
            if (candidates.isEmpty()) {
                throw new BusinessException("No viable candidates for decision");
            }
            
            // 4. 预算分配
            List<BudgetAllocation> allocations = allocateBudget(candidates, portfolio.getTotalBudget());
            
            // 5. 注意力预算校验（频控）
            List<BudgetAllocation> validatedAllocations = validateAttentionBudget(allocations);
            
            // 6. 冲突仲裁
            List<BudgetAllocation> arbitratedAllocations = arbitrateConflicts(validatedAllocations);
            
            // 7. 优先级排序
            List<BudgetAllocation> prioritizedAllocations = prioritize(arbitratedAllocations);
            
            // 8. 构建决策结果
            DecisionResult result = buildDecisionResult(
                    request, 
                    candidates, 
                    prioritizedAllocations,
                    portfolio
            );
            
            // 9. 保存决策结果
            result = decisionResultRepository.save(result);
            
            // 10. 保存分配明细
            for (BudgetAllocation allocation : prioritizedAllocations) {
                allocation.setDecisionId(result.getId());
                budgetAllocationRepository.save(allocation);
            }
            
            // 11. 记录仲裁日志
            if (result.getConflictsResolved() > 0) {
                arbitrationLogRepository.saveAll(buildArbitrationLogs(result));
            }
            
            log.info("Decision completed: id={}, allocated={}, conflicts={}", 
                     result.getId(), 
                     result.getTotalAllocated(),
                     result.getConflictsResolved());
            
            return result;
        });
    }
    /**
     * 构建决策候选列表
     * 
     * 伪代码：
     * 1. 遍历每个 Initiative
     * 2. 获取该 Initiative 下的所有 ACTIVE Opportunity
     * 3. 计算聚合指标（平均机会评分、总预估成本）
     * 4. 调用 Simulation Engine 预测 ROI
     * 5. 生成 DecisionCandidate
     */
    private List<DecisionCandidate> buildCandidates(
            List<Initiative> initiatives,
            Map<String, List<Opportunity>> opportunitiesByInitiative,
            BigDecimal totalBudget) {
        
        List<DecisionCandidate> candidates = new ArrayList<>();
        
        for (Initiative initiative : initiatives) {
            List<Opportunity> opportunities = opportunitiesByInitiative.getOrDefault(
                    initiative.getId(), Collections.emptyList()
            );
            
            if (opportunities.isEmpty()) {
                continue;
            }
            
            // 计算聚合指标
            double avgScore = opportunities.stream()
                    .mapToDouble(Opportunity::getScore)
                    .average()
                    .orElse(0);
            
            double totalEstimatedCost = opportunities.stream()
                    .mapToDouble(o -> o.getEstimatedCost() != null ? o.getEstimatedCost() : 50)
                    .sum();
            
            // 调用 Simulation Engine 预测该 Initiative 的 ROI
            SimulationResult simResult = simulationEngine.predictInitiativeROI(
                    initiative.getId(),
                    totalBudget.multiply(BigDecimal.valueOf(0.1))  // 初始预算
            );
            
            // 计算最小/最大有效预算
            long opportunityCount = opportunities.size();
            BigDecimal minBudget = BigDecimal.valueOf(opportunityCount * 5);   // 每人成本下限
            BigDecimal maxBudget = BigDecimal.valueOf(opportunityCount * 200); // 每人成本上限
            
            candidates.add(DecisionCandidate.builder()
                    .initiativeId(initiative.getId())
                    .initiativeName(initiative.getName())
                    .opportunityIds(opportunities.stream()
                            .map(Opportunity::getId)
                            .collect(Collectors.toList()))
                    .opportunityCount(opportunityCount)
                    .avgOpportunityScore(avgScore)
                    .expectedROI(simResult.getExpectedROI())
                    .estimatedTotalCost(BigDecimal.valueOf(totalEstimatedCost))
                    .recommendedChannel(determineBestChannel(opportunities))
                    .targetSegment(initiative.getRuleConfig() != null ? 
                            initiative.getRuleConfig().get("segment") : null)
                    .priority(initiative.getPriority())
                    .minBudget(minBudget)
                    .maxBudget(maxBudget)
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
     * 预算分配算法（核心）
     * 
     * 算法：基于 ROI 的贪心分配 + 背包优化
     * 
     * 伪代码：
     * 1. candidates 按 expectedROI 降序排序
     * 2. remaining = totalBudget
     * 3. for each candidate in candidates:
     * 4.     budget = min(candidate.maxBudget, remaining)
     * 5.     if budget >= candidate.minBudget:
     * 6.         allocation[candidate.id] = budget
     * 7.         remaining -= budget
     * 8.     if remaining <= 0: break
     * 9. 如果 remaining > 0，按优先级二次分配
     */
    private List<BudgetAllocation> allocateBudget(
            List<DecisionCandidate> candidates,
            BigDecimal totalBudget) {
        
        List<BudgetAllocation> allocations = new ArrayList<>();
        
        // 按 ROI 降序排序（已排序，但确保）
        candidates.sort((a, b) -> b.getExpectedROI().compareTo(a.getExpectedROI()));
        
        BigDecimal remaining = totalBudget;
        int iteration = 0;
        
        for (DecisionCandidate candidate : candidates) {
            iteration++;
            if (iteration > MAX_BUDGET_ITERATIONS) {
                log.warn("Budget allocation reached max iterations");
                break;
            }
            
            // 建议预算：取 maxBudget 和 remaining 的较小值
            BigDecimal suggestedBudget = candidate.getMaxBudget().min(remaining);
            
            // 至少达到 minBudget 才分配
            if (suggestedBudget.compareTo(candidate.getMinBudget()) >= 0) {
                BudgetAllocation allocation = BudgetAllocation.builder()
                        .id(UUID.randomUUID().toString())
                        .initiativeId(candidate.getInitiativeId())
                        .allocatedBudget(suggestedBudget)
                        .expectedROI(candidate.getExpectedROI())
                        .status("PENDING")
                        .build();
                allocations.add(allocation);
                remaining = remaining.subtract(suggestedBudget);
                
                log.debug("Allocated {} to initiative {} (ROI: {})", 
                         suggestedBudget, candidate.getInitiativeName(), candidate.getExpectedROI());
            }
            
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                break;
            }
        }
        
        // 如果还有剩余预算，按优先级二次分配
        if (remaining.compareTo(BigDecimal.ZERO) > 0) {
            candidates.sort(Comparator.comparingInt(DecisionCandidate::getPriority));
            for (DecisionCandidate candidate : candidates) {
                // 检查是否已有分配
                boolean alreadyAllocated = allocations.stream()
                        .anyMatch(a -> a.getInitiativeId().equals(candidate.getInitiativeId()));
                if (alreadyAllocated) continue;
                
                BigDecimal budget = candidate.getMinBudget().min(remaining);
                if (budget.compareTo(BigDecimal.ZERO) > 0) {
                    BudgetAllocation allocation = BudgetAllocation.builder()
                            .id(UUID.randomUUID().toString())
                            .initiativeId(candidate.getInitiativeId())
                            .allocatedBudget(budget)
                            .expectedROI(candidate.getExpectedROI())
                            .status("PENDING")
                            .build();
                    allocations.add(allocation);
                    remaining = remaining.subtract(budget);
                }
                if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
            }
        }
        
        log.info("Budget allocation completed: allocated {} initiatives, remaining {}", 
                 allocations.size(), remaining);
        return allocations;
    }
    /**
     * 注意力预算校验（频控）
     * 
     * 伪代码：
     * 1. 对每个 allocation，获取目标用户列表
     * 2. 检查每个用户的 attention_budget
     * 3. 如果超过上限，减少分配或跳过
     * 4. 如果跳过比例 > 30%，考虑重新分配
     */
    private List<BudgetAllocation> validateAttentionBudget(List<BudgetAllocation> allocations) {
        List<BudgetAllocation> validated = new ArrayList<>();
        
        for (BudgetAllocation allocation : allocations) {
            // 获取该 Initiative 下的机会关联的用户
            List<String> userIds = getInitiativeUserIds(allocation.getInitiativeId());
            
            // 检查每个用户的注意力预算
            int availableCount = 0;
            String channel = determineChannelForInitiative(allocation.getInitiativeId());
            
            for (String userId : userIds) {
                int remaining = attentionBudgetRepository.getRemaining(userId, channel);
                if (remaining > 0) {
                    availableCount++;
                }
            }
            
            // 如果可用用户少于目标用户的 50%，跳过该 allocation
            if (userIds.isEmpty() || (double) availableCount / userIds.size() < 0.5) {
                log.warn("Skipping allocation {} due to attention budget constraints: {}/{}", 
                         allocation.getInitiativeId(), availableCount, userIds.size());
                continue;
            }
            
            // 按可用用户比例调整预算
            double ratio = (double) availableCount / userIds.size();
            BigDecimal adjustedBudget = allocation.getAllocatedBudget()
                    .multiply(BigDecimal.valueOf(ratio));
            
            allocation.setAllocatedBudget(adjustedBudget);
            allocation.setAttentionValidated(true);
            validated.add(allocation);
        }
        
        return validated;
    }
    /**
     * 冲突仲裁
     * 
     * 冲突类型：
     * 1. 用户冲突：同一用户被多个 Initiative 选中
     * 2. 预算冲突：总预算不足
     * 3. 渠道冲突：同一渠道容量超限
     * 
     * 仲裁规则：优先级分数 = 0.4*ROI + 0.3*机会评分 + 0.2*战略权重 + 0.1*时效性
     */
    private List<BudgetAllocation> arbitrateConflicts(List<BudgetAllocation> allocations) {
        List<BudgetAllocation> arbitrated = new ArrayList<>();
        int conflictsResolved = 0;
        
        // 1. 用户冲突检测
        Map<String, List<BudgetAllocation>> userConflictMap = detectUserConflicts(allocations);
        for (Map.Entry<String, List<BudgetAllocation>> entry : userConflictMap.entrySet()) {
            List<BudgetAllocation> conflicting = entry.getValue();
            if (conflicting.size() > 1) {
                // 按优先级分数选择最优的
                BudgetAllocation winner = resolveUserConflict(conflicting);
                // 保留 winner，标记其他为冲突
                for (BudgetAllocation alloc : conflicting) {
                    if (alloc.getId().equals(winner.getId())) {
                        arbitrated.add(alloc);
                    } else {
                        alloc.setConflictResolved(true);
                        alloc.setConflictReason("USER_CONFLICT");
                        conflictsResolved++;
                    }
                }
            } else {
                arbitrated.addAll(conflicting);
            }
        }
        
        // 2. 渠道容量冲突检测
        Map<String, List<BudgetAllocation>> channelConflictMap = detectChannelConflicts(allocations);
        for (Map.Entry<String, List<BudgetAllocation>> entry : channelConflictMap.entrySet()) {
            String channel = entry.getKey();
            List<BudgetAllocation> channelAllocs = entry.getValue();
            
            BigDecimal totalChannelBudget = channelAllocs.stream()
                    .map(BudgetAllocation::getAllocatedBudget)
                    .reduce(BigDecimal.ZERO, BigDecimal::add);
            
            // 如果超过渠道容量，按比例缩减
            BigDecimal capacity = getChannelCapacity(channel);
            if (totalChannelBudget.compareTo(capacity) > 0) {
                double ratio = capacity.doubleValue() / totalChannelBudget.doubleValue();
                for (BudgetAllocation alloc : channelAllocs) {
                    BigDecimal adjusted = alloc.getAllocatedBudget()
                            .multiply(BigDecimal.valueOf(ratio));
                    alloc.setAllocatedBudget(adjusted);
                    alloc.setConflictResolved(true);
                    alloc.setConflictReason("CHANNEL_CAPACITY");
                }
                conflictsResolved += channelAllocs.size();
            }
        }
        
        log.info("Arbitration completed: resolved {} conflicts", conflictsResolved);
        return arbitrated;
    }
    /**
     * 计算优先级分数
     * 
     * 公式：PriorityScore = 0.4*ROI + 0.3*OpportunityScore + 0.2*StrategicWeight + 0.1*RecencyBoost
     */
    private double calculatePriorityScore(DecisionCandidate candidate) {
        // ROI 归一化（假设 ROI 范围 0~5）
        double normalizedROI = Math.min(candidate.getExpectedROI().doubleValue() / 5.0, 1.0);
        // 机会评分归一化
        double normalizedScore = candidate.getAvgOpportunityScore();
        // 战略权重（来自 Initiative 配置）
        double strategicWeight = candidate.getStrategicWeight() != null ? 
                candidate.getStrategicWeight() : 0.5;
        // 时效性（机会越近越高）
        double recencyBoost = calculateRecencyBoost(candidate);
        
        return 0.4 * normalizedROI + 
               0.3 * normalizedScore + 
               0.2 * strategicWeight + 
               0.1 * recencyBoost;
    }
    /**
     * 优先级排序（执行顺序）
     * 
     * 按优先级分数降序排列，同一 Initiative 内的 Campaign 按机会评分排序
     */
    private List<BudgetAllocation> prioritize(List<BudgetAllocation> allocations) {
        // 获取每个 allocation 对应的候选信息
        Map<String, DecisionCandidate> candidateMap = buildCandidateMap(allocations);
        
        allocations.sort((a, b) -> {
            DecisionCandidate ca = candidateMap.get(a.getInitiativeId());
            DecisionCandidate cb = candidateMap.get(b.getInitiativeId());
            
            if (ca == null || cb == null) {
                return a.getPriority().compareTo(b.getPriority());
            }
            
            double scoreA = calculatePriorityScore(ca);
            double scoreB = calculatePriorityScore(cb);
            return Double.compare(scoreB, scoreA);
        });
        
        // 设置执行顺序
        for (int i = 0; i < allocations.size(); i++) {
            allocations.get(i).setExecutionOrder(i + 1);
        }
        
        return allocations;
    }
    /**
     * 构建决策结果
     */
    private DecisionResult buildDecisionResult(
            DecisionRequest request,
            List<DecisionCandidate> candidates,
            List<BudgetAllocation> allocations,
            Portfolio portfolio) {
        
        BigDecimal totalAllocated = allocations.stream()
                .map(BudgetAllocation::getAllocatedBudget)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        
        // 计算总预期 ROI（加权平均）
        double totalExpectedROI = allocations.stream()
                .mapToDouble(a -> a.getExpectedROI().doubleValue() * a.getAllocatedBudget().doubleValue())
                .sum() / totalAllocated.doubleValue();
        
        // 统计被拒绝的候选
        Set<String> allocatedInitiativeIds = allocations.stream()
                .map(BudgetAllocation::getInitiativeId)
                .collect(Collectors.toSet());
        
        List<String> rejectedIds = candidates.stream()
                .filter(c -> !allocatedInitiativeIds.contains(c.getInitiativeId()))
                .map(DecisionCandidate::getInitiativeId)
                .collect(Collectors.toList());
        
        // 统计冲突
        long conflicts = allocations.stream()
                .filter(a -> a.isConflictResolved() != null && a.isConflictResolved())
                .count();
        
        return DecisionResult.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(request.getWorkspaceId())
                .portfolioId(request.getPortfolioId())
                .goalId(request.getGoalId())
                .decisionType("FULL_DECISION")
                .status("DRAFT")
                .inputSnapshot(JsonUtil.toJsonNode(request))
                .allocationResult(buildAllocationJson(allocations))
                .arbitrationResult(buildArbitrationJson(allocations))
                .prioritizationResult(buildPrioritizationJson(allocations))
                .totalBudget(portfolio.getTotalBudget())
                .totalAllocated(totalAllocated)
                .expectedTotalRoi(BigDecimal.valueOf(totalExpectedROI))
                .conflictsResolved((int) conflicts)
                .rejectedCandidates(rejectedIds.size())
                .createdBy(SecurityContext.getCurrentUserId())
                .createdAt(Instant.now())
                .build();
    }
}
```
### 3.2.2 注意力预算服务
```java
@Service
@Slf4j
public class AttentionBudgetService {
    @Autowired
    private AttentionBudgetRepository budgetRepository;
    @Autowired
    private AttentionConsumptionRepository consumptionRepository;
    /**
     * 检查用户是否还有剩余注意力预算
     */
    public boolean canSend(String userId, String channel) {
        String effectiveChannel = "ALL".equals(channel) ? "ALL" : channel;
        LocalDate today = LocalDate.now();
        
        // 从数据库读取
        Optional<AttentionBudget> budget = budgetRepository.findByUserIdAndDateAndChannel(
                userId, today, effectiveChannel);
        
        if (budget.isEmpty()) {
            // 如果没有记录，说明该用户今天还未被限制，使用默认值
            return true;
        }
        
        return budget.get().getUsedExposure() < budget.get().getMaxExposure();
    }
    /**
     * 获取用户今日剩余可发送次数
     */
    public int getRemaining(String userId, String channel) {
        String effectiveChannel = "ALL".equals(channel) ? "ALL" : channel;
        LocalDate today = LocalDate.now();
        
        Optional<AttentionBudget> budget = budgetRepository.findByUserIdAndDateAndChannel(
                userId, today, effectiveChannel);
        
        if (budget.isEmpty()) {
            return getDefaultMaxExposure(channel);
        }
        
        return Math.max(0, budget.get().getMaxExposure() - budget.get().getUsedExposure());
    }
    /**
     * 消耗用户注意力预算
     */
    public void consume(String userId, String campaignId, String channel) {
        String effectiveChannel = "ALL".equals(channel) ? "ALL" : channel;
        LocalDate today = LocalDate.now();
        
        // 使用数据库乐观锁防止并发超发
        int updated = budgetRepository.incrementUsed(userId, today, effectiveChannel, 1);
        
        if (updated == 0) {
            // 没有记录，创建新记录
            AttentionBudget newBudget = AttentionBudget.builder()
                    .userId(userId)
                    .date(today)
                    .channel(effectiveChannel)
                    .maxExposure(getDefaultMaxExposure(channel))
                    .usedExposure(1)
                    .lastUpdated(Instant.now())
                    .build();
            budgetRepository.save(newBudget);
        }
        
        // 记录消耗明细
        AttentionConsumption consumption = AttentionConsumption.builder()
                .id(UUID.randomUUID().toString())
                .userId(userId)
                .campaignId(campaignId)
                .channel(channel)
                .consumedAt(Instant.now())
                .build();
        consumptionRepository.save(consumption);
        
        log.debug("Attention consumed: user={}, channel={}, campaign={}", 
                 userId, channel, campaignId);
    }
    /**
     * 批量检查用户是否可发送（用于决策引擎）
     */
    public Map<String, Boolean> batchCanSend(List<String> userIds, String channel) {
        Map<String, Boolean> result = new HashMap<>();
        for (String userId : userIds) {
            result.put(userId, canSend(userId, channel));
        }
        return result;
    }
    private int getDefaultMaxExposure(String channel) {
        switch (channel) {
            case "EMAIL":
                return 3;
            case "SMS":
                return 2;
            case "PUSH":
                return 5;
            default:
                return 3;
        }
    }
}
```
***
## 3.3 前端界面设计
### 3.3.1 决策执行页面
```text
┌─ 决策引擎 ──────────────────────────────────────────────────────────────────┐
│  当前组合: Q2营销组合 (状态: OPTIMIZED)                                    │
│  总预算: ¥650,000                                                          │
│                                                                             │
│  [▶ 运行决策] [📋 历史决策] [⚙️ 配置]                                      │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 决策输入摘要 ─────────────────────────────────────────────────────────┐ │
│  │  ✅ 机会已准备: 8,432 个                                              │ │
│  │  ✅ 活跃 Initiatives: 3 个                                            │ │
│  │  ⚠️ 渠道容量: EMAIL 充足 | SMS 紧张 | PUSH 充足                     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 预算分配结果 ─────────────────────────────────────────────────────────┐ │
│  │  Initiative          │ 分配预算   │ 预期ROI │ 占比 │ 状态            │ │
│  ├──────────────────────┼────────────┼─────────┼──────┼─────────────────┤ │
│  │  高价值会员召回      │ ¥300,000  │ 2.3x   │ 46% │ ████████████████ │ │
│  │  新会员促活          │ ¥200,000  │ 1.8x   │ 31% │ ██████████      │ │
│  │  会员升级激励        │ ¥150,000  │ 2.1x   │ 23% │ ████████        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 执行优先级 ───────────────────────────────────────────────────────────┐ │
│  │  1️⃣ 高价值会员召回 (优先级分: 0.92)                                   │ │
│  │     机会数: 2,698 | 目标用户: 12,345                                  │ │
│  │  2️⃣ 会员升级激励 (优先级分: 0.87)                                    │ │
│  │     机会数: 2,108 | 目标用户: 8,234                                   │ │
│  │  3️⃣ 新会员促活 (优先级分: 0.76)                                      │ │
│  │     机会数: 2,361 | 目标用户: 15,678                                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 冲突仲裁摘要 ─────────────────────────────────────────────────────────┐ │
│  │  🔴 用户冲突: 234 个用户被多个 Initiative 竞争                       │ │
│  │  🟡 渠道冲突: SMS 渠道超预算 15%                                     │ │
│  │  ✅ 已仲裁: 全部解决                                                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                              [应用决策] [导出报告]                          │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 3.3.2 历史决策列表
```text
┌─ 历史决策 ──────────────────────────────────────────────────────────────────┐
│  [🔍 搜索...]  [状态: 全部 ▼]  [日期范围: ████]                          │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 决策列表 ─────────────────────────────────────────────────────────────┐ │
│  │ 决策ID │ 时间      │ 预算    │ 分配数 │ 预期ROI │ 状态    │ 操作     │ │
│  ├────────┼───────────┼─────────┼────────┼─────────┼─────────┼──────────┤ │
│  │ DEC_008 │ 06/26 10:00│ 650,000│ 3      │ 2.1x   │ APPLIED │ [查看]   │ │
│  │ DEC_007 │ 06/25 14:30│ 600,000│ 3      │ 1.9x   │ APPLIED │ [查看]   │ │
│  │ DEC_006 │ 06/24 09:00│ 500,000│ 2      │ 1.7x   │ REJECTED│ [查看]   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 3.4 前后端 JSON 交互
### 3.4.1 运行决策
**Request:**
```json
POST /api/campaign/decision/execute
{
    "workspaceId": "ws_001",
    "portfolioId": "port_001",
    "goalId": "goal_001",
    "constraints": {
        "channelCapacity": {
            "EMAIL": 50000,
            "SMS": 20000,
            "PUSH": 30000
        },
        "maxFrequencyPerUser": 3,
        "minROIThreshold": 1.2
    }
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "decisionId": "dec_009",
        "status": "DRAFT",
        "totalBudget": 650000,
        "totalAllocated": 650000,
        "expectedTotalRoi": 2.1,
        "conflictsResolved": 234,
        "rejectedCandidates": 0,
        "allocations": [
            {
                "initiativeId": "ini_001",
                "initiativeName": "高价值会员召回",
                "allocatedBudget": 300000,
                "expectedRoi": 2.3,
                "percentage": 46.15,
                "executionOrder": 1,
                "priorityScore": 0.92,
                "opportunityCount": 2698,
                "targetUserCount": 12345,
                "status": "PENDING"
            },
            {
                "initiativeId": "ini_003",
                "initiativeName": "会员升级激励",
                "allocatedBudget": 150000,
                "expectedRoi": 2.1,
                "percentage": 23.08,
                "executionOrder": 2,
                "priorityScore": 0.87,
                "opportunityCount": 2108,
                "targetUserCount": 8234,
                "status": "PENDING"
            },
            {
                "initiativeId": "ini_002",
                "initiativeName": "新会员促活",
                "allocatedBudget": 200000,
                "expectedRoi": 1.8,
                "percentage": 30.77,
                "executionOrder": 3,
                "priorityScore": 0.76,
                "opportunityCount": 2361,
                "targetUserCount": 15678,
                "status": "PENDING"
            }
        ],
        "arbitrationSummary": {
            "userConflicts": 234,
            "budgetConflicts": 0,
            "channelConflicts": 1,
            "resolved": 234
        },
        "createdAt": "2026-06-26T10:00:00Z"
    }
}
```
### 3.4.2 应用决策（触发执行）
**Request:**
```json
POST /api/campaign/decision/dec_009/apply
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "decisionId": "dec_009",
        "status": "APPLIED",
        "appliedAt": "2026-06-26T10:05:00Z",
        "campaignIds": ["camp_001", "camp_002", "camp_003"]
    }
}
```
***
## 3.5 前端复杂逻辑伪代码
### 3.5.1 决策执行状态管理
```typescript
// hooks/useDecisionEngine.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
interface DecisionExecutionParams {
  workspaceId: string;
  portfolioId: string;
  goalId: string;
}
export const useDecisionEngine = (params: DecisionExecutionParams) => {
  const queryClient = useQueryClient();
  // 执行决策
  const executeDecision = useMutation({
    mutationFn: async (constraints: any) => {
      const response = await api.post('/api/campaign/decision/execute', {
        ...params,
        constraints
      });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['decision', params.portfolioId, 'latest'],
        data.data
      );
    }
  });
  // 应用决策
  const applyDecision = useMutation({
    mutationFn: async (decisionId: string) => {
      const response = await api.post(`/api/campaign/decision/${decisionId}/apply`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ 
        queryKey: ['decision', params.portfolioId] 
      });
      // 触发执行引擎启动
      queryClient.invalidateQueries({ 
        queryKey: ['execution', params.workspaceId] 
      });
    }
  });
  // 获取最新决策结果
  const { data: latestDecision, refetch } = useQuery({
    queryKey: ['decision', params.portfolioId, 'latest'],
    queryFn: async () => {
      const response = await api.get(
        `/api/campaign/decision/latest?portfolioId=${params.portfolioId}`
      );
      return response.data;
    },
    enabled: !!params.portfolioId,
    staleTime: 30000
  });
  return {
    executeDecision: executeDecision.mutateAsync,
    isExecuting: executeDecision.isPending,
    applyDecision: applyDecision.mutateAsync,
    isApplying: applyDecision.isPending,
    latestDecision: latestDecision?.data,
    refetch
  };
};
```
### 3.5.2 预算分配可视化组件
```tsx
// components/BudgetAllocationChart.tsx
import React from 'react';
interface Allocation {
  initiativeName: string;
  allocatedBudget: number;
  percentage: number;
  expectedRoi: number;
  color?: string;
}
export const BudgetAllocationChart: React.FC<{ allocations: Allocation[] }> = ({ allocations }) => {
  const sorted = [...allocations].sort((a, b) => b.percentage - a.percentage);
  const colors = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#8b5cf6'];
  return (
    <div className="budget-allocation">
      <div className="chart-container">
        {/* 条形图 */}
        <div className="bar-chart">
          {sorted.map((item, idx) => (
            <div key={idx} className="bar-row">
              <div className="bar-label">{item.initiativeName}</div>
              <div className="bar-track">
                <div 
                  className="bar-fill"
                  style={{
                    width: `${item.percentage}%`,
                    backgroundColor: colors[idx % colors.length]
                  }}
                />
              </div>
              <div className="bar-info">
                <span className="bar-value">¥{item.allocatedBudget.toLocaleString()}</span>
                <span className="bar-ratio">{item.percentage}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* 饼图（D3.js 或 ECharts） */}
      <div className="pie-chart-container">
        <EChartsReact
          option={{
            tooltip: { trigger: 'item' },
            series: [{
              type: 'pie',
              radius: ['40%', '70%'],
              data: sorted.map((item, idx) => ({
                name: item.initiativeName,
                value: item.allocatedBudget,
                itemStyle: { color: colors[idx % colors.length] }
              })),
              label: {
                formatter: '{b}\n{d}%'
              }
            }]
          }}
          style={{ height: 300, width: 300 }}
        />
      </div>
    </div>
  );
};
```
***
## 3.6 异常处理与业务规则
### 3.6.1 业务异常枚举
```java
public enum DecisionErrorCode {
    PORTFOLIO_NOT_OPTIMIZED("D001", "Portfolio must be OPTIMIZED before decision"),
    NO_CANDIDATES("D002", "No viable candidates found for decision"),
    BUDGET_EXCEEDED("D003", "Total budget exceeds available limit"),
    CHANNEL_CAPACITY_EXCEEDED("D004", "Channel capacity exceeded"),
    ATTENTION_BUDGET_EXHAUSTED("D005", "User attention budget exhausted"),
    DECISION_NOT_FOUND("D006", "Decision result not found"),
    DECISION_ALREADY_APPLIED("D007", "Decision has already been applied"),
    INSUFFICIENT_BUDGET("D008", "Insufficient budget for minimum allocation");
}
```
### 3.6.2 决策回滚机制
当决策应用后发现问题，支持回滚：
```java
@Service
public class DecisionRollbackService {
    
    @Autowired
    private DecisionResultRepository decisionRepository;
    @Autowired
    private BudgetAllocationRepository allocationRepository;
    
    @Transactional
    public void rollback(String decisionId) {
        DecisionResult decision = decisionRepository.findById(decisionId)
                .orElseThrow(() -> new ResourceNotFoundException("Decision not found"));
        
        if (!"APPLIED".equals(decision.getStatus())) {
            throw new BusinessException("Only APPLIED decision can be rolled back");
        }
        
        // 1. 标记决策为回滚
        decision.setStatus("ROLLED_BACK");
        decisionRepository.save(decision);
        
        // 2. 取消相关的执行任务（通过 EventBridge）
        eventPublisher.publishDecisionRolledBack(decision);
        
        // 3. 恢复注意力预算（释放已消耗的频控）
        List<BudgetAllocation> allocations = allocationRepository.findByDecisionId(decisionId);
        for (BudgetAllocation allocation : allocations) {
            // 调用 AttentionBudgetService 释放预算
            attentionBudgetService.releaseForDecision(allocation.getInitiativeId());
        }
        
        log.info("Decision rolled back: {}", decisionId);
    }
}
```
***
## 3.7 与 Loyalty 系统的集成点
| 集成点                | Loyalty 能力 | 使用方式                                                      |
| ------------------ | ---------- | --------------------------------------------------------- |
| **规则引擎 (Drools)**  | 频控规则       | 可引用 `rule_definition` 中的频控规则，作为 `maxFrequencyPerUser` 的输入 |
| **EventBridge**    | 事件发布       | 决策完成后发布 `DECISION_APPLIED` 事件，触发 Execution 启动             |
| **ChannelService** | 渠道能力       | `channelCapacity` 从 Loyalty 渠道配置读取                        |
| **member 表**       | 用户数据       | 注意力预算的 `user_id` 关联 Loyalty 会员                            |
***
## 3.8 开发实施检查清单
* 创建 `campaign_decision_result` 表
* 创建 `campaign_budget_allocation` 表
* 创建 `campaign_attention_budget` 表
* 创建 `campaign_attention_consumption` 表
* 创建 `campaign_arbitration_log` 表
* 实现 `DecisionEngine`（核心决策逻辑）
* 实现 `BudgetAllocation` 算法（贪心 + ROI 排序）
* 实现 `AttentionBudgetService`（频控管理）
* 实现 `ArbitrationEngine`（冲突仲裁）
* 实现 `PrioritizationEngine`（优先级排序）
* 实现前端决策执行页面
* 实现前端预算分配可视化（条形图 + 饼图）
* 实现前端历史决策列表
* 实现 `DecisionRollbackService`（回滚机制）
* 集成 EventBridge 发布决策事件
* 编写单元测试（覆盖率 > 80%）
