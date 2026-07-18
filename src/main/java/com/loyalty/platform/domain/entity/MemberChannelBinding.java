package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "member_channel_binding",
        uniqueConstraints = {@UniqueConstraint(name = "mcb_channel_user_unique",
                columnNames = {"program_code", "channel", "channel_user_id"})})
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class MemberChannelBinding {
    @Id @Column(name = "id", length = 64) private String id;
    @Column(name = "program_code", nullable = false, length = 32) private String programCode;
    @Column(name = "member_id", nullable = false, length = 64) private String memberId;
    @Column(name = "channel", nullable = false, length = 32) private String channel;
    @Column(name = "channel_user_id", length = 128) private String channelUserId;
    @Column(name = "channel_union_id", length = 128) private String channelUnionId;
    @Column(name = "channel_nickname", length = 200) private String channelNickname;
    @Column(name = "channel_avatar", length = 500) private String channelAvatar;
    @Column(name = "channel_mobile_plain", length = 32) private String channelMobilePlain;
    @Column(name = "channel_mobile_encrypted", length = 128) private String channelMobileEncrypted;
    @Column(name = "encrypt_type", length = 32) private String encryptType;
    @Column(name = "authorized_at") private LocalDateTime authorizedAt;
    @Column(name = "authorized_scopes", columnDefinition = "jsonb")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private Map<String, Object> authorizedScopes;
    @Column(name = "is_primary") @Builder.Default private Boolean isPrimary = false;
    @Column(name = "status", length = 20) @Builder.Default private String status = "ACTIVE";
    @Column(name = "channel_ext_data", columnDefinition = "jsonb")
    @org.hibernate.annotations.JdbcTypeCode(org.hibernate.type.SqlTypes.JSON)
    private Map<String, Object> channelExtData;
    @Column(name = "last_verified_at") private LocalDateTime lastVerifiedAt;
    @Column(name = "unbind_at") private LocalDateTime unbindAt;
    @Column(name = "unbind_by", length = 64) private String unbindBy;
    @Column(name = "unbind_reason", length = 255) private String unbindReason;
    @Column(name = "created_at", updatable = false) @Builder.Default private LocalDateTime createdAt = LocalDateTime.now();
    @Column(name = "updated_at") @Builder.Default private LocalDateTime updatedAt = LocalDateTime.now();

}