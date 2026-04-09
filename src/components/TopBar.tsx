'use client'

import { useState, useRef } from 'react'
import { User, ImagePlus, Plus, ArrowLeft } from 'lucide-react'
import type { AppMode } from '@/lib/types'

interface TopBarProps {
  userName: string
  onChangeName: (name: string) => void
  onAddBoard: () => void
  onUploadPhotos: (files: FileList) => void
  onBack: () => void
  mode: AppMode
  boardLabel?: string
}

export function TopBar({
  userName, onChangeName, onAddBoard, onUploadPhotos, onBack, mode, boardLabel,
}: TopBarProps) {
  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(userName)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  const isBoardFocus = mode.kind === 'board-focus'

  return (
    <div className="h-12 bg-white border-b border-gray-200 flex items-center px-4 gap-2 shrink-0 z-20">
      {isBoardFocus && (
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors mr-1"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
      )}

      <h1 className="font-semibold text-gray-900 text-sm mr-1">
        {isBoardFocus ? boardLabel || 'Board' : 'Open House Planner'}
      </h1>

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
        {isBoardFocus ? 'Add Photos' : 'Upload Photos'}
      </button>

      {/* Add Board (overview only) */}
      {!isBoardFocus && (
        <button
          onClick={onAddBoard}
          className="flex items-center gap-1 px-3 py-1.5 bg-gray-700 text-white rounded-md text-xs font-medium hover:bg-gray-800 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add Board
        </button>
      )}
    </div>
  )
}
