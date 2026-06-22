-- =============================================================
-- LLM 大模型配置表
-- 每个 program 一行（UNIQUE program_code）
-- 用于 AI 规则助手调用真实大模型
-- =============================================================

CREATE TABLE IF NOT EXISTS llm_config (
    id              BIGSERIAL       PRIMARY KEY,
    program_code    VARCHAR(32)     NOT NULL,
    provider        VARCHAR(32)     NOT NULL DEFAULT 'OPENAI',   -- OPENAI / CLAUDE / DEEPSEEK / AZURE_OPENAI
    api_url         VARCHAR(512)    NOT NULL,
    api_key         VARCHAR(512),                                -- 明文存储（DB 受控）
    model           VARCHAR(128)    NOT NULL DEFAULT 'gpt-4',
    temperature     REAL            NOT NULL DEFAULT 0.1,
    max_tokens      INT             DEFAULT 4096,
    enabled         BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    UNIQUE(program_code)
);

CREATE INDEX IF NOT EXISTS idx_llm_config_program ON llm_config(program_code);
