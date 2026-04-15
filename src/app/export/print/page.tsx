/* eslint-disable @next/next/no-img-element */
import { createClient } from '@/lib/supabase/server'
import type { Photo } from '@/lib/types'
import { PrintAutoTrigger } from './PrintAutoTrigger'

export const dynamic = 'force-dynamic'

/**
 * Print-friendly view of the map with every placed concept pin.
 *
 * Opened in a new tab from the main UI. The user hits "Print Map" → this
 * page loads → once the floorplan image has loaded, <PrintAutoTrigger>
 * calls window.print(). The browser's native print dialog handles PDF
 * export or sending to a physical printer, so we stay fully vector (no
 * rasterization step, no headless Chrome).
 */
export default async function PrintPage() {
  const floorplan = process.env.NEXT_PUBLIC_FLOORPLAN_URL ?? ''

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('photos')
    .select('*')
    .is('deleted_at', null)
    .eq('type', 'concept')
    .not('pin_x', 'is', null)
    .order('created_at', { ascending: true })

  if (error) {
    return (
      <div style={{ padding: 32, fontFamily: 'sans-serif', color: 'red' }}>
        Print page query failed: {error.message}
      </div>
    )
  }

  const photos = (data ?? []) as Photo[]

  return (
    <>
      {/* Print-friendly styling: landscape letter, zero margins, hide
          scrollbars, force backgrounds to print. */}
      <style>{`
        @page { size: landscape; margin: 0.4in; }
        html, body { margin: 0; padding: 0; background: #fff; }
        body {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .print-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 12px 20px;
          background: #f9fafb;
          border-bottom: 1px solid #e5e7eb;
          font-size: 13px;
        }
        .print-toolbar button {
          background: #2563eb;
          color: white;
          border: none;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 13px;
          cursor: pointer;
        }
        .print-surface {
          position: relative;
          width: 100%;
          aspect-ratio: 3 / 2;
          max-height: calc(100vh - 60px);
          background-size: contain;
          background-repeat: no-repeat;
          background-position: center;
          background-color: #ffffff;
        }
        @media print {
          .print-toolbar { display: none; }
          .print-surface {
            width: 100%;
            max-height: none;
            height: 100vh;
          }
        }
      `}</style>

      <div className="print-toolbar">
        <div>
          <strong>Open House Planner</strong>
          <span style={{ marginLeft: 12, color: '#6b7280' }}>
            {photos.length} placed photos
          </span>
        </div>
        <button type="button" onClick={undefined}>
          Print
        </button>
      </div>

      <div
        className="print-surface"
        style={{
          backgroundImage: floorplan ? `url(${floorplan})` : undefined,
        }}
      >
        {photos.map((photo) =>
          photo.pin_x == null || photo.pin_y == null ? null : (
            <PrintPin key={photo.id} photo={photo} />
          ),
        )}
      </div>

      <PrintAutoTrigger floorplanUrl={floorplan} />
    </>
  )
}

function PrintPin({ photo }: { photo: Photo }) {
  const color = photo.color || '#a855f7'
  const dirRad = (photo.direction_deg - 90) * (Math.PI / 180)
  const halfFov = (photo.fov_deg / 2) * (Math.PI / 180)
  const len = 80 // px at rendered size; cone is purely visual
  const tipX1 = Math.cos(dirRad - halfFov) * len
  const tipY1 = Math.sin(dirRad - halfFov) * len
  const tipX2 = Math.cos(dirRad + halfFov) * len
  const tipY2 = Math.sin(dirRad + halfFov) * len
  const svgSize = len * 2 + 40
  const svgCenter = len + 20
  const gradId = `gc-${photo.id}`

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
        <defs>
          <radialGradient id={gradId} cx="0%" cy="0%" r="100%">
            <stop offset="0%" stopColor={color} stopOpacity={0.45} />
            <stop offset="100%" stopColor={color} stopOpacity={0.05} />
          </radialGradient>
        </defs>
        <polygon
          points={`${svgCenter},${svgCenter} ${tipX1 + svgCenter},${tipY1 + svgCenter} ${tipX2 + svgCenter},${tipY2 + svgCenter}`}
          fill={`url(#${gradId})`}
          stroke={color}
          strokeWidth={2}
          strokeOpacity={0.8}
        />
      </svg>
      <div
        style={{
          position: 'relative',
          width: 20,
          height: 20,
          borderRadius: '50%',
          backgroundColor: color,
          border: '3px solid white',
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}
      />
      {photo.zone && (
        <div
          style={{
            position: 'absolute',
            top: 26,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(255,255,255,0.95)',
            border: `1px solid ${color}`,
            padding: '1px 5px',
            borderRadius: 3,
            fontSize: 10,
            color: '#333',
            whiteSpace: 'nowrap',
          }}
        >
          Z{photo.zone}
        </div>
      )}
    </div>
  )
}
