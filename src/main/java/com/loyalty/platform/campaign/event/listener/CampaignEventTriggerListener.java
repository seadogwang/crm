package com.loyalty.platform.campaign.event.listener;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.event.service.CampaignEventTriggerService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Campaign 事件触发器监听器 — 接收 loyalty 域事件并路由到触发服务。
 *
 * <p>开发阶段：通过外部直接调用 {@link #onLoyaltyEvent(String)} 或
 * 由 {@link com.loyalty.platform.campaign.event.controller.EventTriggerController}
 * 的 webhook 端点触发。
 *
 * <p>生产阶段：作为 {@code @KafkaListener} 消费 Kafka topics。
 */
@Component
public class CampaignEventTriggerListener {

    private static final Logger log = LoggerFactory.getLogger(CampaignEventTriggerListener.class);

    private final CampaignEventTriggerService triggerService;
    private final ObjectMapper objectMapper;

    public CampaignEventTriggerListener(CampaignEventTriggerService triggerService,
                                         ObjectMapper objectMapper) {
        this.triggerService = triggerService;
        this.objectMapper = objectMapper;
    }

    /**
     * 处理 loyalty 事件消息。
     *
     * <p>消息格式（JSON）：
     * <pre>{@code
     * {
     *   "eventType": "ORDER_CREATED",
     *   "memberId": "M001",
     *   "payload": { ... }
     * }
     * }</pre>
     *
     * @param message JSON 格式的事件消息
     */
    public void onLoyaltyEvent(String message) {
        try {
            JsonNode event = objectMapper.readTree(message);
            String eventType = event.path("eventType").asText();
            String memberId = event.path("memberId").asText();
            JsonNode payload = event.path("payload");

            if (eventType.isEmpty()) {
                log.warn("Received event without eventType: {}", message);
                return;
            }

            log.debug("Received loyalty event: type={}, memberId={}", eventType, memberId);
            triggerService.processEvent(eventType, memberId, payload);

        } catch (Exception e) {
            log.error("Failed to process loyalty event: {}", e.getMessage(), e);
        }
    }

    /**
     * 处理事件（直接传入结构化参数）。
     */
    public CampaignEventTriggerService.TriggerResult onEvent(String eventType, String memberId,
                                                               JsonNode payload) {
        log.debug("Received event: type={}, memberId={}", eventType, memberId);
        return triggerService.processEvent(eventType, memberId, payload);
    }
}
