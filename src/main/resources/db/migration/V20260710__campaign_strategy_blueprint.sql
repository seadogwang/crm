-- Strategy Decomposition Engine — Blueprint tables + Goal extension
ALTER TABLE campaign_goal ADD COLUMN IF NOT EXISTS industry_type VARCHAR(64);
ALTER TABLE campaign_goal ADD COLUMN IF NOT EXISTS blueprint_id VARCHAR(64);
ALTER TABLE campaign_goal ADD COLUMN IF NOT EXISTS workflow_status VARCHAR(32) DEFAULT 'GOAL_DRAFT';
ALTER TABLE campaign_goal ADD COLUMN IF NOT EXISTS avg_order_value DECIMAL(18,4);
ALTER TABLE campaign_initiative ADD COLUMN IF NOT EXISTS analysis_json JSONB;

CREATE TABLE IF NOT EXISTS campaign_strategy_blueprint (
    id VARCHAR(64) PRIMARY KEY, blueprint_name VARCHAR(255), industry_type VARCHAR(64),
    description TEXT, formula_json JSONB, levers_json JSONB, initiative_mapping_json JSONB,
    version INT DEFAULT 1, is_active BOOLEAN DEFAULT TRUE, is_system_default BOOLEAN DEFAULT FALSE,
    fallback_mode VARCHAR(32) DEFAULT 'CORRELATION', created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS campaign_goal_decomposition (
    id VARCHAR(64) PRIMARY KEY, goal_id VARCHAR(64), blueprint_id VARCHAR(64),
    workspace_id VARCHAR(64), target_value DECIMAL(18,4), baseline_value DECIMAL(18,4),
    total_gap DECIMAL(18,4), decomposition_mode VARCHAR(32),
    lever_gaps JSONB, initiative_suggestions JSONB, adopted_plan_id VARCHAR(64),
    created_by VARCHAR(64), created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pre-seed 7 industry templates
INSERT INTO campaign_strategy_blueprint (id, blueprint_name, industry_type, description, is_system_default, is_active) VALUES
('tmpl_retail_001', '零售业GMV增长蓝图', 'RETAIL', 'GMV = 新客数×客单价 + 老客复购率×老客基数×客单价', false, true),
('tmpl_saas_001', 'SaaS MRR增长蓝图', 'SAAS', 'MRR = 新签数×ACV + 增购数×ACV - 流失数×ACV', false, true),
('tmpl_finance_001', '金融AUM提升蓝图', 'FINANCE', 'AUM = 新客数×户均资产 + 老客留存率×户均资产', false, true),
('tmpl_edu_001', '教育续费增长蓝图', 'EDUCATION', '营收 = 新生数×客单价 + 续费率×老生数×客单价', false, true),
('tmpl_auto_001', '汽车售后营收蓝图', 'AUTO', '售后营收 = 活跃车主数×年均消费', false, true),
('tmpl_ecommerce_001', '电商GMV增长蓝图', 'ECOMMERCE', 'GMV = 流量×转化率×客单价', false, true),
('tmpl_general_001', '通用增长蓝图', 'GENERAL', '目标 = 用户数×活跃度×转化率', true, true)
ON CONFLICT (id) DO NOTHING;
