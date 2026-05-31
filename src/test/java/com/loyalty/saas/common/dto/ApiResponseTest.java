package com.loyalty.saas.common.dto;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("ApiResponse 单元测试")
class ApiResponseTest {

    @Test @DisplayName("success 响应包含 SUCCESS 码和数据")
    void successResponse() {
        var resp = ApiResponse.success("hello");
        assertEquals("SUCCESS", resp.getCode());
        assertEquals("hello", resp.getData());
        assertNotNull(resp.getTraceId());
        assertNotNull(resp.getTimestamp());
    }

    @Test @DisplayName("error 响应包含错误码")
    void errorResponse() {
        var resp = ApiResponse.error("ERR_INSUFFICIENT_POINTS", "积分不足");
        assertEquals("ERR_INSUFFICIENT_POINTS", resp.getCode());
        assertEquals("积分不足", resp.getMessage());
        assertNull(resp.getData());
    }

    @Test @DisplayName("trace_id 每次不同")
    void uniqueTraceId() {
        var r1 = ApiResponse.success(null);
        var r2 = ApiResponse.success(null);
        assertNotEquals(r1.getTraceId(), r2.getTraceId());
    }
}