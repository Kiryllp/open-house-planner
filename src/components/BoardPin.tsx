'use client'

import type { Board } from '@/lib/types'

interface BoardPinProps {
  board: Board
  selected: boolean
  dimmed: boolean
  onClick: (e: React.MouseEvent) => void
  onMouseDown: (e: React.MouseEvent) => void
}

export function BoardPin({ board, selected, dimmed, onClick, onMouseDown }: BoardPinProps) {
  const facingRad = board.facing_deg * (Math.PI / 180)

  return (
    <div
      className="absolute"
      style={{
        left: `${board.pin_x}%`,
        top: `${board.pin_y}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: selected ? 20 : 10,
        opacity: dimmed ? 0.4 : 1,
        pointerEvents: 'auto',
      }}
      data-pin-id={board.id}
      data-pin-kind="board"
    >
      {/* Board rectangle + facing triangle */}
      <div
        className="relative cursor-pointer"
        style={{ transform: `rotate(${board.facing_deg}deg)` }}
        onClick={onClick}
        onMouseDown={onMouseDown}
      >
        <div
          style={{
            width: 24,
            height: 14,
            backgroundColor: '#4b5563',
            borderRadius: 2,
            border: selected ? '2px solid white' : '1px solid #6b7280',
            boxShadow: selected
              ? '0 0 0 2px #4b5563, 0 2px 8px rgba(0,0,0,0.3)'
              : '0 1px 3px rgba(0,0,0,0.2)',
          }}
        />
        {/* Facing triangle on the "front" (right) edge */}
        <div
          style={{
            position: 'absolute',
            right: -6,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 0,
            height: 0,
            borderTop: '4px solid transparent',
            borderBottom: '4px solid transparent',
            borderLeft: '6px solid #4b5563',
          }}
        />
      </div>

      {/* Label */}
      <div
        className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-medium text-gray-700 bg-white/80 px-1 rounded"
        style={{ pointerEvents: 'none' }}
      >
        {board.label}
      </div>
    </div>
  )
}
