-- ============================================================
-- Campaign: 动态内容与个性化推荐
-- 参考: campaign_final_update_10.md 第3章
-- 优先级: P2
-- ============================================================

-- 1. 推荐策略配置表
CREATE TABLE IF NOT EXISTS campaign_recommendation_strategy (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,

    strategy_name VARCHAR(255) NOT NULL,
    strategy_type VARCHAR(64) NOT NULL,               -- SIMILAR_PRODUCTS / FREQUENTLY_BOUGHT / POPULAR / PERSONALIZED_OFFER / DYNAMIC_COPY
    description TEXT,
    recommendation_config JSONB NOT NULL,

    fallback_strategy_id VARCHAR(64),
    fallback_content TEXT,
    cache_ttl_seconds INT DEFAULT 3600,

    enabled BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,

    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crs_program ON campaign_recommendation_strategy(program_code);
CREATE INDEX IF NOT EXISTS idx_crs_type ON campaign_recommendation_strategy(strategy_type);

-- 2. 推荐结果缓存表
CREATE TABLE IF NOT EXISTS campaign_recommendation_cache (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    strategy_id VARCHAR(64) NOT NULL,

    recommendation_result JSONB NOT NULL,
    cache_key VARCHAR(255),
    expires_at TIMESTAMPTZ NOT NULL,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crc_member ON campaign_recommendation_cache(member_id);
CREATE INDEX IF NOT EXISTS idx_crc_strategy ON campaign_recommendation_cache(strategy_id);
CREATE INDEX IF NOT EXISTS idx_crc_expires ON campaign_recommendation_cache(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_crc_unique ON campaign_recommendation_cache(member_id, strategy_id);
