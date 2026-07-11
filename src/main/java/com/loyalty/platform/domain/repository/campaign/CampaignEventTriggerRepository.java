package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.CampaignEventTrigger;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 事件触发器配置 Repository。
 */
@Repository
public interface CampaignEventTriggerRepository extends CampaignBaseRepository<CampaignEventTrigger, String> {

    /** 按计划ID查询所有触发器 */
    List<CampaignEventTrigger> findByPlanId(String planId);

    /** 按工作区ID查询 */
    List<CampaignEventTrigger> findByWorkspaceId(String workspaceId);

    /** 按事件类型和启用状态查询激活的触发器 */
    @Query("SELECT t FROM CampaignEventTrigger t WHERE t.eventType = :eventType AND t.enabled = true")
    List<CampaignEventTrigger> findActiveByEventType(@Param("eventType") String eventType);

    /** 按计划ID和事件类型查询 */
    Optional<CampaignEventTrigger> findByPlanIdAndEventType(String planId, String eventType);

    /** 统计某工作区下的激活触发器数 */
    long countByWorkspaceIdAndEnabled(String workspaceId, boolean enabled);
}
