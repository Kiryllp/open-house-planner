'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Photo, ZoneId } from '@/lib/types'
import { PIN_COLORS } from '@/lib/types'
import type { TopTab } from '@/lib/store'
import { useSupabaseData } from '@/lib/useSupabaseData'
import {
  hardDeletePhotos,
  restorePhotoTracked,
  softDeletePhotoTracked,
  updatePhotoTracked,
} from '@/lib/supabaseActions'
import { TopBar } from './TopBar'
import { LeftPane } from './LeftPane'
import { MapCanvas } from './MapCanvas'
import { VisiblePhotosBar } from './VisiblePhotosBar'
import { UploadDialog } from './UploadDialog'
import { ConceptPreviewModal } from './ConceptPreviewModal'
import { SimpleGallery } from './SimpleGallery'
import { RealPhotosView } from './RealPhotosView'
import { ExportDialog } from './ExportDialog'
import { DragGhost } from './DragGhost'

interface Props {
  userName: string
  onChangeName: (name: string | null) => void
}

const FLOORPLAN_URL = process.env.NEXT_PUBLIC_FLOORPLAN_URL ?? null

// Invisible element used as the native drag image. Must be in the DOM
// (Chrome/Safari ignore detached elements) and nearly transparent.
function getEmptyDragEl(): HTMLElement {
  let el = document.getElementById('__ohp-drag-ghost') as HTMLElement | null
  if (!el) {
    el = document.createElement('div')
    el.id = '__ohp-drag-ghost'
    el.style.cssText =
      'position:fixed;top:-100px;left:-100px;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1;'
    document.body.appendChild(el)
  }
  return el
}

