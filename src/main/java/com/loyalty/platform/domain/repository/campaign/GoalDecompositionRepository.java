package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.GoalDecomposition;
import org.springframework.stereotype.Repository;
import java.util.Optional;

@Repository
public interface GoalDecompositionRepository extends CampaignBaseRepository<GoalDecomposition, String> {
    Optional<GoalDecomposition> findTopByGoalIdOrderByCreatedAtDesc(String goalId);
}
