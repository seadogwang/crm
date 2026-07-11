package com.loyalty.platform.campaign.recommendation;

import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.RecommendationStrategy;
import com.loyalty.platform.domain.repository.campaign.RecommendationStrategyRepository;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/campaign/recommendation")
public class RecommendationController {

    private final RecommendationStrategyRepository strategyRepository;
    private final RecommendationCacheService cacheService;

    public RecommendationController(RecommendationStrategyRepository strategyRepository,
                                     RecommendationCacheService cacheService) {
        this.strategyRepository = strategyRepository;
        this.cacheService = cacheService;
    }

    /** 获取推荐预览 */
    @GetMapping("/preview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> preview(
            @RequestParam String memberId,
            @RequestParam String strategyId,
            @RequestParam(defaultValue = "3") int maxItems) {
        List<RecommendationItem> items = cacheService.getOrCompute(memberId, strategyId, maxItems);
        RecommendationStrategy strategy = strategyRepository.findById(strategyId).orElse(null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("memberId", memberId);
        result.put("strategyId", strategyId);
        result.put("strategyName", strategy != null ? strategy.getStrategyName() : "Unknown");
        result.put("items", items);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /** 获取策略列表 */
    @GetMapping("/strategies")
    public ResponseEntity<ApiResponse<List<RecommendationStrategy>>> getStrategies(
            @RequestParam String programCode) {
        return ResponseEntity.ok(ApiResponse.success(
                strategyRepository.findByProgramCodeAndEnabledTrue(programCode)));
    }

    /** 创建策略 */
    @PostMapping("/strategy")
    public ResponseEntity<ApiResponse<RecommendationStrategy>> createStrategy(
            @RequestBody RecommendationStrategy strategy) {
        if (strategy.getId() == null) strategy.setId(UUID.randomUUID().toString());
        return ResponseEntity.ok(ApiResponse.success(strategyRepository.save(strategy)));
    }

    /** 更新策略 */
    @PutMapping("/strategy/{id}")
    public ResponseEntity<ApiResponse<RecommendationStrategy>> updateStrategy(
            @PathVariable String id, @RequestBody RecommendationStrategy update) {
        RecommendationStrategy s = strategyRepository.findById(id)
                .orElseThrow(() -> new RuntimeException("Strategy not found"));
        s.setStrategyName(update.getStrategyName());
        s.setRecommendationConfig(update.getRecommendationConfig());
        s.setCacheTtlSeconds(update.getCacheTtlSeconds());
        s.setFallbackContent(update.getFallbackContent());
        s.setEnabled(update.isEnabled());
        return ResponseEntity.ok(ApiResponse.success(strategyRepository.save(s)));
    }
}
