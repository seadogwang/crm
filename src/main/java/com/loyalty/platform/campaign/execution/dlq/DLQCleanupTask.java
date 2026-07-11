package com.loyalty.platform.campaign.execution.dlq;

import com.loyalty.platform.domain.repository.campaign.CampaignZeebeTaskRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class DLQCleanupTask {

    private static final Logger log = LoggerFactory.getLogger(DLQCleanupTask.class);

    private final DLQReplayService replayService;
    private final CampaignZeebeTaskRepository taskRepository;

    public DLQCleanupTask(DLQReplayService replayService,
                           CampaignZeebeTaskRepository taskRepository) {
        this.replayService = replayService;
        this.taskRepository = taskRepository;
    }

    /** 每天凌晨3点归档7天前的死信 */
    @Scheduled(cron = "0 0 3 * * ?")
    public void archiveOldDlq() {
        int archived = replayService.archiveOld(7);
        if (archived > 0) log.info("DLQ archived: {} items", archived);
    }

    /** 每小时检查死信堆积 */
    @Scheduled(cron = "0 0 */1 * * ?")
    public void checkDlqThreshold() {
        long count = taskRepository.countByIsDlqAndDlqArchivedFalse();
        if (count > 100) {
            log.warn("DLQ threshold exceeded: {} items", count);
        }
    }
}
