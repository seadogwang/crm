package com.loyalty.platform.campaign.recommendation;

import lombok.*;

@Data @Builder @NoArgsConstructor @AllArgsConstructor
public class RecommendationItem {
    private String productId;
    private String productName;
    private Double price;
    private String imageUrl;
    private String detailUrl;
    private Double score;
    private String reason;
}
