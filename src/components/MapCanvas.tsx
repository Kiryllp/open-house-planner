'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useRef, useState } from 'react'
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch'
import type { Photo } from '@/lib/types'
import { DRAG_DISTANCE_THRESHOLD, DRAG_HOLD_THRESHOLD_MS } from '@/lib/coords'
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
  onEndDragPin: (id: string, xPct: number, yPct: number) => void
  onDropFromLeftPane: (photoId: string, xPct: number, yPct: number) => void
  onDropFiles: (files: File[]) => void
}

const DRAG_MIME = 'application/x-ohp-photo-id'

/**
 * Convert screen coordinates to 0-100% relative to the inner content div.
 * Uses the content div's transformed bounding rect so zoom/pan are handled.
 */
function screenToContentPercent(
  clientX: number,
  clientY: number,
  contentEl: HTMLDivElement,
): { x: number; y: number } {
  const rect = contentEl.getBoundingClientRect()
  const x = ((clientX - rect.left) / rect.width) * 100
  const y = ((clientY - rect.top) / rect.height) * 100
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  }
}

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
  const contentRef = useRef<HTMLDivElement>(null)
  const [previewCoord, setPreviewCoord] = useState<{ x: number; y: number } | null>(null)

  // --- HTML5 drag (from left pane) -------------------------------------
  const handleDragOver = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types)
    const fromPane = types.includes(DRAG_MIME)
    const fromOs = types.includes('Files')
    if (!fromPane && !fromOs) return
    e.preventDefault()
    e.dataTransfer.dropEffect = fromOs ? 'copy' : 'move'
    if (!contentRef.current) return
    const { x, y } = screenToContentPercent(e.clientX, e.clientY, contentRef.current)
    setPreviewCoord({ x, y })
  }
  const handleDragLeave = () => setPreviewCoord(null)
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setPreviewCoord(null)
    if (!contentRef.current) return
    const { x, y } = screenToContentPercent(e.clientX, e.clientY, contentRef.current)
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
    lastX: number
    lastY: number
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
        lastX: 0,
        lastY: 0,
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
        if (state.committed && contentRef.current) {
          const { x, y } = screenToContentPercent(ev.clientX, ev.clientY, contentRef.current)
          state.lastX = x
          state.lastY = y
          onMovePin(state.id, x, y)
        }
      }
      const onUp = () => {
        const state = pinDragState.current
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        pinDragState.current = null
        if (state?.committed) {
          onEndDragPin(state.id, state.lastX, state.lastY)
        }
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [onStartDragPin, onMovePin, onEndDragPin],
  )

  return (
    <div
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
            ref={contentRef}
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
