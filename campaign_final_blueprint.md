# 目标到举措策略拆解引擎详细设计
> **版本**：1.0\
> **对应章节**：第1章（Planning Workspace）扩展 + 第2章（Opportunity）集成 + 第4章（Simulation）集成\
> **核心定位**：补齐从“老板指令（Goal）”到“具体动作（Initiative）”之间缺失的**策略推演、拆解、AI推荐与归因分析**能力。支持“有蓝图”和“无蓝图”两种运行模式，开箱即用。\
> **设计原则**：**5步向导 + 配置驱动 + 算法辅助 + 人机协作 + 自我进化**
## 一、整体架构与5步主线
### 1.1 核心主线（用户视角）
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                   策略执行主线（5步向导）                                  │
│                                                                             │
│  Step 1               Step 2               Step 3               Step 4     │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────┐    ┌─────────────┐ │
│  │ 1. 定目标 │ -> │ 2. 算缺口   │ -> │ 3. 选策略   │ -> │ 4. 建举措   │ │
│  │ (老板指令)│    │ (系统自动算) │    │ (AI推荐+调优)│    │ (一键生成)  │ │
│  └──────────┘    └──────────────┘    └──────────────┘    └─────────────┘ │
│                                                                       │     │
│                                                                       ▼     │
│                                                              Step 5         │
│                                                    ┌─────────────────────┐ │
│                                                    │ 5. 执行与闭环       │ │
│                                                    │ (画布自动生成)      │ │
│                                                    └─────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 1.2 两种运行模式
| 模式        | 触发条件      | 系统行为                    | 输出质量     |
| --------- | --------- | ----------------------- | -------- |
| **有蓝图模式** | 匹配到行业策略蓝图 | 按公式精准拆解，计算各杠杆目标值        | 精准可量化    |
| **无蓝图模式** | 未匹配到蓝图    | 动态归因分析 + 离群值发现 + 通用策略模板 | 有数据支撑的建议 |
## 二、与现有系统的融合策略
### 2.1 融合总览
| 现有模块                    | 融合方式                                           | 变更类型   |
| ----------------------- | ---------------------------------------------- | ------ |
| **Goal（第1章）**           | Step 1 输入，增加 `industry_type`、`blueprint_id` 字段 | 表扩展    |
| **Simulation（第4章）**     | Step 2 调用 `predictBaseline()` 计算自然增长率          | 复用，无变更 |
| **Opportunity（第2章）**    | Step 3 调用 `findByLever()` 获取机会列表，AI生成人群规则      | 新增方法   |
| **Initiative（第1章）**     | Step 4 输出，新增 `analysis_json` 记录完整归因            | 表扩展    |
| **Canvas（第8章）**         | Step 5 自动生成画布，人群规则注入 AUDIENCE\_FILTER          | 新增自动生成 |
| **Execution（第5章）**      | Step 5 复用现有执行能力                                | 无变更    |
| **Content（第13章）**       | 权益建议复用素材模板                                     | 无变更    |
| **Event/Feedback（第6章）** | 执行结果回流，用于蓝图自我进化                                | 新增反馈写入 |
## 三、数据模型设计
### 3.1 扩展 campaign\_goal 表
```sql
-- ============================================================
-- 扩展目标表（支持策略拆解）
-- ============================================================
ALTER TABLE campaign_goal ADD COLUMN industry_type VARCHAR(64);
COMMENT ON COLUMN campaign_goal.industry_type IS '行业类型：RETAIL / SAAS / FINANCE / EDUCATION / AUTO / ...';
ALTER TABLE campaign_goal ADD COLUMN blueprint_id VARCHAR(64);
COMMENT ON COLUMN campaign_goal.blueprint_id IS '关联的策略蓝图ID（可为空，空则进入无蓝图探索模式）';
ALTER TABLE campaign_goal ADD COLUMN workflow_status VARCHAR(32) DEFAULT 'GOAL_DRAFT';
COMMENT ON COLUMN campaign_goal.workflow_status IS '策略工作流状态：GOAL_DRAFT / GAP_ANALYZED / STRATEGY_SELECTED / INITIATIVE_CREATED / READY_TO_EXECUTE';
ALTER TABLE campaign_goal ADD COLUMN avg_order_value DECIMAL(18,4);
COMMENT ON COLUMN campaign_goal.avg_order_value IS '平均客单价（用于贡献估算）';
```
### 3.2 策略蓝图配置表（已有，补充字段）
```sql
-- ============================================================
-- 策略蓝图配置表（补充降级策略）
-- ============================================================
ALTER TABLE campaign_strategy_blueprint ADD COLUMN fallback_mode VARCHAR(32) DEFAULT 'CORRELATION';
COMMENT ON COLUMN campaign_strategy_blueprint.fallback_mode IS '无蓝图时的降级模式：CORRELATION / OUTLIER / TEMPLATE';
ALTER TABLE campaign_strategy_blueprint ADD COLUMN is_system_default BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN campaign_strategy_blueprint.is_system_default IS '是否为系统内置通用蓝图（作为最终降级）';
```
### 3.3 策略学习记录表（campaign\_strategy\_learning）
```sql
-- ============================================================
-- 策略学习记录（系统自我进化）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_strategy_learning (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    industry_type VARCHAR(64) NOT NULL,
    goal_type VARCHAR(32) NOT NULL,
    
    -- 策略信息
    lever_code VARCHAR(64),
    initiative_type VARCHAR(32),
    audience_signature VARCHAR(255),              -- 人群规则的特征哈希
    
    -- 执行结果
    executed_goal_id VARCHAR(64),
    predicted_contribution DECIMAL(18,4),
    actual_contribution DECIMAL(18,4),
    conversion_rate DECIMAL(10,4),
    roi DECIMAL(10,4),
    
    -- 置信度
    confidence DECIMAL(5,2) DEFAULT 0.5,
    execution_count INT DEFAULT 0,
    success_count INT DEFAULT 0,
    
    -- 元数据
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_csl_industry ON campaign_strategy_learning(industry_type, goal_type);
CREATE INDEX idx_csl_confidence ON campaign_strategy_learning(confidence DESC);
```
### 3.4 扩展 campaign\_initiative 表
```sql
-- ============================================================
-- 扩展举措表（记录完整归因）
-- ============================================================
ALTER TABLE campaign_initiative ADD COLUMN analysis_json JSONB;
COMMENT ON COLUMN campaign_initiative.analysis_json IS '策略拆解完整归因：拆解逻辑、数据支撑、AI元数据、贡献预估';
```
### 3.5 目标拆解结果表（已有，确认结构）
```sql
-- ============================================================
-- 目标拆解结果表（确认结构）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_goal_decomposition (
    id VARCHAR(64) PRIMARY KEY,
    goal_id VARCHAR(64) NOT NULL,
    blueprint_id VARCHAR(64),
    workspace_id VARCHAR(64) NOT NULL,
    
    target_value DECIMAL(18,4),
    baseline_value DECIMAL(18,4),
    total_gap DECIMAL(18,4),
    
    -- 拆解模式：BLUEPRINT / CORRELATION / OUTLIER
    decomposition_mode VARCHAR(32) NOT NULL,
    
    lever_gaps JSONB,
    initiative_suggestions JSONB,
    adopted_plan_id VARCHAR(64),
    
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
## 四、后端服务详细设计
### 4.1 策略工作流状态机
```java
public enum StrategyWorkflowStatus {
    GOAL_DRAFT,        // Step 1：目标已创建，待拆解
    GAP_ANALYZED,      // Step 2：缺口已计算
    STRATEGY_SELECTED, // Step 3：策略已选择
    INITIATIVE_CREATED,// Step 4：举措已创建
    READY_TO_EXECUTE   // Step 5：待执行
}
```
### 4.2 核心服务：StrategyWorkflowService（5步主线）
```java
package com.loyalty.platform.campaign.strategy.workflow;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Slf4j
@Service
@RequiredArgsConstructor
public class StrategyWorkflowService {
    private final GoalRepository goalRepository;
    private final StrategyBlueprintRepository blueprintRepository;
    private final GoalDecompositionEngine decompositionEngine;
    private final StrategySimulationEngine simulationEngine;
    private final InitiativeService initiativeService;
    private final CanvasAutoGenerator canvasAutoGenerator;
    private final StrategyLearningService learningService;
    // ==================== Step 1: 定目标 ====================
    /**
     * 创建目标（含行业类型）
     * 用户输入：目标名称、目标值、时间范围、行业类型
     */
    @Transactional
    public Goal createGoalWithIndustry(CreateGoalRequest request) {
        Goal goal = Goal.builder()
                .name(request.getName())
                .goalType(request.getGoalType())
                .targetMetric(request.getTargetMetric())
                .targetValue(request.getTargetValue())
                .startTime(request.getStartTime())
                .endTime(request.getEndTime())
                .industryType(request.getIndustryType())
                .avgOrderValue(request.getAvgOrderValue())
                .workflowStatus("GOAL_DRAFT")
                .build();
        
        // 自动匹配合适的蓝图
        StrategyBlueprint blueprint = findBestMatchingBlueprint(request);
        if (blueprint != null) {
            goal.setBlueprintId(blueprint.getId());
        }
        
        goal = goalRepository.save(goal);
        log.info("Goal created with workflow status: GOAL_DRAFT, industry: {}", goal.getIndustryType());
        return goal;
    }
    /**
     * 自动匹配蓝图（优先级：行业专用 > 通用 > null）
     */
    private StrategyBlueprint findBestMatchingBlueprint(CreateGoalRequest request) {
        // 1. 查找行业专用蓝图
        List<StrategyBlueprint> industryBlueprints = blueprintRepository
                .findByIndustryTypeAndIsActiveTrue(request.getIndustryType());
        if (!industryBlueprints.isEmpty()) {
            return industryBlueprints.get(0);
        }
        // 2. 查找系统通用蓝图
        return blueprintRepository.findByIsSystemDefaultTrueAndIsActiveTrue()
                .orElse(null);
    }
    // ==================== Step 2: 算缺口 ====================
    /**
     * 执行拆解（用户点击"算缺口"按钮）
     * 系统自动完成：基线计算 → 缺口计算 → 杠杆拆解
     */
    @Transactional
    public GoalDecomposition analyzeGap(String goalId) {
        Goal goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new RuntimeException("Goal not found"));
        // 1. 执行拆解（引擎自动判断有/无蓝图）
        GoalDecomposition decomposition = decompositionEngine.decompose(goal);
        // 2. 更新目标状态
        goal.setWorkflowStatus("GAP_ANALYZED");
        goalRepository.save(goal);
        log.info("Gap analysis completed: goalId={}, mode={}, totalGap={}",
                goalId, decomposition.getDecompositionMode(), decomposition.getTotalGap());
        return decomposition;
    }
    // ==================== Step 3: 选策略（人机协作） ====================
    /**
     * 获取策略建议列表（含解释数据）
     */
    public List<StrategySuggestion> getStrategySuggestions(String goalId) {
        GoalDecomposition decomposition = decompositionRepository
                .findLatestByGoalId(goalId)
                .orElseThrow(() -> new RuntimeException("Decomposition not found"));
        return decomposition.getInitiativeSuggestions();
    }
    /**
     * 模拟调整参数（用户拖动滑块时调用）
     */
    public SimulationResult simulateAdjustment(String goalId, String suggestionId,
                                                Map<String, Object> adjustments) {
        return simulationEngine.simulate(goalId, suggestionId, adjustments);
    }
    /**
     * 确认选择策略（用户点击"采纳"）
     */
    @Transactional
    public void confirmStrategy(String goalId, List<String> selectedSuggestionIds) {
        Goal goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new RuntimeException("Goal not found"));
        // 记录选中的策略
        goal.setSelectedSuggestionIds(selectedSuggestionIds);
        goal.setWorkflowStatus("STRATEGY_SELECTED");
        goalRepository.save(goal);
        log.info("Strategies confirmed: goalId={}, count={}",
                goalId, selectedSuggestionIds.size());
    }
    // ==================== Step 4: 建举措 ====================
    /**
     * 一键创建举措（用户确认后）
     */
    @Transactional
    public List<Initiative> createInitiativesFromStrategies(String goalId, 
                                                             CreateInitiativesRequest request) {
        Goal goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new RuntimeException("Goal not found"));
        List<Initiative> createdInitiatives = new ArrayList<>();
        for (String suggestionId : goal.getSelectedSuggestionIds()) {
            StrategySuggestion suggestion = getSuggestionById(suggestionId);
            // 构建举措
            Initiative initiative = Initiative.builder()
                    .id(UUID.randomUUID().toString())
                    .workspaceId(goal.getWorkspaceId())
                    .goalId(goalId)
                    .name(suggestion.getInitiativeName())
                    .initiativeType(suggestion.getInitiativeType())
                    .priority(request.getPriority())
                    .ruleConfig(suggestion.getAudienceRules())
                    .analysisJson(buildAnalysisJson(goal, suggestion))
                    .status("PLANNED")
                    .build();
            createdInitiatives.add(initiativeService.create(initiative));
            // 记录学习数据（供后续进化）
            learningService.recordStrategySuggestion(goal, suggestion);
        }
        // 更新目标状态
        goal.setWorkflowStatus("INITIATIVE_CREATED");
        goalRepository.save(goal);
        log.info("Initiatives created: goalId={}, count={}",
                goalId, createdInitiatives.size());
        return createdInitiatives;
    }
    /**
     * 构建归因分析JSON
     */
    private JsonNode buildAnalysisJson(Goal goal, StrategySuggestion suggestion) {
        Map<String, Object> analysis = new HashMap<>();
        analysis.put("decomposition_mode", suggestion.getDecompositionMode());
        analysis.put("lever_code", suggestion.getLeverCode());
        analysis.put("lever_name", suggestion.getLeverName());
        analysis.put("expected_contribution", suggestion.getExpectedContribution());
        analysis.put("percentage_of_goal", suggestion.getPercentageOfGoal());
        analysis.put("confidence", suggestion.getConfidence());
        analysis.put("rationale", suggestion.getRationale());
        analysis.put("ai_metadata", suggestion.getAiMetadata());
        analysis.put("created_at", Instant.now().toString());
        return JsonUtil.toJsonNode(analysis);
    }
    // ==================== Step 5: 执行 ====================
    /**
     * 生成画布（自动创建并关联）
     */
    @Transactional
    public Canvas generateCanvas(String goalId) {
        Goal goal = goalRepository.findById(goalId)
                .orElseThrow(() -> new RuntimeException("Goal not found"));
        // 获取相关的 Initiatives
        List<Initiative> initiatives = initiativeService.findByGoalId(goalId);
        // 自动生成画布（包含人群筛选 + 发送节点）
        Canvas canvas = canvasAutoGenerator.generate(goal, initiatives);
        // 更新目标状态
        goal.setWorkflowStatus("READY_TO_EXECUTE");
        goalRepository.save(goal);
        log.info("Canvas generated: goalId={}, canvasId={}", goalId, canvas.getId());
        return canvas;
    }
}
```
### 4.3 拆解引擎：GoalDecompositionEngine（支持有/无蓝图）
```java
package com.loyalty.platform.campaign.strategy.engine;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
@Slf4j
@Service
@RequiredArgsConstructor
public class GoalDecompositionEngine {
    private final BlueprintDecompositionService blueprintService;
    private final CorrelationDecompositionService correlationService;
    private final OutlierDecompositionService outlierService;
    private final TemplateDecompositionService templateService;
    /**
     * 核心拆解方法：自动判断有/无蓝图
     */
    public GoalDecomposition decompose(Goal goal) {
        // 1. 计算基线
        double baseline = calculateBaseline(goal);
        double target = goal.getTargetValue().doubleValue();
        double totalGap = target - baseline;
        // 2. 判断是否有蓝图
        if (goal.getBlueprintId() != null) {
            // 有蓝图 → 精准拆解
            return decomposeWithBlueprint(goal, baseline, totalGap);
        } else {
            // 无蓝图 → 探索模式
            return decomposeWithoutBlueprint(goal, baseline, totalGap);
        }
    }
    /**
     * 有蓝图模式：按公式精准拆解
     */
    private GoalDecomposition decomposeWithBlueprint(Goal goal, double baseline, double totalGap) {
        StrategyBlueprint blueprint = blueprintRepository.findById(goal.getBlueprintId())
                .orElseThrow(() -> new RuntimeException("Blueprint not found"));
        log.info("Decomposing with blueprint: {}", blueprint.getBlueprintName());
        // 1. 解析公式，计算各杠杆当前值和目标值
        List<LeverResult> leverResults = blueprintService.calculateLevers(goal, blueprint, totalGap);
        // 2. 生成策略建议
        List<StrategySuggestion> suggestions = blueprintService.generateSuggestions(
                goal, blueprint, leverResults, totalGap
        );
        return GoalDecomposition.builder()
                .goalId(goal.getId())
                .decompositionMode("BLUEPRINT")
                .blueprintId(blueprint.getId())
                .baselineValue(baseline)
                .totalGap(totalGap)
                .leverGaps(leverResults)
                .initiativeSuggestions(suggestions)
                .build();
    }
    /**
     * 无蓝图模式：动态归因 + 离群值发现
     */
    private GoalDecomposition decomposeWithoutBlueprint(Goal goal, double baseline, double totalGap) {
        log.info("Decomposing without blueprint, using exploration mode");
        // 1. 动态归因：计算各维度相关性
        List<CorrelationResult> correlations = correlationService.analyzeCorrelations(goal);
        // 2. 确定高影响力杠杆
        List<LeverResult> leverResults = correlationService.deriveLeversFromCorrelations(
                goal, correlations, totalGap
        );
        // 3. 离群值发现：找出高价值异常群体
        List<OutlierSegment> outlierSegments = outlierService.discoverOutliers(goal);
        // 4. 生成策略建议（基于通用模板 + 离群数据）
        List<StrategySuggestion> suggestions = templateService.generateSuggestions(
                goal, leverResults, outlierSegments, totalGap
        );
        return GoalDecomposition.builder()
                .goalId(goal.getId())
                .decompositionMode("EXPLORATION")
                .blueprintId(null)
                .baselineValue(baseline)
                .totalGap(totalGap)
                .leverGaps(leverResults)
                .initiativeSuggestions(suggestions)
                .build();
    }
    private double calculateBaseline(Goal goal) {
        // 复用 SimulationEngine
        return simulationEngine.predictBaseline(goal);
    }
}
```
### 4.4 相关性归因服务（无蓝图模式核心）
```java
package com.loyalty.platform.campaign.strategy.exploration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.List;
import java.util.stream.Collectors;
@Slf4j
@Service
@RequiredArgsConstructor
public class CorrelationDecompositionService {
    private final JdbcTemplate jdbcTemplate;
    /**
     * 计算各维度与目标指标的相关性
     * 
     * 使用SQL计算皮尔逊相关系数（R²）
     * 本质是纯数学计算，不依赖任何行业知识
     */
    public List<CorrelationResult> analyzeCorrelations(Goal goal) {
        String targetMetric = goal.getTargetMetric(); // 如：total_order_amount
        
        String sql = String.format("""
            WITH daily_stats AS (
                SELECT 
                    DATE(order_date) as dt,
                    SUM(net_amount) as daily_gmv,
                    COUNT(DISTINCT member_id) as daily_active_users,
                    COUNT(CASE WHEN is_new_user = true THEN 1 END) as daily_new_users,
                    AVG(order_amount) as daily_avg_order_value,
                    COUNT(CASE WHEN is_repeat = true THEN 1 END) as daily_repeat_orders,
                    SUM(points_earned) as daily_points_earned,
                    COUNT(DISTINCT category_code) as daily_category_count
                FROM campaign_order_fact
                WHERE order_date >= DATE_TRUNC('month', CURRENT_DATE) - INTERVAL '6 months'
                GROUP BY DATE(order_date)
            )
            SELECT 
                'new_user_count' as dimension,
                CORR(daily_gmv, daily_new_users) as correlation
            FROM daily_stats
            UNION ALL
            SELECT 'repeat_order_rate', CORR(daily_gmv, daily_repeat_orders)
            FROM daily_stats
            UNION ALL
            SELECT 'avg_order_value', CORR(daily_gmv, daily_avg_order_value)
            FROM daily_stats
            UNION ALL
            SELECT 'daily_active_users', CORR(daily_gmv, daily_active_users)
            FROM daily_stats
            """, targetMetric);
        return jdbcTemplate.query(sql, (rs, rowNum) -> 
            CorrelationResult.builder()
                .dimension(rs.getString("dimension"))
                .correlation(rs.getDouble("correlation"))
                .build()
        );
    }
    /**
     * 从相关性结果推导杠杆
     */
    public List<LeverResult> deriveLeversFromCorrelations(Goal goal,
                                                           List<CorrelationResult> correlations,
                                                           double totalGap) {
        // 按相关性排序，取 Top 3
        List<CorrelationResult> topCorrelations = correlations.stream()
                .sorted((a, b) -> Double.compare(b.getCorrelation(), a.getCorrelation()))
                .limit(3)
                .collect(Collectors.toList());
        // 计算总相关性权重
        double totalCorrelation = topCorrelations.stream()
                .mapToDouble(CorrelationResult::getCorrelation)
                .sum();
        List<LeverResult> levers = new ArrayList<>();
        for (CorrelationResult result : topCorrelations) {
            double weight = result.getCorrelation() / totalCorrelation;
            double leverGap = totalGap * weight;
            levers.add(LeverResult.builder()
                    .code(result.getDimension())
                    .name(mapDimensionToLeverName(result.getDimension()))
                    .currentValue(getCurrentValue(goal, result.getDimension()))
                    .targetValue(getCurrentValue(goal, result.getDimension()) + leverGap)
                    .gap(leverGap)
                    .contribution(weight)
                    .confidence(result.getCorrelation())
                    .dataSource("CORRELATION_ANALYSIS")
                    .build());
        }
        return levers;
    }
    /**
     * 维度 → 用户可读的杠杆名称
     */
    private String mapDimensionToLeverName(String dimension) {
        switch (dimension) {
            case "new_user_count": return "新客获取";
            case "repeat_order_rate": return "老客复购";
            case "avg_order_value": return "客单价提升";
            case "daily_active_users": return "用户活跃度";
            default: return dimension;
        }
    }
}
```
### 4.5 离群值发现服务（无蓝图模式）
```java
package com.loyalty.platform.campaign.strategy.exploration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.List;
@Slf4j
@Service
@RequiredArgsConstructor
public class OutlierDecompositionService {
    private final JdbcTemplate jdbcTemplate;
    /**
     * 发现高价值异常群体
     * 
     * 核心逻辑：找出"当前价值高但即将流失"的用户
     * 使用 SQL 计算 Z-score 或百分位
     */
    public List<OutlierSegment> discoverOutliers(Goal goal) {
        String sql = """
            WITH user_stats AS (
                SELECT 
                    member_id,
                    tier_code,
                    total_order_amount,
                    DATEDIFF('day', last_order_date, CURRENT_DATE) as recency_days,
                    total_order_count,
                    -- 计算价值分位数 (Top 20%)
                    PERCENT_RANK() OVER (ORDER BY total_order_amount DESC) as value_percentile,
                    -- 计算流失风险 (最近一次消费越久风险越高)
                    CASE 
                        WHEN DATEDIFF('day', last_order_date, CURRENT_DATE) > 60 THEN 'HIGH_RISK'
                        WHEN DATEDIFF('day', last_order_date, CURRENT_DATE) > 30 THEN 'MEDIUM_RISK'
                        ELSE 'LOW_RISK'
                    END as churn_risk
                FROM campaign_member_dim
                WHERE status = 'ACTIVE' AND blacklist_flag = false
            ),
            high_value_risk AS (
                SELECT *
                FROM user_stats
                WHERE value_percentile >= 0.8 
                  AND churn_risk IN ('HIGH_RISK', 'MEDIUM_RISK')
            )
            SELECT 
                COUNT(*) as user_count,
                AVG(total_order_amount) as avg_spend,
                churn_risk,
                tier_code,
                AVG(recency_days) as avg_recency
            FROM high_value_risk
            GROUP BY churn_risk, tier_code
            ORDER BY avg_spend DESC
            LIMIT 3
            """;
        return jdbcTemplate.query(sql, (rs, rowNum) ->
            OutlierSegment.builder()
                .segmentName(rs.getString("tier_code") + "_" + rs.getString("churn_risk"))
                .userCount(rs.getInt("user_count"))
                .avgSpend(rs.getDouble("avg_spend"))
                .avgRecency(rs.getInt("avg_recency"))
                .churnRisk(rs.getString("churn_risk"))
                .build()
        );
    }
}
```
### 4.6 通用策略模板服务（无蓝图模式最终降级）
```java
package com.loyalty.platform.campaign.strategy.exploration;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import java.util.*;
@Slf4j
@Service
@RequiredArgsConstructor
public class TemplateDecompositionService {
    /**
     * 基于通用模板生成策略建议
     * 
     * 这是"无蓝图"模式的最终降级方案
     * 3种底层营销逻辑：唤醒、转化、复购
     */
    public List<StrategySuggestion> generateSuggestions(Goal goal,
                                                         List<LeverResult> levers,
                                                         List<OutlierSegment> outliers,
                                                         double totalGap) {
        List<StrategySuggestion> suggestions = new ArrayList<>();
        // 1. 基于杠杆生成建议
        for (LeverResult lever : levers) {
            StrategySuggestion suggestion = buildSuggestionFromLever(lever, goal, totalGap);
            if (suggestion != null) {
                suggestions.add(suggestion);
            }
        }
        // 2. 基于离群值生成建议
        for (OutlierSegment outlier : outliers) {
            StrategySuggestion suggestion = buildSuggestionFromOutlier(outlier, goal, totalGap);
            if (suggestion != null) {
                suggestions.add(suggestion);
            }
        }
        // 3. 按预估贡献排序，取前3
        suggestions.sort((a, b) -> Double.compare(b.getExpectedContribution(), a.getExpectedContribution()));
        // 4. 为每个建议补充解释数据
        for (StrategySuggestion suggestion : suggestions) {
            enrichSuggestionWithExplanation(suggestion, goal);
        }
        return suggestions.stream().limit(3).collect(Collectors.toList());
    }
    private StrategySuggestion buildSuggestionFromLever(LeverResult lever, Goal goal, double totalGap) {
        // 从杠杆类型映射到通用策略模板
        Map<String, StrategyTemplate> templates = getTemplateMap();
        StrategyTemplate template = templates.get(lever.getCode());
        if (template == null) {
            // 尝试模糊匹配
            template = findMatchingTemplate(lever.getCode());
        }
        if (template == null) {
            return null;
        }
        return StrategySuggestion.builder()
                .id(UUID.randomUUID().toString())
                .leverCode(lever.getCode())
                .leverName(lever.getName())
                .decompositionMode("EXPLORATION")
                .initiativeType(template.getInitiativeType())
                .initiativeName(template.getDefaultName() + " - " + lever.getName())
                .expectedContribution(lever.getGap() * 0.7) // 保守估计70%
                .percentageOfGoal(lever.getContribution() * 0.7)
                .confidence(Math.min(lever.getConfidence() * 0.8, 0.7))
                .audienceRules(template.getDefaultAudienceRules())
                .rationale(buildRationaleForLever(lever, template))
                .aiMetadata(buildAIMetadata(lever))
                .build();
    }
    /**
     * 构建推荐理由（让用户信服）
     */
    private String buildRationaleForLever(LeverResult lever, StrategyTemplate template) {
        return String.format(
            "基于近6个月数据分析发现，「%s」与目标指标高度相关（相关性系数 R²=%.2f）。" +
            "预估该维度存在 %.0f%% 的增长空间。建议采用「%s」策略进行干预，保守预估可贡献目标增量的 %.0f%%（约 %.0f 元）。",
            lever.getName(),
            lever.getConfidence() * 0.8,
            lever.getGap() / lever.getCurrentValue() * 100,
            template.getInitiativeType(),
            lever.getContribution() * 0.7 * 100,
            lever.getGap() * 0.7
        );
    }
    private StrategySuggestion buildSuggestionFromOutlier(OutlierSegment outlier, Goal goal, double totalGap) {
        String initiativeType = "WINBACK";
        String initiativeName = "高价值用户唤醒 - " + outlier.getSegmentName();
        // 构建该离群值对应的人群规则
        JsonNode audienceRules = buildOutlierAudienceRules(outlier);
        return StrategySuggestion.builder()
                .id(UUID.randomUUID().toString())
                .leverCode("OUTLIER_WINBACK")
                .leverName("高价值用户唤醒")
                .decompositionMode("EXPLORATION")
                .initiativeType(initiativeType)
                .initiativeName(initiativeName)
                .expectedContribution(totalGap * 0.3) // 预估贡献30%
                .percentageOfGoal(0.3)
                .confidence(0.6)
                .audienceRules(audienceRules)
                .rationale(buildRationaleForOutlier(outlier))
                .aiMetadata(buildOutlierMetadata(outlier))
                .build();
    }
    private String buildRationaleForOutlier(OutlierSegment outlier) {
        return String.format(
            "系统在分析中发现：有 %d 名「%s」等级会员，平均消费金额达 ¥%.0f，但已连续 %.0f 天未消费。" +
            "这批用户价值极高（占整体消费的显著比例），但正处于流失边缘。" +
            "建议立即执行针对性的唤醒策略，避免高价值用户永久流失。",
            outlier.getUserCount(),
            outlier.getSegmentName().split("_")[0],
            outlier.getAvgSpend(),
            outlier.getAvgRecency()
        );
    }
    /**
     * 获取通用策略模板库
     */
    private Map<String, StrategyTemplate> getTemplateMap() {
        Map<String, StrategyTemplate> templates = new HashMap<>();
        templates.put("new_user_count", StrategyTemplate.builder()
                .initiativeType("ACQUISITION")
                .defaultName("新客转化")
                .defaultAudienceRules(JsonUtil.toJsonNode(Map.of(
                        "logic", "AND",
                        "rules", List.of(
                                Map.of("field", "register_days", "operator", "lte", "value", 30),
                                Map.of("field", "status", "operator", "eq", "value", "ACTIVE"),
                                Map.of("field", "total_order_count", "operator", "eq", "value", 0)
                        )
                )))
                .build());
        templates.put("repeat_order_rate", StrategyTemplate.builder()
                .initiativeType("RETENTION")
                .defaultName("老客复购")
                .defaultAudienceRules(JsonUtil.toJsonNode(Map.of(
                        "logic", "AND",
                        "rules", List.of(
                                Map.of("field", "total_order_count", "operator", "gte", "value", 1),
                                Map.of("field", "status", "operator", "eq", "value", "ACTIVE"),
                                Map.of("field", "recency_days", "operator", "between", "value", List.of(30, 90))
                        )
                )))
                .build());
        templates.put("avg_order_value", StrategyTemplate.builder()
                .initiativeType("UPSELL")
                .defaultName("客单价提升")
                .defaultAudienceRules(JsonUtil.toJsonNode(Map.of(
                        "logic", "AND",
                        "rules", List.of(
                                Map.of("field", "total_order_amount", "operator", "gte", "value", 5000),
                                Map.of("field", "status", "operator", "eq", "value", "ACTIVE")
                        )
                )))
                .build());
        return templates;
    }
}
```
## 五、前端界面设计
### 5.1 策略工作台主界面
```text
┌─ 策略工作台（618大促） ─────────────────────────────────────────────────────┐
│  [步骤指示器]  ● 定目标  →  ● 算缺口  →  ● 选策略  →  ○ 建举措  →  ○ 执行 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  【根据当前工作流状态动态展示对应步骤内容】                         │   │
│  │                                                                     │   │
│  │  当前状态: GOAL_DRAFT → 显示 Step 1                               │   │
│  │  当前状态: GAP_ANALYZED → 显示 Step 2                             │   │
│  │  当前状态: STRATEGY_SELECTED → 显示 Step 3                        │   │
│  │  ...                                                               │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [上一步]  [下一步]                                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.2 Step 1：定目标
```text
┌─ 第一步：定目标 ────────────────────────────────────────────────────────────┐
│  老板的指令是什么？                                                        │
│                                                                             │
│  目标名称: [ GMV增长               ]                                        │
│  目标类型: [ 营收 (REVENUE) ▼      ]                                        │
│  目标指标: [ 总订单金额            ]                                        │
│  目标值:   [    10,000,000     ]  元                                       │
│  时间范围: [ 2026-07-01 ] ~ [ 2026-09-30 ]                                 │
│  行业类型: [ 零售 (RETAIL) ▼      ]                                        │
│  平均客单价: [   350    ] 元                                               │
│                                                                             │
│  ┌─ 蓝图匹配结果 ─────────────────────────────────────────────────────────┐ │
│  │  ✅ 已自动匹配策略蓝图: 零售业GMV增长蓝图 v2.3                         │ │
│  │  将按公式拆解: GMV = 新客数 × 客单价 + 老客复购率 × 老客基数 × 客单价 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [下一步：算缺口 →]                                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.3 Step 2：算缺口
```text
┌─ 第二步：算缺口 ────────────────────────────────────────────────────────────┐
│  ✅ 系统已根据历史数据完成基线计算                                          │
│                                                                             │
│  ┌─ 缺口分析报告 ─────────────────────────────────────────────────────────┐ │
│  │  目标值:                    ¥10,000,000                                │ │
│  │  自然增长基线（如果不做营销）:  ¥8,000,000                            │ │
│  │  ──────────────────────────────────────────                             │ │
│  │  需要营销撬动的增量（缺口）:    ¥2,000,000  ← 核心目标               │ │
│  │                                                                         │ │
│  │  计算依据:                                                              │ │
│  │  · 去年同期自然增长率 4.2%                                             │ │
│  │  · 季节因子（Q3旺季）  +1.8%                                           │ │
│  │  · 新客流入预估         +0.5%                                          │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 杠杆拆解（基于蓝图公式） ─────────────────────────────────────────────┐ │
│  │  杠杆维度    │ 当前值   │ 目标提升 │ 贡献金额  │ 置信度 │ 占比      │ │
│  │  新客获取    │ 200人/天 │ +30%    │ ¥600,000 │ 高    │ ████████  │ │
│  │  老客复购    │ 15%     │ +5%     │ ¥900,000 │ 中    │ ██████    │ │
│  │  客单价提升  │ ¥350    │ +10%    │ ¥500,000 │ 中    │ ████      │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [← 上一步]  [下一步：选策略 →]                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.4 Step 3：选策略（人机协作核心）
```text
┌─ 第三步：选策略 ────────────────────────────────────────────────────────────┐
│  以下策略由 AI 根据缺口分析自动生成，您可以调整参数后确认                  │
│                                                                             │
│  ┌─ 策略 A：高价值沉睡唤醒（推荐） ──────────────────────────────────────┐ │
│  │  预计贡献: ¥1,200,000 (占目标 60%)  │  置信度: 92%                   │ │
│  │  ┌─ 人群规则（可调） ──────────────────────────────────────────────┐ │ │
│  │  │  未购天数: [45 ═══════════●═══════════ 90]                      │ │ │
│  │  │  会员等级: [⦿黄金] [⦿铂金] [○白银]                            │ │ │
│  │  │  消费金额: [● 5000 ═══════════●═══════════ 10000]              │ │ │
│  │  │  折扣力度: [● 8.5 ═══════════●═══════════ 9.5] 折              │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  │  📊 实时预估: 12,345人 → ¥1,200,000 → ROI 2.3x                     │ │
│  │  💡 为什么选这批人？                                                 │ │
│  │  黄金/铂金会员总消费占比达 65%，45-90天未购是高流失风险期。          │ │
│  │  历史数据表明该群体对折扣响应率最高（CVR 22%）。                     │ │
│  │  [📋 采纳此策略]                                                     │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 策略 B：新客首购转化 ──────────────────────────────────────────────────┐ │
│  │  预计贡献: ¥500,000  │  置信度: 78%                                   │ │
│  │  [查看详情]  [📋 采纳此策略]                                           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 策略 C：客单价提升 ────────────────────────────────────────────────────┐ │
│  │  预计贡献: ¥300,000  │  置信度: 65%                                   │ │
│  │  [查看详情]  [📋 采纳此策略]                                           │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [← 上一步]  [下一步：建举措 →]  (您已采纳 1/3 个策略)                    │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.5 Step 4：建举措
```text
┌─ 第四步：建举措 ────────────────────────────────────────────────────────────┐
│  您已确认以下策略，将自动生成举措                                           │
│                                                                             │
│  ┌─ 举措预览 ─────────────────────────────────────────────────────────────┐ │
│  │  举措名称: [高价值沉睡唤醒 - Q3 ]                                      │ │
│  │  举措类型: [WINBACK]  优先级: [1]                                     │ │
│  │  所属 Initiative 组: [新建分组] 或 [添加到已有组]                     │ │
│  │                                                                         │ │
│  │  ✅ 人群规则已配置（来自 AI 推荐）                                    │ │
│  │  ✅ 权益建议已配置（8.5折专属券，来自价格弹性模型）                   │ │
│  │  ✅ 归因分析已记录（为什么做这个、预期贡献多少）                       │ │
│  │                                                                         │ │
│  │  ┌─ 归因分析（可追溯） ─────────────────────────────────────────────┐ │ │
│  │  │  ├─ 拆解模式：蓝图拆解 (零售业GMV增长蓝图)                       │ │ │
│  │  │  ├─ 对应杠杆：老客复购率                                         │ │ │
│  │  │  ├─ 预期贡献：¥1,200,000（占目标的 60%）                         │ │ │
│  │  │  ├─ AI 依据：Uplift Score=0.72，价格弹性推荐 8.5折              │ │ │
│  │  │  └─ 数据支撑：12,345名黄金/铂金会员，45-90天未购                │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [← 上一步]  [✅ 确认创建举措]                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.6 Step 5：执行
```text
┌─ 第五步：执行 ──────────────────────────────────────────────────────────────┐
│  ✅ 举措 "高价值沉睡唤醒 - Q3" 已创建                                      │
│                                                                             │
│  系统已自动生成画布草稿：                                                    │
│  ┌─────────────────────────────────────────────────────────────────────────┐ │
│  │  [START] → [人群筛选] → [条件分支] → [发送邮件] → [END]              │ │
│  │             规则已填好    金额>5000     8.5折券已配置                  │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [← 上一步]  [🚀 立即执行]  [✏️ 编辑画布]                                  │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 六、前端复杂逻辑伪代码
### 6.1 策略工作流状态管理
```typescript
// hooks/useStrategyWorkflow.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
export const useStrategyWorkflow = (goalId: string) => {
  const queryClient = useQueryClient();
  // 获取当前工作流状态
  const { data: workflow, refetch } = useQuery({
    queryKey: ['strategy-workflow', goalId],
    queryFn: () => api.get(`/api/strategy/workflow/${goalId}`)
  });
  // Step 2: 算缺口
  const analyzeGap = useMutation({
    mutationFn: () => api.post(`/api/strategy/workflow/${goalId}/analyze`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['strategy-workflow', goalId] });
      queryClient.invalidateQueries({ queryKey: ['decomposition', goalId] });
    }
  });
  // Step 3: 模拟调整
  const simulateAdjustment = useMutation({
    mutationFn: ({ suggestionId, adjustments }: SimulationParams) =>
      api.post(`/api/strategy/workflow/${goalId}/simulate`, { suggestionId, adjustments })
  });
  // Step 4: 创建举措
  const createInitiatives = useMutation({
    mutationFn: (selectedIds: string[]) =>
      api.post(`/api/strategy/workflow/${goalId}/create-initiatives`, { suggestionIds: selectedIds }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['initiatives', goalId] });
      queryClient.invalidateQueries({ queryKey: ['strategy-workflow', goalId] });
    }
  });
  // Step 5: 生成画布
  const generateCanvas = useMutation({
    mutationFn: () => api.post(`/api/strategy/workflow/${goalId}/generate-canvas`),
    onSuccess: (data) => {
      // 跳转到画布编辑页
      window.location.href = `/canvas/${data.canvasId}`;
    }
  });
  return {
    workflow,
    refetch,
    analyzeGap: analyzeGap.mutateAsync,
    isAnalyzing: analyzeGap.isPending,
    simulateAdjustment: simulateAdjustment.mutateAsync,
    isSimulating: simulateAdjustment.isPending,
    createInitiatives: createInitiatives.mutateAsync,
    isCreating: createInitiatives.isPending,
    generateCanvas: generateCanvas.mutateAsync,
    isGenerating: generateCanvas.isPending
  };
};
```
### 6.2 策略卡片组件
```tsx
// components/strategy/StrategyCard.tsx
import React, { useState, useEffect } from 'react';
import { Slider, Select, Button, Spin, Alert } from 'antd';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
interface StrategyCardProps {
  suggestion: StrategySuggestion;
  goalId: string;
  onAdopt: (config: any) => void;
  isAdopted?: boolean;
}
export const StrategyCard: React.FC<StrategyCardProps> = ({
  suggestion,
  goalId,
  onAdopt,
  isAdopted = false
}) => {
  const [config, setConfig] = useState(suggestion.recommendedConfig);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  // ===== 滑块变化时触发模拟（防抖） =====
  useEffect(() => {
    const timer = setTimeout(() => {
      simulate(config);
    }, 500);
    return () => clearTimeout(timer);
  }, [config]);
  const simulate = async (newConfig: any) => {
    setLoading(true);
    try {
      const response = await api.post(`/api/strategy/workflow/${goalId}/simulate`, {
        suggestionId: suggestion.id,
        adjustments: {
          recency: newConfig.recency,
          tiers: newConfig.tiers,
          minSpend: newConfig.minSpend,
          discount: newConfig.discount
        }
      });
      setSimulation(response.data);
    } catch (error) {
      console.error('Simulation failed:', error);
    } finally {
      setLoading(false);
    }
  };
  // 是否采纳
  const handleAdopt = () => {
    onAdopt({
      ...config,
      estimatedContribution: simulation?.estimatedContribution || suggestion.expectedContribution,
      estimatedConversionRate: simulation?.estimatedConversionRate
    });
  };
  return (
    <div className={`strategy-card ${isAdopted ? 'adopted' : ''}`}>
      {/* 卡片头部 */}
      <div className="card-header" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="rank-badge">🥇</div>
        <div className="title">
          <h3>{suggestion.leverName}</h3>
          <span className="contribution">预计 ¥{(suggestion.expectedContribution / 10000).toFixed(0)}万</span>
          <span className="confidence">置信度 {(suggestion.confidence * 100).toFixed(0)}%</span>
          {isAdopted && <span className="badge-adopted">✅ 已采纳</span>}
        </div>
        <div className="expand-toggle">{isExpanded ? '收起 ▲' : '展开 ▼'}</div>
      </div>
      {/* 卡片体 */}
      {isExpanded && (
        <div className="card-body">
          {/* 1. 解释面板（为什么选这批人） */}
          <div className="explanation-panel">
            <h4>💡 为什么选这批人？</h4>
            <p className="rationale">{suggestion.rationale}</p>
            {/* 图表省略... */}
          </div>
          {/* 2. 控制面板（滑块） */}
          <div className="controls-panel">
            <div className="control-group">
              <label>未购天数：{config.recency[0]} ~ {config.recency[1]} 天</label>
              <RangeSlider min={0} max={180} value={config.recency} onChange={(val) => setConfig({ ...config, recency: val })} />
            </div>
            {/* 其他控件省略... */}
          </div>
          {/* 3. 结果预览 */}
          <div className="result-preview">
            {loading ? <Spin tip="计算中..." /> : (
              <>
                <div className="metric-grid">
                  <div className="metric">
                    <span className="label">预估人群</span>
                    <span className="value">{(simulation?.audienceSize || suggestion.audienceSize).toLocaleString()}</span>
                  </div>
                  <div className="metric">
                    <span className="label">预估贡献</span>
                    <span className="value">¥{((simulation?.estimatedContribution || suggestion.expectedContribution) / 10000).toFixed(1)}万</span>
                  </div>
                  <div className="metric">
                    <span className="label">ROI</span>
                    <span className="value">{simulation?.roi?.toFixed(1) || '2.3'}x</span>
                  </div>
                </div>
                <Button type={isAdopted ? 'default' : 'primary'} onClick={handleAdopt} disabled={isAdopted}>
                  {isAdopted ? '✅ 已采纳' : '📋 采纳此策略'}
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
```
### 6.3 步骤导航组件
```tsx
// components/strategy/StepIndicator.tsx
import React from 'react';
interface StepIndicatorProps {
  currentStep: number;
  steps: string[];
}
export const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep, steps }) => {
  return (
    <div className="step-indicator">
      {steps.map((label, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;
        const isPending = stepNum > currentStep;
        return (
          <div key={index} className={`step-item ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}>
            <div className="step-circle">
              {isCompleted ? '✓' : stepNum}
            </div>
            <div className="step-label">{label}</div>
            {index < steps.length - 1 && (
              <div className={`step-connector ${isCompleted ? 'completed' : ''}`}>
                <div className="connector-line" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
```
## 七、API 设计
### 7.1 创建目标（含行业类型）
```json
POST /api/campaign/planning/goal
{
    "workspaceId": "ws_001",
    "name": "GMV增长",
    "goalType": "REVENUE",
    "targetMetric": "TOTAL_AMOUNT",
    "targetValue": 10000000,
    "startTime": "2026-07-01T00:00:00Z",
    "endTime": "2026-09-30T23:59:59Z",
    "industryType": "RETAIL",
    "avgOrderValue": 350
}
```
### 7.2 执行拆解（算缺口）
```json
POST /api/campaign/strategy/workflow/{goalId}/analyze
{
    "code": 0,
    "data": {
        "decompositionId": "cgd_001",
        "decompositionMode": "BLUEPRINT",
        "blueprintId": "bp_retail_001",
        "baselineValue": 8000000,
        "totalGap": 2000000,
        "leverGaps": [
            {"code": "new_customer_revenue", "name": "新客贡献", "gap": 600000, "contribution": 0.3},
            {"code": "repeat_customer_revenue", "name": "老客复购贡献", "gap": 1200000, "contribution": 0.6}
        ],
        "initiativeSuggestions": [
            {
                "id": "sug_001",
                "leverCode": "repeat_customer_revenue",
                "leverName": "老客复购贡献",
                "decompositionMode": "BLUEPRINT",
                "initiativeType": "WINBACK",
                "initiativeName": "高价值沉睡唤醒",
                "expectedContribution": 1200000,
                "percentageOfGoal": 0.6,
                "confidence": 0.92,
                "audienceRules": {...},
                "rationale": "基于RFM分析...",
                "aiMetadata": {"uplift_score": 0.72, "recommended_discount": 0.85}
            }
        ]
    }
}
```
### 7.3 模拟调整参数
```json
POST /api/campaign/strategy/workflow/{goalId}/simulate
{
    "suggestionId": "sug_001",
    "adjustments": {
        "recency": [30, 60],
        "tiers": ["GOLD", "PLATINUM", "SILVER"],
        "minSpend": 3000,
        "discount": 0.80
    }
}
```
## 八、与现有模块的集成点
| 模块                 | 集成方式                                                                     | 变更   |
| ------------------ | ------------------------------------------------------------------------ | ---- |
| **Goal**           | 新增 `industry_type`、`blueprint_id`、`workflow_status`、`avg_order_value` 字段 | 表扩展  |
| **Initiative**     | 新增 `analysis_json` 字段记录完整归因                                              | 表扩展  |
| **Simulation**     | 调用 `predictBaseline()`                                                   | 无变更  |
| **Opportunity**    | 新增 `findByLever()`、`findByOutlier()`                                     | 新增方法 |
| **Canvas**         | 新增 `CanvasAutoGenerator` 自动生成                                            | 新增服务 |
| **Event/Feedback** | 新增 `StrategyLearningService` 记录反馈                                        | 新增服务 |
## 九、实施检查清单
* 执行 DDL：扩展 `campaign_goal` 表（4个新字段）
* 执行 DDL：扩展 `campaign_strategy_blueprint` 表（2个新字段）
* 执行 DDL：创建 `campaign_strategy_learning` 表
* 执行 DDL：扩展 `campaign_initiative` 表（`analysis_json`）
* 实现 `StrategyWorkflowService`（5步主线）
* 实现 `GoalDecompositionEngine`（有/无蓝图）
* 实现 `CorrelationDecompositionService`（无蓝图降级）
* 实现 `OutlierDecompositionService`（无蓝图降级）
* 实现 `TemplateDecompositionService`（通用模板）
* 实现 `StrategySimulationEngine`（实时模拟）
* 实现 `CanvasAutoGenerator`（自动生成画布）
* 实现 `StrategyLearningService`（自我进化）
* 前端：策略工作台主页面
* 前端：5步步骤导航组件
* 前端：策略卡片组件（含解释、滑块、预览）
* 前端：缺口分析报告组件
* 编写单元测试（覆盖率 > 80%）
## 十、总结
本设计完整覆盖了从“老板指令（Goal）”到“可执行举措（Initiative）”的完整链路：
| 步骤         | 用户操作             | 系统能力            | 产出                   |
| ---------- | ---------------- | --------------- | -------------------- |
| **Step 1** | 输入目标 + 行业类型      | 自动匹配蓝图          | Goal + blueprint\_id |
| **Step 2** | 点击“算缺口”          | 基线计算 + 杠杆拆解     | 缺口分析报告               |
| **Step 3** | 查看策略 → 调整参数 → 确认 | AI推荐 + 实时模拟     | 确认的策略建议              |
| **Step 4** | 点击“创建举措”         | 一键生成 Initiative | Initiative + 归因分析    |
| **Step 5** | 点击“执行”           | 自动生成画布          | 可执行 Canvas           |
**两种运行模式**：
* **有蓝图**：精准拆解，量化到每1%的贡献
* **无蓝图**：相关性分析 + 离群值发现 + 通用模板，**有数据支撑的建议**
**核心产品化价值**：
1. 有行业蓝图 → 精准量化拆解
2. 无行业蓝图 → 相关性分析 + 离群值发现，开箱即用
3. 执行反馈 → 沉淀为学习数据，自我进化
你说得非常对。我意识到一个重要的问题：完整的详细设计中，我确实定义了蓝图的数据结构和如何使用，但**确实遗漏了蓝图的生命周期管理——即“蓝图配置在哪里、谁配置、怎么配置”的功能设计**。
如果不补上这一块，蓝图只是数据库里的一堆数据，无法被实际使用。下面我来补充蓝图的完整**配置管理功能**设计。
***
## 蓝图配置与管理功能补充设计
### 核心定位
蓝图配置是**产品实施顾问、客户成功经理或高级管理员**使用的工具，**不是**普通运营人员日常使用的功能。因此它不需要出现在运营的“策略工作台”中，而是放在独立的**“系统管理/策略中心”**模块。
***
## 一、蓝图配置UI设计
### 1.1 蓝图列表管理页
```text
┌─ 策略蓝图管理（管理员） ───────────────────────────────────────────────────┐
│  [新建蓝图]  [从模板创建]  [导入]                                           │
│  Program: [全部 ▼]  行业: [全部 ▼]  状态: [全部 ▼]                        │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 蓝图列表 ─────────────────────────────────────────────────────────────┐ │
│  │  名称                    │ 行业    │ 版本 │ 状态  │ 默认 │ 操作      │ │
│  │  GMV增长蓝图 v2.3        │ 零售    │ 2    │ ✅   │ ✅   │ [编辑]    │ │
│  │  MRR增长蓝图 v1.0        │ SaaS    │ 1    │ ✅   │      │ [编辑]    │ │
│  │  AUM提升蓝图 v1.2        │ 金融    │ 1    │ ⚪   │      │ [编辑]    │ │
│  │  学员续费蓝图 v1.0       │ 教育    │ 1    │ ✅   │      │ [编辑]    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 预置行业模板（开箱即用） ─────────────────────────────────────────────┐ │
│  │  + 零售业模板   + SaaS模板   + 金融模板   + 教育模板   + 更多...    │ │
│  │  点击即可创建蓝图副本，一键启用                                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 1.2 蓝图编辑器（配置界面）
```text
┌─ 编辑蓝图：零售业GMV增长蓝图 ────────────────────────────────────────────┐
│  基本信息:                                                                 │
│  名称: [零售业GMV增长蓝图              ]  行业: [零售 ▼]                   │
│  描述: [适用于零售行业GMV增长目标的策略拆解模板]                           │
│  状态: [✅ 启用]  [设为默认]                                               │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 1. 目标公式（可视编辑器） ───────────────────────────────────────────┐ │
│  │  [GMV] = [新客贡献] + [老客复购贡献]                                 │ │
│  │                                                                         │ │
│  │  点击变量可展开编辑：                                                    │ │
│  │  ┌─ 新客贡献 ───────────────────────────────────────────────────────┐ │ │
│  │  │  公式: [新客数] × [客单价]                                        │ │ │
│  │  │  数据源: [campaign_member_dim ▼]  字段: [register_date]          │ │ │
│  │  │  聚合: [COUNT(DISTINCT member_id)]                               │ │ │
│  │  └────────────────────────────────────────────────────────────────────┘ │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 2. 杠杆定义 ─────────────────────────────────────────────────────────┐ │
│  │  [+ 添加杠杆]                                                         │ │
│  │  杠杆名称 │ 数据源           │ 聚合方式        │ 权重  │ 操作       │ │
│  │  新客数   │ campaign_member_ │ COUNT(DISTINCT  │ 0.4  │ [✏️][×]   │ │
│  │           │ dim              │ member_id)      │       │           │ │
│  │  客单价   │ campaign_order_  │ AVG(net_amount) │ 0.3  │ [✏️][×]   │ │
│  │           │ fact             │                 │       │           │ │
│  │  老客复购率│ campaign_order_  │ 自定义SQL       │ 0.3  │ [✏️][×]   │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 3. 举措映射规则 ─────────────────────────────────────────────────────┐ │
│  │  规则: 当 [老客复购率] 缺口 ≥ [5%] 时                                  │ │
│  │  推荐举措类型: [WINBACK, RETENTION ▼]                                  │ │
│  │  推荐权益类型: [DISCOUNT, BUNDLE ▼]                                    │ │
│  │  人群模板: [                                                         ]│ │
│  │    ┌──────────────────────────────────────────────────────────────────┐│ │
│  │    │ {"logic":"AND","rules":[{"field":"tier_code","operator":"in"... ││ │
│  │    └──────────────────────────────────────────────────────────────────┘│ │
│  │  [+ 添加规则]                                                         │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 4. 测试与验证 ───────────────────────────────────────────────────────┐ │
│  │  使用样本数据测试拆解:                                                 │ │
│  │  目标值: [10000000]  时间范围: [2026-07-01] ~ [2026-09-30]           │ │
│  │  [▶ 运行测试]                                                         │ │
│  │  测试结果: 总缺口 ¥2,000,000 → 新客贡献 ¥600,000 → 老客复购 ¥1,200,000│ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [保存] [保存并发布] [取消]                                                 │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 二、蓝图配置API设计
### 2.1 蓝图管理API
```java
// 蓝图CRUD
GET    /api/admin/blueprint/list                      // 获取蓝图列表
POST   /api/admin/blueprint/create                   // 新建蓝图
GET    /api/admin/blueprint/{id}                     // 获取蓝图详情
PUT    /api/admin/blueprint/{id}                     // 更新蓝图
DELETE /api/admin/blueprint/{id}                     // 删除蓝图
POST   /api/admin/blueprint/{id}/publish             // 发布蓝图
POST   /api/admin/blueprint/{id}/set-default         // 设为默认
// 从模板创建
POST   /api/admin/blueprint/from-template/{templateId}
// 测试蓝图
POST   /api/admin/blueprint/{id}/test                // 运行测试拆解
// 行业模板
GET    /api/admin/blueprint/templates                // 获取所有行业模板
```
### 2.2 蓝图配置JSON结构（确认）
```json
{
  "blueprintId": "bp_retail_001",
  "name": "零售业GMV增长蓝图",
  "industry": "RETAIL",
  "version": 2,
  "status": "ACTIVE",
  "isDefault": true,
  
  "targetFormula": {
    "type": "sum",
    "children": [
      {
        "name": "新客贡献",
        "type": "multiply",
        "children": [
          {"var": "new_customer_count", "label": "新客数"},
          {"var": "avg_order_value", "label": "客单价"}
        ]
      },
      {
        "name": "老客复购贡献",
        "type": "multiply",
        "children": [
          {"var": "repeat_rate", "label": "老客复购率"},
          {"var": "existing_customer_base", "label": "老客基数"},
          {"var": "avg_order_value", "label": "客单价"}
        ]
      }
    ]
  },
  
  "levers": [
    {
      "code": "new_customer_count",
      "name": "新客数",
      "dataSource": {
        "table": "campaign_member_dim",
        "field": "member_id",
        "aggregation": "COUNT(DISTINCT)",
        "timeFilter": "register_date BETWEEN {start} AND {end}",
        "extraFilters": {"status": "ACTIVE"}
      },
      "weight": 0.4
    }
  ],
  
  "initiativeMapping": [
    {
      "id": "rule_001",
      "leverCode": "repeat_rate",
      "gapThreshold": 0.05,
      "recommendedInitiativeTypes": ["WINBACK", "RETENTION"],
      "recommendedOfferTypes": ["DISCOUNT", "BUNDLE"],
      "audienceTemplate": {
        "logic": "AND",
        "rules": [
          {"field": "tier_code", "operator": "in", "value": ["GOLD", "PLATINUM"]},
          {"field": "recency_days", "operator": "between", "value": [30, 90]},
          {"field": "total_order_amount", "operator": "gte", "value": 5000}
        ],
        "limit": 15000
      },
      "reasonTemplate": "高价值用户存在流失风险，通过折扣券可有效唤醒复购",
      "offerSuggestion": {
        "usePriceElasticity": true,
        "defaultDiscount": 0.85,
        "minDiscount": 0.75,
        "maxDiscount": 0.95
      }
    }
  ]
}
```
***
## 三、蓝图配置在系统中的位置
### 3.1 菜单结构
```text
系统管理（管理员）
├── 策略蓝图管理
│   ├── 蓝图列表
│   ├── 新建蓝图
│   ├── 从模板创建
│   └── 行业模板库
├── 策略执行记录
│   ├── 拆解历史
│   └── 策略效果分析
└── 系统设置
    └── 策略偏好默认值
```
### 3.2 与用户流程的关系
```text
管理员在“策略蓝图管理”中创建/维护蓝图
                    │
                    ▼
用户在“策略工作台”中创建目标时
系统自动匹配蓝图（用户无感知）
                    │
                    ▼
用户走完5步流程，生成举措
                    │
                    ▼
执行完成后，反馈数据回流
用于系统自动调优（无需人工干预）
```
***
## 四、蓝图模板预置清单（开箱即用）
系统上线时预置以下蓝图模板，覆盖主流行业：
| 模板ID                 | 行业   | 名称           | 公式                                |
| -------------------- | ---- | ------------ | --------------------------------- |
| `tmpl_retail_001`    | 零售   | 零售业GMV增长蓝图   | GMV = 新客数×客单价 + 老客复购率×老客基数×客单价    |
| `tmpl_saas_001`      | SaaS | SaaS MRR增长蓝图 | MRR = 新签数×ACV + 增购数×ACV - 流失数×ACV |
| `tmpl_finance_001`   | 金融   | 金融AUM提升蓝图    | AUM = 新客数×户均资产 + 老客留存率×户均资产       |
| `tmpl_edu_001`       | 教育   | 教育续费增长蓝图     | 营收 = 新生数×客单价 + 续费率×老生数×客单价        |
| `tmpl_auto_001`      | 汽车   | 汽车售后营收蓝图     | 售后营收 = 活跃车主数×年均消费                 |
| `tmpl_ecommerce_001` | 电商   | 电商GMV增长蓝图    | GMV = 流量×转化率×客单价                  |
| `tmpl_general_001`   | 通用   | 通用增长蓝图（降级使用） | 目标 = 用户数×活跃度×转化率                  |
***
## 五、更新实施清单
新增以下任务：
* 实现蓝图管理后端服务（`BlueprintAdminService`）
* 实现蓝图CRUD API
* 实现从模板创建蓝图功能
* 实现蓝图测试功能
* 预置7个行业模板（SQL初始化）
* 前端：蓝图列表管理页面
* 前端：蓝图编辑器
* 前端：从模板创建蓝图
* 前端：蓝图测试功能
***
## 六、总结
蓝图配置管理是策略拆解引擎的**控制面板**。它让系统具备了“开箱即用”的能力——产品方预置行业模板，客户一键启用，无需从零配置。同时它也保留了高级定制能力——实施顾问可以在客户需要时深度调整，让蓝图真正成为“行业知识 + 客户经验”的数字化载体。
