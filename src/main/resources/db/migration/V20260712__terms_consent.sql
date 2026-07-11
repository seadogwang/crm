-- ============================================================
-- Legal/Terms Consent: terms master + acceptance records
-- 参考: loyalty_consent_legacy.md
-- ============================================================

-- 1. 当前活动章程版本表（Terms Master）
CREATE TABLE IF NOT EXISTS loyalty_terms_master (
    id              BIGSERIAL       PRIMARY KEY,
    program_code    VARCHAR(32)     NOT NULL,
    terms_type      VARCHAR(32)     NOT NULL,          -- CHARTER / PRIVACY_POLICY / TERMS_OF_SERVICE / DATA_PROCESSING
    terms_version   VARCHAR(32)     NOT NULL,
    terms_content   TEXT,                              -- 纯文本或 HTML 内容
    effective_date  TIMESTAMPTZ     NOT NULL,          -- 生效日期
    is_active       BOOLEAN         DEFAULT TRUE,
    released_by     VARCHAR(64),
    released_at     TIMESTAMPTZ     DEFAULT NOW(),
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    UNIQUE(program_code, terms_type, terms_version)
);

CREATE INDEX IF NOT EXISTS idx_ltm_active ON loyalty_terms_master(terms_type, is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_ltm_type ON loyalty_terms_master(terms_type);

COMMENT ON TABLE loyalty_terms_master IS '当前活动章程版本表（管理各类型条款的最新版本）';

-- 2. 法律/服务同意记录表（Terms Acceptance）
CREATE TABLE IF NOT EXISTS loyalty_terms_acceptance (
    id              BIGSERIAL       PRIMARY KEY,
    member_id       VARCHAR(64)     NOT NULL,
    program_code    VARCHAR(32)     NOT NULL,

    -- 同意类型（支持多类型）
    terms_type      VARCHAR(32)     NOT NULL,          -- CHARTER / PRIVACY_POLICY / TERMS_OF_SERVICE / DATA_PROCESSING
    terms_version   VARCHAR(32)     NOT NULL,          -- 版本号，如 "v2.3"

    -- 同意状态
    is_accepted     BOOLEAN         NOT NULL DEFAULT FALSE,

    -- 元数据（审计关键）
    accepted_at     TIMESTAMPTZ,                       -- 接受时间（NULL 表示未接受）
    accepted_ip     INET,                              -- 接受时的 IP（合规关键）
    user_agent      TEXT,                              -- 接受时的浏览器/设备
    source          VARCHAR(32),                       -- WEB_APP / MOBILE_APP / MINI_PROGRAM / ADMIN

    -- 被撤销/失效信息
    revoked_at      TIMESTAMPTZ,                       -- 如章程更新，旧版本记录被废止的时间
    revoked_by      VARCHAR(64),                       -- 操作人（系统自动或管理员）
    revoked_reason  VARCHAR(255),                      -- 废止原因（如"新版章程发布"）

    -- 元数据
    created_at      TIMESTAMPTZ     DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     DEFAULT NOW(),

    -- 约束：一个会员+类型+版本唯一
    UNIQUE(member_id, terms_type, terms_version)
);

CREATE INDEX IF NOT EXISTS idx_lta_member ON loyalty_terms_acceptance(member_id);
CREATE INDEX IF NOT EXISTS idx_lta_type_version ON loyalty_terms_acceptance(terms_type, terms_version);
CREATE INDEX IF NOT EXISTS idx_lta_accepted ON loyalty_terms_acceptance(is_accepted) WHERE is_accepted = TRUE;

COMMENT ON TABLE loyalty_terms_acceptance IS '法律/服务同意记录表（Terms & Conditions / Privacy Policy / Club Charter）';