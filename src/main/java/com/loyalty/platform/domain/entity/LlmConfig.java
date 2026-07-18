package com.loyalty.platform.domain.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * LLM 大模型配置 — 按 program 存储，用于 AI 规则助手。
 */
@Entity
@Table(name = "llm_config")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LlmConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "program_code", nullable = false, length = 32)
    private String programCode;

    @Column(name = "provider", nullable = false, length = 32)
    @Builder.Default
    private String provider = "OPENAI";

    @Column(name = "api_url", nullable = false, length = 512)
    @Builder.Default
    private String apiUrl = "https://api.openai.com/v1/chat/completions";

    @Column(name = "api_key", length = 512)
    private String apiKey;

    @Column(name = "model", nullable = false, length = 128)
    @Builder.Default
    private String model = "gpt-4";

    @Column(name = "temperature", nullable = false)
    @Builder.Default
    private Double temperature = 0.1;

    @Column(name = "max_tokens")
    @Builder.Default
    private Integer maxTokens = 4096;

    @Column(name = "enabled", nullable = false)
    @Builder.Default
    private Boolean enabled = true;

    @Column(name = "created_at", updatable = false)
    @Builder.Default
    private LocalDateTime createdAt = LocalDateTime.now();

    @Column(name = "updated_at")
    @Builder.Default
    private LocalDateTime updatedAt = LocalDateTime.now();

}
