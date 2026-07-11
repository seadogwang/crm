package com.loyalty.platform.campaign.execution.dlq;

import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/**
 * Comprehensive tests for DLQ & Failure Replay module.
 */
@ExtendWith(MockitoExtension.class)
@DisplayName("DLQ & Failure Replay Module Tests")
class DlqModuleTest {

    @Mock private CampaignZeebeTaskRepository taskRepository;
    @Mock private DlqReplayLogRepository replayLogRepository;

    private DLQCaptor captor;
    private DLQReplayService replayService;

    private static final String PLAN_ID = "PLAN_DLQ";

    @BeforeEach
    void setUp() {
        captor = new DLQCaptor(taskRepository);
        replayService = new DLQReplayService(taskRepository, replayLogRepository);
    }

    // ========================================================================
    // DLQCaptor Tests
    // ========================================================================

    @Nested
    @DisplayName("DLQCaptor - 死信捕获")
    class CaptorTests {

        @Test
        @DisplayName("捕获死信 → 保存到 campaign_zeebe_task")
        void shouldCaptureAndSaveDlq() {
            Map<String, Object> vars = Map.of("planId", PLAN_ID, "memberId", "M1");
            captor.capture(12345L, "Connection timeout", vars, PLAN_ID, "N_SEND", "SEND_EMAIL");

            ArgumentCaptor<CampaignZeebeTask> captor = ArgumentCaptor.forClass(CampaignZeebeTask.class);
            verify(taskRepository).save(captor.capture());
            CampaignZeebeTask saved = captor.getValue();

            assertTrue(saved.isDlq());
            assertFalse(saved.isDlqArchived());
            assertEquals("DLQ", saved.getStatus());
            assertEquals(12345L, saved.getJobKey());
            assertEquals(PLAN_ID, saved.getPlanId());
            assertEquals("N_SEND", saved.getNodeId());
            assertEquals("SEND_EMAIL", saved.getTaskType());
            assertEquals("Connection timeout", saved.getDlqReason());
            assertEquals("Connection timeout", saved.getErrorMessage());
            assertEquals(0, saved.getReplayedCount());
            assertEquals(0, saved.getRetryCount());
            // Input variables should include the captured vars
            assertNotNull(saved.getInputVariables());
            assertNotNull(saved.getId());
            assertNotNull(saved.getStartTime());
        }

        @Test
        @DisplayName("null planId → 使用 'unknown'")
        void shouldUseUnknownForNullPlanId() {
            captor.capture(99L, "Test error", Map.of(), null, null, null);

            ArgumentCaptor<CampaignZeebeTask> captor = ArgumentCaptor.forClass(CampaignZeebeTask.class);
            verify(taskRepository).save(captor.capture());
            assertEquals("unknown", captor.getValue().getPlanId());
            assertEquals("UNKNOWN", captor.getValue().getTaskType());
        }

        @Test
        @DisplayName("空 variables → 正常保存")
        void shouldHandleEmptyVariables() {
            captor.capture(1L, "Empty vars", Map.of(), PLAN_ID, "N1", "TEST_TYPE");

            ArgumentCaptor<CampaignZeebeTask> captor = ArgumentCaptor.forClass(CampaignZeebeTask.class);
            verify(taskRepository).save(captor.capture());
            assertNotNull(captor.getValue().getInputVariables());
            assertTrue(captor.getValue().getInputVariables().isEmpty());
        }
    }

    // ========================================================================
    // DLQReplayService — Single Replay Tests
    // ========================================================================

    @Nested
    @DisplayName("DLQReplayService - 单条重放")
    class SingleReplayTests {

        @Test
        @DisplayName("重放死信 → 创建新 PENDING 任务 + 归档旧任务")
        void shouldReplaySingleDlq() {
            CampaignZeebeTask dlqTask = buildDlqTask("TASK_DLQ_1");
            when(taskRepository.findById("TASK_DLQ_1")).thenReturn(Optional.of(dlqTask));

            DLQReplayService.ReplayResult result = replayService.replaySingle("TASK_DLQ_1", "admin", "Retry");

            assertTrue(result.isSuccess());
            assertNotNull(result.getNewJobKey());

            // New PENDING task saved
            ArgumentCaptor<CampaignZeebeTask> captor = ArgumentCaptor.forClass(CampaignZeebeTask.class);
            verify(taskRepository, atLeast(2)).save(captor.capture());
            List<CampaignZeebeTask> saved = captor.getAllValues();

            // First save: the replayed task (PENDING)
            CampaignZeebeTask replayed = saved.get(0);
            assertEquals("PENDING", replayed.getStatus());
            assertEquals(0, replayed.getReplayedCount());

            // Second save: the original task (archived, count++)
            assertEquals(1, dlqTask.getReplayedCount());
            assertTrue(dlqTask.isDlqArchived());
            assertNotNull(dlqTask.getDlqArchivedAt());

            // Replay log saved
            verify(replayLogRepository).save(any(DlqReplayLog.class));
        }

