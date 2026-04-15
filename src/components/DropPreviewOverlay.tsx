'use client'

import { forwardRef } from 'react'
import type { Photo } from '@/lib/types'

interface Props {
  photo: Photo | null
  dropping: boolean
}

/**
 * Landing indicator shown on the map surface while dragging a photo.
 * Shows a reticle, ground shadow, and colored glow at the exact landing
 * point — the pin thumbnail itself follows the cursor via DragGhost.
 *
 * Lives inside TransformComponent content so it scales with map zoom.
 * Position is driven by MapCanvas via the forwarded ref (rAF writes to
 * style.left / style.top). Validity is communicated via data-valid.
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
        {/* Colored glow: soft light pool on the map surface */}
        <div
          className="dp-glow"
          style={{
            position: 'absolute',
            left: -30,
            top: -30,
            width: 60,
            height: 60,
            borderRadius: '50%',
            background: `radial-gradient(circle, ${color}25 0%, ${color}0a 50%, transparent 72%)`,
            animation: 'dp-glow-pulse 2s ease-in-out infinite',
          }}
        />

        {/* Ground shadow: where the pin will rest */}
        <div
          className="dp-shadow"
          style={{
            position: 'absolute',
            left: -16,
            top: -4,
            width: 32,
            height: 10,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.2)',
            filter: 'blur(5px)',
            animation: 'dp-shadow-breathe 1.6s ease-in-out infinite',
          }}
        />

        {/* Reticle ring: dashed circle marking the landing zone */}
        <div
          className="dp-reticle"
          style={{
            position: 'absolute',
            left: -15,
            top: -15,
            width: 30,
            height: 30,
            borderRadius: '50%',
            border: `1.5px dashed ${color}`,
            opacity: 0.5,
            animation: 'dp-reticle-pulse 2s ease-in-out infinite',
          }}
        />

        {/* Center dot: exact drop point */}
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
            opacity: 0.6,
          }}
        />

        <style>{`
          @keyframes dp-appear {
            from { opacity: 0; transform: scale(0.6); }
            to   { opacity: 1; transform: scale(1); }
          }
          @keyframes dp-glow-pulse {
            0%, 100% { transform: scale(1); opacity: 0.8; }
            50%      { transform: scale(1.1); opacity: 1; }
          }
          @keyframes dp-shadow-breathe {
            0%, 100% { transform: scaleX(1); opacity: 0.2; }
            50%      { transform: scaleX(1.25); opacity: 0.12; }
          }
          @keyframes dp-reticle-pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50%      { transform: scale(1.12); opacity: 0.7; }
          }

          /* --- Dropping: fade out as real pin appears --- */
          .dp-root[data-dropping="true"] {
            transition: opacity 220ms ease-out;
            opacity: 0 !important;
            animation: none !important;
          }
          .dp-root[data-dropping="true"] .dp-reticle,
          .dp-root[data-dropping="true"] .dp-dot {
            animation: none !important;
            transition: opacity 180ms ease-out, transform 180ms ease-out;
            opacity: 0 !important;
            transform: scale(0.7) !important;
          }
          .dp-root[data-dropping="true"] .dp-shadow,
          .dp-root[data-dropping="true"] .dp-glow {
            animation: none !important;
            transition: opacity 180ms ease-out;
            opacity: 0 !important;
          }

          /* --- Invalid zone: outside floorplan image bounds --- */
          .dp-root[data-valid="false"] .dp-reticle {
            border-color: #ef4444 !important;
            opacity: 0.6 !important;
          }
          .dp-root[data-valid="false"] .dp-dot {
            background-color: #ef4444 !important;
          }
          .dp-root[data-valid="false"] .dp-glow {
            opacity: 0 !important;
          }
          .dp-root[data-valid="false"] .dp-shadow {
            opacity: 0.06 !important;
          }
        `}</style>
      </div>
    )
  },
)
