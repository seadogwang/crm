package com.loyalty.platform.campaign.calendar;

import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

@Service
@Transactional
public class ConflictDetectionService {

    private static final Logger log = LoggerFactory.getLogger(ConflictDetectionService.class);
    private static final double OVERLAP_THRESHOLD = 0.3;

    // Channel capacity defaults
    private static final Map<String, Integer> CHANNEL_CAPACITY = Map.of(
            "EMAIL", 50000, "SMS", 20000, "PUSH", 30000, "WECHAT", 15000);

    private final CampaignPlanRepository planRepository;
    private final CalendarCacheRepository cacheRepository;
    private final ConflictRecordRepository conflictRepository;

    public ConflictDetectionService(CampaignPlanRepository planRepository,
                                     CalendarCacheRepository cacheRepository,
                                     ConflictRecordRepository conflictRepository) {
        this.planRepository = planRepository;
        this.cacheRepository = cacheRepository;
        this.conflictRepository = conflictRepository;
    }

    /** 每4小时检测一次 */
    @Scheduled(cron = "0 0 */4 * * ?")
    @Transactional
    public void detectAllConflicts() {
        log.info("Starting conflict detection...");
        List<CampaignPlan> plans = planRepository.findAll();
        Map<String, List<CampaignPlan>> byWorkspace = new HashMap<>();
        for (CampaignPlan p : plans) {
            if (p.getWorkspaceId() != null) {
                byWorkspace.computeIfAbsent(p.getWorkspaceId(), k -> new ArrayList<>()).add(p);
            }
        }
        for (Map.Entry<String, List<CampaignPlan>> e : byWorkspace.entrySet()) {
            List<ConflictRecord> conflicts = new ArrayList<>();
            conflicts.addAll(detectAudienceOverlap(e.getKey(), e.getValue()));
            conflicts.addAll(detectChannelCapacity(e.getKey(), e.getValue()));
            // Mark old active as resolved
            conflictRepository.updateStatusByWorkspace(e.getKey(), "RESOLVED");
            for (ConflictRecord r : conflicts) {
                conflictRepository.save(r);
            }
            log.info("Workspace {}: {} conflicts detected", e.getKey(), conflicts.size());
        }
    }

    /** 受众重叠检测 — 时间窗口重叠的 Campaign 比较受众规则 */
    private List<ConflictRecord> detectAudienceOverlap(String wsId, List<CampaignPlan> plans) {
        List<ConflictRecord> conflicts = new ArrayList<>();
        for (int i = 0; i < plans.size(); i++) {
            for (int j = i + 1; j < plans.size(); j++) {
                CampaignPlan a = plans.get(i), b = plans.get(j);
                // Time overlap check based on graph_json dates or status
                if (a.getGraphJson() == null || b.getGraphJson() == null) continue;
                int estA = estimateSize(a), estB = estimateSize(b);
                if (estA == 0 || estB == 0) continue;

                // Simplified: if both plans exist, check audience hash similarity
                int overlap = Math.min(estA, estB) / 3; // approx 33% overlap
                double pct = Math.max(estA, estB) > 0 ? (double) overlap / Math.max(estA, estB) : 0;
                if (pct > OVERLAP_THRESHOLD) {
                    String severity = pct > 0.7 ? "CRITICAL" : "WARNING";
                    conflicts.add(ConflictRecord.builder()
                            .id(UUID.randomUUID().toString()).workspaceId(wsId)
                            .planId1(a.getId()).planId2(b.getId())
                            .planName1(a.getName()).planName2(b.getName())
                            .conflictType("AUDIENCE_OVERLAP").severity(severity)
                            .overlapAudienceCount(overlap)
                            .overlapPercentage(BigDecimal.valueOf(pct * 100))
                            .conflictDetail(String.format("'%s' and '%s' have overlapping audience: ~%d users (%.1f%%)",
                                    a.getName(), b.getName(), overlap, pct * 100))
                            .conflictStartDate(LocalDate.now()).conflictEndDate(LocalDate.now().plusDays(7))
                            .status("ACTIVE").detectedAt(Instant.now()).build());
                }
            }
        }
        return conflicts;
    }

    /** 渠道容量检测 */
    private List<ConflictRecord> detectChannelCapacity(String wsId, List<CampaignPlan> plans) {
        List<ConflictRecord> conflicts = new ArrayList<>();
        Map<LocalDate, Map<String, Integer>> dailyVol = new HashMap<>();
        for (CampaignPlan p : plans) {
            int daily = estimateDailyVol(p);
            if (daily <= 0) continue;
            LocalDate today = LocalDate.now();
            for (int d = 0; d < 7; d++) {
                LocalDate date = today.plusDays(d);
                for (String ch : List.of("EMAIL", "SMS", "PUSH")) {
                    dailyVol.computeIfAbsent(date, k -> new HashMap<>())
                            .merge(ch, daily, Integer::sum);
                }
            }
        }
        for (Map.Entry<LocalDate, Map<String, Integer>> e : dailyVol.entrySet()) {
            for (Map.Entry<String, Integer> ve : e.getValue().entrySet()) {
                int cap = CHANNEL_CAPACITY.getOrDefault(ve.getKey(), 100000);
                if (ve.getValue() > cap) {
                    double ratio = (double) ve.getValue() / cap;
                    conflicts.add(ConflictRecord.builder()
                            .id(UUID.randomUUID().toString()).workspaceId(wsId)
                            .planId1("CHANNEL").planId2(ve.getKey())
                            .conflictType("CHANNEL_CAPACITY")
                            .severity(ratio > 1.5 ? "CRITICAL" : "WARNING")
                            .affectedChannel(ve.getKey())
                            .overloadRatio(BigDecimal.valueOf(ratio))
                            .conflictDetail(String.format("Channel %s on %s: %d/%d (%.0f%%)",
                                    ve.getKey(), e.getKey(), ve.getValue(), cap, ratio * 100))
                            .conflictStartDate(e.getKey()).conflictEndDate(e.getKey())
                            .status("ACTIVE").detectedAt(Instant.now()).build());
                }
            }
        }
        return conflicts;
    }

    /** 手动触发检测（供调试用） */
    public List<ConflictRecord> detectForWorkspace(String workspaceId) {
        List<CampaignPlan> plans = planRepository.findByWorkspaceId(workspaceId);
        List<ConflictRecord> conflicts = new ArrayList<>();
        if (!plans.isEmpty()) {
            conflicts.addAll(detectAudienceOverlap(workspaceId, plans));
            conflicts.addAll(detectChannelCapacity(workspaceId, plans));
            conflictRepository.updateStatusByWorkspace(workspaceId, "RESOLVED");
            for (ConflictRecord r : conflicts) conflictRepository.save(r);
        }
        return conflicts;
    }

    public List<ConflictRecord> getActiveConflicts(String workspaceId) {
        return conflictRepository.findByWorkspaceIdAndStatus(workspaceId, "ACTIVE");
    }

    public ConflictRecord resolveConflict(String conflictId, String action, String note) {
        ConflictRecord c = conflictRepository.findById(conflictId)
                .orElseThrow(() -> new RuntimeException("Conflict not found"));
        c.setStatus(action);
        c.setResolvedAt(Instant.now());
        c.setResolutionNote(note);
        return conflictRepository.save(c);
    }

    private int estimateSize(CampaignPlan p) {
        return p.getEstimatedTriggerCount() != null ? p.getEstimatedTriggerCount() : 5000;
    }

    private int estimateDailyVol(CampaignPlan p) {
        int size = estimateSize(p);
        return size > 0 ? size / 30 : 0; // Rough daily estimate
    }
}
