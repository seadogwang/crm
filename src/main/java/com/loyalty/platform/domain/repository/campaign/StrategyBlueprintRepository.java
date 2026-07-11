package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.StrategyBlueprint;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

@Repository
public interface StrategyBlueprintRepository extends CampaignBaseRepository<StrategyBlueprint, String> {
    List<StrategyBlueprint> findByIndustryTypeAndIsActiveTrue(String industryType);
    List<StrategyBlueprint> findByIsActiveTrue();
    Optional<StrategyBlueprint> findByIsSystemDefaultTrueAndIsActiveTrue();
}
