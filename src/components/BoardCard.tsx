'use client'

import { useState } from 'react'
import type { Board, Photo } from '@/lib/types'
import { LayoutGrid } from 'lucide-react'

interface BoardCardProps {
  board: Board
  assignedPhotos: Photo[]
  selected?: boolean
  onSelect?: () => void
  onDropPhoto?: (photoId: string) => void
}

export function BoardCard({ board, assignedPhotos, selected, onSelect, onDropPhoto }: BoardCardProps) {
  const [dragOver, setDragOver] = useState(false)

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const photoId = e.dataTransfer.getData('text/photoId')
    if (photoId && onDropPhoto) {
      onDropPhoto(photoId)
    }
  }

  return (
    <div
      className={`shrink-0 w-40 rounded-lg border-2 p-2 cursor-pointer transition-all ${
        dragOver ? 'border-blue-400 bg-blue-50 ring-2 ring-blue-200' :
        selected ? 'border-gray-400 bg-gray-50' :
        'border-gray-200 bg-white hover:border-gray-300'
      }`}
      onClick={onSelect}
      onDragOver={handleDragOver}
      onDragEnter={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <LayoutGrid className="w-3 h-3 text-gray-400" />
        <span className="text-xs font-semibold text-gray-700 truncate flex-1">{board.label}</span>
        <span className="text-[10px] font-bold text-white bg-blue-500 rounded-full w-4 h-4 flex items-center justify-center shrink-0">
          {assignedPhotos.length}
        </span>
      </div>
      {/* Mini photo strip */}
      <div className="flex gap-1">
        {assignedPhotos.slice(0, 4).map((p) => (
          <img
            key={p.id}
            src={p.file_url}
            alt=""
            className="w-7 h-7 rounded object-cover border border-gray-200"
            loading="lazy"
          />
        ))}
        {assignedPhotos.length === 0 && (
          <span className="text-[10px] text-gray-400 italic">Drop photos here</span>
        )}
      </div>
    </div>
  )
}
