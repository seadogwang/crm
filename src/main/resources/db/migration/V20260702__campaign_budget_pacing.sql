-- ============================================================
-- Campaign: 预算节奏控制 (Budget Pacing)
-- 参考: campaign_final_update_5.md 第3章
-- 优先级: P1
-- ============================================================

-- 1. 预算节奏配置表
CREATE TABLE IF NOT EXISTS campaign_budget_pacing (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL UNIQUE,
    workspace_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,

    total_budget DECIMAL(18,4) NOT NULL,
    total_budget_currency VARCHAR(8) DEFAULT 'CNY',

    -- 节奏模式: EVEN / ACCELERATED / FRONT_LOADED / DYNAMIC
    pacing_mode VARCHAR(32) NOT NULL DEFAULT 'EVEN',

    -- 每日预算控制
    daily_cap_enabled BOOLEAN DEFAULT TRUE,
    daily_cap_amount DECIMAL(18,4),
    daily_cap_type VARCHAR(32) DEFAULT 'HARD',         -- HARD / SOFT

    -- 动态调速配置
    dynamic_pacing_config JSONB,

    -- 告警阈值
    alert_thresholds JSONB DEFAULT '{"warn": 0.8, "critical": 0.95, "stop": 1.0}',

    -- 运行时状态（系统自动更新）
    total_consumed DECIMAL(18,4) DEFAULT 0,
    today_consumed DECIMAL(18,4) DEFAULT 0,
    yesterday_consumed DECIMAL(18,4) DEFAULT 0,
    last_reset_date DATE,
    is_paused_by_budget BOOLEAN DEFAULT FALSE,
    paused_at TIMESTAMPTZ,

    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cbp_plan ON campaign_budget_pacing(plan_id);
CREATE INDEX IF NOT EXISTS idx_cbp_program ON campaign_budget_pacing(program_code);
CREATE INDEX IF NOT EXISTS idx_cbp_paused ON campaign_budget_pacing(is_paused_by_budget) WHERE is_paused_by_budget = TRUE;

-- 2. 预算消耗明细表
CREATE TABLE IF NOT EXISTS campaign_budget_consumption (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    node_id VARCHAR(64),
    member_id VARCHAR(64),

    amount DECIMAL(18,4) NOT NULL,
    unit_cost DECIMAL(18,4),
    quantity INT,
    consumption_type VARCHAR(32) NOT NULL,             -- SEND / POINTS / COUPON / WEBHOOK
    channel VARCHAR(32),

    -- 预算状态快照
    total_consumed_before DECIMAL(18,4),
    total_consumed_after DECIMAL(18,4),
    today_consumed_before DECIMAL(18,4),
    today_consumed_after DECIMAL(18,4),

    consumed_at TIMESTAMPTZ DEFAULT NOW(),
    process_instance_key BIGINT,
    job_key BIGINT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cbc_plan ON campaign_budget_consumption(plan_id);
CREATE INDEX IF NOT EXISTS idx_cbc_consumed ON campaign_budget_consumption(consumed_at DESC);

-- 3. 预算告警记录表
CREATE TABLE IF NOT EXISTS campaign_budget_alert (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,

    alert_type VARCHAR(32) NOT NULL,                   -- WARN / CRITICAL / STOP / DAILY_CAP
    alert_message TEXT,
    threshold DECIMAL(5,2),
    current_consumption DECIMAL(18,4),
    total_budget DECIMAL(18,4),

    status VARCHAR(32) DEFAULT 'ACTIVE',               -- ACTIVE / RESOLVED / IGNORED
    resolved_at TIMESTAMPTZ,
    resolved_by VARCHAR(64),

    triggered_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cba_plan ON campaign_budget_alert(plan_id);
CREATE INDEX IF NOT EXISTS idx_cba_status ON campaign_budget_alert(status);
