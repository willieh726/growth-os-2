-- 013_interaction_type_email_draft_created.sql
--
-- Adds email_draft_created to the interaction_type enum.
-- Required for /api/email to log interactions when an email draft is saved.
-- This value was added live on 2026-11-17 via ALTER TYPE ... ADD VALUE IF NOT EXISTS.

ALTER TYPE interaction_type ADD VALUE IF NOT EXISTS 'email_draft_created';
