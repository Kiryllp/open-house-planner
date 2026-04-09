'use client'

import { useState, useRef, useEffect } from 'react'
import { Trash2, ImagePlus, Camera, Lightbulb } from 'lucide-react'
import { updateBoardDb } from '@/lib/supabaseActions'
import { PhotoGalleryItem } from './PhotoGalleryItem'
import type { Photo, Board } from '@/lib/types'

interface BoardFocusPanelProps {
  board: Board
  photos: Photo[]
  boards: Board[]
  showAllPhotos: boolean
  onToggleShowAll: () => void
  onAssignPhoto: (photoId: string) => void
  onUnassignPhoto: () => void
  onDeletePhoto: (photoId: string) => void
  onTogglePhotoType: (photoId: string) => void
  onUploadPhotos: (files: FileList) => void
  onDeleteBoard: () => void
  onBack: () => void
  updateBoard: (id: string, updates: Partial<Board>) => void
}

export function BoardFocusPanel({
  board,
  photos,
  boards,
  showAllPhotos,
  onToggleShowAll,
  onAssignPhoto,
  onUnassignPhoto,
  onDeletePhoto,
  onTogglePhotoType,
  onUploadPhotos,
  onDeleteBoard,
  onBack,
  updateBoard,
}: BoardFocusPanelProps) {
  const [label, setLabel] = useState(board.label)
  const boardIdRef = useRef(board.id)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (boardIdRef.current !== board.id) {
      setLabel(board.label)
      boardIdRef.current = board.id
    }
  }, [board.id, board.label])

  // Sync label when board is updated externally (realtime)
  useEffect(() => {
    if (board.label !== label && boardIdRef.current === board.id) {
      // Only sync if user isn't actively editing (no focus)
      const active = document.activeElement
      const labelInput = document.querySelector('[data-label-input]')
      if (active !== labelInput) {
        setLabel(board.label)
      }
    }
  }, [board.label]) // eslint-disable-line react-hooks/exhaustive-deps

  function saveLabel() {
    const trimmed = label.trim()
    if (!trimmed) {
      setLabel(board.label || 'Untitled Board')
      return
    }
    if (trimmed !== board.label) {
      updateBoard(board.id, { label: trimmed })
      updateBoardDb(board.id, { label: trimmed }).catch(() => {})
    }
  }

  // Find the assigned photo for this board
  const assignedPhoto = photos.find(p => p.board_id === board.id && !p.deleted_at)

  // Find the paired photo if the assigned photo has a pair
  const pairedPhoto = assignedPhoto
    ? (assignedPhoto.paired_photo_id
        ? photos.find(p => p.id === assignedPhoto.paired_photo_id && !p.deleted_at)
        : photos.find(p => p.paired_photo_id === assignedPhoto.id && !p.deleted_at))
    : null

  // Gallery photos: unassigned (or all), sorted by created_at desc
  const galleryPhotos = photos
    .filter(p => {
      if (p.deleted_at) return false
      if (p.id === assignedPhoto?.id) return false
      if (!showAllPhotos) return !p.board_id
      return true
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onUploadPhotos(e.target.files)
      e.target.value = ''
    }
  }

  return (
    <div className="w-[360px] bg-white border-l border-gray-200 flex flex-col h-full shrink-0 overflow-hidden">
      {/* Header — sticky */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <input
            data-label-input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={saveLabel}
            onKeyDown={(e) => { if (e.key === 'Enter') { saveLabel(); (e.target as HTMLInputElement).blur() } }}
            placeholder="Board name..."
            className="font-semibold text-sm text-gray-900 bg-transparent border-none outline-none focus:ring-0 min-w-0 flex-1 px-1 py-0.5 rounded hover:bg-gray-50 focus:bg-gray-50 placeholder:text-gray-300"
          />
        </div>
        <button
          onClick={onDeleteBoard}
          className="text-gray-400 hover:text-red-500 transition-colors shrink-0 ml-2"
          title="Delete board"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Assigned photo preview */}
        <div className="p-4">
          {assignedPhoto ? (
            <div>
              {pairedPhoto ? (
                // Side-by-side comparison
                <div className="flex gap-2">
                  <div className="flex-1 min-w-0">
                    <img
                      src={assignedPhoto.file_url}
                      alt="Assigned photo"
                      className="w-full rounded-lg shadow-sm border border-gray-100 aspect-[4/3] object-cover"
                    />
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`w-2 h-2 rounded-full ${assignedPhoto.type === 'real' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                      <span className="text-[10px] text-gray-500">{assignedPhoto.type}</span>
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <img
                      src={pairedPhoto.file_url}
                      alt="Paired comparison photo"
                      className="w-full rounded-lg shadow-sm border border-gray-100 aspect-[4/3] object-cover"
                    />
                    <div className="flex items-center gap-1 mt-1">
                      <span className={`w-2 h-2 rounded-full ${pairedPhoto.type === 'real' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                      <span className="text-[10px] text-gray-500">{pairedPhoto.type}</span>
                    </div>
                  </div>
                </div>
              ) : (
                // Single photo preview
                <img
                  src={assignedPhoto.file_url}
                  alt="Assigned photo"
                  className="w-full rounded-lg shadow-sm border border-gray-100"
                />
              )}
              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={() => onTogglePhotoType(assignedPhoto.id)}
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 transition-colors ${
                    assignedPhoto.type === 'real'
                      ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                      : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                  }`}
                  title="Click to toggle type"
                >
                  {assignedPhoto.type === 'real' ? <Camera className="w-3 h-3" /> : <Lightbulb className="w-3 h-3" />}
                  {assignedPhoto.type}
                </button>
                <button
                  onClick={onUnassignPhoto}
                  className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                >
                  Remove from board
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 rounded-lg border-2 border-dashed border-gray-200 px-4 py-8 text-center">
              <ImagePlus className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No photo assigned</p>
              <p className="text-xs text-gray-300 mt-1">Pick one from the gallery below</p>
            </div>
          )}
        </div>

        <hr className="border-gray-100 mx-4" />

        {/* Gallery section */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Photos ({galleryPhotos.length})
            </span>
            <button
              onClick={onToggleShowAll}
              className={`text-[10px] font-medium px-2 py-0.5 rounded-full transition-colors ${
                showAllPhotos
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              {showAllPhotos ? 'All Photos' : 'Unassigned Only'}
            </button>
          </div>

          {galleryPhotos.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-xs text-gray-400">
                {showAllPhotos ? 'No photos uploaded yet' : 'All photos are assigned'}
              </p>
              {!showAllPhotos && photos.some(p => !p.deleted_at && p.board_id) && (
                <button
                  onClick={onToggleShowAll}
                  className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                >
                  Show all photos
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {galleryPhotos.map(photo => {
                const otherBoard = photo.board_id ? boards.find(b => b.id === photo.board_id) : null
                return (
                  <PhotoGalleryItem
                    key={photo.id}
                    photo={photo}
                    assignedBoardLabel={otherBoard?.label}
                    onClick={() => onAssignPhoto(photo.id)}
                    onDelete={() => onDeletePhoto(photo.id)}
                    onToggleType={() => onTogglePhotoType(photo.id)}
                  />
                )
              })}
            </div>
          )}

          {/* Upload more */}
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
            className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 border border-dashed border-gray-300 rounded-lg text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors"
          >
            <ImagePlus className="w-3.5 h-3.5" />
            Upload more photos
          </button>
        </div>
      </div>
    </div>
  )
}
