## 第4章：Simulation & Optimization（模拟与优化系统）详细设计
Simulation & Optimization 是 Campaign Tools 的**“未来营销结果预测 + 策略对比 + 自动优化生成引擎”**。它让系统在执行前把未来结果先算一遍，并选择最优路径，从而降低试错成本、提升 ROI。
***
## 4.0 模块概述
### 4.0.1 本质定义
Simulation & Optimization 是一个**“预测-对比-优化”闭环系统**：
* **预测**：基于历史数据和 ML 模型，模拟 Campaign 执行后的曝光、行为、转化
* **对比**：支持 What-if 场景对比（A/B 策略、不同预算分配）
* **优化**：自动搜索最优预算分配和 Campaign 结构
### 4.0.2 核心设计原则（与 Loyalty 融合）
| 原则          | 说明                                                                    |
| ----------- | --------------------------------------------------------------------- |
| **数据来源**    | 全部来自 Loyalty 同步宽表（`campaign_member_dim`、`campaign_order_fact`）和 ML 模型 |
| **AI 辅助生成** | AI 生成 Campaign 蓝图（DAG），但模拟和优化由确定性引擎执行                                 |
| **可解释性**    | 每个模拟结果包含详细的计算路径和假设，支持运营人员理解                                           |
| **渐进式落地**   | Phase 1 使用贪心优化，Phase 2 引入遗传算法，Phase 3 接入 AI 策略生成                      |
### 4.0.3 系统架构图
```text
Loyalty 历史数据 (campaign_member_dim, campaign_order_fact)
                    │
                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     Simulation & Optimization Engine                    │
│                                                                         │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────────┐ │
│  │  Baseline       │  │  Simulation     │  │  Optimization           │ │
│  │  Calculator     │→ │  Engine         │→ │  Engine                 │ │
│  │  (历史转化率)   │  │  (三层模型)     │  │  (贪心 + 遗传算法)      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────────────┘ │
│           │                    │                       │                │
│           └────────────────────┼───────────────────────┘                │
│                                ▼                                         │
│                     ┌─────────────────────────┐                         │
│                     │  What-if Scenario       │                         │
│                     │  Comparator             │                         │
│                     └─────────────────────────┘                         │
└─────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
                    ┌─────────────────────────┐
                    │  AI Campaign Generator  │
                    │  (策略蓝图生成)          │
                    └─────────────────────────┘
                                │
                                ▼
                     Canvas DAG → Compiler → Execution
```
### 4.0.4 核心概念
| 概念                         | 定义                               |
| -------------------------- | -------------------------------- |
| **Baseline**               | 不执行任何 Campaign 时的自然转化率（基于历史数据）   |
| **Exposure Probability**   | 用户看到 Campaign 的概率（受渠道容量、注意力预算影响） |
| **Behavior Probability**   | 用户看到后产生互动的概率（点击、打开等）             |
| **Conversion Probability** | 用户互动后产生转化（购买、注册等）的概率             |
| **Uplift**                 | 执行 Campaign 相比 Baseline 的增量效果    |
| **ROI**                    | (增量收入 - 成本) / 成本                 |
***
## 4.1 数据模型设计
### 4.1.1 模拟结果表（campaign\_simulation\_result）
存储每次模拟运行的完整结果。
```sql
CREATE TABLE campaign_simulation_result (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64),
    initiative_id VARCHAR(64),
    simulation_type VARCHAR(32) NOT NULL,          -- BASELINE / SCENARIO / OPTIMIZATION
    name VARCHAR(255),
    description TEXT,
    -- 输入快照
    input_snapshot JSONB NOT NULL,                 -- 模拟输入的完整快照
    -- 核心结果
    baseline_conversion DECIMAL(10,4),             -- 基线转化率
    predicted_conversion DECIMAL(10,4),            -- 预测转化率
    predicted_revenue DECIMAL(18,4),               -- 预测收入
    predicted_roi DECIMAL(10,4),                   -- 预测 ROI
    uplift_pct DECIMAL(10,4),                      -- 提升百分比
    confidence DECIMAL(10,4),                      -- 置信度
    -- 明细
    exposure_count BIGINT,                         -- 预估曝光人数
    behavior_count BIGINT,                         -- 预估互动人数
    conversion_count BIGINT,                       -- 预估转化人数
    -- 分层结果（JSON）
    segment_breakdown JSONB,                       -- 分群级别明细
    channel_breakdown JSONB,                       -- 渠道级别明细
    -- 元数据
    status VARCHAR(32) DEFAULT 'DRAFT',            -- DRAFT / COMPLETED / APPLIED
    executed_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_csr_workspace ON campaign_simulation_result(workspace_id);
CREATE INDEX idx_csr_goal ON campaign_simulation_result(goal_id);
CREATE INDEX idx_csr_type ON campaign_simulation_result(simulation_type);
CREATE INDEX idx_csr_created ON campaign_simulation_result(created_at DESC);
```
### 4.1.2 What-if 场景表（campaign\_simulation\_scenario）
存储用户定义的对比场景。
```sql
CREATE TABLE campaign_simulation_scenario (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    -- 场景配置
    scenario_config JSONB NOT NULL,                -- 场景参数（预算、渠道、人群等）
    -- 对比基准
    baseline_simulation_id VARCHAR(64),            -- 对比的基准模拟
    -- 结果
    predicted_roi DECIMAL(10,4),
    predicted_revenue DECIMAL(18,4),
    improvement_over_baseline DECIMAL(10,4),
    -- 元数据
    status VARCHAR(32) DEFAULT 'DRAFT',
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_css_workspace ON campaign_simulation_scenario(workspace_id);
CREATE INDEX idx_css_goal ON campaign_simulation_scenario(goal_id);
```
### 4.1.3 优化结果表（campaign\_optimization\_result）
存储优化引擎输出的最优方案。
```sql
CREATE TABLE campaign_optimization_result (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    portfolio_id VARCHAR(64),
    goal_id VARCHAR(64),
    optimization_type VARCHAR(32) NOT NULL,        -- GREEDY / GENETIC / AI
    -- 输入
    constraints JSONB NOT NULL,                    -- 约束条件（总预算、渠道容量等）
    -- 输出
    optimized_allocations JSONB NOT NULL,          -- 最优预算分配
    expected_roi DECIMAL(10,4),
    expected_revenue DECIMAL(18,4),
    iteration_count INT,
    convergence_time_ms BIGINT,
    -- 对比
    baseline_roi DECIMAL(10,4),
    improvement_pct DECIMAL(10,4),
    -- 元数据
    status VARCHAR(32) DEFAULT 'DRAFT',            -- DRAFT / APPLIED / REJECTED
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cor_workspace ON campaign_optimization_result(workspace_id);
CREATE INDEX idx_cor_portfolio ON campaign_optimization_result(portfolio_id);
CREATE INDEX idx_cor_type ON campaign_optimization_result(optimization_type);
```
***
## 4.2 后端 Service 详细设计
### 4.2.1 核心服务：SimulationEngine
```java
@Service
@Slf4j
@Transactional
public class SimulationEngine {
    @Autowired
    private CampaignMemberDimRepository memberDimRepository;
    @Autowired
    private CampaignOrderFactRepository orderFactRepository;
    @Autowired
    private SimulationResultRepository simulationResultRepository;
    @Autowired
    private ScenarioRepository scenarioRepository;
    @Autowired
    private MLScoringClient mlScoringClient;
    @Autowired
    private AttentionBudgetService attentionBudgetService;
    @Autowired
    private ChannelCapacityService channelCapacityService;
    private static final int BASELINE_DAYS = 30;
    private static final double LEARNING_RATE = 0.01;
    /**
     * 计算基线转化率（基于 Loyalty 历史数据）
     * 
     * 伪代码：
     * 1. 从 campaign_order_fact 获取过去 N 天的订单数据
     * 2. 按目标分群筛选用户
     * 3. 计算自然转化率（未受 Campaign 影响的用户）
     * 4. 返回基线
     */
    public BaselineResult calculateBaseline(String goalId, String segmentCode) {
        log.info("Calculating baseline for goal: {}, segment: {}", goalId, segmentCode);
        
        // 1. 获取目标用户群体
        List<CampaignMemberDim> members = memberDimRepository.findBySegment(segmentCode);
        if (members.isEmpty()) {
            log.warn("No members found for segment: {}", segmentCode);
            return BaselineResult.empty();
        }
        
        Set<String> memberIds = members.stream()
                .map(CampaignMemberDim::getMemberId)
                .collect(Collectors.toSet());
        
        // 2. 查询过去 BASELINE_DAYS 天的订单
        LocalDate startDate = LocalDate.now().minusDays(BASELINE_DAYS);
        List<CampaignOrderFact> orders = orderFactRepository.findByMemberIdsAndDateAfter(
                memberIds, startDate
        );
        
        // 3. 计算转化率（至少有一笔订单的用户比例）
        Set<String> convertedMemberIds = orders.stream()
                .map(CampaignOrderFact::getMemberId)
                .collect(Collectors.toSet());
        
        double conversionRate = memberIds.isEmpty() ? 0 : 
                (double) convertedMemberIds.size() / memberIds.size();
        
        // 4. 计算平均客单价
        double avgOrderValue = orders.stream()
                .mapToDouble(CampaignOrderFact::getNetAmount)
                .average()
                .orElse(0);
        
        // 5. 分群明细
        Map<String, Double> segmentBreakdown = calculateSegmentBreakdown(members, orders);
        
        BaselineResult result = BaselineResult.builder()
                .segmentCode(segmentCode)
                .totalMembers(memberIds.size())
                .convertedMembers(convertedMemberIds.size())
                .conversionRate(conversionRate)
                .avgOrderValue(avgOrderValue)
                .estimatedRevenue(conversionRate * memberIds.size() * avgOrderValue)
                .segmentBreakdown(segmentBreakdown)
                .periodDays(BASELINE_DAYS)
                .calculatedAt(Instant.now())
                .build();
        
        log.info("Baseline calculated: conversionRate={}, members={}", 
                 conversionRate, memberIds.size());
        return result;
    }
    /**
     * 执行完整模拟（三层模型）
     * 
     * 伪代码：
     * 1. 计算基线转化率
     * 2. 对每个候选用户，计算 Exposure Probability
     * 3. 对每个用户，计算 Behavior Probability
     * 4. 对每个用户，计算 Conversion Probability
     * 5. 聚合为总体预测
     */
    public SimulationResult simulate(SimulationRequest request) {
        log.info("Starting simulation: {}", request.getName());
        
        // 1. 计算基线
        BaselineResult baseline = calculateBaseline(
                request.getGoalId(), 
                request.getSegmentCode()
        );
        
        // 2. 获取目标用户
        List<CampaignMemberDim> members = memberDimRepository.findBySegment(
                request.getSegmentCode()
        );
        
        if (members.isEmpty()) {
            throw new BusinessException("No members found for simulation");
        }
        
        // 3. 构建用户特征（用于 ML 预测）
        List<MemberFeature> features = members.stream()
                .map(this::buildMemberFeature)
                .collect(Collectors.toList());
        
        // 4. 调用 ML 服务预测每个用户的转化概率
        List<MLScoreResult> mlResults = mlScoringClient.predictBatch(features);
        
        // 5. 三层模拟模型
        long totalExposure = 0;
        long totalBehavior = 0;
        long totalConversion = 0;
        double totalRevenue = 0;
        
        // 分群明细
        Map<String, SegmentSimulation> segmentResults = new HashMap<>();
        
        for (int i = 0; i < members.size(); i++) {
            CampaignMemberDim member = members.get(i);
            MLScoreResult mlResult = mlResults.get(i);
            
            // Layer 1: Exposure Probability
            double exposureProb = calculateExposureProbability(
                    member, 
                    request.getChannel(), 
                    request.getCampaignId()
            );
            
            // Layer 2: Behavior Probability
            double behaviorProb = calculateBehaviorProbability(
                    member, 
                    mlResult, 
                    request.getOfferStrength()
            );
            
            // Layer 3: Conversion Probability
            double conversionProb = calculateConversionProbability(
                    member, 
                    mlResult, 
                    request.getOfferMatch()
            );
            
            // 联合概率
            double totalProb = exposureProb * behaviorProb * conversionProb;
            
            // 随机采样（模拟实际执行）
            boolean willConvert = Math.random() < totalProb;
            
            if (willConvert) {
                totalConversion++;
                totalRevenue += member.getAvgOrderAmount() != null ? 
                        member.getAvgOrderAmount().doubleValue() : 100;
            }
            
            totalExposure += Math.random() < exposureProb ? 1 : 0;
            totalBehavior += Math.random() < behaviorProb ? 1 : 0;
            
            // 分群明细
            String segmentKey = member.getSegmentCode() != null ? 
                    member.getSegmentCode() : "UNKNOWN";
            segmentResults.computeIfAbsent(segmentKey, k -> new SegmentSimulation())
                    .addMember(totalProb);
        }
        
        // 6. 计算预测结果
        double predictedRevenue = totalRevenue;
        double campaignCost = calculateCampaignCost(members.size(), request);
        double predictedROI = campaignCost > 0 ? 
                (predictedRevenue - campaignCost) / campaignCost : 0;
        
        double uplift = baseline.getConversionRate() > 0 ?
                ((double) totalConversion / members.size() - baseline.getConversionRate()) 
                        / baseline.getConversionRate() : 0;
        
        // 7. 构建结果
        SimulationResult result = SimulationResult.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(request.getWorkspaceId())
                .goalId(request.getGoalId())
                .simulationType("SCENARIO")
                .name(request.getName())
                .inputSnapshot(JsonUtil.toJsonNode(request))
                .baselineConversion(baseline.getConversionRate())
                .predictedConversion((double) totalConversion / members.size())
                .predictedRevenue(predictedRevenue)
                .predictedRoi(predictedROI)
                .upliftPct(uplift)
                .confidence(0.75)  // 基于样本量计算
                .exposureCount(totalExposure)
                .behaviorCount(totalBehavior)
                .conversionCount(totalConversion)
                .segmentBreakdown(JsonUtil.toJsonNode(segmentResults))
                .channelBreakdown(JsonUtil.toJsonNode(buildChannelBreakdown(request)))
                .status("COMPLETED")
                .executedBy(SecurityContext.getCurrentUserId())
                .createdAt(Instant.now())
                .build();
        
        // 8. 保存结果
        result = simulationResultRepository.save(result);
        
        log.info("Simulation completed: id={}, roi={}, conversion={}", 
                 result.getId(), result.getPredictedRoi(), result.getPredictedConversion());
        return result;
    }
    /**
     * Exposure Model（曝光模拟）
     * 
     * 影响因子：
     * - 渠道容量 (Channel Capacity)
     * - 用户注意力预算 (Attention Budget)
     * - 渠道历史互动率
     */
    private double calculateExposureProbability(
            CampaignMemberDim member, 
            String channel,
            String campaignId) {
        
        // 1. 渠道容量因子
        double channelAvailability = channelCapacityService.getAvailability(
                channel, LocalDate.now()
        );
        if (channelAvailability <= 0) {
            return 0;
        }
        
        // 2. 用户注意力预算
        int remainingAttention = attentionBudgetService.getRemaining(
                member.getMemberId(), channel
        );
        if (remainingAttention <= 0) {
            return 0;
        }
        
        // 3. 用户历史互动率（从 loyalty 数据计算）
        double historicalEngagement = calculateHistoricalEngagement(
                member.getMemberId(), channel
        );
        
        // 4. 综合曝光概率
        double baseProb = 0.7;  // 基础曝光率
        double factor = 0.3 * channelAvailability + 
                        0.3 * Math.min(remainingAttention / 3.0, 1.0) +
                        0.4 * historicalEngagement;
        
        return Math.min(baseProb * factor, 1.0);
    }
    /**
     * Behavior Model（行为模拟）
     * 
     * 影响因子：
     * - Offer 强度
     * - 用户兴趣分（来自 ML）
     * - 用户疲劳度
     */
    private double calculateBehaviorProbability(
            CampaignMemberDim member,
            MLScoreResult mlResult,
            Double offerStrength) {
        
        double offerFactor = offerStrength != null ? offerStrength : 0.5;
        double interestScore = mlResult.getUpliftScore() != null ? 
                mlResult.getUpliftScore() : 0.5;
        
        // 疲劳度（从 attention 消费记录计算）
        double fatigueScore = calculateFatigueScore(member.getMemberId());
        
        double score = 0.4 * offerFactor + 
                       0.4 * interestScore - 
                       0.2 * fatigueScore;
        
        return sigmoid(score);
    }
    /**
     * Conversion Model（转化模拟）
     * 
     * 影响因子：
     * - ML 预测的转化概率
     * - Offer 匹配度
     * - 用户历史价值
     */
    private double calculateConversionProbability(
            CampaignMemberDim member,
            MLScoreResult mlResult,
            Double offerMatch) {
        
        double mlConversion = mlResult.getConversionProbability() != null ?
                mlResult.getConversionProbability() : 0.3;
        double matchFactor = offerMatch != null ? offerMatch : 0.5;
        
        // 用户历史价值因子（高价值用户更容易转化）
        double valueFactor = Math.min(
                (member.getTotalOrderAmount() != null ? 
                        member.getTotalOrderAmount().doubleValue() : 0) / 10000, 
                1.0
        );
        
        return 0.5 * mlConversion + 
               0.3 * matchFactor + 
               0.2 * valueFactor;
    }
    /**
     * Sigmoid 函数（归一化）
     */
    private double sigmoid(double x) {
        return 1.0 / (1.0 + Math.exp(-x));
    }
    /**
     * 计算用户疲劳度（基于近期营销接触频率）
     */
    private double calculateFatigueScore(String userId) {
        // 查询最近 7 天的营销接触次数
        int recentExposures = attentionBudgetService.getRecentExposures(userId, 7);
        // 超过 3 次开始产生疲劳
        return Math.min((double) (recentExposures - 3) / 10, 1.0);
    }
    /**
     * 计算历史渠道互动率
     */
    private double calculateHistoricalEngagement(String userId, String channel) {
        // 从 Loyalty event_inbox 或 campaign 历史数据查询
        // 简化实现：返回默认值
        return 0.4 + Math.random() * 0.3;
    }
    /**
     * 计算 Campaign 成本
     */
    private double calculateCampaignCost(int memberCount, SimulationRequest request) {
        // 简化：每人成本固定
        double costPerUser = 0.5;  // 默认 0.5 元/人
        if ("SMS".equals(request.getChannel())) {
            costPerUser = 0.8;
        } else if ("PUSH".equals(request.getChannel())) {
            costPerUser = 0.3;
        }
        return memberCount * costPerUser;
    }
}
```
### 4.2.2 优化引擎（OptimizationEngine）
```java
@Service
@Slf4j
public class OptimizationEngine {
    @Autowired
    private SimulationEngine simulationEngine;
    @Autowired
    private OptimizationResultRepository optimizationResultRepository;
    @Autowired
    private PortfolioService portfolioService;
    @Autowired
    private InitiativeService initiativeService;
    private static final int GENETIC_ALGORITHM_GENERATIONS = 50;
    private static final int POPULATION_SIZE = 100;
    /**
     * 贪心优化（Phase 1 实现）
     * 
     * 算法：
     * 1. 获取所有候选 Initiative
     * 2. 对每个 Initiative 运行模拟，获取预期 ROI
     * 3. 按 ROI 降序排序
     * 4. 依次分配预算直到耗尽
     */
    public OptimizationResult optimizeGreedy(OptimizationRequest request) {
        log.info("Starting greedy optimization: portfolio={}", request.getPortfolioId());
        
        // 1. 获取 Portfolio 信息
        Portfolio portfolio = portfolioService.getPortfolio(request.getPortfolioId());
        List<Initiative> initiatives = initiativeService.getActiveInitiatives(
                portfolio.getWorkspaceId()
        );
        
        // 2. 对每个 Initiative 运行模拟，获取 ROI
        List<OptimizationCandidate> candidates = new ArrayList<>();
        BigDecimal totalBudget = portfolio.getTotalBudget();
        
        for (Initiative initiative : initiatives) {
            SimulationRequest simRequest = SimulationRequest.builder()
                    .workspaceId(portfolio.getWorkspaceId())
                    .goalId(portfolio.getGoalId())
                    .segmentCode(initiative.getRuleConfig() != null ?
                            initiative.getRuleConfig().get("segment") : null)
                    .channel("EMAIL")
                    .offerStrength(0.6)
                    .campaignId(null)
                    .build();
            
            SimulationResult simResult = simulationEngine.simulate(simRequest);
            
            candidates.add(OptimizationCandidate.builder()
                    .initiativeId(initiative.getId())
                    .initiativeName(initiative.getName())
                    .expectedROI(simResult.getPredictedRoi())
                    .estimatedRevenue(simResult.getPredictedRevenue())
                    .priority(initiative.getPriority())
                    .minBudget(initiative.getMinBudget())
                    .maxBudget(initiative.getMaxBudget())
                    .build());
        }
        
        // 3. 按 ROI 降序排序
        candidates.sort((a, b) -> b.getExpectedROI().compareTo(a.getExpectedROI()));
        
        // 4. 贪心分配
        Map<String, BigDecimal> allocations = new LinkedHashMap<>();
        BigDecimal remaining = totalBudget;
        
        for (OptimizationCandidate candidate : candidates) {
            // 计算建议预算：取 maxBudget 和剩余预算的较小值
            BigDecimal budget = candidate.getMaxBudget().min(remaining);
            if (budget.compareTo(candidate.getMinBudget()) >= 0) {
                allocations.put(candidate.getInitiativeId(), budget);
                remaining = remaining.subtract(budget);
            }
            if (remaining.compareTo(BigDecimal.ZERO) <= 0) break;
        }
        
        // 5. 计算总预期 ROI（加权平均）
        double totalExpectedROI = 0;
        double totalAllocated = 0;
        for (Map.Entry<String, BigDecimal> entry : allocations.entrySet()) {
            OptimizationCandidate candidate = candidates.stream()
                    .filter(c -> c.getInitiativeId().equals(entry.getKey()))
                    .findFirst()
                    .orElse(null);
            if (candidate != null) {
                double weight = entry.getValue().doubleValue();
                totalExpectedROI += candidate.getExpectedROI().doubleValue() * weight;
                totalAllocated += weight;
            }
        }
        double avgROI = totalAllocated > 0 ? totalExpectedROI / totalAllocated : 0;
        
        // 6. 保存优化结果
        OptimizationResult result = OptimizationResult.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(portfolio.getWorkspaceId())
                .portfolioId(request.getPortfolioId())
                .optimizationType("GREEDY")
                .constraints(JsonUtil.toJsonNode(request.getConstraints()))
                .optimizedAllocations(JsonUtil.toJsonNode(allocations))
                .expectedRoi(BigDecimal.valueOf(avgROI))
                .expectedRevenue(calculateExpectedRevenue(allocations, candidates))
                .iterationCount(candidates.size())
                .convergenceTimeMs(0L)
                .baselineRoi(calculateBaselineROI(candidates))
                .improvementPct(BigDecimal.valueOf(calculateImprovement(avgROI, candidates)))
                .status("DRAFT")
                .createdBy(SecurityContext.getCurrentUserId())
                .createdAt(Instant.now())
                .build();
        
        result = optimizationResultRepository.save(result);
        
        log.info("Greedy optimization completed: resultId={}, avgROI={}", 
                 result.getId(), avgROI);
        return result;
    }
    /**
     * 遗传算法优化（Phase 2 实现）
     * 
     * 算法：
     * 1. 初始化种群（随机分配预算）
     * 2. 评估每个个体的适应度（ROI）
     * 3. 选择最优个体（锦标赛选择）
     * 4. 交叉（预算重新组合）
     * 5. 变异（随机调整预算）
     * 6. 重复 2-5 直到收敛
     */
    public OptimizationResult optimizeGenetic(OptimizationRequest request) {
        log.info("Starting genetic optimization: portfolio={}", request.getPortfolioId());
        
        long startTime = System.currentTimeMillis();
        
        // 1. 获取候选 Initiative
        Portfolio portfolio = portfolioService.getPortfolio(request.getPortfolioId());
        List<Initiative> initiatives = initiativeService.getActiveInitiatives(
                portfolio.getWorkspaceId()
        );
        
        if (initiatives.isEmpty()) {
            throw new BusinessException("No initiatives available for optimization");
        }
        
        // 2. 初始化种群
        List<Individual> population = initializePopulation(
                initiatives, 
                portfolio.getTotalBudget(),
                POPULATION_SIZE
        );
        
        // 3. 进化循环
        int generations = 0;
        Individual bestIndividual = null;
        double bestFitness = Double.NEGATIVE_INFINITY;
        
        while (generations < GENETIC_ALGORITHM_GENERATIONS) {
            // 评估适应度
            for (Individual individual : population) {
                double fitness = evaluateFitness(individual, initiatives, portfolio);
                individual.setFitness(fitness);
                
                if (fitness > bestFitness) {
                    bestFitness = fitness;
                    bestIndividual = individual.clone();
                }
            }
            
            // 选择（锦标赛选择）
            List<Individual> selected = tournamentSelection(population, POPULATION_SIZE / 2);
            
            // 交叉
            List<Individual> offspring = crossover(selected, initiatives, portfolio.getTotalBudget());
            
            // 变异
            mutate(offspring, initiatives);
            
            // 替换种群
            population = new ArrayList<>(selected);
            population.addAll(offspring);
            
            // 精英保留
            if (bestIndividual != null) {
                population.set(0, bestIndividual.clone());
            }
            
            generations++;
            
            if (generations % 10 == 0) {
                log.info("Generation {}: best fitness = {}", generations, bestFitness);
            }
        }
        
        // 4. 提取最优解
        Map<String, BigDecimal> allocations = bestIndividual != null ?
                bestIndividual.getAllocation() : Collections.emptyMap();
        
        // 5. 计算预期 ROI
        double avgROI = calculateAllocationROI(allocations, initiatives);
        
        // 6. 保存结果
        OptimizationResult result = OptimizationResult.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(portfolio.getWorkspaceId())
                .portfolioId(request.getPortfolioId())
                .optimizationType("GENETIC")
                .constraints(JsonUtil.toJsonNode(request.getConstraints()))
                .optimizedAllocations(JsonUtil.toJsonNode(allocations))
                .expectedRoi(BigDecimal.valueOf(avgROI))
                .iterationCount(generations)
                .convergenceTimeMs(System.currentTimeMillis() - startTime)
                .status("DRAFT")
                .createdBy(SecurityContext.getCurrentUserId())
                .createdAt(Instant.now())
                .build();
        
        result = optimizationResultRepository.save(result);
        
        log.info("Genetic optimization completed: resultId={}, avgROI={}, generations={}", 
                 result.getId(), avgROI, generations);
        return result;
    }
    /**
     * 种群初始化
     */
    private List<Individual> initializePopulation(
            List<Initiative> initiatives,
            BigDecimal totalBudget,
            int size) {
        
        List<Individual> population = new ArrayList<>();
        for (int i = 0; i < size; i++) {
            Individual individual = new Individual();
            Map<String, BigDecimal> allocation = new HashMap<>();
            
            BigDecimal remaining = totalBudget;
            Random random = new Random();
            
            for (Initiative initiative : initiatives) {
                // 随机分配预算（0 ~ maxBudget）
                BigDecimal maxBudget = initiative.getMaxBudget() != null ?
                        initiative.getMaxBudget() :
                        totalBudget.divide(BigDecimal.valueOf(initiatives.size()), 2, RoundingMode.HALF_UP);
                
                BigDecimal budget;
                if (remaining.compareTo(BigDecimal.ZERO) <= 0) {
                    budget = BigDecimal.ZERO;
                } else {
                    double ratio = random.nextDouble() * 0.6 + 0.2; // 20%~80%
                    budget = maxBudget.multiply(BigDecimal.valueOf(ratio))
                            .min(remaining);
                }
                allocation.put(initiative.getId(), budget);
                remaining = remaining.subtract(budget);
            }
            
            individual.setAllocation(allocation);
            population.add(individual);
        }
        return population;
    }
    /**
     * 适应度评估（模拟每个个体的 ROI）
     */
    private double evaluateFitness(
            Individual individual,
            List<Initiative> initiatives,
            Portfolio portfolio) {
        
        Map<String, BigDecimal> allocation = individual.getAllocation();
        double totalWeightedROI = 0;
        double totalBudget = 0;
        
        for (Initiative initiative : initiatives) {
            BigDecimal budget = allocation.getOrDefault(initiative.getId(), BigDecimal.ZERO);
            if (budget.compareTo(BigDecimal.ZERO) <= 0) continue;
            
            // 模拟该 Initiative 的 ROI
            SimulationRequest simRequest = SimulationRequest.builder()
                    .workspaceId(portfolio.getWorkspaceId())
                    .goalId(portfolio.getGoalId())
                    .segmentCode(initiative.getRuleConfig() != null ?
                            initiative.getRuleConfig().get("segment") : null)
                    .channel("EMAIL")
                    .campaignId(null)
                    .build();
            
            SimulationResult simResult = simulationEngine.simulate(simRequest);
            
            double roi = simResult.getPredictedRoi() != null ?
                    simResult.getPredictedRoi().doubleValue() : 0;
            
            totalWeightedROI += roi * budget.doubleValue();
            totalBudget += budget.doubleValue();
        }
        
        return totalBudget > 0 ? totalWeightedROI / totalBudget : 0;
    }
    /**
     * 锦标赛选择
     */
    private List<Individual> tournamentSelection(List<Individual> population, int size) {
        List<Individual> selected = new ArrayList<>();
        Random random = new Random();
        int tournamentSize = 5;
        
        for (int i = 0; i < size; i++) {
            Individual best = null;
            double bestFitness = Double.NEGATIVE_INFINITY;
            
            for (int j = 0; j < tournamentSize; j++) {
                Individual candidate = population.get(random.nextInt(population.size()));
                if (candidate.getFitness() > bestFitness) {
                    bestFitness = candidate.getFitness();
                    best = candidate;
                }
            }
            selected.add(best.clone());
        }
        return selected;
    }
    /**
     * 交叉操作
     */
    private List<Individual> crossover(
            List<Individual> parents,
            List<Initiative> initiatives,
            BigDecimal totalBudget) {
        
        List<Individual> offspring = new ArrayList<>();
        Random random = new Random();
        
        for (int i = 0; i < parents.size() - 1; i += 2) {
            Individual p1 = parents.get(i);
            Individual p2 = parents.get(i + 1);
            
            // 单点交叉
            Map<String, BigDecimal> childAllocation = new HashMap<>();
            int crossPoint = random.nextInt(initiatives.size());
            
            for (int j = 0; j < initiatives.size(); j++) {
                Initiative initiative = initiatives.get(j);
                if (j < crossPoint) {
                    childAllocation.put(initiative.getId(), 
                            p1.getAllocation().getOrDefault(initiative.getId(), BigDecimal.ZERO));
                } else {
                    childAllocation.put(initiative.getId(), 
                            p2.getAllocation().getOrDefault(initiative.getId(), BigDecimal.ZERO));
                }
            }
            
            // 归一化确保预算总和等于 totalBudget
            normalizeAllocation(childAllocation, totalBudget);
            
            Individual child = new Individual();
            child.setAllocation(childAllocation);
            offspring.add(child);
        }
        
        return offspring;
    }
    /**
     * 变异操作
     */
    private void mutate(List<Individual> individuals, List<Initiative> initiatives) {
        Random random = new Random();
        double mutationRate = 0.1;
        
        for (Individual individual : individuals) {
            if (random.nextDouble() < mutationRate) {
                // 随机选择一个 Initiative 调整预算
                int idx = random.nextInt(initiatives.size());
                Initiative initiative = initiatives.get(idx);
                BigDecimal current = individual.getAllocation()
                        .getOrDefault(initiative.getId(), BigDecimal.ZERO);
                
                // 调整 ±20%
                double factor = 0.8 + random.nextDouble() * 0.4;
                BigDecimal newValue = current.multiply(BigDecimal.valueOf(factor));
                individual.getAllocation().put(initiative.getId(), newValue);
            }
        }
    }
}
```
### 4.2.3 AI Campaign 生成器
```java
@Service
@Slf4j
public class AICampaignGenerator {
    @Autowired
    private LLMClient llmClient;
    @Autowired
    private SimulationEngine simulationEngine;
    @Autowired
    private CanvasToBpmnCompiler canvasCompiler;
    /**
     * AI 生成 Campaign 蓝图
     * 
     * 流程：
     * 1. 构建 Prompt（包含 Goal、Opportunity、Budget、约束）
     * 2. 调用 LLM 生成 DAG JSON
     * 3. 验证 DAG 合法性
     * 4. 返回 Canvas DAG
     */
    public CanvasGraph generateCampaign(GenerateCampaignRequest request) {
        log.info("AI generating campaign for goal: {}", request.getGoalId());
        
        // 1. 构建上下文
        Goal goal = goalService.getGoal(request.getGoalId());
        List<Opportunity> opportunities = opportunityService.getTopOpportunities(
                request.getGoalId(), 100
        );
        
        // 2. 构建 Prompt
        String systemPrompt = """
                你是一个营销活动工作流生成器。
                你的任务是为给定的营销目标生成一个可执行的 DAG（有向无环图）。
                
                可用节点类型：
                - AUDIENCE_FILTER: 人群筛选
                - AI_SCORE: AI 评分
                - CONDITION: 条件分支
                - SEND_EMAIL: 发送邮件
                - SEND_SMS: 发送短信
                - DELAY: 延迟等待
                - OFFER_POINTS: 发放积分
                - OFFER_COUPON: 发放优惠券
                
                约束：
                1. 输出必须是合法的 JSON，包含 nodes 和 edges
                2. 必须是 DAG（无环）
                3. 最大深度 10，最大节点数 50
                4. 每个节点必须有合法的 config
                
                输出格式：
                {
                  "nodes": [{"id": "N1", "type": "AUDIENCE_FILTER", "config": {...}}],
                  "edges": [{"from": "N1", "to": "N2"}]
                }
                """;
        
        String userPrompt = String.format("""
                目标信息：
                - 名称: %s
                - 类型: %s
                - 预算: %.2f
                - 时间范围: %s ~ %s
                
                机会摘要：
                - 总机会数: %d
                - 主要类型分布: %s
                - 平均评分: %.2f
                
                请生成一个最优的营销工作流。
                """,
                goal.getName(),
                goal.getGoalType(),
                request.getBudget(),
                goal.getStartTime(),
                goal.getEndTime(),
                opportunities.size(),
                getOpportunityTypeDistribution(opportunities),
                opportunities.stream().mapToDouble(Opportunity::getScore).average().orElse(0)
        );
        
        // 3. 调用 LLM
        String llmResponse = llmClient.chatWithSystem(systemPrompt, userPrompt);
        
        // 4. 解析为 CanvasGraph
        CanvasGraph graph = parseCanvasGraph(llmResponse);
        
        // 5. 验证 DAG
        validateGraph(graph);
        
        log.info("AI generated campaign: nodes={}, edges={}", 
                 graph.getNodes().size(), graph.getEdges().size());
        return graph;
    }
    /**
     * 验证 DAG 合法性
     */
    private void validateGraph(CanvasGraph graph) {
        // 1. 检查是否有循环
        if (hasCycle(graph)) {
            throw new BusinessException("Generated DAG contains cycle");
        }
        
        // 2. 检查是否有孤立节点
        Set<String> connectedNodes = new HashSet<>();
        for (Edge edge : graph.getEdges()) {
            connectedNodes.add(edge.getFrom());
            connectedNodes.add(edge.getTo());
        }
        for (Node node : graph.getNodes()) {
            if (!connectedNodes.contains(node.getId()) && 
                !"START".equals(node.getType()) && 
                !"END".equals(node.getType())) {
                log.warn("Isolated node detected: {}", node.getId());
            }
        }
        
        // 3. 检查是否有 END 节点
        boolean hasEnd = graph.getNodes().stream()
                .anyMatch(n -> "END".equals(n.getType()));
        if (!hasEnd) {
            throw new BusinessException("Missing END node");
        }
    }
}
```
***
## 4.3 前端界面设计
### 4.3.1 模拟配置页面
```text
┌─ 模拟与优化 ──────────────────────────────────────────────────────────────────┐
│  当前目标: GMV提升20% (ACTIVE)                                              │
│                                                                             │
│  [📊 模拟] [🎯 优化] [📋 历史]                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 模拟配置 ─────────────────────────────────────────────────────────────┐ │
│  │  模拟名称: [Q2促销策略模拟        ]                                    │ │
│  │  目标分群: [HIGH_VALUE (高价值会员) ▼]                                 │ │
│  │  渠道:     [EMAIL ▼]                                                  │ │
│  │  Offer强度: [████████░░░░] 60%                                        │ │
│  │  预算:      [ 100,000 ] 元                                            │ │
│  │                                                                        │ │
│  │  ┌─ 高级选项 ───────────────────────────────────────────────────────┐  │ │
│  │  │  使用 ML 模型: [✓]                                              │  │ │
│  │  │  模拟次数:     [1000]                                           │  │ │
│  │  │  随机种子:     [42]                                             │  │ │
│  │  └──────────────────────────────────────────────────────────────────┘  │ │
│  │                                                                        │ │
│  │                              [▶ 运行模拟]  [保存场景]                  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 模拟结果 ─────────────────────────────────────────────────────────────┐ │
│  │  基线转化率: 12.3%                                                     │ │
│  │  预测转化率: 18.7%  ↑ +52%                                            │ │
│  │  预测 ROI:    2.3x                                                    │ │
│  │  置信度:      85%                                                     │ │
│  │                                                                        │ │
│  │  ┌─────────────┬─────────────┬─────────────┬─────────────┐           │ │
│  │  │ 分群        │ 曝光人数    │ 互动人数    │ 转化人数    │           │ │
│  │  ├─────────────┼─────────────┼─────────────┼─────────────┤           │ │
│  │  │ HIGH_VALUE  │ 12,345      │ 8,234      │ 2,469      │           │ │
│  │  │ MEDIUM      │ 8,456       │ 5,123      │ 1,234      │           │ │
│  │  │ LOW         │ 5,678       │ 2,890      │ 567        │           │ │
│  │  └─────────────┴─────────────┴─────────────┴─────────────┘           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 4.3.2 What-if 对比视图
```text
┌─ What-if 场景对比 ────────────────────────────────────────────────────────────┐
│  [▼ 选择场景]                                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 场景 A: 高预算策略 ────────────────────────────────────────────────────┐ │
│  │  预算: ¥300,000  │  渠道: EMAIL+SMS  │  ROI: 2.1x                    │ │
│  │  转化率: 16.2%   │  置信度: 82%                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 场景 B: 精准营销策略 ──────────────────────────────────────────────────┐ │
│  │  预算: ¥150,000  │  渠道: SMS  │  ROI: 3.2x                          │ │
│  │  转化率: 14.8%   │  置信度: 78%                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 对比分析 ──────────────────────────────────────────────────────────────┐ │
│  │                                                                         │ │
│  │  ROI对比:  ████████████ 场景B (3.2x)                                   │ │
│  │            ████████ 场景A (2.1x)                                       │ │
│  │            ████ 基线 (1.0x)                                            │ │
│  │                                                                         │ │
│  │  预算效率: 场景B 每万元 ROI = 2.13                                    │ │
│  │            场景A 每万元 ROI = 0.70                                     │ │
│  │                                                                         │ │
│  │  ✅ 推荐: 场景B (精准营销策略) 更优，ROI 高 52%                        │ │
│  │                                                                         │ │
│  │                              [应用最优方案]                             │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 4.4 前后端 JSON 交互
### 4.4.1 运行模拟
**Request:**
```json
POST /api/campaign/simulation/run
{
    "workspaceId": "ws_001",
    "goalId": "goal_001",
    "name": "Q2促销策略模拟",
    "segmentCode": "HIGH_VALUE",
    "channel": "EMAIL",
    "offerStrength": 0.6,
    "budget": 100000,
    "advancedConfig": {
        "useML": true,
        "simulationCount": 1000,
        "randomSeed": 42
    }
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "simulationId": "sim_001",
        "name": "Q2促销策略模拟",
        "baselineConversion": 0.123,
        "predictedConversion": 0.187,
        "upliftPct": 0.52,
        "predictedRevenue": 234567.89,
        "predictedRoi": 2.3,
        "confidence": 0.85,
        "exposureCount": 12345,
        "behaviorCount": 8234,
        "conversionCount": 2469,
        "segmentBreakdown": {
            "HIGH_VALUE": {
                "members": 12345,
                "conversions": 2469,
                "conversionRate": 0.20
            },
            "MEDIUM": {
                "members": 8456,
                "conversions": 1234,
                "conversionRate": 0.146
            }
        },
        "createdAt": "2026-06-26T10:00:00Z"
    }
}
```
### 4.4.2 运行优化
**Request:**
```json
POST /api/campaign/optimization/run
{
    "portfolioId": "port_001",
    "optimizationType": "GENETIC",
    "constraints": {
        "maxBudget": 650000,
        "minInitiativeBudget": 50000,
        "maxInitiativeBudget": 300000,
        "channelCapacity": {
            "EMAIL": 50000,
            "SMS": 20000
        },
        "maxGenerations": 50,
        "populationSize": 100
    }
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "optimizationId": "opt_001",
        "optimizationType": "GENETIC",
        "status": "COMPLETED",
        "expectedRoi": 2.45,
        "improvementPct": 0.32,
        "iterationCount": 50,
        "convergenceTimeMs": 23456,
        "allocations": {
            "ini_001": 280000,
            "ini_002": 220000,
            "ini_003": 150000
        },
        "allocationDetails": [
            {
                "initiativeId": "ini_001",
                "initiativeName": "高价值会员召回",
                "allocatedBudget": 280000,
                "expectedRoi": 2.8,
                "percentage": 43.1
            },
            {
                "initiativeId": "ini_002",
                "initiativeName": "新会员促活",
                "allocatedBudget": 220000,
                "expectedRoi": 2.2,
                "percentage": 33.8
            },
            {
                "initiativeId": "ini_003",
                "initiativeName": "会员升级激励",
                "allocatedBudget": 150000,
                "expectedRoi": 2.3,
                "percentage": 23.1
            }
        ],
        "baselineRoi": 1.85,
        "createdAt": "2026-06-26T10:00:00Z"
    }
}
```
***
## 4.5 前端复杂逻辑伪代码
### 4.5.1 模拟结果可视化
```tsx
// components/SimulationResultChart.tsx
import React from 'react';
import { Line, Bar } from 'react-chartjs-2';
interface SimulationResult {
  baselineConversion: number;
  predictedConversion: number;
  segmentBreakdown: Record<string, { conversionRate: number; members: number }>;
}
export const SimulationResultChart: React.FC<{ result: SimulationResult }> = ({ result }) => {
  // 转化率对比图
  const conversionData = {
    labels: ['基线', '预测'],
    datasets: [
      {
        label: '转化率',
        data: [
          result.baselineConversion * 100,
          result.predictedConversion * 100
        ],
        backgroundColor: ['#9ca3af', '#3b82f6'],
        borderRadius: 4
      }
    ]
  };
  // 分群转化率对比
  const segmentData = {
    labels: Object.keys(result.segmentBreakdown),
    datasets: [
      {
        label: '转化率',
        data: Object.values(result.segmentBreakdown).map(s => s.conversionRate * 100),
        backgroundColor: '#22c55e'
      }
    ]
  };
  return (
    <div className="simulation-charts">
      <div className="chart-container">
        <h4>转化率预测</h4>
        <Bar 
          data={conversionData}
          options={{
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx) => `${ctx.parsed.y.toFixed(1)}%`
                }
              }
            },
            scales: {
              y: { 
                beginAtZero: true,
                ticks: { callback: (v) => v + '%' }
              }
            }
          }}
        />
        <div className="uplift-badge">
          ↑ {((result.predictedConversion / result.baselineConversion - 1) * 100).toFixed(0)}% 提升
        </div>
      </div>
      
      <div className="chart-container">
        <h4>分群表现</h4>
        <Bar 
          data={segmentData}
          options={{
            plugins: {
              legend: { display: false }
            },
            scales: {
              y: { 
                beginAtZero: true,
                ticks: { callback: (v) => v + '%' }
              }
            }
          }}
        />
      </div>
    </div>
  );
};
```
### 4.5.2 优化进度实时展示
```typescript
// hooks/useOptimization.ts
import { useMutation, useQuery } from '@tanstack/react-query';
export const useOptimization = (portfolioId: string) => {
  const queryClient = useQueryClient();
  // 运行优化（支持进度回调）
  const runOptimization = useMutation({
    mutationFn: async (params: OptimizationParams) => {
      // 使用 SSE 或 WebSocket 获取实时进度
      const eventSource = new EventSource(
        `/api/campaign/optimization/stream?portfolioId=${portfolioId}`
      );
      
      return new Promise((resolve, reject) => {
        let result: any = null;
        
        eventSource.onmessage = (event) => {
          const data = JSON.parse(event.data);
          if (data.type === 'progress') {
            // 更新进度
            queryClient.setQueryData(
              ['optimization-progress', portfolioId],
              { generation: data.generation, bestFitness: data.bestFitness }
            );
          } else if (data.type === 'complete') {
            result = data.result;
            eventSource.close();
            resolve(result);
          } else if (data.type === 'error') {
            reject(new Error(data.message));
            eventSource.close();
          }
        };
        
        eventSource.onerror = () => {
          reject(new Error('Optimization stream error'));
          eventSource.close();
        };
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ 
        queryKey: ['optimization-result', portfolioId] 
      });
    }
  });
  // 获取优化进度
  const { data: progress } = useQuery({
    queryKey: ['optimization-progress', portfolioId],
    queryFn: () => queryClient.getQueryData(['optimization-progress', portfolioId]),
    refetchInterval: 1000
  });
  return {
    runOptimization: runOptimization.mutateAsync,
    isRunning: runOptimization.isPending,
    progress,
    result: runOptimization.data
  };
};
```
***
## 4.6 异常处理与业务规则
### 4.6.1 业务异常枚举
```java
public enum SimulationErrorCode {
    NO_MEMBERS_FOUND("S001", "No members found for the specified segment"),
    NO_HISTORICAL_DATA("S002", "Insufficient historical data for baseline calculation"),
    SIMULATION_FAILED("S003", "Simulation execution failed"),
    OPTIMIZATION_FAILED("S004", "Optimization execution failed"),
    INVALID_CONSTRAINTS("S005", "Invalid optimization constraints"),
    OPTIMIZATION_NOT_CONVERGED("S006", "Optimization did not converge"),
    SCENARIO_NOT_FOUND("S007", "Scenario not found");
}
```
### 4.6.2 模拟置信度计算
```java
@Component
public class ConfidenceCalculator {
    
    /**
     * 基于样本量和模型稳定性计算置信度
     */
    public double calculateConfidence(int sampleSize, double modelStability) {
        // 样本量因子：样本越大，置信度越高
        double sampleFactor = Math.min(sampleSize / 1000.0, 1.0);
        // 模型稳定性因子（来自 ML 服务的模型版本稳定性）
        double stabilityFactor = Math.min(modelStability, 1.0);
        // 综合置信度
        return 0.6 * sampleFactor + 0.4 * stabilityFactor;
    }
}
```
***
## 4.7 与 Loyalty 系统的集成点
| 集成点                | Loyalty 能力            | 使用方式                             |
| ------------------ | --------------------- | -------------------------------- |
| **会员数据**           | `member` 表            | 通过 `campaign_member_dim` 获取分群用户  |
| **订单数据**           | `account_transaction` | 通过 `campaign_order_fact` 计算基线转化率 |
| **历史 Campaign 数据** | `event_inbox`         | 用于计算历史渠道互动率                      |
| **EventBridge**    | 事件发布                  | 模拟/优化完成后发布事件，触发决策引擎              |
| **ChannelService** | 渠道配置                  | 读取渠道容量和成本配置                      |
***
## 4.8 开发实施检查清单
* 创建 `campaign_simulation_result` 表
* 创建 `campaign_simulation_scenario` 表
* 创建 `campaign_optimization_result` 表
* 实现 `SimulationEngine`（三层模拟模型）
* 实现 `OptimizationEngine`（贪心 + 遗传算法）
* 实现 `AICampaignGenerator`（AI 生成 DAG）
* 实现 `BaselineCalculator`（基线计算）
* 实现 `ConfidenceCalculator`（置信度计算）
* 实现前端模拟配置页面
* 实现前端模拟结果可视化（图表）
* 实现前端 What-if 场景对比
* 实现前端优化进度实时展示（SSE）
* 集成 ML 服务作为模拟输入
* 编写单元测试（覆盖率 > 80%）
