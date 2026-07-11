package com.loyalty.platform.campaign.opportunity.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.domain.entity.campaign.CampaignOpportunity;
import com.loyalty.platform.domain.repository.campaign.CampaignOpportunityRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

/**
 * 实时机会处理器 — 将实时事件转换为 Opportunity 记录。
 *
 * <p>事件到达时，判断是否形成"机会"，若满足条件则生成 Opportunity 记录
 * 并存入统一机会池，供 Decision Engine 消费。
 */
@Service
@Transactional
public class RealTimeOpportunityHandler {

    private static final Logger log = LoggerFactory.getLogger(RealTimeOpportunityHandler.class);

    private final CampaignOpportunityRepository opportunityRepository;
    private final ObjectMapper objectMapper;

    public RealTimeOpportunityHandler(CampaignOpportunityRepository opportunityRepository,
                                       ObjectMapper objectMapper) {
        this.opportunityRepository = opportunityRepository;
        this.objectMapper = objectMapper;
    }

    /**
     * 将实时事件转换为 Opportunity 记录。
     *
     * @param workspaceId 工作区ID
     * @param goalId      目标ID（可选）
     * @param memberId    会员ID
     * @param eventType   事件类型
     * @param payload     事件负载
     * @return 生成的 Opportunity
     */
    public CampaignOpportunity createOpportunityFromEvent(
            String workspaceId, String goalId, String memberId,
            String eventType, JsonNode payload) {

        // 1. 根据事件类型映射机会类型
        String opportunityType = mapEventToOpportunityType(eventType);

        // 2. 计算紧迫度评分
        BigDecimal urgencyScore = calculateUrgency(eventType);

        // 3. 计算综合评分
        BigDecimal score = BigDecimal.valueOf(0.8)
                .add(urgencyScore.multiply(BigDecimal.valueOf(0.2)))
                .min(BigDecimal.ONE);

        // 4. 推荐动作和渠道
        String recommendedAction = mapEventToAction(eventType);
        String recommendedChannel = mapEventToChannel(eventType);

        // 5. 构建 Opportunity
        CampaignOpportunity opp = CampaignOpportunity.builder()
                .id(UUID.randomUUID().toString())
                .workspaceId(workspaceId)
                .goalId(goalId)
                .memberId(memberId)
                .opportunityType(opportunityType)
                .score(score)
                .recommendedAction(recommendedAction)
                .recommendedChannel(recommendedChannel)
                .status("ACTIVE")
                .source("EXTERNAL")          // 事件属于外部信号
                .eventType(eventType)
                .eventPayload(serializePayload(payload))
                .urgencyScore(urgencyScore)
                .detectedAt(Instant.now())
                .expiresAt(Instant.now().plusSeconds(3600)) // 实时机会1小时有效
                .build();

        CampaignOpportunity saved = opportunityRepository.save(opp);
        log.info("RealTime opportunity created: id={}, memberId={}, type={}, urgency={}",
                saved.getId(), memberId, opportunityType, urgencyScore);

        return saved;
    }

    /**
     * 事件类型 → 机会类型映射。
     */
    private String mapEventToOpportunityType(String eventType) {
        return switch (eventType) {
            case "CART_ABANDONED" -> "CART_RECOVERY";
            case "ORDER_CREATED"  -> "CROSS_SELL";
            case "TIER_CHANGED"   -> "ENGAGEMENT";
            case "LOGIN_7_DAYS"   -> "LOYALTY_REWARD";
            case "ORDER_REFUNDED" -> "WINBACK";
            case "BIRTHDAY"       -> "ENGAGEMENT";
            default               -> "EVENT_SIGNAL";
        };
    }

    /**
     * 计算紧迫度评分（0~1）。
     */
    private BigDecimal calculateUrgency(String eventType) {
        double urgency = switch (eventType) {
            case "CART_ABANDONED"  -> 1.0;   // 最高紧迫 — 需立即挽回
            case "ORDER_REFUNDED"  -> 0.9;   // 退款需立即响应
            case "TIER_CHANGED"    -> 0.7;
            case "ORDER_CREATED"   -> 0.6;
            case "LOGIN_7_DAYS"    -> 0.5;
            case "BIRTHDAY"        -> 0.4;
            default                -> 0.5;
        };
        return BigDecimal.valueOf(urgency);
    }

    /**
     * 事件类型 → 推荐动作映射。
     */
    private String mapEventToAction(String eventType) {
        return switch (eventType) {
            case "CART_ABANDONED"  -> "SEND_REMINDER_EMAIL";
            case "ORDER_CREATED"   -> "SEND_THANK_YOU_EMAIL";
            case "TIER_CHANGED"    -> "SEND_TIER_BENEFITS_NOTIFICATION";
            case "LOGIN_7_DAYS"    -> "GRANT_LOYALTY_REWARD";
            case "ORDER_REFUNDED"  -> "SEND_RETENTION_SURVEY";
            case "BIRTHDAY"        -> "SEND_BIRTHDAY_OFFER";
            default                -> "SEND_NOTIFICATION";
        };
    }

    /**
     * 事件类型 → 推荐渠道映射。
     */
    private String mapEventToChannel(String eventType) {
        return switch (eventType) {
            case "CART_ABANDONED"  -> "EMAIL";
            case "ORDER_CREATED"   -> "EMAIL";
            case "TIER_CHANGED"    -> "PUSH";
            case "LOGIN_7_DAYS"    -> "PUSH";
            case "ORDER_REFUNDED"  -> "SMS";
            case "BIRTHDAY"        -> "SMS";
            default                -> "EMAIL";
        };
    }

    /**
     * 序列化 payload 为 JSON 字符串（用于 JSONB 存储）。
     */
    private String serializePayload(JsonNode payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException e) {
            log.warn("Failed to serialize event payload: {}", e.getMessage());
            return "{}";
        }
    }
}
