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
function usePinPointerHandler(handler: (e: PointerEvent) => void) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler
  const cleanupRef = useRef<(() => void) | null>(null)

  return useCallback((el: HTMLDivElement | null) => {
    cleanupRef.current?.()
    cleanupRef.current = null
    if (!el) return

    const onPointer = (e: PointerEvent) => handlerRef.current(e)
    const onMouse = (e: MouseEvent) => {
      e.stopPropagation()
      e.stopImmediatePropagation()
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

  const rotateRef = usePinPointerHandler((e) => {
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

  const centerX = Math.cos(dirRad) * len
  const centerY = Math.sin(dirRad) * len

  const svgSize = len * 2 + 20
  const svgCenter = len + 10

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
          <>
            {/* Invisible wide hit area so the cursor doesn't fall between cone and handle */}
            <line
              x1={svgCenter} y1={svgCenter}
              x2={centerX + svgCenter} y2={centerY + svgCenter}
              stroke="transparent"
              strokeWidth={22}
              style={{ pointerEvents: 'stroke' }}
              onPointerEnter={onEnter}
              onPointerLeave={onLeave}
            />
            <line
              x1={svgCenter} y1={svgCenter}
              x2={centerX + svgCenter} y2={centerY + svgCenter}
              stroke={color}
              strokeOpacity={selected ? 0.5 : 0.35}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          </>
        )}
      </svg>

      {showHandle && (
        <div
          ref={rotateRef}
          className="pin-handle"
          onPointerEnter={onEnter}
          onPointerLeave={onLeave}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${centerX}px), calc(-50% + ${centerY}px))`,
            width: 26,
            height: 26,
            borderRadius: '50%',
            cursor: 'crosshair',
            zIndex: 3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: '50%',
              backgroundColor: color,
              border: '2px solid white',
              boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
              opacity: selected ? 1 : 0.8,
              transition: 'opacity 0.15s',
              pointerEvents: 'none',
            }}
          />
        </div>
      )}

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
