-- 010_rls.sql
-- Enable Row Level Security on all tables.
-- The backend connects via direct Postgres (asyncpg) as the superuser role,
-- which bypasses RLS entirely — no backend queries are affected.
-- The Supabase anon/public key gets zero access to any table.

alter table businesses             enable row level security;
alter table ingestion_runs         enable row level security;
alter table website_snapshots      enable row level security;
alter table opportunity_scores     enable row level security;
alter table leads                  enable row level security;
alter table interactions           enable row level security;
alter table audits                 enable row level security;
alter table sequences              enable row level security;
alter table sequence_steps         enable row level security;
alter table sequence_enrollments   enable row level security;
alter table outreach_messages      enable row level security;
alter table inbound_leads          enable row level security;

-- No permissive policies are created, so the anon role sees nothing.
-- If Supabase Realtime or Storage ever needs access, add targeted policies here.
