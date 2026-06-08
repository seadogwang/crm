package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/** account_transaction 复合主键 — 已废弃，实际表使用单列 PK。保留仅为兼容。 */
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
class AccountTransactionId implements Serializable {
    private Long id;
    private LocalDateTime createdAt;
    @Override public boolean equals(Object o) {
        if (!(o instanceof AccountTransactionId that)) return false;
        return Objects.equals(id, that.id) && Objects.equals(createdAt, that.createdAt);
    }
    @Override public int hashCode() { return Objects.hash(id, createdAt); }
}

/**
 * 积分流水表实体 — 匹配 loyalty_dev 数据库实际 schema。
 *
 * <p>单列主键 id，通过 account_id 外键关联 member_account。
 * 多租户隔离依赖 PostgreSQL RLS Policy。
 */
@Entity
@Table(name = "account_transaction")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class AccountTransaction implements Serializable {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 关联 member_account.account_id */
    @Column(name = "account_id", nullable = false)
    private Long accountId;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "account_type", nullable = false, length = 50)
    private String accountType;

    /** 交易类型: ACCRUAL / REDEMPTION / EXPIRATION / REVERSAL / ADJUSTMENT */
    @Column(name = "transaction_type", nullable = false, length = 20)
    private String transactionType;

    /** 变动金额（正入负出） */
    @Column(name = "amount", nullable = false, precision = 18, scale = 4)
    private BigDecimal amount;

    /** 剩余可用额度 */
    @Column(name = "remaining_amount", precision = 18, scale = 4)
    private BigDecimal remainingAmount;

    /** 过期时间 */
    @Column(name = "expires_at")
    private LocalDateTime expiresAt;

    /** 流水状态: ACTIVE / EXHAUSTED / EXPIRED / REVERSED / REVERSED_BY_CASCADE / PENDING */
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "ACTIVE";

    /** 关联事件 ID */
    @Column(name = "reference_event_id", length = 100)
    private String referenceEventId;

    /** 逆向事件 ID */
    @Column(name = "reversed_by_event_id", length = 100)
    private String reversedByEventId;

    /** 逆向类型 */
    @Column(name = "reversal_type", length = 50)
    private String reversalType;

    /** 规则代码 */
    @Column(name = "rule_code", length = 100)
    private String ruleCode;

    /** 规则快照 ID */
    @Column(name = "rule_snapshot_id", length = 64)
    private String ruleSnapshotId;

    /** 规则版本 */
    @Column(name = "rule_version")
    private Integer ruleVersion;

    /** 幂等操作键（可为 null） */
    @Column(name = "operation_key", length = 200)
    private String operationKey;

    /** 扩展属性 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @jakarta.persistence.Column(name = "ext_attributes", columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> extAttributes = new LinkedHashMap<>();

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "order_time")
    private LocalDateTime orderTime;

    @Column(name = "pay_time")
    private LocalDateTime payTime;
}