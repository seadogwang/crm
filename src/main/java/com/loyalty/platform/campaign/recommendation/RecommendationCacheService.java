package com.loyalty.platform.campaign.recommendation;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.domain.entity.campaign.RecommendationCache;
import com.loyalty.platform.domain.entity.campaign.RecommendationStrategy;
import com.loyalty.platform.domain.repository.campaign.RecommendationCacheRepository;
import com.loyalty.platform.domain.repository.campaign.RecommendationStrategyRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;

@Service
@Transactional
public class RecommendationCacheService {

    private static final Logger log = LoggerFactory.getLogger(RecommendationCacheService.class);

    private final RecommendationCacheRepository cacheRepository;
    private final RecommendationStrategyRepository strategyRepository;
    private final SimilarProductsEngine similarProductsEngine;
    private final ObjectMapper objectMapper;

    public RecommendationCacheService(RecommendationCacheRepository cacheRepository,
                                       RecommendationStrategyRepository strategyRepository,
                                       SimilarProductsEngine similarProductsEngine,
                                       ObjectMapper objectMapper) {
        this.cacheRepository = cacheRepository;
        this.strategyRepository = strategyRepository;
        this.similarProductsEngine = similarProductsEngine;
        this.objectMapper = objectMapper;
    }

    /** 获取缓存的推荐结果 */
    @Transactional(readOnly = true)
    public List<RecommendationItem> getCached(String memberId, String strategyId) {
        Optional<RecommendationCache> cached = cacheRepository
                .findByMemberIdAndStrategyIdAndExpiresAtAfter(memberId, strategyId, Instant.now());
        if (cached.isPresent()) {
            try {
                return Arrays.asList(objectMapper.readValue(
                        cached.get().getRecommendationResult(), RecommendationItem[].class));
            } catch (Exception e) {
                log.warn("Failed to parse cache: {}", e.getMessage());
            }
        }
        return null;
    }

    /** 缓存推荐结果 */
    public void cacheResult(String memberId, String strategyId, List<RecommendationItem> items) {
        RecommendationStrategy strategy = strategyRepository.findById(strategyId).orElse(null);
        int ttl = strategy != null && strategy.getCacheTtlSeconds() != null
                ? strategy.getCacheTtlSeconds() : 3600;

        try {
            String json = objectMapper.writeValueAsString(items);
            RecommendationCache cache = RecommendationCache.builder()
                    .id(UUID.randomUUID().toString())
                    .memberId(memberId).strategyId(strategyId)
                    .recommendationResult(json)
                    .cacheKey(memberId + ":" + strategyId)
                    .expiresAt(Instant.now().plus(ttl, ChronoUnit.SECONDS))
                    .build();
            cacheRepository.save(cache);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialize recommendation: {}", e.getMessage());
        }
    }

    /** 获取推荐结果（缓存优先） */
    public List<RecommendationItem> getOrCompute(String memberId, String strategyId, int maxItems) {
        List<RecommendationItem> cached = getCached(memberId, strategyId);
        if (cached != null) return cached;

        Map<String, Object> ctx = Map.of("maxItems", maxItems);
        List<RecommendationItem> items = similarProductsEngine.recommend(memberId, strategyId, ctx);
        if (items != null && !items.isEmpty()) {
            cacheResult(memberId, strategyId, items);
        }
        return items;
    }
}
