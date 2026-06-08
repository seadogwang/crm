-- V1_4: P1 accounting fixes
-- 1. RedemptionAllocation allocated_amount precision change: (20,2) -> (18,4)
ALTER TABLE redemption_allocation ALTER COLUMN allocated_amount TYPE NUMERIC(18,4);

-- 2. AccountTransaction rule_snapshot_id column
ALTER TABLE account_transaction ADD COLUMN IF NOT EXISTS rule_snapshot_id VARCHAR(64);