-- 004: Simplify to zone-based photo model (remove boards entirely)
--
-- This migration drops the boards abstraction and replaces it with a
-- zone-based photo model. Photos now carry (zone, zone_rank) for their
-- position in the left-pane gallery, pin_x/pin_y for their map placement
-- (null = unplaced), and source_upload_id to group duplicate rows created
-- from the same uploaded file.

begin;

-- 1. Drop board-related foreign key columns on photos
alter table if exists photos drop column if exists board_id;
alter table if exists photos drop column if exists board_status;
alter table if exists photos drop column if exists paired_photo_id;
alter table if exists photos drop column if exists visible;

-- 2. Drop boards table and unused legacy tables
drop table if exists boards cascade;
drop table if exists comments cascade;
drop table if exists annotations cascade;
drop table if exists activity_log cascade;

-- 3. Add zone / grouping / linking columns
alter table photos
  add column if not exists zone smallint
    check (zone is null or (zone between 1 and 6)),
  add column if not exists zone_rank smallint
    check (zone_rank is null or (zone_rank between 1 and 9)),
  add column if not exists source_upload_id uuid,
  add column if not exists linked_real_id uuid
    references photos(id) on delete set null;

-- 4. Indexes for the new query patterns
create index if not exists idx_photos_zone
  on photos(zone)
  where deleted_at is null;

create index if not exists idx_photos_source_upload_id
  on photos(source_upload_id);

create index if not exists idx_photos_linked_real_id
  on photos(linked_real_id);

create index if not exists idx_photos_pin_x_not_null
  on photos(pin_x)
  where deleted_at is null and pin_x is not null;

commit;
