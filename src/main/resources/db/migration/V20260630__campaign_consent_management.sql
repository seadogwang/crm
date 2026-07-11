-- ============================================================
-- Campaign: 用户偏好与退订管理（Consent & Preference）
-- 参考: campaign_final_update_3.md 第2章
-- 优先级: P0（GDPR/CASL 合规必需）
-- ============================================================

-- 1. 用户偏好主表
CREATE TABLE IF NOT EXISTS campaign_user_consent (
    member_id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,

    -- 全局退订
    global_unsubscribe BOOLEAN DEFAULT FALSE,
    unsubscribe_reason VARCHAR(64),                -- SPAM / NOT_INTERESTED / TOO_FREQUENT / OTHER
    unsubscribe_channel VARCHAR(32),               -- 从哪个渠道退订的
    unsubscribe_at TIMESTAMPTZ,

    -- 渠道偏好（独立控制）
    email_opt_in BOOLEAN DEFAULT TRUE,
    sms_opt_in BOOLEAN DEFAULT TRUE,
    push_opt_in BOOLEAN DEFAULT TRUE,
    email_opt_out_at TIMESTAMPTZ,
    sms_opt_out_at TIMESTAMPTZ,
    push_opt_out_at TIMESTAMPTZ,

    -- 品类偏好
    category_preferences JSONB DEFAULT '{"included": [], "excluded": []}',
    category_preferences_updated_at TIMESTAMPTZ,

    -- 静默时段
    quiet_hours_enabled BOOLEAN DEFAULT FALSE,
    quiet_hours_start TIME,
    quiet_hours_end TIME,
    timezone VARCHAR(64) DEFAULT 'Asia/Shanghai',

    -- 元数据
    preference_source VARCHAR(32) DEFAULT 'DEFAULT',
    last_updated_by VARCHAR(64),
    last_updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cuc_program ON campaign_user_consent(program_code);
CREATE INDEX IF NOT EXISTS idx_cuc_global ON campaign_user_consent(global_unsubscribe) WHERE global_unsubscribe = TRUE;
CREATE INDEX IF NOT EXISTS idx_cuc_email ON campaign_user_consent(email_opt_in) WHERE email_opt_in = FALSE;
CREATE INDEX IF NOT EXISTS idx_cuc_sms ON campaign_user_consent(sms_opt_in) WHERE sms_opt_in = FALSE;

-- 2. 偏好变更审计日志
CREATE TABLE IF NOT EXISTS campaign_consent_change_log (
    id BIGSERIAL PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,

    -- 变更内容
    field_changed VARCHAR(64),
    old_value TEXT,
    new_value TEXT,

    -- 来源
    source VARCHAR(32),                            -- WEB_UI / EMAIL_LINK / SMS_REPLY / API / SYSTEM
    source_detail TEXT,
    ip_address INET,
    user_agent TEXT,

    -- 操作人
    operated_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cccl_member ON campaign_consent_change_log(member_id);
CREATE INDEX IF NOT EXISTS idx_cccl_created ON campaign_consent_change_log(created_at DESC);

-- 3. GDPR 数据删除请求表
CREATE TABLE IF NOT EXISTS campaign_gdpr_request (
    id VARCHAR(64) PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    program_code VARCHAR(32) NOT NULL,

    request_type VARCHAR(32) DEFAULT 'DELETE',     -- DELETE / ANONYMIZE / EXPORT
    request_source VARCHAR(32) DEFAULT 'USER',     -- USER / ADMIN / API
    request_reason TEXT,
    request_time TIMESTAMPTZ DEFAULT NOW(),

    status VARCHAR(32) DEFAULT 'PENDING',          -- PENDING / PROCESSING / COMPLETED / REJECTED
    processed_by VARCHAR(64),
    processed_at TIMESTAMPTZ,
    completion_summary TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cgr_member ON campaign_gdpr_request(member_id);
CREATE INDEX IF NOT EXISTS idx_cgr_status ON campaign_gdpr_request(status);

COMMENT ON TABLE campaign_user_consent IS '用户营销偏好与授权管理（GDPR合规核心表）';
COMMENT ON TABLE campaign_consent_change_log IS '偏好变更审计日志（满足GDPR审计要求）';
COMMENT ON TABLE campaign_gdpr_request IS 'GDPR数据删除/匿名化/导出请求';
