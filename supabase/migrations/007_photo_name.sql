-- 007: Add human-readable name column to photos
--
-- Stores the original filename (sans extension) or a user-provided
-- display name.  Used in the UI for editing and in export file naming.

alter table photos add column if not exists name text;
