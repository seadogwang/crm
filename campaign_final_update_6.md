## 缺失项 4（P2）：活动日历与冲突检测（Campaign Calendar）详细设计
> **优先级**：P2（增强功能）\
> **原因**：当 Campaign 数量增加后，缺乏全局视图会导致营销活动“撞车”，影响用户体验和渠道健康度。虽然不阻塞上线，但长期运营必需。\
> **对应章节**：第1章（Planning）扩展 + 第3章（Decision Engine）扩展 + 第7章（前端）扩展\
> **设计原则**：**只读 + 分析**，不修改现有 Campaign 的执行逻辑。通过独立的“日历视图”和“冲突检测引擎”为运营人员提供决策支持，由人工决定如何调整。
## 一、设计目标
1. **全局可视化**：按时间轴展示所有 Campaign（批处理 + 事件驱动）的计划执行窗口。
2. **冲突检测**：自动识别并标记不同类型的冲突：
   * **受众重叠**：多个 Campaign 同时触达同一用户群。
   * **渠道容量超载**：某日发送量超过渠道上限（如：单日最大 10 万条短信）。
   * **流量竞争**：事件驱动 Campaign 的预估触发量叠加超过处理能力。
3. **容量预测**：根据历史发送量和计划发送量，预测未来渠道负载。
4. **建议与优化**：冲突检测后提供调整建议（如：延后 1 天、降低频次、合并活动）。
## 二、与现有功能的集成点
| 现有功能                         | 如何与 Campaign Calendar 集成                                   |
| ---------------------------- | ---------------------------------------------------------- |
| **Planning（campaign\_plan）** | 读取 `start_time`、`end_time`、`status`、`trigger_type` 作为日历数据源 |
| **Audience 筛选**              | 复用 `AudienceSqlGenerator`，判断两个 Campaign 的受众是否有交集           |
| **Decision Engine（渠道容量）**    | 读取 `channel_capacity` 配置作为容量基准线                            |
| **Event Engine（预估触发量）**      | 读取 `estimated_trigger_count` 预测事件驱动 Campaign 的负载           |
| **Execution History**        | 读取历史发送量，用于容量预测和基线校准                                        |
## 三、数据模型设计
### 3.1 日历缓存表（campaign\_calendar\_cache）
> 用于加速日历视图加载，避免每次重新计算所有数据。
```sql
-- ============================================================
-- 日历缓存表（定期刷新，避免实时计算开销）
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_calendar_cache (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    plan_id VARCHAR(64) NOT NULL,
    plan_name VARCHAR(255),
    trigger_type VARCHAR(32),                      -- MANUAL / EVENT / SCHEDULED
    -- ===== 时间信息 =====
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    actual_start_time TIMESTAMPTZ,                 -- 实际开始时间（已执行时）
    -- ===== 受众预估 =====
    estimated_audience_size INT,                   -- 预估触达人数
    audience_hash VARCHAR(64),                     -- 受众规则的哈希值（用于快速判断是否相同）
    -- ===== 渠道负载预估 =====
    estimated_daily_volume_EMAIL INT,
    estimated_daily_volume_SMS INT,
    estimated_daily_volume_PUSH INT,
    -- ===== 状态 =====
    status VARCHAR(32),                            -- DRAFT / RUNNING / COMPLETED
    -- ===== 缓存元数据 =====
    cache_generated_at TIMESTAMPTZ DEFAULT NOW(),
    cache_version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ccc_workspace ON campaign_calendar_cache(workspace_id);
CREATE INDEX idx_ccc_dates ON campaign_calendar_cache(start_date, end_date);
CREATE INDEX idx_ccc_program ON campaign_calendar_cache(program_code);
```
### 3.2 冲突记录表（campaign\_conflict\_record）
```sql
-- ============================================================
-- 冲突检测结果记录
-- ============================================================
CREATE TABLE IF NOT EXISTS campaign_conflict_record (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    -- ===== 冲突双方 =====
    plan_id_1 VARCHAR(64) NOT NULL,
    plan_id_2 VARCHAR(64) NOT NULL,
    -- ===== 冲突类型 =====
    conflict_type VARCHAR(32) NOT NULL,            -- AUDIENCE_OVERLAP / CHANNEL_CAPACITY / BUDGET_CONTENTION / EVENT_FLOOD
    -- ===== 冲突详情 =====
    severity VARCHAR(16) DEFAULT 'WARNING',        -- INFO / WARNING / CRITICAL
    overlap_audience_count INT,                    -- 重叠人数（仅受众冲突时）
    overlap_percentage DECIMAL(5,2),               -- 重叠百分比
    affected_channel VARCHAR(32),                  -- 受影响渠道（渠道冲突时）
    overload_ratio DECIMAL(5,2),                   -- 超载比例
    conflict_detail TEXT,                          -- 详细描述
    -- ===== 冲突时间 =====
    conflict_date_range DATERANGE,                 -- 冲突发生的时间段
    -- ===== 状态 =====
    status VARCHAR(32) DEFAULT 'ACTIVE',           -- ACTIVE / RESOLVED / IGNORED
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(64),
    resolution_note TEXT,
    -- ===== 元数据 =====
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_ccr_workspace ON campaign_conflict_record(workspace_id);
CREATE INDEX idx_ccr_status ON campaign_conflict_record(status);
CREATE INDEX idx_ccr_plans ON campaign_conflict_record(plan_id_1, plan_id_2);
CREATE INDEX idx_ccr_detected ON campaign_conflict_record(detected_at DESC);
```
## 四、冲突检测引擎
### 4.1 核心检测服务（ConflictDetectionService）
```java
package com.loyalty.platform.campaign.calendar;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.util.*;
import java.util.stream.Collectors;
@Slf4j
@Service
@RequiredArgsConstructor
public class ConflictDetectionService {
    private final CampaignPlanRepository planRepository;
    private final CampaignCalendarCacheRepository cacheRepository;
    private final ConflictRecordRepository conflictRecordRepository;
    private final AudienceSqlGenerator audienceSqlGenerator;
    private final JdbcTemplate jdbcTemplate;
    // ===== 定时检测（每4小时执行一次） =====
    @Scheduled(cron = "0 0 */4 * * ?")
    @Transactional
    public void detectAllConflicts() {
        log.info("Starting conflict detection for all workspaces...");
        // 1. 获取所有状态为 RUNNING / SCHEDULED / DRAFT 的 Campaign
        List<CampaignPlan> plans = planRepository.findByStatusIn(
            List.of("RUNNING", "SCHEDULED", "DRAFT", "APPROVED")
        );
        // 2. 按 Workspace 分组检测
        Map<String, List<CampaignPlan>> plansByWorkspace = plans.stream()
                .collect(Collectors.groupingBy(CampaignPlan::getWorkspaceId));
        for (Map.Entry<String, List<CampaignPlan>> entry : plansByWorkspace.entrySet()) {
            String workspaceId = entry.getKey();
            List<CampaignPlan> workspacePlans = entry.getValue();
            // 3. 检测不同维度的冲突
            List<ConflictRecord> allConflicts = new ArrayList<>();
            allConflicts.addAll(detectAudienceOverlap(workspaceId, workspacePlans));
            allConflicts.addAll(detectChannelCapacity(workspaceId, workspacePlans));
            // 4. 保存冲突记录
            // 先标记旧冲突为已解决
            conflictRecordRepository.updateStatusByWorkspace(workspaceId, "RESOLVED");
            for (ConflictRecord record : allConflicts) {
                conflictRecordRepository.save(record);
            }
            log.info("Conflict detection completed: workspace={}, conflicts={}",
                     workspaceId, allConflicts.size());
        }
    }
    // ===== 1. 受众重叠检测 =====
    private List<ConflictRecord> detectAudienceOverlap(String workspaceId,
                                                        List<CampaignPlan> plans) {
        List<ConflictRecord> conflicts = new ArrayList<>();
        // 只检测时间重叠的 Campaign
        List<CampaignPlan> activePlans = plans.stream()
                .filter(p -> p.getStartTime() != null && p.getEndTime() != null)
                .collect(Collectors.toList());
        for (int i = 0; i < activePlans.size(); i++) {
            for (int j = i + 1; j < activePlans.size(); j++) {
                CampaignPlan p1 = activePlans.get(i);
                CampaignPlan p2 = activePlans.get(j);
                // 检查时间是否重叠
                if (!isTimeOverlap(p1, p2)) continue;
                // 计算受众重叠
                int overlapCount = calculateAudienceOverlap(p1, p2);
                if (overlapCount > 0) {
                    // 计算重叠比例
                    int size1 = estimateAudienceSize(p1);
                    int size2 = estimateAudienceSize(p2);
                    double overlapPct1 = size1 > 0 ? (double) overlapCount / size1 : 0;
                    double overlapPct2 = size2 > 0 ? (double) overlapCount / size2 : 0;
                    // 如果任一重叠比例 > 30%，标记为冲突
                    if (overlapPct1 > 0.3 || overlapPct2 > 0.3) {
                        String severity = overlapPct1 > 0.7 || overlapPct2 > 0.7 ? "CRITICAL" : "WARNING";
                        ConflictRecord record = ConflictRecord.builder()
                                .id(UUID.randomUUID().toString())
                                .workspaceId(workspaceId)
                                .planId1(p1.getId())
                                .planId2(p2.getId())
                                .conflictType("AUDIENCE_OVERLAP")
                                .severity(severity)
                                .overlapAudienceCount(overlapCount)
                                .overlapPercentage(overlapPct1 > overlapPct2 ? overlapPct1 : overlapPct2)
                                .conflictDetail(String.format(
                                    "Campaign '%s' and '%s' have overlapping audience: %d users (%.1f%% of total)",
                                    p1.getName(), p2.getName(), overlapCount, overlapPct1 * 100
                                ))
                                .conflictDateRange(getOverlapDateRange(p1, p2))
                                .status("ACTIVE")
                                .detectedAt(Instant.now())
                                .build();
                        conflicts.add(record);
                    }
                }
            }
        }
        return conflicts;
    }
    /**
     * 计算两个 Campaign 的受众重叠人数
     * 
     * 关键：复用 AudienceSqlGenerator 生成的 SQL
     */
    private int calculateAudienceOverlap(CampaignPlan p1, CampaignPlan p2) {
        if (p1.getGraphJson() == null || p2.getGraphJson() == null) {
            return 0;
        }
        // 1. 提取两个 Campaign 的受众筛选条件
        JsonNode config1 = extractAudienceConfig(p1);
        JsonNode config2 = extractAudienceConfig(p2);
        if (config1 == null || config2 == null) {
            return 0;
        }
        // 2. 生成各自的查询 SQL
        String sql1 = audienceSqlGenerator.generateSql(config1);
        String sql2 = audienceSqlGenerator.generateSql(config2);
        // 3. 生成交集查询 SQL
        String intersectSql = String.format(
            "SELECT COUNT(DISTINCT member_id) FROM (%s) a INNER JOIN (%s) b ON a.member_id = b.member_id",
            sql1, sql2
        );
        try {
            return jdbcTemplate.queryForObject(intersectSql, Integer.class);
        } catch (Exception e) {
            log.warn("Failed to calculate audience overlap: {}", e.getMessage());
            return 0;
        }
    }
    // ===== 2. 渠道容量冲突检测 =====
    private List<ConflictRecord> detectChannelCapacity(String workspaceId,
                                                         List<CampaignPlan> plans) {
        List<ConflictRecord> conflicts = new ArrayList<>();
        // 获取渠道容量配置（从 Decision Engine 或配置文件）
        Map<String, Integer> channelCapacity = getChannelCapacity();
        // 按日聚合所有 Campaign 的预估发送量
        Map<LocalDate, Map<String, Integer>> dailyVolume = new HashMap<>();
        for (CampaignPlan plan : plans) {
            if (plan.getStartTime() == null || plan.getEndTime() == null) continue;
            LocalDate start = plan.getStartTime().toLocalDate();
            LocalDate end = plan.getEndTime().toLocalDate();
            // 估算每日发送量
            Map<String, Integer> perDayVolume = estimateDailyVolume(plan);
            LocalDate date = start;
            while (!date.isAfter(end)) {
                dailyVolume.computeIfAbsent(date, k -> new HashMap<>());
                Map<String, Integer> volume = dailyVolume.get(date);
                for (Map.Entry<String, Integer> entry : perDayVolume.entrySet()) {
                    volume.put(entry.getKey(), volume.getOrDefault(entry.getKey(), 0) + entry.getValue());
                }
                date = date.plusDays(1);
            }
        }
        // 检查每日容量
        for (Map.Entry<LocalDate, Map<String, Integer>> entry : dailyVolume.entrySet()) {
            LocalDate date = entry.getKey();
            Map<String, Integer> volumes = entry.getValue();
            for (Map.Entry<String, Integer> vol : volumes.entrySet()) {
                String channel = vol.getKey();
                int total = vol.getValue();
                int capacity = channelCapacity.getOrDefault(channel, 100000);
                if (total > capacity) {
                    double ratio = (double) total / capacity;
                    String severity = ratio > 1.5 ? "CRITICAL" : "WARNING";
                    // 查找当天有哪些 Campaign 在运行（用于记录）
                    List<String> runningPlans = getPlansRunningOnDate(date, plans);
                    ConflictRecord record = ConflictRecord.builder()
                            .id(UUID.randomUUID().toString())
                            .workspaceId(workspaceId)
                            .planId1(String.join(",", runningPlans))
                            .planId2("CHANNEL_CAPACITY")
                            .conflictType("CHANNEL_CAPACITY")
                            .severity(severity)
                            .affectedChannel(channel)
                            .overloadRatio(ratio)
                            .conflictDetail(String.format(
                                "Channel '%s' capacity exceeded on %s: %d / %d (%.0f%%)",
                                channel, date, total, capacity, ratio * 100
                            ))
                            .conflictDateRange(DateRange.from(date))
                            .status("ACTIVE")
                            .detectedAt(Instant.now())
                            .build();
                    conflicts.add(record);
                }
            }
        }
        return conflicts;
    }
    // ===== 工具方法 =====
    private boolean isTimeOverlap(CampaignPlan p1, CampaignPlan p2) {
        if (p1.getStartTime() == null || p1.getEndTime() == null ||
            p2.getStartTime() == null || p2.getEndTime() == null) {
            return false;
        }
        return !(p1.getEndTime().isBefore(p2.getStartTime()) ||
                 p2.getEndTime().isBefore(p1.getStartTime()));
    }
    private DateRange getOverlapDateRange(CampaignPlan p1, CampaignPlan p2) {
        LocalDate start = p1.getStartTime().toLocalDate().isAfter(p2.getStartTime().toLocalDate()) ?
                          p1.getStartTime().toLocalDate() : p2.getStartTime().toLocalDate();
        LocalDate end = p1.getEndTime().toLocalDate().isBefore(p2.getEndTime().toLocalDate()) ?
                        p1.getEndTime().toLocalDate() : p2.getEndTime().toLocalDate();
        return DateRange.from(start, end);
    }
    private int estimateAudienceSize(CampaignPlan plan) {
        // 调用 Audience 预估接口，返回人数
        return 10000; // 简化返回
    }
}
```
## 五、前端界面设计
### 5.1 日历主视图（月/周/日切换）
```text
┌─ 活动日历 ──────────────────────────────────────────────────────────────────┐
│  [◀ 六月 2026 ▶]  [今日]  [月] [周] [日]    Program: [全部 ▼]  状态:[全部] │
├──────────────────────────────────────────────────────────────────────────────┤
│  周日   周一   周二   周三   周四   周五   周六                            │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┐                            │
│  │     │     │     │     │     │     │  1  │                            │
│  │     │     │     │     │     │     │ ●●●  │                            │
│  │     │     │     │     │     │     │ 📧  │                            │
│  │     │     │     │     │     │     │   ● │                            │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                            │
│  │  2  │  3  │  4  │  5  │  6  │  7  │  8  │                            │
│  │ 🔴  │     │   ● │     │     │     │     │                            │
│  │ 618  │     │ 会 员 │     │     │     │     │                            │
│  │ 大促 │     │ 日   │     │     │     │     │                            │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                            │
│  │  9  │ 10  │ 11  │ 12  │ 13  │ 14  │ 15  │                            │
│  │     │     │     │     │     │     │     │                            │
│  │     │     │     │     │     │     │     │                            │
│  │     │     │     │     │     │     │     │                            │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┤                            │
│  │ 16  │ 17  │ 18  │ 19  │ 20  │ 21  │ 22  │                            │
│  │     │     │     │     │     │     │     │                            │
│  │     │     │     │     │     │     │     │                            │
│  │     │     │     │     │     │     │     │                            │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┘                            │
│                                                                             │
│  ┌─ 选中日期详情: 2026-06-06 (周三) ─────────────────────────────────────┐ │
│  │  ┌───────────────────────────────────────────────────────────────────┐ │ │
│  │  │  运行中 Campaign (3)                                             │ │ │
│  │  │  🔴 618大促预热      EMAIL   预期: 8,000    状态: RUNNING      │ │ │
│  │  │  🟡 会员日促销        SMS    预期: 5,000    状态: SCHEDULED    │ │ │
│  │  │  🔵 新会员欢迎        PUSH   预期: 500      状态: RUNNING      │ │ │
│  │  └───────────────────────────────────────────────────────────────────┘ │ │
│  │  ┌───────────────────────────────────────────────────────────────────┐ │ │
│  │  │  ⚠️ 冲突警告 (2)                                                 │ │ │
│  │  │  🟡 受众重叠: 618大促预热 与 会员日促销 重叠约 3,200人          │ │ │
│  │  │  🔴 渠道超载: EMAIL 容量 8,000/10,000 (80%) → 正常              │ │ │
│  │  │  [查看详情]  [忽略]  [建议调整]                                  │ │ │
│  │  └───────────────────────────────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.2 冲突详情面板
```text
┌─ 冲突详情 ──────────────────────────────────────────────────────────────────┐
│  冲突 ID: CONFLICT_001                                                    │
│  类型: 受众重叠  |  严重程度: CRITICAL                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 冲突双方 ─────────────────────────────────────────────────────────────┐ │
│  │  Campaign A: 618大促预热                                              │ │
│  │    时间: 2026-06-01 ~ 2026-06-10                                     │ │
│  │    受众: 近30天有订单、总金额>5000、等级=GOLD                         │ │
│  │    预估人数: 12,000                                                   │ │
│  │                                                                        │ │
│  │  Campaign B: 会员日促销                                               │ │
│  │    时间: 2026-06-05 ~ 2026-06-07                                     │ │
│  │    受众: 近7天登录、等级=GOLD                                         │ │
│  │    预估人数: 8,000                                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 重叠分析 ─────────────────────────────────────────────────────────────┐ │
│  │  重叠人数: 3,200 人                                                   │ │
│  │  重叠比例: A 的 26.7% / B 的 40.0%                                   │ │
│  │  重叠时间段: 2026-06-05 ~ 2026-06-07                                 │ │
│  │                                                                        │ │
│  │  ┌──────────────────────────────────────────────────────────────────┐ │ │
│  │  │  相 似 度 热 力 图                                              │ │ │
│  │  │  等级: ████████████████░░ 100% 相同 (GOLD)                      │ │ │
│  │  │  金额: ████████████░░░░░░ 75% 相似                              │ │ │
│  │  │  行为: ████████░░░░░░░░░░ 50% 相似                              │ │ │
│  │  └──────────────────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 建议方案 ─────────────────────────────────────────────────────────────┐ │
│  │  💡 建议1: 将会员日促销延后至 2026-06-08 开始，避开重叠期           │ │
│  │  💡 建议2: 合并两个 Campaign 为一个，减少重复触达                   │ │
│  │  💡 建议3: 调整会员日促销的受众，排除近30天有订单的用户             │ │
│  │                                                                        │ │
│  │  [应用建议1] [应用建议2] [忽略] [标记已解决]                         │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
### 5.3 容量预测仪表板
```text
┌─ 渠道容量预测 ─────────────────────────────────────────────────────────────┐
│  渠道: [EMAIL ▼]  时间范围: [2026-06]  [刷新]                             │
├──────────────────────────────────────────────────────────────────────────────┤
│  ┌─ 容量趋势 ─────────────────────────────────────────────────────────────┐ │
│  │  发送量                                                               │ │
│  │  12,000 ┤                                   ── 实际历史             │ │
│  │  10,000 ┤  ────  ────  ────                 ── 计划                 │ │
│  │   8,000 ┤  │  │  │  │  │  │  │  │  │  │    ── 容量上限 (10,000)   │ │
│  │   6,000 ┤  │  │  │  │  │  │  │  │  │  │                            │ │
│  │   4,000 ┤  │  │  │  │  │  │  │  │  │  │                            │ │
│  │   2,000 ┤  │  │  │  │  │  │  │  │  │  │                            │ │
│  │       0 ┼──┴──┴──┴──┴──┴──┴──┴──┴──┴──                            │ │
│  │      06-01 06-03 06-05 06-07 06-09 06-11 06-13                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  ┌─ 预警列表 ─────────────────────────────────────────────────────────────┐ │
│  │  日期      │ 渠道  │ 预测发送 │ 容量 │ 状态   │ 操作              │ │
│  │  06-07     │ EMAIL │ 10,800  │ 10,000│ 🔴 超载│ [查看详情]        │ │
│  │  06-10     │ SMS   │ 5,200   │ 5,000 │ 🟡 紧张│ [查看详情]        │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────────┘
```
## 六、API 设计
### 6.1 获取日历数据（月视图）
```json
GET /api/campaign/calendar/workspace/ws_001?year=2026&month=6
{
    "code": 0,
    "data": {
        "year": 2026,
        "month": 6,
        "days": [
            {
                "date": "2026-06-01",
                "campaigns": [
                    {
                        "planId": "plan_001",
                        "name": "618大促预热",
                        "triggerType": "MANUAL",
                        "status": "RUNNING",
                        "color": "#ef4444",
                        "estimatedVolume": 8000
                    }
                ],
                "conflicts": []
            },
            {
                "date": "2026-06-05",
                "campaigns": [
                    {
                        "planId": "plan_001",
                        "name": "618大促预热",
                        "triggerType": "MANUAL",
                        "status": "RUNNING",
                        "color": "#ef4444"
                    },
                    {
                        "planId": "plan_002",
                        "name": "会员日促销",
                        "triggerType": "EVENT",
                        "status": "SCHEDULED",
                        "color": "#eab308"
                    }
                ],
                "conflicts": [
                    {
                        "conflictId": "conflict_001",
                        "type": "AUDIENCE_OVERLAP",
                        "severity": "WARNING",
                        "message": "受众重叠约 3,200人"
                    }
                ]
            }
        ]
    }
}
```
### 6.2 获取冲突列表
```json
GET /api/campaign/calendar/conflicts?workspaceId=ws_001&status=ACTIVE
{
    "code": 0,
    "data": [
        {
            "id": "conflict_001",
            "workspaceId": "ws_001",
            "planId1": "plan_001",
            "planId2": "plan_002",
            "planName1": "618大促预热",
            "planName2": "会员日促销",
            "conflictType": "AUDIENCE_OVERLAP",
            "severity": "WARNING",
            "overlapAudienceCount": 3200,
            "overlapPercentage": 26.7,
            "conflictDetail": "Campaign '618大促预热' and '会员日促销' have overlapping audience...",
            "status": "ACTIVE",
            "detectedAt": "2026-06-04T10:00:00Z"
        }
    ]
}
```
### 6.3 忽略/解决冲突
```json
POST /api/campaign/calendar/conflicts/conflict_001/resolve
{
    "action": "IGNORE",
    "note": "经确认，两个 Campaign 的目标用户虽有重叠但不同阶段，不冲突"
}
```
## 七、与现有模块的集成点总结
| 现有模块                          | 集成方式                                        |
| ----------------------------- | ------------------------------------------- |
| **Planning (campaign\_plan)** | 读取 start\_time、end\_time、graph\_json 获取受众配置 |
| **Audience Engine**           | 复用 `AudienceSqlGenerator` 计算受众重叠            |
| **Decision Engine（渠道容量）**     | 读取渠道容量配置作为基准                                |
| **Event Engine**              | 读取 `estimated_trigger_count` 用于容量预测         |
| **Execution History**         | 读取历史发送量用于容量基线校准                             |
| **Intervention**              | 冲突详情中可点击“调整”跳转编辑 Campaign                   |
## 八、实施检查清单
* 执行 DDL：`campaign_calendar_cache` 表
* 执行 DDL：`campaign_conflict_record` 表
* 实现 `ConflictDetectionService`（冲突检测核心）
* 实现受众重叠计算（复用 `AudienceSqlGenerator`）
* 实现渠道容量检测
* 前端：日历组件（月/周/日视图）
* 前端：冲突列表与详情面板
* 前端：容量预测仪表板
* 配置定时任务（每4小时检测一次）
* 编写单元测试（受众重叠计算）
## 九、总结
本设计为 Campaign Tools 补齐了**全局可视化与冲突检测能力**：
| 能力         | 实现方式                               |
| ---------- | ---------------------------------- |
| **日历视图**   | 从 `campaign_plan` 读取时间信息，按天聚合展示    |
| **受众重叠检测** | 复用 `AudienceSqlGenerator`，实时计算交集人数 |
| **渠道容量检测** | 汇总每日各渠道预估发送量，对比容量上限                |
| **冲突记录**   | 持久化存储，支持解决/忽略                      |
| **容量预测**   | 结合历史数据 + 计划数据，预测未来负载               |
**与现有模块零侵入**：所有数据来自已有表，冲突检测为只读分析，不修改任何 Campaign 配置。运营人员可根据冲突建议人工调整活动设置。
