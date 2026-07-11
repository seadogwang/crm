-- V1_31__channel_member_pass.sql
-- 多渠道会员通与 One-ID 统一身份识别系统

-- 1. 会员渠道绑定表
CREATE TABLE IF NOT EXISTS member_channel_binding (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    channel_user_id VARCHAR(128),
    channel_union_id VARCHAR(128),
    channel_nickname VARCHAR(200),
    channel_avatar VARCHAR(500),
    channel_mobile_plain VARCHAR(32),
    channel_mobile_encrypted VARCHAR(128),
    encrypt_type VARCHAR(32),
    authorized_at TIMESTAMPTZ,
    authorized_scopes JSONB,
    is_primary BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    channel_ext_data JSONB,
    last_verified_at TIMESTAMPTZ,
    unbind_at TIMESTAMPTZ,
    unbind_by VARCHAR(64),
    unbind_reason VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, channel, channel_user_id)
);
CREATE INDEX IF NOT EXISTS idx_mcb_member ON member_channel_binding(program_code, member_id);
CREATE INDEX IF NOT EXISTS idx_mcb_channel ON member_channel_binding(program_code, channel);

-- 2. One-ID 策略配置表
CREATE TABLE IF NOT EXISTS one_id_strategy (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    strategy_code VARCHAR(64) NOT NULL,
    strategy_name VARCHAR(128) NOT NULL,
    priority_fields JSONB NOT NULL,
    matching_rules JSONB,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    is_default BOOLEAN DEFAULT false,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, strategy_code)
);

-- 3. 渠道加密配置表
CREATE TABLE IF NOT EXISTS channel_crypto_config (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    encrypt_type VARCHAR(32) NOT NULL,
    encrypt_algorithm VARCHAR(64),
    salt VARCHAR(128),
    algorithm_config JSONB,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, channel)
);

-- 4. 会员通渠道配置表
CREATE TABLE IF NOT EXISTS channel_member_pass_config (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    enabled BOOLEAN DEFAULT false,
    channel_config JSONB,
    tmall_salt VARCHAR(64),
    jd_salt VARCHAR(64),
    default_points INT DEFAULT 0,
    default_tier VARCHAR(32) DEFAULT 'BASE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, channel)
);

-- 5. 身份冲突日志表
CREATE TABLE IF NOT EXISTS member_identity_conflict_log (
    id BIGSERIAL PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    channel VARCHAR(32) NOT NULL,
    conflict_type VARCHAR(32),
    field_a VARCHAR(64),
    value_a VARCHAR(256),
    value_b VARCHAR(256),
    member_a_id VARCHAR(64),
    member_b_id VARCHAR(64),
    status VARCHAR(20) DEFAULT 'PENDING',
    resolved_by VARCHAR(64),
    resolved_at TIMESTAMPTZ,
    resolution VARCHAR(32),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 扩展 member 表
ALTER TABLE member ADD COLUMN IF NOT EXISTS email VARCHAR(128);
ALTER TABLE member ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;
ALTER TABLE member ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false;
ALTER TABLE member ADD COLUMN IF NOT EXISTS primary_identity_type VARCHAR(20) DEFAULT 'PHONE';

-- 权限
ALTER TABLE member_channel_binding OWNER TO loyalty_app;
ALTER TABLE one_id_strategy OWNER TO loyalty_app;
ALTER TABLE channel_crypto_config OWNER TO loyalty_app;
ALTER TABLE channel_member_pass_config OWNER TO loyalty_app;
ALTER TABLE member_identity_conflict_log OWNER TO loyalty_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON member_channel_binding TO loyalty_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON one_id_strategy TO loyalty_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON channel_crypto_config TO loyalty_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON channel_member_pass_config TO loyalty_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON member_identity_conflict_log TO loyalty_app;