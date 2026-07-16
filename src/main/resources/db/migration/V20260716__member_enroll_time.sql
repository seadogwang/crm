-- Add enroll_time column to member table
ALTER TABLE IF EXISTS member ADD COLUMN IF NOT EXISTS enroll_time TIMESTAMPTZ;
