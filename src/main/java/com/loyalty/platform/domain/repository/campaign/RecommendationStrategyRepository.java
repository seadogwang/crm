package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.RecommendationStrategy;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface RecommendationStrategyRepository extends CampaignBaseRepository<RecommendationStrategy, String> {
    List<RecommendationStrategy> findByProgramCodeAndEnabledTrue(String programCode);
    List<RecommendationStrategy> findByStrategyTypeAndEnabledTrue(String strategyType);
    List<RecommendationStrategy> findByProgramCodeAndIsDefaultTrue(String programCode);
}
