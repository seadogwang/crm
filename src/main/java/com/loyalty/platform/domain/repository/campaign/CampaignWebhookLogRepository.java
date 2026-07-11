package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.CampaignWebhookLog;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface CampaignWebhookLogRepository extends CampaignBaseRepository<CampaignWebhookLog, String> {
    List<CampaignWebhookLog> findByProgramCodeOrderByReceivedAtDesc(String programCode);
    List<CampaignWebhookLog> findByTriggerIdOrderByReceivedAtDesc(String triggerId);
    long countByAuthStatus(String authStatus);
}
