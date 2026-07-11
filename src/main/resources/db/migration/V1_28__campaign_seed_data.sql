-- ============================================================================
-- Campaign 测试种子数据
-- ============================================================================
-- 安全地使用 INSERT ... ON CONFLICT，不会破坏已有数据

-- 1. 插入默认租户（如果不存在）
INSERT INTO tenant (id, name, code, status, config_json)
SELECT 1, '默认租户', 'DEFAULT', 'ACTIVE', '{}'
WHERE NOT EXISTS (SELECT 1 FROM tenant WHERE id = 1);

INSERT INTO tenant (id, name, code, status, config_json)
SELECT 2, '演示租户', 'DEMO', 'ACTIVE', '{}'
WHERE NOT EXISTS (SELECT 1 FROM tenant WHERE id = 2);

-- 2. 插入 PROG001 Program（如果不存在）
INSERT INTO program (code, tenant_id, name, timezone, currency, config_json, status)
SELECT 'PROG001', 1, '忠诚度计划-演示', 'Asia/Shanghai', 'CNY', '{}', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM program WHERE code = 'PROG001');

-- 3. 插入更多演示 Program（可选）
INSERT INTO program (code, tenant_id, name, timezone, currency, config_json, status)
SELECT 'PROG002', 1, '测试计划B', 'Asia/Shanghai', 'CNY', '{}', 'ACTIVE'
WHERE NOT EXISTS (SELECT 1 FROM program WHERE code = 'PROG002');
