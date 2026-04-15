'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Photo } from '@/lib/types'

interface Props {
  photo: Photo
}

/**
 * Viewport-level floating pin thumbnail that follows the cursor everywhere
 * during an HTML5 drag. Renders via portal to document.body at position: fixed
 * so it's independent of map zoom/pan or any parent transforms.
 *
 * Position is driven by a capture-phase `dragover` listener on `window`,
 * written to the DOM via rAF — zero React re-renders during movement.
 */
export function DragGhost({ photo }: Props) {
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
      {/* Pin thumbnail — centered on cursor, bob creates the float feel */}
      <div
        style={{
          position: 'absolute',
          left: -16,
          top: -16,
          width: 32,
          height: 32,
          animation: 'dg-bob 1.6s ease-in-out infinite',
        }}
      >
        <img
          src={photo.file_url}
          alt=""
          draggable={false}
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            objectFit: 'cover',
            border: '2px solid white',
            outline: `2px solid ${color}`,
            boxShadow: `0 0 20px ${color}50, 0 8px 24px rgba(0,0,0,0.4)`,
          }}
        />
      </div>

      <style>{`
        @keyframes dg-bob {
          0%, 100% { transform: translateY(0) scale(1); }
          50%      { transform: translateY(-6px) scale(1.04); }
        }
      `}</style>
    </div>,
    document.body,
  )
}
