package com.loyalty.platform.campaign.execution.dlq;

import com.loyalty.platform.domain.entity.campaign.CampaignZeebeTask;
import com.loyalty.platform.domain.entity.campaign.DlqReplayLog;
import com.loyalty.platform.domain.repository.campaign.CampaignZeebeTaskRepository;
import com.loyalty.platform.domain.repository.campaign.DlqReplayLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@Transactional
public class DLQReplayService {

    private static final Logger log = LoggerFactory.getLogger(DLQReplayService.class);

    private final CampaignZeebeTaskRepository taskRepository;
    private final DlqReplayLogRepository replayLogRepository;

    public DLQReplayService(CampaignZeebeTaskRepository taskRepository,
                             DlqReplayLogRepository replayLogRepository) {
        this.taskRepository = taskRepository;
        this.replayLogRepository = replayLogRepository;
    }

    /** 单条重放 */
    public ReplayResult replaySingle(String taskId, String operatorId, String reason) {
        CampaignZeebeTask task = taskRepository.findById(taskId)
                .orElseThrow(() -> new RuntimeException("Task not found: " + taskId));
        if (!task.isDlq()) throw new RuntimeException("Not a DLQ item: " + taskId);
        if (task.isDlqArchived()) throw new RuntimeException("Already archived: " + taskId);

        log.info("Replaying DLQ: taskId={}, planId={}", taskId, task.getPlanId());

        try {
            // Re-insert as a fresh task for re-execution
            CampaignZeebeTask replayed = CampaignZeebeTask.builder()
                    .id(UUID.randomUUID().toString())
                    .instanceId(task.getInstanceId())
                    .planId(task.getPlanId())
                    .jobKey(System.currentTimeMillis())
                    .taskType(task.getTaskType())
                    .taskName(task.getTaskName())
                    .nodeId(task.getNodeId())
                    .status("PENDING")
                    .inputVariables(task.getInputVariables())
                    .retryCount(0)
                    .maxRetries(3)
                    .startTime(Instant.now())
                    .originalJobKey(task.getJobKey())
                    .build();
            taskRepository.save(replayed);

            task.setReplayedCount(task.getReplayedCount() + 1);
            task.setDlqArchived(true);
            task.setDlqArchivedAt(Instant.now());
            taskRepository.save(task);

            DlqReplayLog replayLog = DlqReplayLog.builder()
                    .id(UUID.randomUUID().toString())
                    .taskId(taskId).planId(task.getPlanId())
                    .replayType("SINGLE").status("SUCCESS")
                    .newJobKey(replayed.getJobKey())
                    .operatorId(operatorId).reason(reason).build();
            replayLogRepository.save(replayLog);

            return ReplayResult.success(replayed.getJobKey());
        } catch (Exception e) {
            DlqReplayLog failLog = DlqReplayLog.builder()
                    .id(UUID.randomUUID().toString())
                    .taskId(taskId).planId(task.getPlanId())
                    .replayType("SINGLE").status("FAILED")
                    .operatorId(operatorId).reason(e.getMessage()).build();
            replayLogRepository.save(failLog);
            return ReplayResult.failed(e.getMessage());
        }
    }

    /** 批量重放 */
    public BatchResult replayBatch(String planId, String nodeType, String operatorId, String reason) {
        List<CampaignZeebeTask> tasks = taskRepository.findByIsDlqAndDlqArchivedFalse();
        if (planId != null) tasks = tasks.stream().filter(t -> planId.equals(t.getPlanId())).toList();
        if (nodeType != null) tasks = tasks.stream().filter(t -> nodeType.equals(t.getTaskType())).toList();
        if (tasks.isEmpty()) return BatchResult.empty();

        int ok = 0, fail = 0;
        List<String> failed = new ArrayList<>();
        for (CampaignZeebeTask t : tasks) {
            try { replaySingle(t.getId(), operatorId, reason); ok++; }
            catch (Exception e) { fail++; failed.add(t.getId()); }
        }

        DlqReplayLog batchLog = DlqReplayLog.builder()
                .id(UUID.randomUUID().toString())
                .taskId("BATCH_" + UUID.randomUUID().toString().substring(0, 8))
                .planId(planId != null ? planId : "ALL")
                .replayType("BATCH").status(fail == 0 ? "SUCCESS" : "PARTIAL")
                .operatorId(operatorId).reason(reason).build();
        replayLogRepository.save(batchLog);

        log.info("Batch replay: {}/{} ok, {} failed", ok, tasks.size(), fail);
        return BatchResult.of(tasks.size(), ok, fail, failed);
    }

    /** 归档旧死信 */
    public int archiveOld(int daysOld) {
        Instant threshold = Instant.now().minus(daysOld, ChronoUnit.DAYS);
        List<CampaignZeebeTask> old = taskRepository.findByIsDlqTrueAndDlqArchivedFalseAndUpdatedAtBefore(threshold);
        for (CampaignZeebeTask t : old) {
            t.setDlqArchived(true);
            t.setDlqArchivedAt(Instant.now());
            taskRepository.save(t);
        }
        log.info("Archived {} DLQ items", old.size());
        return old.size();
    }

    public List<CampaignZeebeTask> getDlqList() {
        return taskRepository.findByIsDlqAndDlqArchivedFalse();
    }

    public List<CampaignZeebeTask> getDlqByPlan(String planId) {
        return taskRepository.findByPlanIdAndIsDlqTrueOrderByUpdatedAtDesc(planId);
    }

    public List<DlqReplayLog> getReplayLogs(String taskId) {
        return replayLogRepository.findByTaskIdOrderByReplayedAtDesc(taskId);
    }

    public long getDlqCount() {
        return taskRepository.countByIsDlqAndDlqArchivedFalse();
    }

    // Result classes
    @lombok.Data @lombok.Builder @lombok.NoArgsConstructor @lombok.AllArgsConstructor
    public static class ReplayResult {
        private boolean success; private String message; private Long newJobKey;
        public static ReplayResult success(Long key) { return ReplayResult.builder().success(true).newJobKey(key).build(); }
        public static ReplayResult failed(String msg) { return ReplayResult.builder().success(false).message(msg).build(); }
    }

    @lombok.Data @lombok.Builder @lombok.NoArgsConstructor @lombok.AllArgsConstructor
    public static class BatchResult {
        private int total, successCount, failCount; private List<String> failedIds;
        public static BatchResult empty() { return BatchResult.builder().total(0).build(); }
        public static BatchResult of(int t, int s, int f, List<String> ids) {
            return BatchResult.builder().total(t).successCount(s).failCount(f).failedIds(ids).build();
        }
    }
}
