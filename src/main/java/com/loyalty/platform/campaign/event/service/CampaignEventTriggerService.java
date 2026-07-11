package com.loyalty.platform.campaign.event.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.event.CampaignEventService;
import com.loyalty.platform.campaign.execution.service.ZeebeExecutionService;
import com.loyalty.platform.common.exception.BusinessException;
import com.loyalty.platform.domain.entity.campaign.*;
import com.loyalty.platform.domain.repository.campaign.*;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

/**
 * 事件触发核心服务 — 匹配事件 → 检查过滤 → 去重 → 触发 Zeebe 流程。
 *
 * <p>流程：
 * <ol>
 *   <li>根据 eventType 查找所有 ACTIVE 触发器</li>
 *   <li>检查时间窗口（startTime ~ endTime）</li>
 *   <li>检查事件过滤条件（eventFilter JSON）</li>
 *   <li>去重检查（基于 dedupKey）</li>
 *   <li>通过 Zeebe Message 或直接创建流程实例</li>
 *   <li>记录触发日志</li>
 * </ol>
 */
@Service
@Transactional
public class CampaignEventTriggerService {

    private static final Logger log = LoggerFactory.getLogger(CampaignEventTriggerService.class);

    private final CampaignEventTriggerRepository triggerRepository;
    private final CampaignEventTriggerLogRepository logRepository;
    private final CampaignPlanRepository planRepository;
    private final ZeebeExecutionService zeebeExecutionService;
    private final DedupService dedupService;
    private final CampaignEventService eventService;
    private final ObjectMapper objectMapper;

    public CampaignEventTriggerService(CampaignEventTriggerRepository triggerRepository,
                                        CampaignEventTriggerLogRepository logRepository,
                                        CampaignPlanRepository planRepository,
                                        ZeebeExecutionService zeebeExecutionService,
                                        DedupService dedupService,
                                        CampaignEventService eventService,
                                        ObjectMapper objectMapper) {
        this.triggerRepository = triggerRepository;
        this.logRepository = logRepository;
        this.planRepository = planRepository;
        this.zeebeExecutionService = zeebeExecutionService;
        this.dedupService = dedupService;
        this.eventService = eventService;
        this.objectMapper = objectMapper;
    }

    /**
     * 处理事件 — 主入口。
     *
     * @param eventType  事件类型（ORDER_CREATED, CART_ABANDONED, ...）
     * @param memberId   会员ID（由事件携带）
     * @param payload    事件负载数据
     * @return 触发结果摘要
     */
    public TriggerResult processEvent(String eventType, String memberId, JsonNode payload) {
        // 1. 查找匹配的激活触发器
        List<CampaignEventTrigger> triggers = triggerRepository.findActiveByEventType(eventType);
        if (triggers.isEmpty()) {
            log.debug("No active trigger found for eventType: {}", eventType);
            return TriggerResult.builder()
                    .eventType(eventType)
                    .matchedTriggers(0)
                    .details(Collections.emptyList())
                    .build();
        }

        log.info("Processing event: type={}, memberId={}, matchedTriggers={}",
                eventType, memberId, triggers.size());

        List<TriggerDetail> details = new ArrayList<>();

        // 2. 遍历匹配的触发器
        for (CampaignEventTrigger trigger : triggers) {
            TriggerDetail detail = processSingleTrigger(trigger, memberId, eventType, payload);
            details.add(detail);
        }

        return TriggerResult.builder()
                .eventType(eventType)
                .matchedTriggers(triggers.size())
                .details(details)
                .build();
    }

