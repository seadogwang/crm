-- ============================================================
-- Campaign Experiment: 自动推全胜者字段
-- 参考: campaign_final_update_4.md 第6.2节
-- ============================================================

ALTER TABLE campaign_experiment
    ADD COLUMN IF NOT EXISTS promoted BOOLEAN DEFAULT FALSE;

ALTER TABLE campaign_experiment
    ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;
