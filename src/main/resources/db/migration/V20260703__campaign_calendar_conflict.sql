-- ============================================================
-- Campaign: 活动日历与冲突检测 (Campaign Calendar)
-- 参考: campaign_final_update_6.md 第3章
-- 优先级: P2
-- ============================================================

-- 1. 日历缓存表
CREATE TABLE IF NOT EXISTS campaign_calendar_cache (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    plan_id VARCHAR(64) NOT NULL,
    plan_name VARCHAR(255),
    trigger_type VARCHAR(32),

    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    actual_start_time TIMESTAMPTZ,

    estimated_audience_size INT,
    audience_hash VARCHAR(64),
    estimated_daily_volume_email INT DEFAULT 0,
    estimated_daily_volume_sms INT DEFAULT 0,
    estimated_daily_volume_push INT DEFAULT 0,

    status VARCHAR(32),

    cache_generated_at TIMESTAMPTZ DEFAULT NOW(),
    cache_version INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccc_workspace ON campaign_calendar_cache(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ccc_dates ON campaign_calendar_cache(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_ccc_program ON campaign_calendar_cache(program_code);

-- 2. 冲突记录表
CREATE TABLE IF NOT EXISTS campaign_conflict_record (
    id VARCHAR(64) PRIMARY KEY,
    workspace_id VARCHAR(64) NOT NULL,

    plan_id_1 VARCHAR(64) NOT NULL,
    plan_id_2 VARCHAR(64) NOT NULL,
    plan_name_1 VARCHAR(255),
    plan_name_2 VARCHAR(255),

    conflict_type VARCHAR(32) NOT NULL,             -- AUDIENCE_OVERLAP / CHANNEL_CAPACITY / EVENT_FLOOD
    severity VARCHAR(16) DEFAULT 'WARNING',          -- INFO / WARNING / CRITICAL
    overlap_audience_count INT,
    overlap_percentage DECIMAL(5,2),
    affected_channel VARCHAR(32),
    overload_ratio DECIMAL(5,2),
    conflict_detail TEXT,
    conflict_start_date DATE,
    conflict_end_date DATE,

    status VARCHAR(32) DEFAULT 'ACTIVE',             -- ACTIVE / RESOLVED / IGNORED
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(64),
    resolution_note TEXT,

    detected_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccr_workspace ON campaign_conflict_record(workspace_id);
CREATE INDEX IF NOT EXISTS idx_ccr_status ON campaign_conflict_record(status);
CREATE INDEX IF NOT EXISTS idx_ccr_detected ON campaign_conflict_record(detected_at DESC);
