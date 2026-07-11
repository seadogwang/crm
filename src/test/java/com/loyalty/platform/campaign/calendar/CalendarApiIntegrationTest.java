package com.loyalty.platform.campaign.calendar;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.when;

/**
 * Integration test for Calendar & Conflict Detection — tests against real DB.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ConflictDetectionService.class})
@TestPropertySource(properties = {"spring.jpa.hibernate.ddl-auto=update"})
@DisplayName("Calendar & Conflict Detection Integration Tests")
class CalendarApiIntegrationTest {

    @Autowired private CalendarCacheRepository cacheRepository;
    @Autowired private ConflictRecordRepository conflictRepository;
    @MockBean private CampaignPlanRepository planRepository;
    @Autowired private ConflictDetectionService detectionService;
    @PersistenceContext private EntityManager em;

    private static final String PROG = "PROG001";
    private static final String TAG = "cal_" + UUID.randomUUID().toString().substring(0, 8);
    private static final String WS_ID = "WS_" + TAG;

    @BeforeEach
    void setUp() {
        TenantContext.set(PROG);
    }

    @AfterEach
    void tearDown() {
        em.createNativeQuery("DELETE FROM campaign_conflict_record WHERE workspace_id = :ws")
                .setParameter("ws", WS_ID).executeUpdate();
        em.createNativeQuery("DELETE FROM campaign_calendar_cache WHERE workspace_id = :ws")
                .setParameter("ws", WS_ID).executeUpdate();
        TenantContext.clear();
    }

    // ========================================================================
    // Calendar Cache CRUD
    // ========================================================================

    @Test
    @DisplayName("1. 日历缓存 CRUD")
    void shouldCrudCalendarCache() {
        CalendarCache cc = CalendarCache.builder()
                .id("CC_" + TAG).workspaceId(WS_ID).programCode(PROG)
                .planId("PLAN_1").planName("June Campaign").triggerType("MANUAL")
                .startDate(LocalDate.of(2026, 6, 1)).endDate(LocalDate.of(2026, 6, 10))
                .estimatedAudienceSize(8000).audienceHash("abc123")
                .estimatedDailyVolumeEmail(500).estimatedDailyVolumeSms(100)
                .estimatedDailyVolumePush(50).status("RUNNING").build();
        cacheRepository.save(cc);
        em.flush();
        em.clear();

        // Query by workspace + date range
        List<CalendarCache> found = cacheRepository.findByWorkspaceIdAndDateRange(WS_ID,
                LocalDate.of(2026, 6, 1), LocalDate.of(2026, 6, 30));
        assertEquals(1, found.size());
        assertEquals("June Campaign", found.get(0).getPlanName());
        assertEquals(8000, found.get(0).getEstimatedAudienceSize());

        // Outside date range → empty
        List<CalendarCache> outside = cacheRepository.findByWorkspaceIdAndDateRange(WS_ID,
                LocalDate.of(2026, 7, 1), LocalDate.of(2026, 7, 31));
        assertTrue(outside.isEmpty());

        // Ordered by start date
        CalendarCache cc2 = CalendarCache.builder()
                .id("CC2_" + TAG).workspaceId(WS_ID).programCode(PROG)
                .planId("PLAN_2").planName("Earlier").startDate(LocalDate.of(2026, 5, 15))
                .endDate(LocalDate.of(2026, 5, 20)).status("COMPLETED").build();
        cacheRepository.save(cc2);
        em.flush();

        List<CalendarCache> ordered = cacheRepository.findByWorkspaceIdOrderByStartDateAsc(WS_ID);
        assertEquals(2, ordered.size());
        assertTrue(ordered.get(0).getStartDate().isBefore(ordered.get(1).getStartDate()));
        System.out.println("[PASS] Calendar cache CRUD: " + found.size() + " in June, " + ordered.size() + " total");
    }

    // ========================================================================
    // Conflict Record CRUD
    // ========================================================================

    @Test
    @DisplayName("2. 冲突记录 CRUD + 状态查询")
    void shouldCrudConflictRecords() {
        // Create conflicts
        ConflictRecord cr1 = ConflictRecord.builder()
                .id("CR1_" + TAG).workspaceId(WS_ID)
                .planId1("PLAN_A").planId2("PLAN_B")
                .planName1("Campaign A").planName2("Campaign B")
                .conflictType("AUDIENCE_OVERLAP").severity("WARNING")
                .overlapAudienceCount(3200).overlapPercentage(BigDecimal.valueOf(26.7))
                .conflictDetail("Overlap: 3200 users")
                .conflictStartDate(LocalDate.of(2026, 6, 5))
                .conflictEndDate(LocalDate.of(2026, 6, 7))
                .status("ACTIVE").detectedAt(Instant.now()).build();
        ConflictRecord cr2 = ConflictRecord.builder()
                .id("CR2_" + TAG).workspaceId(WS_ID)
                .planId1("CHANNEL").planId2("EMAIL")
                .conflictType("CHANNEL_CAPACITY").severity("CRITICAL")
                .affectedChannel("EMAIL").overloadRatio(BigDecimal.valueOf(1.8))
                .conflictDetail("EMAIL overload: 90000/50000 (180%)")
                .conflictStartDate(LocalDate.of(2026, 6, 7))
                .conflictEndDate(LocalDate.of(2026, 6, 7))
                .status("ACTIVE").detectedAt(Instant.now()).build();
        ConflictRecord cr3 = ConflictRecord.builder()
                .id("CR3_" + TAG).workspaceId(WS_ID)
                .planId1("PLAN_C").planId2("PLAN_D")
                .conflictType("AUDIENCE_OVERLAP").severity("WARNING")
                .status("RESOLVED").resolvedAt(Instant.now()).resolutionNote("Fixed")
                .detectedAt(Instant.now().minusSeconds(86400)).build();

        conflictRepository.saveAll(List.of(cr1, cr2, cr3));
        em.flush();

        // Query all
        List<ConflictRecord> all = conflictRepository.findByWorkspaceIdOrderByDetectedAtDesc(WS_ID);
        assertEquals(3, all.size());
        // Descending by detectedAt
        for (int i = 0; i < all.size() - 1; i++) {
            assertTrue(all.get(i).getDetectedAt().compareTo(all.get(i + 1).getDetectedAt()) >= 0);
        }

        // Query by status
        List<ConflictRecord> active = conflictRepository.findByWorkspaceIdAndStatus(WS_ID, "ACTIVE");
        assertEquals(2, active.size());

        List<ConflictRecord> resolved = conflictRepository.findByWorkspaceIdAndStatus(WS_ID, "RESOLVED");
        assertEquals(1, resolved.size());

        // Batch update
        conflictRepository.updateStatusByWorkspace(WS_ID, "RESOLVED");
        em.flush();
        em.clear();

        List<ConflictRecord> after = conflictRepository.findByWorkspaceIdAndStatus(WS_ID, "ACTIVE");
        assertEquals(0, after.size(), "All active should be resolved");

        System.out.println("[PASS] Conflict CRUD: " + all.size() + " total, resolved all");
    }

    // ========================================================================
    // Conflict Resolution
    // ========================================================================

    @Test
    @DisplayName("3. 解决冲突 → 更新状态")
    void shouldResolveConflictViaService() {
        ConflictRecord cr = ConflictRecord.builder()
                .id("CR_RES_" + TAG).workspaceId(WS_ID)
                .planId1("P1").planId2("P2").conflictType("AUDIENCE_OVERLAP")
                .severity("WARNING").status("ACTIVE").detectedAt(Instant.now()).build();
        conflictRepository.save(cr);
        em.flush();

        ConflictRecord resolved = detectionService.resolveConflict(cr.getId(), "RESOLVED", "延迟处理");
        em.flush();
        em.clear();

        ConflictRecord after = conflictRepository.findById(cr.getId()).orElseThrow();
        assertEquals("RESOLVED", after.getStatus());
        assertNotNull(after.getResolvedAt());
        assertEquals("延迟处理", after.getResolutionNote());
        System.out.println("[PASS] Conflict resolved: " + after.getId());
    }

    @Test
    @DisplayName("4. 忽略冲突 → IGNORED")
    void shouldIgnoreConflict() {
        ConflictRecord cr = ConflictRecord.builder()
                .id("CR_IGN_" + TAG).workspaceId(WS_ID)
                .planId1("P1").planId2("P2").conflictType("CHANNEL_CAPACITY")
                .severity("WARNING").status("ACTIVE").detectedAt(Instant.now()).build();
        conflictRepository.save(cr);
        em.flush();

        detectionService.resolveConflict(cr.getId(), "IGNORED", "非真实冲突");
        em.flush();
        em.clear();

        ConflictRecord after = conflictRepository.findById(cr.getId()).orElseThrow();
        assertEquals("IGNORED", after.getStatus());
        System.out.println("[PASS] Conflict ignored");
    }

    // ========================================================================
    // Conflict Detection
    // ========================================================================

    @Test
    @DisplayName("5. 检测受众重叠 (mock plans)")
    void shouldDetectAudienceOverlap() {
        CampaignPlan p1 = CampaignPlan.builder()
                .id("PLAN_OV1").workspaceId(WS_ID).name("促销A")
                .graphJson("{}").estimatedTriggerCount(30000).build();
        CampaignPlan p2 = CampaignPlan.builder()
                .id("PLAN_OV2").workspaceId(WS_ID).name("促销B")
                .graphJson("{}").estimatedTriggerCount(30000).build();
        when(planRepository.findByWorkspaceId(WS_ID)).thenReturn(List.of(p1, p2));

        List<ConflictRecord> conflicts = detectionService.detectForWorkspace(WS_ID);
        assertFalse(conflicts.isEmpty());
        ConflictRecord overlap = conflicts.stream()
                .filter(c -> "AUDIENCE_OVERLAP".equals(c.getConflictType()))
                .findFirst().orElse(null);
        assertNotNull(overlap, "Should detect audience overlap");
        assertEquals(WS_ID, overlap.getWorkspaceId());
        assertTrue(overlap.getOverlapAudienceCount() > 0);
        assertNotNull(overlap.getConflictDetail());
        System.out.println("[PASS] Audience overlap: " + overlap.getConflictDetail());
    }

    @Test
    @DisplayName("6. 多计划累计渠道超载 (mock plans)")
    void shouldDetectCumulativeChannelOverload() {
        List<CampaignPlan> plans = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            plans.add(CampaignPlan.builder()
                    .id("PLAN_OVLD" + i).workspaceId(WS_ID)
                    .name("Heavy " + i).graphJson("{}")
                    .estimatedTriggerCount(500000).build());
        }
        when(planRepository.findByWorkspaceId(WS_ID)).thenReturn(plans);

        List<ConflictRecord> conflicts = detectionService.detectForWorkspace(WS_ID);
        long channelConflicts = conflicts.stream()
                .filter(c -> "CHANNEL_CAPACITY".equals(c.getConflictType())).count();
        assertTrue(channelConflicts > 0, "Should have channel capacity conflicts, got " + conflicts.size());
        System.out.println("[PASS] Channel overload detected: " + channelConflicts + " conflicts");
    }

    @Test
    @DisplayName("7. getActiveConflicts 仅返回 ACTIVE 状态")
    void shouldOnlyReturnActiveConflicts() {
        when: {
            ConflictRecord active = ConflictRecord.builder()
                    .id("CR_ACT_" + TAG).workspaceId(WS_ID)
                    .planId1("P1").planId2("P2").conflictType("AUDIENCE_OVERLAP")
                    .status("ACTIVE").detectedAt(Instant.now()).build();
            ConflictRecord resolved = ConflictRecord.builder()
                    .id("CR_RES2_" + TAG).workspaceId(WS_ID)
                    .planId1("P3").planId2("P4").conflictType("AUDIENCE_OVERLAP")
                    .status("RESOLVED").resolvedAt(Instant.now()).detectedAt(Instant.now()).build();
            conflictRepository.saveAll(List.of(active, resolved));
            em.flush();
        }

        List<ConflictRecord> active = detectionService.getActiveConflicts(WS_ID);
        assertEquals(1, active.size());
        assertEquals("ACTIVE", active.get(0).getStatus());
        System.out.println("[PASS] Active conflicts: " + active.size());
    }

    // ========================================================================
    // Summary
    // ========================================================================

    @Test
    @DisplayName("集成测试总结")
    void printSummary() {
        long cacheCount = cacheRepository.findByWorkspaceIdOrderByStartDateAsc(WS_ID).size();
        long conflictCount = conflictRepository.findByWorkspaceIdOrderByDetectedAtDesc(WS_ID).size();

        System.out.println("\n==============================================================");
        System.out.println("  Calendar & Conflict Detection Integration Test Summary");
        System.out.println("==============================================================");
        System.out.println("  Workspace        : " + WS_ID);
        System.out.println("  Calendar Caches  : " + cacheCount);
        System.out.println("  Conflict Records : " + conflictCount);
        System.out.println("==============================================================");
        assertTrue(true);
    }
}
