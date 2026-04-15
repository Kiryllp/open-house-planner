import { createClient } from './supabase/client'
import {
  logPhotoEvents,
  type PhotoHistoryEventInsert,
  type PhotoHistoryEventType,
} from './photoHistory'
import type { Photo } from './types'

export type PhotoInsert = Omit<Photo, 'id' | 'created_at'>

function getClient() {
  return createClient()
}

export async function uploadPhoto(file: File): Promise<string> {
  const supabase = getClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const fileName = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('photos').upload(fileName, file, {
    contentType: file.type || undefined,
  })
  if (error) throw error
  const { data } = supabase.storage.from('photos').getPublicUrl(fileName)
  return data.publicUrl
}

export async function insertPhoto(photo: PhotoInsert): Promise<Photo> {
  const supabase = getClient()
  const { data, error } = await supabase.from('photos').insert(photo).select().single()
  if (error) throw error
  return data as Photo
}

export async function insertPhotos(photos: PhotoInsert[]): Promise<Photo[]> {
  if (photos.length === 0) return []
  const supabase = getClient()
  const { data, error } = await supabase.from('photos').insert(photos).select()
  if (error) throw error
  return (data ?? []) as Photo[]
}

export async function updatePhotoDb(id: string, updates: Partial<Photo>) {
  const supabase = getClient()
  const { error } = await supabase.from('photos').update(updates).eq('id', id)
  if (error) throw error
}

export async function softDeletePhoto(id: string) {
  return updatePhotoDb(id, { deleted_at: new Date().toISOString() })
}

export async function restorePhoto(id: string) {
  return updatePhotoDb(id, { deleted_at: null })
}

export async function hardDeletePhotos(ids: string[]) {
  if (ids.length === 0) return
  const supabase = getClient()
  const { error } = await supabase.from('photos').delete().in('id', ids)
  if (error) throw error
}

export async function linkConceptToReal(conceptId: string, realId: string | null) {
  return updatePhotoDb(conceptId, { linked_real_id: realId })
}

export async function setPhotoZone(
  id: string,
  zone: Photo['zone'],
  zone_rank: number | null,
) {
  return updatePhotoDb(id, { zone, zone_rank })
}

export async function placePhotoOnMap(
  id: string,
  pin_x: number,
  pin_y: number,
) {
  return updatePhotoDb(id, { pin_x, pin_y })
}

export async function removePhotoFromMap(id: string) {
  return updatePhotoDb(id, { pin_x: null, pin_y: null })
}

// =====================================================================
// History-tracked mutation helpers
// =====================================================================
//
// These wrap the non-tracked helpers above, performing the DB write
// first and then logging one or more photo_history events. If the log
// insert fails, we console.warn but do NOT throw — a failed audit entry
// is strictly less bad than surfacing the error on top of a successful
// user-visible mutation.

function normalizeActor(actorName: string | null | undefined): string | null {
  if (!actorName) return null
  const trimmed = actorName.trim()
  return trimmed.length > 0 ? trimmed : null
}

async function logEventsSafe(events: PhotoHistoryEventInsert[]): Promise<void> {
  if (events.length === 0) return
  try {
    await logPhotoEvents(events)
  } catch (err) {
    console.warn('Failed to log photo history events', err)
  }
}

