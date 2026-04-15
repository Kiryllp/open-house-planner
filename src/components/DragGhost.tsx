'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Photo } from '@/lib/types'

interface Props {
  photo: Photo
  dropping?: boolean
}

/**
 * Viewport-level teardrop map-pin that follows the cursor during an HTML5 drag.
 * The pointed tail sits at the cursor position so the exact drop pixel is
 * unambiguous. Renders via portal to document.body at position: fixed.
 *
 * Position is driven by a capture-phase `dragover` listener on `window`,
 * written to the DOM via rAF — zero React re-renders during movement.
 */
export function DragGhost({ photo, dropping }: Props) {
  const ghostRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    let appeared = false

    const onDragOver = (e: DragEvent) => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const el = ghostRef.current
        if (!el) return
        el.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
        if (!appeared) {
          appeared = true
          el.style.opacity = '1'
        }
      })
    }

    window.addEventListener('dragover', onDragOver, true)
    return () => {
      window.removeEventListener('dragover', onDragOver, true)
      cancelAnimationFrame(rafRef.current)
    }
  }, [])

  const color = photo.color || (photo.type === 'real' ? '#3b82f6' : '#a855f7')

  if (typeof document === 'undefined') return null

  return createPortal(
    <div
      ref={ghostRef}
      data-dropping={dropping || false}
      style={{
        position: 'fixed',
        left: 0,
        top: 0,
        zIndex: 99999,
        pointerEvents: 'none',
        willChange: 'transform',
        opacity: 0,
        transition: 'opacity 180ms ease-out',
      }}
    >
      {/* Shadow at tip point — tight oval on the "surface" beneath the pin */}
      <div
        className="dg-shadow"
        style={{
          position: 'absolute',
          left: -8,
          top: -4,
          width: 16,
          height: 8,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.35)',
          filter: 'blur(3px)',
          animation: 'dg-shadow-breathe 1.6s ease-in-out infinite',
        }}
      />

      {/* Pin assembly — teardrop shape, tip anchored at (0,0) = cursor */}
      <div
        className="dg-pin"
        style={{
          position: 'absolute',
          left: -20,
          top: -52,
          width: 40,
          animation: 'dg-bob 1.6s ease-in-out infinite',
        }}
      >
        {/* Circular head with photo */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: '50%',
            border: `3px solid ${color}`,
            background: 'white',
            overflow: 'hidden',
            boxShadow: `0 0 16px ${color}40, 0 4px 12px rgba(0,0,0,0.3)`,
          }}
        >
          <img
            src={photo.file_url}
            alt=""
            draggable={false}
            style={{
              width: 34,
              height: 34,
              objectFit: 'cover',
              borderRadius: '50%',
              display: 'block',
            }}
          />
        </div>

        {/* Pointed tail — CSS triangle */}
        <div
          style={{
            width: 0,
            height: 0,
            margin: '-2px auto 0',
            borderLeft: '9px solid transparent',
            borderRight: '9px solid transparent',
            borderTop: `14px solid ${color}`,
          }}
        />
      </div>

      <style>{`
        @keyframes dg-bob {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-5px) scale(1.03); }
        }
        @keyframes dg-shadow-breathe {
          0%, 100% { opacity: 0.35; transform: scaleX(1); }
          50%      { opacity: 0.18; transform: scaleX(1.4); }
        }

        /* Settle on drop: pin drops down, shrinks, fades */
        [data-dropping="true"] {
          transition: opacity 200ms ease-out !important;
          opacity: 0 !important;
        }
        [data-dropping="true"] .dg-pin {
          animation: none !important;
          transition: transform 200ms ease-out;
          transform: translateY(4px) scale(0.95) !important;
        }
        [data-dropping="true"] .dg-shadow {
          animation: none !important;
          transition: opacity 200ms ease-out;
          opacity: 0 !important;
        }
      `}</style>
    </div>,
    document.body,
  )
}
