-- 009: Inbound leads — prospects who request a free audit from the marketing site.
-- These are self-qualified: they came to signalsyncagency.com and asked for an audit,
-- making them warmer than cold-outreach targets.

create table if not exists inbound_leads (
    id          uuid primary key default gen_random_uuid(),
    created_at  timestamptz not null default now(),

    -- Contact info they provided
    business_name   text not null,
    city            text not null,
    state           text not null,
    website_url     text,
    phone           text,
    contact_email   text not null,

    -- Generated audit
    audit_id        uuid references audits(id),
    share_slug      text,  -- copied from audit for easy linking

    -- Status tracking
    status          text not null default 'new',  -- new | reviewed | contacted | won | lost
    notes           text
);

create index on inbound_leads (created_at desc);
create index on inbound_leads (status);
