'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Photo, ZoneId } from '@/lib/types'
import type { TopTab } from '@/lib/store'
import { useSupabaseData } from '@/lib/useSupabaseData'
import {
  placePhotoOnMap,
  removePhotoFromMap,
  restorePhoto,
  softDeletePhoto,
  updatePhotoDb,
  hardDeletePhotos,
} from '@/lib/supabaseActions'
import { TopBar } from './TopBar'
import { LeftPane } from './LeftPane'
import { MapCanvas } from './MapCanvas'
import { VisiblePhotosBar } from './VisiblePhotosBar'
import { UploadDialog } from './UploadDialog'
import { ConceptPreviewModal } from './ConceptPreviewModal'
import { SimpleGallery } from './SimpleGallery'
import { RealPhotosView } from './RealPhotosView'
import { buildExportZip, downloadBlob } from '@/lib/exportOriginalsZip'
import { ExportMapRenderer } from './ExportMapRenderer'

interface Props {
  userName: string
  onChangeName: (name: string | null) => void
}

const FLOORPLAN_URL = process.env.NEXT_PUBLIC_FLOORPLAN_URL ?? null

export function MainScreen({ userName, onChangeName }: Props) {
  const [photos, setPhotosState] = useState<Photo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [tab, setTab] = useState<TopTab>('concept')
  const [pendingUploads, setPendingUploads] = useState<File[] | null>(null)
  const [previewPhotoId, setPreviewPhotoId] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const exportMapRef = useRef<HTMLDivElement>(null)

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
  const handleLeftPaneDragStart = useCallback(
    (e: React.DragEvent, photo: Photo) => {
      e.dataTransfer.setData('application/x-ohp-photo-id', photo.id)
      e.dataTransfer.effectAllowed = 'move'
    },
    [],
  )
  const handleLeftPaneDragEnd = useCallback(() => {}, [])

  const handleDropOnMap = useCallback(
    async (photoId: string, xPct: number, yPct: number) => {
      updatePhoto(photoId, { pin_x: xPct, pin_y: yPct })
      try {
        await placePhotoOnMap(photoId, xPct, yPct)
      } catch (err) {
        toast.error((err as Error).message || 'Could not place photo')
      }
    },
    [updatePhoto],
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
      const photoId = e.dataTransfer.getData('application/x-ohp-photo-id')
      if (!photoId) return
      e.preventDefault()
      const photo = photos.find((p) => p.id === photoId)
      if (!photo || photo.zone === zone) return
      updatePhoto(photoId, { zone, zone_rank: null })
      try {
        await updatePhotoDb(photoId, { zone, zone_rank: null })
        toast.success(`Moved to Zone ${zone}`)
      } catch (err) {
        toast.error((err as Error).message || 'Move failed')
      }
    },
    [photos, updatePhoto],
  )

  // --- Pin drag on the map ------------------------------------------
  const handlePinDragStart = useCallback((id: string) => {
    setDraggingId(id)
    setSelectedId(id)
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
      try {
        await placePhotoOnMap(id, xPct, yPct)
      } catch (err) {
        toast.error((err as Error).message || 'Save failed')
      }
    },
    [],
  )

  // --- Visible carousel X: remove from map --------------------------
  const handleRemoveFromMap = useCallback(
    async (id: string) => {
      updatePhoto(id, { pin_x: null, pin_y: null })
      try {
        await removePhotoFromMap(id)
      } catch (err) {
        toast.error((err as Error).message || 'Could not remove')
      }
    },
    [updatePhoto],
  )

  // --- Delete / restore ---------------------------------------------
  const handleSoftDelete = useCallback(
    async (photo: Photo) => {
      updatePhoto(photo.id, { deleted_at: new Date().toISOString() })
      try {
        await softDeletePhoto(photo.id)
      } catch (err) {
        toast.error((err as Error).message || 'Delete failed')
      }
    },
    [updatePhoto],
  )
  const handleRestore = useCallback(
    async (photo: Photo) => {
      updatePhoto(photo.id, { deleted_at: null })
      try {
        await restorePhoto(photo.id)
      } catch (err) {
        toast.error((err as Error).message || 'Restore failed')
      }
    },
    [updatePhoto],
  )
  const handleHardDelete = useCallback(
    async (photo: Photo) => {
      if (!confirm('Permanently delete this photo?')) return
      try {
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

  // --- Export: Project ZIP (client-side) -------------------------------
  const handleExportProject = useCallback(async () => {
    if (downloading) return
    if (visibleConcepts.length === 0) {
      toast.error('No placed photos to export')
      return
    }
    setDownloading(true)
    try {
      let mapBlob: Blob | null = null
      if (exportMapRef.current) {
        const { toPng } = await import('html-to-image')
        const dataUrl = await toPng(exportMapRef.current, {
          width: 1600,
          height: 1067,
          pixelRatio: 1,
        })
        const res = await fetch(dataUrl)
        mapBlob = await res.blob()
      }
      const blob = await buildExportZip(photos, mapBlob)
      const stamp = new Date().toISOString().slice(0, 10)
      downloadBlob(blob, `open-house-export-${stamp}.zip`)
      toast.success('Export downloaded')
    } catch (err) {
      console.error(err)
      toast.error((err as Error).message || 'Export failed')
    } finally {
      setDownloading(false)
    }
  }, [downloading, photos, visibleConcepts.length])

  // --- Render --------------------------------------------------------
  const mainTab = tab

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
        downloading={downloading}
      />

      <div className="flex min-h-0 flex-1">
        {mainTab === 'concept' && (
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
                  onSelect={setSelectedId}
                  onStartDragPin={handlePinDragStart}
                  onMovePin={handlePinMove}
                  onEndDragPin={handlePinDragEnd}
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

        {mainTab === 'real' && (
          <RealPhotosView
            realPhotos={realPhotos}
            conceptPhotos={conceptPhotos}
            onPhotoClick={(photo) => setPreviewPhotoId(photo.id)}
            onDelete={handleSoftDelete}
          />
        )}

        {mainTab === 'trash' && (
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
          concept={previewPhoto}
          realPhotos={realPhotos}
          userName={userName}
          onClose={() => setPreviewPhotoId(null)}
        />
      )}

      <ExportMapRenderer
        ref={exportMapRef}
        floorplanUrl={FLOORPLAN_URL}
        photos={visibleConcepts}
      />
    </div>
  )
}
