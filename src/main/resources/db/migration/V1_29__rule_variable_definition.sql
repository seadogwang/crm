-- V1_29__rule_variable_definition.sql
-- 积分体系重构：变量定义表 + 积分类型扩展
-- 设计文档：point_design_update.md

-- 1. 创建变量定义表
CREATE TABLE IF NOT EXISTS rule_variable_definition (
    id VARCHAR(64) PRIMARY KEY,
    program_code VARCHAR(32) NOT NULL,
    var_code VARCHAR(64) NOT NULL,               -- 变量编码，如 total_activity
    var_name VARCHAR(128) NOT NULL,              -- 变量名称，如 "活动总积分"
    var_type VARCHAR(20) DEFAULT 'DECIMAL',      -- DECIMAL / INTEGER / BOOLEAN
    expression TEXT NOT NULL,                    -- 表达式：sum('ACT_A') + sum('ACT_B')
    description TEXT,
    status VARCHAR(20) DEFAULT 'ACTIVE',         -- ACTIVE / INACTIVE
    created_by VARCHAR(64),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(program_code, var_code)
);

CREATE INDEX IF NOT EXISTS idx_rvd_program ON rule_variable_definition(program_code);
CREATE INDEX IF NOT EXISTS idx_rvd_status ON rule_variable_definition(status);

-- 2. 扩展 point_type_definition 表（补充设计文档中缺失的字段）
ALTER TABLE point_type_definition
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;

COMMENT ON COLUMN rule_variable_definition.expression IS '变量表达式，支持 sum/count/balance 函数 + 四则运算';
COMMENT ON COLUMN rule_variable_definition.var_type IS '变量类型: DECIMAL/INTEGER/BOOLEAN';
COMMENT ON COLUMN point_type_definition.description IS '积分类型描述';
COMMENT ON COLUMN point_type_definition.sort_order IS '排序序号';

-- 3. 权限
ALTER TABLE rule_variable_definition OWNER TO loyalty_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON rule_variable_definition TO loyalty_app;