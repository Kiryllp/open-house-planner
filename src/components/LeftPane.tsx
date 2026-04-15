'use client'

import { useMemo, useState } from 'react'
import type { Photo, ZoneId } from '@/lib/types'
import { ZONE_IDS } from '@/lib/types'
import { ZoneSection } from './ZoneSection'
import { UnusedPhotoCard } from './UnusedPhotoCard'

interface Props {
  unusedConcepts: Photo[]
  onDragStart: (e: React.DragEvent, photo: Photo) => void
  onDragEnd: (e: React.DragEvent) => void
  onCardClick: (photo: Photo) => void
  onCardDelete: (photo: Photo) => void
  onFilesDropped: (files: File[]) => void
  onDropOnZone: (e: React.DragEvent, zone: ZoneId) => void
}

export function LeftPane({
  unusedConcepts,
  onDragStart,
  onDragEnd,
  onCardClick,
  onCardDelete,
  onFilesDropped,
  onDropOnZone,
}: Props) {
  const [query, setQuery] = useState('')
  const [primaryOnly, setPrimaryOnly] = useState(false)
  const [highlightedSourceUploadId, setHighlightedSourceUploadId] =
    useState<string | null>(null)
  const [paneDragging, setPaneDragging] = useState(false)

  const filtered = useMemo(() => {
    let result = unusedConcepts
    if (primaryOnly) {
      result = result.filter((p) => p.zone_rank === 1 || p.zone_rank == null)
    }
    if (query.trim()) {
      const q = query.toLowerCase()
      result = result.filter(
        (p) =>
          p.name?.toLowerCase().includes(q) ||
          p.notes?.toLowerCase().includes(q) ||
          p.file_url.toLowerCase().includes(q),
      )
    }
    return result
  }, [unusedConcepts, query, primaryOnly])

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
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search images..."
          className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none"
        />
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
        {primaryOnly && (
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
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardClick={onCardClick}
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
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCardClick={onCardClick}
            onCardDelete={onCardDelete}
            onDropOnZone={onDropOnZone}
          />
        ))}
        {totalUnused === 0 && (
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
