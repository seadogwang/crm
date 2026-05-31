package com.loyalty.saas.spi;

import com.loyalty.saas.domain.entity.ChannelAdapterConfig;
import jakarta.servlet.http.HttpServletRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("SpiHandlerFactory 单元测试")
class SpiHandlerFactoryTest {

    private SpiHandlerFactory factory;

    @BeforeEach
    void setUp() {
        var handler = new TestHandler();
        factory = new SpiHandlerFactory(List.of(handler));
    }

    @Test @DisplayName("按渠道代码获取处理器")
    void getHandler() {
        ChannelSpiHandler h = factory.getHandler("TEST");
        assertNotNull(h);
        assertEquals("TEST", h.getChannelCode());
    }

    @Test @DisplayName("不区分大小写")
    void caseInsensitive() {
        assertNotNull(factory.getHandler("test"));
        assertNotNull(factory.getHandler("Test"));
    }

    @Test @DisplayName("未注册渠道抛出异常")
    void unknownChannel() {
        assertThrows(IllegalArgumentException.class, () -> factory.getHandler("UNKNOWN"));
    }

    static class TestHandler implements ChannelSpiHandler {
        @Override public String getChannelCode() { return "TEST"; }
        @Override public boolean verifySignature(HttpServletRequest r, byte[] body, ChannelAdapterConfig c) { return true; }
        @Override public Object handleAction(String a, String p, byte[] body, ChannelAdapterConfig c) { return Map.of("ok", true); }
        @Override public Object buildErrorResponse(Exception e) { return Map.of("error", e.getMessage()); }
    }
}