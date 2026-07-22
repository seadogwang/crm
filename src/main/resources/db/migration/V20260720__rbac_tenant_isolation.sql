-- Add program_code to sys_user_role and sys_role_permission for tenant isolation
-- These tables reference sys_user and sys_role which already have program_code,
-- but lack their own tenant column for the Hibernate StatementInspector to filter.

ALTER TABLE IF EXISTS sys_user_role ADD COLUMN IF NOT EXISTS program_code VARCHAR(64);
ALTER TABLE IF EXISTS sys_role_permission ADD COLUMN IF NOT EXISTS program_code VARCHAR(64);

-- Populate program_code from the parent table for existing rows
UPDATE sys_user_role sur SET program_code = su.program_code
    FROM sys_user su WHERE sur.user_id = su.id AND sur.program_code IS NULL;

UPDATE sys_role_permission srp SET program_code = sr.program_code
    FROM sys_role sr WHERE srp.role_id = sr.id AND srp.program_code IS NULL;

-- Make program_code NOT NULL after backfill
ALTER TABLE IF EXISTS sys_user_role ALTER COLUMN program_code SET NOT NULL;
ALTER TABLE IF EXISTS sys_role_permission ALTER COLUMN program_code SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sur_program ON sys_user_role(program_code);
CREATE INDEX IF NOT EXISTS idx_srp_program ON sys_role_permission(program_code);