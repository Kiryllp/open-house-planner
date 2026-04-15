'use client'

import { useMemo, useState } from 'react'
import type { Photo, ZoneId } from '@/lib/types'
import { ZONE_IDS } from '@/lib/types'
import type { FieldMatches } from '@/lib/searchPhotos'
import { usePhotoSearch } from '@/lib/usePhotoSearch'
import { ZoneSection } from './ZoneSection'
import { UnusedPhotoCard } from './UnusedPhotoCard'

interface Props {
  /** Concepts that have no pin on the map. Primary LeftPane source. */
  unusedConcepts: Photo[]
  /** Every active concept (placed or not). Source when Search-all is on. */
  searchableConcepts: Photo[]
  onDragStart: (e: React.DragEvent, photo: Photo) => void
  onDragEnd: (e: React.DragEvent) => void
  onCardClick: (photo: Photo) => void
  onCardDelete: (photo: Photo) => void
  onFilesDropped: (files: File[]) => void
  onDropOnZone: (e: React.DragEvent, zone: ZoneId) => void
  /** Called with a photo id when the user clicks a placed-pin search result. */
  onFocusPin?: (id: string) => void
}

export function LeftPane({
  unusedConcepts,
  searchableConcepts,
  onDragStart,
  onDragEnd,
  onCardClick,
  onCardDelete,
  onFilesDropped,
  onDropOnZone,
  onFocusPin,
}: Props) {
  const [query, setQuery] = useState('')
  const [primaryOnly, setPrimaryOnly] = useState(true)
  const [searchAll, setSearchAll] = useState(false)
  const [highlightedSourceUploadId, setHighlightedSourceUploadId] =
    useState<string | null>(null)
  const [paneDragging, setPaneDragging] = useState(false)

  // Source is either the unplaced concepts or every active concept,
  // depending on the toggle. The primaryOnly filter is orthogonal and
  // applies in both modes.
  const searchSource = useMemo(() => {
    const base = searchAll ? searchableConcepts : unusedConcepts
    if (primaryOnly) {
      return base.filter((p) => p.zone_rank === 1 || p.zone_rank == null)
    }
    return base
  }, [searchAll, searchableConcepts, unusedConcepts, primaryOnly])

  const { results, isEmpty, hasQuery } = usePhotoSearch(searchSource, {
    query,
    type: 'concept',
  })

  // Photos in display order (Fuse ordering when there's a query, source
  // order otherwise since passthrough preserves input order).
  const filtered = useMemo(() => results.map((r) => r.photo), [results])

  // Lookup table for match ranges so individual cards can highlight.
  const matchesById = useMemo(() => {
    const m = new Map<string, FieldMatches>()
    for (const r of results) m.set(r.photo.id, r.matches)
    return m
  }, [results])

  const siblingCountByUploadId = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of unusedConcepts) {
      if (!p.source_upload_id) continue
      map.set(p.source_upload_id, (map.get(p.source_upload_id) ?? 0) + 1)
    }
    return map
  }, [unusedConcepts])

  const byZone = useMemo(() => {
    const map: Record<ZoneId, Photo[]> = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] }
    for (const p of filtered) {
      if (p.zone && map[p.zone]) {
        map[p.zone].push(p)
      }
    }
    for (const zone of ZONE_IDS) {
      map[zone].sort((a, b) => {
        const ra = a.zone_rank ?? 999
        const rb = b.zone_rank ?? 999
        if (ra !== rb) return ra - rb
        return (a.created_at ?? '').localeCompare(b.created_at ?? '')
      })
    }
    return map
  }, [filtered])

  const noZone = useMemo(
    () =>
      filtered
        .filter((p) => p.zone == null)
        .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '')),
    [filtered],
  )

  const handlePaneDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault()
      setPaneDragging(true)
    }
  }

  const handlePaneDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setPaneDragging(false)
  }

  const handlePaneDrop = (e: React.DragEvent) => {
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/'),
      )
      if (files.length > 0) onFilesDropped(files)
    }
    setPaneDragging(false)
  }

  // Clicking a card routes to the map (when the photo is already placed)
  // or to the normal preview/open handler (when it's in the left pane).
  const handleCardClick = (photo: Photo) => {
    if (photo.pin_x != null && onFocusPin) {
      onFocusPin(photo.id)
      return
    }
    onCardClick(photo)
  }

  const totalUnused = unusedConcepts.length

  return (
    <aside
      onDragOver={handlePaneDragOver}
      onDragLeave={handlePaneDragLeave}
      onDrop={handlePaneDrop}
      className={`relative flex h-full w-80 shrink-0 flex-col border-r border-gray-200 bg-white ${
        paneDragging ? 'ring-2 ring-inset ring-blue-400' : ''
      }`}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-700">
          Unused Images
        </h2>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
          {totalUnused}
        </span>
      </div>
      <div className="px-4 pb-2">
        <div className="relative">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search images..."
            className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 pr-7 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none"
            title="Fuzzy search. Try &quot;zone 3&quot;, &quot;primary&quot;, or prefix with !word to exclude."
          />
          {query.length > 0 && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path
                  d="M1 1L9 9M9 1L1 9"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 px-4 pb-3">
        <button
          type="button"
          onClick={() => setPrimaryOnly((v) => !v)}
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
            primaryOnly
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          {primaryOnly ? 'Primary only' : 'All ranks'}
        </button>
        <button
          type="button"
          onClick={() => setSearchAll((v) => !v)}
          title="Also search concepts already placed on the map"
          className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition ${
            searchAll
              ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          Search all
        </button>
        {hasQuery && (
          <span className="text-[10px] text-gray-400">
            {filtered.length} match{filtered.length === 1 ? '' : 'es'}
          </span>
        )}
        {!hasQuery && primaryOnly && !searchAll && (
          <span className="text-[10px] text-gray-400">
            {filtered.length} of {unusedConcepts.length}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto pb-4">
        {noZone.length > 0 && (
          <NoZoneSection
            photos={noZone}
            highlightedSourceUploadId={highlightedSourceUploadId}
            onHoverSiblings={setHighlightedSourceUploadId}
            siblingCountByUploadId={siblingCountByUploadId}
            matchesById={matchesById}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardClick={handleCardClick}
            onCardDelete={onCardDelete}
          />
        )}
        {ZONE_IDS.map((zone) => (
          <ZoneSection
            key={zone}
            zone={zone}
            photos={byZone[zone]}
            highlightedSourceUploadId={highlightedSourceUploadId}
            onHoverSiblings={setHighlightedSourceUploadId}
            siblingCountByUploadId={siblingCountByUploadId}
            matchesById={matchesById}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardClick={handleCardClick}
            onCardDelete={onCardDelete}
            onDropOnZone={onDropOnZone}
          />
        ))}
        {totalUnused === 0 && !searchAll && (
          <div className="mx-4 mt-6 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
            <div className="text-xs font-medium text-gray-500">
              No unplaced photos
            </div>
            <div className="mt-1 text-[11px] text-gray-400">
              Drag image files here or click
              <br />
              <span className="font-medium text-gray-600">Upload Photos</span>{' '}
              in the top bar.
            </div>
          </div>
        )}
        {hasQuery && isEmpty && (
          <div className="mx-4 mt-6 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center">
            <div className="text-xs font-medium text-gray-600">
              No matches for &ldquo;{query}&rdquo;.
            </div>
            <div className="mt-1 text-[11px] leading-relaxed text-gray-500">
              Try fewer letters
              {primaryOnly && (
                <>
                  , or turn off{' '}
                  <button
                    type="button"
                    onClick={() => setPrimaryOnly(false)}
                    className="font-medium text-blue-600 hover:underline"
                  >
                    Primary only
                  </button>
                </>
              )}
              {!searchAll && (
                <>
                  , or enable{' '}
                  <button
                    type="button"
                    onClick={() => setSearchAll(true)}
                    className="font-medium text-emerald-600 hover:underline"
                  >
                    Search all
                  </button>{' '}
                  to look on the map too
                </>
              )}
              .
            </div>
          </div>
        )}
      </div>

      {paneDragging && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-blue-50/80 text-sm font-medium text-blue-700">
          Drop images to upload
        </div>
      )}
    </aside>
  )
}

interface NoZoneSectionProps {
  photos: Photo[]
  highlightedSourceUploadId: string | null
  onHoverSiblings: (sourceUploadId: string | null) => void
  siblingCountByUploadId: Map<string, number>
  matchesById?: Map<string, FieldMatches>
  onDragStart: (e: React.DragEvent, photo: Photo) => void
  onDragEnd: (e: React.DragEvent) => void
  onCardClick: (photo: Photo) => void
  onCardDelete: (photo: Photo) => void
}

function NoZoneSection({
  photos,
  highlightedSourceUploadId,
  onHoverSiblings,
  siblingCountByUploadId,
  matchesById,
  onDragStart,
  onDragEnd,
  onCardClick,
  onCardDelete,
}: NoZoneSectionProps) {
  return (
    <div className="mb-5 border-b border-amber-100 pb-4">
      <div className="sticky top-0 z-10 mb-2 flex items-center justify-between bg-white px-4 py-1">
        <div className="flex items-center gap-2">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
          <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
            Needs Zone
          </span>
        </div>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          {photos.length}
        </span>
      </div>
      <div className="mb-2 px-4 text-[10px] leading-snug text-gray-500">
        Drag a card into a zone below, or click it to assign one.
      </div>
      <div className="grid grid-cols-2 gap-2 px-4">
        {photos.map((p) => (
          <UnusedPhotoCard
            key={p.id}
            photo={p}
            isDuplicate={
              (p.source_upload_id &&
                (siblingCountByUploadId.get(p.source_upload_id) ?? 0) > 1) ||
              false
            }
            isSiblingHighlighted={
              highlightedSourceUploadId !== null &&
              p.source_upload_id === highlightedSourceUploadId
            }
            matches={matchesById?.get(p.id)}
            placed={p.pin_x != null}
            onHoverSiblings={onHoverSiblings}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onClick={onCardClick}
            onDelete={onCardDelete}
          />
        ))}
      </div>
    </div>
  )
}
