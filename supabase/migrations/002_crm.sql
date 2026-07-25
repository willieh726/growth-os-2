-- ============================================================
-- 002_crm.sql — Leads (pipeline) + interactions (event log)
-- ============================================================

do $$ begin
  create type lead_stage as enum
    ('new','qualified','contacted','replied','meeting','proposal','won','lost');
exception when duplicate_object then null; end $$;

do $$ begin
  create type interaction_type as enum
    ('email_sent','email_opened','email_replied','email_bounced',
     'call_made','call_script_generated','audit_generated',
     'note','stage_changed','sequence_started','sequence_stopped');
exception when duplicate_object then null; end $$;

create table if not exists leads (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null unique references businesses(id) on delete cascade,
  stage          lead_stage not null default 'new',
  owner_email    text,
  contact_name   text,
  contact_email  text,          -- best outreach email (may differ from listing email)
  notes          text,
  lost_reason    text,
  promoted_at    timestamptz not null default now(),
  stage_changed_at timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists idx_leads_stage on leads (stage);

create table if not exists interactions (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references leads(id) on delete cascade,
  type        interaction_type not null,
  channel     text,                     -- email | phone | system
  subject     text,
  body        text,
  metadata    jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_by  text not null default 'system'
);
create index if not exists idx_interactions_lead on interactions (lead_id, occurred_at desc);

drop trigger if exists trg_leads_touch on leads;
create trigger trg_leads_touch before update on leads
for each row execute function touch_updated_at();

-- Pipeline view: lead + business + latest score in one query.
create or replace view leads_full as
select l.*, b.name, b.industry, b.city, b.state, b.phone, b.email as business_email,
       b.website_url, b.has_website, b.gbp_rating, b.gbp_review_count,
       bs.opportunity_score, bs.score_breakdown,
       (select count(*) from interactions i where i.lead_id = l.id) as interaction_count,
       (select max(occurred_at) from interactions i where i.lead_id = l.id) as last_activity_at
from leads l
join businesses b on b.id = l.business_id
left join lateral (
  select opportunity_score, score_breakdown from businesses_scored s where s.id = b.id
) bs on true;
