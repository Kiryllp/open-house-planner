'use client'

import { forwardRef } from 'react'
import type { Photo } from '@/lib/types'

interface Props {
  photo: Photo | null
  dropping: boolean
}

/**
 * Landing indicator on the map surface: a filled colored target circle with
 * an expanding pulse ring and center dot. Unmistakable "the pin goes HERE."
 *
 * Lives inside TransformComponent content so it scales with map zoom.
 * Position is driven by MapCanvas via the forwarded ref (rAF writes to
 * style.left / style.top). Validity via data-valid attribute.
 */
export const DropPreviewOverlay = forwardRef<HTMLDivElement, Props>(
  function DropPreviewOverlay({ photo, dropping }, ref) {
    const color = photo
      ? (photo.color || (photo.type === 'real' ? '#3b82f6' : '#a855f7'))
      : '#3b82f6'

    return (
      <div
        ref={ref}
        className="dp-root"
        data-dropping={dropping}
        data-valid="true"
        style={{
          position: 'absolute',
          zIndex: 30,
          transform: 'translate(-50%, -50%)',
          width: 0,
          height: 0,
          overflow: 'visible',
          pointerEvents: 'none',
          animation: 'dp-appear 200ms ease-out both',
        }}
      >
        {/* Filled target zone — colored spotlight on the map */}
        <div
          className="dp-target"
          style={{
            position: 'absolute',
            left: -22,
            top: -22,
            width: 44,
            height: 44,
            borderRadius: '50%',
            background: `${color}18`,
            border: `2px solid ${color}55`,
          }}
        />

        {/* Expanding pulse ring — radiates outward from drop point */}
        <div
          className="dp-pulse"
          style={{
            position: 'absolute',
            left: -22,
            top: -22,
            width: 44,
            height: 44,
            borderRadius: '50%',
            border: `2px solid ${color}`,
            opacity: 0.6,
            animation: 'dp-ring-expand 1.4s ease-out infinite',
          }}
        />

        {/* Center dot — the exact pixel */}
        <div
          className="dp-dot"
          style={{
            position: 'absolute',
            left: -3,
            top: -3,
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: color,
            opacity: 0.85,
          }}
        />

        <style>{`
          @keyframes dp-appear {
            from { opacity: 0; transform: scale(0.5); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes dp-ring-expand {
            0%   { transform: scale(1); opacity: 0.6; }
            100% { transform: scale(1.5); opacity: 0; }
          }

          /* --- Dropping: fade out as real pin appears --- */
          .dp-root[data-dropping="true"] {
            transition: opacity 200ms ease-out;
            opacity: 0 !important;
            animation: none !important;
          }
          .dp-root[data-dropping="true"] .dp-pulse {
            animation: none !important;
          }

          /* --- Invalid zone: outside floorplan image bounds --- */
          .dp-root[data-valid="false"] .dp-target {
            background: rgba(239,68,68,0.1) !important;
            border-color: rgba(239,68,68,0.4) !important;
          }
          .dp-root[data-valid="false"] .dp-pulse {
            border-color: #ef4444 !important;
          }
          .dp-root[data-valid="false"] .dp-dot {
            background-color: #ef4444 !important;
          }
        `}</style>
      </div>
    )
  },
)
