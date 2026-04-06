'use client'

import { Camera, Lightbulb } from 'lucide-react'

interface TypePickerModalProps {
  position: { x: number; y: number }
  onPick: (type: 'real' | 'concept') => void
}

export function TypePickerModal({ position, onPick }: TypePickerModalProps) {
  return (
    <div
      className="absolute bg-white rounded-lg shadow-xl border border-gray-200 p-2 z-50"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, 8px)' }}
    >
      <div className="text-xs text-gray-500 mb-1.5 px-1">Photo type:</div>
      <div className="flex gap-1">
        <button
          onClick={() => onPick('real')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded text-sm font-medium transition-colors"
        >
          <Camera className="w-4 h-4" />
          Real
        </button>
        <button
          onClick={() => onPick('concept')}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded text-sm font-medium transition-colors"
        >
          <Lightbulb className="w-4 h-4" />
          Concept
        </button>
      </div>
    </div>
  )
}
