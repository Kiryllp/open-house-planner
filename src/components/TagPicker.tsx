'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'

interface TagPickerProps {
  tags: string[]
  onChange: (tags: string[]) => void
}

const PRESET_TAGS = [
  { name: 'favorite', color: 'bg-yellow-100 text-yellow-700 border-yellow-300' },
  { name: 'needs-review', color: 'bg-orange-100 text-orange-700 border-orange-300' },
  { name: 'approved', color: 'bg-green-100 text-green-700 border-green-300' },
  { name: 'rejected', color: 'bg-red-100 text-red-700 border-red-300' },
]

const TAG_PILL_COLORS: Record<string, string> = {
  favorite: 'bg-yellow-100 text-yellow-700',
  'needs-review': 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

function getTagPillClass(tag: string): string {
  return TAG_PILL_COLORS[tag] || 'bg-gray-100 text-gray-600'
}

export function TagPicker({ tags, onChange }: TagPickerProps) {
  const [input, setInput] = useState('')
  const [showPresets, setShowPresets] = useState(false)

  function addTag(tag: string) {
    const t = tag.trim().toLowerCase()
    if (t && !tags.includes(t)) {
      onChange([...tags, t])
    }
    setInput('')
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag))
  }

  return (
    <div>
      {/* Current tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {tags.map((tag) => (
            <span key={tag} className={`inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full ${getTagPillClass(tag)}`}>
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:opacity-70">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Add tags */}
      <div className="flex gap-1">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(input) } }}
          placeholder="Add tag..."
          className="flex-1 border border-gray-200 rounded-md px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
        />
        <button
          onClick={() => setShowPresets(!showPresets)}
          className="px-1.5 py-1 border border-gray-200 rounded-md hover:bg-gray-50 transition-colors"
        >
          <Plus className="w-3 h-3 text-gray-500" />
        </button>
      </div>

      {/* Presets dropdown */}
      {showPresets && (
        <div className="flex flex-wrap gap-1 mt-1.5">
          {PRESET_TAGS.filter((p) => !tags.includes(p.name)).map((preset) => (
            <button
              key={preset.name}
              onClick={() => { addTag(preset.name); setShowPresets(false) }}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${preset.color} hover:opacity-80 transition-opacity`}
            >
              {preset.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
