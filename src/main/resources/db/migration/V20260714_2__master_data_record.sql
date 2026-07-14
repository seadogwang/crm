-- Master Data Records for user-defined business entities
-- field_values stores all entity field data as JSONB,
-- driven by program_schema.field_schema configuration

CREATE TABLE IF NOT EXISTS master_data_record (
    id              VARCHAR(64) PRIMARY KEY,
    program_code    VARCHAR(32) NOT NULL,
    entity_type     VARCHAR(100) NOT NULL,        -- references program_schema.entity_type
    field_values    JSONB NOT NULL DEFAULT '{}',  -- all field data stored here
    status          VARCHAR(20) DEFAULT 'ACTIVE',
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_mdr_entity ON master_data_record(program_code, entity_type);
