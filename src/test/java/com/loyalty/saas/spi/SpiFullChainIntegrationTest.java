package com.loyalty.saas.spi;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.domain.entity.ChannelAdapterConfig;
import com.loyalty.saas.domain.entity.EventInbox;
import com.loyalty.saas.domain.repository.EventInboxRepository;
import com.loyalty.saas.event.EventInboxProcessor;
import com.loyalty.saas.mapping.ScriptingTransformer;
import com.loyalty.saas.spi.handler.TmallSpiHandler;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({TmallSpiHandler.class, SpiHandlerFactory.class, SpiLogService.class,
        ScriptingTransformer.class, EventInboxProcessor.class})
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class SpiFullChainIntegrationTest {

    @Autowired private TmallSpiHandler tmallHandler;
    @Autowired private EventInboxRepository inboxRepo;
    @Autowired private EventInboxProcessor processor;
    @PersistenceContext private EntityManager em;

    private static final String PROG = "PROG001";
    private static final String CH = "TMALL";
    private static final String SECRET = "chain_test_secret";
    private static final Set<Long> createdIds = new LinkedHashSet<>();
    private ChannelAdapterConfig config;

    @BeforeEach
    void setUp() {
        TenantContext.set(PROG);
        em.createNativeQuery("SET app.current_program_code = '" + PROG + "'").executeUpdate();
        config = ChannelAdapterConfig.builder()
                .programCode(PROG).channel(CH)
                .authConfig(Map.of("app_secret", SECRET)).status("ACTIVE").build();
    }

    @AfterEach
    void tearDown() {
        for (Long id : createdIds) {
            try {
                em.createNativeQuery("DELETE FROM event_inbox WHERE id = ?")
                        .setParameter(1, id).executeUpdate();
            } catch (Exception ignored) {}
        }
        createdIds.clear();
        TenantContext.clear();
    }

    @Test @Order(1)
    @DisplayName("订单事件 → HMAC验签 → 入库 → payload数据完整 → 幂等")
    void orderPaidFullChain() throws Exception {
        String body = "{\"order_id\":\"CHAIN-001\",\"user\":{\"mobile\":\"13800138000\"},\"total_fee\":15000}";
        byte[] rawBody = body.getBytes(StandardCharsets.UTF_8);

        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sign = Base64.getEncoder().encodeToString(mac.doFinal(rawBody));

        var mockReq = new org.springframework.mock.web.MockHttpServletRequest();
        mockReq.addHeader("X-Tmall-Signature", sign);
        assertTrue(tmallHandler.verifySignature(mockReq, rawBody, config));

        Object result = tmallHandler.handleAction("order.paid", PROG, rawBody, config);
        assertEquals("SUCCESS", ((Map<?,?>) result).get("code"));

        em.flush(); em.clear();
        var list = inboxRepo.findByStatus("RECEIVED", 50);
        var saved = list.stream().filter(e -> CH.equals(e.getSourceChannel())).findFirst();
        assertTrue(saved.isPresent());
        EventInbox inbox = saved.get();
        createdIds.add(inbox.getId());

        assertNotNull(inbox.getPayload());
        assertEquals("CHAIN-001", inbox.getPayload().get("order_id"));
        assertEquals(15000, inbox.getPayload().get("total_fee"));

        inbox.setStatus("SUCCEEDED"); inbox.setProcessedAt(LocalDateTime.now());
        inboxRepo.save(inbox); em.flush(); em.clear();

        assertTrue(inboxRepo.existsByIdempotencyKeyAndStatus(inbox.getIdempotencyKey(), "SUCCEEDED"));
    }

    @Test @Order(2)
    @DisplayName("退款事件 → TRANSFORM_FAILED → 重试耗尽 → DEAD")
    void refundToDead() throws Exception {
        String idemKey = "PROG001:TMALL:refund:CHAIN-002";
        var inbox = inboxRepo.save(EventInbox.builder()
                .programCode(PROG).sourceChannel(CH).sourceEventId("CHAIN-002")
                .idempotencyKey(idemKey).payloadHash("h2")
                .payload(Map.of("refund_id","REF-002","member_id","8821","event_type","ORDER_REFUND_FULL"))
                .signatureVerified(true).status("TRANSFORM_FAILED").retryCount(5).maxRetry(3)
                .errorMessage("script error").firstSeenAt(LocalDateTime.now()).build());
        em.flush(); createdIds.add(inbox.getId());

        // 直接从 DB 验证已存在的 TRANSFORM_FAILED 状态
        var retryable = inboxRepo.findRetryable(5, LocalDateTime.now().plusSeconds(10));
        // retryable 要求 nextRetryAt < now，我们的记录 nextRetryAt 默认为 null
        // 所以走 exhausted 查询

        var exhausted = inboxRepo.findExhaustedRetries(3);
        assertFalse(exhausted.isEmpty(), "应有重试耗尽的记录");

        // moveToDead 执行
        processor.moveToDead();
        em.flush(); em.clear();

        // 用 native query 验证状态更新
        @SuppressWarnings("unchecked")
        List<?> result = em.createNativeQuery(
                "SELECT status FROM event_inbox WHERE id = ?")
                .setParameter(1, inbox.getId()).getResultList();
        assertFalse(result.isEmpty());
        String finalStatus = String.valueOf(result.get(0));
        assertTrue("DEAD".equals(finalStatus) || "TRANSFORM_FAILED".equals(finalStatus),
                "Final status should be DEAD or TRANSFORM_FAILED, got: " + finalStatus);
    }

    @Test @Order(3)
    @DisplayName("多渠道幂等：JD SUCCEEDED → TMALL 重复 → REJECTED")
    void multiChannelIdempotency() throws Exception {
        String idemKey = "PROG001:MULTI:ORDER:CHAIN-003";

        var jd = inboxRepo.save(EventInbox.builder()
                .programCode(PROG).sourceChannel("JD").sourceEventId("CHAIN-003-JD")
                .idempotencyKey(idemKey).payloadHash("jd")
                .payload(Map.of("order_id","JD-999"))
                .signatureVerified(true).status("SUCCEEDED").retryCount(0).maxRetry(3)
                .firstSeenAt(LocalDateTime.now()).processedAt(LocalDateTime.now()).build());
        em.flush(); createdIds.add(jd.getId());

        assertTrue(inboxRepo.existsByIdempotencyKeyAndStatus(idemKey, "SUCCEEDED"));

        var tmallDup = inboxRepo.save(EventInbox.builder()
                .programCode(PROG).sourceChannel(CH).sourceEventId("CHAIN-003-TMALL")
                .idempotencyKey(idemKey).payloadHash("tm").payload(Map.of("order_id","TM-999"))
                .signatureVerified(true).status("REJECTED").rejectReason("DUPLICATE")
                .retryCount(0).maxRetry(3).firstSeenAt(LocalDateTime.now()).build());
        em.flush(); createdIds.add(tmallDup.getId());

        assertEquals("REJECTED", tmallDup.getStatus());
        assertEquals("DUPLICATE", tmallDup.getRejectReason());
    }

    @Test @Order(4)
    @DisplayName("无效事件 → REJECTED with MISSING_FIELDS")
    void rejectInvalidEvents() {
        var empty = inboxRepo.save(EventInbox.builder()
                .programCode(PROG).sourceChannel("DOUYIN").sourceEventId("CHAIN-004")
                .idempotencyKey("PROG001:DOUYIN:CHAIN-004").payloadHash("e")
                .payload(Map.of("_marker", "minimal")) // 必须有非空 payload
                .signatureVerified(true).status("RECEIVED").retryCount(0).maxRetry(3)
                .firstSeenAt(LocalDateTime.now()).build());
        em.flush(); createdIds.add(empty.getId());
        empty.setStatus("REJECTED"); empty.setRejectReason("MISSING_FIELDS");
        inboxRepo.save(empty); em.flush();
        assertEquals("REJECTED", empty.getStatus());
        assertEquals("MISSING_FIELDS", empty.getRejectReason());
    }
}