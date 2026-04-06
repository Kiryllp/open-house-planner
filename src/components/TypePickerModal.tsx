'use client'

import { Camera, Lightbulb, X } from 'lucide-react'

interface TypePickerModalProps {
  position: { x: number; y: number }
  onPick: (type: 'real' | 'concept') => void
  onCancel: () => void
  remaining?: number
  onApplyAll?: (type: 'real' | 'concept') => void
}

export function TypePickerModal({ position, onPick, onCancel, remaining, onApplyAll }: TypePickerModalProps) {
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onCancel} />
      <div
        className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 p-3 z-[70] min-w-[200px]"
        style={{ left: Math.min(position.x, window.innerWidth - 220), top: Math.min(position.y + 12, window.innerHeight - 160) }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-700">What type of photo?</span>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
        </div>
        {remaining != null && remaining > 0 && (
          <div className="text-xs text-gray-400 mb-2">{remaining} more photo{remaining > 1 ? 's' : ''} to classify</div>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onPick('real')}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-sm font-medium transition-colors border border-blue-200"
          >
            <Camera className="w-4 h-4" />
            Real
          </button>
          <button
            onClick={() => onPick('concept')}
            className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg text-sm font-medium transition-colors border border-purple-200"
          >
            <Lightbulb className="w-4 h-4" />
            Concept
          </button>
        </div>
        {remaining != null && remaining > 0 && onApplyAll && (
          <div className="mt-2 pt-2 border-t border-gray-100 flex gap-2">
            <button onClick={() => onApplyAll('real')} className="flex-1 text-xs text-blue-600 hover:text-blue-800 py-1">All remaining Real</button>
            <button onClick={() => onApplyAll('concept')} className="flex-1 text-xs text-purple-600 hover:text-purple-800 py-1">All remaining Concept</button>
          </div>
        )}
      </div>
    </>
  )
}
