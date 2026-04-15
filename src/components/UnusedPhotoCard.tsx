'use client'
/* eslint-disable @next/next/no-img-element */

import { memo } from 'react'
import type { Photo } from '@/lib/types'
import { zoneRankLabel } from '@/lib/types'

interface Props {
  photo: Photo
  isDuplicate: boolean
  isSiblingHighlighted: boolean
  onDragStart: (e: React.DragEvent, photo: Photo) => void
  onDragEnd: (e: React.DragEvent) => void
  onClick: (photo: Photo) => void
  onDelete: (photo: Photo) => void
  onHoverSiblings: (sourceUploadId: string | null) => void
}

export const UnusedPhotoCard = memo(function UnusedPhotoCard({
  photo,
  isDuplicate,
  isSiblingHighlighted,
  onDragStart,
  onDragEnd,
  onClick,
  onDelete,
  onHoverSiblings,
}: Props) {
  const rankLabel = zoneRankLabel(photo.zone_rank)
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, photo)}
      onDragEnd={onDragEnd}
      onClick={() => onClick(photo)}
      onMouseEnter={() => onHoverSiblings(photo.source_upload_id)}
      onMouseLeave={() => onHoverSiblings(null)}
      className={`group relative aspect-[4/3] cursor-grab overflow-hidden rounded-md border bg-gray-50 transition active:cursor-grabbing ${
        isSiblingHighlighted
          ? 'border-blue-400 ring-2 ring-blue-200'
          : 'border-gray-200 hover:border-gray-300'
      }`}
      title={photo.notes ?? ''}
    >
      <img
        src={photo.file_url}
        alt=""
        draggable={false}
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Rank badge (Primary / Secondary / Tertiary) */}
      {rankLabel && (
        <span
          className={`absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
            photo.zone_rank === 1
              ? 'bg-blue-600 text-white'
              : 'bg-white/80 text-gray-700'
          }`}
        >
          {rankLabel}
        </span>
      )}

      {/* Duplicate dot — hidden when Primary badge is showing */}
      {isDuplicate && photo.zone_rank !== 1 && (
        <span
          className="absolute right-1 top-1 h-2 w-2 rounded-full bg-amber-400 shadow"
          title="This file is placed in multiple zones"
        />
      )}

      {/* Linked-real indicator */}
      {photo.linked_real_id && (
        <span className="absolute bottom-1 left-1 rounded bg-purple-600/90 px-1 py-px text-[9px] font-medium text-white">
          linked
        </span>
      )}

      {/* Delete button */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(photo)
        }}
        className="absolute right-1 bottom-1 hidden h-5 w-5 items-center justify-center rounded bg-white/90 text-gray-600 shadow hover:bg-red-500 hover:text-white group-hover:flex"
        title="Delete"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  )
})
