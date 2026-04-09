'use client'
/* eslint-disable @next/next/no-img-element */

import { memo, useMemo, useState } from 'react'
import { Loader2, MapPin, RefreshCw, Trash2 } from 'lucide-react'
import type { Photo } from '@/lib/types'

interface PhotoGalleryItemProps {
  photo: Photo
  assignedBoardLabel?: string
  onClick: () => void
  onDelete: () => void
  onToggleType: () => void
  onPlaceOnMap?: () => void
  loading?: boolean
}

export const PhotoGalleryItem = memo(function PhotoGalleryItem({
  photo,
  assignedBoardLabel,
  onClick,
  onDelete,
  onToggleType,
  onPlaceOnMap,
  loading = false,
}: PhotoGalleryItemProps) {
  const isAssignedElsewhere = !!assignedBoardLabel
  const [imageBroken, setImageBroken] = useState(false)
  const [dimensions, setDimensions] = useState<string | null>(null)
  const fileName = useMemo(() => {
    try {
      return decodeURIComponent(new URL(photo.file_url).pathname.split('/').pop() || 'Photo')
    } catch {
      return 'Photo'
    }
  }, [photo.file_url])
  const uploadedAt = useMemo(() => new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(photo.created_at)), [photo.created_at])

  return (
    <div className="relative group">
      <button
        onClick={onClick}
        aria-label={`${isAssignedElsewhere ? `Reassign from ${assignedBoardLabel}` : 'Assign'} ${photo.type} photo`}
        disabled={loading}
        className={`w-full text-left rounded-lg overflow-hidden border transition-all ${
          isAssignedElsewhere
            ? 'border-gray-200 opacity-65 hover:opacity-80'
            : 'border-gray-200 hover:border-blue-400 hover:ring-2 hover:ring-blue-200'
        } ${loading ? 'cursor-wait' : ''} focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1`}
      >
        {imageBroken ? (
          <div className="flex aspect-[4/3] items-center justify-center bg-gray-100 px-3 text-center text-[11px] font-medium text-gray-500">
            Preview unavailable
          </div>
        ) : (
          <img
            src={photo.file_url}
            alt={`${photo.type} photo`}
            className="w-full aspect-[4/3] object-cover"
            draggable={false}
            loading="lazy"
            onError={() => setImageBroken(true)}
            onLoad={(e) => {
              const target = e.currentTarget
              setDimensions(`${target.naturalWidth}\u00d7${target.naturalHeight}`)
            }}
          />
        )}

        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100" />

        {/* Type badge */}
        <span
          className={`absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm ${
            photo.type === 'real' ? 'bg-blue-500' : 'bg-purple-500'
          }`}
        >
          {photo.type === 'real' ? 'Real' : 'Concept'}
        </span>

        {/* Metadata */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 px-2 pb-2 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <div className="rounded-md bg-black/55 p-2 text-[10px] text-white backdrop-blur">
            <div className="truncate font-semibold">{fileName}</div>
            <div className="mt-1 flex items-center justify-between gap-2 text-white/80">
              <span className="truncate">{photo.created_by_name || 'Unknown uploader'}</span>
              <span>{uploadedAt}</span>
            </div>
            {dimensions && <div className="mt-1 text-white/75">{dimensions}</div>}
          </div>
        </div>

        {isAssignedElsewhere && (
          <div className="absolute inset-x-0 bottom-0 bg-gray-900/60 px-1.5 py-1">
            <span className="text-[10px] text-white font-medium truncate block">
              {assignedBoardLabel}
            </span>
          </div>
        )}

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70">
            <Loader2 className="h-5 w-5 animate-spin text-blue-600" />
          </div>
        )}
      </button>

      {/* Hover action buttons */}
      <div className="absolute top-1 left-1 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
        <button
          onClick={(e) => { e.stopPropagation(); onToggleType() }}
          disabled={loading}
          className="h-5 w-5 rounded bg-white/90 shadow-sm flex items-center justify-center hover:bg-white transition-colors disabled:cursor-wait"
          title={`Switch to ${photo.type === 'real' ? 'concept' : 'real'}`}
        >
          <RefreshCw className="w-3 h-3 text-gray-600" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete() }}
          disabled={loading}
          className="h-5 w-5 rounded bg-white/90 shadow-sm flex items-center justify-center hover:bg-red-50 transition-colors disabled:cursor-wait"
          title="Delete photo"
        >
          <Trash2 className="w-3 h-3 text-red-500" />
        </button>
        {onPlaceOnMap && photo.pin_x == null && (
          <button
            onClick={(e) => { e.stopPropagation(); onPlaceOnMap() }}
            disabled={loading}
            className="h-5 w-5 rounded bg-white/90 shadow-sm flex items-center justify-center hover:bg-blue-50 transition-colors disabled:cursor-wait"
            title="Place on map"
          >
            <MapPin className="w-3 h-3 text-blue-600" />
          </button>
        )}
      </div>
    </div>
  )
}, (prev, next) =>
  prev.photo === next.photo &&
  prev.assignedBoardLabel === next.assignedBoardLabel &&
  prev.loading === next.loading
)
