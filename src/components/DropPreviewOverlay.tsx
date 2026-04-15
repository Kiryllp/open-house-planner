'use client'

interface Props {
  xPct: number | null
  yPct: number | null
}

/**
 * Pegman-style person icon shown on the map while dragging a photo
 * from the left pane, similar to Google Maps' street view drag effect.
 */
export function DropPreviewOverlay({ xPct, yPct }: Props) {
  if (xPct == null || yPct == null) return null
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${xPct}%`,
        top: `${yPct}%`,
        transform: 'translate(-50%, -100%)',
        zIndex: 30,
        filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.3))',
        animation: 'pegman-bounce 0.6s ease-in-out infinite alternate',
      }}
    >
      <svg width="28" height="40" viewBox="0 0 28 40" fill="none">
        {/* Head */}
        <circle cx="14" cy="8" r="6" fill="#4285F4" />
        {/* Body */}
        <path
          d="M7 16 C7 12, 21 12, 21 16 L21 28 C21 29, 20 30, 19 30 L9 30 C8 30, 7 29, 7 28 Z"
          fill="#4285F4"
        />
        {/* Arms */}
        <path d="M7 17 L3 24" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" />
        <path d="M21 17 L25 24" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" />
        {/* Legs */}
        <path d="M11 30 L9 38" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" />
        <path d="M17 30 L19 38" stroke="#4285F4" strokeWidth="3" strokeLinecap="round" />
        {/* Face dot */}
        <circle cx="14" cy="8" r="2.5" fill="white" />
      </svg>
      <style>{`
        @keyframes pegman-bounce {
          from { transform: translateY(0); }
          to { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  )
}
