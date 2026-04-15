'use client'

interface Props {
  xPct: number | null
  yPct: number | null
}

/**
 * Drop-preview indicator shown on the map while dragging a photo from the
 * left pane. Renders a clean pin marker with a pulsing shadow ring.
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
      <div style={{ animation: 'drop-pulse 1.2s ease-in-out infinite' }}>
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(59,130,246,0.35) 0%, rgba(59,130,246,0.08) 60%, transparent 70%)',
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
              backgroundColor: '#3b82f6',
              border: '2px solid white',
              boxShadow: '0 1px 6px rgba(0,0,0,0.25)',
            }}
          />
        </div>
      </div>
      <style>{`
        @keyframes drop-pulse {
          0%, 100% { transform: scale(1); opacity: 0.9; }
          50% { transform: scale(1.3); opacity: 1; }
        }
      `}</style>
    </div>
  )
}
