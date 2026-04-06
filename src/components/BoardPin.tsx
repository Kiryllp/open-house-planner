'use client'

import type { Board } from '@/lib/types'

interface BoardPinProps {
  board: Board
  selected: boolean
  dimmed: boolean
  highlighted: boolean
  coneOpacity: number
  photoCount: number
  onClick: (e: React.MouseEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
}

// Board cone constants (visual only — no DB columns needed)
const BOARD_CONE_FOV = 90
const BOARD_CONE_LENGTH = 80

export function BoardPin({ board, selected, dimmed, highlighted, coneOpacity, photoCount, onClick, onMouseDown }: BoardPinProps) {
  const boardColor = board.color || '#4b5563'

  // Cone geometry — facing_deg is used as the direction (0 = right)
  const dirRad = (board.facing_deg - 90) * (Math.PI / 180)
  const halfFov = (BOARD_CONE_FOV / 2) * (Math.PI / 180)
  const len = BOARD_CONE_LENGTH

  const tipX1 = Math.cos(dirRad - halfFov) * len
  const tipY1 = Math.sin(dirRad - halfFov) * len
  const tipX2 = Math.cos(dirRad + halfFov) * len
  const tipY2 = Math.sin(dirRad + halfFov) * len

  const svgSize = len * 2 + 20
  const svgCenter = len + 10

  return (
    <div
      className="absolute group"
      style={{
        left: `${board.pin_x}%`,
        top: `${board.pin_y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: selected ? 20 : 10,
        opacity: dimmed ? 0.35 : (highlighted === false ? 0.5 : 1),
        pointerEvents: 'auto',
        transition: 'opacity 0.2s ease',
      }}
      data-pin-id={board.id}
      data-pin-kind="board"
    >
      {/* Board cone SVG */}
      {coneOpacity > 0 && (
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
              <stop offset="0%" stopColor={boardColor} stopOpacity={(selected ? 0.25 : 0.15) * coneOpacity} />
              <stop offset="100%" stopColor={boardColor} stopOpacity={0.03 * coneOpacity} />
            </radialGradient>
          </defs>
          <polygon
            points={`${svgCenter},${svgCenter} ${tipX1 + svgCenter},${tipY1 + svgCenter} ${tipX2 + svgCenter},${tipY2 + svgCenter}`}
            fill={`url(#board-cone-grad-${board.id})`}
            stroke={boardColor}
            strokeOpacity={(selected ? 0.5 : 0.25) * coneOpacity}
            strokeWidth={selected ? 1 : 0.5}
          />
        </svg>
      )}

      {/* Board rectangle + facing triangle */}
      <div
        className="pin-element relative cursor-pointer transition-transform duration-150 group-hover:scale-110"
        style={{ transform: `rotate(${board.facing_deg}deg)` }}
        onClick={onClick}
        onMouseDown={onMouseDown}
      >
        <div
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
        />
      </div>

      {/* Label + photo count */}
      <div
        className="absolute top-full mt-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap flex items-center gap-1"
        style={{ pointerEvents: 'none' }}
      >
        <span className="text-xs font-semibold text-gray-700 bg-white px-1.5 py-0.5 rounded shadow-sm border border-gray-100">
          {board.label}
        </span>
        {photoCount > 0 && (
          <span className="text-[10px] font-bold text-white bg-blue-500 rounded-full w-4 h-4 flex items-center justify-center shadow-sm">
            {photoCount}
          </span>
        )}
      </div>
    </div>
  )
}
