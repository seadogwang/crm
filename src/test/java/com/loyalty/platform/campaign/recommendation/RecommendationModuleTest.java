package com.loyalty.platform.campaign.recommendation;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("Recommendation Module Tests")
class RecommendationModuleTest {

    @Mock private RecommendationCacheRepository cacheRepository;
    @Mock private RecommendationStrategyRepository strategyRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    private SimilarProductsEngine engine;
    private RecommendationCacheService cacheService;

    @BeforeEach
    void setUp() {
        engine = new SimilarProductsEngine();
        cacheService = new RecommendationCacheService(cacheRepository, strategyRepository,
                engine, objectMapper);
    }

    @Nested
    @DisplayName("SimilarProductsEngine — 推荐引擎")
    class EngineTests {

        @Test
        @DisplayName("默认返回3个推荐项")
        void shouldReturnDefault3Items() {
            List<RecommendationItem> items = engine.recommend("M_001", "S1", Map.of());
            assertEquals(3, items.size());
        }

        @Test
        @DisplayName("maxItems 控制返回数量")
        void shouldRespectMaxItems() {
            List<RecommendationItem> items = engine.recommend("M_001", "S1", Map.of("maxItems", 5));
            assertEquals(5, items.size());
        }

        @Test
        @DisplayName("maxItems=1 返回1条")
        void shouldReturnOneItem() {
            List<RecommendationItem> items = engine.recommend("M_001", "S1", Map.of("maxItems", 1));
            assertEquals(1, items.size());
        }

        @Test
        @DisplayName("同一用户 → 确定性结果")
        void shouldBeDeterministicForSameUser() {
            List<RecommendationItem> r1 = engine.recommend("M_SAME", "S1", Map.of());
            List<RecommendationItem> r2 = engine.recommend("M_SAME", "S1", Map.of());
            assertEquals(r1.size(), r2.size());
            assertEquals(r1.get(0).getProductId(), r2.get(0).getProductId());
        }

        @Test
        @DisplayName("不同用户 → 不同推荐")
        void shouldDifferForDifferentUsers() {
            List<RecommendationItem> rA = engine.recommend("M_A", "S1", Map.of());
            List<RecommendationItem> rB = engine.recommend("M_ZZZZ", "S1", Map.of());
            assertNotEquals(rA.get(0).getProductId(), rB.get(0).getProductId());
        }

        @Test
        @DisplayName("getStrategyType → SIMILAR_PRODUCTS")
        void shouldReturnStrategyType() {
            assertEquals("SIMILAR_PRODUCTS", engine.getStrategyType());
        }

        @Test
        @DisplayName("推荐项包含完整字段")
        void shouldHaveCompleteItemFields() {
            List<RecommendationItem> items = engine.recommend("M_001", "S1", Map.of());
            RecommendationItem item = items.get(0);
            assertNotNull(item.getProductId());
            assertNotNull(item.getProductName());
            assertNotNull(item.getPrice());
            assertTrue(item.getPrice() > 0);
            assertTrue(item.getScore() > 0);
            assertNotNull(item.getReason());
            assertTrue(item.getDetailUrl().contains("shop.example.com"));
        }

        @Test
        @DisplayName("批量推荐")
        void shouldBatchRecommend() {
            Map<String, List<RecommendationItem>> results = engine.batchRecommend(
                    List.of("M_1", "M_2", "M_3"), "S1", Map.of());
            assertEquals(3, results.size());
            results.values().forEach(items -> assertEquals(3, items.size()));
        }
    }

    @Nested
    @DisplayName("RecommendationCacheService — 缓存服务")
    class CacheServiceTests {

