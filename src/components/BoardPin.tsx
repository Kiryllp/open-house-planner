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
  onClick: (e: React.MouseEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
}

// Board cone constants
const BOARD_CONE_FOV = 90
const BOARD_CONE_LENGTH = 80

export const BoardPin = memo(function BoardPin({
  board,
  selected,
  focused,
  showCone,
  assignedPhotoUrl,
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
      {/* Board cone SVG */}
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
              <stop offset="0%" stopColor={boardColor} stopOpacity={selected ? 0.25 : 0.15} />
              <stop offset="100%" stopColor={boardColor} stopOpacity={0.03} />
            </radialGradient>
          </defs>
          <polygon
            points={`${svgCenter},${svgCenter} ${tipX1 + svgCenter},${tipY1 + svgCenter} ${tipX2 + svgCenter},${tipY2 + svgCenter}`}
            fill={`url(#board-cone-grad-${board.id})`}
            stroke={boardColor}
            strokeOpacity={selected ? 0.5 : 0.25}
            strokeWidth={selected ? 1 : 0.5}
          />
        </svg>
      )}

      <button
        type="button"
        aria-label={`${board.label || 'Untitled board'}${needsPhoto ? ', needs a photo' : ''}`}
        className="pin-element relative -m-4 flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl px-4 pb-7 pt-4 outline-none transition-transform duration-150 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        onClick={onClick}
        onMouseDown={onMouseDown}
      >
        <div
          className={`absolute inset-0 rounded-2xl transition-all duration-150 ${
            selected
              ? 'bg-white/90 shadow-[0_10px_30px_rgba(15,23,42,0.18)]'
              : focused
                ? 'bg-white/70 shadow-[0_8px_24px_rgba(15,23,42,0.12)] group-hover:bg-white/90 group-hover:shadow-[0_10px_30px_rgba(15,23,42,0.18)]'
                : 'bg-white/55 shadow-[0_8px_24px_rgba(15,23,42,0.08)] group-hover:bg-white/85 group-hover:shadow-[0_10px_30px_rgba(15,23,42,0.16)]'
          }`}
        />

        {/* Board visual: thumbnail or colored rectangle */}
        <div
          className="relative transition-transform duration-150 group-hover:scale-110"
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
                  ? `0 0 0 2px ${boardColor}, 0 0 10px rgba(75,85,99,0.4), 0 2px 8px rgba(0,0,0,0.3)`
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
              className="relative"
              style={{
                width: 28,
                height: 16,
                backgroundColor: boardColor,
                borderRadius: 3,
                border: selected ? '2px solid white' : '1px solid #6b7280',
                boxShadow: selected
                  ? `0 0 0 2px ${boardColor}, 0 0 10px rgba(75,85,99,0.4), 0 2px 8px rgba(0,0,0,0.3)`
                  : '0 1px 3px rgba(0,0,0,0.2)',
              }}
            >
              <div className="absolute -inset-2 rounded-lg border-2 border-dashed border-amber-400 bg-amber-100/50 animate-pulse" />
            </div>
          )}
        </div>

        {/* Label + assignment indicator */}
        <div className="relative flex items-center gap-1 whitespace-nowrap">
          <span className={`rounded-md border px-2 py-1 text-xs font-semibold shadow-sm transition-colors ${
            selected
              ? 'border-gray-200 bg-white text-gray-900'
              : focused
                ? 'border-gray-200 bg-white/95 text-gray-700'
                : 'border-gray-200 bg-white/85 text-gray-600 group-hover:bg-white'
          }`}>
            {board.label || 'Untitled'}
          </span>
          {needsPhoto && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-700 shadow-sm">
              Needs Photo
            </span>
          )}
        </div>
      </button>
    </div>
  )
}, (prev, next) =>
  prev.board === next.board &&
  prev.selected === next.selected &&
  prev.focused === next.focused &&
  prev.showCone === next.showCone &&
  prev.assignedPhotoUrl === next.assignedPhotoUrl
)
