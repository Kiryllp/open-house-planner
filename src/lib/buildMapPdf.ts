import type { Photo } from './types'
import {
  fetchImage,
  getPdfBytes,
  type FetchedImage,
} from './imageThumb'
import { fitImageInBox } from './pinGeometry'
import { extractExt } from './buildExportZip'

/**
 * PDF builder for the export. Lays out:
 *
 *   Page 1           — cover + map (landscape US Letter)
 *   Pages 2..X       — photo index table (portrait US Letter, optional)
 *   Pages X+1..Y     — 3×4 photo key grid (portrait US Letter)
 *   Pages Y+1..Z     — optional full-size reference pages (landscape)
 *
 * `pdf-lib` is imported dynamically at the top of this file so it lands
 * in a separate chunk and doesn't bloat the main bundle.
 *
 * Every photo URL is fetched exactly once per build; the resulting
 * `PDFImage` handles are cached so the same concept thumbnail embedded
 * in both the key grid and the index table only lives in the PDF once.
 */

export interface BuildPdfOptions {
  placedPhotos: Photo[]
  /** All non-deleted real photos; used to resolve `linked_real_id`. */
  realPhotos: Photo[]
  mapPng: Blob
  includeIndex: boolean
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

// Key-grid / index concept tier. Shared between the key grid and the
// index table's concept preview column. One embed per unique URL.
const KEY_THUMB_MAXDIM = 1200
const KEY_THUMB_QUALITY = 0.9

// Dedicated (smaller) tier for the linked-real preview in the index
// table. Reals aren't shown anywhere else in the PDF, so they can be
// modest.
const INDEX_REAL_MAXDIM = 600
const INDEX_REAL_QUALITY = 0.85

// Full-size reference pages use the raw bytes whenever the original is
// PNG or JPEG and no larger than 4000px on its longest side — which is
// the overwhelming majority of phone camera and DSLR output. Anything
// larger gets a single JPEG re-encode at near-lossless quality.
const FULLSIZE_MAXDIM = 4000
const FULLSIZE_QUALITY = 0.92

// Index table layout (portrait US Letter, 612 × 792).
const INDEX_MARGIN = 40
const INDEX_TOP_BAND = 70
const INDEX_HEADER_H = 22
const INDEX_ROW_H = 56
const INDEX_COL_NUM_W = 28
const INDEX_COL_NAME_W = 160
const INDEX_COL_ZONE_W = 60
const INDEX_PREVIEW_THUMB_W = 130
const INDEX_PREVIEW_THUMB_H = 48
const INDEX_PREVIEW_GAP = 6

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

/**
 * Original filename with extension, matching what the ZIP puts inside
 * `All/` and `Zone-N/`. Falls back to an id-prefix slug when
 * `photo.name` is null so the table never shows "Untitled".
 */
function originalFilename(photo: Photo): string {
  const ext = extractExt(photo.file_url)
  const base = photo.name?.trim() || photo.id.slice(0, 8)
  return `${base}.${ext}`
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
  type PDFImage = Awaited<ReturnType<typeof PDFDocument.prototype.embedPng>>

  const report = (done: number, total: number, label: string) => {
    opts.onProgress?.(done, total, label)
  }

  const pdf = await PDFDocument.create()
  const helv = await pdf.embedFont(StandardFonts.Helvetica)
  const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  // Embed the map once — it's reused on the cover page.
  const mapBuf = await opts.mapPng.arrayBuffer()
  const mapImage = await pdf.embedPng(mapBuf)

  // ---- Fetch every image we need exactly once ---------------------------
  //
  // We fetch:
  //   - every placed concept URL (for the key grid, the index table's
  //     concept preview, and optional full-size reference pages)
  //   - every linked-real URL that's reachable from a placed concept AND
  //     refers to a non-deleted real row (for the index table's real
  //     preview column)
  //
  // The fetched raw bytes + dimensions live in `imageByUrl`; downstream
  // tiers derive pdf-lib byte arrays from the same FetchedImage without
  // touching the network again.
  const total = opts.placedPhotos.length
  const realsById = new Map<string, Photo>(
    opts.realPhotos
      .filter((r) => !r.deleted_at)
      .map((r) => [r.id, r] as const),
  )

  const linkedRealUrls: string[] = []
  const seenLinkedUrls = new Set<string>()
  if (opts.includeIndex) {
    for (const concept of opts.placedPhotos) {
      if (!concept.linked_real_id) continue
      const real = realsById.get(concept.linked_real_id)
      if (!real) continue
      if (seenLinkedUrls.has(real.file_url)) continue
      seenLinkedUrls.add(real.file_url)
      linkedRealUrls.push(real.file_url)
    }
  }

  const uniqueConceptUrls = Array.from(
    new Set(opts.placedPhotos.map((p) => p.file_url)),
  )
  const allUrlsToFetch = [...uniqueConceptUrls, ...linkedRealUrls]

  const imageByUrl = new Map<string, FetchedImage | null>()
  {
    let cursor = 0
    let doneCount = 0
    report(
      0,
      allUrlsToFetch.length,
      `Fetching thumbnails (0/${allUrlsToFetch.length})`,
    )

    const worker = async (): Promise<void> => {
      while (cursor < allUrlsToFetch.length) {
        const idx = cursor++
        const url = allUrlsToFetch[idx]
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
          allUrlsToFetch.length,
          `Fetching thumbnails (${doneCount}/${allUrlsToFetch.length})`,
        )
      }
    }

    const workers: Array<Promise<void>> = []
    for (
      let i = 0;
      i < Math.min(FETCH_CONCURRENCY, allUrlsToFetch.length);
      i++
    ) {
      workers.push(worker())
    }
    await Promise.all(workers)
  }

