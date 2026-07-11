package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.SharingPolicy;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface SharingPolicyRepository extends CampaignBaseRepository<SharingPolicy, String> {
    List<SharingPolicy> findByProgramCodeAndEnabledTrue(String programCode);
    List<SharingPolicy> findByEnabledTrue();
}
