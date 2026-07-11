-- ============================================================
-- 实体设计器扩展: 增加 layout_position 字段存储实体在画布上的位置
-- Loyalty_entity_designer.md §6.3
-- ============================================================
ALTER TABLE program_schema ADD COLUMN IF NOT EXISTS layout_position JSONB;
COMMENT ON COLUMN program_schema.layout_position IS '实体在画布上的位置：{"x": 100, "y": 200}';