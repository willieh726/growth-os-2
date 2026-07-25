-- ============================================================
-- 001_core.sql — Lead ingestion core: businesses, ingestion
-- runs, website snapshots, opportunity scores.
-- Dedup is enforced HERE (DB level), not only in app code.
-- ============================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- Industries are an enum: Phase 1 is a fixed vertical set and enums make
-- bad data impossible. Adding a value later is one ALTER TYPE.
do $$ begin
  create type industry as enum ('tree_service','excavation','septic','concrete');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ingest_source as enum ('google_places','csv_registry','outscraper','manual');
exception when duplicate_object then null; end $$;

do $$ begin
  create type run_status as enum ('queued','running','completed','failed');
exception when duplicate_object then null; end $$;

-- ────────────────────────────────────────────────────────────
create table if not exists businesses (
  id               uuid primary key default gen_random_uuid(),
  google_place_id  text unique,                  -- dedup tier 1
  name             text not null,
  normalized_name  text not null,                -- lowercased, suffix-stripped; used for fuzzy dedup
  industry         industry not null,
  phone            text,
  phone_normalized text,                         -- digits-only E.164-ish; dedup tier 2
  email            text,
  website_url      text,
  has_website      boolean not null default false,
  address_line     text,
  city             text,
  state            char(2) not null,
  zip              text,
  lat              double precision,
  lng              double precision,
  gbp_rating       numeric(2,1),
  gbp_review_count integer,
  gbp_photo_count  integer,
  gbp_types        text[],
  business_status  text,                          -- OPERATIONAL / CLOSED_*
  source           ingest_source not null,
  source_payload   jsonb,                         -- raw provider record, always kept for reprocessing
  first_seen_at    timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Dedup tier 2: same normalized phone in same state = same business.
create unique index if not exists uq_businesses_phone
  on businesses (phone_normalized, state)
  where phone_normalized is not null;

-- Dedup tier 3 support: trigram fuzzy match on name within a zip.
create index if not exists idx_businesses_name_trgm
  on businesses using gin (normalized_name gin_trgm_ops);
create index if not exists idx_businesses_state_industry on businesses (state, industry);
create index if not exists idx_businesses_zip on businesses (zip);

-- ────────────────────────────────────────────────────────────
create table if not exists ingestion_runs (
  id             uuid primary key default gen_random_uuid(),
  source         ingest_source not null,
  industry       industry,
  state          char(2),
  cities         text[],
  status         run_status not null default 'queued',
  stats          jsonb not null default '{}'::jsonb,  -- {fetched, inserted, merged, skipped, errors}
  error          text,
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);

-- ────────────────────────────────────────────────────────────
-- Point-in-time website analysis. Separate table (not columns on
-- businesses) because we re-crawl and want history — "their site
-- hasn't changed in 14 months" is itself a sales signal.
create table if not exists website_snapshots (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references businesses(id) on delete cascade,
  url                 text,
  reachable           boolean not null default false,
  status_code         integer,
  is_https            boolean,
  has_viewport_meta   boolean,
  has_contact_form    boolean,
  has_quote_cta       boolean,
  has_title           boolean,
  title_text          text,
  has_meta_description boolean,
  has_h1              boolean,
  has_schema_org      boolean,
  copyright_year      integer,
  detected_builder    text,          -- wix, godaddy, squarespace, wordpress, custom…
  page_bytes          integer,
  load_ms             integer,
  raw_signals         jsonb not null default '{}'::jsonb,
  crawled_at          timestamptz not null default now()
);
create index if not exists idx_snapshots_business on website_snapshots (business_id, crawled_at desc);

-- ────────────────────────────────────────────────────────────
-- Versioned scores: never overwrite, insert a new row. Lets us
-- re-tune weights and compare cohorts scored under old weights.
create table if not exists opportunity_scores (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  total         integer not null check (total between 0 and 100),
  breakdown     jsonb not null,     -- {signal: {points, max, reason}}
  weights_version text not null,
  scored_at     timestamptz not null default now()
);
create index if not exists idx_scores_business on opportunity_scores (business_id, scored_at desc);

-- Convenience view: each business with its latest score + snapshot.
create or replace view businesses_scored as
select b.*,
       s.total  as opportunity_score,
       s.breakdown as score_breakdown,
       s.scored_at,
       ws.reachable as site_reachable,
       ws.crawled_at as site_crawled_at
from businesses b
left join lateral (
  select * from opportunity_scores os
  where os.business_id = b.id order by os.scored_at desc limit 1
) s on true
left join lateral (
  select * from website_snapshots w
  where w.business_id = b.id order by w.crawled_at desc limit 1
) ws on true;

create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

drop trigger if exists trg_businesses_touch on businesses;
create trigger trg_businesses_touch before update on businesses
for each row execute function touch_updated_at();
