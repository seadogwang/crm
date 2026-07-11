-- ============================================================
-- Campaign: 多品牌/多Program 全局隔离与共享
-- 参考: campaign_final_update_9.md 第3章
-- 优先级: P2
-- ============================================================

-- 1. 共享策略配置表
CREATE TABLE IF NOT EXISTS campaign_sharing_policy (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    sharing_scope VARCHAR(32) NOT NULL,                -- GLOBAL / SELECTIVE / INHERITED
    target_programs TEXT[],
    parent_program_code VARCHAR(32),
    shared_resource_types TEXT[] NOT NULL,              -- BLACKLIST / CONSENT / ASSET / SEGMENT / TRIGGER
    permission_type VARCHAR(32) DEFAULT 'READ_ONLY',
    enabled BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, sharing_scope)
);

CREATE INDEX IF NOT EXISTS idx_csp_program ON campaign_sharing_policy(program_code);
CREATE INDEX IF NOT EXISTS idx_csp_enabled ON campaign_sharing_policy(enabled) WHERE enabled = TRUE;

-- 2. 全局黑名单表
CREATE TABLE IF NOT EXISTS campaign_global_blacklist (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    source_program VARCHAR(32) NOT NULL,
    source_type VARCHAR(32) NOT NULL,                  -- MANUAL / CAMPAIGN_FEEDBACK / COMPLIANCE
    reason TEXT,
    sharing_scope VARCHAR(32) DEFAULT 'GLOBAL',
    target_programs TEXT[],
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMPTZ,
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cgb_member ON campaign_global_blacklist(member_id);
CREATE INDEX IF NOT EXISTS idx_cgb_active ON campaign_global_blacklist(is_active) WHERE is_active = TRUE;

-- 3. 跨Program Campaign关联表
CREATE TABLE IF NOT EXISTS campaign_cross_program_relation (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,
    role VARCHAR(32) DEFAULT 'PARTICIPANT',            -- OWNER / PARTICIPANT / OBSERVER
    can_edit BOOLEAN DEFAULT FALSE,
    can_trigger BOOLEAN DEFAULT TRUE,
    can_view_results BOOLEAN DEFAULT TRUE,
    budget_allocation DECIMAL(18,4),
    budget_currency VARCHAR(8) DEFAULT 'CNY',
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ccpr_plan ON campaign_cross_program_relation(plan_id);
CREATE INDEX IF NOT EXISTS idx_ccpr_program ON campaign_cross_program_relation(program_code);
CREATE UNIQUE INDEX IF NOT EXISTS idx_ccpr_unique ON campaign_cross_program_relation(plan_id, program_code);

-- 4. 扩展 campaign_plan
ALTER TABLE campaign_plan ADD COLUMN IF NOT EXISTS is_cross_program BOOLEAN DEFAULT FALSE;
ALTER TABLE campaign_plan ADD COLUMN IF NOT EXISTS sharing_scope VARCHAR(32) DEFAULT 'OWN';
ALTER TABLE campaign_plan ADD COLUMN IF NOT EXISTS owner_program_code VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_cplan_cross ON campaign_plan(is_cross_program) WHERE is_cross_program = TRUE;