    /**
     * 处理单个触发器。
     */
    private TriggerDetail processSingleTrigger(CampaignEventTrigger trigger,
                                                String memberId,
                                                String eventType,
                                                JsonNode payload) {
        String triggerId = trigger.getId();
        String planId = trigger.getPlanId();

        // 2a. 检查启用状态
        if (!Boolean.TRUE.equals(trigger.getEnabled())) {
            logDisable(trigger, memberId, eventType, "DISABLED", null);
            return TriggerDetail.skipped(triggerId, "DISABLED");
        }

        // 2b. 检查时间窗口
        if (!isWithinTimeWindow(trigger)) {
            logDisable(trigger, memberId, eventType, "OUT_OF_WINDOW", null);
            return TriggerDetail.skipped(triggerId, "OUT_OF_WINDOW");
        }

        // 2c. 检查事件过滤条件
        if (!matchesFilter(trigger.getEventFilter(), payload)) {
            logDisable(trigger, memberId, eventType, "FILTER_NOT_MATCH", null);
            return TriggerDetail.skipped(triggerId, "FILTER_NOT_MATCH");
        }

        // 2d. 去重检查
        String dedupKey = buildDedupKey(trigger, memberId);
        int ttlSeconds = (trigger.getDedupWindowMinutes() != null ? trigger.getDedupWindowMinutes() : 60) * 60;
        if (!dedupService.checkAndMark(dedupKey, planId, triggerId, memberId, eventType, ttlSeconds)) {
            logDisable(trigger, memberId, eventType, "DUPLICATE", dedupKey);
            return TriggerDetail.skipped(triggerId, "DUPLICATE");
        }

        // 2e. 触发 Campaign
        try {
            // 检查 Plan 是否存在且已部署
            CampaignPlan plan = planRepository.findById(planId)
                    .orElseThrow(() -> new BusinessException("Plan not found: " + planId));

            if (plan.getZeebeProcessId() == null) {
                // Plan 尚未编译部署，自动触发编译
                log.warn("Plan {} not deployed, cannot trigger via event", planId);
                logDisable(trigger, memberId, eventType, "NOT_DEPLOYED", dedupKey);
                return TriggerDetail.skipped(triggerId, "NOT_DEPLOYED");
            }

            // 构建流程变量
            Map<String, Object> variables = new HashMap<>();
            variables.put("planId", planId);
            variables.put("triggerId", triggerId);
            variables.put("memberId", memberId);
            variables.put("eventType", eventType);
            variables.put("eventPayload", payload);
            variables.put("triggerTime", Instant.now().toString());

            // 创建 Zeebe 流程实例
            ZeebeExecutionService.ProcessInstance instance =
                    zeebeExecutionService.createInstance(planId);
            // 注入事件变量
            instance.getVariables().putAll(variables);

            Long processInstanceKey = instance.getInstanceKey();

            logTrigger(trigger, memberId, eventType, "TRIGGERED", dedupKey, processInstanceKey);
            log.info("Event triggered campaign: triggerId={}, planId={}, memberId={}, instanceKey={}",
                    triggerId, planId, memberId, processInstanceKey);

            // 发布 Campaign 事件
            eventService.publish(CampaignEventService.PLAN_STARTED, planId,
                    Map.of("triggerType", "EVENT",
                           "eventType", eventType,
                           "memberId", memberId,
                           "processInstanceKey", processInstanceKey));

            return TriggerDetail.triggered(triggerId, processInstanceKey);

        } catch (Exception e) {
            log.error("Failed to trigger campaign: triggerId={}, planId={}, error={}",
                    triggerId, planId, e.getMessage(), e);
            logDisable(trigger, memberId, eventType, "FAILED", dedupKey);
            return TriggerDetail.failed(triggerId, e.getMessage());
        }
    }

    /**
     * 构建去重 Key。
     */
    private String buildDedupKey(CampaignEventTrigger trigger, String memberId) {
        return trigger.getPlanId() + ":" + trigger.getEventType() + ":" + memberId;
    }

    /**
     * 检查事件过滤条件。
     * 支持简单 JSON 过滤：{"field":"order_amount","operator":"gt","value":100}
     */
    private boolean matchesFilter(String eventFilterJson, JsonNode payload) {
        if (eventFilterJson == null || eventFilterJson.isBlank()) {
            return true;
        }
        try {
            JsonNode filter = objectMapper.readTree(eventFilterJson);
            if (filter.isArray()) {
                // 多条过滤：全部满足才通过
                for (JsonNode condition : filter) {
                    if (!evaluateCondition(condition, payload)) {
                        return false;
                    }
                }
                return true;
            } else {
                // 单条过滤
                return evaluateCondition(filter, payload);
            }
        } catch (Exception e) {
            log.warn("Failed to parse event filter: {}", eventFilterJson, e);
            return true; // 过滤解析失败，默认通过
        }
    }

