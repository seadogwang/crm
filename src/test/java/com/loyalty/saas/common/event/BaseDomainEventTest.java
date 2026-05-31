package com.loyalty.saas.common.event;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("BaseDomainEvent 单元测试")
class BaseDomainEventTest {

    @Test
    @DisplayName("构造事件：自动生成 eventId 和时间戳")
    void shouldAutoGenerateIdAndTimestamp() {
        var event = new TestEvent("PROG001", "TEST_TYPE");
        assertNotNull(event.getEventId());
        assertNotNull(event.getOccurredAt());
        assertEquals("PROG001", event.getProgramCode());
        assertEquals("TEST_TYPE", event.getEventType());
    }

    @Test
    @DisplayName("拒绝 null programCode")
    void shouldRejectNullProgramCode() {
        assertThrows(IllegalArgumentException.class, () -> new TestEvent(null, "X"));
    }

    @Test
    @DisplayName("拒绝 null eventType")
    void shouldRejectNullEventType() {
        assertThrows(IllegalArgumentException.class, () -> new TestEvent("P", null));
    }

    @Test
    @DisplayName("每个事件的 eventId 唯一")
    void shouldHaveUniqueEventIds() {
        var e1 = new TestEvent("P", "T");
        var e2 = new TestEvent("P", "T");
        assertNotEquals(e1.getEventId(), e2.getEventId());
    }

    static class TestEvent extends BaseDomainEvent {
        TestEvent(String programCode, String eventType) { super(programCode, eventType); }
    }
}