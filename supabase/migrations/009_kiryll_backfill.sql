-- 009: Rewrite photo history backfill to credit "Kiryll"
--
-- The 008 backfill used photos.created_by_name as the actor, which was
-- often null or a test-account name. Kiryll was the only person using
-- the app before Plan 2 landed, so attribute every synthetic backfill
-- row to "Kiryll" for a cleaner history feed.
--
-- This migration also ensures every photo has at least one backfill
-- event, in case new photos were inserted between 008 and now.

begin;

-- Rewrite actor on all existing backfill rows.
update photo_history
set actor_name = 'Kiryll'
where details->>'backfill' = 'true';

-- Create missing backfill rows for any photos without history, again
-- crediting Kiryll. (Idempotent: the WHERE NOT EXISTS guard skips
-- photos that already have any history row.)
insert into photo_history (photo_id, event_type, actor_name, details, created_at)
select
  id,
  'uploaded',
  'Kiryll',
  jsonb_build_object(
    'name', name,
    'type', type,
    'zone', zone,
    'backfill', true
  ),
  created_at
from photos
where not exists (
  select 1 from photo_history where photo_history.photo_id = photos.id
);

commit;
