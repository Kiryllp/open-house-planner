# Plan 2: Image History Tracking

## Goal

For every image in the app (both concepts and real photos), record a
chronological log of "who did what" from the moment it was uploaded, and
surface that log in the UI so any collaborator can see how an image evolved.

## Current state (verified from code)

### Identity model
- **No Supabase Auth.** The app is gated by a shared `APP_PASSWORD` in env
  and the Supabase client is initialized with the anon key.
- Users enter a display name on first visit, which is persisted in
  `localStorage.userName` and passed around as a React prop.
- Only `photos.created_by_name` captures identity today, and only at the
  moment of upload. Every subsequent mutation is anonymous.
- `useSupabaseData.ts` uses a Supabase presence channel to broadcast live
  user names but does not persist them.

### Mutation surface (all go through `src/lib/supabaseActions.ts`)

| Function | Writes | Called from (file:line) |
|---|---|---|
| `uploadPhoto` + `insertPhotos` | storage + photos INSERT | `UploadDialog.tsx:98–131`, `ConceptPreviewModal.tsx:70–112` |
| `updatePhotoDb({ name })` | photos.name | `ConceptPreviewModal.tsx:161`, `RealPhotosView.tsx:197` |
| `updatePhotoDb({ notes })` | photos.notes | `ConceptPreviewModal.tsx:145` |
| `updatePhotoDb({ zone, zone_rank })` | photos.zone | `ConceptPreviewModal.tsx:118`, `RealPhotosView.tsx:144`, `MainScreen.tsx:220` |
| `placePhotoOnMap` | pin_x, pin_y | `MainScreen.tsx:192` (first placement), `MainScreen.tsx:246` (drag end) |
| `removePhotoFromMap` | pin_x/pin_y → null | `MainScreen.tsx:277` |
| `updatePhotoDb({ direction_deg })` | direction_deg | `MainScreen.tsx:264` |
| `updatePhotoDb({ color })` | color | `MainScreen.tsx:193` (auto on first place) |
| `linkConceptToReal` | linked_real_id | `ConceptPreviewModal.tsx:46, 60`, `RealPhotosView.tsx:167, 181`, `LinkingView.tsx:70` |
| `softDeletePhoto` / `restorePhoto` | deleted_at | `MainScreen.tsx:290, 301`, `ConceptPreviewModal.tsx:131` |
| `hardDeletePhotos` | DELETE | `MainScreen.tsx:312` |

> **Implementer helper:** `MainScreen.tsx` now keeps a `photosRef` (declared
> at line 57, synced at line 83: `photosRef.current = photos`). Use
> `photosRef.current.find(p => p.id === id)` inside the mutation callbacks
> to obtain the `before` snapshot for `updatePhotoTracked` without needing
> to thread `photos` through every closure. `handleDropOnMap` and
> `handleDropOnZone` already have `photos` in their dependency array, so
> they can read the closure directly; the rest should use `photosRef`.

### Existing audit infrastructure
- Migration `001_initial_schema.sql` had an `activity_log` table — dropped
  unused in `004_simplify_to_zones.sql`.
- No triggers, no functions, no client-side logging today.

### UI host for history
- `ConceptPreviewModal.tsx:174–358` is the primary image-detail surface
  (600px-wide right drawer). It currently has header → preview → zone picker →
  notes → linked-real → footer. A "History" tab slots in between "preview"
  and "zone picker" (or becomes a top-level tab replacing the flat layout).
- `RealPhotosView.tsx`'s `RealPhotoRow` is the equivalent surface for real
  photos — also needs history.

## Design choices

### 1. App-level logging, not triggers

Triggers can capture before/after state automatically, but they can't see
"who" — the Supabase session runs as the anon role, not the user. Setting
a session variable before each mutation is fragile and would require
wrapping every update. App-level logging is:

- Explicit and auditable at the call site.
- Automatically has the actor in closure (`userName` prop).
- Can capture richer semantic events ("user dragged from zone 1 to zone 3")
  that triggers can't distinguish from plain column updates.

### 2. Single new `photo_history` table

All history goes into one narrow table with a JSON `details` column. Avoids
schema sprawl, keeps joins simple, scales well for the expected volume
(maybe 20k rows/year on a busy project).

### 3. Diff-based helper at the write layer

Instead of rewriting every call site to emit events, we introduce one
tracked update helper in `supabaseActions.ts` that:

