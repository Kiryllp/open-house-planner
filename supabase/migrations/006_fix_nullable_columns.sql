-- 006: Fix NOT NULL constraints on columns the app sends as null
--
-- The production database was created before migrations 002-003 were
-- applied, so several columns still have NOT NULL constraints that
-- conflict with the app's insert payloads.  This migration makes the
-- schema match what the code actually sends.

begin;

-- pin_x / pin_y: unplaced photos have null coordinates
alter table photos alter column pin_x drop not null;
alter table photos alter column pin_x set default null;
alter table photos alter column pin_y drop not null;
alter table photos alter column pin_y set default null;

-- notes: the app sends null when no notes are set
alter table photos alter column notes drop not null;
alter table photos alter column notes set default null;

-- sort_order: unused, app sends null
alter table photos alter column sort_order drop not null;
alter table photos alter column sort_order set default null;

-- tags: the app sends null instead of empty array
alter table photos alter column tags drop not null;
alter table photos alter column tags set default null;

commit;
