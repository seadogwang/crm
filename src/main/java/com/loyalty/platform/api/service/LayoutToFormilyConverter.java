package com.loyalty.platform.api.service;

import com.loyalty.platform.api.dto.FormilySchema;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 布局 → Formily Schema 转换器。
 * 将 layout_config JSON 转换为前端 Formily 渲染器可用的 Schema 和 UI Schema。
 *
 * @see Loyalty_member_page_config.md §5.2
 */
@Service
@Slf4j
public class LayoutToFormilyConverter {

    /**
     * 将 layout_config 转换为 Formily Schema。
     *
     * @param layoutConfig 布局配置 JSON Map
     * @return FormilySchema 包含 schema (JSON Schema) 和 uiSchema (x-component 配置)
     */
    @SuppressWarnings("unchecked")
    public FormilySchema convert(Map<String, Object> layoutConfig) {
        FormilySchema result = new FormilySchema();

        // ===== 1. 构建 JSON Schema (数据结构) =====
        Map<String, Object> schema = new LinkedHashMap<>();
        schema.put("type", "object");

        Map<String, Object> properties = new LinkedHashMap<>();

        // ===== 2. 构建 UI Schema =====
        Map<String, Object> uiSchema = new LinkedHashMap<>();
        uiSchema.put("type", "object");

        Map<String, Object> uiProperties = new LinkedHashMap<>();

        List<Map<String, Object>> sections = (List<Map<String, Object>>) layoutConfig.get("sections");
        if (sections == null) {
            log.warn("[LayoutToFormily] layoutConfig 中没有 sections");
            result.setSchema(schema);
            result.setUiSchema(uiSchema);
            return result;
        }

        for (Map<String, Object> section : sections) {
            String sectionId = (String) section.get("id");
            String sectionTitle = (String) section.get("title");
            int columns = section.get("columns") != null ? ((Number) section.get("columns")).intValue() : 2;
            boolean collapsible = section.get("collapsible") != null && (Boolean) section.get("collapsible");

            // 每个分组作为一个嵌套 object
            Map<String, Object> sectionSchema = new LinkedHashMap<>();
            sectionSchema.put("type", "object");
            sectionSchema.put("title", sectionTitle);

            Map<String, Object> sectionProperties = new LinkedHashMap<>();

            // UI: 分组级配置
            Map<String, Object> sectionUi = new LinkedHashMap<>();
            sectionUi.put("type", "object");
            sectionUi.put("title", sectionTitle);
            sectionUi.put("x-component", "FormLayout");
            Map<String, Object> sectionUiProps = new LinkedHashMap<>();
            sectionUiProps.put("layout", "horizontal");
            sectionUiProps.put("labelCol", 4);
            sectionUiProps.put("wrapperCol", 16);
            sectionUi.put("x-component-props", sectionUiProps);

            Map<String, Object> sectionUiProperties = new LinkedHashMap<>();

            List<Map<String, Object>> fields = (List<Map<String, Object>>) section.get("fields");
            if (fields == null) {
                fields = Collections.emptyList();
            }

            for (Map<String, Object> field : fields) {
                String fieldKey = (String) field.get("field_key");
                if (fieldKey == null) continue;

                String component = (String) field.getOrDefault("component", "Input");
                String label = (String) field.getOrDefault("label", fieldKey);
                boolean required = field.get("required") != null && (Boolean) field.get("required");
                boolean readonly = field.get("readonly") != null && (Boolean) field.get("readonly");
                boolean hidden = field.get("hidden") != null && (Boolean) field.get("hidden");
                String placeholder = (String) field.getOrDefault("placeholder", "");
                String helpText = (String) field.getOrDefault("helpText", "");
                int span = field.get("span") != null ? ((Number) field.get("span")).intValue() : 1;

                // 处理嵌套路径 (ext_attributes.xxx)
                String dataPath = fieldKey;
                if (fieldKey.startsWith("ext_attributes.")) {
                    dataPath = fieldKey.substring("ext_attributes.".length());
                }

                // --- JSON Schema ---
                Map<String, Object> fieldSchema = new LinkedHashMap<>();
                fieldSchema.put("type", mapComponentToJsonType(component));
                fieldSchema.put("title", label);

                if (required) {
                    List<String> requiredList = new ArrayList<>();
                    requiredList.add(dataPath);
                    fieldSchema.put("required", requiredList);
                }

                if (hidden) {
                    fieldSchema.put("hidden", true);
                }

                // 处理 options (Select/Radio 组件)
                if (field.containsKey("options")) {
                    List<Map<String, Object>> options = (List<Map<String, Object>>) field.get("options");
                    if (options != null) {
                        List<Map<String, Object>> enumList = new ArrayList<>();
                        for (Map<String, Object> opt : options) {
                            Map<String, Object> enumItem = new LinkedHashMap<>();
                            enumItem.put("label", opt.get("label"));
                            enumItem.put("value", opt.get("value"));
                            enumList.add(enumItem);
                        }
                        fieldSchema.put("enum", enumList);
                    }
                }

                sectionProperties.put(dataPath, fieldSchema);

                // --- UI Schema (x-component) ---
                Map<String, Object> fieldUi = new LinkedHashMap<>();
                fieldUi.put("type", mapComponentToJsonType(component));
                fieldUi.put("title", label);
                fieldUi.put("x-component", mapComponentToAntd(component));
                fieldUi.put("x-decorator", "FormItem");

                // x-component-props
                Map<String, Object> componentProps = new LinkedHashMap<>();
                if (placeholder != null && !placeholder.isEmpty()) {
                    componentProps.put("placeholder", placeholder);
                }
                if (readonly) {
                    componentProps.put("readOnly", true);
                    componentProps.put("disabled", true);
                }
                if (hidden) {
                    componentProps.put("hidden", true);
                }
                if (helpText != null && !helpText.isEmpty()) {
                    componentProps.put("help", helpText);
                }
                if (span > 0) {
                    componentProps.put("span", span);
                }

                // 处理 options (Select/Radio 组件)
                if (field.containsKey("options")) {
                    List<Map<String, Object>> options = (List<Map<String, Object>>) field.get("options");
                    if (options != null) {
                        componentProps.put("options", options);
                    }
                }

                fieldUi.put("x-component-props", componentProps);

                // x-decorator-props
                Map<String, Object> decoratorProps = new LinkedHashMap<>();
                if (required) {
                    List<Map<String, Object>> rules = new ArrayList<>();
                    Map<String, Object> requiredRule = new LinkedHashMap<>();
                    requiredRule.put("required", true);
                    requiredRule.put("message", label + " 为必填项");
                    rules.add(requiredRule);
                    decoratorProps.put("rules", rules);
                }
                if (!decoratorProps.isEmpty()) {
                    fieldUi.put("x-decorator-props", decoratorProps);
                }

                sectionUiProperties.put(dataPath, fieldUi);
            }

            sectionSchema.put("properties", sectionProperties);
            properties.put(sectionId, sectionSchema);

            sectionUi.put("properties", sectionUiProperties);
            uiProperties.put(sectionId, sectionUi);
        }

        schema.put("properties", properties);
        uiSchema.put("properties", uiProperties);

        // 应用 fieldConfigOverrides
        applyFieldConfigOverrides(layoutConfig, schema, uiSchema);

        result.setSchema(schema);
        result.setUiSchema(uiSchema);
        return result;
    }

