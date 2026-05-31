package com.loyalty.saas.spi.handler;

import com.loyalty.saas.domain.entity.ChannelAdapterConfig;
import com.loyalty.saas.domain.entity.EventInbox;
import com.loyalty.saas.domain.repository.EventInboxRepository;
import com.loyalty.saas.common.context.TenantContext;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Sort;
import org.springframework.mock.web.MockHttpServletRequest;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import java.nio.charset.StandardCharsets;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(TmallSpiHandler.class)
class TmallSpiHandlerTest {

    @Autowired private TmallSpiHandler handler;
    @Autowired private EventInboxRepository inboxRepo;
    @PersistenceContext private EntityManager em;

    private ChannelAdapterConfig config;
    private byte[] rawBody;
    private String secret = "test_key";

    @BeforeEach
    void setUp() {
        TenantContext.set("PROG001");
        em.createNativeQuery("SET app.current_program_code = 'PROG001'").executeUpdate();
        config = ChannelAdapterConfig.builder().authConfig(Map.of("app_secret", secret)).build();
        rawBody = "{\"order_id\":\"123\"}".getBytes(StandardCharsets.UTF_8);
    }

    @AfterEach
    void tearDown() {
        var all = inboxRepo.findAllByProgramCode("PROG001", Sort.unsorted());
        for (EventInbox e : all) {
            if ("TMALL".equals(e.getSourceChannel())) inboxRepo.delete(e);
        }
        TenantContext.clear();
    }

    @Test
    void verifySignatureWithCorrectSign() throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sign = Base64.getEncoder().encodeToString(mac.doFinal(rawBody));

        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-Tmall-Signature", sign);

        assertTrue(handler.verifySignature(req, rawBody, config));
    }

    @Test
    void verifySignatureWithWrongSign() {
        MockHttpServletRequest req = new MockHttpServletRequest();
        req.addHeader("X-Tmall-Signature", "bad_sign");
        assertFalse(handler.verifySignature(req, rawBody, config));
    }

    @Test
    void verifySignatureMissingHeader() {
        assertFalse(handler.verifySignature(new MockHttpServletRequest(), rawBody, config));
    }

    @Test
    void handleActionReturnsSuccess() {
        Object result = handler.handleAction("order.paid", "PROG001", rawBody, config);
        assertTrue(result instanceof Map);
        assertEquals("SUCCESS", ((Map<?,?>) result).get("code"));
    }

    @Test
    void buildErrorResponse() {
        Object resp = handler.buildErrorResponse(new RuntimeException("err"));
        assertTrue(resp instanceof Map);
        assertTrue(((Map<?,?>) resp).containsKey("code"));
    }
}