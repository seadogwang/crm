package com.loyalty.platform.master;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 主数据渲染服务 — 代码 ↔ 标签转换。
 *
 * <p>设计文档 MasterData.md §5.1：
 * 根据 program_schema 中字段的 x-master-data 配置，自动完成枚举值转换。
 */
@Service
public class MasterDataRenderService {

    private static final Logger log = LoggerFactory.getLogger(MasterDataRenderService.class);

    // 内存中的映射表（后续可改为数据库查询 + 缓存）
    private static final Map<String, Map<String, String>> CODE_TO_LABEL = new LinkedHashMap<>();
    private static final Map<String, Map<String, String>> LABEL_TO_CODE = new LinkedHashMap<>();

    static {
        register("GENDER", Map.of("MALE", "男", "FEMALE", "女", "UNKNOWN", "未知"));
        register("CHANNEL", Map.of("TMALL", "天猫", "JD", "京东", "DOUYIN", "抖音", "WECHAT_MINI", "微信小程序"));
        register("ORDER_STATUS", Map.of("WAIT_BUYER_PAY", "待付款", "WAIT_SELLER_SEND_GOODS", "待发货", "WAIT_BUYER_CONFIRM_GOODS", "待收货", "TRADE_FINISHED", "已完成", "TRADE_CLOSED", "已关闭"));
        register("MEMBER_STATUS", Map.of("ENROLLED", "已入会", "SUSPENDED", "已冻结", "DEACTIVATED", "已停用", "MERGED", "已合并"));
    }

    private static void register(String dataCode, Map<String, String> mapping) {
        CODE_TO_LABEL.put(dataCode, new LinkedHashMap<>(mapping));
        Map<String, String> reverse = new LinkedHashMap<>();
        mapping.forEach((k, v) -> reverse.put(v, k));
        LABEL_TO_CODE.put(dataCode, reverse);
    }

    /**
     * 代码 → 标签（枚举型）
     */
    public String codeToLabel(String dataCode, String code) {
        if (code == null || dataCode == null) return null;
        Map<String, String> mapping = CODE_TO_LABEL.getOrDefault(dataCode, Map.of());
        return mapping.getOrDefault(code, code);
    }

    /**
     * 标签 → 代码（枚举型）
     */
    public String labelToCode(String dataCode, String label) {
        if (label == null || dataCode == null) return null;
        Map<String, String> mapping = LABEL_TO_CODE.getOrDefault(dataCode, Map.of());
        return mapping.getOrDefault(label, label);
    }

    /**
     * 获取枚举选项列表
     */
    public List<Map<String, String>> getOptions(String dataCode) {
        Map<String, String> mapping = CODE_TO_LABEL.getOrDefault(dataCode, Map.of());
        List<Map<String, String>> options = new ArrayList<>();
        mapping.forEach((code, label) -> options.add(Map.of("code", code, "label", label)));
        return options;
    }

    /**
     * 根据字段的 x-master-data 配置，转换字段值
     */
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

    /**
     * 批量渲染：将 member 的 ext_attributes 中的主数据字段值转换为标签
     */
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
}