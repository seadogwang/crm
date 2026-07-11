-- V1_30__member_enroll_channel.sql
ALTER TABLE member ADD COLUMN IF NOT EXISTS enroll_channel VARCHAR(50);
COMMENT ON COLUMN member.enroll_channel IS '入会渠道编码';