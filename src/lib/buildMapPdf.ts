import type { Photo } from './types'
import {
  fetchImage,
  getPdfBytes,
  type FetchedImage,
  type PdfEmbeddable,
} from './imageThumb'
import { fitImageInBox } from './pinGeometry'

/**
 * PDF builder for the export. Lays out:
 *
 *   Page 1           — cover + map (landscape US Letter)
 *   Pages 2..N       — 3×4 photo key grid (portrait US Letter)
 *   Pages N+1..M     — optional full-size reference pages (landscape)
 *
 * `pdf-lib` is imported dynamically at the top of this file so it lands
 * in a separate chunk and doesn't bloat the main bundle.
 */

export interface BuildPdfOptions {
  placedPhotos: Photo[]
  mapPng: Blob
  includeFullsize: boolean
  onProgress?: (done: number, total: number, label: string) => void
  signal?: AbortSignal
}

// US Letter in PDF points (1/72").
const LETTER_LONG = 792
const LETTER_SHORT = 612

const COVER_MARGIN_X = 36
const COVER_TOP_BAND = 60
const COVER_BOTTOM_BAND = 28
const COVER_MAP_MARGIN = 24

const KEY_MARGIN = 40
const KEY_TOP = 70
const KEY_COLS = 3
const KEY_ROWS = 4
const KEY_GUTTER_X = 18
const KEY_GUTTER_Y = 24

const FULLSIZE_MARGIN = 36
const FULLSIZE_CAPTION_H = 70

// Key-grid thumbnail budget. ~100pt wide cell × ~4 rendering scale = 400px
// minimum; 1200 gives PDF viewers room to zoom without the thumbnail
// going soft. Quality 0.9 keeps file size reasonable.
const KEY_THUMB_MAXDIM = 1200
const KEY_THUMB_QUALITY = 0.9

// Full-size reference pages use the raw bytes whenever the original is
// PNG or JPEG and no larger than 4000px on its longest side — which is
// the overwhelming majority of phone camera and DSLR output. Anything
// larger gets a single JPEG re-encode at near-lossless quality.
const FULLSIZE_MAXDIM = 4000
const FULLSIZE_QUALITY = 0.92

const FETCH_CONCURRENCY = 5

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

/**
 * pdf-lib's WinAnsi encoder trips on characters outside its codepage
 * (smart quotes, em dashes, CJK, emoji). For the events-team export we
 * stay conservative and transliterate common typographic punctuation,
 * then strip anything else.
 */
function sanitizeText(input: string): string {
  return input
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00A0/g, ' ')
    // Strip anything that isn't a printable ASCII character.
    .replace(/[^\x20-\x7E\n]/g, '')
}

/** Hex → [0..1] rgb, falling back to a purple if parsing fails. */
function hexToRgb(hex: string | null | undefined): [number, number, number] {
  if (!hex) return [168 / 255, 85 / 255, 247 / 255]
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return [168 / 255, 85 / 255, 247 / 255]
  const n = parseInt(m[1], 16)
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255]
}

function zoneLabel(zone: number | null | undefined): string {
  return zone ? `Zone ${zone}` : 'Unzoned'
}

/** Truncate `text` so it fits in `maxWidth` at `fontSize`, adding ".." on overflow. */
function fitText(
  text: string,
  font: { widthOfTextAtSize: (t: string, s: number) => number },
  fontSize: number,
  maxWidth: number,
): string {
  if (font.widthOfTextAtSize(text, fontSize) <= maxWidth) return text
  const ellipsis = '..'
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    const candidate = text.slice(0, mid) + ellipsis
    if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return text.slice(0, lo) + ellipsis
}

