-- 011_businesses_dedup_constraint.sql
-- Add unique constraint on (normalized_name, city, state) so inbound form
-- submissions upsert onto an existing business instead of creating duplicates.

create unique index if not exists uq_businesses_name_city_state
  on businesses (normalized_name, city, state);
