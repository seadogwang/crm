package com.loyalty.platform.api.dto;

import lombok.Data;
import java.util.Map;

/**
 * Formily Schema 响应模型 — 包含 JSON Schema 和 UI Schema。
 */
@Data
public class FormilySchema {
    /** JSON Schema (描述数据结构) */
    private Map<String, Object> schema;

    /** UI Schema (描述渲染方式) */
    private Map<String, Object> uiSchema;
}