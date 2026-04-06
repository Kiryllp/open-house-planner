'use client'
import type { Annotation } from '@/lib/types'

interface AnnotationLayerProps {
  annotations: Annotation[]
  selectedId: string | null
  onSelect: (id: string) => void
  visible: boolean
}

export function AnnotationLayer({ annotations, selectedId, onSelect, visible }: AnnotationLayerProps) {
  if (!visible) return null

  const activeAnnotations = annotations.filter(a => !a.deleted_at)

  function centroid(points: { x: number; y: number }[]) {
    const cx = points.reduce((s, p) => s + p.x, 0) / points.length
    const cy = points.reduce((s, p) => s + p.y, 0) / points.length
    return { x: cx, y: cy }
  }

  return (
    <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 4 }}>
      {activeAnnotations.map(a => {
        const isSelected = a.id === selectedId
        const strokeWidth = isSelected ? a.stroke_width + 1 : a.stroke_width

        if (a.type === 'text' && a.points[0]) {
          return (
            <text
              key={a.id}
              x={`${a.points[0].x}%`}
              y={`${a.points[0].y}%`}
              fill={a.color}
              fontSize={14}
              fontWeight={600}
              className="pointer-events-auto cursor-pointer select-none"
              onClick={(e) => { e.stopPropagation(); onSelect(a.id) }}
              style={{ filter: isSelected ? 'drop-shadow(0 0 3px rgba(59,130,246,0.8))' : undefined }}
            >
              {a.label}
            </text>
          )
        }

        if (a.type === 'rectangle' && a.points.length >= 2) {
          const [p1, p2] = a.points
          const x = Math.min(p1.x, p2.x)
          const y = Math.min(p1.y, p2.y)
          const w = Math.abs(p2.x - p1.x)
          const h = Math.abs(p2.y - p1.y)
          const center = { x: x + w / 2, y: y + h / 2 }
          return (
            <g key={a.id}>
              <rect
                x={`${x}%`} y={`${y}%`} width={`${w}%`} height={`${h}%`}
                fill={a.color} fillOpacity={a.fill_opacity}
                stroke={a.color} strokeWidth={strokeWidth} strokeOpacity={0.8}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onSelect(a.id) }}
                style={{ filter: isSelected ? 'drop-shadow(0 0 3px rgba(59,130,246,0.8))' : undefined }}
              />
              {a.label && (
                <text x={`${center.x}%`} y={`${center.y}%`} textAnchor="middle" dominantBaseline="central"
                  fill={a.color} fontSize={12} fontWeight={600} className="pointer-events-none select-none" fillOpacity={0.9}>
                  {a.label}
                </text>
              )}
            </g>
          )
        }

        if (a.type === 'polygon' && a.points.length >= 3) {
          const center = centroid(a.points)
          const pathD = a.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ') + ' Z'
          return (
            <svg key={a.id} viewBox="0 0 100 100" preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 4 }}>
              <path
                d={pathD}
                fill={a.color} fillOpacity={a.fill_opacity}
                stroke={a.color} strokeWidth={strokeWidth * 0.15} strokeOpacity={0.8}
                className="pointer-events-auto cursor-pointer"
                onClick={(e) => { e.stopPropagation(); onSelect(a.id) }}
                style={{ filter: isSelected ? 'drop-shadow(0 0 3px rgba(59,130,246,0.8))' : undefined }}
              />
              {a.label && (
                <text x={center.x} y={center.y} textAnchor="middle" dominantBaseline="central"
                  fill={a.color} fontSize={1.5} fontWeight={600} className="pointer-events-none select-none" fillOpacity={0.9}>
                  {a.label}
                </text>
              )}
            </svg>
          )
        }

        return null
      })}
    </svg>
  )
}
