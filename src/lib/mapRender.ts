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
 *   1. Fetching every image as a Blob (`fetch` is CORS-strict — if the
 *      server doesn't grant us the bytes, we get a network error, not a
 *      silently tainted canvas),
 *   2. Decoding blobs with `createImageBitmap`, which never consults
 *      the `<img>` cache, and
 *   3. Drawing everything ourselves with plain `CanvasRenderingContext2D`
 *      calls — no DOM serialization, no offscreen HTML, no html-to-image.
 *
 * Each placed pin is rendered as a small thumbnail of the concept photo
 * with a number badge tucked into the top-left corner. The thumbnail is
 * clipped to a rounded rect, the number lives outside the image area so
 * it never covers photo content, and the underlying direction cone is
 * still drawn beneath so users see where the photo is pointing.
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

// Concept-photo fetch concurrency. Matches the worker pool used by the
// PDF builder and ZIP builder.
const PHOTO_FETCH_CONCURRENCY = 5

// Pin thumbnail visual dimensions, in canvas pixels (the canvas is
// 2000×1400 by default, so these are about 6% of canvas width).
const THUMB_SIZE = 120
const THUMB_RADIUS = 12
const THUMB_BORDER = 4
const BADGE_RADIUS = 18

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

async function loadBitmap(
  url: string,
  signal?: AbortSignal,
): Promise<ImageBitmap> {
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Image fetch failed: HTTP ${res.status}`)
  }
  const blob = await res.blob()
  throwIfAborted(signal)
  return createImageBitmap(blob)
}

/**
 * Fetch unique concept photo bitmaps in parallel (bounded concurrency),
 * one per unique `file_url`. Failures are stored as `null` so the draw
 * pass can fall back to the old circular badge for that pin.
 */
async function loadPhotoBitmaps(
  photos: Photo[],
  signal?: AbortSignal,
): Promise<Map<string, ImageBitmap | null>> {
  const uniqueUrls = Array.from(
    new Set(
      photos
        .filter((p) => p.pin_x != null && p.pin_y != null)
        .map((p) => p.file_url),
    ),
  )
  const result = new Map<string, ImageBitmap | null>()
  if (uniqueUrls.length === 0) return result

  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < uniqueUrls.length) {
      const idx = cursor++
      const url = uniqueUrls[idx]
      throwIfAborted(signal)
      try {
        result.set(url, await loadBitmap(url, signal))
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') throw err
        result.set(url, null)
        console.warn('Pin thumbnail fetch failed', err)
      }
    }
  }

  const pool: Array<Promise<void>> = []
  for (let i = 0; i < Math.min(PHOTO_FETCH_CONCURRENCY, uniqueUrls.length); i++) {
    pool.push(worker())
  }
  await Promise.all(pool)
  return result
}

/** Add a rounded rectangle sub-path. Caller is responsible for `beginPath`. */
function roundedRectPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
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

/**
 * Fallback pin renderer — used when a concept image fails to fetch or
 * decode. Same look as the original export badge: a colored circle with
 * the number inside.
 */
function drawPinBadge(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pin: PinRenderData,
): void {
  const radius = 18
  ctx.save()

  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 6
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 2

  ctx.beginPath()
  ctx.arc(pin.cx, pin.cy, radius + 3, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  ctx.beginPath()
  ctx.arc(pin.cx, pin.cy, radius, 0, Math.PI * 2)
  ctx.fillStyle = pin.color
  ctx.fill()

  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(pin.label, pin.cx, pin.cy + 1)

  ctx.restore()
}

/**
 * Draw a pin as a small rounded-rect thumbnail of the concept photo,
 * with the pin-number badge tucked into the top-left corner so it never
 * covers the image's content area. The `object-fit: cover` crop keeps
 * the thumb filled edge-to-edge regardless of source aspect.
 */
function drawPinThumbnail(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  pin: PinRenderData,
  bitmap: ImageBitmap,
): void {
  const tx = pin.cx - THUMB_SIZE / 2
  const ty = pin.cy - THUMB_SIZE / 2

  ctx.save()

  // Drop shadow under the thumbnail (applied to the white backing).
  ctx.shadowColor = 'rgba(0, 0, 0, 0.35)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetX = 0
  ctx.shadowOffsetY = 3

  // White border backing — renders the shadow and acts as the outer
  // stroke of the thumbnail.
  ctx.beginPath()
  roundedRectPath(
    ctx,
    tx - THUMB_BORDER,
    ty - THUMB_BORDER,
    THUMB_SIZE + THUMB_BORDER * 2,
    THUMB_SIZE + THUMB_BORDER * 2,
    THUMB_RADIUS + THUMB_BORDER,
  )
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
  ctx.shadowOffsetY = 0

  // Colored pin-identity ring around the thumbnail.
  ctx.beginPath()
  roundedRectPath(
    ctx,
    tx - THUMB_BORDER / 2,
    ty - THUMB_BORDER / 2,
    THUMB_SIZE + THUMB_BORDER,
    THUMB_SIZE + THUMB_BORDER,
    THUMB_RADIUS + THUMB_BORDER / 2,
  )
  ctx.lineWidth = 3
  ctx.strokeStyle = pin.color
  ctx.stroke()

  // Clip to the thumbnail's rounded rect and draw the image with an
  // object-fit: cover crop.
  ctx.save()
  ctx.beginPath()
  roundedRectPath(ctx, tx, ty, THUMB_SIZE, THUMB_SIZE, THUMB_RADIUS)
  ctx.clip()

  const srcAspect = bitmap.width / bitmap.height
  const dstAspect = THUMB_SIZE / THUMB_SIZE // 1 for a square, but kept explicit
  let sx = 0
  let sy = 0
  let sw = bitmap.width
  let sh = bitmap.height
  if (srcAspect > dstAspect) {
    sw = bitmap.height * dstAspect
    sx = (bitmap.width - sw) / 2
  } else {
    sh = bitmap.width / dstAspect
    sy = (bitmap.height - sh) / 2
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, tx, ty, THUMB_SIZE, THUMB_SIZE)
  ctx.restore()

  // Number badge — top-left corner of the thumbnail. Center sits exactly
  // on the corner so half the badge sticks out over the floorplan and
  // half overlaps the white border, keeping the image content clear.
  const badgeCx = tx
  const badgeCy = ty

  // White ring so the badge reads against any underlying color.
  ctx.beginPath()
  ctx.arc(badgeCx, badgeCy, BADGE_RADIUS + 3, 0, Math.PI * 2)
  ctx.fillStyle = '#ffffff'
  ctx.fill()

  // Colored fill — matches the pin color and the thumbnail ring.
  ctx.beginPath()
  ctx.arc(badgeCx, badgeCy, BADGE_RADIUS, 0, Math.PI * 2)
  ctx.fillStyle = pin.color
  ctx.fill()

  // Number text.
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 20px -apple-system, "Helvetica Neue", Helvetica, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(pin.label, badgeCx, badgeCy + 1)

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
    const bitmap = await loadBitmap(opts.floorplanUrl, opts.signal)
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

  // Fetch concept thumbnails in parallel before drawing. Shared cache by
  // file_url so multi-zone duplicates only fetch once.
  const bitmapByUrl = await loadPhotoBitmaps(opts.photos, opts.signal)

  // Draw all cones first so the thumbnails sit on top.
  for (const pin of pins) drawCone(ctx, pin)

  // Draw thumbnails (or fall back to the circular badge on fetch failure).
  for (const pin of pins) {
    const bmp = bitmapByUrl.get(pin.photo.file_url)
    if (bmp) {
      drawPinThumbnail(ctx, pin, bmp)
    } else {
      drawPinBadge(ctx, pin)
    }
  }

  // Release decoded bitmaps.
  for (const bmp of bitmapByUrl.values()) {
    bmp?.close?.()
  }

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
