-- Fix column types: JSONB -> TEXT for Hibernate String compatibility
ALTER TABLE IF EXISTS master_data_definition ALTER COLUMN config TYPE text;
ALTER TABLE IF EXISTS master_data_hierarchy ALTER COLUMN ext_attributes TYPE text;
ALTER TABLE IF EXISTS master_data_mapping ALTER COLUMN ext_attributes TYPE text;
