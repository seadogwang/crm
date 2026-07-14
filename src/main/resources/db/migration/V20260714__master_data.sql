-- =============================================================
-- Master Data Management Tables
-- Multi-tenant: scoped by program_code
-- =============================================================

CREATE TABLE IF NOT EXISTS master_data_definition (
    id              VARCHAR(64) PRIMARY KEY,
    program_code    VARCHAR(32) NOT NULL,
    data_type       VARCHAR(32) NOT NULL,         -- ENUM / HIERARCHY / MAPPING / TAG
    data_code       VARCHAR(64) NOT NULL,         -- unique identifier, e.g. GENDER / REGION
    data_name       VARCHAR(128) NOT NULL,        -- display name
    description     TEXT,
    config          text,                        -- type-specific config
    status          VARCHAR(20) DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, data_code)
);
CREATE INDEX IF NOT EXISTS idx_mdd_program ON master_data_definition(program_code);

CREATE TABLE IF NOT EXISTS master_data_enum (
    id              VARCHAR(64) PRIMARY KEY,
    program_code    VARCHAR(32) NOT NULL,
    data_code       VARCHAR(64) NOT NULL,         -- references master_data_definition
    enum_code       VARCHAR(64) NOT NULL,         -- e.g. "MALE"
    enum_label      VARCHAR(128) NOT NULL,        -- e.g. "男"
    enum_value      TEXT,                         -- optional numeric value
    sort_order      INT DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, data_code, enum_code)
);
CREATE INDEX IF NOT EXISTS idx_mde_lookup ON master_data_enum(program_code, data_code, status);

CREATE TABLE IF NOT EXISTS master_data_hierarchy (
    id              VARCHAR(64) PRIMARY KEY,
    program_code    VARCHAR(32) NOT NULL,
    data_code       VARCHAR(64) NOT NULL,         -- references master_data_definition
    node_code       VARCHAR(64) NOT NULL,         -- e.g. "440000"
    node_name       VARCHAR(128) NOT NULL,        -- e.g. "广东省"
    parent_code     VARCHAR(64),                  -- parent node code, NULL for root
    node_level      INT DEFAULT 1,
    sort_order      INT DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'ACTIVE',
    ext_attributes  text,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, data_code, node_code)
);
CREATE INDEX IF NOT EXISTS idx_mdh_lookup ON master_data_hierarchy(program_code, data_code, node_level, parent_code);

CREATE TABLE IF NOT EXISTS master_data_mapping (
    id              VARCHAR(64) PRIMARY KEY,
    program_code    VARCHAR(32) NOT NULL,
    data_code       VARCHAR(64) NOT NULL,         -- references master_data_definition
    key_code        VARCHAR(128) NOT NULL,        -- mapping key
    key_label       VARCHAR(256),                 -- key display name
    value_code      VARCHAR(128) NOT NULL,        -- mapping value
    value_label     VARCHAR(256),                 -- value display name
    ext_attributes  text,
    status          VARCHAR(20) DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, data_code, key_code)
);
CREATE INDEX IF NOT EXISTS idx_mdm_lookup ON master_data_mapping(program_code, data_code);

CREATE TABLE IF NOT EXISTS master_data_tag (
    id              VARCHAR(64) PRIMARY KEY,
    program_code    VARCHAR(32) NOT NULL,
    tag_group       VARCHAR(64),                 -- optional group
    tag_code        VARCHAR(64) NOT NULL,
    tag_name        VARCHAR(128) NOT NULL,
    tag_color       VARCHAR(16),
    status          VARCHAR(20) DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, tag_code)
);
CREATE INDEX IF NOT EXISTS idx_mdt_program ON master_data_tag(program_code);

-- Seed default master data for PROG001
INSERT INTO master_data_definition (id, program_code, data_type, data_code, data_name, status)
VALUES
    (gen_random_uuid()::text, 'PROG001', 'ENUM', 'GENDER', '性别', 'ACTIVE'),
    (gen_random_uuid()::text, 'PROG001', 'ENUM', 'CHANNEL', '渠道', 'ACTIVE'),
    (gen_random_uuid()::text, 'PROG001', 'ENUM', 'ORDER_STATUS', '订单状态', 'ACTIVE'),
    (gen_random_uuid()::text, 'PROG001', 'ENUM', 'MEMBER_STATUS', '会员状态', 'ACTIVE'),
    (gen_random_uuid()::text, 'PROG001', 'HIERARCHY', 'REGION', '省市区', 'ACTIVE'),
    (gen_random_uuid()::text, 'PROG001', 'TAG', 'MEMBER_TAG', '会员标签', 'ACTIVE')
