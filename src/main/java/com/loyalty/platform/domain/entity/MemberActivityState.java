package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Entity
@Table(name = "member_activity_state",
       uniqueConstraints = @UniqueConstraint(columnNames = {"program_code", "member_id", "rule_code"}))
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MemberActivityState {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    @Column(name = "member_id", nullable = false, length = 64)
    private String memberId;

    @Column(name = "rule_code", nullable = false, length = 64)
    private String ruleCode;

    @Column(name = "total_rewarded", precision = 18, scale = 4)
    @Builder.Default
    private BigDecimal totalRewarded = BigDecimal.ZERO;

    @Column(name = "last_updated_at")
    @Builder.Default
    private LocalDateTime lastUpdatedAt = LocalDateTime.now();

}