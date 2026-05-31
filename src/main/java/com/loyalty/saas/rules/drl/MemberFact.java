package com.loyalty.saas.rules.drl;

import java.util.Map;

/**
 * 会员事实包装器 — 插入 Drools KieSession 的对象。
 *
 * <p>Drools 默认基于强类型 POJO 进行模式匹配。DRL 脚本通过此包装器
 * 提供的辅助方法提取 JSONB 动态属性，避免直接操作 {@code Map}。
 *
 * <p>DRL 使用示例：
 * <pre>{@code
 * $m : MemberFact(memberId == $event.memberId, getExtNumber("shoe_size") > 40)
 * }</pre>
 *
 * <p><b>线程安全</b>：每个 KieSession 使用独立的 MemberFact 实例，无共享状态。
 */
public class MemberFact {

    private String programCode;
    private Long memberId;
    private String tierCode;
    private String status;
    private Map<String, Object> extAttributes;

    public MemberFact() {}

    public MemberFact(String programCode, Long memberId, String tierCode,
                      String status, Map<String, Object> extAttributes) {
        this.programCode = programCode;
        this.memberId = memberId;
        this.tierCode = tierCode;
        this.status = status;
        this.extAttributes = extAttributes;
    }

    // ---- DRL 辅助提取方法 ----

    /**
     * 从动态属性中提取字符串值。DRL 可直接调用: {@code getExtString("pet_name")}
     */
    public String getExtString(String key) {
        return extAttributes != null && extAttributes.containsKey(key)
                ? String.valueOf(extAttributes.get(key)) : null;
    }

    /**
     * 从动态属性中提取数值。DRL 可直接调用: {@code getExtNumber("shoe_size") > 40}
     */
    public Double getExtNumber(String key) {
        if (extAttributes == null || !extAttributes.containsKey(key)) return 0.0;
        return Double.valueOf(String.valueOf(extAttributes.get(key)));
    }

    /**
     * 从动态属性中提取布尔值。
     */
    public Boolean getExtBool(String key) {
        if (extAttributes == null || !extAttributes.containsKey(key)) return false;
        return Boolean.parseBoolean(String.valueOf(extAttributes.get(key)));
    }

    /**
     * 检查动态属性是否包含指定 key。
     */
    public boolean hasExt(String key) {
        return extAttributes != null && extAttributes.containsKey(key);
    }

    // ---- Getters/Setters (Drools 通过 getter 访问字段) ----

    public String getProgramCode() { return programCode; }
    public void setProgramCode(String programCode) { this.programCode = programCode; }

    public Long getMemberId() { return memberId; }
    public void setMemberId(Long memberId) { this.memberId = memberId; }

    public String getTierCode() { return tierCode; }
    public void setTierCode(String tierCode) { this.tierCode = tierCode; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public Map<String, Object> getExtAttributes() { return extAttributes; }
    public void setExtAttributes(Map<String, Object> extAttributes) { this.extAttributes = extAttributes; }
}