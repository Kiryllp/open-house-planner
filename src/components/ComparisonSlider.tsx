'use client'
/* eslint-disable @next/next/no-img-element */

import { useCallback, useRef, useState } from 'react'
import type { Photo } from '@/lib/types'

interface ComparisonSliderProps {
  leftPhoto: Photo
  rightPhoto: Photo
  onExpand?: (photo: Photo) => void
}

export function ComparisonSlider({ leftPhoto, rightPhoto, onExpand }: ComparisonSliderProps) {
  const [position, setPosition] = useState(50)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const updatePosition = useCallback((clientX: number) => {
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const x = clientX - rect.left
    const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
    setPosition(pct)
  }, [])

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    dragging.current = true

    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX
    updatePosition(clientX)

    function onMove(ev: MouseEvent | TouchEvent) {
      if (!dragging.current) return
      const cx = 'touches' in ev ? ev.touches[0].clientX : (ev as MouseEvent).clientX
      updatePosition(cx)
    }

    function onUp() {
      dragging.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove)
    window.addEventListener('touchend', onUp)
  }, [updatePosition])

  return (
    <div
      ref={containerRef}
      className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-gray-100 select-none"
    >
      {/* Left (real) photo - full background */}
      <img
        src={leftPhoto.file_url}
        alt="Real photo"
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        onClick={() => onExpand?.(leftPhoto)}
      />

      {/* Right (concept) photo - clipped overlay */}
      <img
        src={rightPhoto.file_url}
        alt="Concept photo"
        loading="lazy"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        onClick={() => onExpand?.(rightPhoto)}
      />

      {/* Draggable handle */}
      <div
        className="absolute top-0 h-full"
        style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
        onMouseDown={handlePointerDown}
        onTouchStart={handlePointerDown}
      >
        <div className="h-full w-[2px] bg-white shadow-sm" />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 cursor-grab items-center justify-center rounded-full border-2 border-white bg-white/90 shadow-md active:cursor-grabbing">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" className="text-gray-500">
            <path d="M4 1L1 6L4 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 1L11 6L8 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <span className="absolute left-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
        Real
      </span>
      <span className="absolute right-2 top-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium text-white">
        Concept
      </span>
    </div>
  )
}
