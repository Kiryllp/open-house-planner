'use client'
import { Type, Square, Pentagon, X } from 'lucide-react'

interface DrawToolbarProps {
  mode: 'none' | 'text' | 'rectangle' | 'polygon'
  color: string
  fillOpacity: number
  onSetMode: (mode: 'none' | 'text' | 'rectangle' | 'polygon') => void
  onSetColor: (color: string) => void
  onSetFillOpacity: (opacity: number) => void
}

const PRESET_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280']

export function DrawToolbar({ mode, color, fillOpacity, onSetMode, onSetColor, onSetFillOpacity }: DrawToolbarProps) {
  if (mode === 'none') return null

  return (
    <div className="absolute top-3 left-3 bg-white rounded-xl shadow-xl border border-gray-200 p-2 z-30 flex items-center gap-2">
      {/* Tool buttons */}
      <button onClick={() => onSetMode('text')}
        className={`p-1.5 rounded-lg transition-colors ${mode === 'text' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-500'}`}
        title="Text label"
      >
        <Type className="w-4 h-4" />
      </button>
      <button onClick={() => onSetMode('rectangle')}
        className={`p-1.5 rounded-lg transition-colors ${mode === 'rectangle' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-500'}`}
        title="Rectangle"
      >
        <Square className="w-4 h-4" />
      </button>
      <button onClick={() => onSetMode('polygon')}
        className={`p-1.5 rounded-lg transition-colors ${mode === 'polygon' ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100 text-gray-500'}`}
        title="Polygon"
      >
        <Pentagon className="w-4 h-4" />
      </button>

      <div className="w-px h-6 bg-gray-200" />

      {/* Color picker */}
      <div className="flex gap-1">
        {PRESET_COLORS.map(c => (
          <button key={c} onClick={() => onSetColor(c)}
            className={`w-5 h-5 rounded-full border-2 transition-all ${color === c ? 'border-gray-800 scale-110' : 'border-transparent hover:border-gray-300'}`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Fill opacity */}
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-gray-400">Fill</span>
        <input type="range" min={0} max={100} value={Math.round(fillOpacity * 100)}
          onChange={(e) => onSetFillOpacity(parseInt(e.target.value) / 100)}
          className="w-16 h-1 accent-blue-500"
        />
        <span className="text-[10px] text-gray-500 w-6">{Math.round(fillOpacity * 100)}%</span>
      </div>

      <div className="w-px h-6 bg-gray-200" />

      {/* Cancel */}
      <button onClick={() => onSetMode('none')} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors" title="Cancel drawing">
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