    /**
     * 评估单条过滤条件。
     */
    private boolean evaluateCondition(JsonNode condition, JsonNode payload) {
        String field = condition.path("field").asText();
        String operator = condition.path("operator").asText();
        JsonNode valueNode = condition.get("value");

        if (field.isEmpty() || operator.isEmpty()) {
            return true;
        }

        // 从 payload 中取字段值（支持嵌套路径，如 "order.amount"）
        JsonNode actualNode = resolveField(field, payload);
        if (actualNode == null || actualNode.isNull()) {
            return false;
        }

        return compareValues(actualNode, operator, valueNode);
    }

    /**
     * 解析嵌套字段路径。
     */
    private JsonNode resolveField(String fieldPath, JsonNode payload) {
        String[] parts = fieldPath.split("\\.");
        JsonNode current = payload;
        for (String part : parts) {
            if (current == null) return null;
            current = current.get(part);
        }
        return current;
    }

    /**
     * 比较两个值。
     */
    private boolean compareValues(JsonNode actual, String operator, JsonNode expected) {
        if (expected == null) return true;

        return switch (operator) {
            case "eq" -> actual.asText().equals(expected.asText());
            case "ne" -> !actual.asText().equals(expected.asText());
            case "gt" -> actual.asDouble() > expected.asDouble();
            case "gte" -> actual.asDouble() >= expected.asDouble();
            case "lt" -> actual.asDouble() < expected.asDouble();
            case "lte" -> actual.asDouble() <= expected.asDouble();
            case "contains" -> actual.asText().contains(expected.asText());
            case "in" -> {
                if (expected.isArray()) {
                    boolean found = false;
                    for (JsonNode item : expected) {
                        if (item.asText().equals(actual.asText())) {
                            found = true;
                            break;
                        }
                    }
                    yield found;
                }
                yield false;
            }
            default -> true;
        };
    }

    /**
     * 检查时间窗口。
     */
    private boolean isWithinTimeWindow(CampaignEventTrigger trigger) {
        Instant now = Instant.now();
        if (trigger.getStartTime() != null && now.isBefore(trigger.getStartTime())) {
            return false;
        }
        if (trigger.getEndTime() != null && now.isAfter(trigger.getEndTime())) {
            return false;
        }
        return true;
    }

    /**
     * 记录触发成功日志。
     */
    private void logTrigger(CampaignEventTrigger trigger, String memberId,
                            String eventType, String status, String dedupKey,
                            Long processInstanceKey) {
        CampaignEventTriggerLog logEntry = CampaignEventTriggerLog.builder()
                .id(UUID.randomUUID().toString())
                .planId(trigger.getPlanId())
                .triggerId(trigger.getId())
                .eventType(eventType)
                .memberId(memberId)
                .triggered("TRIGGERED".equals(status))
                .skipReason("DUPLICATE".equals(status) ? "DUPLICATE" :
                           "FILTER_NOT_MATCH".equals(status) ? "FILTER_NOT_MATCH" :
                           "DISABLED".equals(status) ? "DISABLED" :
                           "OUT_OF_WINDOW".equals(status) ? "OUT_OF_WINDOW" : null)
                .processInstanceKey(processInstanceKey)
                .dedupKey(dedupKey)
                .eventTime(Instant.now())
                .triggerTime(Instant.now())
                .build();
        logRepository.save(logEntry);
    }

