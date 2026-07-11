-- ============================================================
-- Campaign Experiment: 实验学习记录表
-- 参考: campaign_final_update_4.md 第7.2节
-- ============================================================

CREATE TABLE IF NOT EXISTS campaign_experiment_learning (
    id VARCHAR(64) PRIMARY KEY,
    experiment_id VARCHAR(64) NOT NULL,
    plan_id VARCHAR(64) NOT NULL,
    workspace_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,

    experiment_name VARCHAR(255),
    winning_variant_id VARCHAR(64),
    winning_variant_name VARCHAR(64),
    winning_variant_code VARCHAR(16),

    objective_metric VARCHAR(64),
    overall_improvement DECIMAL(10,4),
    winner_p_value DECIMAL(10,6),
    winner_metric_value DECIMAL(18,4),
    control_metric_value DECIMAL(18,4),
    total_sample_size INT,

    winner_config_json JSONB,
    ai_summary TEXT,

    applied_to_config BOOLEAN DEFAULT FALSE,
    budget_adjustment_pct DECIMAL(10,4),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cel_experiment ON campaign_experiment_learning(experiment_id);
CREATE INDEX IF NOT EXISTS idx_cel_plan ON campaign_experiment_learning(plan_id);
CREATE INDEX IF NOT EXISTS idx_cel_workspace ON campaign_experiment_learning(workspace_id, created_at DESC);
