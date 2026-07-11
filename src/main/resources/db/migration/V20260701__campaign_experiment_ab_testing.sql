-- ============================================================
-- Campaign: A/B 测试与实验能力 (Experimentation)
-- 参考: campaign_final_update_4.md 第3章
-- 优先级: P1
-- ============================================================

-- 1. 实验配置主表
CREATE TABLE IF NOT EXISTS campaign_experiment (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    workspace_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,

    name VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(32) DEFAULT 'DRAFT',               -- DRAFT / RUNNING / PAUSED / COMPLETED / ARCHIVED

    -- 流量配置
    traffic_allocation_pct DECIMAL(5,2) DEFAULT 100,
    total_sample_size INT,

    -- 目标指标
    objective_metric VARCHAR(64) NOT NULL,            -- CLICK_RATE / CONVERSION_RATE / REVENUE_PER_USER / OPEN_RATE
    objective_direction VARCHAR(16) DEFAULT 'HIGHER', -- HIGHER / LOWER
    minimum_detectable_effect DECIMAL(5,2),
    statistical_significance DECIMAL(3,2) DEFAULT 0.95,

    -- 自动推全
    auto_promote_winner BOOLEAN DEFAULT FALSE,
    auto_promote_delay_minutes INT DEFAULT 1440,

    -- 运行时统计
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    winning_variant_id VARCHAR(64),

    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ce_plan ON campaign_experiment(plan_id);
CREATE INDEX IF NOT EXISTS idx_ce_status ON campaign_experiment(status);
CREATE INDEX IF NOT EXISTS idx_ce_workspace ON campaign_experiment(workspace_id);

-- 2. 实验变体配置表
CREATE TABLE IF NOT EXISTS campaign_experiment_variant (
    id VARCHAR(64) PRIMARY KEY,
    experiment_id VARCHAR(64) NOT NULL,

    variant_name VARCHAR(64) NOT NULL,                -- "Control" / "Variant A" / "Variant B"
    variant_code VARCHAR(16) NOT NULL,                -- "A", "B", "C"

    -- 流量分配
    traffic_percentage DECIMAL(5,2) NOT NULL,         -- 50.00 = 50%

    -- 变体差异化配置
    node_overrides JSONB,                             -- {"SEND_EMAIL": {"asset_id": "asset_001"}}
    subgraph_node_id VARCHAR(64),

    -- 运行时统计
    exposure_count INT DEFAULT 0,
    event_count INT DEFAULT 0,
    metric_value DECIMAL(18,4),
    total_revenue DECIMAL(18,4) DEFAULT 0,
    p_value DECIMAL(10,6),
    relative_improvement DECIMAL(10,4),
    confidence_interval VARCHAR(32),
    is_winner BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cev_experiment ON campaign_experiment_variant(experiment_id);

-- 3. 用户分流记录表
CREATE TABLE IF NOT EXISTS campaign_experiment_assignment (
    id VARCHAR(64) PRIMARY KEY,
    experiment_id VARCHAR(64) NOT NULL,
    member_id VARCHAR(64) NOT NULL,
    variant_id VARCHAR(64) NOT NULL,

    bucket_key VARCHAR(255),
    assignment_time TIMESTAMPTZ DEFAULT NOW(),

    -- 曝光和转化
    exposed BOOLEAN DEFAULT FALSE,
    exposed_at TIMESTAMPTZ,
    converted BOOLEAN DEFAULT FALSE,
    converted_at TIMESTAMPTZ,
    conversion_value DECIMAL(18,4),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cea_experiment ON campaign_experiment_assignment(experiment_id);
CREATE INDEX IF NOT EXISTS idx_cea_member ON campaign_experiment_assignment(member_id);
CREATE INDEX IF NOT EXISTS idx_cea_variant ON campaign_experiment_assignment(variant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cea_unique ON campaign_experiment_assignment(experiment_id, member_id);
