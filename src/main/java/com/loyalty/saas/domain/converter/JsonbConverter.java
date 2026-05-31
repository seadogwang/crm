package com.loyalty.saas.domain.converter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * PostgreSQL JSONB 与 Java {@code Map<String, Object>} 之间的双向转换器。
 *
 * <p>在 Spring Boot 3 / Hibernate 6 环境下，优先使用 {@code @JdbcTypeCode(SqlTypes.JSON)}
 * 注解处理 JSONB 映射。本 Converter 作为备选方案，适用于需要统一 JSON 序列化配置的场景
 * （如统一日期格式、空值处理策略等）。
 *
 * <p>使用方式：
 * <pre>{@code
 * @Convert(converter = JsonbConverter.class)
 * @Column(name = "ext_attributes", columnDefinition = "jsonb")
 * private Map<String, Object> extAttributes = new LinkedHashMap<>();
 * }</pre>
 *
 * <p><b>线程安全</b>：ObjectMapper 是线程安全的，Converter 无实例状态。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Converter(autoApply = true)
public class JsonbConverter implements AttributeConverter<Map<String, Object>, String> {

    private static final Logger log = LoggerFactory.getLogger(JsonbConverter.class);

    /**
     * 共享的 ObjectMapper 实例，配置为支持 Java 8 时间类型。
     */
    private static final ObjectMapper objectMapper = new ObjectMapper()
            .registerModule(new JavaTimeModule());

    /**
     * 类型引用，用于反序列化时的泛型保留。
     */
    private static final TypeReference<LinkedHashMap<String, Object>> MAP_TYPE_REF =
            new TypeReference<>() {};

    /**
     * 将 Java Map 序列化为 PostgreSQL JSONB 字符串。
     *
     * @param attribute 实体中的 Map 属性，可能为 null 或空
     * @return JSON 字符串，null 输入返回 null
     */
    @Override
    public String convertToDatabaseColumn(Map<String, Object> attribute) {
        if (attribute == null || attribute.isEmpty()) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(attribute);
        } catch (JsonProcessingException e) {
            log.error("[JSONB] 序列化失败: attribute={}", attribute, e);
            throw new JsonbConversionException("Failed to serialize JSONB attribute", e);
        }
    }

    /**
     * 将 PostgreSQL JSONB 字符串反序列化为 Java Map。
     *
     * @param dbData 数据库中的 JSONB 字符串，可能为 null
     * @return Map 对象，null 输入返回空 Map（防御性编程）
     */
    @Override
    public Map<String, Object> convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(dbData, MAP_TYPE_REF);
        } catch (JsonProcessingException e) {
            log.error("[JSONB] 反序列化失败: dbData={}", dbData, e);
            throw new JsonbConversionException("Failed to deserialize JSONB attribute", e);
        }
    }

    /**
     * JSONB 转换异常，继承 RuntimeException 以兼容 JPA 规范。
     */
    public static class JsonbConversionException extends RuntimeException {
        public JsonbConversionException(String message, Throwable cause) {
            super(message, cause);
        }
    }
}