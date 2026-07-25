-- ============================================================
-- 003_audits_outreach.sql — AI audits, sequences, outreach state
-- ============================================================

create table if not exists audits (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  lead_id     uuid references leads(id) on delete set null,
  content_md  text not null,
  summary     text,
  share_slug  text unique not null,      -- public, unguessable audit link
  model       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_audits_business on audits (business_id, created_at desc);

-- Sequences are templates; enrollments are per-lead state machines.
create table if not exists sequences (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists sequence_steps (
  id           uuid primary key default gen_random_uuid(),
  sequence_id  uuid not null references sequences(id) on delete cascade,
  step_number  int not null,
  delay_days   int not null default 0,      -- days after previous step
  step_type    text not null default 'email',  -- email | call_task
  intent       text not null,               -- guidance for the AI writer, e.g. 'initial_value', 'bump', 'breakup'
  unique (sequence_id, step_number)
);

do $$ begin
  create type enrollment_status as enum ('active','completed','stopped_reply','stopped_manual','bounced');
exception when duplicate_object then null; end $$;

create table if not exists sequence_enrollments (
  id             uuid primary key default gen_random_uuid(),
  lead_id        uuid not null references leads(id) on delete cascade,
  sequence_id    uuid not null references sequences(id) on delete cascade,
  status         enrollment_status not null default 'active',
  current_step   int not null default 0,      -- last completed step_number
  next_send_at   timestamptz,                 -- null when finished/stopped
  stopped_reason text,
  created_at     timestamptz not null default now(),
  unique (lead_id, sequence_id)
);
create index if not exists idx_enrollments_due
  on sequence_enrollments (next_send_at) where status = 'active';

-- Every AI-generated or sent message. resend_email_id links replies back.
create table if not exists outreach_messages (
  id              uuid primary key default gen_random_uuid(),
  lead_id         uuid not null references leads(id) on delete cascade,
  enrollment_id   uuid references sequence_enrollments(id) on delete set null,
  step_number     int,
  kind            text not null,               -- cold_email | follow_up | call_script
  subject         text,
  body            text not null,
  status          text not null default 'draft',  -- draft | sent | failed
  resend_email_id text unique,
  to_email        text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists idx_messages_lead on outreach_messages (lead_id, created_at desc);

-- Default 4-touch sequence, seeded once.
insert into sequences (id, name, description)
select gen_random_uuid(), 'Default contractor outreach',
       'Audit-led 4-touch email sequence over 11 days'
where not exists (select 1 from sequences where name = 'Default contractor outreach');

insert into sequence_steps (sequence_id, step_number, delay_days, step_type, intent)
select s.id, v.n, v.d, v.t, v.i
from sequences s,
     (values (1, 0, 'email', 'initial_value'),
             (2, 3, 'email', 'bump_with_proof'),
             (3, 4, 'email', 'new_angle_reviews'),
             (4, 4, 'email', 'breakup')) as v(n, d, t, i)
where s.name = 'Default contractor outreach'
  and not exists (select 1 from sequence_steps st where st.sequence_id = s.id);
