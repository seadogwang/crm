package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.BudgetPacing;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface BudgetPacingRepository extends CampaignBaseRepository<BudgetPacing, String> {

    Optional<BudgetPacing> findByPlanId(String planId);

    @Query("SELECT b FROM BudgetPacing b WHERE b.planId = :planId")
    Optional<BudgetPacing> findByPlanIdForUpdate(@Param("planId") String planId);
}
