package com.loyalty.platform.campaign.canvas.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 节点注册表 — 管理所有可用的 Canvas 节点类型。
 */
@Component
public class NodeRegistry {

    private static final Logger log = LoggerFactory.getLogger(NodeRegistry.class);

    private final Map<String, NodeTypeInfo> registry = new LinkedHashMap<>();

    @PostConstruct
    public void init() {
        register("START", "开始", "flow", "流程入口节点", Set.of());
        register("AUDIENCE_FILTER", "人群筛选", "input", "基于实时宽表的动态规则筛选目标用户", Set.of("logic", "conditions", "limit", "excludeBlacklist"));
        register("EVENT_TRIGGER", "事件触发", "input", "监听外部事件启动流程", Set.of("eventType", "filter"));
        register("CONDITION", "条件分支", "logic", "按条件分流转发", Set.of("field", "operator", "value"));
        register("SPLIT", "并行分支", "logic", "并行执行多个分支", Set.of("branchCount"));
        register("MERGE", "合并节点", "logic", "合并多个并行分支", Set.of("waitForAll"));
        register("AI_SCORE", "AI 评分", "ai", "调用 AI 模型评分", Set.of("modelType", "threshold", "batchSize"));
        register("AI_PLANNER", "AI 规划", "ai", "AI 自动生成营销策略", Set.of("goalType", "budget"));
        register("DELAY", "延迟等待", "control", "等待指定时间", Set.of("duration", "unit"));
        register("WAIT_EVENT", "事件等待", "control", "等待指定事件触发", Set.of("eventType", "timeout"));
        register("SEND_EMAIL", "发送邮件", "action", "通过邮件发送消息", Set.of("assetId", "subjectLine", "retryCount", "rateLimit", "requireApproval"));
        register("SEND_SMS", "发送短信", "action", "通过短信发送消息", Set.of("assetId", "templateId", "retryCount"));
        register("SEND_PUSH", "发送推送", "action", "通过推送发送消息", Set.of("assetId", "title", "body"));
        register("OFFER_POINTS", "发放积分", "action", "向会员发放积分", Set.of("pointType", "amount", "reason"));
        register("OFFER_COUPON", "发放优惠券", "action", "向会员发放优惠券", Set.of("couponId", "count", "reason"));
        register("TIER_UPGRADE", "等级直升", "action", "将会员升级到指定等级", Set.of("targetTier", "reason"));
        register("WEBHOOK", "外部调用", "action", "调用外部 API", Set.of("url", "method", "retryCount"));
        register("APPROVAL", "人工审批", "control", "需要人工审批通过", Set.of("approverId", "approverGroup", "timeoutHours", "autoReject"));
        register("END", "结束", "flow", "流程结束节点", Set.of());

        log.info("Node registry initialized with {} node types", registry.size());
    }

    private void register(String type, String label, String category, String description, Set<String> configFields) {
        registry.put(type, new NodeTypeInfo(type, label, category, description, configFields));
    }

    public NodeTypeInfo get(String type) {
        return registry.get(type);
    }

    public List<NodeTypeInfo> getAll() {
        return new ArrayList<>(registry.values());
    }

    public List<NodeTypeInfo> getByCategory(String category) {
        return registry.values().stream()
                .filter(n -> n.category().equals(category))
                .toList();
    }

    public boolean isValidType(String type) {
        return registry.containsKey(type);
    }

    /**
     * 节点类型信息。
     */
    public record NodeTypeInfo(String type, String label, String category,
                                String description, Set<String> configFields) {}
}