ON CONFLICT DO NOTHING;

-- Seed GENDER enum values
DO $$
DECLARE
    gid VARCHAR(64) := (SELECT id FROM master_data_definition WHERE program_code='PROG001' AND data_code='GENDER' LIMIT 1);
BEGIN
    IF gid IS NOT NULL THEN
        INSERT INTO master_data_enum (id, program_code, data_code, enum_code, enum_label, sort_order)
        VALUES
            (gen_random_uuid()::text, 'PROG001', 'GENDER', 'MALE', '男', 1),
            (gen_random_uuid()::text, 'PROG001', 'GENDER', 'FEMALE', '女', 2),
            (gen_random_uuid()::text, 'PROG001', 'GENDER', 'UNKNOWN', '未知', 3)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Seed CHANNEL enum values
DO $$
DECLARE
    cid VARCHAR(64) := (SELECT id FROM master_data_definition WHERE program_code='PROG001' AND data_code='CHANNEL' LIMIT 1);
BEGIN
    IF cid IS NOT NULL THEN
        INSERT INTO master_data_enum (id, program_code, data_code, enum_code, enum_label, sort_order)
        VALUES
            (gen_random_uuid()::text, 'PROG001', 'CHANNEL', 'TMALL', '天猫', 1),
            (gen_random_uuid()::text, 'PROG001', 'CHANNEL', 'JD', '京东', 2),
            (gen_random_uuid()::text, 'PROG001', 'CHANNEL', 'DOUYIN', '抖音', 3),
            (gen_random_uuid()::text, 'PROG001', 'CHANNEL', 'WECHAT_MINI', '微信小程序', 4)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Seed ORDER_STATUS enum values
DO $$
DECLARE
    osid VARCHAR(64) := (SELECT id FROM master_data_definition WHERE program_code='PROG001' AND data_code='ORDER_STATUS' LIMIT 1);
BEGIN
    IF osid IS NOT NULL THEN
        INSERT INTO master_data_enum (id, program_code, data_code, enum_code, enum_label, sort_order)
        VALUES
            (gen_random_uuid()::text, 'PROG001', 'ORDER_STATUS', 'WAIT_BUYER_PAY', '待付款', 1),
            (gen_random_uuid()::text, 'PROG001', 'ORDER_STATUS', 'WAIT_SELLER_SEND_GOODS', '待发货', 2),
            (gen_random_uuid()::text, 'PROG001', 'ORDER_STATUS', 'WAIT_BUYER_CONFIRM_GOODS', '待收货', 3),
            (gen_random_uuid()::text, 'PROG001', 'ORDER_STATUS', 'TRADE_FINISHED', '已完成', 4),
            (gen_random_uuid()::text, 'PROG001', 'ORDER_STATUS', 'TRADE_CLOSED', '已关闭', 5)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Seed REGION hierarchy (top-level provinces)
DO $$
DECLARE
    rid VARCHAR(64) := (SELECT id FROM master_data_definition WHERE program_code='PROG001' AND data_code='REGION' LIMIT 1);
    pid VARCHAR(64);
BEGIN
    IF rid IS NOT NULL THEN
        INSERT INTO master_data_hierarchy (id, program_code, data_code, node_code, node_name, node_level, sort_order)
        VALUES
            (gen_random_uuid()::text, 'PROG001', 'REGION', '110000', '北京市', 1, 1),
            (gen_random_uuid()::text, 'PROG001', 'REGION', '310000', '上海市', 1, 2),
            (gen_random_uuid()::text, 'PROG001', 'REGION', '440000', '广东省', 1, 3)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;

-- Seed MEMBER_STATUS enum values
DO $$
DECLARE
    msid VARCHAR(64) := (SELECT id FROM master_data_definition WHERE program_code='PROG001' AND data_code='MEMBER_STATUS' LIMIT 1);
BEGIN
    IF msid IS NOT NULL THEN
        INSERT INTO master_data_enum (id, program_code, data_code, enum_code, enum_label, sort_order)
        VALUES
            (gen_random_uuid()::text, 'PROG001', 'MEMBER_STATUS', 'ENROLLED', '已入会', 1),
            (gen_random_uuid()::text, 'PROG001', 'MEMBER_STATUS', 'SUSPENDED', '已冻结', 2),
            (gen_random_uuid()::text, 'PROG001', 'MEMBER_STATUS', 'DEACTIVATED', '已停用', 3),
            (gen_random_uuid()::text, 'PROG001', 'MEMBER_STATUS', 'MERGED', '已合并', 4)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;
