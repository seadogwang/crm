-- ============================================================
-- Campaign: 人群筛选升级 — 新建实时宽表 campaign_member_stat
-- 参考: campaign_final_update.md 第2章
-- ============================================================

-- 1. 创建会员统计宽表（替代 campaign_member_dim 的人群筛选功能）
CREATE TABLE IF NOT EXISTS campaign_member_stat (
    id BIGSERIAL PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL UNIQUE,
    program_code VARCHAR(32) NOT NULL,

    -- 会员属性
    tier_code VARCHAR(32),
    tier_level INT,
    status VARCHAR(16),
    blacklist_flag BOOLEAN DEFAULT FALSE,

    -- 累计统计指标
    total_order_count INT DEFAULT 0,
    total_order_amount DECIMAL(18,2) DEFAULT 0,
    total_order_net DECIMAL(18,2) DEFAULT 0,
    total_unique_sku_count INT DEFAULT 0,
    total_unique_category_count INT DEFAULT 0,
    total_points_earned DECIMAL(18,4) DEFAULT 0,
    total_points_spent DECIMAL(18,4) DEFAULT 0,
    current_points_balance DECIMAL(18,4) DEFAULT 0,
    tier_upgrade_count INT DEFAULT 0,
    tier_downgrade_count INT DEFAULT 0,
    current_tier_duration_days INT DEFAULT 0,

    -- 近N天滑动窗口统计
    last_7_days_order_count INT DEFAULT 0,
    last_7_days_order_amount DECIMAL(18,2) DEFAULT 0,
    last_7_days_points_earned DECIMAL(18,4) DEFAULT 0,
    last_7_days_login_days INT DEFAULT 0,
    last_15_days_order_count INT DEFAULT 0,
    last_15_days_order_amount DECIMAL(18,2) DEFAULT 0,
    last_15_days_points_earned DECIMAL(18,4) DEFAULT 0,
    last_15_days_login_days INT DEFAULT 0,
    last_30_days_order_count INT DEFAULT 0,
    last_30_days_order_amount DECIMAL(18,2) DEFAULT 0,
    last_30_days_points_earned DECIMAL(18,4) DEFAULT 0,
    last_30_days_login_days INT DEFAULT 0,
    last_60_days_order_count INT DEFAULT 0,
    last_60_days_order_amount DECIMAL(18,2) DEFAULT 0,
    last_90_days_order_count INT DEFAULT 0,
    last_90_days_order_amount DECIMAL(18,2) DEFAULT 0,

    -- 品类偏好
    top_category_last_30_days VARCHAR(64),
    top_category_amount_last_30_days DECIMAL(18,2) DEFAULT 0,
    category_list_last_30_days JSONB,

    -- RFM 综合指标
    recency_days INT,
    frequency_score DECIMAL(5,2),
    monetary_score DECIMAL(5,2),
    rfm_segment VARCHAR(16),

    -- 时间戳
    last_order_date TIMESTAMPTZ,
    last_order_amount DECIMAL(18,2),
    last_points_transaction_date TIMESTAMPTZ,
    last_login_date TIMESTAMPTZ,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引（支撑动态规则查询）
CREATE INDEX IF NOT EXISTS idx_cms_program ON campaign_member_stat(program_code);
CREATE INDEX IF NOT EXISTS idx_cms_tier ON campaign_member_stat(tier_code, tier_level);
CREATE INDEX IF NOT EXISTS idx_cms_recency ON campaign_member_stat(recency_days);
CREATE INDEX IF NOT EXISTS idx_cms_total_amount ON campaign_member_stat(total_order_amount);
CREATE INDEX IF NOT EXISTS idx_cms_30_days_amount ON campaign_member_stat(last_30_days_order_amount);
CREATE INDEX IF NOT EXISTS idx_cms_30_days_count ON campaign_member_stat(last_30_days_order_count);
CREATE INDEX IF NOT EXISTS idx_cms_90_days_amount ON campaign_member_stat(last_90_days_order_amount);
CREATE INDEX IF NOT EXISTS idx_cms_last_order ON campaign_member_stat(last_order_date DESC);

-- 2. 创建订单明细宽表（支持品类/品牌/SKU级筛选）
CREATE TABLE IF NOT EXISTS campaign_order_detail_flat (
    id BIGSERIAL PRIMARY KEY,
    member_id VARCHAR(64) NOT NULL,
    order_id VARCHAR(64) NOT NULL,
    order_date TIMESTAMPTZ NOT NULL,
    order_amount DECIMAL(18,2),
    discount_amount DECIMAL(18,2),
    net_amount DECIMAL(18,2),
    channel VARCHAR(32),
    sku_code VARCHAR(64),
    sku_name VARCHAR(255),
    category_code VARCHAR(64),
    category_name VARCHAR(64),
    brand_code VARCHAR(64),
    brand_name VARCHAR(64),
    quantity INT,
    unit_price DECIMAL(18,4),
    line_amount DECIMAL(18,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codf_member ON campaign_order_detail_flat(member_id);
CREATE INDEX IF NOT EXISTS idx_codf_order_date ON campaign_order_detail_flat(order_date DESC);
CREATE INDEX IF NOT EXISTS idx_codf_category ON campaign_order_detail_flat(category_code);
CREATE INDEX IF NOT EXISTS idx_codf_sku ON campaign_order_detail_flat(sku_code);
CREATE INDEX IF NOT EXISTS idx_codf_brand ON campaign_order_detail_flat(brand_code);

-- 3. 标记旧字段为废弃
COMMENT ON COLUMN campaign_member_dim.segment_code IS 'DEPRECATED: 已废弃预计算分群，请使用 campaign_member_stat 动态规则';