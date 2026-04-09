'use client'
/* eslint-disable @next/next/no-img-element */

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Camera, Expand, ImagePlus, Lightbulb, Loader2, PencilLine, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import { updateBoardDb } from '@/lib/supabaseActions'
import { PhotoGalleryItem } from './PhotoGalleryItem'
import type { Photo, Board } from '@/lib/types'

interface UploadProgressItem {
  id: string
  name: string
  size: number
  done: boolean
}

interface BoardFocusPanelProps {
  board: Board
  photos: Photo[]
  boards: Board[]
  assignedPhoto: Photo | null
  galleryPhotos: Photo[]
  canonicalAssignedPhotoIds: Set<string>
  pendingPhotoIds: Set<string>
  uploading: UploadProgressItem[]
  showAllPhotos: boolean
  onToggleShowAll: () => void
  onAssignPhoto: (photoId: string) => void
  onUnassignPhoto: () => void
  onDeletePhoto: (photoId: string) => void
  onTogglePhotoType: (photoId: string) => void
  onUploadPhotos: (files: FileList) => void
  onDeleteBoard: () => void
  onBack: () => void
  onLabelDraftChange: (label: string) => void
  updateBoard: (id: string, updates: Partial<Board>) => void
}

export function BoardFocusPanel({
  board,
  photos,
  boards,
  assignedPhoto,
  galleryPhotos,
  canonicalAssignedPhotoIds,
  pendingPhotoIds,
  uploading,
  showAllPhotos,
  onToggleShowAll,
  onAssignPhoto,
  onUnassignPhoto,
  onDeletePhoto,
  onTogglePhotoType,
  onUploadPhotos,
  onDeleteBoard,
  onBack,
  onLabelDraftChange,
  updateBoard,
}: BoardFocusPanelProps) {
  const [draftLabel, setDraftLabel] = useState(board.label)
  const [isEditingLabel, setIsEditingLabel] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const labelInputRef = useRef<HTMLInputElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollTopRef = useRef(0)
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null)
  const [brokenImageIds, setBrokenImageIds] = useState<Record<string, boolean>>({})

  useLayoutEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollTopRef.current
    }
  }, [assignedPhoto?.id, galleryPhotos])

  function saveLabel() {
    const trimmed = draftLabel.trim()
    if (!trimmed) {
      const fallbackLabel = board.label || 'Untitled Board'
      setDraftLabel(fallbackLabel)
      onLabelDraftChange(fallbackLabel)
      return
    }
    if (trimmed !== board.label) {
      const previousLabel = board.label
      updateBoard(board.id, { label: trimmed })
      void updateBoardDb(board.id, { label: trimmed }).then(() => {
        toast.success('Board name updated')
      }).catch(() => {
        updateBoard(board.id, { label: previousLabel })
        setDraftLabel(previousLabel)
        onLabelDraftChange(previousLabel)
        toast.error('Failed to update board name')
      })
      return
    }

    setDraftLabel(board.label)
    onLabelDraftChange(board.label)
  }

  const pairedPhoto = useMemo(() => {
    if (!assignedPhoto) return null

    return assignedPhoto.paired_photo_id
      ? photos.find((p) => p.id === assignedPhoto.paired_photo_id && !p.deleted_at) ?? null
      : photos.find((p) => p.paired_photo_id === assignedPhoto.id && !p.deleted_at) ?? null
  }, [assignedPhoto, photos])

  const uploadProgress = uploading.length > 0
    ? Math.round((uploading.filter((item) => item.done).length / uploading.length) * 100)
    : 0

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onUploadPhotos(e.target.files)
      e.target.value = ''
    }
  }

  function handleImageBroken(photoId: string) {
    setBrokenImageIds((prev) => prev[photoId] ? prev : { ...prev, [photoId]: true })
  }

  function formatBytes(bytes: number) {
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
    return `${bytes} B`
  }

  function renderPreview(photo: Photo, alt: string) {
    const isBroken = !!brokenImageIds[photo.id]

    return (
      <button
        type="button"
        onClick={() => setLightboxPhoto(photo)}
        className="group/preview relative block w-full overflow-hidden rounded-lg border border-gray-100 shadow-sm transition hover:border-blue-200 hover:shadow-md"
      >
        {isBroken ? (
          <div className="flex aspect-[4/3] items-center justify-center bg-gray-100 px-4 text-sm font-medium text-gray-500">
            Preview unavailable
          </div>
        ) : (
          <img
            src={photo.file_url}
            alt={alt}
            className="aspect-[4/3] w-full object-cover"
            onError={() => handleImageBroken(photo.id)}
          />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100" />
        <div className="absolute right-2 top-2 rounded-full bg-white/90 p-1.5 text-gray-700 shadow-sm opacity-0 transition-opacity duration-150 group-hover/preview:opacity-100">
          <Expand className="h-3.5 w-3.5" />
        </div>
      </button>
    )
  }

  return (
    <>
      <div className="flex h-full w-full max-w-full flex-col overflow-hidden bg-white shadow-2xl md:w-[min(40vw,420px)] md:max-w-[420px] md:border-l md:border-gray-200 md:shadow-none">
        <div className="border-b border-gray-200 px-4 py-3 shrink-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2 flex-1">
              <button
                type="button"
                onClick={onBack}
                className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Back to overview"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div className="relative min-w-0 flex-1">
                <PencilLine className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  ref={labelInputRef}
                  data-label-input
                  value={isEditingLabel ? draftLabel : board.label}
                  onFocus={() => {
                    setDraftLabel(board.label)
                    onLabelDraftChange(board.label)
                    setIsEditingLabel(true)
                  }}
                  onChange={(e) => {
                    setDraftLabel(e.target.value)
                    onLabelDraftChange(e.target.value)
                  }}
                  onBlur={() => {
                    saveLabel()
                    setIsEditingLabel(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      saveLabel()
                      ;(e.target as HTMLInputElement).blur()
                    }
                  }}
                  placeholder="Board name..."
                  className="min-w-0 w-full rounded-md border border-transparent bg-gray-50 py-2 pl-8 pr-2 text-sm font-semibold text-gray-900 outline-none transition placeholder:text-gray-400 hover:border-gray-200 hover:bg-white focus:border-blue-300 focus:bg-white focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <button
              onClick={onDeleteBoard}
              className="shrink-0 text-gray-400 transition-colors hover:text-red-500"
              title="Delete board"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            Click a photo to assign it. Click the preview to inspect it full size.
          </p>
        </div>

        <div
          ref={scrollRef}
          onScroll={(e) => { scrollTopRef.current = e.currentTarget.scrollTop }}
          className="flex-1 overflow-y-auto"
        >
          <div className="p-4">
            {assignedPhoto ? (
              <div>
                {pairedPhoto ? (
                  <div className="flex gap-2">
                    <div className="flex-1 min-w-0">
                      {renderPreview(assignedPhoto, 'Assigned photo')}
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`w-2 h-2 rounded-full ${assignedPhoto.type === 'real' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                        <span className="text-[10px] text-gray-500">{assignedPhoto.type}</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      {renderPreview(pairedPhoto, 'Paired comparison photo')}
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`w-2 h-2 rounded-full ${pairedPhoto.type === 'real' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                        <span className="text-[10px] text-gray-500">{pairedPhoto.type}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  renderPreview(assignedPhoto, 'Assigned photo')
                )}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onTogglePhotoType(assignedPhoto.id)}
                    disabled={pendingPhotoIds.has(assignedPhoto.id)}
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors disabled:cursor-wait ${
                      assignedPhoto.type === 'real'
                        ? 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                        : 'bg-purple-50 text-purple-600 hover:bg-purple-100'
                    }`}
                    title="Click to toggle type"
                  >
                    {pendingPhotoIds.has(assignedPhoto.id)
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : assignedPhoto.type === 'real'
                        ? <Camera className="w-3 h-3" />
                        : <Lightbulb className="w-3 h-3" />}
                    {assignedPhoto.type}
                  </button>
                  <button
                    onClick={onUnassignPhoto}
                    disabled={pendingPhotoIds.has(assignedPhoto.id)}
                    className="text-[10px] text-gray-400 transition-colors hover:text-red-500 disabled:cursor-wait"
                  >
                    {pendingPhotoIds.has(assignedPhoto.id) ? 'Updating…' : 'Remove from board'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-amber-200 bg-amber-50/70 px-4 py-8 text-center">
                <ImagePlus className="mx-auto mb-2 h-8 w-8 text-amber-400" />
                <p className="text-sm font-medium text-amber-900">This board still needs a photo</p>
                <p className="mt-1 text-xs text-amber-700">Pick one from the gallery below or upload a new image.</p>
              </div>
            )}
          </div>

          <hr className="border-gray-100 mx-4" />

          <div className="px-4 py-3">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                Photos ({galleryPhotos.length})
              </span>
              <button
                onClick={onToggleShowAll}
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                  showAllPhotos
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
              >
                {showAllPhotos ? 'All Photos' : 'Unassigned Only'}
              </button>
            </div>

            {galleryPhotos.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-gray-400">
                  {showAllPhotos
                    ? photos.length > 0 ? 'No other photos are available right now' : 'No photos uploaded yet'
                    : 'All available photos are already assigned'}
                </p>
                {!showAllPhotos && photos.some((p) => !p.deleted_at && canonicalAssignedPhotoIds.has(p.id)) && (
                  <button
                    onClick={onToggleShowAll}
                    className="mt-1 text-xs text-blue-600 hover:text-blue-800"
                  >
                    Show all photos
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {galleryPhotos.map((photo) => {
                  const otherBoard = photo.board_id && canonicalAssignedPhotoIds.has(photo.id)
                    ? boards.find((b) => b.id === photo.board_id)
                    : null

                  return (
                    <PhotoGalleryItem
                      key={photo.id}
                      photo={photo}
                      assignedBoardLabel={otherBoard?.label}
                      loading={pendingPhotoIds.has(photo.id)}
                      onClick={() => onAssignPhoto(photo.id)}
                      onDelete={() => onDeletePhoto(photo.id)}
                      onToggleType={() => onTogglePhotoType(photo.id)}
                    />
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 border-t border-gray-200 bg-white/95 p-4 backdrop-blur">
          {uploading.length > 0 && (
            <div className="mb-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-600">
                <span>Uploading photos</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                <div className="h-full rounded-full bg-blue-500 transition-all duration-200" style={{ width: `${uploadProgress}%` }} />
              </div>
              <div className="mt-2 space-y-1">
                {uploading.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-[11px] text-gray-500">
                    {item.done ? <span className="text-green-500">&#10003;</span> : <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
                    <span className="truncate">{item.name}</span>
                    <span className="ml-auto shrink-0 text-gray-400">{formatBytes(item.size)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-500 transition-colors hover:border-blue-400 hover:text-blue-600"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            Upload more photos
          </button>
        </div>
      </div>

      {lightboxPhoto && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4" onClick={() => setLightboxPhoto(null)}>
          <div className="relative max-h-full max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setLightboxPhoto(null)}
              className="absolute right-3 top-3 z-10 rounded-full bg-white/90 p-2 text-gray-700 shadow-lg transition hover:bg-white"
              aria-label="Close photo preview"
            >
              <X className="h-4 w-4" />
            </button>
            {brokenImageIds[lightboxPhoto.id] ? (
              <div className="flex h-[60vh] w-[min(92vw,720px)] items-center justify-center rounded-2xl bg-white text-gray-500">
                Preview unavailable
              </div>
            ) : (
              <img
                src={lightboxPhoto.file_url}
                alt="Full-size preview"
                className="max-h-[85vh] max-w-[92vw] rounded-2xl bg-white object-contain shadow-2xl"
                onError={() => handleImageBroken(lightboxPhoto.id)}
              />
            )}
          </div>
        </div>
      )}
    </>
  )
}
