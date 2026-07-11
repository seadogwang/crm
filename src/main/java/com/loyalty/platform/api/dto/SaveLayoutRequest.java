package com.loyalty.platform.api.dto;

import lombok.Data;
import java.util.Map;

/**
 * 保存页面布局请求 DTO
 */
@Data
public class SaveLayoutRequest {
    private String programCode;
    private String entityType;
    private String pageType;
    private Map<String, Object> layoutConfig;
    private Map<String, Object> fieldConfig;
}