  // ---- PDFImage handle cache --------------------------------------------
  //
  // pdf-lib does NOT dedupe image XObjects by byte content: calling
  // `embedJpg(bytes)` twice produces two copies in the PDF. We cache the
  // PDFImage handle per `url|tier` key so the key grid, the index table,
  // and the optional full-size page reuse a single embed per tier.
  const embedCache = new Map<string, PDFImage | null>()

  async function embedForTier(
    url: string,
    tier: 'concept' | 'real' | 'fullsize',
  ): Promise<PDFImage | null> {
    const key = `${tier}|${url}`
    if (embedCache.has(key)) return embedCache.get(key)!
    const img = imageByUrl.get(url)
    if (!img) {
      embedCache.set(key, null)
      return null
    }
    let maxDim: number
    let quality: number
    switch (tier) {
      case 'concept':
        maxDim = KEY_THUMB_MAXDIM
        quality = KEY_THUMB_QUALITY
        break
      case 'real':
        maxDim = INDEX_REAL_MAXDIM
        quality = INDEX_REAL_QUALITY
        break
      case 'fullsize':
        maxDim = FULLSIZE_MAXDIM
        quality = FULLSIZE_QUALITY
        break
    }
    try {
      const bytes = await getPdfBytes(img, maxDim, quality)
      const handle =
        bytes.mime === 'image/png'
          ? await pdf.embedPng(bytes.bytes)
          : await pdf.embedJpg(bytes.bytes)
      embedCache.set(key, handle)
      return handle
    } catch (err) {
      console.warn(`Embed failed for ${tier} ${url}`, err)
      embedCache.set(key, null)
      return null
    }
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

  // ---- Photo index table pages (optional) -------------------------------
  if (opts.includeIndex && total > 0) {
    // Compute column x-offsets once — the table area is fixed width.
    const contentW = LETTER_SHORT - INDEX_MARGIN * 2
    const numX = INDEX_MARGIN
    const nameX = numX + INDEX_COL_NUM_W
    const zoneX = nameX + INDEX_COL_NAME_W
    const previewX = zoneX + INDEX_COL_ZONE_W

    // How many rows can we fit per page?
    const rowAreaTopY = LETTER_LONG - INDEX_TOP_BAND - INDEX_HEADER_H
    const usableRowH = rowAreaTopY - INDEX_MARGIN
    const rowsPerPage = Math.max(1, Math.floor(usableRowH / INDEX_ROW_H))
    const indexPageCount = Math.max(1, Math.ceil(total / rowsPerPage))

    for (let pageIdx = 0; pageIdx < indexPageCount; pageIdx++) {
      throwIfAborted(opts.signal)
      report(
        pageIdx + 1,
        indexPageCount,
        `Drawing index table (${pageIdx + 1}/${indexPageCount})`,
      )

      const page = pdf.addPage([LETTER_SHORT, LETTER_LONG])
      const pageH = page.getHeight()

      // Title band
      page.drawText('Photo Index', {
        x: INDEX_MARGIN,
        y: pageH - 48,
        size: 18,
        font: helvBold,
        color: rgb(0.1, 0.12, 0.16),
      })
      page.drawText(
        sanitizeText(
          `Page ${pageIdx + 1} of ${indexPageCount}  \u00B7  ${total} photo${total === 1 ? '' : 's'} indexed`,
        ),
        {
          x: INDEX_MARGIN,
          y: pageH - 64,
          size: 9,
          font: helv,
          color: rgb(0.5, 0.52, 0.56),
        },
      )

      // Column header row
      const headerY = pageH - INDEX_TOP_BAND
      page.drawRectangle({
        x: INDEX_MARGIN,
        y: headerY - INDEX_HEADER_H,
        width: contentW,
        height: INDEX_HEADER_H,
        color: rgb(0.95, 0.96, 0.98),
        borderColor: rgb(0.85, 0.87, 0.9),
        borderWidth: 0.5,
      })
      const drawHeader = (label: string, x: number) => {
        page.drawText(label, {
          x: x + 6,
          y: headerY - INDEX_HEADER_H + 7,
          size: 9,
          font: helvBold,
          color: rgb(0.3, 0.32, 0.36),
        })
      }
      drawHeader('#', numX)
      drawHeader('FILENAME', nameX)
      drawHeader('ZONE', zoneX)
      drawHeader('PREVIEW  (concept / real)', previewX)

      // Rows
      const firstRow = pageIdx * rowsPerPage
      const lastRow = Math.min(firstRow + rowsPerPage, total)
      for (let i = firstRow; i < lastRow; i++) {
        throwIfAborted(opts.signal)
        const photo = opts.placedPhotos[i]
        const rowIdxInPage = i - firstRow
        const rowTopY = headerY - INDEX_HEADER_H - rowIdxInPage * INDEX_ROW_H
        const rowBottomY = rowTopY - INDEX_ROW_H

        // Row separator line
        page.drawLine({
          start: { x: INDEX_MARGIN, y: rowBottomY },
          end: { x: INDEX_MARGIN + contentW, y: rowBottomY },
          thickness: 0.5,
          color: rgb(0.9, 0.92, 0.94),
        })

        // # badge
        const [r, g, b] = hexToRgb(photo.color)
        const badgeCx = numX + INDEX_COL_NUM_W / 2
        const badgeCy = rowBottomY + INDEX_ROW_H / 2
        page.drawCircle({
          x: badgeCx,
          y: badgeCy,
          size: 10,
          color: rgb(r, g, b),
        })
        const label = String(i + 1)
        const labelSize = label.length <= 2 ? 9 : 7
        const labelW = helvBold.widthOfTextAtSize(label, labelSize)
        page.drawText(label, {
          x: badgeCx - labelW / 2,
          y: badgeCy - labelSize / 2 + 1,
          size: labelSize,
          font: helvBold,
          color: rgb(1, 1, 1),
        })

        // Filename
        const filenameText = fitText(
          sanitizeText(originalFilename(photo)),
          helv,
          10,
          INDEX_COL_NAME_W - 12,
        )
        page.drawText(filenameText, {
          x: nameX + 6,
          y: badgeCy - 4,
          size: 10,
          font: helv,
          color: rgb(0.12, 0.14, 0.18),
        })

        // Zone
        const zoneText = zoneLabel(photo.zone)
        page.drawText(zoneText, {
          x: zoneX + 6,
          y: badgeCy - 4,
          size: 10,
          font: helvBold,
          color: rgb(r, g, b),
        })

        // Preview: concept thumbnail + linked-real thumbnail side by side
        const previewTopY = rowBottomY + (INDEX_ROW_H - INDEX_PREVIEW_THUMB_H) / 2
        const conceptBoxX = previewX + 6
        const realBoxX = conceptBoxX + INDEX_PREVIEW_THUMB_W + INDEX_PREVIEW_GAP

        // Concept thumb (reuses the same PDFImage handle as the key grid)
        const conceptHandle = await embedForTier(photo.file_url, 'concept')
        drawThumbInBox(
          page,
          conceptHandle,
          conceptBoxX,
          previewTopY,
          INDEX_PREVIEW_THUMB_W,
          INDEX_PREVIEW_THUMB_H,
          rgb,
          helv,
          '(image unavailable)',
        )

        // Linked real thumb (or placeholder)
        const linkedReal = photo.linked_real_id
          ? realsById.get(photo.linked_real_id) ?? null
          : null
        const realHandle = linkedReal
          ? await embedForTier(linkedReal.file_url, 'real')
          : null
        if (realHandle) {
          drawThumbInBox(
            page,
            realHandle,
            realBoxX,
            previewTopY,
            INDEX_PREVIEW_THUMB_W,
            INDEX_PREVIEW_THUMB_H,
            rgb,
            helv,
            '(image unavailable)',
          )
        } else {
          // Placeholder with "no real linked"
          page.drawRectangle({
            x: realBoxX,
            y: previewTopY,
            width: INDEX_PREVIEW_THUMB_W,
            height: INDEX_PREVIEW_THUMB_H,
            color: rgb(0.95, 0.96, 0.97),
            borderColor: rgb(0.85, 0.87, 0.9),
            borderWidth: 0.5,
          })
          const placeholder = 'no real linked'
          const tw = helv.widthOfTextAtSize(placeholder, 7)
          page.drawText(placeholder, {
            x: realBoxX + (INDEX_PREVIEW_THUMB_W - tw) / 2,
            y: previewTopY + INDEX_PREVIEW_THUMB_H / 2 - 2,
            size: 7,
            font: helv,
            color: rgb(0.55, 0.57, 0.6),
          })
        }
      }
    }
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

      // Embed thumbnail if we got it. Reuses the same PDFImage handle as
      // the index table — zero extra XObjects.
      const handle = await embedForTier(photo.file_url, 'concept')
      if (handle) {
        const fit = fitImageInBox(
          handle.width,
          handle.height,
          imgAreaW - 8,
          imgAreaH - 8,
        )
        page.drawImage(handle, {
          x: imgAreaLeft + 4 + fit.x,
          y: imgAreaBottom + 4 + fit.y,
          width: fit.w,
          height: fit.h,
        })
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
      const handle = await embedForTier(photo.file_url, 'fullsize')
      if (!handle) continue

      const page = pdf.addPage([LETTER_LONG, LETTER_SHORT])
      const pageW = page.getWidth()
      const pageH = page.getHeight()

      const imgAreaX = FULLSIZE_MARGIN
      const imgAreaY = FULLSIZE_MARGIN + FULLSIZE_CAPTION_H
      const imgAreaW = pageW - FULLSIZE_MARGIN * 2
      const imgAreaH = pageH - FULLSIZE_MARGIN * 2 - FULLSIZE_CAPTION_H
      const fit = fitImageInBox(handle.width, handle.height, imgAreaW, imgAreaH)
      page.drawImage(handle, {
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

/**
 * Helper: fit-contain a pdf-lib PDFImage handle inside a box, or draw a
 * gray placeholder with a message if the handle is null.
 */
function drawThumbInBox(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  page: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handle: any,
  boxX: number,
  boxY: number,
  boxW: number,
  boxH: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rgb: (r: number, g: number, b: number) => any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  helv: any,
  fallback: string,
): void {
  if (!handle) {
    page.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      color: rgb(0.95, 0.96, 0.97),
      borderColor: rgb(0.85, 0.87, 0.9),
      borderWidth: 0.5,
    })
    const tw = helv.widthOfTextAtSize(fallback, 7)
    page.drawText(fallback, {
      x: boxX + (boxW - tw) / 2,
      y: boxY + boxH / 2 - 2,
      size: 7,
      font: helv,
      color: rgb(0.55, 0.57, 0.6),
    })
    return
  }
  // Transparent-background fit-contain frame
  page.drawRectangle({
    x: boxX,
    y: boxY,
    width: boxW,
    height: boxH,
    color: rgb(0.97, 0.98, 0.99),
    borderColor: rgb(0.87, 0.88, 0.9),
    borderWidth: 0.5,
  })
  const fit = fitImageInBox(handle.width, handle.height, boxW - 4, boxH - 4)
  page.drawImage(handle, {
    x: boxX + 2 + fit.x,
    y: boxY + 2 + fit.y,
    width: fit.w,
    height: fit.h,
  })
}
