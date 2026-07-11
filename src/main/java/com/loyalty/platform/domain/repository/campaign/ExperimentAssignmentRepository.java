package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.ExperimentAssignment;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface ExperimentAssignmentRepository extends CampaignBaseRepository<ExperimentAssignment, String> {

    Optional<ExperimentAssignment> findByExperimentIdAndMemberId(String experimentId, String memberId);

    List<ExperimentAssignment> findByExperimentId(String experimentId);

    List<ExperimentAssignment> findByExperimentIdAndVariantId(String experimentId, String variantId);

    long countByExperimentId(String experimentId);
}
