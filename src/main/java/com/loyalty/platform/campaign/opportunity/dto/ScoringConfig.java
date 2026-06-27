package com.loyalty.platform.campaign.opportunity.dto;

import lombok.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * 机会评分配置。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ScoringConfig {
    private List<ScoringDimension> dimensions;
    private BigDecimal highThreshold;   // 高价值阈值
    private BigDecimal midThreshold;    // 中价值阈值
    private boolean externalSignalEnabled;

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    @Builder
    public static class ScoringDimension {
        private String key;           // 维度标识
        private String name;          // 显示名称
        private String description;   // 描述
        private String dataSource;    // 数据来源
        private BigDecimal weight;    // 权重 (0-1)
        private boolean enabled;      // 是否启用
        private String algorithm;     // 算法类型: RFM/ML/RULE/CUSTOM
        private Map<String, Object> algorithmConfig; // 算法配置
    }
}