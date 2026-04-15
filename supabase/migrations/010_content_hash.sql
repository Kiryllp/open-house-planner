-- 010: Add content_hash (SHA-256 hex) for upload-time duplicate detection.
--
-- Byte-identical files (same bytes, any filename) are treated as duplicates
-- by the upload dedup check in UploadDialog. The column is nullable because
-- legacy rows from before this migration are backfilled via a one-time
-- manual pass, and because the check gracefully degrades to "no match" for
-- rows with null hash.
--
-- The partial index covers only rows with a non-null hash. Both active and
-- soft-deleted (trashed) rows participate in dup matching — a photo in
-- Trash still blocks re-upload until it is permanently removed from the
-- Trash tab.

begin;

alter table photos
  add column if not exists content_hash text;

create index if not exists idx_photos_content_hash
  on photos(content_hash)
  where content_hash is not null;

commit;
