'use client'

import type { Photo } from '@/lib/types'

interface PhotoGalleryItemProps {
  photo: Photo
  assignedBoardLabel?: string
  onClick: () => void
}

export function PhotoGalleryItem({ photo, assignedBoardLabel, onClick }: PhotoGalleryItemProps) {
  const isAssignedElsewhere = !!assignedBoardLabel

  return (
    <button
      onClick={onClick}
      className={`group relative text-left rounded-lg overflow-hidden border transition-all ${
        isAssignedElsewhere
          ? 'border-gray-200 opacity-50 hover:opacity-75'
          : 'border-gray-200 hover:border-blue-400 hover:ring-2 hover:ring-blue-200'
      }`}
    >
      <img
        src={photo.file_url}
        alt=""
        className="w-full aspect-[4/3] object-cover"
        draggable={false}
      />

      {/* Type badge */}
      <span
        className={`absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full border border-white shadow-sm ${
          photo.type === 'real' ? 'bg-blue-500' : 'bg-purple-500'
        }`}
        title={photo.type}
      />

      {/* Assigned-to-another-board overlay */}
      {isAssignedElsewhere && (
        <div className="absolute inset-x-0 bottom-0 bg-gray-900/60 px-1.5 py-1">
          <span className="text-[10px] text-white font-medium truncate block">
            {assignedBoardLabel}
          </span>
        </div>
      )}
    </button>
  )
}
