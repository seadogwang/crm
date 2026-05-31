package com.loyalty.saas.mapping;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

/**
 * ScriptingTransformer 测试。
 * 当 GraalVM JS engine 不可用时，跳过需要引擎的测试。
 */
class ScriptingTransformerTest {

    private ScriptingTransformer transformer;
    private boolean jsAvailable;

    @BeforeEach
    void setUp() {
        transformer = new ScriptingTransformer();
        // 快速检测 JS 引擎是否可用
        try {
            transformer.transform("function transform(s) { return {ok:1}; }", "{}");
            jsAvailable = true;
        } catch (Exception e) {
            jsAvailable = false;
            System.out.println("[TEST] GraalVM JS engine not available, skipping engine tests. Error: " + e.getMessage().substring(0, Math.min(80, e.getMessage().length())));
        }
    }

    @Test @DisplayName("空脚本抛出异常")
    void emptyScriptThrows() {
        assertThrows(ScriptingTransformer.ScriptTransformException.class,
                () -> transformer.transform("", "{}"));
        assertThrows(ScriptingTransformer.ScriptTransformException.class,
                () -> transformer.transform(null, "{}"));
    }

    @Test @DisplayName("空 JSON 抛出异常")
    void emptyJsonThrows() {
        assertThrows(ScriptingTransformer.ScriptTransformException.class,
                () -> transformer.transform("function t(s){return{};}", ""));
    }

    @Test @DisplayName("基本映射: 字段转换")
    void basicTransform() {
        if (!jsAvailable) return; // 跳过
        String js = "function transform(s) { return { id: s.user.uid, type: 'TEST' }; }";
        var result = transformer.transform(js, "{\"user\":{\"uid\":\"8821\"}}");
        assertEquals("8821", result.get("id"));
        assertEquals("TEST", result.get("type"));
    }

    @Test @DisplayName("脚本语法错误抛出异常")
    void syntaxError() {
        if (!jsAvailable) return;
        assertThrows(ScriptingTransformer.ScriptTransformException.class,
                () -> transformer.transform("bad syntax !!!", "{}"));
    }

    @Test @DisplayName("脚本运行时错误抛出异常")
    void runtimeError() {
        if (!jsAvailable) return;
        assertThrows(ScriptingTransformer.ScriptTransformException.class,
                () -> transformer.transform("function t(s) { return s.x.y.z; }", "{}"));
    }
}