function diffUpdatesToEvents(
  before: Photo,
  updates: Partial<Photo>,
  actorName: string | null,
  context: {
    linkedRealName?: string | null
    priorLinkedRealName?: string | null
    autoAssignedColor?: boolean
  } = {},
): PhotoHistoryEventInsert[] {
  const events: PhotoHistoryEventInsert[] = []
  const actor = normalizeActor(actorName)

  const pushEvent = (
    event_type: PhotoHistoryEventType,
    details: Record<string, unknown>,
  ) => {
    events.push({
      photo_id: before.id,
      event_type,
      actor_name: actor,
      details,
    })
  }

  // Name
  if ('name' in updates && updates.name !== before.name) {
    pushEvent('renamed', {
      old: before.name ?? null,
      new: updates.name ?? null,
    })
  }

  // Notes
  if ('notes' in updates && updates.notes !== before.notes) {
    pushEvent('notes_changed', {
      old: before.notes ?? null,
      new: updates.notes ?? null,
    })
  }

  // Zone (+ zone_rank carried along for context)
  if ('zone' in updates && updates.zone !== before.zone) {
    const newZoneRank =
      'zone_rank' in updates ? (updates.zone_rank ?? null) : before.zone_rank
    pushEvent('zone_changed', {
      old_zone: before.zone,
      new_zone: updates.zone ?? null,
      old_rank: before.zone_rank,
      new_rank: newZoneRank,
    })
  }

  // Pin placement / movement / removal — handled as a 3-state transition:
  //   null -> xy  : placed_on_map
  //   xy   -> xy' : moved_on_map
  //   xy   -> null: removed_from_map
  const xyInUpdates = 'pin_x' in updates || 'pin_y' in updates
  if (xyInUpdates) {
    const nextX = 'pin_x' in updates ? (updates.pin_x ?? null) : before.pin_x
    const nextY = 'pin_y' in updates ? (updates.pin_y ?? null) : before.pin_y
    const wasPlaced = before.pin_x != null && before.pin_y != null
    const isPlaced = nextX != null && nextY != null

    if (!wasPlaced && isPlaced) {
      pushEvent('placed_on_map', {
        pin_x: nextX,
        pin_y: nextY,
        color: 'color' in updates ? (updates.color ?? null) : before.color,
        auto_assigned_color: context.autoAssignedColor === true,
      })
    } else if (wasPlaced && !isPlaced) {
      pushEvent('removed_from_map', {
        old: { x: before.pin_x, y: before.pin_y },
      })
    } else if (
      wasPlaced &&
      isPlaced &&
      (nextX !== before.pin_x || nextY !== before.pin_y)
    ) {
      pushEvent('moved_on_map', {
        old: { x: before.pin_x, y: before.pin_y },
        new: { x: nextX, y: nextY },
      })
    }
  }

  // Rotation
  if (
    'direction_deg' in updates &&
    updates.direction_deg !== before.direction_deg
  ) {
    pushEvent('rotated', {
      old_deg: before.direction_deg,
      new_deg: updates.direction_deg,
    })
  }

  // Color — skip if it's the auto-assigned color on first placement (that
  // gets bundled into the placed_on_map event instead).
  if ('color' in updates && updates.color !== before.color) {
    const suppressForAutoPlace =
      context.autoAssignedColor === true &&
      before.pin_x == null &&
      'pin_x' in updates
    if (!suppressForAutoPlace) {
      pushEvent('color_changed', {
        old_color: before.color ?? null,
        new_color: updates.color ?? null,
      })
    }
  }

  // Linking (concept → real)
  if (
    'linked_real_id' in updates &&
    updates.linked_real_id !== before.linked_real_id
  ) {
    if (updates.linked_real_id) {
      pushEvent('linked_to_real', {
        real_id: updates.linked_real_id,
        real_name: context.linkedRealName ?? null,
        prior_real_id: before.linked_real_id ?? null,
        prior_real_name: context.priorLinkedRealName ?? null,
      })
    } else {
      pushEvent('unlinked_from_real', {
        prior_real_id: before.linked_real_id ?? null,
        prior_real_name: context.priorLinkedRealName ?? null,
      })
    }
  }

  // Soft delete / restore
  if ('deleted_at' in updates && updates.deleted_at !== before.deleted_at) {
    if (updates.deleted_at) {
      pushEvent('soft_deleted', {})
    } else {
      pushEvent('restored', {})
    }
  }

  return events
}

export interface UpdatePhotoTrackedArgs {
  before: Photo
  updates: Partial<Photo>
  actorName: string | null
  linkedRealName?: string | null
  priorLinkedRealName?: string | null
  autoAssignedColor?: boolean
}

/**
 * Diff-aware update helper. Performs the DB write, then logs one event
 * per changed field. Log failures are swallowed with a console.warn —
 * they never surface as user-visible errors.
 *
 * NOTE for `linked_real_id` writes: do NOT call this directly to change a
 * concept's link. Use `updateConceptGroupLinkTracked` below — it cascades
 * the write across every sibling row in the same `source_upload_id` group
 * so multi-zone concepts stay consistent. Writing via this function will
 * silently leave sibling zones unlinked.
 */
export async function updatePhotoTracked(
  args: UpdatePhotoTrackedArgs,
): Promise<void> {
  const { before, updates, actorName } = args
  if (Object.keys(updates).length === 0) return
  await updatePhotoDb(before.id, updates)
  const events = diffUpdatesToEvents(before, updates, actorName, {
    linkedRealName: args.linkedRealName,
    priorLinkedRealName: args.priorLinkedRealName,
    autoAssignedColor: args.autoAssignedColor,
  })
  await logEventsSafe(events)
}