- Accepts `before: Photo`, `updates: Partial<Photo>`, `actorName: string`.
- Computes the field-level diff.
- Maps each changed field to one of the event types.
- Performs the DB `update` then inserts the history rows (single round trip via
  Supabase `.rpc` or two independent async calls — see "Atomicity" below).

This keeps event emission co-located with the write and lets us migrate
call sites one by one.

## Schema

**New file: `supabase/migrations/008_photo_history.sql`**

```sql
-- 008: Photo history — per-image audit log
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
  actor_name  text,             -- nullable when userName is blank
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index idx_photo_history_photo_created
  on photo_history(photo_id, created_at desc);

create index idx_photo_history_actor
  on photo_history(actor_name);

create index idx_photo_history_event_type
  on photo_history(event_type);

-- RLS (permissive, behind password gate — matches photos table)
alter table photo_history enable row level security;
create policy "anon_all_photo_history"
  on photo_history for all using (true) with check (true);

-- Realtime: so live collaborators see each other's edits appear in the
-- History panel as they happen.
alter publication supabase_realtime add table photo_history;

-- Backfill: every existing photo gets a single "uploaded" event so the
-- History panel is never empty for pre-migration rows.
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
```

### `details` payload per event type

| Event | Payload shape |
|---|---|
| `uploaded` | `{ name, type, zones: ZoneId[], source_upload_id }` |
| `renamed` | `{ old: string \| null, new: string \| null }` |
| `notes_changed` | `{ old: string \| null, new: string \| null }` |
| `zone_changed` | `{ old_zone, new_zone, old_rank, new_rank }` |
| `placed_on_map` | `{ pin_x, pin_y, color, auto_assigned_color }` |
| `moved_on_map` | `{ old: { x, y }, new: { x, y } }` |
| `removed_from_map` | `{ old: { x, y } }` |
| `rotated` | `{ old_deg, new_deg }` |
| `fov_changed` | `{ old_fov, new_fov }` |
| `color_changed` | `{ old_color, new_color }` |
| `linked_to_real` | `{ real_id, real_name }` |
| `unlinked_from_real` | `{ prior_real_id, prior_real_name }` |
| `soft_deleted` | `{}` |
| `restored` | `{}` |
| `hard_deleted` | `{ last_name, last_zone }` (written *before* delete) |

## Implementation

### New files

1. **`src/lib/photoHistory.ts`**

   ```ts
   export type PhotoHistoryEventType =
     | 'uploaded' | 'renamed' | 'notes_changed' | 'zone_changed'
     | 'placed_on_map' | 'moved_on_map' | 'removed_from_map' | 'rotated'
     | 'fov_changed' | 'color_changed'
     | 'linked_to_real' | 'unlinked_from_real'
     | 'soft_deleted' | 'restored' | 'hard_deleted'

   export interface PhotoHistoryEvent {
     id: string
     photo_id: string
     event_type: PhotoHistoryEventType
     actor_name: string | null
     details: Record<string, unknown>
     created_at: string
   }

   export async function logPhotoEvent(
     photoId: string,
     eventType: PhotoHistoryEventType,
     actorName: string | null,
     details: Record<string, unknown>,
   ): Promise<void>

   export async function logPhotoEvents(
     events: Array<{
       photo_id: string
       event_type: PhotoHistoryEventType
       actor_name: string | null
       details: Record<string, unknown>
     }>,
   ): Promise<void>

   export async function fetchPhotoHistory(
     photoId: string,
   ): Promise<PhotoHistoryEvent[]>

   export function usePhotoHistory(
     photoId: string | null,
   ): {
     events: PhotoHistoryEvent[]
     loading: boolean
     error: string | null
   }
   ```

   `usePhotoHistory` subscribes to `photo_history` realtime filtered by
   `photo_id=eq.${photoId}` and keeps the list sorted desc. Unsubscribes
   on photoId change or unmount.

2. **`src/components/PhotoHistoryPanel.tsx`**

   Displays the events. Props: `photoId`, optional `photos: Photo[]` so we
   can resolve `linked_to_real.real_id` back to a name for the friendly
   label. Layout:

   - Scroll container, newest-first.
   - Each row: icon (lucide-react) + actor badge + one-line label +
     relative time ("3 hours ago"). Clicking expands the `details` JSON
     into a subtle mono-font block.
   - Empty state: "No history yet." (unreachable for backfilled rows).
   - Loading skeleton: 3 gray bars.
   - Uses the existing Tailwind palette already in ConceptPreviewModal.

### Edited files

