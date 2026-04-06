'use client'

import type { Board } from '@/lib/types'

interface BoardPinProps {
  board: Board
  selected: boolean
  dimmed: boolean
  highlighted: boolean
  photoCount: number
  onClick: (e: React.MouseEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
}

export function BoardPin({ board, selected, dimmed, highlighted, photoCount, onClick, onMouseDown }: BoardPinProps) {
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
      {/* Board rectangle + facing triangle */}
      <div
        className="relative cursor-pointer transition-transform duration-150 group-hover:scale-110"
        style={{ transform: `rotate(${board.facing_deg}deg)` }}
        onClick={onClick}
        onMouseDown={onMouseDown}
      >
        <div
          style={{
            width: 28,
            height: 16,
            backgroundColor: '#4b5563',
            borderRadius: 3,
            border: selected ? '2px solid white' : '1px solid #6b7280',
            boxShadow: selected
              ? '0 0 0 2px #4b5563, 0 0 10px rgba(75,85,99,0.4), 0 2px 8px rgba(0,0,0,0.3)'
              : '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
        {/* Facing triangle */}
        <div
          style={{
            position: 'absolute',
            right: -7,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '5px solid transparent',
            borderBottom: '5px solid transparent',
            borderLeft: '7px solid #4b5563',
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
