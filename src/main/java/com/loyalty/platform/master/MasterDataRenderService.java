package com.loyalty.platform.master;

import com.loyalty.platform.common.context.TenantContext;
import com.loyalty.platform.domain.entity.MasterDataEnum;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 主数据渲染服务 — 代码 ↔ 标签转换，数据库驱动 + 内存缓存。
 */
@Service
public class MasterDataRenderService {

    private static final Logger log = LoggerFactory.getLogger(MasterDataRenderService.class);

    private final MasterDataEnumRepository enumRepo;

    // 简单内存缓存 { programCode: { dataCode: { code: label } } }
    private final Map<String, Map<String, Map<String, String>>> cache = new ConcurrentHashMap<>();

    public MasterDataRenderService(MasterDataEnumRepository enumRepo) {
        this.enumRepo = enumRepo;
    }

    private Map<String, String> loadMapping(String programCode, String dataCode) {
        String key = programCode + "::" + dataCode;
        Map<String, Map<String, String>> progCache = cache.computeIfAbsent(programCode, k -> new ConcurrentHashMap<>());
        return progCache.computeIfAbsent(dataCode, dc -> {
            List<MasterDataEnum> items = enumRepo.findByProgramCodeAndDataCodeAndStatusOrderBySortOrder(
                    programCode, dataCode, "ACTIVE");
            Map<String, String> mapping = new LinkedHashMap<>();
            for (MasterDataEnum e : items) {
                mapping.put(e.getEnumCode(), e.getEnumLabel());
            }
            return mapping;
        });
    }

    public String codeToLabel(String dataCode, String code) {
        if (code == null || dataCode == null) return null;
        String pc = TenantContext.getRequired();
        Map<String, String> mapping = loadMapping(pc, dataCode);
        return mapping.getOrDefault(code, code);
    }

    public String labelToCode(String dataCode, String label) {
        if (label == null || dataCode == null) return null;
        String pc = TenantContext.getRequired();
        Map<String, String> mapping = loadMapping(pc, dataCode);
        for (Map.Entry<String, String> e : mapping.entrySet()) {
            if (e.getValue().equals(label)) return e.getKey();
        }
        return label;
    }

    public List<Map<String, String>> getOptions(String dataCode) {
        String pc = TenantContext.getRequired();
        Map<String, String> mapping = loadMapping(pc, dataCode);
        return mapping.entrySet().stream()
                .map(e -> Map.of("code", e.getKey(), "label", e.getValue()))
                .toList();
    }

    @SuppressWarnings("unchecked")
    public Object renderFieldValue(Object rawValue, Map<String, Object> masterDataConfig) {
        if (masterDataConfig == null || rawValue == null) return rawValue;
        String dataCode = (String) masterDataConfig.get("dataCode");
        String dataType = (String) masterDataConfig.getOrDefault("dataType", "ENUM");
        if ("ENUM".equals(dataType)) {
            return codeToLabel(dataCode, String.valueOf(rawValue));
        }
        return rawValue;
    }

    @SuppressWarnings("unchecked")
    public Map<String, Object> renderMemberFields(Map<String, Object> rawValues, Map<String, Object> fieldSchema) {
        Map<String, Object> rendered = new LinkedHashMap<>(rawValues);
        Map<String, Object> properties = (Map<String, Object>) fieldSchema.get("properties");
        if (properties == null) return rendered;

        for (Map.Entry<String, Object> entry : properties.entrySet()) {
            String fieldName = entry.getKey();
            Map<String, Object> fieldDef = (Map<String, Object>) entry.getValue();
            Map<String, Object> masterConfig = (Map<String, Object>) fieldDef.get("x-master-data");
            if (masterConfig != null && rendered.containsKey(fieldName)) {
                Object converted = renderFieldValue(rendered.get(fieldName), masterConfig);
                rendered.put(fieldName, converted);
            }
        }
        return rendered;
    }

    /** 清空缓存（数据变更时调用） */
    public void clearCache(String programCode, String dataCode) {
        Map<String, Map<String, String>> progCache = cache.get(programCode);
        if (progCache != null) {
            progCache.remove(dataCode);
        }
    }
}
