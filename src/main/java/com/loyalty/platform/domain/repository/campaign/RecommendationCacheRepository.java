package com.loyalty.platform.domain.repository.campaign;

import com.loyalty.platform.domain.entity.campaign.RecommendationCache;
import org.springframework.stereotype.Repository;
import java.time.Instant;
import java.util.Optional;

@Repository
public interface RecommendationCacheRepository extends CampaignBaseRepository<RecommendationCache, String> {
    Optional<RecommendationCache> findByMemberIdAndStrategyIdAndExpiresAtAfter(String memberId, String strategyId, Instant now);
    boolean existsByMemberIdAndStrategyIdAndExpiresAtAfter(String memberId, String strategyId, Instant now);
}
