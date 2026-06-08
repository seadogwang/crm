package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "redemption_allocation")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RedemptionAllocation {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    /** 核销流水 ID → account_transaction.id */
    @Column(name = "redemption_transaction_id", nullable = false)
    private Long redemptionTransactionId;

    /** 原始发分流水 ID → account_transaction.id */
    @Column(name = "accrual_transaction_id", nullable = false)
    private Long accrualTransactionId;

    @Column(name = "allocated_amount", nullable = false, precision = 18, scale = 4)
    private BigDecimal allocatedAmount;

    /** FIFO 分配顺序 */
    @Column(name = "allocation_order", nullable = false)
    private Integer allocationOrder;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();
}