package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.BudgetConsumption;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Repository
public interface BudgetConsumptionRepository extends CampaignBaseRepository<BudgetConsumption, String> {

    List<BudgetConsumption> findByPlanIdOrderByConsumedAtDesc(String planId);

    @Query("SELECT SUM(c.amount) FROM BudgetConsumption c WHERE c.planId = :planId AND CAST(c.consumedAt AS date) = :date")
    BigDecimal sumAmountByPlanIdAndDate(@Param("planId") String planId, @Param("date") LocalDate date);

    @Query("SELECT COUNT(c) FROM BudgetConsumption c WHERE c.planId = :planId AND CAST(c.consumedAt AS date) = :date")
    long countByPlanIdAndDate(@Param("planId") String planId, @Param("date") LocalDate date);
}
