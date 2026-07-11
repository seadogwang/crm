-- ============================================================
-- program_schema 增加实体表映射配置
-- 定义每条 schema 记录映射到哪个实体表、固定字段映射、扩展属性列
-- ============================================================
ALTER TABLE program_schema ADD COLUMN IF NOT EXISTS table_name VARCHAR(64);
ALTER TABLE program_schema ADD COLUMN IF NOT EXISTS fixed_field_mapping JSONB;
ALTER TABLE program_schema ADD COLUMN IF NOT EXISTS ext_column VARCHAR(64) DEFAULT 'ext_attributes';

COMMENT ON COLUMN program_schema.table_name IS '映射的实体表名: member / transaction_event';
COMMENT ON COLUMN program_schema.fixed_field_mapping IS '固定字段映射: {"memberId":"member_id","name":"name",...}';
COMMENT ON COLUMN program_schema.ext_column IS '扩展属性存储列名，默认 ext_attributes';

-- 更新现有 MEMBER schema 的映射配置
UPDATE program_schema SET
    table_name = 'member',
    fixed_field_mapping = '{
        "memberId": "member_id",
        "name": "name",
        "gender": "gender",
        "birthday": "birthday",
        "tierCode": "tier_code",
        "status": "status",
        "schemaVersion": "schema_version",
        "createdAt": "created_at"
    }'::jsonb,
    ext_column = 'ext_attributes'
WHERE entity_type = 'MEMBER';

-- 更新现有 ORDER schema 的映射配置
UPDATE program_schema SET
    table_name = 'transaction_event',
    fixed_field_mapping = '{
        "orderId": "event_id",
        "memberId": "member_id",
        "eventType": "event_type",
        "channel": "channel",
        "tradeTime": "trade_time",
        "payTime": "pay_time",
        "orderAmount": "order_amount",
        "tradeStatus": "trade_status"
    }'::jsonb,
    ext_column = 'ext_attributes'
WHERE entity_type = 'ORDER';

-- 更新现有 BEHAVIOR schema 的映射配置
UPDATE program_schema SET
    table_name = 'transaction_event',
    fixed_field_mapping = '{
        "eventType": "event_type",
        "memberId": "member_id",
        "channel": "channel",
        "eventTime": "event_time"
    }'::jsonb,
    ext_column = 'ext_attributes'
WHERE entity_type = 'BEHAVIOR';

-- 更新现有 TRANSACTION schema 的映射配置
UPDATE program_schema SET
    table_name = 'transaction_event',
    fixed_field_mapping = '{
        "eventType": "event_type",
        "memberId": "member_id",
        "channel": "channel",
        "eventTime": "event_time",
        "orderAmount": "order_amount",
        "tradeStatus": "trade_status"
    }'::jsonb,
    ext_column = 'ext_attributes'
WHERE entity_type = 'TRANSACTION';