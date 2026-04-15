'use client'

interface Props {
  xPct: number | null
  yPct: number | null
}

/**
 * Ghost pin rendered on the map while the user drags a photo from the
 * left pane. Mirrors the look of the real PhotoPin circle.
 */
export function DropPreviewOverlay({ xPct, yPct }: Props) {
  if (xPct == null || yPct == null) return null
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: 'translate(-50%, -50%)',
        zIndex: 30,
      }}
    >
      <div
        className="h-5 w-5 animate-pulse rounded-full border-2 border-white bg-blue-500 shadow-lg"
        style={{ boxShadow: '0 0 0 2px #3b82f6, 0 0 12px rgba(59,130,246,0.4)' }}
      />
    </div>
  )
}
