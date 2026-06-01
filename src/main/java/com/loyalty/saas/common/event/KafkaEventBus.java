package com.loyalty.saas.common.event;

import com.loyalty.saas.common.context.TenantContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Component;

import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;

/**
 * Kafka 事件总线实现（Test / Prod 环境）。
 *
 * <p>当 {@code spring.profiles.active=test|prod} 时自动挂载，替换 dev 的 LocalEventBus。
 * 利用 {@code memberId} 作为 partitionKey 投递至真实 Kafka 集群，
 * 由 Kafka 保证同一分区内的消息有序消费。
 *
 * <p>设计文档 2.2.3 节：业务代码禁止直接使用 {@code KafkaTemplate}。
 * 统一通过 {@link EventBridge} 接口调用。
 *
 * <p><b>Kafka Producer 配置（application-prod.yml）</b>：
 * <pre>
 * spring.kafka.bootstrap-servers: kafka-broker-1:9092,kafka-broker-2:9092
 * spring.kafka.producer.key-serializer: org.apache.kafka.common.serialization.StringSerializer
 * spring.kafka.producer.value-serializer: org.springframework.kafka.support.serializer.JsonSerializer
 * spring.kafka.producer.acks: all
 * spring.kafka.producer.retries: 3
 * </pre>
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Component
@Profile({"test", "prod"})
public class KafkaEventBus implements EventBridge {

    private static final Logger log = LoggerFactory.getLogger(KafkaEventBus.class);

    private final KafkaTemplate<String, Object> kafkaTemplate;

    public KafkaEventBus(KafkaTemplate<String, Object> kafkaTemplate) {
        this.kafkaTemplate = kafkaTemplate;
        log.info("[KafkaEventBus] Kafka 事件总线已激活");
    }

    /**
     * 异步发送领域事件到 Kafka。
     *
     * <p>利用 memberId 作为 partitionKey，Kafka 保证同一会员的事件
     * 在同一分区内有序处理，消除并发写冲突。
     *
     * <p>发送结果异步回调记录日志，不阻塞主线程。
     *
     * @param topic        业务主题
     * @param partitionKey 分区键（memberId），保证分区有序
     * @param event        领域事件
     */
    @Override
    public void publish(String topic, String partitionKey, BaseDomainEvent event) {
        if (topic == null || partitionKey == null || event == null) {
            throw new IllegalArgumentException("topic, partitionKey, event must not be null");
        }

        // Kafka 发送为异步操作，不阻塞主线程
        CompletableFuture<SendResult<String, Object>> future =
                kafkaTemplate.send(topic, partitionKey, event);

        future.whenComplete((result, ex) -> {
            if (ex != null) {
                log.error("[KafkaEventBus] 发送失败: topic={}, key={}, eventId={}",
                        topic, partitionKey, event.getEventId(), ex);
                // 生产环境应写入 dead-letter topic 或 event_outbox 重试表
            } else {
                log.debug("[KafkaEventBus] 发送成功: topic={}, key={}, offset={}",
                        topic, partitionKey,
                        result.getRecordMetadata() != null ? result.getRecordMetadata().offset() : -1);
            }
        });
    }

    /**
     * 同步发送——等待 Kafka 确认后才返回。
     * 仅用于必须严格同步的场景（如本地集成测试）。
     */
    @Override
    public void publishSync(String topic, String partitionKey, BaseDomainEvent event) {
        try {
            SendResult<String, Object> result = kafkaTemplate.send(topic, partitionKey, event)
                    .get(10, TimeUnit.SECONDS);
            log.debug("[KafkaEventBus] 同步发送确认: topic={}, offset={}",
                    topic, result.getRecordMetadata().offset());
        } catch (Exception e) {
            log.error("[KafkaEventBus] 同步发送失败: topic={}", topic, e);
            throw new RuntimeException("Kafka sync send failed for topic " + topic, e);
        }
    }
}