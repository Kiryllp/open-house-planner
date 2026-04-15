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
  onRotatePin: (id: string, directionDeg: number) => void
  onEndRotatePin: (id: string, directionDeg: number) => void
  onDropFromLeftPane: (photoId: string, xPct: number, yPct: number) => void
  onDropFiles: (files: File[]) => void
}

const DRAG_MIME = 'application/x-ohp-photo-id'

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
  onRotatePin,
  onEndRotatePin,
  onDropFromLeftPane,
  onDropFiles,
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const [previewCoord, setPreviewCoord] = useState<{ x: number; y: number } | null>(null)

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
  const handleDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setPreviewCoord(null)
    }
  }
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

  // Refs for callbacks so the closure in handleInteraction always has latest
  const callbacksRef = useRef({
    onSelect, onStartDragPin, onMovePin, onEndDragPin,
    onRotatePin, onEndRotatePin,
  })
  callbacksRef.current = {
    onSelect, onStartDragPin, onMovePin, onEndDragPin,
    onRotatePin, onEndRotatePin,
  }

  const handleInteraction = useCallback(
    (photoId: string, photo: Photo) =>
      (e: PointerEvent, action: 'move' | 'rotate') => {
        const cb = callbacksRef.current
        const initX = photo.pin_x ?? 50
        const initY = photo.pin_y ?? 50

        const state: {
          id: string; mode: 'pending' | 'drag' | 'rotate'
          startX: number; startY: number; startedAt: number
          lastX: number; lastY: number; lastDeg: number
          pinX: number; pinY: number; moved: boolean
        } = {
          id: photoId,
          mode: action === 'rotate' ? 'rotate' : 'pending',
          startX: e.clientX,
          startY: e.clientY,
          startedAt: Date.now(),
          lastX: initX,
          lastY: initY,
          lastDeg: photo.direction_deg,
          pinX: initX,
          pinY: initY,
          moved: false,
        }

        const onMove = (ev: PointerEvent) => {
          if (state.mode === 'rotate') {
            if (!contentRef.current) return
            const rect = contentRef.current.getBoundingClientRect()
            const pinScreenX = rect.left + (state.pinX / 100) * rect.width
            const pinScreenY = rect.top + (state.pinY / 100) * rect.height
            const dx = ev.clientX - pinScreenX
            const dy = ev.clientY - pinScreenY
            const rad = Math.atan2(dy, dx)
            const deg = ((rad * 180) / Math.PI + 90 + 360) % 360
            state.lastDeg = Math.round(deg)
            state.moved = true
            cb.onRotatePin(state.id, state.lastDeg)
            return
          }

          if (state.mode === 'pending') {
            const dx = ev.clientX - state.startX
            const dy = ev.clientY - state.startY
            const dist = Math.hypot(dx, dy)
            const elapsed = Date.now() - state.startedAt
            if (dist >= DRAG_DISTANCE_THRESHOLD || elapsed >= DRAG_HOLD_THRESHOLD_MS) {
              state.mode = 'drag'
              state.moved = true
              cb.onStartDragPin(state.id)
            }
          }

          if (state.mode === 'drag' && contentRef.current) {
            const { x, y } = screenToContentPercent(ev.clientX, ev.clientY, contentRef.current)
            state.lastX = x
            state.lastY = y
            cb.onMovePin(state.id, x, y)
          }
        }

        const onUp = () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onUp)

          if (state.mode === 'drag') {
            cb.onEndDragPin(state.id, state.lastX, state.lastY)
          } else if (state.mode === 'rotate' && state.moved) {
            cb.onEndRotatePin(state.id, state.lastDeg)
          } else if (state.mode === 'pending' && !state.moved) {
            cb.onSelect(state.id)
          }
        }

        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onUp)
      },
    [],
  )

  const handlePinClick = useCallback(
    (photoId: string) => () => {
      callbacksRef.current.onSelect(photoId)
    },
    [],
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
                onInteraction={handleInteraction(photo.id, photo)}
                onClick={handlePinClick(photo.id)}
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
