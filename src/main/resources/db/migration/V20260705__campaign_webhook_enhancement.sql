-- ============================================================
-- Campaign: 入站 Webhook 增强 (Inbound Webhook)
-- 参考: campaign_final_update_8.md 第3章
-- 优先级: P1
-- ============================================================

-- 1. 扩展 campaign_event_trigger 表
ALTER TABLE campaign_event_trigger ADD COLUMN IF NOT EXISTS webhook_config JSONB;
COMMENT ON COLUMN campaign_event_trigger.webhook_config IS 'Webhook配置：API Key/签名密钥/IP白名单/字段映射规则';
COMMENT ON COLUMN campaign_event_trigger.event_source IS 'loyalty_event / custom_webhook / kafka_topic / WEBHOOK';

CREATE INDEX IF NOT EXISTS idx_cet_api_key ON campaign_event_trigger ((webhook_config->>'apiKey')) WHERE event_source = 'WEBHOOK';

-- 2. Webhook 请求日志表
CREATE TABLE IF NOT EXISTS campaign_webhook_log (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    trigger_id VARCHAR(64),

    request_path VARCHAR(255),
    request_method VARCHAR(16),
    request_headers JSONB,
    request_body TEXT,
    request_ip INET,

    auth_status VARCHAR(32),                          -- SUCCESS / FAILED_API_KEY / FAILED_SIGNATURE / IP_BLOCKED
    auth_error TEXT,

    mapped_event_type VARCHAR(128),
    mapped_member_id VARCHAR(64),
    mapped_payload JSONB,
    triggered_campaign BOOLEAN DEFAULT FALSE,
    skip_reason VARCHAR(64),

    response_status INT,
    processing_time_ms BIGINT,

    received_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_cwl_trigger ON campaign_webhook_log(trigger_id);
CREATE INDEX IF NOT EXISTS idx_cwl_program ON campaign_webhook_log(program_code);
CREATE INDEX IF NOT EXISTS idx_cwl_received ON campaign_webhook_log(received_at DESC);
