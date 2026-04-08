-- Open House Planner: Initial Schema
-- Apply this to a fresh Supabase project to replicate the production schema.

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- ============================================================
-- TABLES
-- ============================================================

create table photos (
  id          uuid primary key default gen_random_uuid(),
  file_url    text not null,
  type        text not null check (type in ('real', 'concept')),
  pin_x       double precision not null default 50,
  pin_y       double precision not null default 50,
  direction_deg double precision not null default 0,
  fov_deg     double precision not null default 60,
  cone_length double precision not null default 18,
  notes       text not null default '',
  color       text,
  board_id    uuid,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  created_by_name text,
  visible     boolean not null default true,
  sort_order  integer not null default 0,
  paired_photo_id uuid,
  tags        text[] not null default '{}'
);

create table boards (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  pin_x       double precision not null default 50,
  pin_y       double precision not null default 50,
  facing_deg  double precision not null default 0,
  notes       text not null default '',
  color       text,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now()
);

create table comments (
  id          uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('photo', 'board')),
  parent_id   uuid not null,
  author_name text not null,
  body        text not null,
  created_at  timestamptz not null default now()
);

create table annotations (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('text', 'rectangle', 'polygon')),
  points      jsonb not null default '[]',
  label       text not null default '',
  color       text not null default '#3b82f6',
  fill_opacity double precision not null default 0.15,
  stroke_width double precision not null default 2,
  deleted_at  timestamptz,
  created_at  timestamptz not null default now(),
  created_by_name text
);

create table activity_log (
  id          uuid primary key default gen_random_uuid(),
  action      text not null,
  actor_name  text not null,
  target_type text not null,
  target_id   uuid not null,
  details     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- ============================================================
-- FOREIGN KEYS (soft — board_id is nullable)
-- ============================================================
alter table photos add constraint photos_board_id_fkey
  foreign key (board_id) references boards(id) on delete set null;

alter table photos add constraint photos_paired_photo_id_fkey
  foreign key (paired_photo_id) references photos(id) on delete set null;

-- ============================================================
-- INDEXES
-- ============================================================
create index idx_photos_board_id on photos(board_id);
create index idx_photos_deleted_at on photos(deleted_at);
create index idx_boards_deleted_at on boards(deleted_at);
create index idx_comments_parent on comments(parent_type, parent_id);
create index idx_annotations_deleted_at on annotations(deleted_at);
create index idx_activity_log_created_at on activity_log(created_at desc);

-- ============================================================
-- DISABLE ROW LEVEL SECURITY (app is behind password gate)
-- ============================================================
alter table photos enable row level security;
alter table boards enable row level security;
alter table comments enable row level security;
alter table annotations enable row level security;
alter table activity_log enable row level security;

-- Allow anon full access (matches production MVP setup)
create policy "anon_all_photos" on photos for all using (true) with check (true);
create policy "anon_all_boards" on boards for all using (true) with check (true);
create policy "anon_all_comments" on comments for all using (true) with check (true);
create policy "anon_all_annotations" on annotations for all using (true) with check (true);
create policy "anon_all_activity_log" on activity_log for all using (true) with check (true);

-- ============================================================
-- REALTIME — enable postgres_changes on all tables
-- ============================================================
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table boards;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table annotations;
alter publication supabase_realtime add table activity_log;

-- ============================================================
-- STORAGE — create photos bucket (public)
-- ============================================================
insert into storage.buckets (id, name, public)
values ('photos', 'photos', true)
on conflict (id) do nothing;

-- Allow public read/write on photos bucket
create policy "public_read_photos" on storage.objects
  for select using (bucket_id = 'photos');

create policy "public_insert_photos" on storage.objects
  for insert with check (bucket_id = 'photos');

create policy "public_update_photos" on storage.objects
  for update using (bucket_id = 'photos');

create policy "public_delete_photos" on storage.objects
  for delete using (bucket_id = 'photos');
