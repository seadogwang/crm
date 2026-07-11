package com.loyalty.platform.campaign.recommendation;

import java.util.*;

/**
 * 推荐引擎接口 — 支持多种推荐策略的插件式实现。
 */
public interface RecommendationEngine {
    /** 获取推荐结果 */
    List<RecommendationItem> recommend(String memberId, String strategyId, Map<String, Object> context);

    /** 批量获取推荐结果 */
    default Map<String, List<RecommendationItem>> batchRecommend(List<String> memberIds, String strategyId, Map<String, Object> context) {
        Map<String, List<RecommendationItem>> results = new HashMap<>();
        for (String memberId : memberIds) {
            results.put(memberId, recommend(memberId, strategyId, context));
        }
        return results;
    }

    /** 支持的策略类型 */
    String getStrategyType();
}
