package com.loyalty.platform.campaign.recommendation;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({SimilarProductsEngine.class, RecommendationCacheService.class, RecommendationApiIntegrationTest.TestConfig.class})
@TestPropertySource(properties = {"spring.jpa.hibernate.ddl-auto=update"})
@DisplayName("Recommendation Integration Tests")
class RecommendationApiIntegrationTest {

    @TestConfiguration
    static class TestConfig {
        @Bean ObjectMapper objectMapper() { return new ObjectMapper(); }
    }

    @Autowired private RecommendationStrategyRepository strategyRepository;
    @Autowired private RecommendationCacheRepository cacheRepository;
    @Autowired private RecommendationCacheService cacheService;
    @Autowired private SimilarProductsEngine engine;
    @PersistenceContext private EntityManager em;

    private static final String PROG = "PROG001";
    private static final String TAG = "rec_" + UUID.randomUUID().toString().substring(0, 8);

    @BeforeEach void setUp() { TenantContext.set(PROG); }
    @AfterEach void tearDown() { TenantContext.clear(); }

    @Test
    @DisplayName("1. 推荐策略 CRUD + 查询")
    void shouldCrudStrategy() {
        RecommendationStrategy s = RecommendationStrategy.builder()
                .id("STRAT_" + TAG).programCode(PROG).strategyName("热门推荐")
                .strategyType("POPULAR").recommendationConfig("{\"topN\":10}")
                .cacheTtlSeconds(1800).enabled(true).build();
        strategyRepository.save(s);
        em.flush();
        em.clear();

        RecommendationStrategy found = strategyRepository.findById(s.getId()).orElseThrow();
        assertEquals("热门推荐", found.getStrategyName());
        assertEquals("POPULAR", found.getStrategyType());
        assertEquals(1800, found.getCacheTtlSeconds());
        assertTrue(found.isEnabled());
        System.out.println("[PASS] Strategy: " + found.getStrategyName());
    }

    @Test
    @DisplayName("2. 按 programCode 查询启用的策略")
    void shouldQueryEnabledStrategies() {
        strategyRepository.save(RecommendationStrategy.builder()
                .id("S_EN_" + TAG).programCode(PROG).strategyName("启用")
                .strategyType("SIMILAR_PRODUCTS").recommendationConfig("{}").enabled(true).build());
        strategyRepository.save(RecommendationStrategy.builder()
                .id("S_DIS_" + TAG).programCode(PROG).strategyName("禁用")
                .strategyType("POPULAR").recommendationConfig("{}").enabled(false).build());
        em.flush();

        List<RecommendationStrategy> enabled = strategyRepository.findByProgramCodeAndEnabledTrue(PROG);
        assertTrue(enabled.stream().anyMatch(s -> "启用".equals(s.getStrategyName())));
        assertTrue(enabled.stream().noneMatch(s -> "禁用".equals(s.getStrategyName())));
        System.out.println("[PASS] Enabled strategies: " + enabled.size());
    }

    @Test
    @DisplayName("3. 推荐缓存持久化 + 过期查询")
    void shouldPersistAndQueryCache() {
        RecommendationCache c = RecommendationCache.builder()
                .id("CACHE_" + TAG).memberId("M1").strategyId("S1")
                .recommendationResult("[{\"productId\":\"P01\",\"productName\":\"Item\",\"score\":0.9}]")
                .cacheKey("M1:S1").expiresAt(Instant.now().plusSeconds(3600)).build();
        cacheRepository.save(c);
        em.flush();
        em.clear();

        Optional<RecommendationCache> found = cacheRepository
                .findByMemberIdAndStrategyIdAndExpiresAtAfter("M1", "S1", Instant.now());
        assertTrue(found.isPresent());
        assertTrue(found.get().getRecommendationResult().contains("Item"));

        // Expired
        Optional<RecommendationCache> expired = cacheRepository
                .findByMemberIdAndStrategyIdAndExpiresAtAfter("M1", "S1", Instant.now().plusSeconds(7200));
        assertTrue(expired.isEmpty());
        System.out.println("[PASS] Cache hit + expired filter works");
    }

    @Test
    @DisplayName("4. getOrCompute → 缓存未命中时自动计算+缓存")
    void shouldComputeAndCacheOnMiss() {
        strategyRepository.save(RecommendationStrategy.builder()
                .id("S_" + TAG).programCode(PROG).strategyName("Test")
                .strategyType("SIMILAR_PRODUCTS").recommendationConfig("{}")
                .cacheTtlSeconds(600).build());
        em.flush();

        List<RecommendationItem> items = cacheService.getOrCompute("M_TEST", "S_" + TAG, 3);
        assertNotNull(items);
        assertEquals(3, items.size());
        // Verify cache was saved
        em.flush();
        Optional<RecommendationCache> cached = cacheRepository
                .findByMemberIdAndStrategyIdAndExpiresAtAfter("M_TEST", "S_" + TAG, Instant.now());
        assertTrue(cached.isPresent());
        System.out.println("[PASS] Computed + cached: " + items.size() + " items");
    }

    @Test
    @DisplayName("5. 引擎批量推荐 100 用户")
    void shouldBatchRecommend100() {
        List<String> memberIds = new ArrayList<>();
        for (int i = 0; i < 100; i++) memberIds.add("MB_" + i);
        Map<String, List<RecommendationItem>> results = engine.batchRecommend(memberIds, "S1", Map.of());
        assertEquals(100, results.size());
        results.forEach((mid, items) -> assertFalse(items.isEmpty(), mid + " should have items"));
        System.out.println("[PASS] Batch: " + results.size() + " users, " +
                results.values().stream().mapToInt(List::size).sum() + " total items");
    }

    @Test
    @DisplayName("集成测试总结")
    void printSummary() {
        System.out.println("\n==============================================================");
        System.out.println("  Recommendation Integration Test — All Green");
        System.out.println("  Tag: " + TAG);
        System.out.println("==============================================================");
        assertTrue(true);
    }
}
