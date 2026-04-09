'use client'
/* eslint-disable @next/next/no-img-element */

import { memo, useState } from 'react'
import type { Board } from '@/lib/types'

interface BoardPinProps {
  board: Board
  selected: boolean
  focused: boolean
  showCone: boolean
  assignedPhotoUrl: string | null
  colocatedPhotos?: number
  onClick: (e: React.MouseEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
}

// Board cone constants — match PhotoPin style
const BOARD_CONE_FOV = 90
const BOARD_CONE_LENGTH = 80

export const BoardPin = memo(function BoardPin({
  board,
  selected,
  focused,
  showCone,
  assignedPhotoUrl,
  colocatedPhotos = 0,
  onClick,
  onMouseDown,
}: BoardPinProps) {
  const boardColor = board.color || '#4b5563'
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)

  // Cone geometry
  const dirRad = (board.facing_deg - 90) * (Math.PI / 180)
  const halfFov = (BOARD_CONE_FOV / 2) * (Math.PI / 180)
  const len = BOARD_CONE_LENGTH

  const tipX1 = Math.cos(dirRad - halfFov) * len
  const tipY1 = Math.sin(dirRad - halfFov) * len
  const tipX2 = Math.cos(dirRad + halfFov) * len
  const tipY2 = Math.sin(dirRad + halfFov) * len

  const centerX = Math.cos(dirRad) * len
  const centerY = Math.sin(dirRad) * len

  const svgSize = len * 2 + 20
  const svgCenter = len + 10
  const hasAssignedPhoto = !!assignedPhotoUrl && brokenUrl !== assignedPhotoUrl
  const needsPhoto = !hasAssignedPhoto

  return (
    <div
      className={`absolute group select-none transition-opacity duration-200 ${
        focused ? 'opacity-100' : 'opacity-45 hover:opacity-95 cursor-pointer'
      }`}
      style={{
        left: `${board.pin_x}%`,
        top: `${board.pin_y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: selected ? 20 : 10,
        pointerEvents: 'auto',
      }}
      data-pin-id={board.id}
      data-pin-kind="board"
    >
      {/* Board cone SVG — matches PhotoPin style */}
      {showCone && (
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
            <radialGradient id={`board-cone-grad-${board.id}`} cx="0%" cy="0%" r="100%">
              <stop offset="0%" stopColor={boardColor} stopOpacity={selected ? 0.35 : 0.20} />
              <stop offset="100%" stopColor={boardColor} stopOpacity={0.05} />
            </radialGradient>
          </defs>
          <polygon
            points={`${svgCenter},${svgCenter} ${tipX1 + svgCenter},${tipY1 + svgCenter} ${tipX2 + svgCenter},${tipY2 + svgCenter}`}
            fill={`url(#board-cone-grad-${board.id})`}
            stroke={boardColor}
            strokeOpacity={selected ? 0.6 : 0.3}
            strokeWidth={selected ? 1.5 : 0.75}
          />
          {selected && (
            <line
              x1={svgCenter} y1={svgCenter}
              x2={centerX + svgCenter} y2={centerY + svgCenter}
              stroke={boardColor}
              strokeOpacity={0.5}
              strokeWidth={1}
              strokeDasharray="4 3"
            />
          )}
        </svg>
      )}

      <button
        type="button"
        aria-label={`${board.label || 'Untitled board'}${needsPhoto ? ', needs a photo' : ''}`}
        className="pin-element relative flex cursor-pointer flex-col items-center gap-1 outline-none transition-transform duration-150 hover:scale-105 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        onClick={onClick}
        onMouseDown={onMouseDown}
        style={{ padding: '8px' }}
      >
        {/* Board visual: thumbnail or colored rectangle */}
        <div
          className="relative transition-transform duration-150"
          style={{ transform: `rotate(${board.facing_deg}deg)` }}
        >
          {hasAssignedPhoto ? (
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                overflow: 'hidden',
                border: selected ? '3px solid white' : '2px solid white',
                boxShadow: selected
                  ? `0 0 0 2px ${boardColor}, 0 0 12px ${boardColor}40, 0 2px 8px rgba(0,0,0,0.3)`
                  : '0 1px 4px rgba(0,0,0,0.3)',
              }}
            >
              <img
                src={assignedPhotoUrl!}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `rotate(-${board.facing_deg}deg)` }}
                draggable={false}
                onError={() => setBrokenUrl(assignedPhotoUrl)}
              />
            </div>
          ) : (
            <div
              style={{
                width: 28,
                height: 16,
                backgroundColor: boardColor,
                borderRadius: 3,
                border: selected ? '2px solid white' : '1px solid #6b7280',
                boxShadow: selected
                  ? `0 0 0 2px ${boardColor}, 0 0 12px ${boardColor}40, 0 2px 8px rgba(0,0,0,0.3)`
                  : '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
          )}
        </div>

        {/* Co-located photos indicator */}
        {colocatedPhotos > 0 && (
          <div className="absolute -top-1 -right-1 flex items-center justify-center rounded-full bg-blue-500 text-white text-[8px] font-bold shadow-sm" style={{ width: 14, height: 14 }}>
            {colocatedPhotos}
          </div>
        )}

        {/* Label — always below the pin */}
        <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold shadow-sm transition-colors whitespace-nowrap ${
          selected
            ? 'border-gray-300 bg-white text-gray-900'
            : focused
              ? 'border-gray-200 bg-white/95 text-gray-700'
              : 'border-gray-200 bg-white/80 text-gray-600 group-hover:bg-white'
        }`}>
          {board.label || 'Untitled'}
        </span>

        {/* Needs Photo indicator — below label */}
        {needsPhoto && (
          <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-700 animate-pulse whitespace-nowrap">
            Needs Photo
          </span>
        )}
      </button>
    </div>
  )
}, (prev, next) =>
  prev.board === next.board &&
  prev.selected === next.selected &&
  prev.focused === next.focused &&
  prev.showCone === next.showCone &&
  prev.assignedPhotoUrl === next.assignedPhotoUrl &&
  prev.colocatedPhotos === next.colocatedPhotos
)
