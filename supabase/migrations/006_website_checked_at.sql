-- 006: Track when a business was last checked by website discovery,
-- so batches advance through the backlog instead of re-checking the
-- same oldest businesses forever.
alter table businesses add column if not exists website_checked_at timestamptz;

-- Backfill: Friday's 600-business pass covered the original four trades'
-- no-website backlog. Mark them checked so the next batch starts on the
-- new trades instead of re-verifying old ground.
update businesses set website_checked_at = now()
where has_website = false
  and industry in ('tree_service','excavation','septic','concrete');
