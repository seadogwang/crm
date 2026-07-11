## 缺失项 2（P1）：A/B 测试与实验能力（A/B Testing & Experimentation）详细设计
> **优先级**：P1（重要）\
> **原因**：A/B 测试是营销优化的核心能力，直接影响 ROI 提升。无此功能，系统只能“盲目”执行策略，无法数据驱动优化。\
> **对应章节**：第4章（Simulation & Optimization）扩展 + 第5章（Execution）扩展 + 第8章（Canvas）扩展\
> **设计原则**：**最大化复用现有能力**，将 A/B 测试作为画布中的一个“节点类型”，复用现有 Workflow、Workers、Decision Engine。
## 一、设计目标
1. **画布原生支持**：在 Canvas 中新增 `EXPERIMENT` 节点，运营人员通过拖拽即可配置 A/B 测试。
2. **多变体支持**：支持 2 个及以上变体（A/B/C/D...），流量比例可配置。
3. **确定性分流（Deterministic Bucketing）**：同一用户始终进入同一变体，保证体验一致性。
4. **目标指标配置**：运营人员可配置实验的“成功指标”（如：打开率、点击率、转化率、收入）。
5. **统计显著性计算**：实验运行后，自动计算 P 值、置信区间，判断胜者。
6. **自动/手动推全**：实验结束后，支持一键将胜者推全（替换默认分支）。
7. **与现有 Simulation 协同**：实验前可以用 Simulation 预估样本量；实验后结果反馈给 Simulation 优化模型。
## 二、与现有功能的集成点
| 现有功能                  | 如何与 A/B 测试集成                                               |
| --------------------- | ---------------------------------------------------------- |
| **Canvas 节点**         | 新增 `EXPERIMENT` 节点类型，拖拽式配置                                 |
| **Zeebe Workers**     | 新增 `ExperimentRouter` Worker，负责用户分流                        |
| **BPMN Compiler**     | `EXPERIMENT` 节点编译为 `EXPERIMENT` Task + `EXCLUSIVE_GATEWAY` |
| **Simulation Engine** | 实验前：预估所需样本量；实验后：结果反馈校正模型                                   |
| **Decision Engine**   | 实验消耗预算纳入总预算分配；实验胜者自动影响后续预算倾斜                               |
| **Event System**      | 实验曝光、转化事件 → Kafka → 实时指标计算                                 |
| **Content/Asset**     | 不同变体可复用不同 `asset_id`，素材管理完全复用                              |
## 三、数据模型设计
### 3.1 实验配置表（campaign\_experiment）
```sql
-- ============================================================
-- A/B 测试实验配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_experiment (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,                     -- 所属 Campaign Plan
    workspace_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    -- ===== 实验基本信息 =====
    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'DRAFT',               -- DRAFT / RUNNING / PAUSED / COMPLETED / ARCHIVED
    -- ===== 流量配置 =====
    traffic_allocation_pct DECIMAL(5,2) DEFAULT 100, -- 参与实验的流量百分比（如 100% 表示所有进入该节点的用户都参与）
    total_sample_size INT,                            -- 总样本量（可选，为空则一直运行直到手动停止）
    -- ===== 目标指标 =====
    objective_metric VARCHAR(64) NOT NULL,            -- CLICK_RATE / CONVERSION_RATE / REVENUE_PER_USER / OPEN_RATE
    objective_direction VARCHAR(16) DEFAULT 'HIGHER', -- HIGHER / LOWER
    minimum_detectable_effect DECIMAL(5,2),          -- MDE：最小可检测效应（如 5% 表示相对提升 5%）
    statistical_significance DECIMAL(3,2) DEFAULT 0.95, -- 显著性水平（默认 95%）
    -- ===== 运行时统计（实时更新） =====
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    winning_variant_id VARCHAR(64),                   -- 胜出变体 ID
    -- ===== 元数据 =====
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ce_plan ON campaign_experiment(plan_id);
CREATE INDEX idx_ce_status ON campaign_experiment(status);
```
### 3.2 实验变体表（campaign\_experiment\_variant）
```sql
-- ============================================================
-- 实验变体配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_experiment_variant (
    id VARCHAR(64) PRIMARY KEY,
    experiment_id VARCHAR(64) NOT NULL,
    -- ===== 变体标识 =====
    variant_name VARCHAR(64) NOT NULL,                -- "Control" / "Variant A" / "Variant B"
    variant_code VARCHAR(16) NOT NULL,                -- "A", "B", "C"（用于分流判断）
    -- ===== 流量分配 =====
    traffic_percentage DECIMAL(5,2) NOT NULL,         -- 50.00 表示 50%
    -- ===== 节点配置（差异化部分） =====
    -- 注意：变体之间共享上游节点，但下游节点可以不同
    -- 例如：Control 使用 asset_id_1，Variant A 使用 asset_id_2
    node_overrides JSONB,                             -- {"SEND_EMAIL": {"asset_id": "asset_001"}}
    -- 或者直接指定变体对应的 Canvas 子图 ID（更灵活）
    subgraph_node_id VARCHAR(64),                      -- 变体专属的子图起始节点 ID
    -- ===== 运行时统计 =====
    exposure_count INT DEFAULT 0,                     -- 曝光人数
    event_count INT DEFAULT 0,                        -- 目标事件数（如点击、转化）
    metric_value DECIMAL(18,4),                       -- 计算后的指标值（如 CTR）
    is_winner BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cev_experiment ON campaign_experiment_variant(experiment_id);
```
### 3.3 用户分流记录表（campaign\_experiment\_assignment）
```sql
-- ============================================================
-- 用户分流记录（保证确定性 + 审计）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_experiment_assignment (
    id VARCHAR(64) PRIMARY KEY,
    experiment_id VARCHAR(64) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    variant_id VARCHAR(64) NOT NULL,                  -- 分配到哪个变体
    -- ===== 分流依据 =====
    bucket_key VARCHAR(255),                          -- member_id + experiment_id 的哈希值
    assignment_time TIMESTAMPTZ DEFAULT NOW(),
    -- ===== 曝光和转化（由事件系统更新） =====
    exposed BOOLEAN DEFAULT FALSE,
    exposed_at TIMESTAMPTZ,
    converted BOOLEAN DEFAULT FALSE,
    converted_at TIMESTAMPTZ,
    conversion_value DECIMAL(18,4),                   -- 转化价值（如订单金额）
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cea_experiment ON campaign_experiment_assignment(experiment_id);
CREATE INDEX idx_cea_member ON campaign_experiment_assignment(member_id);
CREATE INDEX idx_cea_variant ON campaign_experiment_assignment(variant_id);
CREATE UNIQUE INDEX idx_cea_unique ON campaign_experiment_assignment(experiment_id, member_id);
```
## 四、Canvas 扩展：新增 `EXPERIMENT` 节点
### 4.1 节点定义
**节点类型**：`EXPERIMENT`\
**分类**：逻辑 / 优化\
**图标**：🧪
### 4.2 节点配置 Schema
```typescript
// types/canvas.d.ts
interface ExperimentNodeConfig {
  // ---- 实验基本信息 ----
  experimentName: string;                    // "邮件主题行测试"
  objectiveMetric: 'CLICK_RATE' | 'CONVERSION_RATE' | 'REVENUE_PER_USER' | 'OPEN_RATE';
  objectiveDirection: 'HIGHER' | 'LOWER';
  // ---- 流量配置 ----
  trafficAllocationPct: number;              // 100（表示进入节点的所有用户都参与实验）
  totalSampleSize?: number;                  // 可选，不填则一直运行
  // ---- 变体配置 ----
  variants: ExperimentVariantConfig[];
  // ---- 统计参数 ----
  minimumDetectableEffect?: number;          // 5（表示相对提升 5%）
  statisticalSignificance?: number;          // 0.95
  // ---- 自动推全 ----
  autoPromoteWinner: boolean;                // 实验结束后是否自动推全胜者
  autoPromoteDelayMinutes?: number;          // 推全前等待时间（分钟）
}
```
### 4.3 画布上的视觉效果
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Canvas 编辑器                                       │
│                                                                             │
│  [人群筛选]                                                                 │
│       │                                                                     │
│       ▼                                                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  🧪 EXPERIMENT: 邮件主题行测试                                         │ │
│  │  目标指标: 点击率  |  显著性: 95%  |  流量: 100%                      │ │
│  │  ┌───────┐  ┌───────┐  ┌───────┐                                    │ │
│  │  │ 控制组 │  │ 变体A  │  │ 变体B  │                                    │ │
│  │  │  50%   │  │  25%   │  │  25%   │                                    │ │
│  │  └───┬───┘  └───┬───┘  └───┬───┘                                    │ │
│  │      │          │          │                                           │ │
│  │      ▼          ▼          ▼                                           │ │
│  │  [发送邮件]  [发送邮件]  [发送邮件]                                     │ │
│  │  主题: A     主题: B     主题: C                                      │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│       │                                                                     │
│       ▼                                                                     │
│  [结束节点]                                                                 │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 4.4 节点配置面板 UI
```text
┌─ 实验节点配置 ──────────────────────────────────────────────────────────────┐
│  实验名称: [ 邮件主题行测试                ]                                 │
│  目标指标: [点击率 (CLICK_RATE) ▼]  方向: [更高 ▼]                         │
│                                                                             │
│  ┌─ 流量配置 ─────────────────────────────────────────────────────────────┐ │
│  │  实验流量: [100] %  最大样本量: [      ] （留空表示持续运行）          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 变体配置 ─────────────────────────────────────────────────────────────┐ │
│  │  [+ 添加变体]                                                          │ │
│  │  变体名称 │ 流量分配 │ 节点配置                                 │ 操作 │ │
│  │  控制组   │ 50%     │ SEND_EMAIL: asset_id=asset_001          │ [×] │ │
│  │  变体A    │ 25%     │ SEND_EMAIL: asset_id=asset_002          │ [×] │ │
│  │  变体B    │ 25%     │ SEND_EMAIL: asset_id=asset_003          │ [×] │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 统计参数 ─────────────────────────────────────────────────────────────┐ │
│  │  最小可检测效应: [  5  ] %  显著性水平: [ 95 ] %                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 自动推全 ─────────────────────────────────────────────────────────────┐ │
│  │  [x] 实验结束后自动推全胜者  等待: [ 24 ] 小时                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [保存] [取消]                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```
## 五、编译器与执行引擎扩展
### 5.1 BPMN 编译策略
`EXPERIMENT` 节点编译为 **一个 Service Task + 一个 Exclusive Gateway**：
```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BPMN 编译结构                                        │
│                                                                             │
│  [上游节点]                                                                 │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  <bpmn:serviceTask id="Experiment_1" zeebe:taskType="experiment-router"/> │
│  │  输入: memberId, experimentId                                        │   │
│  │  输出: variant_id (A/B/C)                                            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  <bpmn:exclusiveGateway id="Gateway_1"/>                             │   │
│  │  条件: variant_id == "A" → 走控制组分支                             │   │
│  │  条件: variant_id == "B" → 走变体A分支                              │   │
│  │  条件: variant_id == "C" → 走变体B分支                              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│       │          │          │                                              │
│       ▼          ▼          ▼                                              │
│  [分支A]    [分支B]    [分支C]                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```
### 5.2 核心 Worker：ExperimentRouter
```java
package com.loyalty.platform.campaign.execution.worker;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
@Slf4j
@Component
@RequiredArgsConstructor
public class ExperimentRouterWorker extends BaseCampaignWorker {
    private final ExperimentRepository experimentRepository;
    private final ExperimentVariantRepository variantRepository;
    private final ExperimentAssignmentRepository assignmentRepository;
    @Override
    protected String getWorkerType() {
        return "experiment-router";
    }
    @JobWorker(type = "experiment-router", timeout = 30000)
    public void handle(JobClient client, ActivatedJob job) {
        handle(client, job);
    }
    @Override
    protected Map<String, Object> doExecute(Map<String, Object> variables) throws Exception {
        String memberId = getString(variables, "memberId");
        String experimentId = getString(variables, "experimentId");
        if (memberId == null || experimentId == null) {
            throw new NodeExecutionException("memberId and experimentId are required");
        }
        // 1. 检查是否已有分配记录（确定性：同一用户永远返回相同变体）
        ExperimentAssignment existing = assignmentRepository
                .findByExperimentIdAndMemberId(experimentId, memberId)
                .orElse(null);
        if (existing != null) {
            log.debug("Existing assignment found: memberId={}, variantId={}", 
                      memberId, existing.getVariantId());
            Map<String, Object> result = new HashMap<>();
            result.put("variantId", existing.getVariantId());
            result.put("variantCode", getVariantCode(existing.getVariantId()));
            return result;
        }
        // 2. 获取实验和变体配置
        Experiment experiment = experimentRepository.findById(experimentId)
                .orElseThrow(() -> new RuntimeException("Experiment not found"));
        if (!"RUNNING".equals(experiment.getStatus())) {
            throw new RuntimeException("Experiment not in RUNNING state");
        }
        List<ExperimentVariant> variants = variantRepository
                .findByExperimentIdOrderByVariantCodeAsc(experimentId);
        if (variants.isEmpty()) {
            throw new RuntimeException("No variants configured");
        }
        // 3. 确定性哈希分流（基于 memberId + experimentId）
        String bucketKey = memberId + ":" + experimentId;
        String assignedVariantCode = deterministicAssign(bucketKey, variants);
        // 4. 查找对应的 Variant ID
        String assignedVariantId = variants.stream()
                .filter(v -> v.getVariantCode().equals(assignedVariantCode))
                .findFirst()
                .map(ExperimentVariant::getId)
                .orElseThrow(() -> new RuntimeException("Variant not found"));
        // 5. 保存分配记录
        ExperimentAssignment assignment = ExperimentAssignment.builder()
                .id(UUID.randomUUID().toString())
                .experimentId(experimentId)
                .memberId(memberId)
                .variantId(assignedVariantId)
                .bucketKey(bucketKey)
                .assignmentTime(Instant.now())
                .build();
        assignmentRepository.save(assignment);
        // 6. 更新曝光计数
        variantRepository.incrementExposureCount(assignedVariantId);
        // 7. 发布曝光事件
        eventPublisher.publishExperimentExposure(experimentId, memberId, assignedVariantCode);
        Map<String, Object> result = new HashMap<>();
        result.put("variantId", assignedVariantId);
        result.put("variantCode", assignedVariantCode);
        log.info("User assigned: memberId={}, experiment={}, variant={}", 
                 memberId, experimentId, assignedVariantCode);
        return result;
    }
    /**
     * 确定性哈希分流算法
     * 
     * 使用 MD5 哈希 + 取模，保证同一 key 永远分到同一变体
     * 流量分配比例由 variants 中的 traffic_percentage 决定
     */
    private String deterministicAssign(String bucketKey, List<ExperimentVariant> variants) {
        // 1. 计算哈希值（0 ~ 10000 之间的整数）
        int hash = Math.abs(hashToInt(bucketKey) % 10000);
        // 2. 根据流量比例分配
        int cumulative = 0;
        for (ExperimentVariant variant : variants) {
            int threshold = (int) (variant.getTrafficPercentage().doubleValue() * 100);
            cumulative += threshold;
            if (hash < cumulative) {
                return variant.getVariantCode();
            }
        }
        // 3. 兜底：返回最后一个变体
        return variants.get(variants.size() - 1).getVariantCode();
    }
    private int hashToInt(String key) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(key.getBytes(StandardCharsets.UTF_8));
            // 取前 4 字节转为 int
            return ((digest[0] & 0xFF) << 24) |
                   ((digest[1] & 0xFF) << 16) |
                   ((digest[2] & 0xFF) << 8) |
                   (digest[3] & 0xFF);
        } catch (NoSuchAlgorithmException e) {
            // 降级：使用 String.hashCode()
            return key.hashCode();
        }
    }
    private String getVariantCode(String variantId) {
        return variantRepository.findById(variantId)
                .map(ExperimentVariant::getVariantCode)
                .orElse("UNKNOWN");
    }
}
```
### 5.3 实验事件监听器（指标计算）
```java
package com.loyalty.platform.campaign.event.listener;
import com.loyalty.platform.campaign.event.CampaignEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;
@Slf4j
@Component
@RequiredArgsConstructor
public class ExperimentEventListener {
    private final ExperimentAssignmentRepository assignmentRepository;
    private final ExperimentVariantRepository variantRepository;
    private final ExperimentRepository experimentRepository;
    /**
     * 监听转化事件（CLICK / CONVERSION / PURCHASE）
     * 更新实验指标
     */
    @KafkaListener(topics = "loyalty.event.user", groupId = "experiment-metrics")
    public void onUserEvent(CampaignEvent event) {
        String eventType = event.getEventType();
        String memberId = event.getUserId();
        String experimentId = extractExperimentId(event);
        if (experimentId == null) {
            return; // 该事件不属于任何实验
        }
        // 1. 查找用户的分流记录
        ExperimentAssignment assignment = assignmentRepository
                .findByExperimentIdAndMemberId(experimentId, memberId)
                .orElse(null);
        if (assignment == null) {
            return; // 用户未参与该实验
        }
        // 2. 检查事件类型是否匹配实验目标
        Experiment experiment = experimentRepository.findById(experimentId).orElse(null);
        if (experiment == null) return;
        boolean isTargetEvent = isTargetEvent(experiment.getObjectiveMetric(), eventType);
        if (!isTargetEvent) return;
        // 3. 更新转化
        assignment.setConverted(true);
        assignment.setConvertedAt(Instant.now());
        // 如果是收入类指标，提取金额
        if ("REVENUE_PER_USER".equals(experiment.getObjectiveMetric())) {
            Double revenue = extractRevenue(event);
            assignment.setConversionValue(revenue != null ? revenue : 0);
        }
        assignmentRepository.save(assignment);
        // 4. 更新变体统计
        variantRepository.incrementEventCount(assignment.getVariantId());
        log.info("Experiment event recorded: experiment={}, member={}, variant={}, eventType={}",
                 experimentId, memberId, assignment.getVariantId(), eventType);
    }
    private boolean isTargetEvent(String objectiveMetric, String eventType) {
        switch (objectiveMetric) {
            case "CLICK_RATE": return "CLICK".equals(eventType);
            case "CONVERSION_RATE": return "CONVERSION".equals(eventType) || "PURCHASE".equals(eventType);
            case "REVENUE_PER_USER": return "PURCHASE".equals(eventType);
            case "OPEN_RATE": return "OPEN".equals(eventType);
            default: return false;
        }
    }
}
```
## 六、统计引擎（实时计算显著性）
### 6.1 统计计算服务
```java
package com.loyalty.platform.campaign.experiment.statistics;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.commons.math3.stat.inference.TTest;
import org.springframework.stereotype.Component;
import java.util.List;
import java.util.stream.Collectors;
@Slf4j
@Component
@RequiredArgsConstructor
public class ExperimentStatisticsEngine {
    /**
     * 计算实验统计结果
     */
    public ExperimentStats calculate(Experiment experiment, List<ExperimentVariant> variants) {
        ExperimentStats stats = new ExperimentStats();
        for (ExperimentVariant variant : variants) {
            // 计算指标值
            double metricValue = calculateMetricValue(variant, experiment.getObjectiveMetric());
            variant.setMetricValue(metricValue);
        }
        // 两两比较，找出胜者
        ExperimentVariant control = variants.stream()
                .filter(v -> "A".equals(v.getVariantCode()))
                .findFirst()
                .orElse(variants.get(0));
        for (ExperimentVariant variant : variants) {
            if (variant.getId().equals(control.getId())) continue;
            TTestResult tTest = performTTest(control, variant);
            variant.setPValue(tTest.getPValue());
            variant.setRelativeImprovement(tTest.getRelativeImprovement());
            variant.setConfidenceInterval(tTest.getConfidenceInterval());
            if (tTest.isSignificant(experiment.getStatisticalSignificance())) {
                variant.setIsWinner(true);
                stats.addWinner(variant);
            }
        }
        // 确定最终胜者（如果有多个显著胜者，取提升最大的）
        stats.setOverallWinner(determineOverallWinner(variants));
        return stats;
    }
    private double calculateMetricValue(ExperimentVariant variant, String objectiveMetric) {
        int exposure = variant.getExposureCount();
        int events = variant.getEventCount();
        if (exposure == 0) return 0;
        switch (objectiveMetric) {
            case "CLICK_RATE":
            case "CONVERSION_RATE":
            case "OPEN_RATE":
                return (double) events / exposure;
            case "REVENUE_PER_USER":
                // 需要从 assignment 表中 SUM 转化价值
                return variant.getTotalRevenue() / exposure;
            default:
                return 0;
        }
    }
    private TTestResult performTTest(ExperimentVariant control, ExperimentVariant variant) {
        // 从数据库中获取两组的样本数据
        List<Double> controlSamples = getSampleValues(control.getId());
        List<Double> variantSamples = getSampleValues(variant.getId());
        TTest tTest = new TTest();
        double pValue = tTest.tTest(controlSamples.stream().mapToDouble(Double::doubleValue).toArray(),
                                    variantSamples.stream().mapToDouble(Double::doubleValue).toArray());
        // 计算相对提升
        double relativeImprovement = (variant.getMetricValue() - control.getMetricValue()) / control.getMetricValue();
        return TTestResult.builder()
                .pValue(pValue)
                .relativeImprovement(relativeImprovement)
                .build();
    }
}
```
### 6.2 实验状态自动转换（定时任务）
```java
@Component
@Slf4j
public class ExperimentScheduler {
    @Autowired
    private ExperimentRepository experimentRepository;
    @Autowired
    private ExperimentStatisticsEngine statsEngine;
    @Autowired
    private ExperimentVariantRepository variantRepository;
    /**
     * 每分钟检查一次实验状态
     */
    @Scheduled(fixedDelay = 60000)
    @Transactional
    public void checkExperiments() {
        List<Experiment> runningExperiments = experimentRepository.findByStatus("RUNNING");
        for (Experiment exp : runningExperiments) {
            // 1. 检查是否达到样本量
            long totalExposures = assignmentRepository.countByExperimentId(exp.getId());
            if (exp.getTotalSampleSize() != null && totalExposures >= exp.getTotalSampleSize()) {
                completeExperiment(exp);
                continue;
            }
            // 2. 检查是否运行时间过长（超过30天自动结束）
            if (exp.getStartedAt() != null && 
                Instant.now().isAfter(exp.getStartedAt().plus(30, ChronoUnit.DAYS))) {
                completeExperiment(exp);
                continue;
            }
            // 3. 如果样本量 >= 1000，可以尝试计算显著性（但不必结束）
            if (totalExposures >= 1000) {
                List<ExperimentVariant> variants = variantRepository.findByExperimentId(exp.getId());
                ExperimentStats stats = statsEngine.calculate(exp, variants);
                // 更新变体统计
                for (ExperimentVariant variant : variants) {
                    variant.setMetricValue(stats.getMetricValue(variant.getId()));
                    variant.setPValue(stats.getPValue(variant.getId()));
                    variant.setIsWinner(stats.isWinner(variant.getId()));
                    variantRepository.save(variant);
                }
            }
        }
    }
    private void completeExperiment(Experiment exp) {
        log.info("Experiment completed: id={}", exp.getId());
        // 1. 计算最终统计
        List<ExperimentVariant> variants = variantRepository.findByExperimentId(exp.getId());
        ExperimentStats stats = statsEngine.calculate(exp, variants);
        // 2. 标记胜者
        ExperimentVariant winner = stats.getOverallWinner();
        if (winner != null) {
            exp.setWinningVariantId(winner.getId());
            log.info("Experiment winner: variantId={}, improvement={}%", 
                     winner.getId(), stats.getOverallImprovement());
        }
        // 3. 更新状态
        exp.setStatus("COMPLETED");
        exp.setCompletedAt(Instant.now());
        experimentRepository.save(exp);
        // 4. 如果启用自动推全，触发推全流程
        if (exp.isAutoPromoteWinner() && winner != null) {
            scheduleAutoPromotion(exp);
        }
        // 5. 发布事件
        eventPublisher.publishExperimentCompleted(exp.getId(), winner != null ? winner.getId() : null);
    }
}
```
## 七、与 Simulation 和 Decision 的协同
### 7.1 实验前：样本量估算
在 Simulation 中，运营人员在配置实验时，系统可以自动估算所需样本量：
```text
┌─ 样本量估算 ──────────────────────────────────────────────────────────────┐
│  基线转化率: 12%                                                          │
│  期望提升: 5% (相对提升)                                                  │
│  显著性水平: 95%                                                          │
│  统计功效: 80%                                                            │
│                                                                           │
│  ✅ 建议样本量: 每组 1,234 人                                             │
│  当前可分配流量: 100,000 人/天                                            │
│  预计实验时长: 3 天                                                       │
└───────────────────────────────────────────────────────────────────────────┘
```
### 7.2 实验后：反馈到 Decision Engine
* **预算调整**：胜者 Campaign 自动获得更多预算分配。
* **策略更新**：胜者的配置（如素材 ID、Offer 参数）自动同步到 Simulation 的基线模型。
* **知识库**：每次实验的 Learnings 存储，供后续 AI Planner 参考。
## 八、前端实验仪表板
```text
┌─ 实验详情: 邮件主题行测试 ──────────────────────────────────────────────┐
│  状态: 🟢 RUNNING  |  已运行: 3天  |  总曝光: 12,345                   │
│  目标: 点击率 (CLICK_RATE)  |  显著性: 95%                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 实时结果 ─────────────────────────────────────────────────────────────┐ │
│  │  变体  │ 曝光  │ 点击  │ 点击率  │ 相对提升 │ 置信区间    │ 胜者标识 │ │
│  │  控制组 │ 6,170 │ 740   │ 12.0%  │ -       │ -         │          │ │
│  │  变体A  │ 3,087 │ 432   │ 14.0%  │ +16.7%  │ ±2.1%    │ 🏆 领先   │ │
│  │  变体B  │ 3,088 │ 370   │ 12.0%  │ 0.0%    │ ±2.3%    │          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 趋势图 ───────────────────────────────────────────────────────────────┐ │
│  │  点击率                                                               │ │
│  │  16% ┤                                          ── 变体A             │ │
│  │  14% ┤                                    ────                       │ │
│  │  12% ┤  ──────────────────────────────────  ── 控制组               │ │
│  │  10% ┤                                                               │ │
│  │      └──────┬──────┬──────┬──────┬──────┬──────                     │ │
│  │       Day1   Day2   Day3   Day4   Day5   Day6                       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 统计显著性 ───────────────────────────────────────────────────────────┐ │
│  │  变体A vs 控制组: P值 = 0.02 ✅ 显著                                 │ │
│  │  变体B vs 控制组: P值 = 0.45 ❌ 不显著                               │ │
│  │  推荐：变体A 胜出 (相对提升 16.7%，置信区间 ±2.1%)                   │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  [🔄 刷新]  [📊 导出报告]  [🚀 推全胜者]  [⏹️ 停止实验]                  │
└─────────────────────────────────────────────────────────────────────────────┘
```
## 九、实施检查清单
* 执行 DDL：`campaign_experiment` 表
* 执行 DDL：`campaign_experiment_variant` 表
* 执行 DDL：`campaign_experiment_assignment` 表
* 实现 `ExperimentRouterWorker`（分流 Worker）
* 实现 `ExperimentEventListener`（指标计算）
* 实现 `ExperimentStatisticsEngine`（显著性计算）
* 实现 `ExperimentScheduler`（自动状态转换）
* 前端：新增 `EXPERIMENT` 节点类型
* 前端：实现节点配置面板（变体管理、流量分配、目标指标）
* 前端：实现实验仪表板
* 编译器：`EXPERIMENT` 节点 → BPMN Service Task + Gateway
* 修改 `CanvasToBpmnCompiler`，支持 `EXPERIMENT` 节点编译
* 集成 Simulation：样本量估算
* 集成 Decision：实验胜者推全后预算调整
## 十、总结
本设计将 A/B 测试**无缝融入现有画布和执行体系**：
| 能力         | 实现方式                              |
| ---------- | --------------------------------- |
| **画布配置**   | 新增 `EXPERIMENT` 节点，拖拽式配置          |
| **分流执行**   | `ExperimentRouter` Worker，确定性哈希分流 |
| **指标计算**   | 复用 Event System，实时更新              |
| **统计显著性**  | 自动计算 P 值、置信区间                     |
| **推全胜者**   | 一键推全 或 自动推全                       |
| **现有节点复用** | 变体节点完全复用现有 `SEND_EMAIL` 等节点       |
| **框架零改动**  | 新节点类型，不修改现有节点逻辑                   |
**关键优势**：A/B 测试是画布中的一个“节点”，与现有所有功能（Workers、Event System、Content、Decision）自然集成，无需重构任何现有模块。实验结束后，胜者推全流程本质上是将实验节点替换为胜者分支对应的节点，对执行链路零侵入。
