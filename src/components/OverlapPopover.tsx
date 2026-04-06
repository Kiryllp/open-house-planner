'use client'

import type { Photo, Board } from '@/lib/types'
import { Camera, Lightbulb, LayoutGrid } from 'lucide-react'

interface OverlapItem {
  id: string
  kind: 'photo' | 'board'
  label: string
  type?: 'real' | 'concept'
}

interface OverlapPopoverProps {
  items: OverlapItem[]
  position: { x: number; y: number }
  onSelect: (id: string, kind: 'photo' | 'board') => void
  onClose: () => void
}

export function OverlapPopover({ items, position, onSelect, onClose }: OverlapPopoverProps) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="absolute bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 min-w-[160px]"
        style={{ left: position.x, top: position.y }}
      >
        <div className="px-3 py-1 text-xs text-gray-400 font-medium">Select pin</div>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => { onSelect(item.id, item.kind); onClose() }}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-700"
          >
            {item.kind === 'photo' && item.type === 'real' && <Camera className="w-3.5 h-3.5 text-blue-500" />}
            {item.kind === 'photo' && item.type === 'concept' && <Lightbulb className="w-3.5 h-3.5 text-purple-500" />}
            {item.kind === 'board' && <LayoutGrid className="w-3.5 h-3.5 text-gray-600" />}
            {item.label}
          </button>
        ))}
      </div>
    </>
  )
}
