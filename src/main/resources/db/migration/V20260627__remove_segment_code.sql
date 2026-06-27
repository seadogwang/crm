-- ============================================================
-- Campaign: 废弃预计算分群码，转向实时动态规则查询
-- 参考: campaign_final_update.md
-- ============================================================

-- 1. 移除 segment_code 字段及其索引
ALTER TABLE campaign_member_dim DROP COLUMN IF EXISTS segment_code;
DROP INDEX IF EXISTS idx_cmd_segment;

-- 2. 新增复合索引，支持动态规则查询
-- 索引顺序: 等值条件优先 (tier_code, status)，范围条件其次 (recency_days, total_order_amount)
CREATE INDEX IF NOT EXISTS idx_cmd_dynamic_query
    ON campaign_member_dim (tier_code, status, recency_days, total_order_amount);

CREATE INDEX IF NOT EXISTS idx_cmd_last_order_desc
    ON campaign_member_dim (last_order_date DESC);

-- 3. 为 campaign_goal 新增目标受众规则字段
ALTER TABLE campaign_goal ADD COLUMN IF NOT EXISTS target_audience_rules JSONB;
COMMENT ON COLUMN campaign_goal.target_audience_rules IS
    '目标级别的动态受众规则（JSON），若下层 Initiative 未指定规则，则继承此配置';

-- 4. 更新 campaign_initiative 的 rule_config 注释
COMMENT ON COLUMN campaign_initiative.rule_config IS
    '举措的动态规则配置，结构遵循 { "logic": "AND", "rules": [{"field":"last_order_days","op":"gte","value":30}] }';