package com.loyalty.saas.common.event;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * 本地事件路由器。
 *
 * <p>负责将 {@link LocalEventBus} 投递的事件分发到 Spring 容器中注册的
 * {@link DomainEventHandler} 处理器。这是 {@link EventBridge} 接口
 * 在 dev 环境下的消费端核心组件。
 *
 * <p><b>设计要点</b>：
 * <ul>
 *   <li><b>按主题路由</b>：通过 {@link DomainEventHandler#getTopic()} 将事件
 *       路由到匹配的处理器。</li>
 *   <li><b>多处理器支持</b>：同一主题可以有多个处理器，事件按注册顺序依次投递。</li>
 *   <li><b>异常隔离</b>：单个处理器的异常不会影响其他处理器的执行。</li>
 *   <li><b>动态注册</b>：支持运行时通过 Spring 容器发现新注册的处理器。</li>
 * </ul>
 *
 * <p><b>线程安全</b>：
 * <ul>
 *   <li>使用 {@link ConcurrentHashMap} + {@link CopyOnWriteArrayList} 保证并发安全。</li>
 *   <li>路由操作无锁，适合高并发场景。</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
public class LocalEventRouter {

    private static final Logger log = LoggerFactory.getLogger(LocalEventRouter.class);

    /**
     * 主题 -> 处理器列表的映射。
     * 使用 ConcurrentHashMap 保证线程安全。
     */
    private final Map<String, List<DomainEventHandler<? extends BaseDomainEvent>>> topicHandlers =
            new ConcurrentHashMap<>();

    /**
     * 通过 Spring 容器自动注入所有 DomainEventHandler 实现并注册。
     *
     * @param handlers Spring 容器中所有 DomainEventHandler Bean
     */
    public LocalEventRouter(List<DomainEventHandler<? extends BaseDomainEvent>> handlers) {
        for (DomainEventHandler<? extends BaseDomainEvent> handler : handlers) {
            register(handler);
        }
        log.info("[LocalEventRouter] 已注册 {} 个事件处理器，覆盖 {} 个主题",
                handlers.size(), topicHandlers.size());
    }

    /**
     * 注册事件处理器。
     *
     * @param handler 事件处理器
     * @throws IllegalArgumentException 如果 handler 为 null
     */
    public void register(DomainEventHandler<? extends BaseDomainEvent> handler) {
        if (handler == null) {
            throw new IllegalArgumentException("handler must not be null");
        }
        String topic = handler.getTopic();
        topicHandlers.computeIfAbsent(topic, k -> new CopyOnWriteArrayList<>()).add(handler);
        log.info("[LocalEventRouter] 注册处理器: topic={}, handler={}", topic, handler.getClass().getSimpleName());
    }

    /**
     * 注销事件处理器。
     *
     * @param handler 事件处理器
     */
    public void unregister(DomainEventHandler<? extends BaseDomainEvent> handler) {
        if (handler == null) {
            return;
        }
        String topic = handler.getTopic();
        List<DomainEventHandler<? extends BaseDomainEvent>> handlers = topicHandlers.get(topic);
        if (handlers != null) {
            handlers.remove(handler);
            log.info("[LocalEventRouter] 注销处理器: topic={}, handler={}", topic, handler.getClass().getSimpleName());
        }
    }

    /**
     * 将事件路由到匹配的处理器。
     *
     * <p>路由规则：
     * <ol>
     *   <li>按 {@code topic} 查找匹配的处理器列表。</li>
     *   <li>按事件类型过滤处理器（只将事件投递给能处理该事件类型的处理器）。</li>
     *   <li>依次调用每个匹配处理器的 {@link DomainEventHandler#handle(BaseDomainEvent)} 方法。</li>
     *   <li>单个处理器的异常被捕获并记录，不影响其他处理器。</li>
     * </ol>
     *
     * @param topic 事件主题
     * @param event 领域事件
     * @throws IllegalArgumentException 如果参数为 null
     */
    @SuppressWarnings("unchecked")
    public void route(String topic, BaseDomainEvent event) {
        if (topic == null) {
            throw new IllegalArgumentException("topic must not be null");
        }
        if (event == null) {
            throw new IllegalArgumentException("event must not be null");
        }

        List<DomainEventHandler<? extends BaseDomainEvent>> handlers = topicHandlers.get(topic);
        if (handlers == null || handlers.isEmpty()) {
            log.debug("[LocalEventRouter] 主题 {} 无注册处理器，事件被丢弃: eventId={}, type={}",
                    topic, event.getEventId(), event.getEventType());
            return;
        }

        for (DomainEventHandler<? extends BaseDomainEvent> handler : handlers) {
            try {
                // 类型安全：检查事件类型是否匹配处理器泛型
                if (handler.getEventType().isAssignableFrom(event.getClass())) {
                    DomainEventHandler<BaseDomainEvent> typedHandler =
                            (DomainEventHandler<BaseDomainEvent>) handler;
                    typedHandler.handle(event);
                    log.debug("[LocalEventRouter] 事件已处理: topic={}, handler={}, eventId={}",
                            topic, handler.getClass().getSimpleName(), event.getEventId());
                }
            } catch (Exception e) {
                log.error("[LocalEventRouter] 处理器异常: topic={}, handler={}, eventId={}, eventType={}",
                        topic, handler.getClass().getSimpleName(), event.getEventId(), event.getEventType(), e);
                // 本地环境异常不中断其他处理器
            }
        }
    }

    /**
     * 获取已注册的主题数量。
     */
    public int getTopicCount() {
        return topicHandlers.size();
    }

    /**
     * 获取指定主题的处理器数量。
     */
    public int getHandlerCount(String topic) {
        List<DomainEventHandler<? extends BaseDomainEvent>> handlers = topicHandlers.get(topic);
        return handlers == null ? 0 : handlers.size();
    }
}