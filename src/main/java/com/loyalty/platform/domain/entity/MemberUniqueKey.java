package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

@Getter @Setter @NoArgsConstructor @AllArgsConstructor
class MemberUniqueKeyId implements Serializable {
    private String programCode;
    private String keyCombination;
    private String keyValue;
    @Override public boolean equals(Object o) {
        if (!(o instanceof MemberUniqueKeyId that)) return false;
        return Objects.equals(programCode, that.programCode)
            && Objects.equals(keyCombination, that.keyCombination)
            && Objects.equals(keyValue, that.keyValue);
    }
    @Override public int hashCode() { return Objects.hash(programCode, keyCombination, keyValue); }



}

@Entity
@Table(name = "member_unique_key")
@IdClass(MemberUniqueKeyId.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MemberUniqueKey implements Serializable {

    @Id @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    /** 键类型组合（如 MOBILE / WECHAT_UNIONID） */
    @Id @Column(name = "key_combination", nullable = false, length = 100)
    private String keyCombination;

    /** 键值（加密后的手机号、UnionID 等） */
    @Id @Column(name = "key_value", nullable = false, length = 500)
    private String keyValue;

    /** 指向的会员主键 member.member_id */
    @Column(name = "member_id", nullable = false)
    private Long memberId;

    /** 是否强绑定标识 */
    @Builder.Default
    @Column(name = "is_strong")
    private Boolean isStrong = true;

    /** 是否已验证 */
    @Builder.Default
    @Column(name = "is_verified")
    private Boolean isVerified = false;

    /** 验证时间 */
    @Column(name = "verified_at")
    private LocalDateTime verifiedAt;

    /** 创建时间 */
    @Builder.Default
    @Column(name = "created_at")
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();



}