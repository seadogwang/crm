package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.Map;

@Entity @Table(name = "point_type_definition")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PointTypeDefinition {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Column(name = "program_code", nullable = false, length = 100) private String programCode;
    @Column(name = "type_code", nullable = false, length = 50) private String typeCode;
    @Column(name = "type_name", length = 100) private String typeName;
    @Column(name = "description", columnDefinition = "text") private String description;
    // 新增：积分分类 (ASSET / CONTRIBUTION / RECORD)
    @Column(name = "point_category", length = 20) @Builder.Default private String pointCategory = "ASSET";
    @Column(name = "is_redeemable") @Builder.Default private Boolean isRedeemable = true;
    @Column(name = "is_tier_calc") @Builder.Default private Boolean isTierCalc = false;
    @Column(name = "is_transferable") @Builder.Default private Boolean isTransferable = false;
    @Column(name = "allow_negative") @Builder.Default private Boolean allowNegative = false;
    @Column(name = "allow_repay") @Builder.Default private Boolean allowRepay = false;
    @Column(name = "expiry_days") @Builder.Default private Integer expiryDays = 365;

    // 新增：有效期模式 (FIXED_DAYS / CALENDAR_MONTHS / CALENDAR_YEARS)
    @Column(name = "expiry_mode", length = 30) @Builder.Default private String expiryMode = "FIXED_DAYS";
    // 新增：有效期值（天数/月数/年数）
    @Column(name = "expiry_value") @Builder.Default private Integer expiryValue = 365;
    // 新增：是否在前端可见
    @Column(name = "is_visible") @Builder.Default private Boolean isVisible = true;
    // 新增：透支上限（默认值，实际每会员账户可覆盖）
    @Column(name = "overdraft_limit", precision = 20, scale = 4) @Builder.Default private java.math.BigDecimal overdraftLimit = java.math.BigDecimal.ZERO;
    // 新增：授信额度（默认值，实际每会员账户可覆盖）
    @Column(name = "credit_limit", precision = 20, scale = 4) @Builder.Default private java.math.BigDecimal creditLimit = java.math.BigDecimal.ZERO;

    @Column(name = "sort_order") @Builder.Default private Integer sortOrder = 0;

    @Column(name = "config_json", columnDefinition = "jsonb")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private Map<String, Object> configJson;
    @Column(name = "status", length = 20) @Builder.Default private String status = "ACTIVE";
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
}