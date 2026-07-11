-- ============================================================
-- 页面布局配置表 (Loyalty_member_page_config.md §3.1)
-- 支持会员详情页/编辑页/列表页的可视化布局设计
-- ============================================================
CREATE TABLE IF NOT EXISTS program_page_layout (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    entity_type VARCHAR(32) NOT NULL,              -- MEMBER / ORDER / PRODUCT
    page_type VARCHAR(20) NOT NULL,                -- DETAIL / EDIT / LIST

    -- ===== 布局配置（核心） =====
    layout_config JSONB NOT NULL,                  -- 完整的布局 JSON
    field_config JSONB,                            -- 字段级覆盖配置（标签、必填、隐藏等）

    -- ===== 版本控制 =====
    version INT DEFAULT 1,
    schema_version VARCHAR(16),                    -- 关联的 program_schema 版本

    -- ===== 状态 =====
    status VARCHAR(20) DEFAULT 'DRAFT',            -- DRAFT / PUBLISHED / ARCHIVED

    -- ===== 元数据 =====
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_by VARCHAR(64),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(program_code, entity_type, page_type, version)
);

CREATE INDEX IF NOT EXISTS idx_ppl_program ON program_page_layout(program_code);
CREATE INDEX IF NOT EXISTS idx_ppl_entity ON program_page_layout(entity_type);
CREATE INDEX IF NOT EXISTS idx_ppl_type ON program_page_layout(page_type);
CREATE INDEX IF NOT EXISTS idx_ppl_status ON program_page_layout(status);