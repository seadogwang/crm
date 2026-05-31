package com.loyalty.saas.common.context;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * TenantContext 单元测试 —— 验证 ThreadLocal 生命周期管理。
 */
@DisplayName("TenantContext 单元测试")
class TenantContextTest {

    @AfterEach
    void tearDown() {
        TenantContext.clear(); // 保证测试间隔离
    }

    @Test
    @DisplayName("设置并获取租户代码")
    void shouldSetAndGetProgramCode() {
        TenantContext.set("PROG001");
        assertEquals("PROG001", TenantContext.get());
        assertEquals("PROG001", TenantContext.getRequired());
    }

    @Test
    @DisplayName("清除租户上下文后返回 null")
    void shouldReturnNullAfterClear() {
        TenantContext.set("PROG001");
        TenantContext.clear();
        assertNull(TenantContext.get());
        assertFalse(TenantContext.isSet());
    }

    @Test
    @DisplayName("未设置时 getRequired 抛出异常")
    void shouldThrowWhenNotSet() {
        assertThrows(IllegalStateException.class, TenantContext::getRequired);
    }

    @Test
    @DisplayName("设置 null 值应抛出异常")
    void shouldRejectNullProgramCode() {
        assertThrows(IllegalArgumentException.class, () -> TenantContext.set(null));
        assertThrows(IllegalArgumentException.class, () -> TenantContext.set("  "));
    }

    @Test
    @DisplayName("线程隔离：不同线程互不影响")
    void shouldBeThreadIsolated() throws Exception {
        TenantContext.set("MAIN");

        final String[] capturedInChild = {null};
        Thread child = new Thread(() -> {
            capturedInChild[0] = TenantContext.get(); // 应为 null
            TenantContext.set("CHILD");
        });
        child.start();
        child.join();

        assertNull(capturedInChild[0], "子线程不应看到主线程的租户");
        assertEquals("MAIN", TenantContext.get(), "主线程租户不应被子线程污染");
    }

    @Test
    @DisplayName("快照捕获与恢复")
    void shouldCaptureAndRestore() {
        TenantContext.set("PROG001");
        TenantContext.TenantSnapshot snapshot = TenantContext.capture();
        assertEquals("PROG001", snapshot.programCode());

        TenantContext.clear();
        assertNull(TenantContext.get());

        snapshot.restore();
        assertEquals("PROG001", TenantContext.get());
    }

    @Test
    @DisplayName("isSet 正确反映状态")
    void shouldReflectIsSetCorrectly() {
        assertFalse(TenantContext.isSet());
        TenantContext.set("X");
        assertTrue(TenantContext.isSet());
        TenantContext.clear();
        assertFalse(TenantContext.isSet());
    }
}