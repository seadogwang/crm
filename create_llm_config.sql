CREATE TABLE IF NOT EXISTS llm_config (
    id              BIGSERIAL       PRIMARY KEY,
    program_code    VARCHAR(32)     NOT NULL,
    provider        VARCHAR(32)     NOT NULL DEFAULT 'OPENAI',
    api_url         VARCHAR(512)    NOT NULL,
    api_key         VARCHAR(512),
    model           VARCHAR(128)    NOT NULL DEFAULT 'gpt-4',
    temperature     REAL            NOT NULL DEFAULT 0.1,
    max_tokens      INT             DEFAULT 4096,
    enabled         BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ,
    UNIQUE(program_code)
);
CREATE INDEX IF NOT EXISTS idx_llm_config_program ON llm_config(program_code);
