-- 005: Expand the industry enum with five new trades.
-- Run in the Supabase SQL Editor.
alter type industry add value if not exists 'hvac';
alter type industry add value if not exists 'plumbing';
alter type industry add value if not exists 'electrical';
alter type industry add value if not exists 'roofing';
alter type industry add value if not exists 'landscaping';
