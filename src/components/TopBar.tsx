'use client'

import { useApp } from '@/lib/store'
import { EyeOff, Plus, Download, User, Camera, Lightbulb, LayoutGrid, Trash2, ImagePlus, Map, FileStack, Database } from 'lucide-react'
import { useState, useRef, useEffect } from 'react'

interface TopBarProps {
  userName: string
  onChangeName: (name: string) => void
  onAddBoard: () => void
  onUploadPhotos: (files: FileList) => void
  onExportJSON: () => void
  onExportMapPDF: () => void
  onExportBoardPDF: () => void
  onEmptyTrash: () => void
  photoCounts: { real: number; concept: number }
  boardCount: number
  trashCount: number
}

export function TopBar({
  userName, onChangeName, onAddBoard, onUploadPhotos,
  onExportJSON, onExportMapPDF, onExportBoardPDF, onEmptyTrash,
  photoCounts, boardCount, trashCount,
}: TopBarProps) {
  const { filters, toggleFilter } = useApp()
  const [showExport, setShowExport] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(userName)
  const exportRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onUploadPhotos(e.target.files)
      e.target.value = ''
    }
  }

  const filterButtons = [
    { key: 'showReal' as const, label: 'Real', count: photoCounts.real, icon: Camera, activeClass: 'bg-blue-100 text-blue-700 border-blue-200' },
    { key: 'showConcept' as const, label: 'Concept', count: photoCounts.concept, icon: Lightbulb, activeClass: 'bg-purple-100 text-purple-700 border-purple-200' },
    { key: 'showBoards' as const, label: 'Boards', count: boardCount, icon: LayoutGrid, activeClass: 'bg-gray-200 text-gray-700 border-gray-300' },
    { key: 'showTrash' as const, label: 'Trash', count: trashCount, icon: Trash2, activeClass: 'bg-red-50 text-red-600 border-red-200' },
  ]

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-2 shrink-0 z-20">
      <h1 className="font-semibold text-gray-900 text-sm mr-1">Open House Planner</h1>

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
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 transition-colors"
        >
          <User className="w-3.5 h-3.5" />
          <span className="max-w-[80px] truncate">{userName}</span>
        </button>
      )}

      <div className="h-6 w-px bg-gray-200" />

      {/* Filters */}
      {filterButtons.map(({ key, label, count, icon: Icon, activeClass }) => (
        <button
          key={key}
          onClick={() => toggleFilter(key)}
          className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-all border ${
            filters[key]
              ? activeClass
              : 'text-gray-400 bg-transparent border-transparent hover:text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
          {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
          {!filters[key] && <EyeOff className="w-2.5 h-2.5 opacity-50" />}
        </button>
      ))}

      {filters.showTrash && trashCount > 0 && (
        <button
          onClick={onEmptyTrash}
          className="text-xs text-red-600 hover:text-red-800 font-medium ml-1"
        >
          Empty Trash ({trashCount})
        </button>
      )}

      <div className="flex-1" />

      {/* Upload Photos */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-medium hover:bg-blue-700 transition-colors"
      >
        <ImagePlus className="w-3.5 h-3.5" />
        Upload Photos
      </button>

      {/* Add Board */}
      <button
        onClick={onAddBoard}
        className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 text-white rounded-md text-xs font-medium hover:bg-gray-800 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add Board
      </button>

      {/* Export menu */}
      <div className="relative" ref={exportRef}>
        <button
          onClick={() => setShowExport(!showExport)}
          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-gray-300 rounded-md text-xs font-medium hover:bg-gray-50 transition-colors text-gray-700"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
        {showExport && (
          <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl py-1.5 w-56 z-50">
            <button onClick={() => { onExportMapPDF(); setShowExport(false) }} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-start gap-2.5 text-gray-700 transition-colors">
              <Map className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="text-sm font-medium">Map PDF</div>
                <div className="text-xs text-gray-400">Floor plan with all pins</div>
              </div>
            </button>
            <button onClick={() => { onExportBoardPDF(); setShowExport(false) }} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-start gap-2.5 text-gray-700 transition-colors">
              <FileStack className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="text-sm font-medium">Board Packets</div>
                <div className="text-xs text-gray-400">One page per board with photos</div>
              </div>
            </button>
            <div className="border-t border-gray-100 my-1" />
            <button onClick={() => { onExportJSON(); setShowExport(false) }} className="w-full text-left px-3 py-2.5 hover:bg-gray-50 flex items-start gap-2.5 text-gray-700 transition-colors">
              <Database className="w-4 h-4 mt-0.5 text-gray-400" />
              <div>
                <div className="text-sm font-medium">JSON Backup</div>
                <div className="text-xs text-gray-400">Full data export</div>
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
