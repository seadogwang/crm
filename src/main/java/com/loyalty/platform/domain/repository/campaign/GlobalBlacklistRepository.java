package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.GlobalBlacklist;
import org.springframework.stereotype.Repository;

@Repository
public interface GlobalBlacklistRepository extends CampaignBaseRepository<GlobalBlacklist, String> {
    boolean existsByMemberIdAndIsActiveTrue(String memberId);
}
