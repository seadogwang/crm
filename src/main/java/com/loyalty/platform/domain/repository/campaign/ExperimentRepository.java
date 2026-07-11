package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.Experiment;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExperimentRepository extends CampaignBaseRepository<Experiment, String> {

    List<Experiment> findByPlanId(String planId);

    List<Experiment> findByWorkspaceId(String workspaceId);

    List<Experiment> findByStatus(String status);

    List<Experiment> findByWorkspaceIdAndStatus(String workspaceId, String status);
}
