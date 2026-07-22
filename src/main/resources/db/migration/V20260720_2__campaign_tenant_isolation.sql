-- Add program_code to campaign_plan for tenant isolation
-- campaign_plan has owner_program_code but the TenantHibernateInterceptor
-- uses program_code column name to inject tenant filter conditions.

ALTER TABLE IF EXISTS campaign_plan ADD COLUMN IF NOT EXISTS program_code VARCHAR(32);

-- Backfill program_code from owner_program_code for existing rows
UPDATE campaign_plan SET program_code = owner_program_code WHERE program_code IS NULL AND owner_program_code IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_campaign_plan_program ON campaign_plan(program_code);