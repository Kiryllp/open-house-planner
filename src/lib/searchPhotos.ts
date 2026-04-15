import Fuse from 'fuse.js'
import type { IFuseOptions, FuseResult, FuseResultMatch } from 'fuse.js'
import type { Photo, ZoneId } from './types'
import { zoneRankLabel } from './types'

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export type MatchIndex = readonly [number, number]

export type SearchableField =
  | 'name'
  | 'notes'
  | 'zoneLabel'
  | 'tags'
  | 'created_by_name'

export type FieldMatches = {
  [K in SearchableField]?: readonly MatchIndex[]
}

export interface SearchResult {
  photo: Photo
  score: number
  matches: FieldMatches
}

export interface SearchOptions {
  query: string
  zone?: ZoneId | null
  type?: 'concept' | 'real' | 'both'
  strict?: boolean
}

// -----------------------------------------------------------------------------
// Normalization
// -----------------------------------------------------------------------------

/** Lowercase, strip diacritics, fold `_`/`-`/`.` to spaces, collapse and trim. */
export function normalize(input: string | null | undefined): string {
  if (!input) return ''
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Human-friendly zone label for a photo, e.g. "Zone 3 Primary". */
export function zoneLabelFor(photo: Photo): string {
  if (photo.zone == null) return ''
  const rank = zoneRankLabel(photo.zone_rank)
  return rank ? `Zone ${photo.zone} ${rank}` : `Zone ${photo.zone}`
}

// -----------------------------------------------------------------------------
// Query-prefix parsing ("z:3", "zone 3", "z3", etc.)
// -----------------------------------------------------------------------------

const ZONE_IDS_SET: ReadonlySet<number> = new Set([1, 2, 3, 4, 5, 6])

/**
 * Extracts a leading zone pre-filter from the query if present. Handles:
 *   - "z:3 kitchen"    → { zone: 3, rest: "kitchen" }
 *   - "zone:3 kitchen" → { zone: 3, rest: "kitchen" }
 *   - "z3 kitchen"     → { zone: 3, rest: "kitchen" }
 *   - "zone3 kitchen"  → { zone: 3, rest: "kitchen" }
 *   - "zone 3 kitchen" → { zone: 3, rest: "kitchen" }
 * Non-matching queries pass through unchanged.
 */
export function parseZonePrefix(query: string): {
  zone: ZoneId | null
  rest: string
} {
  const trimmed = query.trim()
  if (!trimmed) return { zone: null, rest: '' }

  const patterns: RegExp[] = [
    /^zone\s*:\s*(\d)\b\s*/i,
    /^z\s*:\s*(\d)\b\s*/i,
    /^zone\s+(\d)\b\s*/i,
    /^zone(\d)\b\s*/i,
    /^z(\d)\b\s*/i,
  ]

  for (const re of patterns) {
    const m = trimmed.match(re)
    if (m) {
      const n = Number(m[1])
      if (ZONE_IDS_SET.has(n)) {
        return { zone: n as ZoneId, rest: trimmed.slice(m[0].length).trim() }
      }
    }
  }

  return { zone: null, rest: trimmed }
}

// -----------------------------------------------------------------------------
// Fuse index build
// -----------------------------------------------------------------------------

/**
 * Flat record used by Fuse — every searchable field is pre-normalized so the
 * matcher doesn't have to do it on every keystroke. We keep a parallel
 * `_photo` reference so we can map Fuse results back to the real object.
 */
interface IndexedPhoto {
  id: string
  name: string
  notes: string
  zoneLabel: string
  tags: string
  created_by_name: string
  _photo: Photo
}

function toIndexed(photo: Photo): IndexedPhoto {
  return {
    id: photo.id,
    name: normalize(photo.name),
    notes: normalize(photo.notes),
    zoneLabel: normalize(zoneLabelFor(photo)),
    tags: normalize((photo.tags ?? []).join(' ')),
    created_by_name: normalize(photo.created_by_name),
    _photo: photo,
  }
}

const FUSE_KEYS: IFuseOptions<IndexedPhoto>['keys'] = [
  { name: 'name', weight: 3 },
  { name: 'notes', weight: 2 },
  { name: 'zoneLabel', weight: 1 },
  { name: 'tags', weight: 1 },
  { name: 'created_by_name', weight: 0.5 },
]

function fuseOptions(strict: boolean): IFuseOptions<IndexedPhoto> {
  return {
    keys: FUSE_KEYS,
    threshold: strict ? 0.25 : 0.4,
    ignoreLocation: true,
    minMatchCharLength: 2,
    includeMatches: true,
    includeScore: true,
    useExtendedSearch: true,
    shouldSort: true,
  }
}

export function buildIndex(
  photos: readonly Photo[],
  strict = false,
): Fuse<IndexedPhoto> {
  const docs = photos.map(toIndexed)
  return new Fuse(docs, fuseOptions(strict))
}

// -----------------------------------------------------------------------------
// Result mapping
// -----------------------------------------------------------------------------

const EMPTY_MATCHES: FieldMatches = Object.freeze({})

function toFieldMatches(
  matches: ReadonlyArray<FuseResultMatch> | undefined,
): FieldMatches {
  if (!matches || matches.length === 0) return EMPTY_MATCHES
  const out: FieldMatches = {}
  for (const m of matches) {
    const key = m.key as SearchableField | undefined
    if (!key) continue
    // indices is ReadonlyArray<[number, number]>
    out[key] = m.indices.map((t) => [t[0], t[1]] as const) as readonly MatchIndex[]
  }
  return out
}

function passthroughResults(photos: readonly Photo[]): SearchResult[] {
  return photos.map((photo) => ({
    photo,
    score: 0,
    matches: EMPTY_MATCHES,
  }))
}

// -----------------------------------------------------------------------------
// Public entry point
// -----------------------------------------------------------------------------

/**
 * Pure fuzzy search across a list of photos. Stateless — callers typically
 * wrap this in `usePhotoSearch` which memoizes the Fuse index.
 *
 * Behavior:
 *   - Empty query → every photo passes through with score 0 and no matches.
 *   - Query with zone prefix (e.g. "z3 kitchen") → extracts zone as pre-filter.
 *   - `options.zone` is an explicit pre-filter and takes precedence over any
 *     zone parsed out of the query.
 *   - Results are already scored/sorted by Fuse; callers may re-sort.
 */
export function searchPhotos(
  photos: readonly Photo[],
  options: SearchOptions,
): SearchResult[] {
  const { query, zone = null, type = 'both', strict = false } = options

  // Step 1: pre-filter by type.
  let pool: readonly Photo[] =
    type === 'both' ? photos : photos.filter((p) => p.type === type)

  // Step 2: parse any leading zone prefix out of the query.
  const { zone: parsedZone, rest } = parseZonePrefix(query)
  const effectiveZone: ZoneId | null = zone ?? parsedZone

  // Step 3: pre-filter by zone.
  if (effectiveZone != null) {
    pool = pool.filter((p) => p.zone === effectiveZone)
  }

  // Step 4: if the remaining query is empty (no text or only a zone prefix),
  // return everything that survived the pre-filter.
  if (!rest.trim()) {
    return passthroughResults(pool)
  }

  // Step 5: build index and search.
  const fuse = buildIndex(pool, strict)
  const normalized = normalize(rest)
  const results: FuseResult<IndexedPhoto>[] = fuse.search(normalized)

  return results.map((r) => ({
    photo: r.item._photo,
    score: r.score ?? 1,
    matches: toFieldMatches(r.matches),
  }))
}
