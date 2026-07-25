-- 004_website_discovery.sql — track websites we discovered via web search
-- that the owner never linked to their Google Business Profile.
alter table businesses
  add column if not exists website_discovered boolean not null default false;