export function MainScreen({ userName, onChangeName }: Props) {
  const [photos, setPhotosState] = useState<Photo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [leftPaneDragPhoto, setLeftPaneDragPhoto] = useState<Photo | null>(null)
  const [draggingMapPhoto, setDraggingMapPhoto] = useState<Photo | null>(null)
  const [ghostDropping, setGhostDropping] = useState(false)
  const ghostTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const photosRef = useRef<Photo[]>([])
  const [tab, setTab] = useState<TopTab>('concept')
  const [pendingUploads, setPendingUploads] = useState<File[] | null>(null)
  const [previewPhotoId, setPreviewPhotoId] = useState<string | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)

  // --- State updaters wired into realtime subscription ---------------
  const setPhotos = useCallback((next: Photo[]) => {
    setPhotosState(next)
  }, [])
  const addPhoto = useCallback((photo: Photo) => {
    setPhotosState((prev) => {
      if (prev.some((p) => p.id === photo.id)) return prev
      return [...prev, photo]
    })
  }, [])
  const updatePhoto = useCallback((id: string, updates: Partial<Photo>) => {
    setPhotosState((prev) =>
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    )
  }, [])
  const removePhoto = useCallback((id: string) => {
    setPhotosState((prev) => prev.filter((p) => p.id !== id))
  }, [])

  photosRef.current = photos

  useSupabaseData({
    setPhotos,
    updatePhoto,
    addPhoto,
    removePhoto,
    draggingId,
    userName,
    onLoaded: () => setLoaded(true),
    onError: (msg) => toast.error(msg),
  })

  // --- Derived selectors ---------------------------------------------
  const activePhotos = useMemo(
    () => photos.filter((p) => !p.deleted_at),
    [photos],
  )
  const trashedPhotos = useMemo(
    () => photos.filter((p) => p.deleted_at),
    [photos],
  )
  // Every concept that isn't placed on the map, regardless of whether it
  // has a zone yet. Legacy rows (imported from the old board model) have
  // zone = null and show up in the "Needs Zone" section of LeftPane until
  // the user assigns one.
  const unusedConcepts = useMemo(
    () =>
      activePhotos.filter((p) => p.type === 'concept' && p.pin_x == null),
    [activePhotos],
  )
  const visibleConcepts = useMemo(
    () => activePhotos.filter((p) => p.type === 'concept' && p.pin_x != null),
    [activePhotos],
  )
  const realPhotos = useMemo(
    () => activePhotos.filter((p) => p.type === 'real'),
    [activePhotos],
  )
  const conceptPhotos = useMemo(
    () => activePhotos.filter((p) => p.type === 'concept'),
    [activePhotos],
  )
  const previewPhoto = useMemo(
    () => photos.find((p) => p.id === previewPhotoId) ?? null,
    [photos, previewPhotoId],
  )

  // --- Upload from files --------------------------------------------
  const handleFiles = useCallback((files: File[]) => {
    if (files.length === 0) return
    setPendingUploads(files)
  }, [])

  // --- Drag from left pane to map -----------------------------------
  const dragSuppressRef = useRef<(() => void) | null>(null)

  const handleLeftPaneDragStart = useCallback(
    (e: React.DragEvent, photo: Photo) => {
      // Clear Chrome's auto-populated URL types (from the <img src> inside
      // the card) — these cause the macOS globe cursor badge.
      e.dataTransfer.clearData()
      e.dataTransfer.setData('application/x-ohp-photo-id', photo.id)
      e.dataTransfer.setData('text/plain', '')
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setDragImage(getEmptyDragEl(), 0, 0)

      // Suppress the browser's native drag cursor (globe / no-entry)
      // SYNCHRONOUSLY during dragstart — before any dragover event fires.
      // DragGhost's useEffect would be too late (runs after paint).
      const prevent = (ev: Event) => { ev.preventDefault() }
      window.addEventListener('dragover', prevent, true)
      window.addEventListener('drop', prevent, true)
      dragSuppressRef.current = () => {
        window.removeEventListener('dragover', prevent, true)
        window.removeEventListener('drop', prevent, true)
      }

      setLeftPaneDragPhoto(photo)
    },
    [],
  )
  const handleLeftPaneDragEnd = useCallback(() => {
    dragSuppressRef.current?.()
    dragSuppressRef.current = null
    setLeftPaneDragPhoto(null)
  }, [])

  const handleDropOnMap = useCallback(
    async (photoId: string, xPct: number, yPct: number) => {
      dragSuppressRef.current?.()
      dragSuppressRef.current = null
      setGhostDropping(true)
      if (ghostTimerRef.current) clearTimeout(ghostTimerRef.current)
      ghostTimerRef.current = setTimeout(() => {
        setLeftPaneDragPhoto(null)
        setGhostDropping(false)
      }, 220)
      const before = photos.find((p) => p.id === photoId)
      if (!before) return
      const usedColors = new Set(
        photos
          .filter((p) => p.pin_x != null && !p.deleted_at && p.color)
          .map((p) => p.color),
      )
      const nextColor =
        PIN_COLORS.find((c) => !usedColors.has(c)) ??
        PIN_COLORS[photos.filter((p) => p.pin_x != null).length % PIN_COLORS.length]

      updatePhoto(photoId, { pin_x: xPct, pin_y: yPct, color: nextColor })
      try {
        await updatePhotoTracked({
          before,
          updates: { pin_x: xPct, pin_y: yPct, color: nextColor },
          actorName: userName,
          autoAssignedColor: true,
        })
      } catch (err) {
        toast.error((err as Error).message || 'Could not place photo')
      }
    },
    [updatePhoto, photos, userName],
  )

  const handleDropFilesOnMap = useCallback(
    (files: File[]) => {
      // Files dropped directly onto the map go through the same upload
      // dialog — the user still needs to pick zones.
      setPendingUploads(files)
    },
    [],
  )

  // --- Drop a photo onto a different zone in the left pane ----------
  const handleDropOnZone = useCallback(
    async (e: React.DragEvent, zone: ZoneId) => {
      e.preventDefault()
      const photoId = e.dataTransfer.getData('application/x-ohp-photo-id')
      if (!photoId) return
      const photo = photos.find((p) => p.id === photoId)
      if (!photo || photo.zone === zone) return
      updatePhoto(photoId, { zone, zone_rank: null })
      try {
        await updatePhotoTracked({
          before: photo,
          updates: { zone, zone_rank: null },
          actorName: userName,
        })
        toast.success(`Moved to Zone ${zone}`)
      } catch (err) {
        toast.error((err as Error).message || 'Move failed')
      }
    },
    [photos, updatePhoto, userName],
  )

  // --- Pin drag on the map ------------------------------------------
  const handlePinDragStart = useCallback((id: string) => {
    setDraggingId(id)
    setSelectedId(id)
    setDraggingMapPhoto(photosRef.current.find((p) => p.id === id) ?? null)
  }, [])
  const handlePinMove = useCallback(
    (id: string, xPct: number, yPct: number) => {
      updatePhoto(id, { pin_x: xPct, pin_y: yPct })
    },
    [updatePhoto],
  )
  const handlePinDragEnd = useCallback(
    async (id: string, xPct: number, yPct: number) => {
      setDraggingId(null)
      setDraggingMapPhoto(null)
      const before = photosRef.current.find((p) => p.id === id)
      if (!before) return
      try {
        await updatePhotoTracked({
          before,
          updates: { pin_x: xPct, pin_y: yPct },
          actorName: userName,
        })
      } catch (err) {
        toast.error((err as Error).message || 'Save failed')
      }
    },
    [userName],
  )

  // --- Pin rotate on the map ----------------------------------------
  const handleRotatePin = useCallback(
    (id: string, directionDeg: number) => {
      updatePhoto(id, { direction_deg: directionDeg })
    },
    [updatePhoto],
  )
  const handleEndRotatePin = useCallback(
    async (id: string, directionDeg: number) => {
      const before = photosRef.current.find((p) => p.id === id)
      if (!before) return
      try {
        await updatePhotoTracked({
          before,
          updates: { direction_deg: directionDeg },
          actorName: userName,
        })
      } catch (err) {
        toast.error((err as Error).message || 'Save failed')
      }
    },
    [userName],
  )

  // --- Visible carousel X: remove from map --------------------------
  const handleRemoveFromMap = useCallback(
    async (id: string) => {
      const before = photosRef.current.find((p) => p.id === id)
      if (!before) return
      updatePhoto(id, { pin_x: null, pin_y: null })
      try {
        await updatePhotoTracked({
          before,
          updates: { pin_x: null, pin_y: null },
          actorName: userName,
        })
      } catch (err) {
        toast.error((err as Error).message || 'Could not remove')
      }
    },
    [updatePhoto, userName],
  )

  // --- Delete / restore ---------------------------------------------
  const handleSoftDelete = useCallback(
    async (photo: Photo) => {
      updatePhoto(photo.id, { deleted_at: new Date().toISOString() })
      try {
        await softDeletePhotoTracked(photo, userName)
      } catch (err) {
        toast.error((err as Error).message || 'Delete failed')
      }
    },
    [updatePhoto, userName],
  )
  const handleRestore = useCallback(
    async (photo: Photo) => {
      updatePhoto(photo.id, { deleted_at: null })
      try {
        await restorePhotoTracked(photo, userName)
      } catch (err) {
        toast.error((err as Error).message || 'Restore failed')
      }
    },
    [updatePhoto, userName],
  )
  const handleHardDelete = useCallback(
    async (photo: Photo) => {
      if (!confirm('Permanently delete this photo?')) return
      try {
        // Hard-delete cascades and wipes history. No event emitted by
        // design — the cascade would orphan it instantly.
        await hardDeletePhotos([photo.id])
        removePhoto(photo.id)
      } catch (err) {
        toast.error((err as Error).message || 'Delete failed')
      }
    },
    [removePhoto],
  )

  // --- Change display name ------------------------------------------
  const handleChangeName = useCallback(() => {
    const next = prompt('Your name', userName)
    if (next === null) return
    const trimmed = next.trim()
    if (!trimmed) return
    if (typeof window !== 'undefined') {
      localStorage.setItem('userName', trimmed)
    }
    onChangeName(trimmed)
  }, [userName, onChangeName])

  // --- Export: Print Map (new tab, browser native print) ------------
  const handlePrintMap = useCallback(() => {
    window.open('/export/print', '_blank', 'noopener')
  }, [])

  // --- Export: Project ZIP+PDF (client-side, see ExportDialog) ---------
  const handleExportProject = useCallback(() => {
    if (visibleConcepts.length === 0) {
      toast.error('No placed photos to export')
      return
    }
    setExportOpen(true)
  }, [visibleConcepts.length])

  // --- Render --------------------------------------------------------
  if (!loaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-600" />
          <span className="text-sm text-gray-500">Loading photos…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-gray-50">
      <TopBar
        tab={tab}
        realCount={realPhotos.length}
        conceptCount={activePhotos.filter((p) => p.type === 'concept').length}
        trashCount={trashedPhotos.length}
        userName={userName}
        onChangeTab={setTab}
        onChangeName={handleChangeName}
        onUploadFiles={handleFiles}
        onPrintMap={handlePrintMap}
        onDownloadOriginals={handleExportProject}
        downloading={false}
      />

      <div className="flex min-h-0 flex-1">
        {tab === 'concept' && (
          <>
            <LeftPane
              unusedConcepts={unusedConcepts}
              onDragStart={handleLeftPaneDragStart}
              onDragEnd={handleLeftPaneDragEnd}
              onCardClick={(photo) => setPreviewPhotoId(photo.id)}
              onCardDelete={handleSoftDelete}
              onFilesDropped={handleFiles}
              onDropOnZone={handleDropOnZone}
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="min-h-0 flex-1">
                <MapCanvas
                  floorplanUrl={FLOORPLAN_URL}
                  visiblePhotos={visibleConcepts}
                  selectedId={selectedId}
                  draggingId={draggingId}
                  draggingPhoto={leftPaneDragPhoto}
                  onSelect={(id) => {
                    setSelectedId(id)
                    setPreviewPhotoId(id)
                  }}
                  onStartDragPin={handlePinDragStart}
                  onMovePin={handlePinMove}
                  onEndDragPin={handlePinDragEnd}
                  onRotatePin={handleRotatePin}
                  onEndRotatePin={handleEndRotatePin}
                  onDropFromLeftPane={handleDropOnMap}
                  onDropFiles={handleDropFilesOnMap}
                />
              </div>
              <VisiblePhotosBar
                visiblePhotos={visibleConcepts}
                selectedId={selectedId}
                onSelect={(id) => {
                  setSelectedId(id)
                  setPreviewPhotoId(id)
                }}
                onRemove={handleRemoveFromMap}
              />
            </div>
          </>
        )}

        {tab === 'real' && (
          <RealPhotosView
            realPhotos={realPhotos}
            conceptPhotos={conceptPhotos}
            userName={userName}
            onPhotoClick={(photo) => setPreviewPhotoId(photo.id)}
            onDelete={handleSoftDelete}
          />
        )}

        {tab === 'trash' && (
          <SimpleGallery
            title="Trash"
            emptyText="Trash is empty."
            photos={trashedPhotos}
            renderActions={(photo) => (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRestore(photo)
                  }}
                  className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-blue-600 shadow hover:bg-blue-500 hover:text-white"
                >
                  Restore
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleHardDelete(photo)
                  }}
                  className="rounded bg-white/90 px-1.5 py-0.5 text-[10px] text-red-600 shadow hover:bg-red-500 hover:text-white"
                >
                  Delete forever
                </button>
              </>
            )}
          />
        )}
      </div>

      {pendingUploads && (
        <UploadDialog
          files={pendingUploads}
          userName={userName}
          onClose={() => setPendingUploads(null)}
          onInserted={() => setPendingUploads(null)}
        />
      )}

      {previewPhoto && (
        <ConceptPreviewModal
          key={previewPhoto.id}
          concept={previewPhoto}
          realPhotos={realPhotos}
          allPhotos={photos}
          userName={userName}
          onClose={() => setPreviewPhotoId(null)}
        />
      )}

      {exportOpen && (
        <ExportDialog
          photos={photos}
          floorplanUrl={FLOORPLAN_URL}
          onClose={() => setExportOpen(false)}
        />
      )}

      {(leftPaneDragPhoto || draggingMapPhoto) && (
        <DragGhost
          photo={(leftPaneDragPhoto || draggingMapPhoto)!}
          dropping={ghostDropping && !!leftPaneDragPhoto}
        />
      )}
    </div>
  )
}
