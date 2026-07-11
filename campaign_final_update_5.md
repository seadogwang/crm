## 缺失项 3（P1）：预算节奏控制（Budget Pacing）详细设计
> **优先级**：P1（重要）\
> **原因**：营销预算的“匀速消耗”是成本控制的核心能力。无此功能，预算可能在活动首日即被耗尽，导致后续无预算可用，或效果好的 Campaign 无法获得更多预算倾斜。\
> **对应章节**：第3章（Decision Engine）扩展 + 第5章（Execution）扩展 + 第11章（Execution Runtime）扩展\
> **设计原则**：**运行时动态控制**，不修改预算分配算法，而是在执行层通过“预算检查点（Budget Checkpoint）”实现控制，对现有执行流程零侵入。
## 一、设计目标
1. **每日预算上限（Daily Cap）**：Campaign 每日消耗不超过设定值。
2. **匀速消耗（Even Pacing）**：预算在整个活动期间均匀消耗，避免前紧后松或前松后紧。
3. **动态调速（Dynamic Pacing）**：根据实时转化效果自动调整次日预算（效果好的多给，效果差的少给）。
4. **预算预警（Budget Alert）**：消耗达到阈值（80%/90%/100%）时触发告警。
5. **预算熔断（Budget Cutoff）**：消耗达到 100% 时自动暂停 Campaign 的剩余执行。
6. **与 Decision Engine 协同**：预算节奏控制的结果反馈给决策引擎，影响后续预算分配。
## 二、与现有功能的集成点
| 现有功能                      | 如何与 Budget Pacing 集成                              |
| ------------------------- | ------------------------------------------------- |
| **Decision Engine（预算分配）** | 分配的是**总预算**，Pacing 控制的是**每日消耗节奏**，两者互补            |
| **Execution Workers**     | 发送前检查“今日剩余预算”，若不足则跳过或延迟                           |
| **Zeebe**                 | 预算不足时，Worker 返回 `BUDGET_EXHAUSTED` 状态，触发流程暂停或延迟重试 |
| **Event System**          | 每次发送消耗预算 → 发布 `BUDGET_CONSUMED` 事件 → 实时更新消耗统计     |
| **Intervention System**   | 预算耗尽时自动触发“暂停”干预，或发送告警通知人工介入                       |
| **Simulation**            | 模拟运行时考虑 Pacing 约束，预测更准确的执行曲线                      |
## 三、数据模型设计
### 3.1 预算节奏配置表（campaign\_budget\_pacing）
```sql
-- ============================================================
-- Campaign 预算节奏配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_budget_pacing (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL UNIQUE,               -- 关联 Campaign Plan
    workspace_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    -- ===== 总预算 =====
    total_budget DECIMAL(18,4) NOT NULL,               -- 总预算金额
    total_budget_currency VARCHAR(8) DEFAULT 'CNY',
    -- ===== 节奏模式 =====
    pacing_mode VARCHAR(32) NOT NULL DEFAULT 'EVEN',   -- EVEN / ACCELERATED / FRONT_LOADED / DYNAMIC
    -- ===== 每日预算控制 =====
    daily_cap_enabled BOOLEAN DEFAULT TRUE,
    daily_cap_amount DECIMAL(18,4),                    -- 每日上限（留空则自动计算 = total_budget / 活动天数）
    daily_cap_type VARCHAR(32) DEFAULT 'HARD',         -- HARD（硬限制，超出则停止）/ SOFT（软限制，超出则告警但继续）
    -- ===== 动态调速（DYNAMIC 模式专用） =====
    dynamic_pacing_config JSONB,                       -- {"lookback_days": 3, "min_budget_factor": 0.5, "max_budget_factor": 2.0}
    -- 根据前 N 天的转化率调整次日预算：效果好 → 增加预算，效果差 → 减少预算
    -- ===== 预警配置 =====
    alert_thresholds JSONB DEFAULT '{"warn": 0.8, "critical": 0.95, "stop": 1.0}',
    -- ===== 运行时状态（由系统自动更新） =====
    total_consumed DECIMAL(18,4) DEFAULT 0,            -- 累计消耗
    today_consumed DECIMAL(18,4) DEFAULT 0,            -- 今日已消耗
    yesterday_consumed DECIMAL(18,4) DEFAULT 0,        -- 昨日消耗（用于动态调速）
    last_reset_date DATE,                              -- 最后一次每日重置日期
    is_paused_by_budget BOOLEAN DEFAULT FALSE,         -- 是否因预算耗尽暂停
    paused_at TIMESTAMPTZ,
    -- ===== 元数据 =====
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cbp_plan ON campaign_budget_pacing(plan_id);
CREATE INDEX idx_cbp_program ON campaign_budget_pacing(program_code);
CREATE INDEX idx_cbp_paused ON campaign_budget_pacing(is_paused_by_budget) WHERE is_paused_by_budget = TRUE;
```
### 3.2 预算消耗明细表（campaign\_budget\_consumption）
```sql
-- ============================================================
-- 预算消耗明细记录（每次发送/执行都记录）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_budget_consumption (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64),                               -- Canvas 节点 ID
    member_id VARCHAR(64),
    -- ===== 消耗信息 =====
    amount DECIMAL(18,4) NOT NULL,                     -- 本次消耗金额
    unit_cost DECIMAL(18,4),                           -- 单次成本（如：0.5元/条短信）
    quantity INT,                                      -- 数量（如：发送条数）
    -- ===== 消耗类型 =====
    consumption_type VARCHAR(32) NOT NULL,             -- SEND / POINTS / COUPON / WEBHOOK
    -- ===== 渠道 =====
    channel VARCHAR(32),
    -- ===== 预算状态快照 =====
    total_consumed_before DECIMAL(18,4),
    total_consumed_after DECIMAL(18,4),
    today_consumed_before DECIMAL(18,4),
    today_consumed_after DECIMAL(18,4),
    -- ===== 时间 =====
    consumed_at TIMESTAMPTZ DEFAULT NOW(),
    -- ===== 元数据 =====
    process_instance_key BIGINT,
    job_key BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cbc_plan ON campaign_budget_consumption(plan_id);
CREATE INDEX idx_cbc_plan_date ON campaign_budget_consumption(plan_id, date(consumed_at));
CREATE INDEX idx_cbc_consumed_at ON campaign_budget_consumption(consumed_at DESC);
```
### 3.3 预算告警记录表（campaign\_budget\_alert）
```sql
-- ============================================================
-- 预算告警记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_budget_alert (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    -- ===== 告警信息 =====
    alert_type VARCHAR(32) NOT NULL,                   -- WARN / CRITICAL / STOP / DAILY_CAP
    alert_message TEXT,
    threshold DECIMAL(5,2),                            -- 触发时的阈值（如 0.8）
    current_consumption DECIMAL(18,4),
    total_budget DECIMAL(18,4),
    -- ===== 状态 =====
    status VARCHAR(32) DEFAULT 'ACTIVE',               -- ACTIVE / RESOLVED / IGNORED
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(64),
    -- ===== 时间 =====
    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_cba_plan ON campaign_budget_alert(plan_id);
CREATE INDEX idx_cba_status ON campaign_budget_alert(status);
```
## 四、后端 Service 设计
### 4.1 预算节奏核心服务（BudgetPacingService）
```java
package com.loyalty.platform.campaign.budget.pacing;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
@Slf4j
@Service
@RequiredArgsConstructor
public class BudgetPacingService {
    private final BudgetPacingRepository pacingRepository;
    private final BudgetConsumptionRepository consumptionRepository;
    private final BudgetAlertRepository alertRepository;
    private final CampaignPlanRepository planRepository;
    private final InterventionService interventionService;
    private final CampaignEventPublisher eventPublisher;
    private final RedisTemplate<String, Object> redisTemplate;
    // ===== 核心检查方法（Worker 调用） =====
    /**
     * 检查是否还有预算可用于本次发送
     * 所有 Channel Worker 在执行前调用此方法
     */
    public BudgetCheckResult checkAndConsume(String planId, String nodeId, 
                                              String memberId, BigDecimal unitCost,
                                              int quantity, String channel) {
        String cacheKey = "budget:check:" + planId;
        
        // 1. 尝试从 Redis 获取预算状态（快速路径）
        BudgetSnapshot snapshot = (BudgetSnapshot) redisTemplate.opsForValue().get(cacheKey);
        if (snapshot == null) {
            // 从数据库加载
            BudgetPacing pacing = getPacing(planId);
            if (pacing == null) {
                // 没有配置预算节奏 → 默认允许
                return BudgetCheckResult.allow();
            }
            snapshot = buildSnapshot(pacing);
            redisTemplate.opsForValue().set(cacheKey, snapshot, Duration.ofMinutes(1));
        }
        // 2. 检查总预算是否耗尽
        if (snapshot.getTotalConsumed().compareTo(snapshot.getTotalBudget()) >= 0) {
            // 总预算已耗尽
            handleBudgetExhausted(planId);
            return BudgetCheckResult.block("TOTAL_BUDGET_EXHAUSTED", 
                "Total budget exhausted: " + snapshot.getTotalConsumed() + " / " + snapshot.getTotalBudget());
        }
        // 3. 检查今日预算是否耗尽
        BigDecimal todayRemaining = snapshot.getDailyCap().subtract(snapshot.getTodayConsumed());
        if (todayRemaining.compareTo(BigDecimal.ZERO) <= 0) {
            return BudgetCheckResult.block("DAILY_CAP_EXHAUSTED", 
                "Daily cap exhausted: " + snapshot.getTodayConsumed() + " / " + snapshot.getDailyCap());
        }
        // 4. 检查本次消耗是否超过单次允许上限
        BigDecimal totalCost = unitCost.multiply(BigDecimal.valueOf(quantity));
        if (totalCost.compareTo(todayRemaining) > 0) {
            // 本次消耗超过剩余预算，但可以部分执行（取决于配置）
            if (snapshot.isAllowPartial()) {
                // 只允许消耗到今日上限
                int adjustedQuantity = (int) (todayRemaining.divide(unitCost, 0, RoundingMode.FLOOR).doubleValue());
                if (adjustedQuantity <= 0) {
                    return BudgetCheckResult.block("INSUFFICIENT_BUDGET_FOR_UNIT", 
                        "Budget insufficient for even 1 unit");
                }
                return BudgetCheckResult.partial(adjustedQuantity);
            } else {
                return BudgetCheckResult.block("INSUFFICIENT_BUDGET", 
                    "Insufficient budget for this operation: need " + totalCost + ", remaining " + todayRemaining);
            }
        }
        // 5. 检查告警阈值
        checkAlertThresholds(planId, snapshot);
        // 6. 消耗预算（原子操作）
        return consumeBudget(planId, nodeId, memberId, totalCost, quantity, channel);
    }
    /**
     * 原子性地消耗预算（使用数据库乐观锁）
     */
    @Transactional
    public BudgetCheckResult consumeBudget(String planId, String nodeId, String memberId,
                                            BigDecimal amount, int quantity, String channel) {
        // 使用 SELECT FOR UPDATE 或 乐观锁
        BudgetPacing pacing = pacingRepository.findByPlanIdForUpdate(planId)
                .orElseThrow(() -> new RuntimeException("Budget pacing not found"));
        // 记录消耗前后状态
        BigDecimal totalBefore = pacing.getTotalConsumed();
        BigDecimal todayBefore = pacing.getTodayConsumed();
        // 执行消耗
        pacing.setTotalConsumed(totalBefore.add(amount));
        pacing.setTodayConsumed(todayBefore.add(amount));
        pacing.setUpdatedAt(Instant.now());
        pacingRepository.save(pacing);
        // 插入消耗明细
        BudgetConsumption consumption = BudgetConsumption.builder()
                .id(UUID.randomUUID().toString())
                .planId(planId)
                .nodeId(nodeId)
                .memberId(memberId)
                .amount(amount)
                .quantity(quantity)
                .unitCost(amount.divide(BigDecimal.valueOf(quantity), 4, RoundingMode.HALF_UP))
                .consumptionType("SEND")
                .channel(channel)
                .totalConsumedBefore(totalBefore)
                .totalConsumedAfter(pacing.getTotalConsumed())
                .todayConsumedBefore(todayBefore)
                .todayConsumedAfter(pacing.getTodayConsumed())
                .consumedAt(Instant.now())
                .build();
        consumptionRepository.save(consumption);
        // 更新 Redis 缓存
        updateCache(planId);
        // 发布预算消耗事件
        eventPublisher.publishBudgetConsumed(planId, amount, pacing.getTotalConsumed(), 
                                              pacing.getTotalBudget());
        // 检查是否耗尽
        if (pacing.getTotalConsumed().compareTo(pacing.getTotalBudget()) >= 0) {
            handleBudgetExhausted(planId);
        }
        // 检查今日是否耗尽
        if (pacing.getTodayConsumed().compareTo(pacing.getDailyCapAmount()) >= 0) {
            // 今日预算已耗尽，记录但不触发暂停（次日自动重置）
            log.info("Daily budget consumed: planId={}, consumed={}, cap={}", 
                     planId, pacing.getTodayConsumed(), pacing.getDailyCapAmount());
        }
        return BudgetCheckResult.allowWithDetails(
            pacing.getTotalConsumed(), 
            pacing.getTotalBudget(),
            pacing.getTodayConsumed(),
            pacing.getDailyCapAmount()
        );
    }
    // ===== 每日重置（定时任务） =====
    @Scheduled(cron = "0 0 0 * * ?")  // 每天午夜执行
    @Transactional
    public void resetDailyBudget() {
        log.info("Resetting daily budget for all campaigns");
        List<BudgetPacing> allPacing = pacingRepository.findAll();
        LocalDate today = LocalDate.now();
        for (BudgetPacing pacing : allPacing) {
            // 记录昨日消耗（用于动态调速）
            pacing.setYesterdayConsumed(pacing.getTodayConsumed());
            
            // 重置今日消耗
            pacing.setTodayConsumed(BigDecimal.ZERO);
            pacing.setLastResetDate(today);
            
            // 如果是动态调速模式，计算今日预算
            if ("DYNAMIC".equals(pacing.getPacingMode())) {
                BigDecimal dailyBudget = calculateDynamicDailyBudget(pacing);
                pacing.setDailyCapAmount(dailyBudget);
                log.info("Dynamic daily budget calculated: planId={}, dailyBudget={}", 
                         pacing.getPlanId(), dailyBudget);
            }
            pacing.setUpdatedAt(Instant.now());
            pacingRepository.save(pacing);
            // 如果之前因预算耗尽暂停，自动恢复
            if (pacing.isPausedByBudget()) {
                pacing.setPausedByBudget(false);
                pacing.setPausedAt(null);
                
                // 调用干预服务恢复
                interventionService.resumeCampaign(
                    pacing.getPlanId(), 
                    "SYSTEM", 
                    "Daily budget reset, auto-resume"
                );
                log.info("Auto-resumed campaign due to daily reset: planId={}", pacing.getPlanId());
            }
            // 清除缓存
            evictCache(pacing.getPlanId());
        }
    }
    // ===== 动态调速算法 =====
    /**
     * 基于前 N 天的转化率动态计算今日预算
     * 
     * 算法逻辑：
     * 1. 获取最近 N 天（默认 3 天）的每日转化率
     * 2. 计算平均转化率，与活动整体转化率对比
     * 3. 如果近期转化率 > 整体转化率，增加预算（最多 2 倍）
     * 4. 如果近期转化率 < 整体转化率，减少预算（最少 0.5 倍）
     * 5. 如果数据不足，使用默认值
     */
    private BigDecimal calculateDynamicDailyBudget(BudgetPacing pacing) {
        JsonNode config = pacing.getDynamicPacingConfig();
        int lookbackDays = config != null ? config.path("lookbackDays").asInt(3) : 3;
        double minFactor = config != null ? config.path("minBudgetFactor").asDouble(0.5) : 0.5;
        double maxFactor = config != null ? config.path("maxBudgetFactor").asDouble(2.0) : 2.0;
        // 默认每日预算 = 总预算 / 活动天数
        BigDecimal baseDailyBudget = pacing.getDailyCapAmount();
        // 获取最近 N 天的消耗和转化数据
        // 简化：直接从 campaign_execution_master 或 event 表聚合
        double recentCvr = getRecentConversionRate(pacing.getPlanId(), lookbackDays);
        double overallCvr = getOverallConversionRate(pacing.getPlanId());
        if (overallCvr <= 0) {
            return baseDailyBudget;
        }
        // 计算调整因子
        double ratio = recentCvr / overallCvr;
        double factor = Math.min(Math.max(ratio, minFactor), maxFactor);
        // 应用平滑（防止单日剧烈波动）
        double smoothFactor = 0.3 * factor + 0.7 * 1.0;
        BigDecimal adjustedBudget = baseDailyBudget.multiply(BigDecimal.valueOf(smoothFactor));
        log.debug("Dynamic budget calculation: planId={}, ratio={}, factor={}, adjusted={}", 
                  pacing.getPlanId(), ratio, smoothFactor, adjustedBudget);
        return adjustedBudget;
    }
    // ===== 预算告警 =====
    private void checkAlertThresholds(String planId, BudgetSnapshot snapshot) {
        double consumptionRatio = snapshot.getTotalConsumed()
                .divide(snapshot.getTotalBudget(), 4, RoundingMode.HALF_UP)
                .doubleValue();
        JsonNode thresholds = snapshot.getAlertThresholds();
        double warnThreshold = thresholds.path("warn").asDouble(0.8);
        double criticalThreshold = thresholds.path("critical").asDouble(0.95);
        double stopThreshold = thresholds.path("stop").asDouble(1.0);
        if (consumptionRatio >= stopThreshold) {
            // 100% 告警
            triggerAlert(planId, "STOP", "Budget fully consumed: 100%");
        } else if (consumptionRatio >= criticalThreshold) {
            // 95% 告警
            triggerAlert(planId, "CRITICAL", "Budget critical: " + (consumptionRatio * 100) + "%");
        } else if (consumptionRatio >= warnThreshold) {
            // 80% 告警
            triggerAlert(planId, "WARN", "Budget warning: " + (consumptionRatio * 100) + "%");
        }
    }
    @Transactional
    public void triggerAlert(String planId, String type, String message) {
        // 检查最近 1 小时内是否已有相同告警（去重）
        boolean exists = alertRepository.existsByPlanIdAndAlertTypeAndTriggeredAtAfter(
                planId, type, Instant.now().minus(1, ChronoUnit.HOURS));
        if (exists) {
            return;
        }
        BudgetPacing pacing = getPacing(planId);
        BudgetAlert alert = BudgetAlert.builder()
                .id(UUID.randomUUID().toString())
                .planId(planId)
                .alertType(type)
                .alertMessage(message)
                .currentConsumption(pacing.getTotalConsumed())
                .totalBudget(pacing.getTotalBudget())
                .status("ACTIVE")
                .triggeredAt(Instant.now())
                .build();
        alertRepository.save(alert);
        // 发布告警事件
        eventPublisher.publishBudgetAlert(planId, type, message);
        // 如果是 CRITICAL 或 STOP，发送通知（邮件/短信/钉钉）
        if ("CRITICAL".equals(type) || "STOP".equals(type)) {
            sendBudgetAlertNotification(planId, type, message);
        }
    }
    // ===== 预算耗尽处理 =====
    private void handleBudgetExhausted(String planId) {
        BudgetPacing pacing = getPacing(planId);
        if (pacing == null || pacing.isPausedByBudget()) {
            return; // 已经暂停过了
        }
        log.warn("Budget exhausted for plan: {}", planId);
        // 更新状态
        pacing.setPausedByBudget(true);
        pacing.setPausedAt(Instant.now());
        pacingRepository.save(pacing);
        // 调用干预服务暂停 Campaign
        try {
            interventionService.pauseCampaign(
                planId,
                "SYSTEM",
                "Budget exhausted: " + pacing.getTotalConsumed() + " / " + pacing.getTotalBudget()
            );
            log.info("Campaign paused due to budget exhaustion: planId={}", planId);
        } catch (Exception e) {
            log.error("Failed to pause campaign: {}", e.getMessage());
        }
        // 清除缓存
        evictCache(planId);
    }
    // ===== 前端查询接口 =====
    public BudgetPacing getPacing(String planId) {
        return pacingRepository.findByPlanId(planId).orElse(null);
    }
    public BudgetConsumptionSummary getConsumptionSummary(String planId, LocalDate date) {
        BigDecimal total = consumptionRepository.sumAmountByPlanIdAndDate(planId, date);
        long count = consumptionRepository.countByPlanIdAndDate(planId, date);
        return BudgetConsumptionSummary.builder()
                .planId(planId)
                .date(date)
                .totalConsumed(total != null ? total : BigDecimal.ZERO)
                .totalCount(count)
                .build();
    }
    public List<BudgetAlert> getAlerts(String planId, String status) {
        if (status != null) {
            return alertRepository.findByPlanIdAndStatus(planId, status);
        }
        return alertRepository.findByPlanIdOrderByTriggeredAtDesc(planId);
    }
    // ===== 工具方法 =====
    private void updateCache(String planId) {
        BudgetPacing pacing = getPacing(planId);
        if (pacing != null) {
            BudgetSnapshot snapshot = buildSnapshot(pacing);
            redisTemplate.opsForValue().set("budget:check:" + planId, snapshot, Duration.ofMinutes(1));
        }
    }
    private void evictCache(String planId) {
        redisTemplate.delete("budget:check:" + planId);
    }
    private BudgetSnapshot buildSnapshot(BudgetPacing pacing) {
        return BudgetSnapshot.builder()
                .planId(pacing.getPlanId())
                .totalBudget(pacing.getTotalBudget())
                .totalConsumed(pacing.getTotalConsumed())
                .todayConsumed(pacing.getTodayConsumed())
                .dailyCap(pacing.getDailyCapAmount())
                .alertThresholds(pacing.getAlertThresholds())
                .isPausedByBudget(pacing.isPausedByBudget())
                .build();
    }
}
```
### 4.2 Worker 集成（BudgetGuardAspect）
```java
package com.loyalty.platform.campaign.execution.worker.guard;
import com.loyalty.platform.campaign.budget.pacing.BudgetCheckResult;
import com.loyalty.platform.campaign.budget.pacing.BudgetPacingService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.util.Map;
/**
 * 统一拦截器：所有发送类 Worker 自动执行预算检查
 */
@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class BudgetGuardAspect {
    private final BudgetPacingService budgetPacingService;
    private static final BigDecimal DEFAULT_UNIT_COST = BigDecimal.valueOf(0.50); // 默认 0.5 元/条
    @Around("execution(* com.loyalty.platform.campaign.execution.worker.*Worker.doExecute(..)) && " +
            "!execution(* com.loyalty.platform.campaign.execution.worker.AudienceFilterWorker.doExecute(..)) && " +
            "!execution(* com.loyalty.platform.campaign.execution.worker.AIScoreWorker.doExecute(..))")
    public Object checkBudget(ProceedingJoinPoint joinPoint) throws Throwable {
        Map<String, Object> variables = (Map<String, Object>) joinPoint.getArgs()[0];
        String planId = getPlanId(variables);
        String nodeId = getNodeId(variables);
        String channel = getChannel(variables);
        List<String> memberIds = getMemberIds(variables);
        if (planId == null || memberIds == null || memberIds.isEmpty()) {
            return joinPoint.proceed();
        }
        // 计算本次发送的成本
        BigDecimal unitCost = getUnitCost(variables, channel);
        int quantity = memberIds.size();
        // 检查预算
        BudgetCheckResult result = budgetPacingService.checkAndConsume(
            planId, nodeId, null, unitCost, quantity, channel
        );
        if (result.isBlocked()) {
            log.warn("Budget check blocked: planId={}, reason={}, code={}", 
                     planId, result.getBlockReason(), result.getBlockCode());
            Map<String, Object> resultMap = new HashMap<>();
            resultMap.put("status", "SKIPPED");
            resultMap.put("reason", "BUDGET_BLOCKED");
            resultMap.put("blockCode", result.getBlockCode());
            resultMap.put("blockReason", result.getBlockReason());
            return resultMap;
        }
        if (result.isPartial()) {
            // 部分执行：只处理部分用户
            int adjustedQuantity = result.getAdjustedQuantity();
            variables.put("memberIds", memberIds.stream().limit(adjustedQuantity).collect(Collectors.toList()));
            log.info("Budget partial execution: planId={}, original={}, adjusted={}", 
                     planId, memberIds.size(), adjustedQuantity);
        }
        // 注入预算信息到变量（供后续节点使用）
        variables.put("budgetConsumed", result.getConsumedAmount());
        variables.put("budgetRemaining", result.getRemainingBudget());
        variables.put("budgetTotal", result.getTotalBudget());
        return joinPoint.proceed();
    }
    private BigDecimal getUnitCost(Map<String, Object> variables, String channel) {
        // 从配置中读取单次成本
        // 优先级：变量配置 > 渠道默认
        if ("SMS".equalsIgnoreCase(channel)) {
            return BigDecimal.valueOf(0.80);
        } else if ("PUSH".equalsIgnoreCase(channel)) {
            return BigDecimal.valueOf(0.30);
        }
        return DEFAULT_UNIT_COST;
    }
}
```
## 五、前端界面设计
### 5.1 Campaign 配置中的预算节奏设置
```text
┌─ 预算与节奏控制 ───────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌─ 总预算 ──────────────────────────────────────────────────────────────┐ │
│  │  总预算: [ 100,000 ] 元                                               │ │
│  │  活动周期: 2026-06-01 ~ 2026-06-30 (30 天)                           │ │
│  │  建议每日预算: 3,333 元                                               │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 节奏模式 ─────────────────────────────────────────────────────────────┐ │
│  │  ● 匀速消耗 (Even Pacing)                                             │ │
│  │    每天固定消耗 3,333 元，预算均匀分布                                 │ │
│  │                                                                         │ │
│  │  ○ 前倾消耗 (Front-loaded)                                             │ │
│  │    前期多消耗，后期少消耗（适用于短期爆发活动）                        │ │
│  │                                                                         │ │
│  │  ○ 动态调速 (Dynamic Pacing)                                           │ │
│  │    根据实时转化效果，自动调整每日预算（推荐）                          │ │
│  │    ┌─ 动态参数 ─────────────────────────────────────────────────────┐ │ │
│  │    │  回溯天数: [ 3 ] 天                                            │ │ │
│  │    │  预算调整范围: [ 0.5 ] ~ [ 2.0 ] 倍                           │ │ │
│  │    └────────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 每日上限 ─────────────────────────────────────────────────────────────┐ │
│  │  [x] 启用每日上限                                                     │ │
│  │  每日上限: [ 10,000 ] 元  (硬上限/超出即停)                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 告警配置 ─────────────────────────────────────────────────────────────┐ │
│  │  警告阈值: [ 80 ] %  (消耗达到 80% 时告警)                            │ │
│  │  严重阈值: [ 95 ] %  (消耗达到 95% 时严重告警)                        │ │
│  │  自动暂停: [x] 消耗达到 100% 时自动暂停活动                           │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.2 预算实时监控仪表板
```text
┌─ 预算监控 ─────────────────────────────────────────────────────────────────┐
│  活动: 618大促高价值会员召回                                               │
│  总预算: ¥100,000  已消耗: ¥68,234 (68.2%)  剩余: ¥31,766               │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 消耗趋势 ─────────────────────────────────────────────────────────────┐ │
│  │  ¥12,000 ┤                                            ── 实际消耗    │ │
│  │  ¥10,000 ┤  ────  ────                              ── 计划消耗    │ │
│  │   ¥8,000 ┤  │  │  │  │  │  │  │  │  │  │  │  │                    │ │
│  │   ¥6,000 ┤  │  │  │  │  │  │  │  │  │  │  │  │                    │ │
│  │   ¥4,000 ┤  │  │  │  │  │  │  │  │  │  │  │  │                    │ │
│  │   ¥2,000 ┤  │  │  │  │  │  │  │  │  │  │  │  │                    │ │
│  │       ¥0 ┼──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──┴──                    │ │
│  │       06-01 06-03 06-05 06-07 06-09 06-11 06-13                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 每日明细 ─────────────────────────────────────────────────────────────┐ │
│  │  日期      │ 计划消耗 │ 实际消耗 │ 偏差   │ 状态                   │ │
│  │  06-13     │ 3,333   │ 3,456   │ +3.7%  │ ✅ 正常                │ │
│  │  06-12     │ 3,333   │ 2,890   │ -13.3% │ ⚠️ 低于计划            │ │
│  │  06-11     │ 3,333   │ 3,567   │ +7.0%  │ ✅ 正常                │ │
│  │  06-10     │ 3,333   │ 3,890   │ +16.7% │ ⚠️ 接近上限            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 告警记录 ─────────────────────────────────────────────────────────────┐ │
│  │  时间          │ 类型      │ 消息                          │ 状态   │ │
│  │  06-13 14:30   │ CRITICAL  │ 消耗已达 95%，剩余 5,000 元  │ 🔴 进行 │ │
│  │  06-10 10:00   │ WARN      │ 消耗已达 80%，剩余 20,000 元 │ ✅ 已解 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 六、API 设计
### 6.1 获取预算状态
```json
GET /api/campaign/budget/pacing/plan_001
{
    "code": 0,
    "data": {
        "planId": "plan_001",
        "totalBudget": 100000,
        "totalConsumed": 68234,
        "totalRemaining": 31766,
        "consumptionRatio": 0.682,
        "dailyCapAmount": 10000,
        "todayConsumed": 3456,
        "todayRemaining": 6544,
        "pacingMode": "DYNAMIC",
        "isPausedByBudget": false,
        "alerts": [
            { "type": "WARN", "triggeredAt": "2026-06-10T10:00:00Z", "resolved": true },
            { "type": "CRITICAL", "triggeredAt": "2026-06-13T14:30:00Z", "resolved": false }
        ]
    }
}
```
### 6.2 更新预算配置
```json
PUT /api/campaign/budget/pacing/plan_001
{
    "totalBudget": 150000,
    "pacingMode": "DYNAMIC",
    "dailyCapEnabled": true,
    "dailyCapAmount": 10000,
    "dynamicPacingConfig": {
        "lookbackDays": 3,
        "minBudgetFactor": 0.5,
        "maxBudgetFactor": 2.0
    },
    "alertThresholds": {
        "warn": 0.8,
        "critical": 0.95,
        "stop": 1.0
    }
}
```
## 七、与现有模块集成点总结
| 现有模块                      | 集成方式        | 新增内容                             |
| ------------------------- | ----------- | -------------------------------- |
| **Decision Engine（预算分配）** | 预算节奏控制读取总预算 | 运行时消耗反馈 → 决策引擎动态调整               |
| **Execution Workers**     | AOP 统一拦截    | `BudgetGuardAspect` 自动检查         |
| **Zeebe**                 | Worker 返回状态 | 预算不足时返回 `BUDGET_EXHAUSTED`       |
| **Event System**          | 发布/消费事件     | `BUDGET_CONSUMED`、`BUDGET_ALERT` |
| **Intervention System**   | 调用暂停/恢复     | 预算耗尽自动暂停，每日重置自动恢复                |
| **Simulation**            | 消耗曲线预测      | 模拟时考虑 Pacing 约束                  |
## 八、实施检查清单
* 执行 DDL：`campaign_budget_pacing` 表
* 执行 DDL：`campaign_budget_consumption` 表
* 执行 DDL：`campaign_budget_alert` 表
* 实现 `BudgetPacingService`（核心服务）
* 实现 `BudgetGuardAspect`（Worker 拦截）
* 实现每日重置定时任务
* 实现动态调速算法
* 实现预算告警与通知
* 前端：Campaign 配置中增加预算节奏设置
* 前端：预算实时监控仪表板
* 前端：告警列表页面
* 编写单元测试（覆盖率 > 80%）
## 九、总结
本设计为 Campaign Tools 补齐了**运行时预算控制能力**：
| 能力         | 实现方式                                   |
| ---------- | -------------------------------------- |
| **总预算控制**  | `total_budget` + `total_consumed` 累计检查 |
| **每日上限控制** | `daily_cap_amount` + 每日重置定时任务          |
| **匀速消耗**   | 活动期内平均分配每日预算                           |
| **动态调速**   | 基于近 N 天转化率自动调整次日预算                     |
| **预算预警**   | 三级告警（80%/95%/100%）+ 通知                 |
| **预算熔断**   | 100% 耗尽时自动暂停 Campaign                  |
| **自动恢复**   | 每日重置后自动恢复暂停的 Campaign                  |
**与现有模块零侵入**：通过 AOP 统一拦截所有 Worker，预算检查对业务代码透明。
