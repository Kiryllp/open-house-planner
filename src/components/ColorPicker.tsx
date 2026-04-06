'use client'
import { useState } from 'react'

interface ColorPickerProps {
  color: string | null
  onChange: (color: string | null) => void
  recentColors?: string[]
}

const PRESET_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280',
]

export function ColorPicker({ color, onChange, recentColors = [] }: ColorPickerProps) {
  const [showCustom, setShowCustom] = useState(false)

  // Merge recent + preset, deduplicate
  const allColors = [...new Set([...recentColors.filter(Boolean), ...PRESET_COLORS])]

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-1.5">
        {/* Default/no color option */}
        <button
          onClick={() => onChange(null)}
          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[10px] transition-all ${
            color === null ? 'border-gray-800 scale-110' : 'border-gray-300 hover:border-gray-400'
          }`}
          style={{ background: 'repeating-conic-gradient(#ddd 0% 25%, #fff 0% 50%) 50%/8px 8px' }}
          title="Default color"
        />
        {allColors.map(c => (
          <button key={c} onClick={() => onChange(c)}
            className={`w-6 h-6 rounded-full border-2 transition-all ${
              color === c ? 'border-gray-800 scale-110' : 'border-transparent hover:border-gray-300'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
      <button onClick={() => setShowCustom(!showCustom)} className="text-[10px] text-blue-600 hover:text-blue-800">
        {showCustom ? 'Hide custom' : 'Custom color...'}
      </button>
      {showCustom && (
        <input type="color" value={color || '#3b82f6'} onChange={(e) => onChange(e.target.value)}
          className="mt-1 w-full h-8 rounded cursor-pointer border border-gray-200"
        />
      )}
    </div>
  )
}
