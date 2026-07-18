package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "repayment_allocation")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class RepaymentAllocation {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    @Column(name = "member_id", nullable = false)
    private Long memberId;

    /** 用于冲抵的积分流水 ID（REWARD 发放流水） */
    @Column(name = "repayment_tx_id", nullable = false)
    private Long repaymentTxId;

    /** 被冲抵的负债流水 ID（allow_repay=true 的发放流水） */
    @Column(name = "repayable_tx_id", nullable = false)
    private Long repayableTxId;

    /** 本次冲抵金额 */
    @Column(name = "offset_amount", nullable = false, precision = 18, scale = 4)
    private BigDecimal offsetAmount;

    /** 冲抵前负债流水的 remaining_amount 快照 */
    @Column(name = "snapshot_remaining_before", precision = 18, scale = 4)
    private BigDecimal snapshotRemainingBefore;

    /** ACTIVE / COMPENSATED */
    @Column(name = "status", length = 20)
    @Builder.Default
    private String status = "ACTIVE";

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

    @Column(name = "compensated_at")
    private LocalDateTime compensatedAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    public void preUpdate() {
        updatedAt = LocalDateTime.now();
    }
}