package com.loyalty.saas.common.exception;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("BusinessException 单元测试")
class BusinessExceptionTest {

    @Test @DisplayName("构造带错误码和消息的异常")
    void constructor() {
        var e = new BusinessException("ERR_TEST", "test message");
        assertEquals("ERR_TEST", e.getCode());
        assertEquals("test message", e.getMessage());
    }

    @Test @DisplayName("构造带 cause 的异常")
    void withCause() {
        var cause = new RuntimeException("root");
        var e = new BusinessException("ERR_WRAP", "wrapped", cause);
        assertEquals("ERR_WRAP", e.getCode());
        assertSame(cause, e.getCause());
    }
}