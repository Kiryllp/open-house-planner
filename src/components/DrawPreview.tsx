'use client'

interface DrawPreviewProps {
  mode: 'none' | 'text' | 'rectangle' | 'polygon'
  points: { x: number; y: number }[]
  mousePos: { x: number; y: number } | null
  color: string
  fillOpacity: number
}

export function DrawPreview({ mode, points, mousePos, color, fillOpacity }: DrawPreviewProps) {
  if (mode === 'none' || !mousePos) return null

  // Rectangle preview: first point placed, show dashed rect to mouse
  if (mode === 'rectangle' && points.length === 1) {
    const [p1] = points
    const x = Math.min(p1.x, mousePos.x)
    const y = Math.min(p1.y, mousePos.y)
    const w = Math.abs(mousePos.x - p1.x)
    const h = Math.abs(mousePos.y - p1.y)

    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 6 }}
        viewBox="0 0 100 100" preserveAspectRatio="none">
        <rect
          x={x} y={y} width={w} height={h}
          fill={color} fillOpacity={fillOpacity * 0.5}
          stroke={color} strokeWidth={0.15}
          strokeDasharray="0.5 0.3" strokeOpacity={0.8}
        />
        {/* Corner markers */}
        <circle cx={p1.x} cy={p1.y} r={0.4} fill={color} />
        <circle cx={mousePos.x} cy={mousePos.y} r={0.4} fill={color} />
      </svg>
    )
  }

  // Polygon preview: show accumulated points + line to mouse
  if (mode === 'polygon' && points.length >= 1) {
    const allPoints = [...points, mousePos]
    const pathD = allPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
    // If 3+ points, also show closing line from mouse to first point
    const closePath = points.length >= 2 ? ` L ${points[0].x} ${points[0].y}` : ''

    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 6 }}
        viewBox="0 0 100 100" preserveAspectRatio="none">
        <path
          d={pathD + closePath}
          fill={points.length >= 2 ? color : 'none'}
          fillOpacity={points.length >= 2 ? fillOpacity * 0.3 : 0}
          stroke={color} strokeWidth={0.15}
          strokeDasharray="0.5 0.3" strokeOpacity={0.8}
          fillRule="evenodd"
        />
        {/* Point markers */}
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={0.4} fill={color} />
        ))}
        <circle cx={mousePos.x} cy={mousePos.y} r={0.3} fill={color} fillOpacity={0.5} />
      </svg>
    )
  }

  // Text mode: show a crosshair at mouse position
  if (mode === 'text') {
    return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ zIndex: 6 }}
        viewBox="0 0 100 100" preserveAspectRatio="none">
        <line x1={mousePos.x - 1} y1={mousePos.y} x2={mousePos.x + 1} y2={mousePos.y}
          stroke={color} strokeWidth={0.1} strokeOpacity={0.6} />
        <line x1={mousePos.x} y1={mousePos.y - 1} x2={mousePos.x} y2={mousePos.y + 1}
          stroke={color} strokeWidth={0.1} strokeOpacity={0.6} />
      </svg>
    )
  }

  return null
}
