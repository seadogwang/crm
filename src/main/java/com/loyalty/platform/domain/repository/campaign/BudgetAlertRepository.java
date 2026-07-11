package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.BudgetAlert;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface BudgetAlertRepository extends CampaignBaseRepository<BudgetAlert, String> {

    List<BudgetAlert> findByPlanIdOrderByTriggeredAtDesc(String planId);

    List<BudgetAlert> findByPlanIdAndStatus(String planId, String status);

    boolean existsByPlanIdAndAlertTypeAndTriggeredAtAfter(String planId, String alertType, Instant after);
}
