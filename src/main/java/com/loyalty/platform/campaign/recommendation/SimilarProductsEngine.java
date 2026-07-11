package com.loyalty.platform.campaign.recommendation;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * "看了又看"推荐引擎 — 基于用户浏览历史的相似商品推荐。
 *
 * 简化实现：根据策略配置返回模拟推荐结果。
 * 生产环境可替换为真实推荐服务调用。
 */
@Component
public class SimilarProductsEngine implements RecommendationEngine {

    private static final Logger log = LoggerFactory.getLogger(SimilarProductsEngine.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public String getStrategyType() {
        return "SIMILAR_PRODUCTS";
    }

    @Override
    public List<RecommendationItem> recommend(String memberId, String strategyId, Map<String, Object> context) {
        int maxItems = 3;
        if (context.containsKey("maxItems")) {
            maxItems = ((Number) context.get("maxItems")).intValue();
        }

        // Simplified: return mock recommendations based on member hash
        int seed = Math.abs(memberId.hashCode());
        List<RecommendationItem> items = new ArrayList<>();
        String[] names = {"无线蓝牙耳机", "运动手环", "便携充电宝", "智能音箱", "降噪耳机"};
        double[] prices = {299.0, 159.0, 89.0, 399.0, 259.0};

        for (int i = 0; i < Math.min(maxItems, names.length); i++) {
            int idx = (seed + i * 7) % names.length;
            items.add(RecommendationItem.builder()
                    .productId("P" + String.format("%03d", idx + 1))
                    .productName(names[idx])
                    .price(prices[idx])
                    .imageUrl("https://cdn.example.com/p" + String.format("%03d", idx + 1) + ".jpg")
                    .detailUrl("https://shop.example.com/p" + String.format("%03d", idx + 1))
                    .score(0.9 - i * 0.05)
                    .reason("基于您的浏览记录推荐")
                    .build());
        }
        log.debug("Recommended {} items for member {}", items.size(), memberId);
        return items;
    }
}
