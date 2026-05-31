package com.loyalty.saas.domain.converter;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

@DisplayName("JsonbConverter 单元测试")
class JsonbConverterTest {

    private final JsonbConverter converter = new JsonbConverter();

    @Test
    @DisplayName("序列化 Map 为 JSON 字符串")
    void shouldSerializeMapToJson() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("name", "张三");
        map.put("age", 30);
        map.put("_schema_version", "v1.2.0");

        String json = converter.convertToDatabaseColumn(map);
        assertNotNull(json);
        assertTrue(json.contains("\"name\":\"张三\""));
        assertTrue(json.contains("\"_schema_version\":\"v1.2.0\""));
    }

    @Test
    @DisplayName("反序列化 JSON 字符串为 Map")
    void shouldDeserializeJsonToMap() {
        String json = "{\"name\":\"李四\",\"level\":5}";
        Map<String, Object> map = converter.convertToEntityAttribute(json);
        assertEquals("李四", map.get("name"));
        assertEquals(5, map.get("level"));
    }

    @Test
    @DisplayName("null 输入返回 null")
    void shouldReturnNullForNullInput() {
        assertNull(converter.convertToDatabaseColumn(null));
    }

    @Test
    @DisplayName("空 Map 返回 null")
    void shouldReturnNullForEmptyMap() {
        assertNull(converter.convertToDatabaseColumn(Map.of()));
    }

    @Test
    @DisplayName("null/空字符串返回空 Map")
    void shouldReturnEmptyMapForNullOrBlank() {
        assertTrue(converter.convertToEntityAttribute(null).isEmpty());
        assertTrue(converter.convertToEntityAttribute("").isEmpty());
        assertTrue(converter.convertToEntityAttribute("   ").isEmpty());
    }

    @Test
    @DisplayName("往返转换：序列化→反序列化保持一致")
    void shouldRoundTripCorrectly() {
        Map<String, Object> original = new LinkedHashMap<>();
        original.put("pet_name", "旺财");
        original.put("shoe_size", 42);
        original.put("nested", Map.of("key", "value"));

        String json = converter.convertToDatabaseColumn(original);
        Map<String, Object> restored = converter.convertToEntityAttribute(json);

        assertEquals("旺财", restored.get("pet_name"));
        assertEquals(42, restored.get("shoe_size"));
    }
}