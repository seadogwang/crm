package com.loyalty.platform.campaign.consent;

import com.loyalty.platform.domain.repository.campaign.ConsentChangeLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * 偏好审计日志定期清理任务 — 归档超过2年的记录。
 */
@Component
public class ConsentCleanupTask {

    private static final Logger log = LoggerFactory.getLogger(ConsentCleanupTask.class);

    private final ConsentChangeLogRepository changeLogRepository;

    public ConsentCleanupTask(ConsentChangeLogRepository changeLogRepository) {
        this.changeLogRepository = changeLogRepository;
    }

    /**
     * 每天凌晨3点执行：归档超过2年的审计日志。
     */
    @Scheduled(cron = "0 0 3 * * ?")
    @Transactional
    public void archiveOldLogs() {
        Instant threshold = Instant.now().minus(730, ChronoUnit.DAYS);
        int deleted = changeLogRepository.deleteByCreatedAtBefore(threshold);
        if (deleted > 0) {
            log.info("Archived {} old consent change logs (before {})", deleted, threshold);
        }
    }
}
