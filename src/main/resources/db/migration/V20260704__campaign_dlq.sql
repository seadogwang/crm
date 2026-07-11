-- ============================================================
-- Campaign: 死信队列 (DLQ) 与失败作业重放
-- 参考: campaign_final_update_7.md 第3章
-- 优先级: P0
-- ============================================================

-- 1. 扩展 campaign_zeebe_task 表
ALTER TABLE campaign_zeebe_task ADD COLUMN IF NOT EXISTS is_dlq BOOLEAN DEFAULT FALSE;
ALTER TABLE campaign_zeebe_task ADD COLUMN IF NOT EXISTS dlq_reason TEXT;
ALTER TABLE campaign_zeebe_task ADD COLUMN IF NOT EXISTS dlq_archived BOOLEAN DEFAULT FALSE;
ALTER TABLE campaign_zeebe_task ADD COLUMN IF NOT EXISTS dlq_archived_at TIMESTAMPTZ;
ALTER TABLE campaign_zeebe_task ADD COLUMN IF NOT EXISTS replayed_count INT DEFAULT 0;
ALTER TABLE campaign_zeebe_task ADD COLUMN IF NOT EXISTS original_job_key BIGINT;

CREATE INDEX IF NOT EXISTS idx_czt_is_dlq ON campaign_zeebe_task(is_dlq) WHERE is_dlq = TRUE;
CREATE INDEX IF NOT EXISTS idx_czt_dlq_archived ON campaign_zeebe_task(dlq_archived) WHERE dlq_archived = FALSE;
CREATE INDEX IF NOT EXISTS idx_czt_dlq_plan ON campaign_zeebe_task(plan_id, is_dlq);

-- 2. 死信重放记录表
CREATE TABLE IF NOT EXISTS campaign_dlq_replay_log (
    id VARCHAR(64) PRIMARY KEY,
    task_id VARCHAR(64) NOT NULL,
    plan_id VARCHAR(64) NOT NULL,

    replay_type VARCHAR(32) NOT NULL,                 -- SINGLE / BATCH
    new_job_key BIGINT,
    new_process_instance_key BIGINT,
    status VARCHAR(32) DEFAULT 'SUCCESS',             -- SUCCESS / FAILED / PARTIAL

    operator_id VARCHAR(64),
    operator_name VARCHAR(255),
    reason TEXT,

    replayed_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdrl_task ON campaign_dlq_replay_log(task_id);
CREATE INDEX IF NOT EXISTS idx_cdrl_plan ON campaign_dlq_replay_log(plan_id);
CREATE INDEX IF NOT EXISTS idx_cdrl_replayed_at ON campaign_dlq_replay_log(replayed_at DESC);
