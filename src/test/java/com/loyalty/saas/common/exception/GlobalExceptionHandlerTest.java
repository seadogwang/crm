package com.loyalty.saas.common.exception;

import com.loyalty.saas.common.dto.ApiResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.web.bind.MethodArgumentNotValidException;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("GlobalExceptionHandler 单元测试")
class GlobalExceptionHandlerTest {

    private GlobalExceptionHandler handler;
    private MockHttpServletRequest request;

    @BeforeEach
    void setUp() {
        handler = new GlobalExceptionHandler();
        request = new MockHttpServletRequest();
        request.setRequestURI("/api/test");
    }

    @Test @DisplayName("BusinessException → HTTP 200 + 业务错误码")
    void handleBusinessException() {
        var e = new BusinessException("ERR_INSUFFICIENT_POINTS", "积分不足");
        ResponseEntity<ApiResponse<Void>> resp = handler.handleBusiness(e, request);

        assertEquals(200, resp.getStatusCode().value());
        assertEquals("ERR_INSUFFICIENT_POINTS", resp.getBody().getCode());
        assertEquals("积分不足", resp.getBody().getMessage());
    }

    @Test @DisplayName("IllegalArgumentException → HTTP 400")
    void handleIllegalArgument() {
        ResponseEntity<ApiResponse<Void>> resp = handler.handleIllegalArg(
                new IllegalArgumentException("bad param"), request);
        assertEquals(400, resp.getStatusCode().value());
    }

    @Test @DisplayName("IllegalStateException → HTTP 403")
    void handleTenantMissing() {
        ResponseEntity<ApiResponse<Void>> resp = handler.handleTenantMissing(
                new IllegalStateException("tenant required"), request);
        assertEquals(403, resp.getStatusCode().value());
    }

    @Test @DisplayName("未知异常 → HTTP 200 (绝不返回 500)")
    void unknownExceptionReturns200() {
        ResponseEntity<ApiResponse<Void>> resp = handler.handleUnknown(
                new RuntimeException("unexpected"), request);
        assertEquals(200, resp.getStatusCode().value()); // 核心约束！
        assertEquals("ERR_INTERNAL", resp.getBody().getCode());
    }
}