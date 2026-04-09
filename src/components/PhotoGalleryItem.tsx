'use client'

import { useState } from 'react'
import { Trash2, RefreshCw } from 'lucide-react'
import type { Photo } from '@/lib/types'

interface PhotoGalleryItemProps {
  photo: Photo
  assignedBoardLabel?: string
  onClick: () => void
  onDelete: () => void
  onToggleType: () => void
}

export function PhotoGalleryItem({ photo, assignedBoardLabel, onClick, onDelete, onToggleType }: PhotoGalleryItemProps) {
  const isAssignedElsewhere = !!assignedBoardLabel
  const [showActions, setShowActions] = useState(false)

  return (
    <div
      className="relative group"
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <button
        onClick={onClick}
        aria-label={`${isAssignedElsewhere ? `Reassign from ${assignedBoardLabel}` : 'Assign'} ${photo.type} photo`}
        className={`w-full text-left rounded-lg overflow-hidden border transition-all ${
          isAssignedElsewhere
            ? 'border-gray-200 opacity-50 hover:opacity-75'
            : 'border-gray-200 hover:border-blue-400 hover:ring-2 hover:ring-blue-200'
        } focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1`}
      >
        <img
          src={photo.file_url}
          alt={`${photo.type} photo`}
          className="w-full aspect-[4/3] object-cover"
          draggable={false}
          loading="lazy"
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

      {/* Hover action buttons */}
      {showActions && (
        <div className="absolute top-1 left-1 flex gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onToggleType() }}
            className="w-5 h-5 bg-white/90 rounded shadow-sm flex items-center justify-center hover:bg-white transition-colors"
            title={`Switch to ${photo.type === 'real' ? 'concept' : 'real'}`}
          >
            <RefreshCw className="w-3 h-3 text-gray-600" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete() }}
            className="w-5 h-5 bg-white/90 rounded shadow-sm flex items-center justify-center hover:bg-red-50 transition-colors"
            title="Delete photo"
          >
            <Trash2 className="w-3 h-3 text-red-500" />
          </button>
        </div>
      )}
    </div>
  )
}
