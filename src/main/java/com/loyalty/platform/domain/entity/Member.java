package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Objects;

/**
 * 会员主表 (Member) 复合主键 — 匹配实际 DB schema。
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
class MemberId implements Serializable {
    private String programCode;
    private Long memberId;

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MemberId that)) return false;
        return Objects.equals(programCode, that.programCode) && Objects.equals(memberId, that.memberId);
    }
    @Override public int hashCode() { return Objects.hash(programCode, memberId); }
}

/**
 * 会员主表实体 — 匹配 loyalty_dev 数据库实际 schema。
 *
 * <p>复合主键: (program_code, member_id)。多租户隔离依赖 PostgreSQL RLS。
 * 动态属性存入 ext_attributes (JSONB)，tier 信息在独立的 member_tier 表中。
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Entity
@Table(name = "member")
@IdClass(MemberId.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Member implements Serializable {

    /** 归属计划代码（复合主键之一） */
    @Id
    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    /** 会员业务主键（复合主键之二，雪花算法生成） */
    @Id
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    /** 会员姓名 */
    @Column(name = "name", length = 100)
    private String name;

    /** 性别 */
    @Column(name = "gender", length = 10)
    private String gender;

    /** 生日 */
    @Column(name = "birthday")
    private LocalDate birthday;

    /** 会员状态: ENROLLED / SUSPENDED / MERGED / DEACTIVATED */
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "ENROLLED";

    /** 入会渠道编码 */
    @Column(name = "enroll_channel", length = 50)
    private String enrollChannel;

    /** 入会时间 */
    @Column(name = "enroll_time")
    private LocalDateTime enrollTime;

    /** 当前等级代码 */
    @Column(name = "tier_code", length = 16)
    private String tierCode;

    /** 等级生效时间 */
    @Column(name = "tier_effective_from")
    private LocalDateTime tierEffectiveFrom;

    /** 等级过期时间 */
    @Column(name = "tier_expires_at")
    private LocalDateTime tierExpiresAt;

    /** 写入该数据时的 Schema 版本号 */
    @Column(name = "schema_version", length = 16)
    private String schemaVersion;

    /** 动态扩展属性 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ext_attributes", nullable = false, columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> extAttributes = new LinkedHashMap<>();

    /** 合并目标会员 ID（当 status = MERGED 时） */
    @Column(name = "merged_to_member_id")
    private Long mergedToMemberId;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

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