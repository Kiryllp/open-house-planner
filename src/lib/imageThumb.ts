/**
 * Scale-down thumbnail generator for the PDF key.
 *
 * Runs entirely in the browser via `fetch` → `createImageBitmap` → a
 * 2D canvas. No `<img>` element, so it inherits the same CORS cleanliness
 * guarantees as `mapRender.ts`.
 */

export interface Thumbnail {
  bytes: Uint8Array
  mime: 'image/jpeg' | 'image/png'
  width: number
  height: number
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

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

async function canvasToJpegBytes(
  canvas: OffscreenCanvas | HTMLCanvasElement,
  quality: number,
): Promise<Uint8Array> {
  if ('convertToBlob' in canvas) {
    const blob = await canvas.convertToBlob({
      type: 'image/jpeg',
      quality,
    })
    return new Uint8Array(await blob.arrayBuffer())
  }
  const blob: Blob = await new Promise((resolve, reject) => {
    ;(canvas as HTMLCanvasElement).toBlob(
      (b) => {
        if (b) resolve(b)
        else reject(new Error('canvas.toBlob returned null'))
      },
      'image/jpeg',
      quality,
    )
  })
  return new Uint8Array(await blob.arrayBuffer())
}

/**
 * Fetch an image and return a downscaled JPEG sized so the longest side
 * is `maxDim` pixels. If the source is already small enough AND is a PNG
 * or JPEG, the original bytes are returned unchanged (saves a decode and
 * keeps PNG transparency intact).
 */
export async function fetchThumbnail(
  url: string,
  maxDim: number,
  signal?: AbortSignal,
): Promise<Thumbnail> {
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Thumbnail fetch failed: HTTP ${res.status}`)
  }
  const blob = await res.blob()
  throwIfAborted(signal)

  const bitmap = await createImageBitmap(blob)
  try {
    const srcW = bitmap.width
    const srcH = bitmap.height
    const longest = Math.max(srcW, srcH)

    // Happy path: image is already small enough AND is one of the two
    // formats pdf-lib can embed directly. Hand the raw bytes back.
    if (longest <= maxDim) {
      const mime = blob.type
      if (mime === 'image/jpeg' || mime === 'image/png') {
        const bytes = new Uint8Array(await blob.arrayBuffer())
        return { bytes, mime, width: srcW, height: srcH }
      }
    }

    const scale = longest > maxDim ? maxDim / longest : 1
    const dstW = Math.max(1, Math.round(srcW * scale))
    const dstH = Math.max(1, Math.round(srcH * scale))

    const { canvas, ctx } = createCanvas(dstW, dstH)
    // JPEG has no alpha — fill white so PNG sources with transparency
    // don't come back with black edges.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dstW, dstH)
    ctx.drawImage(bitmap, 0, 0, dstW, dstH)

    const bytes = await canvasToJpegBytes(canvas, 0.82)
    return { bytes, mime: 'image/jpeg', width: dstW, height: dstH }
  } finally {
    bitmap.close?.()
  }
}