        @Test
        @DisplayName("getCached → 缓存命中返回结果")
        void shouldReturnCachedItems() throws Exception {
            String json = "[{\"productId\":\"P01\",\"productName\":\"Test\",\"price\":99.0,\"score\":0.9,\"reason\":\"cache\"}]";
            RecommendationCache cache = RecommendationCache.builder()
                    .id("C1").memberId("M1").strategyId("S1")
                    .recommendationResult(json).expiresAt(Instant.now().plusSeconds(3600)).build();
            when(cacheRepository.findByMemberIdAndStrategyIdAndExpiresAtAfter(eq("M1"), eq("S1"), any()))
                    .thenReturn(Optional.of(cache));

            List<RecommendationItem> items = cacheService.getCached("M1", "S1");
            assertNotNull(items);
            assertEquals(1, items.size());
            assertEquals("Test", items.get(0).getProductName());
        }

        @Test
        @DisplayName("getCached → 未命中返回 null")
        void shouldReturnNullOnMiss() {
            when(cacheRepository.findByMemberIdAndStrategyIdAndExpiresAtAfter(eq("M1"), eq("S1"), any()))
                    .thenReturn(Optional.empty());
            assertNull(cacheService.getCached("M1", "S1"));
        }

        @Test
        @DisplayName("getOrCompute → 缓存未命中时计算并缓存")
        void shouldComputeAndCacheOnMiss() {
            when(cacheRepository.findByMemberIdAndStrategyIdAndExpiresAtAfter(eq("M1"), eq("S1"), any()))
                    .thenReturn(Optional.empty());
            when(strategyRepository.findById("S1")).thenReturn(Optional.of(
                    RecommendationStrategy.builder().id("S1").cacheTtlSeconds(3600).build()));

            List<RecommendationItem> items = cacheService.getOrCompute("M1", "S1", 3);
            assertNotNull(items);
            assertEquals(3, items.size());
            verify(cacheRepository).save(any(RecommendationCache.class));
        }

        @Test
        @DisplayName("getOrCompute → 缓存命中直接返回")
        void shouldReturnCachedWithoutCompute() throws Exception {
            String json = "[{\"productId\":\"P01\",\"productName\":\"Cached\",\"price\":10.0,\"score\":0.8,\"reason\":\"hit\"}]";
            RecommendationCache cache = RecommendationCache.builder()
                    .id("C2").memberId("M1").strategyId("S1")
                    .recommendationResult(json).expiresAt(Instant.now().plusSeconds(3600)).build();
            when(cacheRepository.findByMemberIdAndStrategyIdAndExpiresAtAfter(eq("M1"), eq("S1"), any()))
                    .thenReturn(Optional.of(cache));

            List<RecommendationItem> items = cacheService.getOrCompute("M1", "S1", 3);
            assertEquals("Cached", items.get(0).getProductName());
            verify(cacheRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("Entity Defaults — 实体默认值")
    class EntityTests {

        @Test
        @DisplayName("RecommendationStrategy 默认值")
        void shouldHaveStrategyDefaults() {
            RecommendationStrategy s = RecommendationStrategy.builder()
                    .id("S1").programCode("P").strategyName("Test")
                    .strategyType("SIMILAR_PRODUCTS").recommendationConfig("{}").build();
            assertEquals(3600, s.getCacheTtlSeconds());
            assertTrue(s.isEnabled());
            assertFalse(s.isDefault());
            assertNotNull(s.getCreatedAt());
        }

        @Test
        @DisplayName("RecommendationCache 默认值")
        void shouldHaveCacheDefaults() {
            RecommendationCache c = RecommendationCache.builder()
                    .id("C1").memberId("M1").strategyId("S1")
                    .recommendationResult("[{}]").expiresAt(Instant.now()).build();
            assertNotNull(c.getCreatedAt());
            assertNotNull(c.getUpdatedAt());
        }

        @Test
        @DisplayName("RecommendationItem builder 全字段")
        void shouldBuildItemWithAllFields() {
            RecommendationItem item = RecommendationItem.builder()
                    .productId("P001").productName("测试商品").price(199.0)
                    .imageUrl("https://img.example.com/p1.jpg")
                    .detailUrl("https://shop.example.com/p1")
                    .score(0.95).reason("个性化推荐").build();

            assertEquals("P001", item.getProductId());
            assertEquals("测试商品", item.getProductName());
            assertEquals(199.0, item.getPrice());
            assertEquals(0.95, item.getScore());
        }
    }
}
