'use client'
/* eslint-disable @next/next/no-img-element */

import { memo, useCallback, useRef, useState } from 'react'
import type { Photo } from '@/lib/types'

interface PhotoPinProps {
  photo: Photo
  selected: boolean
  dragging?: boolean
  onInteraction: (e: PointerEvent, action: 'move' | 'rotate') => void
}

/**
 * Returns a callback ref that attaches capture-phase pointerdown + mousedown
 * listeners whenever the element mounts, and removes them on unmount. Using a
 * callback ref (instead of useRef + useEffect) ensures listeners are correctly
 * attached to conditionally-rendered elements like the rotation handle.
 *
 * The mousedown listener is needed because Chrome doesn't reliably suppress
 * mousedown when pointerdown is cancelled via preventDefault, and
 * react-zoom-pan-pinch listens for mousedown on the window.
 */
function usePinPointerHandler<T extends Element = HTMLDivElement>(handler: (e: PointerEvent) => void) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const cleanupRef = useRef<(() => void) | null>(null)

  return useCallback((el: T | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!el) return

    const onPointer = (e: Event) => handlerRef.current(e as PointerEvent)
    const onMouse = (e: Event) => {
      e.stopPropagation()
      ;(e as MouseEvent).stopImmediatePropagation()
    }
    el.addEventListener('pointerdown', onPointer, { capture: true })
    el.addEventListener('mousedown', onMouse, { capture: true })
    el.addEventListener('click', onMouse, { capture: true })
    cleanupRef.current = () => {
      el.removeEventListener('pointerdown', onPointer, { capture: true })
      el.removeEventListener('mousedown', onMouse, { capture: true })
      el.removeEventListener('click', onMouse, { capture: true })
    }
  }, [])
}

export const PhotoPin = memo(function PhotoPin({ photo, selected, dragging, onInteraction }: PhotoPinProps) {
  const [hovered, setHovered] = useState(false)
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onEnter = useCallback(() => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null }
    setHovered(true)
  }, [])
  const onLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setHovered(false), 600)
  }, [])

  const pinRef = usePinPointerHandler((e) => {
    e.stopPropagation()
    e.stopImmediatePropagation()
    e.preventDefault()
    onInteraction(e, 'move')
  })

  const rotateRef = usePinPointerHandler<SVGGElement>((e) => {
    e.stopPropagation()
    e.stopImmediatePropagation()
    e.preventDefault()
    onInteraction(e, 'rotate')
  })

  if (photo.pin_x == null || photo.pin_y == null) return null

  const showHandle = selected || hovered

  const color = photo.color || (photo.type === 'real' ? '#3b82f6' : '#a855f7')
  const dirRad = (photo.direction_deg - 90) * (Math.PI / 180)
  const halfFov = (photo.fov_deg / 2) * (Math.PI / 180)
  const len = photo.cone_length

  const tipX1 = Math.cos(dirRad - halfFov) * len
  const tipY1 = Math.sin(dirRad - halfFov) * len
  const tipX2 = Math.cos(dirRad + halfFov) * len
  const tipY2 = Math.sin(dirRad + halfFov) * len

  const handleDist = len * Math.cos(halfFov)
  const handleX = Math.cos(dirRad) * handleDist
  const handleY = Math.sin(dirRad) * handleDist

  const svgSize = len * 2 + 20
  const svgCenter = len + 10

  const iconAngle = (photo.direction_deg + 360) % 360

  return (
    <div
      className="pin-element absolute"
      style={{
        left: `${photo.pin_x}%`,
        top: `${photo.pin_y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: selected ? 20 : hovered ? 15 : 10,
        opacity: dragging ? 0 : undefined,
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
      data-pin-id={photo.id}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
    >
      <svg
        className="absolute pointer-events-none"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: svgSize,
          height: svgSize,
          overflow: 'visible',
        }}
      >
        <defs>
          <radialGradient id={`cone-grad-${photo.id}`} cx="0%" cy="0%" r="100%">
            <stop offset="0%" stopColor={color} stopOpacity={selected ? 0.35 : 0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </radialGradient>
          <filter id={`handle-shadow-${photo.id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx={0} dy={1} stdDeviation={1.5} floodColor="#000" floodOpacity={0.4} />
          </filter>
        </defs>
        <polygon
          points={`${svgCenter},${svgCenter} ${tipX1 + svgCenter},${tipY1 + svgCenter} ${tipX2 + svgCenter},${tipY2 + svgCenter}`}
          fill={`url(#cone-grad-${photo.id})`}
          stroke={color}
          strokeOpacity={selected ? 0.7 : 0.4}
          strokeWidth={selected ? 1.5 : 1}
          style={{ pointerEvents: 'auto', cursor: 'default' }}
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
        />
        {showHandle && (
          <g
            ref={rotateRef}
            className="pin-handle"
            transform={`translate(${handleX + svgCenter}, ${handleY + svgCenter})`}
            style={{ pointerEvents: 'auto', cursor: 'crosshair' }}
            onPointerEnter={onEnter}
            onPointerLeave={onLeave}
          >
            <circle r={14} fill="transparent" />
            <g
              transform={`rotate(${iconAngle})`}
              filter={`url(#handle-shadow-${photo.id})`}
              opacity={selected ? 1 : 0.85}
            >
              <path
                d="M-4.5 1a5.5 5.5 0 0 1 9.6-3.6l1.2 1.2M6.3-2.4v3.2h-3.2M4.5-1a5.5 5.5 0 0 1-9.6 3.6l-1.2-1.2M-6.3 2.4v-3.2h3.2"
                stroke="white"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
            </g>
          </g>
        )}
      </svg>

      <div
        ref={pinRef}
        style={{
          position: 'relative',
          width: 32,
          height: 32,
          cursor: 'pointer',
          zIndex: 2,
        }}
      >
        <img
          src={photo.file_url}
          alt=""
          draggable={false}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            objectFit: 'cover',
            border: selected ? '3px solid white' : '2px solid white',
            outline: `2px solid ${color}`,
            boxShadow: selected
              ? `0 0 12px ${color}40, 0 2px 8px rgba(0,0,0,0.3)`
              : '0 1px 4px rgba(0,0,0,0.3)',
          }}
        />
      </div>
    </div>
  )
}, (prev, next) =>
  prev.photo === next.photo &&
  prev.selected === next.selected &&
  prev.dragging === next.dragging
)
