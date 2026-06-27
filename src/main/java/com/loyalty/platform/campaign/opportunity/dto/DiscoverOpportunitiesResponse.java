package com.loyalty.platform.campaign.opportunity.dto;

import lombok.*;

import java.util.List;
import java.util.Map;

/**
 * 机会发现响应。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DiscoverOpportunitiesResponse {
    private String goalId;
    private int totalDiscovered;
    private int returnedCount;
    private List<Opportunity> opportunities;
    private Map<String, Object> summary;
    private List<Map<String, Object>> uncoveredSegments;
}
