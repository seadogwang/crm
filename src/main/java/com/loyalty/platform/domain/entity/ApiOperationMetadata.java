package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * API 操作元数据 — 描述外部渠道 API 的操作定义。
 *
 * <p>每一行记录表示一个 API 操作（如 "taobao.trade.get"），
 * 包含其 HTTP 协议细节、认证方式、以及关联的业务实体信息。
 *
 * <p>唯一约束：(program_code, channel, operation_code)
 *
 * @author Loyalty SaaS Architecture Team
 * @since 1.0.0
 */
@Entity
@Table(name = "api_operation_metadata", uniqueConstraints = {
        @UniqueConstraint(columnNames = {"program_code", "channel", "operation_code"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ApiOperationMetadata {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 租户代码 */
    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    /** 渠道标识（如 tmall、jd、douyin） */
    @Column(name = "channel", nullable = false, length = 50)
    private String channel;

    /** 操作编码（如 taobao.trade.get） */
    @Column(name = "operation_code", nullable = false, length = 100)
    private String operationCode;

    /** 操作名称（如"查询交易详情"） */
    @Column(name = "operation_name", length = 200)
    private String operationName;

    /** 方向: INBOUND / OUTBOUND */
    @Column(name = "direction", nullable = false, length = 20)
    private String direction;

    /** 目标业务实体（出站映射时，数据流向的业务实体） */
    @Column(name = "target_business_entity", length = 100)
    private String targetBusinessEntity;

    /** 源业务实体（入站映射时，数据来源的业务实体） */
    @Column(name = "source_business_entity", length = 100)
    private String sourceBusinessEntity;

    /** API 实体类型（api_request / api_response 实体名称） */
    @Column(name = "api_entity_type", length = 100)
    private String apiEntityType;

    /** HTTP 方法（GET / POST / PUT / DELETE） */
    @Column(name = "http_method", nullable = false, length = 10)
    private String httpMethod;

    /** HTTP 路径（如 /api/trade/get） */
    @Column(name = "http_path", nullable = false, length = 500)
    private String httpPath;

    /** 认证类型（NONE / TOKEN / SIGN / OAUTH2 等） */
    @Column(name = "auth_type", nullable = false, length = 30)
    private String authType;

    /** 认证配置（JSONB） */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "auth_config", columnDefinition = "jsonb")
    private Map<String, Object> authConfig;

    /** 分页类型（NONE / OFFSET / CURSOR / PAGE） */
    @Column(name = "pagination_type", nullable = false, length = 20)
    @Builder.Default
    private String paginationType = "NONE";

    /** 创建时间 */
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
