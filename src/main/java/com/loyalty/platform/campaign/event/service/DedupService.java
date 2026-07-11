package com.loyalty.platform.campaign.event.service;

import com.loyalty.platform.domain.entity.campaign.ExecutionDedup;
import com.loyalty.platform.domain.repository.campaign.ExecutionDedupRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

/**
 * 去重服务 — 基于 ExecutionDedup 表实现事件级幂等。
 *
 * <p>双重保障：
 * <ol>
 *   <li>先查 dedup_key 是否已存在（快速路径）</li>
 *   <li>插入时依赖 UNIQUE 约束防止并发竞态（安全路径）</li>
 * </ol>
 *
 * <p>定期清理过期记录，防止表膨胀。
 */
@Service
@Transactional
public class DedupService {

    private static final Logger log = LoggerFactory.getLogger(DedupService.class);

    private final ExecutionDedupRepository dedupRepository;

    public DedupService(ExecutionDedupRepository dedupRepository) {
        this.dedupRepository = dedupRepository;
    }

    /**
     * 检查并标记去重（原子操作）。
     *
     * @param dedupKey      去重键
     * @param planId        计划ID
     * @param nodeId        节点ID（触发器ID）
     * @param userId        用户/会员ID
     * @param channel       渠道
     * @param ttlSeconds    存活时间（秒）
     * @return true: 首次触发（未重复），false: 重复触发（已存在）
     */
    public boolean checkAndMark(String dedupKey, String planId, String nodeId,
                                 String userId, String channel, int ttlSeconds) {
        if (dedupKey == null || dedupKey.isBlank()) {
            return true; // 无去重键，默认允许
        }

        // 1. 快速路径：查询是否已存在
        if (dedupRepository.existsByDedupKey(dedupKey)) {
            log.debug("Dedup hit (fast path): key={}", dedupKey);
            return false;
        }

        // 2. 插入去重记录（依赖 UNIQUE 约束防止竞态）
        ExecutionDedup record = ExecutionDedup.builder()
                .id(UUID.randomUUID().toString())
                .dedupKey(dedupKey)
                .planId(planId)
                .nodeId(nodeId)
                .userId(userId)
                .channel(channel)
                .ttl(Instant.now().plusSeconds(ttlSeconds))
                .build();

        try {
            dedupRepository.save(record);
            log.debug("Dedup record created: key={}", dedupKey);
            return true;
        } catch (DataIntegrityViolationException e) {
            // 竞态：另一个线程已插入
            log.debug("Dedup hit (race resolved): key={}", dedupKey);
            return false;
        }
    }

    /**
     * 定期清理过期去重记录（每小时执行）。
     */
    @Scheduled(fixedDelay = 3600000)
    public void cleanExpired() {
        try {
            int deleted = dedupRepository.deleteExpired(Instant.now());
            if (deleted > 0) {
                log.info("Cleaned {} expired dedup records", deleted);
            }
        } catch (Exception e) {
            log.warn("Failed to clean expired dedup records: {}", e.getMessage());
        }
    }
}
