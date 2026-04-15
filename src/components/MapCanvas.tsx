'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react'
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
  draggingPhoto: Photo | null
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

type PreviewPhase = 'idle' | 'dragging' | 'dropping'

export function MapCanvas({
  floorplanUrl,
  visiblePhotos,
  selectedId,
  draggingId,
  draggingPhoto,
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

  // --- rAF-based preview positioning (no React state on every pointer move) ---
  const previewElRef = useRef<HTMLDivElement>(null)
  const previewPosRef = useRef({ x: 0, y: 0 })
  const rafIdRef = useRef(0)
  const [previewPhase, setPreviewPhase] = useState<PreviewPhase>('idle')
  const phaseRef = useRef<PreviewPhase>('idle')
  const droppingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setPhase = useCallback((next: PreviewPhase) => {
    phaseRef.current = next
    setPreviewPhase(next)
  }, [])

  // --- Floorplan image bounds for invalid-zone detection ---
  const imageNaturalRef = useRef<{ w: number; h: number } | null>(null)

  useEffect(() => {
    if (!floorplanUrl) return
    const img = new Image()
    img.onload = () => {
      imageNaturalRef.current = { w: img.naturalWidth, h: img.naturalHeight }
    }
    img.src = floorplanUrl
  }, [floorplanUrl])

  const isInsideFloorplan = useCallback((xPct: number, yPct: number): boolean => {
    const dims = imageNaturalRef.current
    const el = contentRef.current
    if (!dims || !el) return true

    const rect = el.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return true
    const containerAspect = rect.width / rect.height
    const imageAspect = dims.w / dims.h

    let leftPct: number, topPct: number, rightPct: number, bottomPct: number

    if (imageAspect > containerAspect) {
      const renderH = rect.width / imageAspect
      const offsetY = (rect.height - renderH) / 2
      leftPct = 0
      rightPct = 100
      topPct = (offsetY / rect.height) * 100
      bottomPct = ((offsetY + renderH) / rect.height) * 100
    } else {
      const renderW = rect.height * imageAspect
      const offsetX = (rect.width - renderW) / 2
      topPct = 0
      bottomPct = 100
      leftPct = (offsetX / rect.width) * 100
      rightPct = ((offsetX + renderW) / rect.width) * 100
    }

    return xPct >= leftPct && xPct <= rightPct && yPct >= topPct && yPct <= bottomPct
  }, [])

  // Writes position + validity directly to the DOM via ref (no re-render)
  const schedulePreviewUpdate = useCallback(() => {
    cancelAnimationFrame(rafIdRef.current)
    rafIdRef.current = requestAnimationFrame(() => {
      const el = previewElRef.current
      if (!el) return
      const { x, y } = previewPosRef.current
      el.style.left = `${x}%`
      el.style.top = `${y}%`
      el.dataset.valid = isInsideFloorplan(x, y) ? 'true' : 'false'
    })
  }, [isInsideFloorplan])

  // Callback ref: sets initial position the instant the overlay mounts
  const previewRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      previewElRef.current = el
      if (el) {
        const { x, y } = previewPosRef.current
        el.style.left = `${x}%`
        el.style.top = `${y}%`
        el.dataset.valid = isInsideFloorplan(x, y) ? 'true' : 'false'
      }
    },
    [isInsideFloorplan],
  )

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafIdRef.current)
      if (droppingTimerRef.current) clearTimeout(droppingTimerRef.current)
    }
  }, [])

  // --- HTML5 drag handlers ---
  const handleDragOver = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types)
    const fromPane = types.includes(DRAG_MIME)
    const fromOs = types.includes('Files')
    if (!fromPane && !fromOs) return
    e.preventDefault()
    e.dataTransfer.dropEffect = fromOs ? 'copy' : 'move'
    if (!contentRef.current) return
    const { x, y } = screenToContentPercent(e.clientX, e.clientY, contentRef.current)
    previewPosRef.current = { x, y }
    if (phaseRef.current === 'idle') {
      setPhase('dragging')
    }
    schedulePreviewUpdate()
  }

  const handleDragLeave = (e: React.DragEvent) => {
    if (
      !e.currentTarget.contains(e.relatedTarget as Node) &&
      phaseRef.current !== 'dropping'
    ) {
      cancelAnimationFrame(rafIdRef.current)
      setPhase('idle')
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    cancelAnimationFrame(rafIdRef.current)
    if (!contentRef.current) {
      setPhase('idle')
      return
    }
    const { x, y } = screenToContentPercent(e.clientX, e.clientY, contentRef.current)
    const photoId = e.dataTransfer.getData(DRAG_MIME)
    if (photoId) {
      setPhase('dropping')
      if (droppingTimerRef.current) clearTimeout(droppingTimerRef.current)
      droppingTimerRef.current = setTimeout(() => setPhase('idle'), 220)
      onDropFromLeftPane(photoId, x, y)
      return
    }
    setPhase('idle')
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        f.type.startsWith('image/'),
      )
      if (files.length > 0) onDropFiles(files)
    }
  }

  // --- Pin pointer-drag / rotate (unchanged logic) ---
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
              />
            ))}
            {previewPhase !== 'idle' && (
              <DropPreviewOverlay
                ref={previewRefCallback}
                photo={draggingPhoto}
                dropping={previewPhase === 'dropping'}
              />
            )}
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
