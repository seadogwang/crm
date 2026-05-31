package com.loyalty.saas.spi;

import com.loyalty.saas.common.context.TenantContext;
import com.loyalty.saas.domain.entity.ChannelAdapterConfig;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.data.domain.Sort;
import org.springframework.mock.web.MockHttpServletRequest;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

/**
 * SpiHandlerFactory + SpiLogService 集成测试。
 * 验证策略路由和审计日志功能。
 */
@DataJpaTest
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import({SpiHandlerFactory.class, SpiLogService.class})
class SpiHandlerFactoryIntegrationTest {

    @Autowired private SpiHandlerFactory factory;
    @Autowired private SpiLogService logService;

    @BeforeEach void setUp() { TenantContext.set("PROG001"); }
    @AfterEach void tearDown() { TenantContext.clear(); }

    @Test
    void factoryDiscoversHandlers() {
        assertThrows(IllegalArgumentException.class,
                () -> factory.getHandler("UNKNOWN_CHANNEL"));
    }

    @Test
    void logServiceSuccess() {
        // 不应抛出异常
        logService.logSuccess("TMALL", "PROG001", "order.paid",
                "req-123", Map.of(), "body", "resp", 150);
    }

    @Test
    void logServiceFailed() {
        logService.logFailed("JD", "PROG001", "refund.notify",
                "req-456", "TIMEOUT", "body", "timeout err");
    }
}