3. **`src/lib/supabaseActions.ts`** — tracked mutation helper

   Add new functions alongside the existing ones (do not delete old
   functions — they're called from many places, we migrate gradually):

   ```ts
   // The one helper everyone moves to
   export async function updatePhotoTracked(args: {
     before: Photo
     updates: Partial<Photo>
     actorName: string | null
   }): Promise<void>
   ```

   Internals:
   - Compute the diff between `before` and `updates`.
   - Build the list of events to emit (see table in "Payload shape" section).
   - Call `supabase.from('photos').update(updates).eq('id', before.id)` first.
   - On success, call `logPhotoEvents(eventsToInsert)`.
   - If the log insert fails, log a console warning but do NOT throw — history
     loss is less bad than a failed user-visible mutation.
   - Specific legacy functions become thin wrappers:
     ```ts
     export async function placePhotoOnMap(id, pin_x, pin_y, actorName, before) {
       return updatePhotoTracked({ before, updates: { pin_x, pin_y }, actorName })
     }
     ```
     — with `actorName` and `before` as new optional params. Call sites pass
     them in as they are migrated.

   Also add:
   - `insertPhotoTracked(row, actorName)` that inserts the photo and then
     writes an `uploaded` event.
   - `softDeletePhotoTracked(id, actorName, before)`.
   - `restorePhotoTracked(...)`.
   - `hardDeletePhotosTracked(ids, actorName, beforeList)` — **decision
     locked: cascade**. Because `photo_history.photo_id` has `ON DELETE
     CASCADE`, hard-deleting a photo wipes its history rows with it. We
     therefore do NOT emit `hard_deleted` events (they would be orphaned
     instantly). The `'hard_deleted'` value stays in the check constraint
     for future use but is never written today. Accept that hard-delete
     also means "purge audit trail" — soft-delete is the preserving path.

4. **`src/components/MainScreen.tsx`**

   - Every mutation handler (`handleDropOnMap`, `handleDropOnZone`,
     `handlePinDragEnd`, `handleRotatePin`, `handleEndRotatePin`,
     `handleRemoveFromMap`, `handleSoftDelete`, `handleRestore`,
     `handleHardDelete`) has access to `photos`, `userName`, and the
     photo id. For each, look up the `before` state from `photos.find(p => p.id === id)`
     and call the new tracked helpers.
   - This is the biggest surface-area edit; it's ~10 small call-site changes.

5. **`src/components/ConceptPreviewModal.tsx`**

   - Add a top-level tab bar above the scrollable body:
     `Overview | History (N)`. Lift the current body into the Overview tab.
   - When History tab is active, render `<PhotoHistoryPanel photoId={concept.id} photos={allPhotos} />`.
   - Rewrite the six mutation handlers (`handlePickReal`, `handleUnlink`,
     `handleUploadNewReal`, `handleChangeZone`, `handleDelete`,
     `handleSaveNotes`, `handleSaveName`) to:
     - Build a `before` snapshot from the `concept` prop.
     - Call the tracked mutation helpers.
   - Accept `allPhotos` via a new prop so the history panel can show
     linked-real-name references.

6. **`src/components/RealPhotosView.tsx`**

   - Add a small "History" button to each `RealPhotoRow` (between Zone
     picker and Linked Concepts) that opens an inline `<PhotoHistoryPanel>`
     in a collapsible section.
   - Rewrite `handleChangeZone`, `handleLinkSelected`, `handleUnlinkConcept`,
     and `handleSaveName` to use the tracked helpers.

7. **`src/components/LinkingView.tsx`**

   - Update `linkToReal` to use the tracked helper.
   - No direct history UI here — the events will appear in the modal/panel
     when the user opens the image.

8. **`src/components/UploadDialog.tsx`**

   - After `insertPhotos(rows)` returns the inserted IDs, emit an `uploaded`
     event per inserted row. Group by `source_upload_id` so one file that
     creates rows in three zones gets three events, each with the zone set.
   - Pass `userName` as `actorName`.

9. **`src/lib/useSupabaseData.ts`**

   - No changes needed. Realtime is handled by the new `usePhotoHistory`
     hook locally, scoped to the open photo.

10. **`src/lib/types.ts`**

    - Add the `PhotoHistoryEvent` type and `PhotoHistoryEventType` union if
      we don't keep them in `photoHistory.ts`.

## UI behavior details

- **Order**: newest first (`created_at desc`).
- **Consolidation**: one mutation can emit multiple events (e.g. changing
  zone also resets rank). Present them as separate lines but give repeated
  events within a 2-second window a visual grouping (same actor badge,
  subdued color for the follow-ups) so the feed reads well.
- **Pin-drag noise**: `handlePinDragEnd` fires once per drag in the current
  code (line 196), so dragging produces exactly one `moved_on_map` event.
  No debouncing needed.
- **Map drop (first placement)**: emits `placed_on_map`, not `moved_on_map`
  (distinguished by `before.pin_x == null`).
- **Auto color assignment**: the color is included in the
  `placed_on_map.details.color` payload. We do NOT emit a separate
  `color_changed` event for the auto-assignment.
- **Soft delete → restore**: each is its own event. **Hard delete**: no
  event emitted; the cascade wipes the history along with the photo. This
  is the agreed behavior — if you want history preserved, use soft-delete
  and leave the row in Trash.
- **Backfill for existing photos**: handled by migration 008 — every row
  gets a synthetic `uploaded` event with `details.backfill = true`.

## Testing checklist

Against a running dev server, as user `Alice`:

- [ ] Upload a file into Zone 1 → history shows `uploaded by Alice`.
- [ ] Rename in modal → `renamed` with old/new.
- [ ] Change zone in modal → `zone_changed` with old/new zone.
- [ ] Edit notes → `notes_changed` with diff.
- [ ] Drag from left pane onto the map → `placed_on_map` with coordinates + color.
- [ ] Drag the pin → `moved_on_map` with old + new coordinates.
- [ ] Rotate the pin → `rotated` with old + new degrees.
- [ ] Click × on the carousel → `removed_from_map`.
- [ ] Link to a real photo from the modal → `linked_to_real` with real name.
- [ ] Unlink → `unlinked_from_real`.
- [ ] Soft delete → `soft_deleted`.
- [ ] Restore from Trash → `restored`.
- [ ] Hard delete → history is gone (expected: the FK cascade wipes it).
- [ ] Open a second browser tab as `Bob`, edit the same photo → `Alice` sees
  the event appear live in the History panel without refresh (realtime).
- [ ] Existing photos (pre-migration) show exactly one `uploaded` event
  with `backfill: true`.

## Decisions (locked)

1. **Hard-delete behavior:** cascade — history dies with the photo. No
   special schema gymnastics. Users who want to preserve history keep the
   photo in Trash (soft-deleted) instead of pressing Delete Forever.
2. **Session name change does not emit a renamed event.** The
   `created_by_name` column is immutable post-upload by design; future
   events just use the new `userName`.
3. **Retention:** keep forever until the table exceeds ~100k rows. Revisit
   only if volume becomes a real problem.
4. **UI placement:** `ConceptPreviewModal` gets a top-level tab bar
   (`Overview | History`) above the scroll body. `RealPhotoRow` inside
   `RealPhotosView` gets an inline collapsible History section between
   the Linked Concepts section and the footer.
5. **Actor fallback** when `userName` is blank: stored as `null` in
   `actor_name`, rendered as "Unknown" in the UI.

## Risks and mitigations

- **Double-write races.** If two tabs mutate the same photo simultaneously,
  the events are emitted in DB-insert order (ordered by `created_at`
  default `now()`). Ordering is stable enough for a display feed; exact
  causality isn't attempted.
- **Log insert fails silently.** By design — we'd rather lose a history
  row than surface the error on top of a successful user action. A
  `console.warn` is acceptable; optionally add a Sentry breadcrumb.
- **Backfill runs long on huge projects.** The migration does a single
  `insert ... select` — fine up to tens of thousands of rows. If this
  project scales beyond that, batch the backfill outside the transaction.
- **No actor for mutations performed server-side or from the print page.**
  The print page currently does a `select` only, so there's no write path.
  If future code writes from the server with the service-role key, it must
  pass an explicit `actor_name` (e.g. `"system"`).
- **`actor_name` is not canonical** (it's a free-text display name from
  localStorage). If the same person opens the app under two names, they'll
  appear as two actors. Accepted tradeoff — matches the existing identity
  model and doesn't require adding Supabase Auth.

## Out of scope

- Restoring a previous version of a photo from its history ("undo" / "time
  travel"). Could be built later using the `details` field.
- Cross-image activity feed (a "what happened today" global view). Trivial
  to add on top of this table — just a full-table query with joins.
- Diffing images at the pixel level (that's a separate feature).
- Email / notification integrations.