export interface UpdateConceptGroupLinkArgs {
  /** The concept row the user clicked. Its `source_upload_id` identifies the group. */
  concept: Photo
  /**
   * Any pool of photos that contains the sibling concept rows. Usually this is
   * `conceptPhotos` from MainScreen, but `allPhotos` works too — the helper
   * filters to `type === 'concept'` internally.
   */
  siblingPool: Photo[]
  /**
   * Pool of photos used to look up real-photo display names for history events.
   * `realPhotos` or `allPhotos` both work.
   */
  realPhotos: Photo[]
  /** New link target. Null means "unlink". */
  newRealId: string | null
  actorName: string | null
}

/**
 * Cascade a link/unlink across every concept row that shares `source_upload_id`
 * with `concept`. This is the ONLY sanctioned path for writing `linked_real_id`
 * on concept rows — a direct `updatePhotoTracked({ updates: { linked_real_id } })`
 * leaves sibling zones in an inconsistent state (a multi-zone concept would
 * appear linked in one zone and unlinked in another).
 *
 * Emits one `linked_to_real` / `unlinked_from_real` history event per sibling
 * via the existing `updatePhotoTracked` path. Rows already at the target
 * `linked_real_id` are skipped so the audit log stays clean. Rows with a null
 * `source_upload_id` (legacy uploads) are treated as a group of one.
 */
export async function updateConceptGroupLinkTracked(
  args: UpdateConceptGroupLinkArgs,
): Promise<void> {
  const { concept, siblingPool, realPhotos, newRealId, actorName } = args

  const siblings = concept.source_upload_id
    ? siblingPool.filter(
        (p) =>
          p.type === 'concept' &&
          p.source_upload_id === concept.source_upload_id &&
          !p.deleted_at,
      )
    : [concept]

  const newLinkedRealName =
    newRealId != null
      ? realPhotos.find((r) => r.id === newRealId)?.name ?? null
      : null

  await Promise.all(
    siblings.map((sibling) => {
      if (sibling.linked_real_id === newRealId) return Promise.resolve()
      const priorLinkedRealName =
        sibling.linked_real_id != null
          ? realPhotos.find((r) => r.id === sibling.linked_real_id)?.name ?? null
          : null
      return updatePhotoTracked({
        before: sibling,
        updates: { linked_real_id: newRealId },
        actorName,
        linkedRealName: newLinkedRealName,
        priorLinkedRealName,
      })
    }),
  )
}

/**
 * Insert a photo and emit a single `uploaded` event. Returns the
 * inserted row so callers can read its id.
 */
export async function insertPhotoTracked(
  row: PhotoInsert,
  actorName: string | null,
): Promise<Photo> {
  const inserted = await insertPhoto(row)
  const zones: number[] = inserted.zone != null ? [inserted.zone] : []
  await logEventsSafe([
    {
      photo_id: inserted.id,
      event_type: 'uploaded',
      actor_name: normalizeActor(actorName),
      details: {
        name: inserted.name ?? null,
        type: inserted.type,
        zones,
        source_upload_id: inserted.source_upload_id,
      },
    },
  ])
  return inserted
}

/**
 * Insert a batch of photos and emit one `uploaded` event per row.
 * Used by the multi-zone concept upload path — one file that lands in
 * three zones produces three rows and three events.
 */
export async function insertPhotosTracked(
  rows: PhotoInsert[],
  actorName: string | null,
): Promise<Photo[]> {
  const inserted = await insertPhotos(rows)
  if (inserted.length === 0) return inserted
  const actor = normalizeActor(actorName)
  const events: PhotoHistoryEventInsert[] = inserted.map((photo) => ({
    photo_id: photo.id,
    event_type: 'uploaded',
    actor_name: actor,
    details: {
      name: photo.name ?? null,
      type: photo.type,
      zones: photo.zone != null ? [photo.zone] : [],
      source_upload_id: photo.source_upload_id,
    },
  }))
  await logEventsSafe(events)
  return inserted
}

export async function softDeletePhotoTracked(
  before: Photo,
  actorName: string | null,
): Promise<void> {
  return updatePhotoTracked({
    before,
    updates: { deleted_at: new Date().toISOString() },
    actorName,
  })
}

export async function restorePhotoTracked(
  before: Photo,
  actorName: string | null,
): Promise<void> {
  return updatePhotoTracked({
    before,
    updates: { deleted_at: null },
    actorName,
  })
}
