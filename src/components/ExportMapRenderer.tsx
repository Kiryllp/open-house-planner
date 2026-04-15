'use client'

import { forwardRef } from 'react'
import type { Photo } from '@/lib/types'

interface Props {
  floorplanUrl: string | null
  photos: Photo[]
}

/**
 * Hidden off-screen renderer that draws the floorplan with numbered pins.
 * Captured to PNG via html-to-image during export.
 */
export const ExportMapRenderer = forwardRef<HTMLDivElement, Props>(
  function ExportMapRenderer({ floorplanUrl, photos }, ref) {
    return (
      <div
        ref={ref}
        style={{
          position: 'fixed',
          left: '-9999px',
          top: 0,
          width: 1600,
          height: 1067, // 3:2 aspect
          background: '#fff',
          overflow: 'hidden',
        }}
      >
        {floorplanUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={floorplanUrl}
            alt=""
            crossOrigin="anonymous"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
            }}
          />
        )}
        {photos.map((photo, i) =>
          photo.pin_x == null || photo.pin_y == null ? null : (
            <ExportPin key={photo.id} photo={photo} index={i + 1} />
          ),
        )}
      </div>
    )
  },
)

function ExportPin({ photo, index }: { photo: Photo; index: number }) {
  const color = photo.color || '#a855f7'
  const dirRad = (photo.direction_deg - 90) * (Math.PI / 180)
  const halfFov = (photo.fov_deg / 2) * (Math.PI / 180)
  const len = 60
  const tipX1 = Math.cos(dirRad - halfFov) * len
  const tipY1 = Math.sin(dirRad - halfFov) * len
  const tipX2 = Math.cos(dirRad + halfFov) * len
  const tipY2 = Math.sin(dirRad + halfFov) * len
  const svgSize = len * 2 + 40
  const svgCenter = len + 20

  return (
    <div
      style={{
        position: 'absolute',
        left: `${photo.pin_x}%`,
        top: `${photo.pin_y}%`,
        transform: 'translate(-50%, -50%)',
      }}
    >
      <svg
        width={svgSize}
        height={svgSize}
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: 'translate(-50%, -50%)',
          overflow: 'visible',
        }}
      >
        <polygon
          points={`${svgCenter},${svgCenter} ${tipX1 + svgCenter},${tipY1 + svgCenter} ${tipX2 + svgCenter},${tipY2 + svgCenter}`}
          fill={color}
          fillOpacity={0.25}
          stroke={color}
          strokeWidth={2}
          strokeOpacity={0.8}
        />
      </svg>
      <div
        style={{
          position: 'relative',
          width: 24,
          height: 24,
          borderRadius: '50%',
          backgroundColor: color,
          border: '3px solid white',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 700,
          color: '#fff',
        }}
      >
        {index}
      </div>
    </div>
  )
}
