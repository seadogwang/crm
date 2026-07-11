package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.ExperimentVariant;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ExperimentVariantRepository extends CampaignBaseRepository<ExperimentVariant, String> {

    List<ExperimentVariant> findByExperimentId(String experimentId);

    List<ExperimentVariant> findByExperimentIdOrderByVariantCodeAsc(String experimentId);

    @Modifying
    @Query("UPDATE ExperimentVariant v SET v.exposureCount = v.exposureCount + 1 WHERE v.id = :id")
    void incrementExposureCount(@Param("id") String id);

    @Modifying
    @Query("UPDATE ExperimentVariant v SET v.eventCount = v.eventCount + 1 WHERE v.id = :id")
    void incrementEventCount(@Param("id") String id);
}
