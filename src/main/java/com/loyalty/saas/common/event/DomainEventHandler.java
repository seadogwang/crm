package com.loyalty.saas.common.event;

/**
 * 领域事件处理器接口。
 *
 * <p>所有需要消费领域事件的业务服务必须实现此接口。
 * 通过 {@link LocalEventRouter} 注册到 {@link LocalEventBus} 的事件分发中。
 *
 * <p><b>实现约束</b>：
 * <ul>
 *   <li>{@link #getTopic()} 返回该处理器关注的主题名称，用于事件路由。</li>
 *   <li>{@link #handle(BaseDomainEvent)} 方法必须幂等——同一事件可能因重试而被多次投递。</li>
 *   <li>handle 方法中的异常将被 LocalEventBus 捕获并记录，不会中断其他事件的消费。</li>
 * </ul>
 *
 * <p><b>使用示例</b>：
 * <pre>{@code
 * @Component
 * public class TierEvaluationHandler implements DomainEventHandler<PointsGrantedEvent> {
 *     @Override
 *     public String getTopic() {
 *         return "loyalty-point-events";
 *     }
 *
 *     @Override
 *     public void handle(PointsGrantedEvent event) {
 *         // 处理等级评估逻辑
 *     }
 * }
 * }</pre>
 *
 * @param <T> 事件类型
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public interface DomainEventHandler<T extends BaseDomainEvent> {

    /**
     * 获取该处理器关注的主题名称。
     * <p>用于事件总线的事件路由。
     *
     * @return 主题名称，如 {@code "loyalty-transaction-events"}
     */
    String getTopic();

    /**
     * 处理领域事件。
     *
     * <p><b>幂等性要求</b>：实现方必须保证重复投递同一事件不会产生副作用。
     * 建议通过事件 ID ({@link BaseDomainEvent#getEventId()}) 做去重。
     *
     * @param event 领域事件
     */
    void handle(T event);

    /**
     * 获取该处理器关注的事件类型。
     * <p>默认返回 {@code BaseDomainEvent.class}，表示接收该主题下的所有事件。
     * 子类可以重写以缩小接收范围。
     *
     * @return 事件类型 Class
     */
    @SuppressWarnings("unchecked")
    default Class<T> getEventType() {
        return (Class<T>) BaseDomainEvent.class;
    }
}