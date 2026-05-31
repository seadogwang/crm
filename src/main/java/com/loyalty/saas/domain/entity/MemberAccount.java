package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "member_account",
        uniqueConstraints = {@UniqueConstraint(name = "uk_member_account_code_type",
                columnNames = {"program_code", "member_id", "account_type"})})
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

    @Column(name = "balance", nullable = false, precision = 20, scale = 4)
    @Builder.Default
    private BigDecimal balance = BigDecimal.ZERO;

    @Column(name = "total_accrued", precision = 20, scale = 4)
    @Builder.Default
    private BigDecimal totalAccrued = BigDecimal.ZERO;

    @Column(name = "total_redeemed", precision = 20, scale = 4)
    @Builder.Default
    private BigDecimal totalRedeemed = BigDecimal.ZERO;

    @Column(name = "total_expired", precision = 20, scale = 4)
    @Builder.Default
    private BigDecimal totalExpired = BigDecimal.ZERO;

    @Column(name = "overdraft_limit", precision = 20, scale = 4)
    @Builder.Default
    private BigDecimal overdraftLimit = BigDecimal.ZERO;

    @Column(name = "credit_limit", precision = 20, scale = 4)
    @Builder.Default
    private BigDecimal creditLimit = BigDecimal.ZERO;

    @Column(name = "credit_used", precision = 20, scale = 4)
    @Builder.Default
    private BigDecimal creditUsed = BigDecimal.ZERO;

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