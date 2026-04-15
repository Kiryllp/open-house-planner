-- 008: Photo history — per-image audit log
--
-- A single narrow table that records "who did what" for every photo, so
-- collaborators can see how an image evolved.  App-level logging (see
-- src/lib/photoHistory.ts and src/lib/supabaseActions.ts) — no triggers,
-- because Supabase sessions all run as the anon role and cannot see the
-- actual user display name from localStorage.
--
-- Hard-delete behavior: ON DELETE CASCADE. When a photo is hard-deleted,
-- its history rows go with it. We intentionally do NOT emit a hard_deleted
-- event at write time (it would be orphaned instantly by the cascade).
-- Users who want to preserve history should soft-delete instead.

begin;

create table photo_history (
  id          uuid primary key default gen_random_uuid(),
  photo_id    uuid not null references photos(id) on delete cascade,
  event_type  text not null check (event_type in (
    'uploaded',
    'renamed',
    'notes_changed',
    'zone_changed',
    'placed_on_map',
    'moved_on_map',
    'removed_from_map',
    'rotated',
    'fov_changed',
    'color_changed',
    'linked_to_real',
    'unlinked_from_real',
    'soft_deleted',
    'restored',
    'hard_deleted'
  )),
  actor_name  text,             -- nullable when userName is blank; rendered as "Unknown"
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index idx_photo_history_photo_created
  on photo_history(photo_id, created_at desc);

create index idx_photo_history_actor
  on photo_history(actor_name);

create index idx_photo_history_event_type
  on photo_history(event_type);

-- RLS (permissive, behind the shared password gate — matches photos table)
alter table photo_history enable row level security;
create policy "anon_all_photo_history"
  on photo_history for all using (true) with check (true);

-- Realtime: so live collaborators see each other's edits appear in the
-- History panel as they happen.
alter publication supabase_realtime add table photo_history;

-- Backfill: every existing photo gets a single synthetic "uploaded" event
-- so the History panel is never empty for pre-migration rows. The
-- `backfill: true` flag lets the UI distinguish synthetic entries if
-- it ever needs to.
insert into photo_history (photo_id, event_type, actor_name, details, created_at)
select
  id,
  'uploaded',
  created_by_name,
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