    /**
     * 应用 fieldConfigOverrides 覆盖默认配置
     */
    @SuppressWarnings("unchecked")
    private void applyFieldConfigOverrides(Map<String, Object> layoutConfig,
                                            Map<String, Object> schema,
                                            Map<String, Object> uiSchema) {
        Map<String, Object> overrides = (Map<String, Object>) layoutConfig.get("fieldConfigOverrides");
        if (overrides == null) return;

        for (Map.Entry<String, Object> entry : overrides.entrySet()) {
            String fieldKey = entry.getKey();
            String dataPath = fieldKey.startsWith("ext_attributes.")
                    ? fieldKey.substring("ext_attributes.".length())
                    : fieldKey;

            Map<String, Object> override = (Map<String, Object>) entry.getValue();
            if (override == null) continue;

            // 在 schema 和 uiSchema 中查找并覆盖对应字段
            Map<String, Object> properties = (Map<String, Object>) schema.get("properties");
            Map<String, Object> uiProperties = (Map<String, Object>) uiSchema.get("properties");
            if (properties == null || uiProperties == null) continue;

            for (String sectionId : properties.keySet()) {
                Map<String, Object> sectionSchema = (Map<String, Object>) properties.get(sectionId);
                Map<String, Object> sectionProps = (Map<String, Object>) sectionSchema.get("properties");
                if (sectionProps != null && sectionProps.containsKey(dataPath)) {
                    // 覆盖 schema
                    Map<String, Object> fieldSchema = (Map<String, Object>) sectionProps.get(dataPath);
                    if (override.containsKey("label")) {
                        fieldSchema.put("title", override.get("label"));
                    }
                    if (override.containsKey("required")) {
                        fieldSchema.put("required", override.get("required"));
                    }
                    if (override.containsKey("hidden")) {
                        fieldSchema.put("hidden", override.get("hidden"));
                    }
                    if (override.containsKey("readonly")) {
                        fieldSchema.put("readonly", override.get("readonly"));
                    }
                }

                // 覆盖 uiSchema
                Map<String, Object> sectionUi = (Map<String, Object>) uiProperties.get(sectionId);
                if (sectionUi == null) continue;
                Map<String, Object> sectionUiProps = (Map<String, Object>) sectionUi.get("properties");
                if (sectionUiProps != null && sectionUiProps.containsKey(dataPath)) {
                    Map<String, Object> fieldUi = (Map<String, Object>) sectionUiProps.get(dataPath);
                    if (override.containsKey("label")) {
                        fieldUi.put("title", override.get("label"));
                    }
                    if (override.containsKey("component")) {
                        fieldUi.put("x-component", mapComponentToAntd((String) override.get("component")));
                    }

                    Map<String, Object> compProps = (Map<String, Object>) fieldUi.get("x-component-props");
                    if (compProps == null) {
                        compProps = new LinkedHashMap<>();
                        fieldUi.put("x-component-props", compProps);
                    }
                    if (override.containsKey("placeholder")) {
                        compProps.put("placeholder", override.get("placeholder"));
                    }
                    if (override.containsKey("readonly")) {
                        compProps.put("readOnly", override.get("readonly"));
                    }
                    if (override.containsKey("hidden")) {
                        compProps.put("hidden", override.get("hidden"));
                    }
                    if (override.containsKey("helpText")) {
                        compProps.put("help", override.get("helpText"));
                    }
                }
            }
        }
    }

    // ==================== 组件映射 ====================

    private String mapComponentToAntd(String component) {
        if (component == null) return "Input";
        return switch (component) {
            case "Input" -> "Input";
            case "InputNumber" -> "NumberPicker";
            case "Select" -> "Select";
            case "DatePicker" -> "DatePicker";
            case "Text" -> "Text";
            case "Switch" -> "Switch";
            case "Radio" -> "Radio";
            case "TextArea" -> "Input.TextArea";
            case "Checkbox" -> "Checkbox";
            case "Divider" -> "Divider";
            case "Title" -> "Title";
            case "Remark" -> "Input.TextArea";
            default -> "Input";
        };
    }

    private String mapComponentToJsonType(String component) {
        if (component == null) return "string";
        return switch (component) {
            case "InputNumber" -> "number";
            case "Switch", "Checkbox" -> "boolean";
            case "DatePicker" -> "string";
            case "Select", "Radio" -> "string";
            default -> "string";
        };
    }
}