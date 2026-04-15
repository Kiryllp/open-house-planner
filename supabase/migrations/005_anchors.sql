-- 005: Anchor flag for AI classifier reference images
--
-- Adds a boolean column that marks a photo as a "ground truth" anchor for
-- the /api/classify route. Anchors are photos the user has confirmed
-- belong to a specific zone and type. The classifier uses them as in-prompt
-- examples so Claude can do direct visual comparison rather than reasoning
-- from abstract zone descriptions.

begin;

alter table photos
  add column if not exists is_anchor boolean not null default false;

create index if not exists idx_photos_is_anchor
  on photos(is_anchor)
  where is_anchor = true and deleted_at is null;

commit;