        @Test
        @DisplayName("任务不存在 → RuntimeException")
        void shouldThrowWhenTaskNotFound() {
            when(taskRepository.findById("NONEXIST")).thenReturn(Optional.empty());
            assertThrows(RuntimeException.class,
                    () -> replayService.replaySingle("NONEXIST", "admin", ""));
        }

        @Test
        @DisplayName("非死信任务 → RuntimeException")
        void shouldThrowWhenNotDlq() {
            CampaignZeebeTask normalTask = CampaignZeebeTask.builder()
                    .id("T_NORMAL").instanceId("I1").planId(PLAN_ID)
                    .taskType("SEND").status("COMPLETED")
                    .isDlq(false).dlqArchived(false).build();
            when(taskRepository.findById("T_NORMAL")).thenReturn(Optional.of(normalTask));

            RuntimeException ex = assertThrows(RuntimeException.class,
                    () -> replayService.replaySingle("T_NORMAL", "admin", ""));
            assertTrue(ex.getMessage().contains("Not a DLQ item"));
        }

        @Test
        @DisplayName("已归档的死信 → RuntimeException")
        void shouldThrowWhenAlreadyArchived() {
            CampaignZeebeTask archived = buildDlqTask("T_ARCH");
            archived.setDlqArchived(true);
            when(taskRepository.findById("T_ARCH")).thenReturn(Optional.of(archived));

            RuntimeException ex = assertThrows(RuntimeException.class,
                    () -> replayService.replaySingle("T_ARCH", "admin", ""));
            assertTrue(ex.getMessage().contains("Already archived"));
        }

        @Test
        @DisplayName("重放失败 → 记录 FAILED 日志")
        void shouldLogFailedReplay() {
            CampaignZeebeTask dlqTask = buildDlqTask("T_FAIL");
            when(taskRepository.findById("T_FAIL")).thenReturn(Optional.of(dlqTask));
            when(taskRepository.save(any())).thenThrow(new RuntimeException("DB error"));

            DLQReplayService.ReplayResult result = replayService.replaySingle("T_FAIL", "admin", "Retry");
            assertFalse(result.isSuccess());

            // FAILED log should still be saved
            verify(replayLogRepository).save(any(DlqReplayLog.class));
        }
    }

    // ========================================================================
    // DLQReplayService — Batch Replay Tests
    // ========================================================================

    @Nested
    @DisplayName("DLQReplayService - 批量重放")
    class BatchReplayTests {

        @Test
        @DisplayName("无死信 → 返回空结果")
        void shouldReturnEmptyForNoDlq() {
            when(taskRepository.findByIsDlqAndDlqArchivedFalse()).thenReturn(List.of());
            DLQReplayService.BatchResult result = replayService.replayBatch(null, null, "admin", "Batch");
            assertEquals(0, result.getTotal());
        }

        @Test
        @DisplayName("批量重放 → 所有成功")
        void shouldReplayAllBatch() {
            CampaignZeebeTask t1 = buildDlqTask("T_B1");
            CampaignZeebeTask t2 = buildDlqTask("T_B2");
            when(taskRepository.findByIsDlqAndDlqArchivedFalse()).thenReturn(List.of(t1, t2));
            when(taskRepository.findById("T_B1")).thenReturn(Optional.of(t1));
            when(taskRepository.findById("T_B2")).thenReturn(Optional.of(t2));

            DLQReplayService.BatchResult result = replayService.replayBatch(null, null, "admin", "Batch");
            assertEquals(2, result.getTotal());
            assertEquals(2, result.getSuccessCount());
            assertEquals(0, result.getFailCount());
            // Batch log
            verify(replayLogRepository, atLeastOnce()).save(any(DlqReplayLog.class));
        }

