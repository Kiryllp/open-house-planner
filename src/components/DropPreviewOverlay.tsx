'use client'
/* eslint-disable @next/next/no-img-element */

import { forwardRef } from 'react'
import type { Photo } from '@/lib/types'

interface Props {
  photo: Photo | null
  dropping: boolean
}

/**
 * Preview overlay shown on the map while dragging a photo from the left pane.
 *
 * Scale behavior: this element lives inside TransformComponent's content div,
 * so it scales with map zoom — matching how real PhotoPins behave. A
 * fixed-screen-size preview would mismatch the placed pin at non-1x zoom.
 *
 * Position is driven by the parent (MapCanvas) writing directly to the
 * forwarded ref's style.left / style.top in a rAF loop, bypassing React
 * state to avoid per-frame re-renders during drag.
 *
 * Validity (inside vs outside the floorplan image) is communicated via the
 * data-valid attribute, also set by MapCanvas in the same rAF loop.
 */
export const DropPreviewOverlay = forwardRef<HTMLDivElement, Props>(
  function DropPreviewOverlay({ photo, dropping }, ref) {
    const color = photo?.color || '#3b82f6'

    return (
      <div
        ref={ref}
        className="drop-preview-root"
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
          animation: 'drop-appear 150ms ease-out both',
        }}
      >
        {/* Reticle ring — marks the exact landing point on the map surface */}
        <div
          className="drop-preview-reticle"
          style={{
            position: 'absolute',
            left: -13,
            top: -13,
            width: 26,
            height: 26,
            borderRadius: '50%',
            border: `1.5px solid ${color}`,
            opacity: 0.35,
            animation: 'drop-reticle-pulse 2s ease-in-out infinite',
          }}
        />

        {/* Shadow ellipse — sits on the map surface, stationary while pin bobs */}
        <div
          className="drop-preview-shadow"
          style={{
            position: 'absolute',
            left: -11,
            top: -2,
            width: 22,
            height: 6,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0.18)',
            filter: 'blur(3px)',
          }}
        />

        {/* Pin thumbnail — mirrors PhotoPin's img styling exactly */}
        {photo ? (
          <div
            className="drop-preview-pin"
            style={{
              position: 'absolute',
              left: -16,
              top: -16,
              width: 32,
              height: 32,
              animation: 'drop-bob 1.5s ease-in-out infinite',
            }}
          >
            <img
              src={photo.file_url}
              alt=""
              draggable={false}
              className="drop-preview-img"
              style={{
                width: 32,
                height: 32,
                borderRadius: 6,
                objectFit: 'cover',
                border: '2px solid white',
                outline: `2px solid ${color}`,
                boxShadow: `0 0 12px ${color}40, 0 2px 8px rgba(0,0,0,0.3)`,
              }}
            />
          </div>
        ) : (
          <div
            className="drop-preview-pin"
            style={{
              position: 'absolute',
              left: -14,
              top: -14,
              width: 28,
              height: 28,
              borderRadius: 8,
              background: 'white',
              border: '2px solid #3b82f6',
              boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'drop-bob 1.5s ease-in-out infinite',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1v12M1 7h12" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        )}

        <style>{`
          @keyframes drop-appear {
            from { opacity: 0; }
            to   { opacity: 1; }
          }
          @keyframes drop-bob {
            0%, 100% { transform: translateY(0) scale(1); }
            50%      { transform: translateY(-3px) scale(1.03); }
          }
          @keyframes drop-reticle-pulse {
            0%, 100% { transform: scale(1); opacity: 0.35; }
            50%      { transform: scale(1.2); opacity: 0.5; }
          }

          /* --- Dropping crossfade: pin settles + fades as real PhotoPin appears beneath --- */
          .drop-preview-root[data-dropping="true"] {
            transition: opacity 200ms ease-out;
            opacity: 0 !important;
            animation: none !important;
          }
          .drop-preview-root[data-dropping="true"] .drop-preview-pin {
            animation: none !important;
            transition: transform 200ms ease-out;
            transform: translateY(2px) scale(0.97) !important;
          }
          .drop-preview-root[data-dropping="true"] .drop-preview-reticle {
            animation: none !important;
            transition: opacity 200ms ease-out, transform 200ms ease-out;
            opacity: 0 !important;
            transform: scale(0.8) !important;
          }

          /* --- Invalid zone: outside the floorplan image bounds --- */
          .drop-preview-root[data-valid="false"] .drop-preview-img {
            opacity: 0.4;
            outline-color: #ef4444 !important;
          }
          .drop-preview-root[data-valid="false"] .drop-preview-reticle {
            border-color: #ef4444 !important;
            opacity: 0.5;
          }
          .drop-preview-root[data-valid="false"] .drop-preview-shadow {
            opacity: 0.08;
          }
        `}</style>
      </div>
    )
  },
)
