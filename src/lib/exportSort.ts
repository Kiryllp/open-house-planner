import type { Photo } from './types'

/**
 * Sort placed concept rows for the export pipeline.
 *
 * Ordering:
 *   1. Zone 1..6 in numeric order, Unzoned last.
 *   2. Within each zone: `zone_rank` ascending (nulls last, matching
 *      `LeftPane.tsx`), tie-broken by `created_at` ascending, then by
 *      `id` ascending for full determinism on bulk inserts.
 *
 * Pure: returns a new array; does not mutate the input. Deterministic
 * across reloads as long as the DB rows are the same.
 */
export function sortPlacedPhotosForExport(photos: Photo[]): Photo[] {
  return [...photos].sort(compare)
}

const UNZONED_BUCKET = 999
const NULL_RANK = 999

function compare(a: Photo, b: Photo): number {
  const za = a.zone ?? UNZONED_BUCKET
  const zb = b.zone ?? UNZONED_BUCKET
  if (za !== zb) return za - zb

  const ra = a.zone_rank ?? NULL_RANK
  const rb = b.zone_rank ?? NULL_RANK
  if (ra !== rb) return ra - rb

  const ca = a.created_at ?? ''
  const cb = b.created_at ?? ''
  if (ca !== cb) return ca.localeCompare(cb)

  return a.id.localeCompare(b.id)
}