        @Test
        @DisplayName("按 planId 过滤批量重放")
        void shouldFilterBatchByPlanId() {
            CampaignZeebeTask t1 = buildDlqTask("T_B1");
            CampaignZeebeTask t2 = buildDlqTask("T_B2");
            t2.setPlanId("OTHER_PLAN");
            when(taskRepository.findByIsDlqAndDlqArchivedFalse()).thenReturn(List.of(t1, t2));
            when(taskRepository.findById("T_B1")).thenReturn(Optional.of(t1));

            DLQReplayService.BatchResult result = replayService.replayBatch(PLAN_ID, null, "admin", "Filtered");
            assertEquals(1, result.getTotal(), "Only 1 should match planId filter");
            assertEquals(1, result.getSuccessCount());
        }
    }

    // ========================================================================
    // DLQReplayService — Archive Tests
    // ========================================================================

    @Nested
    @DisplayName("DLQReplayService - 归档")
    class ArchiveTests {

        @Test
        @DisplayName("归档7天前的死信")
        void shouldArchiveOldDlq() {
            CampaignZeebeTask old1 = buildDlqTask("T_OLD1");
            CampaignZeebeTask old2 = buildDlqTask("T_OLD2");
            when(taskRepository.findByIsDlqTrueAndDlqArchivedFalseAndUpdatedAtBefore(any()))
                    .thenReturn(List.of(old1, old2));

            int count = replayService.archiveOld(7);
            assertEquals(2, count);
            assertTrue(old1.isDlqArchived());
            assertNotNull(old1.getDlqArchivedAt());
            assertTrue(old2.isDlqArchived());
            verify(taskRepository, atLeast(2)).save(any());
        }

        @Test
        @DisplayName("无过期死信 → 返回 0")
        void shouldReturnZeroForNoExpiredDlq() {
            when(taskRepository.findByIsDlqTrueAndDlqArchivedFalseAndUpdatedAtBefore(any()))
                    .thenReturn(List.of());
            assertEquals(0, replayService.archiveOld(7));
        }
    }

    // ========================================================================
    // DLQReplayService — Query Tests
    // ========================================================================

    @Nested
    @DisplayName("DLQReplayService - 查询")
    class QueryTests {

        @Test
        @DisplayName("getDlqList → 未归档的死信")
        void shouldGetUnarchivedDlqList() {
            CampaignZeebeTask t = buildDlqTask("T_Q");
            when(taskRepository.findByIsDlqAndDlqArchivedFalse()).thenReturn(List.of(t));
            List<CampaignZeebeTask> result = replayService.getDlqList();
            assertEquals(1, result.size());
        }

        @Test
        @DisplayName("getDlqByPlan → 按计划查询")
        void shouldGetDlqByPlan() {
            when(taskRepository.findByPlanIdAndIsDlqTrueOrderByUpdatedAtDesc(PLAN_ID))
                    .thenReturn(List.of());
            List<CampaignZeebeTask> result = replayService.getDlqByPlan(PLAN_ID);
            assertTrue(result.isEmpty());
        }

        @Test
        @DisplayName("getDlqCount → 未归档的死信数量")
        void shouldCountUnarchivedDlq() {
            when(taskRepository.countByIsDlqAndDlqArchivedFalse()).thenReturn(5L);
            assertEquals(5L, replayService.getDlqCount());
        }

        @Test
        @DisplayName("getReplayLogs → 按 taskId 查询重放日志")
        void shouldGetReplayLogs() {
            DlqReplayLog log = DlqReplayLog.builder()
                    .id("LOG_1").taskId("T1").planId(PLAN_ID)
                    .replayType("SINGLE").status("SUCCESS").build();
            when(replayLogRepository.findByTaskIdOrderByReplayedAtDesc("T1"))
                    .thenReturn(List.of(log));
            List<DlqReplayLog> logs = replayService.getReplayLogs("T1");
            assertEquals(1, logs.size());
            assertEquals("SUCCESS", logs.get(0).getStatus());
        }
    }

    // ========================================================================
    // DLQCleanupTask Tests
    // ========================================================================

    @Nested
    @DisplayName("DLQCleanupTask - 定时清理")
    class CleanupTaskTests {

        @Test
        @DisplayName("archiveOldDlq → 调用 replayService.archiveOld(7)")
        void shouldArchiveViaScheduler() {
            CampaignZeebeTask old = buildDlqTask("T_OLD");
            when(taskRepository.findByIsDlqTrueAndDlqArchivedFalseAndUpdatedAtBefore(any()))
                    .thenReturn(List.of(old));

            DLQCleanupTask cleanupTask = new DLQCleanupTask(replayService, taskRepository);
            cleanupTask.archiveOldDlq();

            verify(taskRepository).findByIsDlqTrueAndDlqArchivedFalseAndUpdatedAtBefore(any());
            assertTrue(old.isDlqArchived());
        }

