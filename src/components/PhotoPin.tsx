'use client'
/* eslint-disable @next/next/no-img-element */

import { memo } from 'react'
import type { Photo } from '@/lib/types'

interface PhotoPinProps {
  photo: Photo
  selected: boolean
  onClick: (e: React.MouseEvent) => void
  onPointerDown: (e: React.PointerEvent) => void
}

export const PhotoPin = memo(function PhotoPin({ photo, selected, onClick, onPointerDown }: PhotoPinProps) {
  if (photo.pin_x == null || photo.pin_y == null) return null

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
      className="pin-element absolute group"
      style={{
        left: `${photo.pin_x}%`,
        top: `${photo.pin_y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: selected ? 20 : 10,
        pointerEvents: 'auto',
        touchAction: 'none',
      }}
      data-pin-id={photo.id}
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
        />
        {selected && (
          <line
            x1={svgCenter} y1={svgCenter}
            x2={centerX + svgCenter} y2={centerY + svgCenter}
            stroke={color}
            strokeOpacity={0.5}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
      </svg>

      {/* Rotation handle at cone tip — only when selected */}
      {selected && (
        <div
          className="pin-handle"
          data-action="rotate"
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: `translate(calc(-50% + ${centerX}px), calc(-50% + ${centerY}px))`,
            width: 12,
            height: 12,
            borderRadius: '50%',
            backgroundColor: color,
            border: '2px solid white',
            cursor: 'crosshair',
            zIndex: 3,
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}
          onPointerDown={onPointerDown}
        />
      )}

      <img
        src={photo.file_url}
        alt=""
        draggable={false}
        className="pin-element relative cursor-pointer transition-transform duration-150 group-hover:scale-110"
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
          zIndex: 2,
        }}
        onClick={onClick}
        onPointerDown={onPointerDown}
      />
    </div>
  )
}, (prev, next) =>
  prev.photo === next.photo &&
  prev.selected === next.selected
)
