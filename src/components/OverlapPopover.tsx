'use client'

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
        className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 py-1.5 z-50 min-w-[180px]"
        style={{ left: Math.min(position.x, window.innerWidth - 200), top: Math.min(position.y + 8, window.innerHeight - 200) }}
      >
        <div className="px-3 py-1.5 text-xs text-gray-500 font-semibold border-b border-gray-100 mb-1">Multiple pins here</div>
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => { onSelect(item.id, item.kind); onClose() }}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2.5 text-gray-700 transition-colors"
          >
            {item.kind === 'photo' && item.type === 'real' && <div className="w-3 h-3 rounded-full bg-blue-500" />}
            {item.kind === 'photo' && item.type === 'concept' && <div className="w-3 h-3 rounded-full bg-purple-500" />}
            {item.kind === 'board' && <LayoutGrid className="w-3.5 h-3.5 text-gray-500" />}
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}
