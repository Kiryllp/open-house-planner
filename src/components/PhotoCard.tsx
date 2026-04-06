'use client'

import type { Photo } from '@/lib/types'
import { Eye, EyeOff, Check } from 'lucide-react'

interface PhotoCardProps {
  photo: Photo
  size: 'sm' | 'md'
  showVisibilityToggle?: boolean
  showCheckbox?: boolean
  isChecked?: boolean
  draggable?: boolean
  boardLabel?: string
  onClick?: () => void
  onToggleVisibility?: () => void
  onToggleSelect?: () => void
}

const TAG_COLORS: Record<string, string> = {
  favorite: 'bg-yellow-400',
  'needs-review': 'bg-orange-400',
  approved: 'bg-green-400',
  rejected: 'bg-red-400',
}

function getTagColor(tag: string): string {
  if (TAG_COLORS[tag]) return TAG_COLORS[tag]
  const colors = ['bg-sky-400', 'bg-teal-400', 'bg-pink-400', 'bg-indigo-400']
  return colors[tag.charCodeAt(0) % colors.length]
}

export function PhotoCard({
  photo, size, showVisibilityToggle, showCheckbox, isChecked,
  draggable, boardLabel, onClick, onToggleVisibility, onToggleSelect,
}: PhotoCardProps) {
  const dim = size === 'sm' ? 'w-16 h-16' : 'w-20 h-20'
  const typeColor = photo.type === 'real' ? 'bg-blue-500' : 'bg-purple-500'
  const isHidden = !photo.visible

  function handleDragStart(e: React.DragEvent) {
    e.dataTransfer.setData('text/photoId', photo.id)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className={`relative shrink-0 rounded-lg overflow-hidden cursor-pointer group border-2 transition-all ${
        isChecked ? 'border-blue-500 ring-1 ring-blue-300' : 'border-transparent hover:border-gray-300'
      } ${isHidden ? 'opacity-50' : ''} ${dim}`}
      onClick={onClick}
      draggable={draggable}
      onDragStart={draggable ? handleDragStart : undefined}
    >
      <img
        src={photo.file_url}
        alt=""
        className="w-full h-full object-cover"
        loading="lazy"
      />

      {/* Type dot */}
      <div className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full ${typeColor} border border-white`} />

      {/* Visibility toggle */}
      {showVisibilityToggle && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleVisibility?.() }}
          className="absolute top-1 left-1 w-5 h-5 bg-black/40 hover:bg-black/60 rounded flex items-center justify-center transition-colors"
        >
          {isHidden
            ? <EyeOff className="w-3 h-3 text-white/70" />
            : <Eye className="w-3 h-3 text-white" />
          }
        </button>
      )}

      {/* Checkbox */}
      {showCheckbox && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSelect?.() }}
          className={`absolute bottom-1 left-1 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
            isChecked ? 'bg-blue-500 border-blue-500' : 'bg-white/80 border-gray-400'
          }`}
        >
          {isChecked && <Check className="w-3 h-3 text-white" />}
        </button>
      )}

      {/* Board label */}
      {boardLabel && (
        <div className="absolute bottom-0 left-0 right-0 bg-black/50 px-1 py-0.5">
          <span className="text-[9px] text-white truncate block">{boardLabel}</span>
        </div>
      )}

      {/* Tags */}
      {photo.tags && photo.tags.length > 0 && (
        <div className="absolute bottom-1 right-1 flex gap-0.5">
          {photo.tags.slice(0, 3).map((tag, i) => (
            <div key={i} className={`w-1.5 h-1.5 rounded-full ${getTagColor(tag)}`} />
          ))}
        </div>
      )}
    </div>
  )
}
