package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "member_account")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MemberAccount {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "account_id")
    private Long accountId;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "account_type", nullable = false, length = 50)
    private String accountType;

    /** 实时余额（与设计文档不同，此 DB 维护了 balance 字段） */
    @Column(name = "balance", nullable = false, precision = 20, scale = 2)
    @Builder.Default
    private BigDecimal balance = BigDecimal.ZERO;

    /** 累计获得（只增不减，报表用） */
    @Column(name = "total_accrued", precision = 20, scale = 2)
    @Builder.Default
    private BigDecimal totalAccrued = BigDecimal.ZERO;

    /** 累计消耗（只增不减，报表用） */
    @Column(name = "total_redeemed", precision = 20, scale = 2)
    @Builder.Default
    private BigDecimal totalRedeemed = BigDecimal.ZERO;

    /** 乐观锁版本号 */
    @Version
    @Column(name = "version", nullable = false)
    @Builder.Default
    private Integer version = 1;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}