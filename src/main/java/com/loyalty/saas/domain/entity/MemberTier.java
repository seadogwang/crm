package com.loyalty.saas.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Objects;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor
class MemberTierId implements Serializable {
    private String programCode;
    private Long memberId;
    @Override public boolean equals(Object o) {
        if (!(o instanceof MemberTierId that)) return false;
        return Objects.equals(programCode, that.programCode) && Objects.equals(memberId, that.memberId);
    }
    @Override public int hashCode() { return Objects.hash(programCode, memberId); }
}

@Entity
@Table(name = "member_tier")
@IdClass(MemberTierId.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MemberTier implements Serializable {

    @Id @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    @Id @Column(name = "member_id", nullable = false)
    private Long memberId;

    @Column(name = "current_tier", nullable = false, length = 50)
    private String currentTier;

    @Column(name = "previous_tier", length = 50)
    private String previousTier;

    @Column(name = "upgrade_source_event_id", length = 100)
    private String upgradeSourceEventId;

    @Column(name = "effective_date", nullable = false)
    private LocalDate effectiveDate;

    @Column(name = "next_evaluation_date")
    private LocalDate nextEvaluationDate;

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();
}