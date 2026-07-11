## 第2章：Opportunity Intelligence（机会智能）详细设计
Opportunity Intelligence 是 Campaign Tools 的**“市场感知与机会识别引擎”**，它回答的不是“用户过去是什么样的”，而是“**今天，我的行业发生了什么变化，导致我的用户明天可能会怎样？**”
***
## 2.0 模块概述
### 2.0.1 本质定义
Opportunity Intelligence 是一个**双引擎混合驱动系统**，将内部 Loyalty 数据（RFM、Churn、Uplift）与外部市场信号（竞品、舆情、政策）相结合，动态输出可执行的营销机会列表。
### 2.0.2 核心设计原则（与 Loyalty 融合）
| 原则             | 说明                                                              |
| -------------- | --------------------------------------------------------------- |
| **Drools 不参与** | Campaign 机会评分**完全不使用 Drools**，Drools 仅用于 Loyalty 积分/等级业务规则      |
| **SQL 预过滤**    | 硬性门槛（会员状态、黑名单、等级范围）通过 SQL 完成，保证性能                               |
| **ML 为核心评分**   | 流失概率、增量价值通过 Python ML 服务（XGBoost/LightGBM）预测                    |
| **AI 外部加权**    | 竞品、舆情等非结构化信号通过 LLM Skill 采集，动态调整评分权重                            |
| **数据来源**       | 全部来自 Loyalty 同步宽表（`campaign_member_dim`, `campaign_order_fact`） |
### 2.0.3 系统架构图
text
```
                    ┌─────────────────────────────────────────────┐
                    │           Loyalty 数据同步层                │
                    │  campaign_member_dim / campaign_order_fact  │
                    └───────────────────┬─────────────────────────┘
                                        │
                    ┌───────────────────▼─────────────────────────┐
                    │           1. SQL 预过滤（硬性门槛）          │
                    │   - 会员状态=ACTIVE                         │
                    │   - 非黑名单                               │
                    │   - 目标等级/注册时间符合条件               │
                    └───────────────────┬─────────────────────────┘
                                        │
               ┌────────────────────────┼────────────────────────┐
               │                        │                        │
               ▼                        ▼                        ▼
   ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐
   │  2a. ML 预测评分     │  │  2b. RFM 基础分     │  │  2c. 外部信号采集    │
   │  - Churn概率        │  │  - Recency         │  │  (AI Skills)        │
   │  - Uplift增量       │  │  - Frequency       │  │  - 竞品价格监控      │
   │  - 转化概率         │  │  - Monetary        │  │  - 社交媒体舆情      │
   └──────────┬──────────┘  └──────────┬──────────┘  └──────────┬──────────┘
              │                        │                        │
              └────────────────────────┼────────────────────────┘
                                       ▼
                    ┌─────────────────────────────────────────────┐
                    │      3. 动态机会加权融合器                  │
                    │  finalScore = baseScore * externalWeight   │
                    └───────────────────┬─────────────────────────┘
                                        ▼
                    ┌─────────────────────────────────────────────┐
                    │      4. Opportunity Set 输出               │
                    │  按评分排序，截取 Top N                     │
                    └─────────────────────────────────────────────┘
```
***
## 2.1 数据模型设计
### 2.1.1 机会表（campaign\_opportunity）
存储每次机会发现任务产出的会员级机会记录。
sql
```
CREATE TABLE campaign_opportunity (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    goal_id VARCHAR(64),                         -- 关联的目标
    member_id VARCHAR(64) NOT NULL,              -- 具体会员
    segment_code VARCHAR(64),                    -- 分群标识
    opportunity_type VARCHAR(32) NOT NULL,       -- CHURN_RISK / UPSELL / WINBACK / CROSS_SELL / ENGAGEMENT
    score DECIMAL(10,4) NOT NULL,                -- 综合机会评分（0~1）
    -- ML 输出字段
    churn_probability DECIMAL(10,4),             -- 流失概率（ML 输出）
    uplift_score DECIMAL(10,4),                  -- 增量价值（ML 输出）
    conversion_probability DECIMAL(10,4),        -- 转化概率（ML 输出）
    rfm_score DECIMAL(10,4),                     -- RFM 基础分
    -- 外部影响
    external_influence DECIMAL(10,4) DEFAULT 1.0, -- 外部信号影响因子
    external_signal_ids TEXT[],                  -- 影响该机会的外部信号ID列表
    -- 推荐
    recommended_action VARCHAR(255),             -- WINBACK_DISCOUNT / BUNDLE_OFFER / UPGRADE_INCENTIVE
    recommended_channel VARCHAR(32),             -- EMAIL / SMS / PUSH
    confidence DECIMAL(10,4),                    -- 置信度
    -- 状态
    status VARCHAR(32) DEFAULT 'ACTIVE',         -- ACTIVE / CONSUMED / EXPIRED / SUPPRESSED
    source VARCHAR(32) NOT NULL,                 -- INTERNAL / EXTERNAL / ML / HYBRID
    -- 时间
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,                      -- 机会有效期
    consumed_at TIMESTAMPTZ,                     -- 被消费时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- 索引（优化查询性能）
CREATE INDEX idx_co_workspace ON campaign_opportunity(workspace_id);
CREATE INDEX idx_co_goal ON campaign_opportunity(goal_id);
CREATE INDEX idx_co_member ON campaign_opportunity(member_id);
CREATE INDEX idx_co_score ON campaign_opportunity(score DESC);
CREATE INDEX idx_co_status ON campaign_opportunity(status);
CREATE INDEX idx_co_type ON campaign_opportunity(opportunity_type);
CREATE INDEX idx_co_detected ON campaign_opportunity(detected_at DESC);
```
### 2.1.2 外部信号表（external\_signal）
存储 AI Skills 采集的外部市场信号。
sql
```
CREATE TABLE external_signal (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,           -- 关联 Loyalty Program
    signal_type VARCHAR(64) NOT NULL,            -- PRICE_CHANGE / SENTIMENT_SHIFT / POLICY_CHANGE / NEW_LAUNCH / VIRAL_EVENT
    severity VARCHAR(32) DEFAULT 'INFO',         -- INFO / WARNING / CRITICAL
    source_skill VARCHAR(64) NOT NULL,           -- 产生该信号的技能名称
    target_entity VARCHAR(255),                  -- 目标品牌/品类/地域
    title VARCHAR(255),                          -- 信号标题
    description TEXT,                            -- 信号详细描述
    raw_payload JSONB,                           -- 原始数据快照（审计用）
    -- 业务影响字段
    impact_factor DECIMAL(5,4) DEFAULT 1.0,      -- 影响系数（>1 增强机会，<1 削弱）
    affected_segments TEXT[],                    -- 影响的分群列表
    recommended_action TEXT,                     -- AI 建议的应对动作
    expires_at TIMESTAMPTZ,                      -- 信号有效期
    is_consumed BOOLEAN DEFAULT FALSE,           -- 是否已被消费
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_es_program ON external_signal(program_code);
CREATE INDEX idx_es_type ON external_signal(signal_type);
CREATE INDEX idx_es_severity ON external_signal(severity);
CREATE INDEX idx_es_expires ON external_signal(expires_at) WHERE expires_at > NOW();
CREATE INDEX idx_es_consumed ON external_signal(is_consumed);
```
### 2.1.3 会员特征宽表（已在第1章定义，补充索引）
sql
```
-- 已在第1章定义，此处补充查询索引
CREATE INDEX idx_cmd_segment_score ON campaign_member_dim(segment_code, total_order_amount DESC);
CREATE INDEX idx_cmd_churn_risk ON campaign_member_dim(churn_risk_score DESC) WHERE churn_risk_score > 0.5;
```
***
## 2.2 后端 Service 详细设计
### 2.2.1 核心服务：OpportunityService
```java
@Service
@Slf4j
@Transactional
public class OpportunityService {
    @Autowired
    private CampaignMemberDimRepository memberDimRepository;
    @Autowired
    private CampaignOrderFactRepository orderFactRepository;
    @Autowired
    private CampaignOpportunityRepository opportunityRepository;
    @Autowired
    private ExternalSignalRepository externalSignalRepository;
    @Autowired
    private MLScoringClient mlScoringClient;
    @Autowired
    private ExternalSignalService externalSignalService;
    @Autowired
    private GoalService goalService;
    private static final int MAX_OPPORTUNITIES_PER_RUN = 10000;
    private static final double EXTERNAL_WEIGHT_CAP = 2.0;
    /**
     * 发现机会（核心方法）
     * 
     * 执行流程：
     * 1. SQL 预过滤（硬性门槛）
     * 2. ML 预测评分（调用 Python 服务）
     * 3. 计算 RFM 基础分
     * 4. 获取外部信号并加权
     * 5. 组合生成 Opportunity
     * 6. 排序截取 Top N
     */
    public List<Opportunity> discoverOpportunities(DiscoverOpportunitiesRequest request) {
        String workspaceId = request.getWorkspaceId();
        String goalId = request.getGoalId();
        
        // 1. 获取 Goal 信息
        Goal goal = goalService.getGoal(goalId);
        if (!"ACTIVE".equals(goal.getStatus())) {
            throw new BusinessException("Goal must be ACTIVE to discover opportunities");
        }
        log.info("Starting opportunity discovery: workspace={}, goal={}", workspaceId, goalId);
        // 2. SQL 预过滤：硬性门槛
        List<CampaignMemberDim> eligibleMembers = memberDimRepository.findEligibleMembers(
                goal.getProgramCode(),
                goal.getTargetSegment(),
                List.of("ACTIVE"),                          // 会员状态
                goal.getTargetTiers(),                      // 目标等级
                goal.getStartTime(),
                goal.getEndTime()
        );
        if (eligibleMembers.isEmpty()) {
            log.warn("No eligible members found for goal: {}", goalId);
            return Collections.emptyList();
        }
        log.info("Found {} eligible members after SQL pre-filter", eligibleMembers.size());
        // 3. 获取外部信号（当前有效的）
        List<ExternalSignal> activeSignals = externalSignalRepository.findActiveByProgram(
                goal.getProgramCode()
        );
        log.info("Found {} active external signals", activeSignals.size());
        // 4. 批量调用 ML 服务预测
        List<MemberFeature> features = eligibleMembers.stream()
                .map(this::buildMemberFeature)
                .collect(Collectors.toList());
        
        List<MLScoreResult> mlResults = mlScoringClient.predictBatch(features);
        log.info("ML prediction completed for {} members", mlResults.size());
        // 5. 逐个生成 Opportunity
        List<Opportunity> opportunities = new ArrayList<>();
        for (int i = 0; i < eligibleMembers.size(); i++) {
            CampaignMemberDim member = eligibleMembers.get(i);
            MLScoreResult mlResult = mlResults.get(i);
            
            // 5a. 计算 RFM 基础分
            double rfmScore = calculateRFMScore(member);
            
            // 5b. 计算内部基础分（ML + RFM 融合）
            double baseScore = calculateInternalScore(mlResult, rfmScore);
            
            // 5c. 计算外部影响因子
            double externalWeight = calculateExternalWeight(activeSignals, member);
            List<String> affectingSignalIds = getAffectingSignalIds(activeSignals, member);
            
            // 5d. 最终评分
            double finalScore = Math.min(baseScore * externalWeight, 1.0);
            
            // 5e. 确定机会类型和推荐动作
            String opportunityType = determineOpportunityType(mlResult, member);
            String recommendedAction = determineRecommendedAction(opportunityType, mlResult);
            String recommendedChannel = determineRecommendedChannel(member);
            
            // 5f. 构建 Opportunity
            Opportunity opportunity = Opportunity.builder()
                    .id(UUID.randomUUID().toString())
                    .workspaceId(workspaceId)
                    .goalId(goalId)
                    .memberId(member.getMemberId())
                    .segmentCode(member.getSegmentCode())
                    .opportunityType(opportunityType)
                    .score(finalScore)
                    .churnProbability(mlResult.getChurnProbability())
                    .upliftScore(mlResult.getUpliftScore())
                    .conversionProbability(mlResult.getConversionProbability())
                    .rfmScore(rfmScore)
                    .externalInfluence(externalWeight)
                    .externalSignalIds(affectingSignalIds.toArray(new String[0]))
                    .recommendedAction(recommendedAction)
                    .recommendedChannel(recommendedChannel)
                    .confidence(mlResult.getConfidence())
                    .status("ACTIVE")
                    .source("HYBRID")
                    .detectedAt(Instant.now())
                    .expiresAt(calculateExpiry(opportunityType))
                    .build();
            
            opportunities.add(opportunity);
        }
        // 6. 按评分降序排序，截取 Top N
        opportunities.sort((a, b) -> Double.compare(b.getScore(), a.getScore()));
        List<Opportunity> topOpportunities = opportunities.stream()
                .limit(MAX_OPPORTUNITIES_PER_RUN)
                .collect(Collectors.toList());
        // 7. 批量保存
        opportunityRepository.saveAll(topOpportunities);
        log.info("Saved {} opportunities for goal: {}", topOpportunities.size(), goalId);
        // 8. 标记外部信号为已消费（可选）
        // 注意：信号可被多个机会引用，暂不标记消费，由定时清理逻辑处理
        return topOpportunities;
    }
    /**
     * SQL 预过滤（Repository 实现）
     */
    @Repository
    public interface CampaignMemberDimRepository extends JpaRepository<CampaignMemberDim, String> {
        
        @Query(value = """
            SELECT * FROM campaign_member_dim 
            WHERE program_code = :programCode
              AND status IN (:statuses)
              AND blacklist_flag = false
              AND (:segmentCode IS NULL OR segment_code = :segmentCode)
              AND (:tierCodes IS NULL OR tier_code IN (:tierCodes))
              AND register_date <= :endTime
              AND (last_order_days IS NULL OR last_order_days <= 90)
            ORDER BY total_order_amount DESC
            LIMIT 50000
            """, nativeQuery = true)
        List<CampaignMemberDim> findEligibleMembers(
                @Param("programCode") String programCode,
                @Param("segmentCode") String segmentCode,
                @Param("statuses") List<String> statuses,
                @Param("tierCodes") List<String> tierCodes,
                @Param("endTime") Instant endTime
        );
    }
    /**
     * 计算内部基础分（ML + RFM 融合）
     */
    private double calculateInternalScore(MLScoreResult mlResult, double rfmScore) {
        // 权重配置（可配置化）
        double churnWeight = 0.35;
        double upliftWeight = 0.35;
        double conversionWeight = 0.20;
        double rfmWeight = 0.10;
        
        double score = 0.0;
        score += mlResult.getChurnProbability() * churnWeight;
        score += mlResult.getUpliftScore() * upliftWeight;
        score += mlResult.getConversionProbability() * conversionWeight;
        score += rfmScore * rfmWeight;
        
        return Math.min(score, 1.0);
    }
    /**
     * 计算 RFM 基础分（归一化）
     */
    private double calculateRFMScore(CampaignMemberDim member) {
        // R: Recency（最近消费天数，越近越高）
        double rScore = Math.max(0, 1 - (member.getLastOrderDays() == null ? 90 : member.getLastOrderDays()) / 90.0);
        // F: Frequency（订单数量，取对数缩放）
        double fScore = Math.min(1, Math.log1p(member.getTotalOrderCount()) / Math.log1p(50));
        // M: Monetary（总金额，取对数缩放）
        double mScore = Math.min(1, Math.log1p(member.getTotalOrderAmount().doubleValue()) / Math.log1p(10000));
        
        // RFM 加权
        return 0.3 * rScore + 0.3 * fScore + 0.4 * mScore;
    }
    /**
     * 计算外部影响因子
     */
    private double calculateExternalWeight(List<ExternalSignal> signals, CampaignMemberDim member) {
        double weight = 1.0;
        String segmentCode = member.getSegmentCode();
        
        for (ExternalSignal signal : signals) {
            // 只影响匹配的分群
            if (signal.getAffectedSegments() != null && 
                !signal.getAffectedSegments().contains(segmentCode)) {
                continue;
            }
            
            String signalType = signal.getSignalType();
            double impact = signal.getImpactFactor();
            
            switch (signalType) {
                case "PRICE_CHANGE":
                    // 竞品降价 → 增强 Winback 和 Retention 机会
                    weight += impact * 0.5;
                    break;
                case "VIRAL_EVENT":
                    // 热点事件 → 增强 Engagement 机会
                    weight += impact * 0.3;
                    break;
                case "SENTIMENT_SHIFT":
                    // 舆情变化 → 小幅调整
                    weight += impact * 0.15;
                    break;
                case "POLICY_CHANGE":
                    // 政策变化 → 特定行业影响
                    weight += impact * 0.25;
                    break;
                default:
                    break;
            }
        }
        
        return Math.min(weight, EXTERNAL_WEIGHT_CAP);
    }
    /**
     * 获取影响该会员的外部信号 ID 列表
     */
    private List<String> getAffectingSignalIds(List<ExternalSignal> signals, CampaignMemberDim member) {
        return signals.stream()
                .filter(s -> s.getAffectedSegments() != null && 
                             s.getAffectedSegments().contains(member.getSegmentCode()))
                .map(ExternalSignal::getId)
                .collect(Collectors.toList());
    }
    /**
     * 确定机会类型
     */
    private String determineOpportunityType(MLScoreResult mlResult, CampaignMemberDim member) {
        double churnProb = mlResult.getChurnProbability();
        double uplift = mlResult.getUpliftScore();
        
        if (churnProb > 0.7) {
            return "CHURN_RISK";
        } else if (uplift > 0.6 && member.getTotalOrderAmount().doubleValue() > 5000) {
            return "UPSELL";
        } else if (churnProb > 0.4 && member.getTotalOrderAmount().doubleValue() > 3000) {
            return "WINBACK";
        } else if (mlResult.getConversionProbability() > 0.6) {
            return "CROSS_SELL";
        } else {
            return "ENGAGEMENT";
        }
    }
    /**
     * 确定推荐动作
     */
    private String determineRecommendedAction(String opportunityType, MLScoreResult mlResult) {
        switch (opportunityType) {
            case "CHURN_RISK":
                return "WINBACK_DISCOUNT";
            case "UPSELL":
                return "BUNDLE_OFFER";
            case "WINBACK":
                return "REACTIVATION_OFFER";
            case "CROSS_SELL":
                return "PRODUCT_RECOMMENDATION";
            case "ENGAGEMENT":
                return "CONTENT_ENGAGEMENT";
            default:
                return "STANDARD_PROMOTION";
        }
    }
    /**
     * 确定推荐渠道
     */
    private String determineRecommendedChannel(CampaignMemberDim member) {
        // 基于会员偏好或最近互动渠道
        // 简化实现：优先 Email，高价值用户增加 SMS
        if (member.getTotalOrderAmount().doubleValue() > 10000) {
            return "SMS";
        }
        return "EMAIL";
    }
    /**
     * 计算机会有效期
     */
    private Instant calculateExpiry(String opportunityType) {
        int days;
        switch (opportunityType) {
            case "CHURN_RISK":
            case "WINBACK":
                days = 7;   // 流失风险机会有效期短
                break;
            case "UPSELL":
            case "CROSS_SELL":
                days = 14;
                break;
            default:
                days = 30;
                break;
        }
        return Instant.now().plus(days, ChronoUnit.DAYS);
    }
    /**
     * 构建会员特征（供 ML 服务使用）
     */
    private MemberFeature buildMemberFeature(CampaignMemberDim member) {
        return MemberFeature.builder()
                .memberId(member.getMemberId())
                .recency(member.getLastOrderDays() == null ? 90 : member.getLastOrderDays())
                .frequency(member.getTotalOrderCount())
                .monetary(member.getTotalOrderAmount().doubleValue())
                .avgOrderValue(member.getAvgOrderAmount() == null ? 0 : member.getAvgOrderAmount().doubleValue())
                .tierLevel(member.getTierLevel() == null ? 0 : member.getTierLevel())
                .totalLoginDays(member.getTotalLoginDays() == null ? 0 : member.getTotalLoginDays())
                .continuousLoginDays(member.getContinuousLoginDays() == null ? 0 : member.getContinuousLoginDays())
                .daysSinceRegister((int) ChronoUnit.DAYS.between(
                        member.getRegisterDate(), LocalDate.now()))
                .build();
    }
}
```
### 2.2.2 ML 评分客户端（调用 Python 服务）
```java
@Component
@Slf4j
public class MLScoringClient {
    @Autowired
    private RestTemplate restTemplate;
    @Value("${ml.service.url:http://ml-service:5000}")
    private String mlServiceUrl;
    private static final int BATCH_SIZE = 1000;
    private static final Duration TIMEOUT = Duration.ofSeconds(60);
    /**
     * 批量预测（自动分片）
     */
    public List<MLScoreResult> predictBatch(List<MemberFeature> features) {
        if (features == null || features.isEmpty()) {
            return Collections.emptyList();
        }
        List<MLScoreResult> allResults = new ArrayList<>();
        
        // 分批处理
        for (int i = 0; i < features.size(); i += BATCH_SIZE) {
            int end = Math.min(i + BATCH_SIZE, features.size());
            List<MemberFeature> batch = features.subList(i, end);
            
            MLBatchRequest request = MLBatchRequest.builder()
                    .members(batch)
                    .modelType("ensemble_v2")  // 可配置
                    .build();
            
            try {
                MLBatchResponse response = restTemplate.postForObject(
                        mlServiceUrl + "/predict/batch",
                        request,
                        MLBatchResponse.class
                );
                
                if (response != null && response.getResults() != null) {
                    allResults.addAll(response.getResults());
                }
                
                log.info("ML batch prediction completed: {}/{}", end, features.size());
                
            } catch (Exception e) {
                log.error("ML prediction failed for batch {}-{}: {}", i, end, e.getMessage());
                // 降级：返回默认值
                for (MemberFeature feature : batch) {
                    allResults.add(MLScoreResult.fallback(feature.getMemberId()));
                }
            }
        }
        
        return allResults;
    }
    /**
     * 单个预测（实时场景）
     */
    public MLScoreResult predictSingle(MemberFeature feature) {
        MLBatchRequest request = MLBatchRequest.builder()
                .members(List.of(feature))
                .modelType("ensemble_v2")
                .build();
        
        try {
            MLBatchResponse response = restTemplate.postForObject(
                    mlServiceUrl + "/predict/batch",
                    request,
                    MLBatchResponse.class
            );
            return response.getResults().get(0);
        } catch (Exception e) {
            log.error("ML single prediction failed: {}", e.getMessage());
            return MLScoreResult.fallback(feature.getMemberId());
        }
    }
}
/**
 * ML 请求/响应 DTO
 */
@Data
@Builder
public static class MLBatchRequest {
    private List<MemberFeature> members;
    private String modelType;
}
@Data
public static class MLBatchResponse {
    private List<MLScoreResult> results;
    private String modelVersion;
    private long inferenceTimeMs;
}
@Data
@Builder
public static class MLScoreResult {
    private String memberId;
    private Double churnProbability;      // 0~1
    private Double upliftScore;           // 0~1
    private Double conversionProbability; // 0~1
    private Double confidence;            // 0~1
    
    public static MLScoreResult fallback(String memberId) {
        return MLScoreResult.builder()
                .memberId(memberId)
                .churnProbability(0.3)
                .upliftScore(0.3)
                .conversionProbability(0.3)
                .confidence(0.5)
                .build();
    }
}
/**
 * 会员特征 DTO
 */
@Data
@Builder
public static class MemberFeature {
    private String memberId;
    private Integer recency;          // 最近消费天数
    private Integer frequency;        // 订单数量
    private Double monetary;          // 总金额
    private Double avgOrderValue;     // 平均客单价
    private Integer tierLevel;        // 等级
    private Integer totalLoginDays;
    private Integer continuousLoginDays;
    private Integer daysSinceRegister;
}
```
### 2.2.3 Python ML 服务（参考实现）
python
```
# ml_service/app.py
from flask import Flask, request, jsonify
import joblib
import numpy as np
import pandas as pd
from datetime import datetime
app = Flask(__name__)
# 加载模型（启动时加载）
churn_model = joblib.load('models/churn_xgboost_v2.pkl')
uplift_model = joblib.load('models/uplift_xgboost_v2.pkl')
conversion_model = joblib.load('models/conversion_lgb_v2.pkl')
# 特征编码器
feature_encoder = joblib.load('models/feature_encoder.pkl')
@app.route('/predict/batch', methods=['POST'])
def predict_batch():
    data = request.json
    members = data.get('members', [])
    
    if not members:
        return jsonify({'results': [], 'modelVersion': 'v2', 'inferenceTimeMs': 0})
    
    start_time = datetime.now()
    
    # 构建 DataFrame
    df = pd.DataFrame(members)
    
    # 特征工程
    features = extract_features(df)
    
    # 批量预测
    churn_probs = churn_model.predict_proba(features)[:, 1]
    uplift_scores = uplift_model.predict(features)
    conversion_probs = conversion_model.predict_proba(features)[:, 1]
    
    # 构建结果
    results = []
    for i, member in enumerate(members):
        results.append({
            'memberId': member['memberId'],
            'churnProbability': float(churn_probs[i]),
            'upliftScore': float(uplift_scores[i]),
            'conversionProbability': float(conversion_probs[i]),
            'confidence': 0.85  # 模型置信度（可基于预测方差计算）
        })
    
    elapsed_ms = (datetime.now() - start_time).total_seconds() * 1000
    
    return jsonify({
        'results': results,
        'modelVersion': 'ensemble_v2',
        'inferenceTimeMs': elapsed_ms
    })
def extract_features(df):
    """特征工程：RFM + 行为特征 + 衍生特征"""
    features = pd.DataFrame()
    
    # RFM 特征
    features['recency_score'] = 1 / (1 + df['recency'])
    features['frequency_log'] = np.log1p(df['frequency'])
    features['monetary_log'] = np.log1p(df['monetary'])
    
    # 行为特征
    features['engagement_score'] = df['totalLoginDays'] / (df['daysSinceRegister'] + 1)
    features['continuous_login_ratio'] = df['continuousLoginDays'] / (df['totalLoginDays'] + 1)
    
    # 衍生特征
    features['avg_order_value_log'] = np.log1p(df['avgOrderValue'])
    features['tier_level_norm'] = df['tierLevel'] / 5.0
    features['recency_frequency_interaction'] = features['recency_score'] * features['frequency_log']
    
    return features
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
```
***
## 2.3 外部感知 AI Skills
### 2.3.1 外部信号服务
```java
@Service
@Slf4j
public class ExternalSignalService {
    @Autowired
    private ExternalSignalRepository signalRepository;
    @Autowired
    private SkillRegistry skillRegistry;
    @Autowired
    private EventPublisher eventPublisher;
    /**
     * 执行所有启用的外部技能（定时任务）
     */
    @Scheduled(cron = "0 0 */6 * * ?")  // 每6小时
    @Transactional
    public void executeAllSkills() {
        log.info("Starting scheduled external skill execution");
        
        List<ExternalSkill> skills = skillRegistry.getAllEnabled();
        for (ExternalSkill skill : skills) {
            try {
                executeSkill(skill);
            } catch (Exception e) {
                log.error("Skill execution failed: {}", skill.getSkillName(), e);
            }
        }
    }
    /**
     * 执行单个技能
     */
    public List<ExternalSignal> executeSkill(ExternalSkill skill) {
        log.info("Executing skill: {}", skill.getSkillName());
        
        SkillExecutionContext context = SkillExecutionContext.builder()
                .programCode("BRAND_A")  // 从配置获取
                .competitorUrls(skill.getCompetitorUrls())
                .keywords(skill.getKeywords())
                .build();
        
        List<ExternalSignal> signals = skill.execute(context);
        
        // 保存信号
        for (ExternalSignal signal : signals) {
            signal.setId(UUID.randomUUID().toString());
            signal.setSourceSkill(skill.getSkillName());
            signal.setCreatedAt(Instant.now());
            signal.setUpdatedAt(Instant.now());
            signalRepository.save(signal);
        }
        
        // 发布信号到达事件（触发机会重新计算）
        if (!signals.isEmpty()) {
            eventPublisher.publishExternalSignalArrived(signals);
            log.info("Skill {} produced {} signals", skill.getSkillName(), signals.size());
        }
        
        return signals;
    }
    /**
     * 获取当前有效的信号
     */
    public List<ExternalSignal> getActiveSignals(String programCode) {
        return signalRepository.findActiveByProgram(programCode);
    }
    /**
     * 清理过期信号
     */
    @Scheduled(cron = "0 0 2 * * ?")  // 每天凌晨2点
    @Transactional
    public void cleanExpiredSignals() {
        int deleted = signalRepository.deleteExpired(Instant.now());
        log.info("Cleaned {} expired external signals", deleted);
    }
}
```
### 2.3.2 Skill 接口与注册表
```java
/**
 * 外部技能接口
 */
public interface ExternalSkill {
    String getSkillName();
    List<String> getCompetitorUrls();
    List<String> getKeywords();
    List<ExternalSignal> execute(SkillExecutionContext context);
}
/**
 * 技能执行上下文
 */
@Data
@Builder
public class SkillExecutionContext {
    private String programCode;
    private List<String> competitorUrls;
    private List<String> keywords;
    private Map<String, Object> extraParams;
}
/**
 * 技能注册表
 */
@Component
public class SkillRegistry {
    
    private final Map<String, ExternalSkill> skills = new ConcurrentHashMap<>();
    
    @PostConstruct
    public void init() {
        // 注册内置技能（也可通过配置动态加载）
        skills.put("COMPETITOR_MONITOR", new CompetitorMonitorSkill());
        skills.put("SOCIAL_LISTENING", new SocialListeningSkill());
        skills.put("REGULATORY_WATCH", new RegulatoryWatchSkill());
        skills.put("INVENTORY_RISK", new InventoryRiskSkill());
        log.info("Registered {} external skills", skills.size());
    }
    
    public ExternalSkill getSkill(String name) {
        return skills.get(name);
    }
    
    public List<ExternalSkill> getAllEnabled() {
        // 从配置表读取启用的技能列表
        return List.of(
                skills.get("COMPETITOR_MONITOR"),
                skills.get("SOCIAL_LISTENING")
        );
    }
}
```
### 2.3.3 竞品监控技能（CompetitorMonitorSkill）
```java
@Component
@Slf4j
public class CompetitorMonitorSkill implements ExternalSkill {
    @Autowired
    private WebCrawlerService webCrawlerService;
    @Autowired
    private LLMClient llmClient;
    private static final List<String> DEFAULT_URLS = List.of(
            "https://www.competitor-a.com/products",
            "https://www.competitor-b.com/promotions"
    );
    @Override
    public String getSkillName() {
        return "COMPETITOR_MONITOR";
    }
    @Override
    public List<String> getCompetitorUrls() {
        // 可从配置表读取
        return DEFAULT_URLS;
    }
    @Override
    public List<String> getKeywords() {
        return List.of("price", "discount", "new", "launch", "promotion");
    }
    @Override
    public List<ExternalSignal> execute(SkillExecutionContext context) {
        List<ExternalSignal> signals = new ArrayList<>();
        
        List<String> urls = context.getCompetitorUrls() != null ? 
                context.getCompetitorUrls() : getCompetitorUrls();
        
        for (String url : urls) {
            try {
                // 1. 爬取网页内容
                String html = webCrawlerService.fetch(url);
                
                // 2. 调用 LLM 解析（使用 Tool Calling）
                String prompt = buildCompetitorPrompt(url, html);
                String llmResponse = llmClient.chatWithTools(prompt, getCompetitorTools());
                
                // 3. 解析 LLM 响应为信号
                List<ExternalSignal> parsed = parseCompetitorResponse(llmResponse, url);
                signals.addAll(parsed);
                
            } catch (Exception e) {
                log.error("Failed to monitor competitor URL: {}", url, e);
            }
        }
        
        return signals;
    }
    /**
     * 构建竞品分析 Prompt
     */
    private String buildCompetitorPrompt(String url, String html) {
        return """
                你是一个市场情报分析专家。请分析以下竞品网页内容，提取关键变化。
                
                提取字段：
                1. product_name: 商品名
                2. price: 当前价格（数字）
                3. original_price: 原价（数字，若无则为0）
                4. discount: 折扣力度（百分比，如20表示20%）
                5. is_new_launch: 是否为新品（true/false）
                6. promotion_summary: 一句话总结促销变化
                
                网页内容：
                %s
                
                输出格式: JSON Array。
                """.formatted(html.substring(0, Math.min(html.length(), 8000)));
    }
    /**
     * 定义 LLM Tool（函数调用）
     */
    private List<ToolDefinition> getCompetitorTools() {
        return List.of(
                ToolDefinition.builder()
                        .name("extract_product_info")
                        .description("提取商品价格和促销信息")
                        .parameters(Map.of(
                                "type", "object",
                                "properties", Map.of(
                                        "product_name", Map.of("type", "string"),
                                        "price", Map.of("type", "number"),
                                        "discount", Map.of("type", "number"),
                                        "is_new_launch", Map.of("type", "boolean")
                                )
                        ))
                        .build()
        );
    }
    /**
     * 解析 LLM 响应
     */
    private List<ExternalSignal> parseCompetitorResponse(String llmResponse, String sourceUrl) {
        List<ExternalSignal> signals = new ArrayList<>();
        
        try {
            JsonNode root = JsonUtil.parse(llmResponse);
            if (root.isArray()) {
                for (JsonNode item : root) {
                    String productName = item.path("product_name").asText("Unknown");
                    double price = item.path("price").asDouble(0);
                    double originalPrice = item.path("original_price").asDouble(0);
                    double discount = item.path("discount").asDouble(0);
                    boolean isNewLaunch = item.path("is_new_launch").asBoolean(false);
                    
                    // 判断是否需要生成信号
                    if (discount > 15 || isNewLaunch) {
                        ExternalSignal signal = ExternalSignal.builder()
                                .signalType(isNewLaunch ? "NEW_LAUNCH" : "PRICE_CHANGE")
                                .severity(discount > 30 ? "CRITICAL" : "WARNING")
                                .targetEntity(productName)
                                .title(isNewLaunch ? "新品发布: " + productName : "竞品降价: " + productName)
                                .description(String.format("竞品 %s 价格变化: 原价%.2f, 现价%.2f, 折扣%.1f%%",
                                        productName, originalPrice, price, discount))
                                .impactFactor(1.0 + discount / 100)
                                .affectedSegments(List.of("HIGH_VALUE", "PRICE_SENSITIVE"))
                                .recommendedAction(discount > 30 ? "PRICE_MATCH_WINBACK" : "VALUE_ADD_OFFER")
                                .expiresAt(Instant.now().plus(3, ChronoUnit.DAYS))
                                .rawPayload(JsonUtil.toJsonNode(item))
                                .build();
                        signals.add(signal);
                    }
                }
            }
        } catch (Exception e) {
            log.error("Failed to parse competitor LLM response: {}", e.getMessage());
        }
        
        return signals;
    }
}
```
### 2.3.4 舆情监控技能（SocialListeningSkill）
```java
@Component
@Slf4j
public class SocialListeningSkill implements ExternalSkill {
    @Autowired
    private SocialApiClient socialApiClient;  // 微博/推特 API
    @Autowired
    private LLMClient llmClient;
    @Override
    public String getSkillName() {
        return "SOCIAL_LISTENING";
    }
    @Override
    public List<String> getCompetitorUrls() {
        return Collections.emptyList();
    }
    @Override
    public List<String> getKeywords() {
        return List.of("品牌A", "产品X", "体验", "投诉", "推荐");
    }
    @Override
    public List<ExternalSignal> execute(SkillExecutionContext context) {
        List<ExternalSignal> signals = new ArrayList<>();
        
        List<String> keywords = context.getKeywords() != null ? 
                context.getKeywords() : getKeywords();
        
        try {
            // 1. 调用社交媒体 API 获取近期帖子
            List<SocialPost> posts = socialApiClient.search(keywords, 7, 100);
            
            if (posts.isEmpty()) {
                return signals;
            }
            
            // 2. 调用 LLM 进行情感分析
            String prompt = buildSentimentPrompt(posts);
            String llmResponse = llmClient.chat(prompt);
            
            // 3. 解析结果
            JsonNode result = JsonUtil.parse(llmResponse);
            String sentiment = result.path("overall_sentiment").asText("NEUTRAL");
            double sentimentScore = result.path("sentiment_score").asDouble(0);
            String hotTopic = result.path("hot_topic").asText("");
            
            // 4. 如果舆情异常，生成信号
            if ("NEGATIVE".equals(sentiment) && sentimentScore < -0.3) {
                ExternalSignal signal = ExternalSignal.builder()
                        .signalType("SENTIMENT_SHIFT")
                        .severity("WARNING")
                        .targetEntity(context.getProgramCode())
                        .title("品牌舆情预警: " + hotTopic)
                        .description(String.format("近期社交媒体情感倾向转负（得分%.2f），主要话题: %s", 
                                sentimentScore, hotTopic))
                        .impactFactor(1.0 - Math.abs(sentimentScore) * 0.3)  // 负面舆情降低机会
                        .affectedSegments(List.of("ALL"))
                        .recommendedAction("PAUSE_CAMPAIGN")
                        .expiresAt(Instant.now().plus(2, ChronoUnit.DAYS))
                        .rawPayload(JsonUtil.toJsonNode(result))
                        .build();
                signals.add(signal);
            }
            
            // 5. 检测热点事件（正向）
            if ("POSITIVE".equals(sentiment) && sentimentScore > 0.5) {
                ExternalSignal signal = ExternalSignal.builder()
                        .signalType("VIRAL_EVENT")
                        .severity("INFO")
                        .targetEntity(context.getProgramCode())
                        .title("热点话题: " + hotTopic)
                        .description("社交媒体出现正向热点，可借势营销")
                        .impactFactor(1.2)
                        .affectedSegments(List.of("ENGAGED", "ACTIVE"))
                        .recommendedAction("BOOST_ENGAGEMENT")
                        .expiresAt(Instant.now().plus(1, ChronoUnit.DAYS))
                        .rawPayload(JsonUtil.toJsonNode(result))
                        .build();
                signals.add(signal);
            }
            
        } catch (Exception e) {
            log.error("Social listening failed: {}", e.getMessage());
        }
        
        return signals;
    }
    private String buildSentimentPrompt(List<SocialPost> posts) {
        String postsText = posts.stream()
                .limit(50)
                .map(p -> p.getText())
                .collect(Collectors.joining("\n---\n"));
        
        return """
                分析以下社交媒体帖子的整体情感倾向。
                输出 JSON 格式：
                {
                  "overall_sentiment": "POSITIVE|NEUTRAL|NEGATIVE",
                  "sentiment_score": -1.0 ~ 1.0,
                  "hot_topic": "最热门的话题关键词",
                  "key_concerns": ["担忧点1", "担忧点2"]
                }
                
                帖子内容：
                %s
                """.formatted(postsText);
    }
}
```
***
## 2.4 前端界面设计
### 2.4.1 机会列表页
text
```
┌─ 机会发现 ──────────────────────────────────────────────────────────────────┐
│  [🔄 刷新机会] [⚙️ 配置]                                                  │
│  当前目标: GMV提升20% (ACTIVE)                                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  筛选: [全部类型 ▼] [评分 ≥ 0.7 ▼] [状态: ACTIVE ▼]  搜索会员...        │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 机会概览 ────────────────────────────────────────────────────────────┐ │
│  │  总机会: 8,432  │  高价值(>0.8): 1,234  │  待处理: 6,789           │ │
│  │  类型分布: CHURN 32% │ UPSELL 28% │ WINBACK 25% │ 其他 15%          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 机会列表 ─────────────────────────────────────────────────────────────┐ │
│  │ 评分 │ 会员ID   │ 类型       │ 推荐动作       │ 置信度 │ 有效期  │ 操作│ │
│  ├──────┼──────────┼────────────┼────────────────┼────────┼─────────┼─────┤ │
│  │ 0.94 │ M_12345  │ CHURN_RISK │ WINBACK_DISCOUNT│ 0.92  │ 3天    │[>] │ │
│  │ 0.89 │ M_23456  │ UPSELL     │ BUNDLE_OFFER   │ 0.88  │ 7天    │[>] │ │
│  │ 0.85 │ M_34567  │ WINBACK    │ REACTIVATION   │ 0.85  │ 5天    │[>] │ │
│  │ 0.78 │ M_45678  │ CROSS_SELL │ RECOMMENDATION │ 0.79  │ 14天   │[>] │ │
│  │ ...  │          │            │                │        │         │     │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [< 上一页]  1 / 85  [下一页 >]                                             │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 2.4.2 机会详情面板（点击 \[>] 展开）
text
```
┌─ 机会详情 ──────────────────────────────────────────────────────────────────┐
│  会员: M_12345                                                              │
│  机会类型: CHURN_RISK                                                       │
│  综合评分: 0.94  (高)                                                       │
│                                                                             │
│  ┌─ 评分明细 ─────────────────────────────────────────────────────────────┐ │
│  │  流失概率: 87%      ████████████████████████████████░░░░              │ │
│  │  增量价值: 72%      ██████████████████████████░░░░░░░░              │ │
│  │  转化概率: 65%      ██████████████████████░░░░░░░░░░              │ │
│  │  RFM 基础分: 81%    ████████████████████████████░░░░              │ │
│  │  外部影响: 1.15x    ▲ 竞品降价 +15%                                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 推荐动作 ─────────────────────────────────────────────────────────────┐ │
│  │  推荐: WINBACK_DISCOUNT (流失召回折扣)                                 │ │
│  │  渠道: SMS                                                             │ │
│  │  建议: 发送 8折 限时优惠券，有效期3天                                  │ │
│  │                                                                        │ │
│  │  [创建Campaign] [加入队列] [忽略]                                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 外部信号影响 ─────────────────────────────────────────────────────────┐ │
│  │  🏷️ 竞品降价: 竞品A 产品X 降价20% (3小时前)                           │ │
│  │  📊 影响: +15% 机会评分                                                │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│                              [关闭]                                         │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 2.4.3 外部信号仪表板
text
```
┌─ 外部信号监控 ─────────────────────────────────────────────────────────────┐
│  信号源: [竞品监控 ●] [舆情监控 ●] [政策监控 ○] [库存监控 ○]            │
│  最后更新: 2026-06-26 08:00:00  [立即刷新]                                 │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 信号列表 ─────────────────────────────────────────────────────────────┐ │
│  │ 严重程度 │ 类型        │ 摘要               │ 影响  │ 剩余时间 │ 操作 │ │
│  ├──────────┼─────────────┼────────────────────┼───────┼──────────┼──────┤ │
│  │ 🔴CRITICAL│ PRICE_CHANGE│ 竞品A降价25%      │ 1.25x │ 2天     │[>]  │ │
│  │ 🟡WARNING │ SENTIMENT   │ 负面舆情上升      │ 0.85x │ 1天     │[>]  │ │
│  │ 🟢INFO    │ VIRAL_EVENT │ #品牌A话题热      │ 1.10x │ 12小时  │[>]  │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 信号趋势 ─────────────────────────────────────────────────────────────┐ │
│  │  [折线图: 过去7天信号数量/严重程度分布]                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
***
## 2.5 前后端 JSON 交互
### 2.5.1 发现机会
**Request:**
```json
POST /api/campaign/opportunity/discover
{
    "workspaceId": "ws_001",
    "goalId": "goal_001",
    "maxResults": 10000,
    "includeDetails": true
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "goalId": "goal_001",
        "totalDiscovered": 8432,
        "returnedCount": 10000,
        "opportunities": [
            {
                "id": "opp_001",
                "memberId": "M_12345",
                "opportunityType": "CHURN_RISK",
                "score": 0.94,
                "churnProbability": 0.87,
                "upliftScore": 0.72,
                "conversionProbability": 0.65,
                "rfmScore": 0.81,
                "externalInfluence": 1.15,
                "externalSignalIds": ["sig_001", "sig_003"],
                "recommendedAction": "WINBACK_DISCOUNT",
                "recommendedChannel": "SMS",
                "confidence": 0.92,
                "status": "ACTIVE",
                "detectedAt": "2026-06-26T10:00:00Z",
                "expiresAt": "2026-06-29T10:00:00Z"
            }
            // ... more
        ],
        "summary": {
            "byType": {
                "CHURN_RISK": 2698,
                "UPSELL": 2361,
                "WINBACK": 2108,
                "CROSS_SELL": 1265
            },
            "avgScore": 0.62,
            "highValueCount": 1234
        }
    }
}
```
### 2.5.2 获取外部信号
**Request:**
```json
GET /api/campaign/external-signal?programCode=BRAND_A&severity=CRITICAL
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "signals": [
            {
                "id": "sig_001",
                "signalType": "PRICE_CHANGE",
                "severity": "CRITICAL",
                "sourceSkill": "COMPETITOR_MONITOR",
                "targetEntity": "竞品A 产品X",
                "title": "竞品A大幅降价25%",
                "description": "竞品A 产品X 从 ¥399 降至 ¥299，降幅25%",
                "impactFactor": 1.25,
                "affectedSegments": ["HIGH_VALUE", "PRICE_SENSITIVE"],
                "recommendedAction": "PRICE_MATCH_WINBACK",
                "expiresAt": "2026-06-28T10:00:00Z",
                "createdAt": "2026-06-26T08:00:00Z"
            }
        ],
        "total": 1
    }
}
```
### 2.5.3 手动触发技能执行
**Request:**
```json
POST /api/campaign/external-signal/execute
{
    "skillName": "COMPETITOR_MONITOR",
    "context": {
        "competitorUrls": ["https://competitor-x.com/promotions"]
    }
}
```
**Response:**
```json
{
    "code": 0,
    "data": {
        "skillName": "COMPETITOR_MONITOR",
        "signalsGenerated": 3,
        "signalIds": ["sig_005", "sig_006", "sig_007"],
        "executionTimeMs": 2450
    }
}
```
***
## 2.6 前端复杂逻辑伪代码
### 2.6.1 机会列表与实时刷新
```typescript
// hooks/useOpportunities.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
interface OpportunityFilters {
  types?: string[];
  minScore?: number;
  status?: string;
  memberId?: string;
}
export const useOpportunities = (workspaceId: string, goalId: string, filters: OpportunityFilters) => {
  const queryClient = useQueryClient();
  // 查询机会列表
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['opportunities', workspaceId, goalId, filters],
    queryFn: async () => {
      const params = new URLSearchParams({
        workspaceId,
        goalId,
        ...(filters.types && { types: filters.types.join(',') }),
        ...(filters.minScore && { minScore: String(filters.minScore) }),
        ...(filters.status && { status: filters.status }),
        ...(filters.memberId && { memberId: filters.memberId }),
        limit: '100',
        offset: '0'
      });
      const response = await api.get(`/campaign/opportunity?${params}`);
      return response.data;
    },
    refetchInterval: 60000, // 每分钟自动刷新
    staleTime: 30000
  });
  // 触发机会发现（长耗时操作）
  const discoverMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/campaign/opportunity/discover', {
        workspaceId,
        goalId,
        maxResults: 10000,
        includeDetails: true
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      queryClient.invalidateQueries({ queryKey: ['opportunity-summary'] });
    }
  });
  // 消费机会（转为 Campaign）
  const consumeMutation = useMutation({
    mutationFn: async (opportunityId: string) => {
      const response = await api.post(`/campaign/opportunity/${opportunityId}/consume`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['opportunities'] });
    }
  });
  return {
    opportunities: data?.data?.opportunities || [],
    summary: data?.data?.summary,
    isLoading,
    refetch,
    discover: discoverMutation.mutateAsync,
    isDiscovering: discoverMutation.isPending,
    consume: consumeMutation.mutateAsync
  };
};
```
### 2.6.2 机会评分可视化组件
```tsx
// components/OpportunityScoreGauge.tsx
import React from 'react';
interface ScoreGaugeProps {
  score: number;
  label: string;
  subLabels?: { label: string; value: number; color?: string }[];
}
export const OpportunityScoreGauge: React.FC<ScoreGaugeProps> = ({ score, label, subLabels }) => {
  const percentage = Math.min(score * 100, 100);
  const color = percentage >= 80 ? '#22c55e' : percentage >= 60 ? '#eab308' : '#ef4444';
  return (
    <div className="score-gauge">
      <div className="score-main">
        <div className="score-circle" style={{ 
          background: `conic-gradient(${color} ${percentage}%, #e5e7eb ${percentage}%)` 
        }}>
          <span className="score-value">{Math.round(percentage)}%</span>
        </div>
        <div className="score-label">{label}</div>
      </div>
      {subLabels && (
        <div className="score-details">
          {subLabels.map((item, idx) => (
            <div key={idx} className="score-item">
              <span className="score-item-label">{item.label}</span>
              <div className="score-item-bar">
                <div 
                  className="score-item-fill" 
                  style={{ 
                    width: `${Math.min(item.value * 100, 100)}%`,
                    backgroundColor: item.color || '#3b82f6'
                  }}
                />
              </div>
              <span className="score-item-value">{Math.round(item.value * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
```
***
## 2.7 异常处理与业务规则
### 2.7.1 业务异常枚举
```java
public enum OpportunityErrorCode {
    GOAL_NOT_ACTIVE("O001", "Goal must be ACTIVE to discover opportunities"),
    NO_ELIGIBLE_MEMBERS("O002", "No eligible members found for the given criteria"),
    ML_SERVICE_UNAVAILABLE("O003", "ML prediction service is temporarily unavailable"),
    OPPORTUNITY_NOT_FOUND("O004", "Opportunity not found"),
    OPPORTUNITY_ALREADY_CONSUMED("O005", "Opportunity has already been consumed"),
    OPPORTUNITY_EXPIRED("O006", "Opportunity has expired"),
    SKILL_EXECUTION_FAILED("O007", "External skill execution failed");
}
```
### 2.7.2 ML 服务降级策略
```java
@Component
public class MLServiceFallback {
    
    /**
     * 当 ML 服务不可用时，使用规则驱动的降级评分
     */
    public MLScoreResult fallbackScore(CampaignMemberDim member) {
        // 基于简单规则计算
        double churnProb = 0.3;
        if (member.getLastOrderDays() != null && member.getLastOrderDays() > 60) {
            churnProb += 0.3;
        }
        if (member.getTotalOrderCount() < 3) {
            churnProb += 0.2;
        }
        
        double uplift = 0.4;
        if (member.getTotalOrderAmount().doubleValue() > 5000) {
            uplift += 0.3;
        }
        
        return MLScoreResult.builder()
                .memberId(member.getMemberId())
                .churnProbability(Math.min(churnProb, 1.0))
                .upliftScore(Math.min(uplift, 1.0))
                .conversionProbability(0.4)
                .confidence(0.5)  // 低置信度
                .build();
    }
}
```
***
## 2.8 与 Loyalty 系统的集成点总结
| 集成点           | Loyalty 能力            | 使用方式                                   |
| ------------- | --------------------- | -------------------------------------- |
| 会员数据          | `member` 表            | 通过 `campaign_member_dim` 同步宽表读取        |
| 订单数据          | `account_transaction` | 通过 `campaign_order_fact` 同步读取          |
| 等级数据          | `tier_definition`     | 通过 `campaign_member_dim.tier_code` 关联  |
| **Drools 规则** | **不参与**               | Campaign 机会评分完全不使用 Drools              |
| EventBridge   | 事件发布                  | 外部信号到达时发布 `EXTERNAL_SIGNAL_ARRIVED` 事件 |
| 用户身份          | `member` 表            | `created_by`、`operator_id` 关联          |
***
## 2.9 开发实施检查清单
* 创建 `campaign_opportunity` 表
* 创建 `external_signal` 表
* 实现 `OpportunityService`（核心发现逻辑）
* 实现 `MLScoringClient`（调用 Python 服务）
* 实现 `ExternalSignalService`（信号管理）
* 实现 `CompetitorMonitorSkill`（竞品监控）
* 实现 `SocialListeningSkill`（舆情监控）
* 实现 Python ML 服务（Flask + XGBoost）
* 实现前端机会列表页
* 实现前端机会详情面板
* 实现前端外部信号仪表板
* 配置定时任务（每6小时执行技能）
* 编写单元测试（覆盖率 > 80%）
* 集成 ML 服务健康检查与降级
