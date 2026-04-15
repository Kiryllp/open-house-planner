'use client'

import { useDeferredValue, useMemo } from 'react'
import type { Photo, ZoneId } from './types'
import {
  buildIndex,
  normalize,
  parseZonePrefix,
  zoneLabelFor,
  type FieldMatches,
  type MatchIndex,
  type SearchResult,
  type SearchableField,
} from './searchPhotos'
import type { FuseResult, FuseResultMatch } from 'fuse.js'

interface UsePhotoSearchOptions {
  query: string
  zone?: ZoneId | null
  type?: 'concept' | 'real' | 'both'
  strict?: boolean
}

interface UsePhotoSearchReturn {
  results: SearchResult[]
  isEmpty: boolean
  hasQuery: boolean
}

/**
 * Stable content signature for the Fuse index memo key. Includes only the
 * fields actually searched by `searchPhotos` — pin position, direction,
 * selection, etc. are deliberately excluded so that dragging a pin on the
 * map does NOT trigger an index rebuild.
 */
function buildContentSignature(photos: readonly Photo[]): string {
  const parts: string[] = [String(photos.length)]
  for (const p of photos) {
    parts.push(
      p.id,
      p.name ?? '',
      p.notes ?? '',
      (p.tags ?? []).join(','),
      p.zone == null ? '' : String(p.zone),
      p.zone_rank == null ? '' : String(p.zone_rank),
      p.created_by_name ?? '',
    )
  }
  return parts.join('|')
}

interface IndexedPhotoShape {
  _photo: Photo
}

const EMPTY_MATCHES: FieldMatches = Object.freeze({})

function toFieldMatches(
  matches: ReadonlyArray<FuseResultMatch> | undefined,
): FieldMatches {
  if (!matches || matches.length === 0) return EMPTY_MATCHES
  const out: FieldMatches = {}
  for (const m of matches) {
    const key = m.key as SearchableField | undefined
    if (!key) continue
    out[key] = m.indices.map((t) => [t[0], t[1]] as const) as readonly MatchIndex[]
  }
  return out
}

/**
 * React hook that wraps `searchPhotos` with:
 *   - Debounced query via React 19's `useDeferredValue`.
 *   - Memoized Fuse index keyed on a stable content signature so unrelated
 *     Photo mutations (pin drags, color changes) don't trigger rebuilds.
 *
 * Behavior mirrors `searchPhotos`: empty query → passthrough; zone prefix
 * in the query is extracted and applied as a pre-filter; `opts.zone` wins
 * over any parsed prefix.
 */
export function usePhotoSearch(
  source: readonly Photo[],
  opts: UsePhotoSearchOptions,
): UsePhotoSearchReturn {
  const { query, zone = null, type = 'both', strict = false } = opts
  const deferredQuery = useDeferredValue(query)

  const signature = useMemo(() => buildContentSignature(source), [source])

  // Build the index only when the content signature, the strict flag, or
  // the type pre-filter changes. Drags and other non-search mutations are
  // excluded from the signature and do not cause a rebuild.
  const { fuse, pool } = useMemo(() => {
    const typed: readonly Photo[] =
      type === 'both' ? source : source.filter((p) => p.type === type)
    return { fuse: buildIndex(typed, strict), pool: typed }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, strict, type])

  return useMemo(() => {
    const hasQuery = deferredQuery.trim().length > 0

    // Parse leading "zone:3" / "z3" prefix out of the query.
    const { zone: parsedZone, rest } = parseZonePrefix(deferredQuery)
    const effectiveZone: ZoneId | null = zone ?? parsedZone

    // Apply zone pre-filter to the pre-built pool.
    const zoneFiltered =
      effectiveZone == null
        ? pool
        : pool.filter((p) => p.zone === effectiveZone)

    if (!rest.trim()) {
      const results: SearchResult[] = zoneFiltered.map((photo) => ({
        photo,
        score: 0,
        matches: EMPTY_MATCHES,
      }))
      return { results, isEmpty: false, hasQuery }
    }

    // If the zone pre-filter changed the set, we need a fresh Fuse over
    // the reduced pool. When no zone filter is active we reuse the memoized
    // index, avoiding rebuilds on every keystroke.
    const searchFuse =
      effectiveZone == null ? fuse : buildIndex(zoneFiltered, strict)

    const normalized = normalize(rest)
    const raw = searchFuse.search(normalized) as FuseResult<IndexedPhotoShape>[]

    const results: SearchResult[] = raw.map((r) => ({
      photo: r.item._photo,
      score: r.score ?? 1,
      matches: toFieldMatches(r.matches),
    }))

    return {
      results,
      isEmpty: results.length === 0,
      hasQuery,
    }
  }, [deferredQuery, zone, fuse, pool, strict])
}

// Re-export types for consumer convenience.
export type { SearchResult, FieldMatches, MatchIndex } from './searchPhotos'
export { zoneLabelFor }
