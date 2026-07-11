package com.loyalty.platform.domain.entity;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.Map;

/**
 * 变量事实对象 — 插入 Drools 会话供规则条件使用。
 *
 * <p>设计文档 point_design_update.md §6.4/§8：
 * 在 DRL 中通过 {@code VariableFact(getValue("total_act") >= 1000)} 引用变量值。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 2.0.0
 */
public class VariableFact {

    private final Map<String, BigDecimal> values;

    public VariableFact(Map<String, BigDecimal> values) {
        this.values = values != null ? Collections.unmodifiableMap(values) : Collections.emptyMap();
    }

    /**
     * 获取变量值（供 Drools 规则使用）。
     *
     * @param varCode 变量编码
     * @return 变量值，不存在时返回 0
     */
    public BigDecimal getValue(String varCode) {
        return values.getOrDefault(varCode, BigDecimal.ZERO);
    }

    /**
     * 检查变量是否存在。
     */
    public boolean hasVariable(String varCode) {
        return values.containsKey(varCode);
    }

    /**
     * 获取所有变量值（只读）。
     */
    public Map<String, BigDecimal> getValues() {
        return values;
    }

    @Override
    public String toString() {
        return "VariableFact" + values;
    }
}