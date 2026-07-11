package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.CrossProgramRelation;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface CrossProgramRelationRepository extends CampaignBaseRepository<CrossProgramRelation, String> {
    List<CrossProgramRelation> findByPlanId(String planId);
    List<CrossProgramRelation> findByProgramCode(String programCode);
}
