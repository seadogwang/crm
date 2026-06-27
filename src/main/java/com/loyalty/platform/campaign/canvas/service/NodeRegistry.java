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
        register("AUDIENCE_FILTER", "人群筛选", "flow", "筛选目标人群", Set.of("segment", "filters"));
        register("CONDITION", "条件分支", "flow", "按条件分流转发", Set.of("field", "operator", "value"));
        register("SPLIT", "并行分支", "flow", "并行执行多个分支", Set.of("branches"));
        register("AI_SCORE", "AI 评分", "ai", "调用 AI 模型评分", Set.of("model", "prompt"));
        register("DELAY", "延迟等待", "flow", "等待指定时间", Set.of("duration", "unit"));
        register("SEND_EMAIL", "发送邮件", "channel", "通过邮件发送消息", Set.of("asset_id", "subject"));
        register("SEND_SMS", "发送短信", "channel", "通过短信发送消息", Set.of("asset_id", "template_id"));
        register("SEND_PUSH", "发送推送", "channel", "通过推送发送消息", Set.of("asset_id", "title"));
        register("OFFER_POINTS", "发放积分", "action", "向会员发放积分", Set.of("point_type", "amount"));
        register("OFFER_COUPON", "发放优惠券", "action", "向会员发放优惠券", Set.of("coupon_id", "count"));
        register("TIER_UPGRADE", "等级直升", "action", "将会员升级到指定等级", Set.of("target_tier"));
        register("WEBHOOK", "外部调用", "integration", "调用外部 API", Set.of("url", "method", "headers"));
        register("APPROVAL", "人工审批", "governance", "需要人工审批通过", Set.of("approver_group", "timeout"));

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