export async function buildMapPdf(opts: BuildPdfOptions): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib')

  const report = (done: number, total: number, label: string) => {
    opts.onProgress?.(done, total, label)
  }

  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Embed the map once — it's reused on the cover page.
  const mapBuf = await opts.mapPng.arrayBuffer()
  const mapImage = await pdf.embedPng(mapBuf)

  // Pre-fetch every photo URL exactly once, then derive whatever the PDF
  // needs from the cached FetchedImage (full resolution + raw bytes +
  // dimensions). Two photos with the same file_url — e.g. a multi-zone
  // concept — share a single fetch.
  const total = opts.placedPhotos.length
  const imageByUrl = new Map<string, FetchedImage | null>()
  {
    const uniqueUrls = Array.from(
      new Set(opts.placedPhotos.map((p) => p.file_url)),
    )
    let cursor = 0
    let doneCount = 0
    report(0, uniqueUrls.length, `Fetching images (0/${uniqueUrls.length})`)

    const worker = async (): Promise<void> => {
      while (cursor < uniqueUrls.length) {
        const idx = cursor++
        const url = uniqueUrls[idx]
        throwIfAborted(opts.signal)
        try {
          imageByUrl.set(url, await fetchImage(url, opts.signal))
        } catch (err) {
          if ((err as DOMException)?.name === 'AbortError') throw err
          imageByUrl.set(url, null)
          console.warn('PDF image fetch failed', err)
        }
        doneCount++
        report(
          doneCount,
          uniqueUrls.length,
          `Fetching images (${doneCount}/${uniqueUrls.length})`,
        )
      }
    }

    const workers: Array<Promise<void>> = []
    for (let i = 0; i < Math.min(FETCH_CONCURRENCY, uniqueUrls.length); i++) {
      workers.push(worker())
    }
    await Promise.all(workers)
  }

  // Derive the key-grid thumbnails. These are small, so per-photo cost
  // is modest even for ~100-photo projects.
  report(0, total, `Preparing key thumbnails (0/${total})`)
  const keyThumbs: Array<PdfEmbeddable | null> = new Array(total).fill(null)
  for (let i = 0; i < total; i++) {
    throwIfAborted(opts.signal)
    const photo = opts.placedPhotos[i]
    const img = imageByUrl.get(photo.file_url)
    if (!img) continue
    try {
      keyThumbs[i] = await getPdfBytes(img, KEY_THUMB_MAXDIM, KEY_THUMB_QUALITY)
    } catch (err) {
      console.warn('Key thumbnail prep failed', err)
    }
    report(i + 1, total, `Preparing key thumbnails (${i + 1}/${total})`)
  }

  // ---- Cover + Map page --------------------------------------------------
  throwIfAborted(opts.signal)
  report(0, 1, 'Drawing cover page')
  {
    const page = pdf.addPage([LETTER_LONG, LETTER_SHORT])
    const pageW = page.getWidth()
    const pageH = page.getHeight()

    // Title band
    const title = 'Open House Planner \u2014 Export'
    const date = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const subtitle = `${date}  \u00B7  ${total} photo${total === 1 ? '' : 's'}`

    page.drawText(sanitizeText(title), {
      x: COVER_MARGIN_X,
      y: pageH - 40,
      size: 20,
      font: helvBold,
      color: rgb(0.1, 0.12, 0.16),
    })
    page.drawText(sanitizeText(subtitle), {
      x: COVER_MARGIN_X,
      y: pageH - 58,
      size: 11,
      font: helv,
      color: rgb(0.4, 0.42, 0.46),
    })

    // Map area
    const mapAreaX = COVER_MAP_MARGIN
    const mapAreaY = COVER_BOTTOM_BAND
    const mapAreaW = pageW - COVER_MAP_MARGIN * 2
    const mapAreaH = pageH - COVER_TOP_BAND - COVER_BOTTOM_BAND
    const fit = fitImageInBox(
      mapImage.width,
      mapImage.height,
      mapAreaW,
      mapAreaH,
    )
    page.drawImage(mapImage, {
      x: mapAreaX + fit.x,
      y: mapAreaY + fit.y,
      width: fit.w,
      height: fit.h,
    })

    // Footer band
    page.drawText(
      sanitizeText(`Open House Planner \u00B7 ${date}`),
      {
        x: COVER_MARGIN_X,
        y: 14,
        size: 9,
        font: helv,
        color: rgb(0.55, 0.57, 0.6),
      },
    )
  }

  // ---- Photo key pages ---------------------------------------------------
  throwIfAborted(opts.signal)
  const perPage = KEY_COLS * KEY_ROWS
  const keyPageCount = Math.max(1, Math.ceil(total / perPage))
  for (let pageIdx = 0; pageIdx < keyPageCount; pageIdx++) {
    throwIfAborted(opts.signal)
    report(
      pageIdx + 1,
      keyPageCount,
      `Drawing key pages (${pageIdx + 1}/${keyPageCount})`,
    )

    const page = pdf.addPage([LETTER_SHORT, LETTER_LONG])
    const pageW = page.getWidth()
    const pageH = page.getHeight()

    page.drawText('Photo Key', {
      x: KEY_MARGIN,
      y: pageH - 48,
      size: 18,
      font: helvBold,
      color: rgb(0.1, 0.12, 0.16),
    })
    page.drawText(
      sanitizeText(
        `Page ${pageIdx + 1} of ${keyPageCount}  \u00B7  ${total} photos total`,
      ),
      {
        x: KEY_MARGIN,
        y: pageH - 64,
        size: 9,
        font: helv,
        color: rgb(0.5, 0.52, 0.56),
      },
    )

    const gridX = KEY_MARGIN
    const gridY = KEY_MARGIN
    const gridW = pageW - KEY_MARGIN * 2
    const gridH = pageH - KEY_TOP - KEY_MARGIN
    const cellW = (gridW - KEY_GUTTER_X * (KEY_COLS - 1)) / KEY_COLS
    const cellH = (gridH - KEY_GUTTER_Y * (KEY_ROWS - 1)) / KEY_ROWS

    // The thumbnail slot takes ~60% of the cell height; the rest is
    // captions (name + notes).
    const imgH = cellH * 0.62
    const captionTop = cellH - imgH - 6

    for (let slot = 0; slot < perPage; slot++) {
      const photoIdx = pageIdx * perPage + slot
      if (photoIdx >= total) break

      const photo = opts.placedPhotos[photoIdx]
      const thumb = keyThumbs[photoIdx]
      const col = slot % KEY_COLS
      const row = Math.floor(slot / KEY_COLS)

      const cellLeft = gridX + col * (cellW + KEY_GUTTER_X)
      // PDF y-axis is bottom-up; grid row 0 is at the top.
      const cellBottom = gridY + (KEY_ROWS - 1 - row) * (cellH + KEY_GUTTER_Y)

      const imgAreaLeft = cellLeft
      const imgAreaBottom = cellBottom + captionTop
      const imgAreaW = cellW
      const imgAreaH = imgH

      // Cell background (helps debug alignment, also looks nice).
      page.drawRectangle({
        x: cellLeft,
        y: cellBottom,
        width: cellW,
        height: cellH,
        borderWidth: 0.5,
        borderColor: rgb(0.87, 0.88, 0.9),
        color: rgb(0.98, 0.98, 0.99),
      })

      // Embed thumbnail if we got it.
      if (thumb) {
        try {
          const embedded =
            thumb.mime === 'image/png'
              ? await pdf.embedPng(thumb.bytes)
              : await pdf.embedJpg(thumb.bytes)
          const fit = fitImageInBox(
            embedded.width,
            embedded.height,
            imgAreaW - 8,
            imgAreaH - 8,
          )
          page.drawImage(embedded, {
            x: imgAreaLeft + 4 + fit.x,
            y: imgAreaBottom + 4 + fit.y,
            width: fit.w,
            height: fit.h,
          })
        } catch (err) {
          console.warn('Embed failed for key thumbnail', err)
        }
      } else {
        page.drawRectangle({
          x: imgAreaLeft + 4,
          y: imgAreaBottom + 4,
          width: imgAreaW - 8,
          height: imgAreaH - 8,
          color: rgb(0.93, 0.94, 0.95),
        })
        const placeholder = '(image unavailable)'
        const tw = helv.widthOfTextAtSize(placeholder, 9)
        page.drawText(placeholder, {
          x: imgAreaLeft + (imgAreaW - tw) / 2,
          y: imgAreaBottom + imgAreaH / 2 - 3,
          size: 9,
          font: helv,
          color: rgb(0.55, 0.57, 0.6),
        })
      }

      // Pin number badge (top-left of cell).
      const [r, g, b] = hexToRgb(photo.color)
      const badgeCx = cellLeft + 14
      const badgeCy = cellBottom + cellH - 14
      page.drawCircle({
        x: badgeCx,
        y: badgeCy,
        size: 10,
        color: rgb(r, g, b),
      })
      const label = String(photoIdx + 1)
      const labelSize = label.length <= 2 ? 9 : 7
      const labelW = helvBold.widthOfTextAtSize(label, labelSize)
      page.drawText(label, {
        x: badgeCx - labelW / 2,
        y: badgeCy - labelSize / 2 + 1,
        size: labelSize,
        font: helvBold,
        color: rgb(1, 1, 1),
      })

      // Zone badge (bottom-left of image area, above caption).
      const zoneText = zoneLabel(photo.zone)
      const zoneSize = 8
      const zoneTextW = helvBold.widthOfTextAtSize(zoneText, zoneSize)
      const zonePad = 4
      const zoneBoxW = zoneTextW + zonePad * 2
      const zoneBoxH = zoneSize + 4
      const zoneBoxX = cellLeft + 6
      const zoneBoxY = imgAreaBottom + 6
      page.drawRectangle({
        x: zoneBoxX,
        y: zoneBoxY,
        width: zoneBoxW,
        height: zoneBoxH,
        color: rgb(r, g, b),
        opacity: 0.9,
      })
      page.drawText(zoneText, {
        x: zoneBoxX + zonePad,
        y: zoneBoxY + 3,
        size: zoneSize,
        font: helvBold,
        color: rgb(1, 1, 1),
      })

      // Name (single line, truncated to cell width).
      const rawName = photo.name || 'Untitled'
      const fittedName = fitText(
        sanitizeText(rawName),
        helvBold,
        10,
        cellW - 10,
      )
      page.drawText(fittedName, {
        x: cellLeft + 6,
        y: cellBottom + captionTop - 12,
        size: 10,
        font: helvBold,
        color: rgb(0.12, 0.14, 0.18),
      })

      // Notes (single line, truncated).
      if (photo.notes) {
        const noteText = sanitizeText(photo.notes).replace(/\s+/g, ' ').trim()
        if (noteText) {
          const fittedNote = fitText(noteText, helv, 8, cellW - 10)
          page.drawText(fittedNote, {
            x: cellLeft + 6,
            y: cellBottom + captionTop - 24,
            size: 8,
            font: helv,
            color: rgb(0.45, 0.48, 0.52),
          })
        }
      }
    }
  }

  // ---- Optional full-size reference pages --------------------------------
  if (opts.includeFullsize) {
    for (let i = 0; i < total; i++) {
      throwIfAborted(opts.signal)
      report(
        i + 1,
        total,
        `Drawing full-size pages (${i + 1}/${total})`,
      )
      const photo = opts.placedPhotos[i]
      const img = imageByUrl.get(photo.file_url)
      if (!img) continue

      // Derive high-quality bytes per-photo so we don't hold every
      // decoded full-size image in memory at once.
      let fullsize: PdfEmbeddable
      try {
        fullsize = await getPdfBytes(img, FULLSIZE_MAXDIM, FULLSIZE_QUALITY)
      } catch (err) {
        console.warn('Fullsize prep failed', err)
        continue
      }

      const page = pdf.addPage([LETTER_LONG, LETTER_SHORT])
      const pageW = page.getWidth()
      const pageH = page.getHeight()

      let embedded
      try {
        embedded =
          fullsize.mime === 'image/png'
            ? await pdf.embedPng(fullsize.bytes)
            : await pdf.embedJpg(fullsize.bytes)
      } catch (err) {
        console.warn('Embed failed for full-size page', err)
        continue
      }

      const imgAreaX = FULLSIZE_MARGIN
      const imgAreaY = FULLSIZE_MARGIN + FULLSIZE_CAPTION_H
      const imgAreaW = pageW - FULLSIZE_MARGIN * 2
      const imgAreaH = pageH - FULLSIZE_MARGIN * 2 - FULLSIZE_CAPTION_H
      const fit = fitImageInBox(embedded.width, embedded.height, imgAreaW, imgAreaH)
      page.drawImage(embedded, {
        x: imgAreaX + fit.x,
        y: imgAreaY + fit.y,
        width: fit.w,
        height: fit.h,
      })

      const [r, g, b] = hexToRgb(photo.color)
      const label = String(i + 1)
      page.drawCircle({
        x: FULLSIZE_MARGIN + 14,
        y: FULLSIZE_MARGIN + FULLSIZE_CAPTION_H - 22,
        size: 12,
        color: rgb(r, g, b),
      })
      const labelSize = label.length <= 2 ? 11 : 9
      const labelW = helvBold.widthOfTextAtSize(label, labelSize)
      page.drawText(label, {
        x: FULLSIZE_MARGIN + 14 - labelW / 2,
        y: FULLSIZE_MARGIN + FULLSIZE_CAPTION_H - 22 - labelSize / 2 + 1,
        size: labelSize,
        font: helvBold,
        color: rgb(1, 1, 1),
      })

      const name = sanitizeText(photo.name || 'Untitled')
      const fittedName = fitText(name, helvBold, 16, pageW - FULLSIZE_MARGIN * 2 - 40)
      page.drawText(fittedName, {
        x: FULLSIZE_MARGIN + 34,
        y: FULLSIZE_MARGIN + FULLSIZE_CAPTION_H - 28,
        size: 16,
        font: helvBold,
        color: rgb(0.1, 0.12, 0.16),
      })

      const meta = `${zoneLabel(photo.zone)}  \u00B7  Pin ${i + 1}`
      page.drawText(sanitizeText(meta), {
        x: FULLSIZE_MARGIN + 34,
        y: FULLSIZE_MARGIN + FULLSIZE_CAPTION_H - 46,
        size: 10,
        font: helv,
        color: rgb(0.45, 0.48, 0.52),
      })

      if (photo.notes) {
        const noteText = sanitizeText(photo.notes).replace(/\s+/g, ' ').trim()
        if (noteText) {
          const fittedNote = fitText(
            noteText,
            helv,
            10,
            pageW - FULLSIZE_MARGIN * 2 - 40,
          )
          page.drawText(fittedNote, {
            x: FULLSIZE_MARGIN + 34,
            y: FULLSIZE_MARGIN + FULLSIZE_CAPTION_H - 62,
            size: 10,
            font: helv,
            color: rgb(0.35, 0.37, 0.42),
          })
        }
      }
    }
  }

  throwIfAborted(opts.signal)
  report(0, 1, 'Finalizing PDF')
  const bytes = await pdf.save()
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
}
