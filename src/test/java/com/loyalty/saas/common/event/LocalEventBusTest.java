package com.loyalty.saas.common.event;

import com.loyalty.saas.common.context.TenantContext;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("LocalEventBus + LocalEventRouter 集成测试")
class LocalEventBusTest {

    private LocalEventRouter router;
    private LocalEventBus eventBus;
    private TestEventHandler handler;
    private List<String> receivedOrder;

    @BeforeEach
    void setUp() {
        TenantContext.clear();
        handler = new TestEventHandler();
        receivedOrder = handler.received;
        router = new LocalEventRouter(List.of(handler));
        eventBus = new LocalEventBus(4, router);
    }

    @AfterEach
    void tearDown() {
        eventBus.destroy();
        TenantContext.clear();
    }

    @Test
    @DisplayName("事件发布后被处理器消费")
    void shouldDeliverEventToHandler() throws Exception {
        var event = new TestEvent("PROG001", "member-123", "X");
        eventBus.publish("test-topic", "member-123", event);
        Thread.sleep(500); // 等待异步消费
        assertEquals(1, receivedOrder.size());
        assertTrue(receivedOrder.get(0).contains("member-123"));
    }

    @Test
    @DisplayName("同一 partitionKey 的事件有序消费")
    void shouldPreserveOrderForSamePartitionKey() throws Exception {
        var e1 = new TestEvent("PROG001", "member-123", "A");
        var e2 = new TestEvent("PROG001", "member-123", "B");
        var e3 = new TestEvent("PROG001", "member-123", "C");

        CountDownLatch latch = new CountDownLatch(3);
        handler.latch = latch;

        eventBus.publish("test-topic", "member-123", e1);
        eventBus.publish("test-topic", "member-123", e2);
        eventBus.publish("test-topic", "member-123", e3);

        assertTrue(latch.await(3, TimeUnit.SECONDS));
        assertEquals(3, receivedOrder.size());
        assertEquals("[member-123-A]", receivedOrder.get(0));
        assertEquals("[member-123-B]", receivedOrder.get(1));
        assertEquals("[member-123-C]", receivedOrder.get(2));
    }

    @Test
    @DisplayName("不同 partitionKey 的事件路由到不同分区")
    void shouldRouteToDifferentPartitions() throws Exception {
        var e1 = new TestEvent("PROG001", "member-001", "X");
        var e2 = new TestEvent("PROG001", "member-999", "Y");

        CountDownLatch latch = new CountDownLatch(2);
        handler.latch = latch;

        // 使用不同的 partitionKey 可能导致不同分区，但都可以被消费
        eventBus.publish("test-topic", "member-001", e1);
        eventBus.publish("test-topic", "member-999", e2);

        assertTrue(latch.await(3, TimeUnit.SECONDS));
        assertEquals(2, receivedOrder.size());
    }

    @Test
    @DisplayName("拒绝 null 参数")
    void shouldRejectNullArguments() {
        var event = new TestEvent("P", "k", "");
        assertThrows(IllegalArgumentException.class, () -> eventBus.publish(null, "k", event));
        assertThrows(IllegalArgumentException.class, () -> eventBus.publish("t", null, event));
        assertThrows(IllegalArgumentException.class, () -> eventBus.publish("t", "k", null));
    }

    @Test
    @DisplayName("虚拟分区数在合理范围内")
    void shouldHaveCorrectVirtualPartitions() {
        assertEquals(4, eventBus.getVirtualPartitions());
    }

    // ---- 辅助类 ----

    static class TestEvent extends BaseDomainEvent {
        final String memberId;
        final String label;
        TestEvent(String programCode, String memberId, String label) {
            super(programCode, "TEST");
            this.memberId = memberId;
            this.label = label;
        }
    }

    static class TestEventHandler implements DomainEventHandler<TestEvent> {
        final List<String> received = new CopyOnWriteArrayList<>();
        volatile CountDownLatch latch;

        @Override public String getTopic() { return "test-topic"; }
        @Override public Class<TestEvent> getEventType() { return TestEvent.class; }

        @Override
        public void handle(TestEvent event) {
            received.add("[" + event.memberId + "-" + event.label + "]");
            if (latch != null) latch.countDown();
        }
    }
}