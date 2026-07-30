-- 008: Flag likely-fake/squatted Google listings.
--
-- Home-service categories (plumbing, HVAC, locksmiths, garage doors) are a
-- well-documented target for Google Maps listing spam: a scammer registers
-- a business at an address they don't operate from (a big-box store, empty
-- lot, storage unit) with a working phone number, so a real call reaches
-- them. Requiring a phone number does NOT catch this — the scam depends on
-- the phone working. The strongest signal we can compute ourselves is the
-- business NAME: a real company almost never names itself as a bare street
-- address ("909 Washington St Plumbing" is a placeholder, not a company).
create or replace view businesses_scored as
select b.*,
       s.total  as opportunity_score,
       s.breakdown as score_breakdown,
       s.scored_at,
       ws.reachable as site_reachable,
       ws.crawled_at as site_crawled_at,
       -- \y is Postgres's own word-boundary escape (not \b, which behaves
       -- differently from Python/JS regex in Postgres's regex engine).
       (b.name ~* '^\d+\s+\w+.*\y(st|street|ave|avenue|rd|road|blvd|dr|drive|ln|lane|way|ct|court|pl|place)\y')
         as likely_fake_listing
from businesses b
left join lateral (
  select * from opportunity_scores os
  where os.business_id = b.id order by os.scored_at desc limit 1
) s on true
left join lateral (
  select * from website_snapshots w
  where w.business_id = b.id order by w.crawled_at desc limit 1
) ws on true;

-- leads_full selects explicit columns (not s.*), so the new flag needs to be
-- added here too or it silently never reaches the lead detail page.
create or replace view leads_full as
select l.*, b.name, b.industry, b.city, b.state, b.phone, b.email as business_email,
       b.website_url, b.has_website, b.gbp_rating, b.gbp_review_count,
       bs.opportunity_score, bs.score_breakdown, bs.likely_fake_listing,
       (select count(*) from interactions i where i.lead_id = l.id) as interaction_count,
       (select max(occurred_at) from interactions i where i.lead_id = l.id) as last_activity_at
from leads l
join businesses b on b.id = l.business_id
left join lateral (
  select opportunity_score, score_breakdown, likely_fake_listing
  from businesses_scored s where s.id = b.id
) bs on true;
