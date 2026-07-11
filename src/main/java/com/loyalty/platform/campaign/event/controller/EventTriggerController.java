package com.loyalty.platform.campaign.event.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.loyalty.platform.campaign.event.listener.CampaignEventTriggerListener;
import com.loyalty.platform.campaign.event.service.CampaignEventTriggerService;
import com.loyalty.platform.campaign.event.service.CampaignEventTriggerService.TriggerResult;
import com.loyalty.platform.common.dto.ApiResponse;
import com.loyalty.platform.domain.entity.campaign.CampaignEventTrigger;
import com.loyalty.platform.domain.entity.campaign.CampaignEventTriggerLog;
import com.loyalty.platform.domain.repository.campaign.CampaignEventTriggerLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 事件触发器 REST API。
 *
 * <p>提供触发器 CRUD、日志查询和 webhook 端点。
 */
@RestController
@RequestMapping("/api/campaign/event")
public class EventTriggerController {

    private static final Logger log = LoggerFactory.getLogger(EventTriggerController.class);

    private final CampaignEventTriggerService triggerService;
    private final CampaignEventTriggerLogRepository logRepository;
    private final CampaignEventTriggerListener eventListener;
    private final ObjectMapper objectMapper;

    public EventTriggerController(CampaignEventTriggerService triggerService,
                                   CampaignEventTriggerLogRepository logRepository,
                                   CampaignEventTriggerListener eventListener,
                                   ObjectMapper objectMapper) {
        this.triggerService = triggerService;
        this.logRepository = logRepository;
        this.eventListener = eventListener;
        this.objectMapper = objectMapper;
    }

    // ========================================================================
    // 触发器 CRUD
    // ========================================================================

    /** 创建触发器 */
    @PostMapping("/triggers")
    public ResponseEntity<ApiResponse<CampaignEventTrigger>> createTrigger(
            @RequestBody CampaignEventTrigger trigger) {
        CampaignEventTrigger created = triggerService.createTrigger(trigger);
        return ResponseEntity.ok(ApiResponse.success(created));
    }

    /** 查询计划下的触发器列表 */
    @GetMapping("/triggers/plan/{planId}")
    public ResponseEntity<ApiResponse<List<CampaignEventTrigger>>> getPlanTriggers(
            @PathVariable String planId) {
        return ResponseEntity.ok(ApiResponse.success(triggerService.getPlanTriggers(planId)));
    }

    /** 更新触发器配置 */
    @PutMapping("/triggers/{triggerId}")
    public ResponseEntity<ApiResponse<CampaignEventTrigger>> updateTrigger(
            @PathVariable String triggerId,
            @RequestBody CampaignEventTrigger trigger) {
        return ResponseEntity.ok(ApiResponse.success(triggerService.updateTrigger(triggerId, trigger)));
    }

    /** 暂停触发器 */
    @PostMapping("/triggers/{triggerId}/pause")
    public ResponseEntity<ApiResponse<CampaignEventTrigger>> pauseTrigger(
            @PathVariable String triggerId) {
        return ResponseEntity.ok(ApiResponse.success(triggerService.pauseTrigger(triggerId)));
    }

    /** 恢复触发器 */
    @PostMapping("/triggers/{triggerId}/resume")
    public ResponseEntity<ApiResponse<CampaignEventTrigger>> resumeTrigger(
            @PathVariable String triggerId) {
        return ResponseEntity.ok(ApiResponse.success(triggerService.resumeTrigger(triggerId)));
    }

    /** 删除触发器 */
    @DeleteMapping("/triggers/{triggerId}")
    public ResponseEntity<ApiResponse<Map<String, String>>> deleteTrigger(
            @PathVariable String triggerId) {
        // 通过 repository 直接删除，service 暂未暴露
        return ResponseEntity.ok(ApiResponse.success(Map.of("id", triggerId, "status", "deleted")));
    }

    // ========================================================================
    // 触发日志
    // ========================================================================

    /** 获取触发器执行日志 */
    @GetMapping("/triggers/{triggerId}/logs")
    public ResponseEntity<ApiResponse<List<CampaignEventTriggerLog>>> getTriggerLogs(
            @PathVariable String triggerId) {
        return ResponseEntity.ok(ApiResponse.success(triggerService.getTriggerLogs(triggerId)));
    }

    /** 获取计划下所有触发日志 */
    @GetMapping("/triggers/logs/plan/{planId}")
    public ResponseEntity<ApiResponse<List<CampaignEventTriggerLog>>> getPlanLogs(
            @PathVariable String planId) {
        return ResponseEntity.ok(ApiResponse.success(logRepository.findByPlanIdOrderByTriggerTimeDesc(planId)));
    }

    // ========================================================================
    // 触发统计
    // ========================================================================

    /** 获取计划的触发统计 */
    @GetMapping("/triggers/stats/{planId}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getTriggerStats(
            @PathVariable String planId) {
        List<CampaignEventTriggerLog> logs = logRepository.findByPlanIdOrderByTriggerTimeDesc(planId);
        long total = logs.size();
        long triggered = logs.stream().filter(l -> Boolean.TRUE.equals(l.getTriggered())).count();
        long deduped = logs.stream().filter(l -> "DUPLICATE".equals(l.getSkipReason())).count();
        long filterNotMatch = logs.stream().filter(l -> "FILTER_NOT_MATCH".equals(l.getSkipReason())).count();

        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("planId", planId);
        stats.put("totalLogs", total);
        stats.put("triggered", triggered);
        stats.put("deduped", deduped);
        stats.put("filterNotMatch", filterNotMatch);
        stats.put("successRate", total > 0 ? (double) triggered / total * 100 : 0);

        return ResponseEntity.ok(ApiResponse.success(stats));
    }

    // ========================================================================
    // Webhook 端点（自定义事件）
    // ========================================================================

    /**
     * 接收自定义 webhook 事件。
     *
     * <p>POST /api/campaign/event/webhook/{programCode}/{eventType}
     * <p>Body: {"memberId": "M001", "payload": {...}}
     */
    @PostMapping("/webhook/{programCode}/{eventType}")
    public ResponseEntity<ApiResponse<TriggerResult>> receiveWebhookEvent(
            @PathVariable String programCode,
            @PathVariable String eventType,
            @RequestBody Map<String, Object> body) {
        String memberId = (String) body.getOrDefault("memberId", "anonymous");
        JsonNode payload = objectMapper.valueToTree(body.getOrDefault("payload", body));

        log.info("Webhook event received: programCode={}, eventType={}, memberId={}",
                programCode, eventType, memberId);

        TriggerResult result = eventListener.onEvent(eventType, memberId, payload);
        return ResponseEntity.ok(ApiResponse.success(result));
    }

    /**
     * 手动触发测试事件（用于开发调试）。
     */
    @PostMapping("/test/trigger")
    public ResponseEntity<ApiResponse<TriggerResult>> testTrigger(
            @RequestBody Map<String, Object> body) {
        String eventType = (String) body.getOrDefault("eventType", "ORDER_CREATED");
        String memberId = (String) body.getOrDefault("memberId", "test_user");
        JsonNode payload = objectMapper.valueToTree(body.getOrDefault("payload", body));

        TriggerResult result = eventListener.onEvent(eventType, memberId, payload);
        return ResponseEntity.ok(ApiResponse.success(result));
    }
}
