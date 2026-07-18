package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

@Entity
@Table(name = "channel_adapter_config")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class ChannelAdapterConfig {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 100)
    private String programCode;

    /** 渠道标识: TMALL / JD / DOUYIN / WECHAT_MINI */
    @Column(name = "channel", nullable = false, length = 50)
    private String channel;

    /** 认证配置 (JSONB): AppKey, AppSecret, HMAC 密钥等 */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "auth_config", columnDefinition = "jsonb")
    private Map<String, Object> authConfig;

    /** 请求映射 (JSONB): 外部字段 → 内部字段映射规则 */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "request_mapping", columnDefinition = "jsonb")
    private Map<String, Object> requestMapping;

    /** 响应映射 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_mapping", columnDefinition = "jsonb")
    private Map<String, Object> responseMapping;

    /**
     * 入站映射规则 (JSONB) — Map&lt;operationCode, List&lt;MappingRule&gt;&gt;
     * <p>API 响应字段 → 业务实体字段的映射规则，由 ChartDB MappingEditor 配置。
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "inbound_mappings", columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> inboundMappings = Map.of();

    /**
     * 出站映射规则 (JSONB) — Map&lt;operationCode, List&lt;MappingRule&gt;&gt;
     * <p>业务实体字段 → API 请求字段的映射规则。
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "outbound_mappings", columnDefinition = "jsonb")
    @Builder.Default
    private Map<String, Object> outboundMappings = Map.of();

    /** 速率限制配置 (JSONB) */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "rate_limit_config", columnDefinition = "jsonb")
    private Map<String, Object> rateLimitConfig;

    /** 状态: DRAFT / ACTIVE / ROTATING / REVOKED / EXPIRED */
    @Column(name = "status", nullable = false, length = 20)
    @Builder.Default
    private String status = "DRAFT";

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

}