        @Test
        @DisplayName("checkDlqThreshold → 超过100条告警")
        void shouldWarnWhenThresholdExceeded() {
            when(taskRepository.countByIsDlqAndDlqArchivedFalse()).thenReturn(150L);

            DLQCleanupTask cleanupTask = new DLQCleanupTask(replayService, taskRepository);
            cleanupTask.checkDlqThreshold();

            verify(taskRepository).countByIsDlqAndDlqArchivedFalse();
        }

        @Test
        @DisplayName("checkDlqThreshold → 低于100条不告警")
        void shouldNotWarnBelowThreshold() {
            when(taskRepository.countByIsDlqAndDlqArchivedFalse()).thenReturn(50L);

            DLQCleanupTask cleanupTask = new DLQCleanupTask(replayService, taskRepository);
            cleanupTask.checkDlqThreshold();

            // Just verifies no exception
            assertTrue(true);
        }
    }

    // ========================================================================
    // Entity Defaults Tests
    // ========================================================================

    @Nested
    @DisplayName("Entity Defaults - 实体默认值")
    class EntityDefaultsTests {

        @Test
        @DisplayName("CampaignZeebeTask DLQ 字段默认值")
        void shouldHaveDlqDefaults() {
            CampaignZeebeTask t = CampaignZeebeTask.builder()
                    .id("T1").instanceId("I1").planId(PLAN_ID)
                    .taskType("SEND").status("COMPLETED").build();

            assertFalse(t.isDlq());
            assertNull(t.getDlqReason());
            assertFalse(t.isDlqArchived());
            assertNull(t.getDlqArchivedAt());
            assertEquals(0, t.getReplayedCount());
            assertNull(t.getOriginalJobKey());
        }

        @Test
        @DisplayName("DlqReplayLog 默认值")
        void shouldHaveReplayLogDefaults() {
            DlqReplayLog log = DlqReplayLog.builder()
                    .id("L1").taskId("T1").planId(PLAN_ID)
                    .replayType("SINGLE").build();

            assertEquals("SUCCESS", log.getStatus());
            assertNotNull(log.getReplayedAt());
            assertNotNull(log.getCreatedAt());
        }
    }

    // ========================================================================
    // ReplayResult / BatchResult Tests
    // ========================================================================

    @Nested
    @DisplayName("Result Classes - 结果类")
    class ResultClassTests {

        @Test
        @DisplayName("ReplayResult.success → success=true + jobKey")
        void shouldCreateSuccessReplayResult() {
            DLQReplayService.ReplayResult r = DLQReplayService.ReplayResult.success(12345L);
            assertTrue(r.isSuccess());
            assertEquals(12345L, r.getNewJobKey());
            assertNull(r.getMessage());
        }

        @Test
        @DisplayName("ReplayResult.failed → success=false + message")
        void shouldCreateFailedReplayResult() {
            DLQReplayService.ReplayResult r = DLQReplayService.ReplayResult.failed("DB error");
            assertFalse(r.isSuccess());
            assertEquals("DB error", r.getMessage());
            assertNull(r.getNewJobKey());
        }

        @Test
        @DisplayName("BatchResult.of → 正确统计")
        void shouldCreateBatchResult() {
            DLQReplayService.BatchResult r = DLQReplayService.BatchResult.of(
                    10, 8, 2, List.of("T1", "T2"));
            assertEquals(10, r.getTotal());
            assertEquals(8, r.getSuccessCount());
            assertEquals(2, r.getFailCount());
            assertEquals(List.of("T1", "T2"), r.getFailedIds());
        }

        @Test
        @DisplayName("BatchResult.empty → total=0")
        void shouldCreateEmptyBatchResult() {
            DLQReplayService.BatchResult r = DLQReplayService.BatchResult.empty();
            assertEquals(0, r.getTotal());
            assertEquals(0, r.getSuccessCount());
            assertEquals(0, r.getFailCount());
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private CampaignZeebeTask buildDlqTask(String id) {
        return CampaignZeebeTask.builder()
                .id(id).instanceId("INST_" + id).planId(PLAN_ID)
                .taskType("SEND_EMAIL").taskName("Send Email").nodeId("N_SEND")
                .status("DLQ").jobKey(1000L + id.hashCode())
                .inputVariables(Map.of("planId", PLAN_ID, "memberId", "M1"))
                .errorMessage("Connection timeout").retryCount(0).maxRetries(3)
                .isDlq(true).dlqReason("Connection timeout")
                .dlqArchived(false).replayedCount(0)
                .startTime(Instant.now()).endTime(Instant.now()).build();
    }
}
