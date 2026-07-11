package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.ExperimentLearning;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExperimentLearningRepository extends CampaignBaseRepository<ExperimentLearning, String> {

    List<ExperimentLearning> findByExperimentId(String experimentId);

    List<ExperimentLearning> findByPlanId(String planId);

    List<ExperimentLearning> findByWorkspaceIdOrderByCreatedAtDesc(String workspaceId);
}
