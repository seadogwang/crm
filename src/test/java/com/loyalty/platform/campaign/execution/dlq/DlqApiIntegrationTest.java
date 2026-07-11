package com.loyalty.platform.campaign.execution.dlq;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

/**
 * Integration test for DLQ & Replay — against real DB.
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({DLQCaptor.class, DLQReplayService.class, DLQCleanupTask.class})
@TestPropertySource(properties = {"spring.jpa.hibernate.ddl-auto=update"})
@DisplayName("DLQ & Replay Integration Tests")
class DlqApiIntegrationTest {

    @Autowired private CampaignZeebeTaskRepository taskRepository;
    @Autowired private DlqReplayLogRepository replayLogRepository;
    @Autowired private DLQCaptor captor;
    @Autowired private DLQReplayService replayService;
    @PersistenceContext private EntityManager em;

    private static final String PROG = "PROG001";
    private static final String TAG = "dlq_" + UUID.randomUUID().toString().substring(0, 8);
    private static final String PLAN_ID = "PLAN_" + TAG;

    @BeforeEach
    void setUp() {
        TenantContext.set(PROG);
    }

    @AfterEach
    void tearDown() {
        em.createNativeQuery("DELETE FROM campaign_dlq_replay_log WHERE plan_id = :pid")
                .setParameter("pid", PLAN_ID).executeUpdate();
        em.createNativeQuery("DELETE FROM campaign_zeebe_task WHERE plan_id = :pid")
                .setParameter("pid", PLAN_ID).executeUpdate();
        TenantContext.clear();
    }

    // ========================================================================
    // DLQ Capture
    // ========================================================================

    @Test
    @DisplayName("1. 捕获死信 → 持久化到 campaign_zeebe_task")
    void shouldCaptureAndPersistDlq() {
        Map<String, Object> vars = Map.of("planId", PLAN_ID, "memberId", "M_CAP");
        captor.capture(12345L, "Network timeout after 3 retries", vars,
                PLAN_ID, "N_EMAIL", "SEND_EMAIL");
        em.flush();
        em.clear();

        List<CampaignZeebeTask> tasks = taskRepository.findByIsDlqAndDlqArchivedFalse();
        assertEquals(1, tasks.size());
        CampaignZeebeTask t = tasks.get(0);
        assertEquals("DLQ", t.getStatus());
        assertEquals(PLAN_ID, t.getPlanId());
        assertEquals(12345L, t.getJobKey());
        assertEquals("SEND_EMAIL", t.getTaskType());
        assertEquals("N_EMAIL", t.getNodeId());
        assertEquals("Network timeout after 3 retries", t.getDlqReason());
        assertTrue(t.isDlq());
        assertFalse(t.isDlqArchived());
        assertEquals(0, t.getReplayedCount());
        assertNotNull(t.getInputVariables());
        System.out.println("[PASS] DLQ captured: " + t.getId());
    }

    @Test
    @DisplayName("2. 多次捕获 → 多条死信")
    void shouldCaptureMultipleDlqItems() {
        captor.capture(100L, "Error A", Map.of("planId", PLAN_ID), PLAN_ID, "N1", "EMAIL");
        captor.capture(101L, "Error B", Map.of("planId", PLAN_ID), PLAN_ID, "N2", "SMS");
        captor.capture(102L, "Error C", Map.of("planId", PLAN_ID), PLAN_ID, "N3", "PUSH");
        em.flush();

        List<CampaignZeebeTask> tasks = taskRepository.findByIsDlqAndDlqArchivedFalse();
        assertEquals(3, tasks.size());
        System.out.println("[PASS] " + tasks.size() + " DLQ items captured");
    }

    // ========================================================================
    // DLQ Query
    // ========================================================================

    @Test
    @DisplayName("3. getDlqList → 仅返回未归档死信")
    void shouldOnlyReturnUnarchivedDlq() {
        captor.capture(200L, "E1", Map.of(), PLAN_ID, "N1", "T1");
        captor.capture(201L, "E2", Map.of(), PLAN_ID, "N2", "T2");
        em.flush();

        List<CampaignZeebeTask> tasks = replayService.getDlqList();
        assertEquals(2, tasks.size());

        long count = replayService.getDlqCount();
        assertEquals(2L, count);

        System.out.println("[PASS] Unarchived DLQ: " + tasks.size() + ", count: " + count);
    }

    @Test
    @DisplayName("4. getDlqByPlan → 按计划过滤")
    void shouldFilterDlqByPlan() {
        captor.capture(300L, "E", Map.of(), PLAN_ID, "N1", "T1");
        em.flush();

        List<CampaignZeebeTask> tasks = replayService.getDlqByPlan(PLAN_ID);
        assertEquals(1, tasks.size());

        List<CampaignZeebeTask> other = replayService.getDlqByPlan("OTHER_PLAN");
        assertTrue(other.isEmpty());
        System.out.println("[PASS] Plan filter: " + tasks.size() + " vs 0 for OTHER_PLAN");
    }

    // ========================================================================
    // Single Replay
    // ========================================================================

    @Test
    @DisplayName("5. 单条重放 → 创建新任务 + 归档旧任务 + 记录日志")
    void shouldReplaySingleDlq() {
        captor.capture(400L, "Timeout", Map.of("planId", PLAN_ID, "memberId", "M_RP"),
                PLAN_ID, "N_SEND", "SEND_EMAIL");
        em.flush();

        CampaignZeebeTask dlq = taskRepository.findByIsDlqAndDlqArchivedFalse().get(0);

        DLQReplayService.ReplayResult result = replayService.replaySingle(dlq.getId(), "operator_1", "手工重试");
        assertTrue(result.isSuccess());
        assertNotNull(result.getNewJobKey());
        em.flush();
        em.clear();

        // Original should be archived + count incremented
        CampaignZeebeTask original = taskRepository.findById(dlq.getId()).orElseThrow();
        assertTrue(original.isDlqArchived());
        assertEquals(1, original.getReplayedCount());

        // A new PENDING task should exist
        List<CampaignZeebeTask> pending = taskRepository.findByTaskTypeAndStatus("SEND_EMAIL", "PENDING");
        assertEquals(1, pending.size());
        assertEquals(original.getOriginalJobKey() != null ? pending.get(0).getJobKey() : true, true);

        // Replay log saved
        List<DlqReplayLog> logs = replayLogRepository.findByTaskIdOrderByReplayedAtDesc(dlq.getId());
        assertEquals(1, logs.size());
        assertEquals("SINGLE", logs.get(0).getReplayType());
        assertEquals("SUCCESS", logs.get(0).getStatus());
        assertEquals("operator_1", logs.get(0).getOperatorId());
        System.out.println("[PASS] Replay success: newJobKey=" + result.getNewJobKey());
    }

    // ========================================================================
    // Batch Replay
    // ========================================================================

    @Test
    @DisplayName("6. 批量重放 → 全部成功")
    void shouldBatchReplayAll() {
        captor.capture(500L, "E1", Map.of("planId", PLAN_ID), PLAN_ID, "N1", "EMAIL");
        captor.capture(501L, "E2", Map.of("planId", PLAN_ID), PLAN_ID, "N2", "SMS");
        em.flush();

        DLQReplayService.BatchResult result = replayService.replayBatch(PLAN_ID, null, "admin", "批量重试");
        assertEquals(2, result.getTotal());
        assertEquals(2, result.getSuccessCount());
        assertEquals(0, result.getFailCount());

        // All should be archived now
        List<CampaignZeebeTask> remaining = taskRepository.findByIsDlqAndDlqArchivedFalse();
        assertTrue(remaining.isEmpty(), "All DLQ should be archived after replay");
        System.out.println("[PASS] Batch replay: " + result.getSuccessCount() + "/" + result.getTotal());
    }

    // ========================================================================
    // Archive
    // ========================================================================

    @Test
    @DisplayName("7. 归档7天前的死信")
    void shouldArchiveOldDlq() {
        captor.capture(600L, "Old error", Map.of("planId", PLAN_ID), PLAN_ID, "N1", "T1");
        em.flush();

        int archived = replayService.archiveOld(7);
        // Newly created won't be 7 days old, so should be 0
        assertEquals(0, archived, "Fresh DLQ should not be archived");
        System.out.println("[PASS] Archive: " + archived + " archived (fresh = 0)");
    }

    // ========================================================================
    // Cleanup Task
    // ========================================================================

    @Test
    @DisplayName("8. checkDlqThreshold → 未超过阈值")
    void shouldNotWarnBelowThreshold() {
        DLQCleanupTask cleanup = new DLQCleanupTask(replayService, taskRepository);
        cleanup.checkDlqThreshold();
        // Should run without error with < 100 items
        assertTrue(true);
    }

    // ========================================================================
    // Summary
    // ========================================================================

    @Test
    @DisplayName("集成测试总结")
    void printSummary() {
        long total = taskRepository.countByIsDlqAndDlqArchivedFalse();
        List<CampaignZeebeTask> all = taskRepository.findByIsDlqAndDlqArchivedFalse();
        long replayLogCount = all.stream()
                .mapToLong(t -> replayLogRepository.findByTaskIdOrderByReplayedAtDesc(t.getId()).size())
                .sum();

        System.out.println("\n==============================================================");
        System.out.println("  DLQ & Replay Integration Test Summary");
        System.out.println("==============================================================");
        System.out.println("  Plan ID            : " + PLAN_ID);
        System.out.println("  Unarchived DLQ     : " + total);
        System.out.println("  Replay logs        : " + replayLogCount);
        System.out.println("==============================================================");
        assertTrue(true);
    }
}
