'use client'
/* eslint-disable @next/next/no-img-element */

import type { Photo } from '@/lib/types'

interface Props {
  visiblePhotos: Photo[]
  selectedId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

export function VisiblePhotosBar({ visiblePhotos, selectedId, onSelect, onRemove }: Props) {
  return (
    <div className="flex h-28 shrink-0 flex-col border-t border-gray-200 bg-white">
      <div className="flex items-center justify-between px-3 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-700">
        <span>Visible Photos</span>
        <span className="text-gray-400">{visiblePhotos.length}</span>
      </div>
      <div className="flex flex-1 items-center gap-1.5 overflow-x-auto px-3 pb-2">
        {visiblePhotos.length === 0 ? (
          <div className="text-xs text-gray-300">
            Drag images from the left pane onto the map.
          </div>
        ) : (
          visiblePhotos.map((photo) => (
            <div
              key={photo.id}
              onClick={() => onSelect(photo.id)}
              className={`relative h-16 w-20 shrink-0 cursor-pointer overflow-hidden rounded border-2 bg-gray-50 ${
                photo.id === selectedId
                  ? ''
                  : 'hover:opacity-80'
              }`}
              style={{
                borderColor: photo.id === selectedId
                  ? (photo.color || '#a855f7')
                  : (photo.color ? photo.color + '80' : 'transparent'),
              }}
            >
              <img
                src={photo.file_url}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onRemove(photo.id)
                }}
                className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow hover:bg-red-500 hover:text-white"
                title="Remove from map"
              >
                <svg width="8" height="8" viewBox="0 0 10 10">
                  <path
                    d="M1 1L9 9M9 1L1 9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