    /**
     * 记录未触发日志。
     */
    private void logDisable(CampaignEventTrigger trigger, String memberId,
                            String eventType, String skipReason, String dedupKey) {
        CampaignEventTriggerLog logEntry = CampaignEventTriggerLog.builder()
                .id(UUID.randomUUID().toString())
                .planId(trigger.getPlanId())
                .triggerId(trigger.getId())
                .eventType(eventType)
                .memberId(memberId)
                .triggered(false)
                .skipReason(skipReason)
                .dedupKey(dedupKey)
                .eventTime(Instant.now())
                .triggerTime(Instant.now())
                .build();
        logRepository.save(logEntry);
    }

    // ========================================================================
    // Data classes
    // ========================================================================

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class TriggerResult {
        private String eventType;
        private int matchedTriggers;
        private List<TriggerDetail> details;
    }

    @lombok.Data
    @lombok.Builder
    @lombok.NoArgsConstructor
    @lombok.AllArgsConstructor
    public static class TriggerDetail {
        private String triggerId;
        private String status;        // TRIGGERED / SKIPPED / FAILED
        private String skipReason;     // DISABLED / OUT_OF_WINDOW / FILTER_NOT_MATCH / DUPLICATE / NOT_DEPLOYED
        private Long processInstanceKey;
        private String errorMessage;

        public static TriggerDetail triggered(String triggerId, Long instanceKey) {
            return TriggerDetail.builder()
                    .triggerId(triggerId)
                    .status("TRIGGERED")
                    .processInstanceKey(instanceKey)
                    .build();
        }

        public static TriggerDetail skipped(String triggerId, String reason) {
            return TriggerDetail.builder()
                    .triggerId(triggerId)
                    .status("SKIPPED")
                    .skipReason(reason)
                    .build();
        }

        public static TriggerDetail failed(String triggerId, String errorMessage) {
            return TriggerDetail.builder()
                    .triggerId(triggerId)
                    .status("FAILED")
                    .errorMessage(errorMessage)
                    .build();
        }
    }

    // ========================================================================
    // 触发器 CRUD 委托
    // ========================================================================

    public CampaignEventTrigger createTrigger(CampaignEventTrigger trigger) {
        if (trigger.getId() == null || trigger.getId().isBlank()) {
            trigger.setId(UUID.randomUUID().toString());
        }
        return triggerRepository.save(trigger);
    }

    public CampaignEventTrigger updateTrigger(String triggerId, CampaignEventTrigger update) {
        CampaignEventTrigger existing = triggerRepository.findById(triggerId)
                .orElseThrow(() -> new BusinessException("Trigger not found: " + triggerId));
        existing.setEventType(update.getEventType());
        existing.setEventSource(update.getEventSource());
        existing.setEventTopic(update.getEventTopic());
        existing.setEventFilter(update.getEventFilter());
        existing.setDedupWindowMinutes(update.getDedupWindowMinutes());
        existing.setDedupKeyFields(update.getDedupKeyFields());
        existing.setStartTime(update.getStartTime());
        existing.setEndTime(update.getEndTime());
        existing.setUpdatedAt(java.time.LocalDateTime.now());
        return triggerRepository.save(existing);
    }

    public CampaignEventTrigger pauseTrigger(String triggerId) {
        CampaignEventTrigger trigger = triggerRepository.findById(triggerId)
                .orElseThrow(() -> new BusinessException("Trigger not found: " + triggerId));
        trigger.setEnabled(false);
        trigger.setUpdatedAt(java.time.LocalDateTime.now());
        return triggerRepository.save(trigger);
    }

    public CampaignEventTrigger resumeTrigger(String triggerId) {
        CampaignEventTrigger trigger = triggerRepository.findById(triggerId)
                .orElseThrow(() -> new BusinessException("Trigger not found: " + triggerId));
        trigger.setEnabled(true);
        trigger.setUpdatedAt(java.time.LocalDateTime.now());
        return triggerRepository.save(trigger);
    }

    public List<CampaignEventTrigger> getPlanTriggers(String planId) {
        return triggerRepository.findByPlanId(planId);
    }

    public List<CampaignEventTriggerLog> getTriggerLogs(String triggerId) {
        return logRepository.findByTriggerIdOrderByTriggerTimeDesc(triggerId);
    }
}
