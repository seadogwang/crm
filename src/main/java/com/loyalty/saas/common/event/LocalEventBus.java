package com.loyalty.saas.common.event;

import com.google.common.util.concurrent.ThreadFactoryBuilder;
import com.loyalty.saas.common.context.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.DisposableBean;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import java.util.concurrent.*;

/**
 * 本地内存事件总线实现（Dev 环境）。
 *
 * <p>在 dev 环境下，系统不连接任何外部 MQ，而是利用 Java 内存队列与线程池，
 * 完美模拟 Kafka 的分区有序消费特性。开发人员可以在本地"单机"验证高并发下的时序逻辑。
 *
 * <p><b>核心设计</b>：
 * <ul>
 *   <li><b>虚拟分区</b>：通过 {@code partitionKey.hashCode() % VIRTUAL_PARTITIONS}
 *       将事件路由到不同的虚拟分区。</li>
 *   <li><b>单线程池</b>：每个虚拟分区由独立的单线程池消费，保证落入同一分区的
 *       事件（如同一 memberId）绝对有序处理。</li>
 *   <li><b>异步非阻塞</b>：事件提交到线程池后立即返回，不阻塞主线程。</li>
 *   <li><b>租户上下文传递</b>：在异步消费前，从事件中恢复租户上下文到消费线程。</li>
 * </ul>
 *
 * <p><b>线程安全</b>：
 * <ul>
 *   <li>分区计算基于 {@code partitionKey.hashCode()}，只要 partitionKey 不变，
 *       同一会员的事件总是路由到同一分区。</li>
 *   <li>每个分区使用 {@code Executors.newSingleThreadExecutor()}，保证串行处理。</li>
 * </ul>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
@Profile("dev")
public class LocalEventBus implements EventBridge, DisposableBean {

    private static final Logger log = LoggerFactory.getLogger(LocalEventBus.class);

    /**
     * 虚拟分区数，模拟 Kafka 的 Partition 数量。
     * 增加分区数可提升并发度，但会降低同一分区的有序性覆盖范围。
     */
    private final int virtualPartitions;

    /**
     * 每个虚拟分区对应的单线程执行器。
     * 每个分区单线程执行，保证落入同一分区的 memberId 事件绝对有序。
     */
    private final ExecutorService[] partitionExecutors;

    /**
     * 本地事件路由器，负责将事件分发到 Spring 容器中注册的处理器。
     */
    private final LocalEventRouter eventRouter;

    /**
     * 构造 LocalEventBus。
     *
     * @param virtualPartitions 虚拟分区数（从配置 loyalty.event-bus.virtual-partitions 读取，默认 8）
     * @param eventRouter       事件路由器，由 Spring 自动注入
     */
    public LocalEventBus(
            @Value("${loyalty.event-bus.virtual-partitions:8}") int virtualPartitions,
            LocalEventRouter eventRouter) {
        if (virtualPartitions < 1 || virtualPartitions > 1024) {
            throw new IllegalArgumentException("virtualPartitions must be between 1 and 1024, got: " + virtualPartitions);
        }
        this.virtualPartitions = virtualPartitions;
        this.eventRouter = eventRouter;
        this.partitionExecutors = new ExecutorService[virtualPartitions];

        for (int i = 0; i < virtualPartitions; i++) {
            final int partitionIndex = i;
            ThreadFactory threadFactory = new ThreadFactoryBuilder()
                    .setNameFormat("local-mq-partition-" + partitionIndex + "-%d")
                    .setDaemon(true)
                    .setUncaughtExceptionHandler((t, e) ->
                            log.error("[LocalEventBus] 分区 {} 线程未捕获异常", partitionIndex, e))
                    .build();
            this.partitionExecutors[i] = Executors.newSingleThreadExecutor(threadFactory);
        }

        log.info("[LocalEventBus] 初始化完成: virtualPartitions={}, 线程池已就绪", virtualPartitions);
    }

    /**
     * 发送领域事件。
     *
     * <p>计算 partitionKey 对应的虚拟分区，将事件异步提交到该分区的单线程池中执行。
     * 非阻塞，提交后立即返回。
     *
     * @param topic        业务主题
     * @param partitionKey 分区键（通常为 memberId），决定事件路由到哪个虚拟分区
     * @param event        领域事件体
     * @throws IllegalArgumentException 如果参数为 null
     */
    @Override
    public void publish(String topic, String partitionKey, BaseDomainEvent event) {
        if (topic == null || topic.isBlank()) {
            throw new IllegalArgumentException("topic must not be null or blank");
        }
        if (partitionKey == null || partitionKey.isBlank()) {
            throw new IllegalArgumentException("partitionKey must not be null or blank");
        }
        if (event == null) {
            throw new IllegalArgumentException("event must not be null");
        }

        // 计算当前 partitionKey 对应的虚拟分区
        int partition = Math.abs(partitionKey.hashCode()) % virtualPartitions;

        // 捕获租户上下文快照，用于异步消费线程恢复
        TenantContext.TenantSnapshot tenantSnapshot = TenantContext.capture();

        // 异步提交到对应的本地单线程池中执行，非阻塞主线程
        partitionExecutors[partition].submit(() -> {
            try {
                // 恢复租户上下文
                tenantSnapshot.restore();

                log.debug("[LocalEventBus] 消费分区 {}: topic={}, key={}, eventId={}",
                        partition, topic, partitionKey, event.getEventId());

                // 路由到 Spring 容器中对应的本地监听器进行消费
                eventRouter.route(topic, event);

            } catch (Exception e) {
                log.error("[LocalEventBus] 消费异常: partition={}, topic={}, key={}, eventId={}",
                        partition, topic, partitionKey, event.getEventId(), e);
                // 本地环境异常直接抛出，由调用方或本地重试表处理
            } finally {
                // 严格清理租户上下文，防止线程池复用污染
                TenantContext.clear();
            }
        });
    }

    /**
     * 获取虚拟分区数。
     */
    public int getVirtualPartitions() {
        return virtualPartitions;
    }

    /**
     * 获取当前各分区线程池的队列深度（用于监控）。
     *
     * @return 每个分区的队列任务数
     */
    public int[] getQueueDepths() {
        int[] depths = new int[virtualPartitions];
        for (int i = 0; i < virtualPartitions; i++) {
            if (partitionExecutors[i] instanceof ThreadPoolExecutor tpe) {
                depths[i] = tpe.getQueue().size();
            }
        }
        return depths;
    }

    /**
     * 容器销毁时优雅关闭所有分区线程池。
     */
    @Override
    public void destroy() {
        log.info("[LocalEventBus] 正在关闭所有分区线程池...");
        for (int i = 0; i < virtualPartitions; i++) {
            ExecutorService executor = partitionExecutors[i];
            if (executor != null && !executor.isShutdown()) {
                executor.shutdown();
                try {
                    if (!executor.awaitTermination(10, TimeUnit.SECONDS)) {
                        log.warn("[LocalEventBus] 分区 {} 线程池未在 10s 内终止，强制关闭", i);
                        executor.shutdownNow();
                    }
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    executor.shutdownNow();
                }
            }
        }
        log.info("[LocalEventBus] 所有分区线程池已关闭");
    }
}