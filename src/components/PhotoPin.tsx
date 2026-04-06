'use client'

import type { Photo } from '@/lib/types'

interface PhotoPinProps {
  photo: Photo
  selected: boolean
  dimmed: boolean
  onClick: (e: React.MouseEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
}

export function PhotoPin({ photo, selected, dimmed, onClick, onMouseDown }: PhotoPinProps) {
  const color = photo.type === 'real' ? '#3b82f6' : '#a855f7'
  const dirRad = (photo.direction_deg - 90) * (Math.PI / 180)
  const halfFov = (photo.fov_deg / 2) * (Math.PI / 180)

  // Cone points (in px relative to pin center)
  const len = photo.cone_length
  const tipX1 = Math.cos(dirRad - halfFov) * len
  const tipY1 = Math.sin(dirRad - halfFov) * len
  const tipX2 = Math.cos(dirRad + halfFov) * len
  const tipY2 = Math.sin(dirRad + halfFov) * len

  return (
    <div
      className="absolute"
      style={{
        left: `${photo.pin_x}%`,
        top: `${photo.pin_y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: selected ? 20 : 10,
        opacity: dimmed ? 0.4 : 1,
        pointerEvents: 'auto',
      }}
      data-pin-id={photo.id}
      data-pin-kind="photo"
    >
      {/* Cone SVG */}
      <svg
        className="absolute pointer-events-none"
        style={{
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          width: len * 2 + 20,
          height: len * 2 + 20,
          overflow: 'visible',
        }}
      >
        <polygon
          points={`${len + 10},${len + 10} ${tipX1 + len + 10},${tipY1 + len + 10} ${tipX2 + len + 10},${tipY2 + len + 10}`}
          fill={color}
          fillOpacity={0.15}
          stroke={color}
          strokeOpacity={0.5}
          strokeWidth={1}
        />
      </svg>

      {/* Pin circle */}
      <div
        className="relative cursor-pointer"
        style={{
          width: 18,
          height: 18,
          borderRadius: '50%',
          backgroundColor: color,
          border: selected ? '3px solid white' : '2px solid white',
          boxShadow: selected
            ? `0 0 0 2px ${color}, 0 2px 8px rgba(0,0,0,0.3)`
            : '0 1px 3px rgba(0,0,0,0.3)',
          zIndex: 2,
        }}
        onClick={onClick}
        onMouseDown={onMouseDown}
      />
    </div>
  )
}
