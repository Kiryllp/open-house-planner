'use client'

import { ChevronUp, ChevronDown } from 'lucide-react'

interface CarouselPanelProps {
  title: string
  count: number
  collapsed: boolean
  onToggle: () => void
  position: 'top' | 'bottom'
  children: React.ReactNode
  actionBar?: React.ReactNode
}

export function CarouselPanel({ title, count, collapsed, onToggle, position, children, actionBar }: CarouselPanelProps) {
  const borderClass = position === 'top' ? 'border-b' : 'border-t'
  const Chevron = collapsed ? (position === 'top' ? ChevronDown : ChevronUp) : (position === 'top' ? ChevronUp : ChevronDown)

  return (
    <div className={`shrink-0 bg-white ${borderClass} border-gray-200`}>
      {/* Header */}
      <button
        onClick={onToggle}
        className="w-full h-8 px-4 flex items-center justify-between text-xs font-semibold text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="uppercase tracking-wide">{title}</span>
          <span className="bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 text-[10px] font-bold">{count}</span>
        </div>
        <Chevron className="w-3.5 h-3.5 text-gray-400" />
      </button>

      {/* Content */}
      {!collapsed && (
        <div>
          {actionBar && (
            <div className="px-3 pb-1">{actionBar}</div>
          )}
          <div className="flex gap-2 px-3 pb-2 overflow-x-auto" style={{ scrollbarWidth: 'thin' }}>
            {children}
          </div>
        </div>
      )}
    </div>
  )
}
