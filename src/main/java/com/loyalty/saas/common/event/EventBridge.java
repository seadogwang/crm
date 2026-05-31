package com.loyalty.saas.common.event;

/**
 * 统一事件总线接口契约。
 *
 * <p>所有领域事件的发布必须依赖此接口，业务代码<b>禁止直接使用 {@code KafkaTemplate}</b>。
 * 利用 Spring 的 {@code @Profile} 机制实现环境的无缝切换：
 * <ul>
 *   <li>{@code dev} 环境：{@link LocalEventBus}（基于内存队列和虚拟分区）</li>
 *   <li>{@code test/prod} 环境：{@code KafkaEventBus}（基于真实 Kafka 集群）</li>
 * </ul>
 *
 * <p><b>分区有序性保证</b>：通过 {@code partitionKey}（通常为 memberId）确保
 * 同一会员的事件在单线程内串行处理，消除积分并发写冲突。
 *
 * <p><b>使用示例</b>：
 * <pre>{@code
 * @Autowired
 * private EventBridge eventBridge;
 *
 * public void onPointsGranted(String memberId, int points) {
 *     eventBridge.publish("loyalty-point-events", memberId,
 *         new PointsGrantedEvent(memberId, points));
 * }
 * }</pre>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
public interface EventBridge {

    /**
     * 发送领域事件。
     *
     * <p><b>非阻塞保证</b>：实现类必须异步处理，不得阻塞主线程。
     * 投递失败时由实现类自行处理（本地重试表或死信队列）。
     *
     * @param topic        业务主题（如 {@code loyalty-transaction-events}）
     * @param partitionKey 分区键（通常为 {@code memberId}），保证同一分区内事件有序
     * @param event        领域事件体，必须继承 {@link BaseDomainEvent}
     * @throws IllegalArgumentException 如果参数为 null
     */
    void publish(String topic, String partitionKey, BaseDomainEvent event);

    /**
     * 同步发送领域事件（阻塞直到消费完成）。
     *
     * <p><b>注意</b>：仅用于需要严格同步的场景（如本地测试），
     * 生产环境应使用 {@link #publish(String, String, BaseDomainEvent)}。
     *
     * @param topic        业务主题
     * @param partitionKey 分区键
     * @param event        领域事件体
     * @throws IllegalArgumentException 如果参数为 null
     */
    default void publishSync(String topic, String partitionKey, BaseDomainEvent event) {
        throw new UnsupportedOperationException(
                "publishSync is not supported by this implementation. Use publish() instead."
        );
    }
}