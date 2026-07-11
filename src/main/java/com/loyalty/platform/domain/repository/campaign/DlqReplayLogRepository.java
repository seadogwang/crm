package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.DlqReplayLog;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface DlqReplayLogRepository extends CampaignBaseRepository<DlqReplayLog, String> {
    List<DlqReplayLog> findByTaskIdOrderByReplayedAtDesc(String taskId);
    List<DlqReplayLog> findByPlanIdOrderByReplayedAtDesc(String planId);
}
