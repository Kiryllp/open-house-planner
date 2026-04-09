-- Open House Planner: Schema Simplification
-- Make photo pin coordinates nullable (photos don't need to be pinned to the map).
-- Remove unused tables from realtime publication to reduce traffic.

-- Make pin_x and pin_y nullable on photos (photos uploaded to pool have no map position)
ALTER TABLE photos ALTER COLUMN pin_x DROP NOT NULL;
ALTER TABLE photos ALTER COLUMN pin_x SET DEFAULT NULL;
ALTER TABLE photos ALTER COLUMN pin_y DROP NOT NULL;
ALTER TABLE photos ALTER COLUMN pin_y SET DEFAULT NULL;

-- Stop broadcasting changes for tables the app no longer subscribes to
ALTER PUBLICATION supabase_realtime DROP TABLE comments;
ALTER PUBLICATION supabase_realtime DROP TABLE annotations;
ALTER PUBLICATION supabase_realtime DROP TABLE activity_log;
