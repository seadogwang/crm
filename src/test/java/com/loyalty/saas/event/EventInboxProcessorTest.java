package com.loyalty.saas.event;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.domain.entity.EventInbox;
import com.loyalty.saas.domain.repository.EventInboxRepository;
import com.loyalty.saas.mapping.ScriptingTransformer;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Sort;

import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({ScriptingTransformer.class})
class EventInboxProcessorTest {

    @Autowired private EventInboxRepository inboxRepo;
    @PersistenceContext private EntityManager em;

    @BeforeEach
    void setUp() {
        TenantContext.set("PROG001");
        em.createNativeQuery("SET app.current_program_code = 'PROG001'").executeUpdate();
    }

    @AfterEach
    void tearDown() {
        var all = inboxRepo.findAllByProgramCode("PROG001", Sort.unsorted());
        for (EventInbox e : all) {
            if (e.getSourceEventId() != null && e.getSourceEventId().startsWith("evt-test-")) {
                inboxRepo.delete(e);
            }
        }
        TenantContext.clear();
        em.flush();
    }

    @Test
    void insertAndRetrieve() {
        var event = inboxRepo.save(EventInbox.builder()
                .programCode("PROG001")
                .sourceChannel("TMALL")
                .sourceEventId("evt-test-save")
                .idempotencyKey("PROG001:TMALL:test:save")
                .payloadHash("abc")
                .payload(Map.of("member_id", "8821"))
                .signatureVerified(true)
                .status("RECEIVED")
                .retryCount(0)
                .maxRetry(3)
                .firstSeenAt(LocalDateTime.now())
                .build());
        em.flush();
        assertNotNull(event.getId());

        var found = inboxRepo.findByStatus("RECEIVED", 10);
        assertFalse(found.isEmpty());
    }

    @Test
    void idempotencyCheck() {
        var saved = inboxRepo.save(EventInbox.builder()
                .programCode("PROG001")
                .sourceChannel("JD")
                .sourceEventId("evt-test-idem")
                .idempotencyKey("PROG001:JD:test:idem")
                .payloadHash("idem-hash")
                .payload(Map.of("x", 1))
                .signatureVerified(true)
                .status("SUCCEEDED")
                .retryCount(0)
                .maxRetry(3)
                .firstSeenAt(LocalDateTime.now())
                .build());
        em.flush();

        boolean exists = inboxRepo.existsByIdempotencyKeyAndStatus("PROG001:JD:test:idem", "SUCCEEDED");
        assertTrue(exists);

        boolean notExists = inboxRepo.existsByIdempotencyKeyAndStatus("PROG001:JD:test:idem", "RECEIVED");
        assertFalse(notExists);
    }

    @Test
    void retryableQuery() {
        inboxRepo.save(EventInbox.builder()
                .programCode("PROG001")
                .sourceChannel("DOUYIN")
                .sourceEventId("evt-test-retryable")
                .idempotencyKey("PROG001:DOUYIN:test:retryable")
                .payloadHash("retryable")
                .payload(Map.of("y", 2))
                .signatureVerified(true)
                .status("TRANSFORM_FAILED")
                .retryCount(1)
                .maxRetry(3)
                .errorMessage("simulated failure")
                .nextRetryAt(LocalDateTime.now().minusSeconds(60))
                .firstSeenAt(LocalDateTime.now())
                .build());
        em.flush();

        var retryable = inboxRepo.findRetryable(3, LocalDateTime.now().plusSeconds(10));
        assertFalse(retryable.isEmpty());
        assertTrue(retryable.stream().anyMatch(e -> "evt-test-retryable".equals(e.getSourceEventId())));
    }

    @Test
    void exhaustedQuery() {
        inboxRepo.save(EventInbox.builder()
                .programCode("PROG001")
                .sourceChannel("WECHAT")
                .sourceEventId("evt-test-exhausted")
                .idempotencyKey("PROG001:WECHAT:test:exhausted")
                .payloadHash("dead")
                .payload(Map.of("z", 3))
                .signatureVerified(true)
                .status("TRANSFORM_FAILED")
                .retryCount(5)
                .maxRetry(3)
                .errorMessage("all retries failed")
                .firstSeenAt(LocalDateTime.now())
                .build());
        em.flush();

        var exhausted = inboxRepo.findExhaustedRetries(3);
        assertFalse(exhausted.isEmpty());
        assertTrue(exhausted.stream().anyMatch(e -> "evt-test-exhausted".equals(e.getSourceEventId())));
    }
}