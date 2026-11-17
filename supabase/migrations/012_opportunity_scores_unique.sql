-- 012_opportunity_scores_unique.sql
--
-- PREREQUISITE: Run the dedup first (see note below).
-- Before applying this migration, run this in the SQL editor to remove
-- duplicate rows and keep only the latest score per business:
--
--   DELETE FROM opportunity_scores
--   WHERE id NOT IN (
--     SELECT DISTINCT ON (business_id) id
--     FROM opportunity_scores
--     ORDER BY business_id, scored_at DESC
--   );
--
-- After dedup succeeds, apply this constraint:

ALTER TABLE opportunity_scores
  ADD CONSTRAINT uq_opportunity_scores_business_id UNIQUE (business_id);
