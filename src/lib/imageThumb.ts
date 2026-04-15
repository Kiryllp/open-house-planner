/**
 * Image fetch + pdf-lib-friendly bytes.
 *
 * `fetchImage` downloads the raw bytes once and returns them alongside
 * the decoded dimensions. `getPdfBytes` then derives bytes that pdf-lib
 * can embed, preferring the untouched raw bytes whenever possible:
 *
 *   - Original is PNG/JPEG AND already within `maxDim` → pass through
 *     verbatim (no decode, no re-encode, no quality loss)
 *   - Otherwise → decode, downscale to `maxDim`, re-encode as JPEG at
 *     `quality`
 *
 * This is what the PDF builder uses both for the key-grid thumbnails
 * (modest maxDim, small cached JPEG) and for the optional full-size
 * reference pages (large maxDim, so originals pass through with zero
 * quality loss).
 */

export type PdfMime = 'image/jpeg' | 'image/png'
export type RawMime = PdfMime | 'other'

export interface FetchedImage {
  raw: Uint8Array
  rawMime: RawMime
  width: number
  height: number
}

export interface PdfEmbeddable {
  bytes: Uint8Array
  mime: PdfMime
  width: number
  height: number
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

function classifyMime(contentType: string): RawMime {
  if (contentType === 'image/jpeg' || contentType === 'image/jpg') return 'image/jpeg'
  if (contentType === 'image/png') return 'image/png'
  return 'other'
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
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality })
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
 * Fetch an image URL and return the raw bytes + decoded dimensions.
 * The decode is only used to learn width/height — we keep the raw bytes
 * around so the PDF builder can embed them without quality loss.
 */
export async function fetchImage(
  url: string,
  signal?: AbortSignal,
): Promise<FetchedImage> {
  const res = await fetch(url, { signal, cache: 'no-store' })
  if (!res.ok) throw new Error(`Image fetch failed: HTTP ${res.status}`)
  const blob = await res.blob()
  throwIfAborted(signal)
  const raw = new Uint8Array(await blob.arrayBuffer())
  const rawMime = classifyMime(blob.type)
  // Decode just to get dimensions.
  const bitmap = await createImageBitmap(blob)
  const width = bitmap.width
  const height = bitmap.height
  bitmap.close?.()
  return { raw, rawMime, width, height }
}

/**
 * Return bytes that pdf-lib can embed. Prefers passing through the
 * original bytes; falls back to a re-encoded JPEG when the source is
 * too large or in a format pdf-lib doesn't understand.
 */
export async function getPdfBytes(
  img: FetchedImage,
  maxDim: number,
  quality: number,
): Promise<PdfEmbeddable> {
  const longest = Math.max(img.width, img.height)
  const canPassThrough =
    longest <= maxDim && (img.rawMime === 'image/jpeg' || img.rawMime === 'image/png')
  if (canPassThrough) {
    return {
      bytes: img.raw,
      mime: img.rawMime as PdfMime,
      width: img.width,
      height: img.height,
    }
  }

  // Need to re-encode. Decode from whatever the raw bytes are (feed the
  // blob, not the Uint8Array, so createImageBitmap keeps its type hint).
  const srcAb = new ArrayBuffer(img.raw.byteLength)
  new Uint8Array(srcAb).set(img.raw)
  const srcBlob = new Blob([srcAb], {
    type: img.rawMime === 'other' ? 'application/octet-stream' : img.rawMime,
  })
  const bitmap = await createImageBitmap(srcBlob)
  try {
    const scale = longest > maxDim ? maxDim / longest : 1
    const dstW = Math.max(1, Math.round(img.width * scale))
    const dstH = Math.max(1, Math.round(img.height * scale))
    const { canvas, ctx } = createCanvas(dstW, dstH)
    // JPEG has no alpha — fill white so PNGs with transparency don't come
    // out with black fringes.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, dstW, dstH)
    ctx.drawImage(bitmap, 0, 0, dstW, dstH)
    const bytes = await canvasToJpegBytes(canvas, quality)
    return { bytes, mime: 'image/jpeg', width: dstW, height: dstH }
  } finally {
    bitmap.close?.()
  }
}
