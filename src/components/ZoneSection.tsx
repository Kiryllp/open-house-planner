'use client'

import type { Photo, ZoneId } from '@/lib/types'
import { UnusedPhotoCard } from './UnusedPhotoCard'

interface Props {
  zone: ZoneId
  photos: Photo[]
  highlightedSourceUploadId: string | null
  onHoverSiblings: (sourceUploadId: string | null) => void
  siblingCountByUploadId: Map<string, number>
  onDragStart: (e: React.DragEvent, photo: Photo) => void
  onDragEnd: (e: React.DragEvent) => void
  onCardClick: (photo: Photo) => void
  onCardDelete: (photo: Photo) => void
  onDropOnZone: (e: React.DragEvent, zone: ZoneId) => void
}

export function ZoneSection({
  zone,
  photos,
  highlightedSourceUploadId,
  onHoverSiblings,
  siblingCountByUploadId,
  onDragStart,
  onDragEnd,
  onCardClick,
  onCardDelete,
  onDropOnZone,
}: Props) {
  return (
    <div
      className="mb-4"
      onDragOver={(e) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
      }}
      onDrop={(e) => onDropOnZone(e, zone)}
    >
      <div className="mb-1.5 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
        <span>Zone {zone}</span>
        <span className="text-gray-400">{photos.length}</span>
      </div>
      {photos.length === 0 ? (
        <div className="mx-1 rounded border border-dashed border-gray-200 py-3 text-center text-[10px] text-gray-300">
          empty
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 px-1">
          {photos.map((p) => (
            <UnusedPhotoCard
              key={p.id}
              photo={p}
              isDuplicate={(p.source_upload_id && (siblingCountByUploadId.get(p.source_upload_id) ?? 0) > 1) || false}
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
      )}
    </div>
  )
}
