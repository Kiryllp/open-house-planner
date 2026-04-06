'use client'

import { useState, useEffect, useRef } from 'react'
import { Trash2, X } from 'lucide-react'
import { ColorPicker } from './ColorPicker'

interface AnnotationEditorProps {
  annotation: {
    id: string
    label: string
    color: string
    fill_opacity: number
    type: string
  }
  position: { x: number; y: number } // screen coords (viewport)
  onUpdateLabel: (label: string) => void
  onUpdateColor: (color: string) => void
  onUpdateFillOpacity: (opacity: number) => void
  onDelete: () => void
  onClose: () => void
}

export function AnnotationEditor({
  annotation, position, onUpdateLabel, onUpdateColor, onUpdateFillOpacity, onDelete, onClose,
}: AnnotationEditorProps) {
  const [label, setLabel] = useState(annotation.label)
  const ref = useRef<HTMLDivElement>(null)

  // Sync label when annotation changes
  useEffect(() => {
    setLabel(annotation.label)
  }, [annotation.id, annotation.label])

  // Debounce label save
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function handleLabelChange(val: string) {
    setLabel(val)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => onUpdateLabel(val), 300)
  }

  // Clamp position to viewport
  const left = Math.min(position.x + 12, window.innerWidth - 280)
  const top = Math.min(position.y - 20, window.innerHeight - 320)

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[55]" onClick={onClose} />

      <div
        ref={ref}
        className="fixed bg-white rounded-xl shadow-2xl border border-gray-200 p-3 z-[56] w-64"
        style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            {annotation.type} annotation
          </span>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Label */}
        <div className="mb-3">
          <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Label</label>
          <input
            value={label}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Add label..."
            className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            autoFocus
          />
        </div>

        {/* Color */}
        <div className="mb-3">
          <label className="text-[10px] text-gray-400 font-medium mb-0.5 block">Color</label>
          <ColorPicker
            color={annotation.color}
            onChange={(c) => onUpdateColor(c || '#3b82f6')}
          />
        </div>

        {/* Fill opacity (not for text) */}
        {annotation.type !== 'text' && (
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-gray-400 font-medium">Fill Opacity</label>
              <span className="text-[10px] text-gray-500">{Math.round(annotation.fill_opacity * 100)}%</span>
            </div>
            <input
              type="range" min={0} max={100}
              value={Math.round(annotation.fill_opacity * 100)}
              onChange={(e) => onUpdateFillOpacity(parseInt(e.target.value) / 100)}
              className="w-full h-1.5 accent-blue-500"
            />
          </div>
        )}

        {/* Delete */}
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-red-200"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Annotation
        </button>
      </div>
    </>
  )
}
