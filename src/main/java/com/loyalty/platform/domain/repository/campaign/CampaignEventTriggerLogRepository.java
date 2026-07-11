package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.CampaignEventTriggerLog;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 事件触发日志 Repository。
 */
@Repository
public interface CampaignEventTriggerLogRepository extends CampaignBaseRepository<CampaignEventTriggerLog, String> {

    /** 按计划ID查询触发日志（最近优先） */
    List<CampaignEventTriggerLog> findByPlanIdOrderByTriggerTimeDesc(String planId);

    /** 按触发器ID查询 */
    List<CampaignEventTriggerLog> findByTriggerIdOrderByTriggerTimeDesc(String triggerId);

    /** 按会员ID查询 */
    List<CampaignEventTriggerLog> findByMemberIdOrderByTriggerTimeDesc(String memberId);

    /** 查询指定去重key在最近windowMinutes分钟内是否有记录 */
    boolean existsByDedupKey(String dedupKey);
}
