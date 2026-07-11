-- ============================================================
-- Campaign: 事件驱动营销 — 事件触发器配置与审计日志
-- 参考: campaign_final_event.md 第3章, campaign_final_event_1.md 第2-3章
-- ============================================================

-- 1. 事件触发器配置表
CREATE TABLE IF NOT EXISTS campaign_event_trigger (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,                     -- 关联的 Campaign Plan
    workspace_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,

    -- 事件定义
    event_type VARCHAR(128) NOT NULL,                  -- ORDER_CREATED, CART_ABANDONED, TIER_CHANGED ...
    event_source VARCHAR(64) DEFAULT 'loyalty_event', -- loyalty_event / kafka_topic / custom_webhook
    event_topic VARCHAR(128),                          -- Kafka Topic 名称

    -- 事件过滤（可选）
    event_filter JSONB,                                -- {"field":"order_amount","operator":"gt","value":100}

    -- 去重与防抖
    dedup_window_minutes INT DEFAULT 60,               -- 时间窗口内相同用户只触发1次
    dedup_key_fields JSONB DEFAULT '["member_id","event_type"]',

    -- 触发控制
    enabled BOOLEAN DEFAULT TRUE,
    start_time TIMESTAMPTZ,                            -- 生效时间范围（可选）
    end_time TIMESTAMPTZ,

    -- 元数据
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cet_plan ON campaign_event_trigger(plan_id);
CREATE INDEX IF NOT EXISTS idx_cet_event ON campaign_event_trigger(event_type, enabled);
CREATE INDEX IF NOT EXISTS idx_cet_program ON campaign_event_trigger(program_code);
CREATE INDEX IF NOT EXISTS idx_cet_workspace ON campaign_event_trigger(workspace_id);

-- 2. 事件触发日志表（审计 + 去重辅助）
CREATE TABLE IF NOT EXISTS campaign_event_trigger_log (
    id VARCHAR(64) PRIMARY KEY,
    plan_id VARCHAR(64) NOT NULL,
    trigger_id VARCHAR(64) NOT NULL,

    -- 事件信息
    event_id VARCHAR(128),                            -- 原始事件ID
    event_type VARCHAR(128),
    member_id VARCHAR(64),

    -- 触发结果
    triggered BOOLEAN DEFAULT FALSE,
    skip_reason VARCHAR(64),                          -- DUPLICATE / FILTER_NOT_MATCH / DISABLED / OUT_OF_WINDOW
    process_instance_key BIGINT,                      -- Zeebe 流程实例 Key

    -- 去重指纹
    dedup_key VARCHAR(255),                           -- 用于去重的组合 key

    -- 时间
    event_time TIMESTAMPTZ,
    trigger_time TIMESTAMPTZ DEFAULT NOW(),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cetl_plan ON campaign_event_trigger_log(plan_id);
CREATE INDEX IF NOT EXISTS idx_cetl_member ON campaign_event_trigger_log(member_id);
CREATE INDEX IF NOT EXISTS idx_cetl_dedup ON campaign_event_trigger_log(dedup_key);
CREATE INDEX IF NOT EXISTS idx_cetl_trigger_time ON campaign_event_trigger_log(trigger_time DESC);
CREATE INDEX IF NOT EXISTS idx_cetl_trigger ON campaign_event_trigger_log(trigger_id);

-- 3. 扩展 campaign_plan 表 — 支持事件驱动
ALTER TABLE campaign_plan ADD COLUMN IF NOT EXISTS trigger_type VARCHAR(32) DEFAULT 'MANUAL';
COMMENT ON COLUMN campaign_plan.trigger_type IS 'MANUAL / EVENT_TRIGGERED / SCHEDULED / HYBRID';

ALTER TABLE campaign_plan ADD COLUMN IF NOT EXISTS trigger_config_id VARCHAR(64);
COMMENT ON COLUMN campaign_plan.trigger_config_id IS '关联 campaign_event_trigger.id';

ALTER TABLE campaign_plan ADD COLUMN IF NOT EXISTS estimated_trigger_count INT;
COMMENT ON COLUMN campaign_plan.estimated_trigger_count IS '预估触发次数（用于预算分配）';

ALTER TABLE campaign_plan ADD COLUMN IF NOT EXISTS cost_per_trigger DECIMAL(18,4);
COMMENT ON COLUMN campaign_plan.cost_per_trigger IS '单次触发成本';

CREATE INDEX IF NOT EXISTS idx_cplan_trigger_type ON campaign_plan(trigger_type);

-- 4. 扩展 campaign_opportunity 表 — 支持实时事件机会
ALTER TABLE campaign_opportunity ADD COLUMN IF NOT EXISTS event_type VARCHAR(64);
COMMENT ON COLUMN campaign_opportunity.event_type IS '如果是 REALTIME 来源，记录触发事件类型';

ALTER TABLE campaign_opportunity ADD COLUMN IF NOT EXISTS event_payload JSONB;
COMMENT ON COLUMN campaign_opportunity.event_payload IS '事件原始数据快照';

ALTER TABLE campaign_opportunity ADD COLUMN IF NOT EXISTS urgency_score DECIMAL(5,2);
COMMENT ON COLUMN campaign_opportunity.urgency_score IS '紧迫度评分（实时机会通常比批量更紧迫）';

CREATE INDEX IF NOT EXISTS idx_co_urgency ON campaign_opportunity(urgency_score DESC);
