'use client'

import { useApp } from '@/lib/store'
import { Eye, EyeOff, Plus, Download, User, Camera, Lightbulb, LayoutGrid, Trash2 } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface TopBarProps {
  userName: string
  onChangeName: (name: string) => void
  onAddBoard: () => void
  onExportJSON: () => void
  onExportMapPDF: () => void
  onExportBoardPDF: () => void
  onEmptyTrash: () => void
}

export function TopBar({ userName, onChangeName, onAddBoard, onExportJSON, onExportMapPDF, onExportBoardPDF, onEmptyTrash }: TopBarProps) {
  const { filters, toggleFilter } = useApp()
  const [showExport, setShowExport] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(userName)
  const exportRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setShowExport(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function handleNameSubmit() {
    const trimmed = nameValue.trim()
    if (trimmed) {
      localStorage.setItem('userName', trimmed)
      onChangeName(trimmed)
    }
    setEditingName(false)
  }

  const filterButtons = [
    { key: 'showReal' as const, label: 'Real', icon: Camera, color: 'text-blue-500' },
    { key: 'showConcept' as const, label: 'Concept', icon: Lightbulb, color: 'text-purple-500' },
    { key: 'showBoards' as const, label: 'Boards', icon: LayoutGrid, color: 'text-gray-600' },
    { key: 'showTrash' as const, label: 'Trash', icon: Trash2, color: 'text-red-500' },
  ]

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0 z-20">
      <h1 className="font-semibold text-gray-900 mr-2">Open House Planner</h1>

      <div className="h-6 w-px bg-gray-200" />

      {/* User name */}
      {editingName ? (
        <form onSubmit={(e) => { e.preventDefault(); handleNameSubmit() }} className="flex items-center gap-1">
          <input
            value={nameValue}
            onChange={(e) => setNameValue(e.target.value)}
            className="px-2 py-0.5 border rounded text-sm w-28 text-gray-900"
            autoFocus
            onBlur={handleNameSubmit}
          />
        </form>
      ) : (
        <button
          onClick={() => { setEditingName(true); setNameValue(userName) }}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <User className="w-4 h-4" />
          {userName}
        </button>
      )}

      <div className="h-6 w-px bg-gray-200" />

      {/* Filters */}
      {filterButtons.map(({ key, label, icon: Icon, color }) => (
        <button
          key={key}
          onClick={() => toggleFilter(key)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            filters[key] ? `${color} bg-gray-100` : 'text-gray-400 hover:text-gray-600'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
          {!filters[key] && <EyeOff className="w-3 h-3" />}
        </button>
      ))}

      {filters.showTrash && (
        <button
          onClick={onEmptyTrash}
          className="text-xs text-red-600 hover:text-red-800 font-medium"
        >
          Empty Trash
        </button>
      )}

      <div className="flex-1" />

      {/* Add Board */}
      <button
        onClick={onAddBoard}
        className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 text-white rounded text-xs font-medium hover:bg-gray-800 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Board
      </button>

      {/* Export menu */}
      <div className="relative" ref={exportRef}>
        <button
          onClick={() => setShowExport(!showExport)}
          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded text-xs font-medium hover:bg-gray-50 transition-colors text-gray-700"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        {showExport && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-48 z-50">
            <button onClick={() => { onExportMapPDF(); setShowExport(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700">Map PDF</button>
            <button onClick={() => { onExportBoardPDF(); setShowExport(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700">Board Packets PDF</button>
            <button onClick={() => { onExportJSON(); setShowExport(false) }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-700">JSON Backup</button>
          </div>
        )}
      </div>

      {/* Drop hint */}
      <span className="text-xs text-gray-400 hidden lg:block">Drop images to upload</span>
    </div>
  )
}
