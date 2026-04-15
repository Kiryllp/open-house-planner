'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import type { Photo } from '@/lib/types'
import { screenToPercent, DRAG_DISTANCE_THRESHOLD, DRAG_HOLD_THRESHOLD_MS } from '@/lib/coords'
import { PhotoPin } from './PhotoPin'
import { DropPreviewOverlay } from './DropPreviewOverlay'

interface Props {
  floorplanUrl: string | null
  visiblePhotos: Photo[]
  selectedId: string | null
  draggingId: string | null
  onSelect: (id: string | null) => void
  onStartDragPin: (id: string) => void
  onMovePin: (id: string, xPct: number, yPct: number) => void
  onEndDragPin: (id: string) => void
  onDropFromLeftPane: (photoId: string, xPct: number, yPct: number) => void
  onDropFiles: (files: File[]) => void
}

const DRAG_MIME = 'application/x-ohp-photo-id'

export function MapCanvas({
  floorplanUrl,
  visiblePhotos,
  selectedId,
  draggingId,
  onSelect,
  onStartDragPin,
  onMovePin,
  onEndDragPin,
  onDropFromLeftPane,
  onDropFiles,
}: Props) {
  const surfaceRef = useRef<HTMLDivElement>(null)
  const [previewCoord, setPreviewCoord] = useState<{ x: number; y: number } | null>(null)

  // --- HTML5 drag (from left pane) -------------------------------------
  const handleDragOver = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types)
    const fromPane = types.includes(DRAG_MIME)
    const fromOs = types.includes('Files')
    if (!fromPane && !fromOs) return
    e.preventDefault()
    e.dataTransfer.dropEffect = fromOs ? 'copy' : 'move'
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return
    const { x, y } = screenToPercent(e.clientX, e.clientY, rect)
    setPreviewCoord({ x, y })
  }
  const handleDragLeave = () => setPreviewCoord(null)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const rect = surfaceRef.current?.getBoundingClientRect()
    if (!rect) return
    const { x, y } = screenToPercent(e.clientX, e.clientY, rect)
    setPreviewCoord(null)
    const photoId = e.dataTransfer.getData(DRAG_MIME)
    if (photoId) {
      onDropFromLeftPane(photoId, x, y)
      return
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/'),
      )
      if (files.length > 0) onDropFiles(files)
    }
  }

  // --- Pin drag (moving a placed pin) ----------------------------------
  const pinDragState = useRef<{
    id: string
    startX: number
    startY: number
    startedAt: number
    committed: boolean
  } | null>(null)

  const handlePinMouseDown = useCallback(
    (photoId: string) => (e: React.MouseEvent) => {
      e.stopPropagation()
      pinDragState.current = {
        id: photoId,
        startX: e.clientX,
        startY: e.clientY,
        startedAt: Date.now(),
        committed: false,
      }

      const onMove = (ev: MouseEvent) => {
        const state = pinDragState.current
        if (!state) return
        const dx = ev.clientX - state.startX
        const dy = ev.clientY - state.startY
        const dist = Math.hypot(dx, dy)
        const elapsed = Date.now() - state.startedAt
        if (
          !state.committed &&
          (dist >= DRAG_DISTANCE_THRESHOLD || elapsed >= DRAG_HOLD_THRESHOLD_MS)
        ) {
          state.committed = true
          onStartDragPin(state.id)
        }
        if (state.committed) {
          const rect = surfaceRef.current?.getBoundingClientRect()
          if (!rect) return
          const { x, y } = screenToPercent(ev.clientX, ev.clientY, rect)
          onMovePin(state.id, x, y)
        }
      }
      const onUp = () => {
        const state = pinDragState.current
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        pinDragState.current = null
        if (state?.committed) onEndDragPin(state.id)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [onStartDragPin, onMovePin, onEndDragPin],
  )

  // Keep preview hidden if no active drag
  useEffect(() => {
    if (!draggingId) return
  }, [draggingId])

  return (
    <div
      ref={surfaceRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative h-full w-full overflow-hidden bg-gray-100"
    >
      <TransformWrapper
        minScale={0.5}
        maxScale={6}
        initialScale={1}
        limitToBounds={false}
        panning={{ excluded: ['pin-element', 'pin-handle'] }}
        doubleClick={{ disabled: true }}
      >
        <TransformComponent
          wrapperStyle={{ width: '100%', height: '100%' }}
          contentStyle={{ width: '100%', height: '100%' }}
        >
          <div
            className="relative mx-auto my-auto"
            style={{
              width: '100%',
              height: '100%',
              backgroundImage: floorplanUrl ? `url(${floorplanUrl})` : undefined,
              backgroundSize: 'contain',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'center',
            }}
            onClick={() => onSelect(null)}
          >
            {visiblePhotos.map((photo) => (
              <PhotoPin
                key={photo.id}
                photo={photo}
                selected={photo.id === selectedId}
                onClick={(e) => {
                  e.stopPropagation()
                  onSelect(photo.id)
                }}
                onMouseDown={handlePinMouseDown(photo.id)}
              />
            ))}
            <DropPreviewOverlay xPct={previewCoord?.x ?? null} yPct={previewCoord?.y ?? null} />
          </div>
        </TransformComponent>
      </TransformWrapper>

      {!floorplanUrl && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-gray-400">
          Set NEXT_PUBLIC_FLOORPLAN_URL to display the floorplan
        </div>
      )}
    </div>
  )
}

export { DRAG_MIME }
