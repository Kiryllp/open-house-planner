import type { Photo } from './types'
import {
  fitImageInBox,
  layoutMapPins,
  type PinRenderData,
  type Rect,
} from './pinGeometry'

/**
 * Canvas-based map renderer.
 *
 * This is the structural fix for the "canvas taint from cached floorplan"
 * bug documented in Plan 3. The previous export used `html-to-image`,
 * which relied on the browser's `<img>` cache and could silently produce
 * a blank PNG when the floorplan had been cached without CORS headers by
 * `MapCanvas` (which loads it as a CSS background without `useCORS`).
 *
 * We avoid every one of those failure modes by:
 *   1. Fetching the floorplan as a Blob (`fetch` is CORS-strict — if the
 *      server doesn't grant us the bytes, we get a network error, not a
 *      silently tainted canvas),
 *   2. Decoding the blob with `createImageBitmap`, which never consults
 *      the `<img>` cache, and
 *   3. Drawing everything ourselves with plain `CanvasRenderingContext2D`
 *      calls — no DOM serialization, no offscreen HTML, no html-to-image.
 */

export interface RenderedMap {
  blob: Blob
  width: number
  height: number
  floorplanBounds: Rect
  pins: PinRenderData[]
}

export interface RenderMapOptions {
  floorplanUrl: string | null
  photos: Photo[]
  width?: number
  height?: number
  signal?: AbortSignal
}

const DEFAULT_WIDTH = 2000
const DEFAULT_HEIGHT = 1400

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

/**
 * Make a 2D canvas that works both in the main thread and in any future
 * worker. We prefer `OffscreenCanvas` where available because it doesn't
 * touch the DOM, but fall back to a detached `<canvas>` element for
 * slightly older browsers. Both expose the same `getContext('2d')` API.
 */
function createCanvas(
  width: number,
  height: number,
): {
  canvas: OffscreenCanvas | HTMLCanvasElement
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
} {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')
    return { canvas, ctx }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  return { canvas, ctx }
}

/** Normalize whatever the canvas gives us into a PNG blob. */
async function canvasToPngBlob(
  canvas: OffscreenCanvas | HTMLCanvasElement,
): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/png' })
  }
  return new Promise((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('canvas.toBlob returned null'))
    }, 'image/png')
  })
}

async function loadFloorplanBitmap(
  url: string,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Floorplan fetch failed: HTTP ${res.status}`)
  }
  const blob = await res.blob()
  throwIfAborted(signal)
  return createImageBitmap(blob)
}

function drawCone(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pin: PinRenderData,
): void {
  const [[cx, cy], [x1, y1], [x2, y2]] = pin.cone
  ctx.save()
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(x1, y1)
  ctx.lineTo(x2, y2)
  ctx.closePath()
  ctx.fillStyle = pin.color
  ctx.globalAlpha = 0.22
  ctx.fill()
  ctx.globalAlpha = 0.85
  ctx.lineWidth = 2
  ctx.strokeStyle = pin.color
  ctx.stroke()
  ctx.restore()
}

function drawPinBadge(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pin: PinRenderData,
): void {
  const radius = 18
  ctx.save()

  // Drop shadow under the badge.
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2

  // White outer ring.
  ctx.beginPath()
  ctx.arc(pin.cx, pin.cy, radius + 3, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Clear shadow for inner draws so the number stays crisp.
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Colored fill.
  ctx.beginPath()
  ctx.arc(pin.cx, pin.cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = pin.color
  ctx.fill()

  // Index number.
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(pin.label, pin.cx, pin.cy + 1)

  ctx.restore()
}

export async function renderMapToPng(
  opts: RenderMapOptions,
): Promise<RenderedMap> {
  const width = opts.width ?? DEFAULT_WIDTH
  const height = opts.height ?? DEFAULT_HEIGHT
  const { canvas, ctx } = createCanvas(width, height)

  // White background so the ZIP/PDF look clean even if the floorplan has
  // transparent corners.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  let floorplanBounds: Rect = { x: 0, y: 0, w: width, h: height }

  if (opts.floorplanUrl) {
    throwIfAborted(opts.signal)
    const bitmap = await loadFloorplanBitmap(opts.floorplanUrl, opts.signal)
    try {
      floorplanBounds = fitImageInBox(
        bitmap.width,
        bitmap.height,
        width,
        height,
      )
      ctx.drawImage(
        bitmap,
        floorplanBounds.x,
        floorplanBounds.y,
        floorplanBounds.w,
        floorplanBounds.h,
      )
    } finally {
      bitmap.close?.()
    }
  } else {
    // No floorplan configured — draw a soft placeholder so the PNG isn't
    // completely empty.
    ctx.fillStyle = '#f3f4f6'
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = '#9ca3af'
    ctx.font = '24px -apple-system, Helvetica, Arial, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('No floorplan configured', width / 2, height / 2)
  }

  const pins = layoutMapPins(opts.photos, width, height, floorplanBounds)

  // Draw all cones first so the pin badges sit on top.
  for (const pin of pins) drawCone(ctx, pin)
  for (const pin of pins) drawPinBadge(ctx, pin)

  throwIfAborted(opts.signal)
  const blob = await canvasToPngBlob(canvas)

  return {
    blob,
    width,
    height,
    floorplanBounds,
    pins,
  }
}
