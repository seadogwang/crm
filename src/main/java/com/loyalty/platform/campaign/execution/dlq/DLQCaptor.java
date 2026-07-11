package com.loyalty.platform.campaign.execution.dlq;

import com.loyalty.platform.domain.entity.campaign.CampaignZeebeTask;
import com.loyalty.platform.domain.repository.campaign.CampaignZeebeTaskRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * 死信捕获器 — Worker 异常处理中调用，当重试耗尽时将作业存入死信。
 */
@Service
@Transactional
public class DLQCaptor {

    private static final Logger log = LoggerFactory.getLogger(DLQCaptor.class);

    private final CampaignZeebeTaskRepository taskRepository;

    public DLQCaptor(CampaignZeebeTaskRepository taskRepository) {
        this.taskRepository = taskRepository;
    }

    /**
     * 捕获死信。
     *
     * @param jobKey     Zeebe Job Key
     * @param error      错误信息
     * @param variables  作业变量
     * @param planId     计划ID
     * @param nodeId     节点ID
     * @param taskType   任务类型
     */
    public void capture(long jobKey, String error, Map<String, Object> variables,
                        String planId, String nodeId, String taskType) {
        log.warn("Capturing DLQ: planId={}, nodeId={}, jobKey={}, error={}",
                planId, nodeId, jobKey, error);

        CampaignZeebeTask task = CampaignZeebeTask.builder()
                .id(UUID.randomUUID().toString())
                .instanceId(planId != null ? planId : "unknown")
                .planId(planId != null ? planId : "unknown")
                .jobKey(jobKey)
                .taskType(taskType != null ? taskType : "UNKNOWN")
                .taskName(taskType)
                .nodeId(nodeId)
                .status("DLQ")
                .inputVariables(variables)
                .errorMessage(error)
                .retryCount(0)
                .maxRetries(3)
                .startTime(Instant.now())
                .endTime(Instant.now())
                .isDlq(true)
                .dlqReason(error)
                .dlqArchived(false)
                .replayedCount(0)
                .build();

        taskRepository.save(task);
        log.info("DLQ captured: taskId={}, planId={}, jobKey={}", task.getId(), planId, jobKey);
    }
}
