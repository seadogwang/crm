package com.loyalty.saas.domain.dto;

import com.loyalty.saas.domain.entity.EventFact;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class EventFactTest {

    @Test
    void construct() {
        var fact = new EventFact("PROG001", "ORDER_PAID", "8821", "TMALL",
                Instant.now(), "idem-key-123", "SNAP-001",
                Map.of("order_amount", 150.0));
        assertEquals("PROG001", fact.getProgramCode());
        assertEquals("ORDER_PAID", fact.getEventType());
        assertEquals("8821", fact.getMemberId());
        assertEquals("TMALL", fact.getChannel());
        assertNotNull(fact.getEventId());
        assertNotNull(fact.getOccurredAt());
    }

    @Test
    void payloadString() {
        var fact = new EventFact("P", "T", null, null, null, null, null, Map.of("name", "Zhang"));
        assertEquals("Zhang", fact.getPayloadString("name"));
        assertNull(fact.getPayloadString("nonexist"));
    }

    @Test
    void payloadNumber() {
        var fact = new EventFact("P", "T", null, null, null, null, null, Map.of("amount", 150));
        assertEquals(150.0, fact.getPayloadNumber("amount"));
        assertEquals(0.0, fact.getPayloadNumber("nonexist"));
    }

    @Test
    void payloadBool() {
        var fact = new EventFact("P", "T", null, null, null, null, null, Map.of("vip", "true"));
        assertTrue(fact.getPayloadBool("vip"));
        assertFalse(fact.getPayloadBool("nonexist"));
    }
}