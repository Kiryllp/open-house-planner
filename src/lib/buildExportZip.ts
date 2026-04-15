import JSZip from 'jszip'
import type { Photo } from './types'

/**
 * Build the final export ZIP.
 *
 *   All/                          (every photo row — optional)
 *   Zone-1/ .. Zone-6/ / Unzoned/ (per-zone folders — optional)
 *   map.png                       (rendered floorplan)
 *   map.pdf                       (cover + key PDF — optional)
 *   EXPORT_ERRORS.txt             (only if any image fetch failed)
 *
 * This replaces `exportOriginalsZip.ts` and differs from it in three
 * important ways:
 *
 *   1. Fetches run in parallel with a bounded concurrency (5), using a
 *      shared blob cache keyed on `file_url`. The old implementation was
 *      a serial `for` loop, which was slow on projects with many photos.
 *   2. Failed fetches are aggregated into a single `EXPORT_ERRORS.txt`
 *      at the ZIP root rather than silently written as `.ERROR.txt`
 *      stubs next to the placeholders. The caller also gets a structured
 *      `errors` array so the UI can surface failures properly.
 *   3. Every placed row goes into `All/`, and into its own `Zone-<N>/`
 *      folder. Multi-zone concepts (two rows with the same
 *      `source_upload_id`) appear once per row in both places.
 */

export interface ExportEntry {
  index: number
  photo: Photo
  basename: string
  ext: string
  // Folder paths (without trailing slash). Each entry writes the blob to
  // every folder in this list.
  folders: string[]
}

export interface ExportError {
  photoId: string
  name: string
  url: string
  message: string
}

export interface BuildExportOptions {
  placedPhotos: Photo[]
  mapPng: Blob
  mapPdf: Blob | null
  includeAllFolder: boolean
  includeZoneFolders: boolean
  onProgress?: (done: number, total: number, label: string) => void
  signal?: AbortSignal
}

export interface BuildExportResult {
  blob: Blob
  errors: ExportError[]
}

const FETCH_CONCURRENCY = 5

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Aborted', 'AbortError')
  }
}

export function sanitizeFilename(name: string): string {
  // Remove path separators and control chars only — keep unicode alone.
  const cleaned = name
    .replace(/[\u0000-\u001f/\\]+/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 80)
  return cleaned || 'photo'
}

export function extractExt(url: string): string {
  const raw = url.split('?')[0].split('#')[0].split('.').pop() ?? 'jpg'
  const cleaned = raw.toLowerCase().replace(/[^a-z0-9]/g, '')
  return cleaned || 'jpg'
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function zoneFolder(zone: number | null | undefined): string {
  return zone ? `Zone-${zone}` : 'Unzoned'
}

function buildEntries(
  photos: Photo[],
  includeAllFolder: boolean,
  includeZoneFolders: boolean,
): ExportEntry[] {
  const pad = String(photos.length).length
  return photos.map((photo, i) => {
    const basename = sanitizeFilename(photo.name || photo.id.slice(0, 8))
    const ext = extractExt(photo.file_url)
    const folders: string[] = []
    if (includeAllFolder) folders.push('All')
    if (includeZoneFolders) folders.push(zoneFolder(photo.zone))
    return {
      index: i + 1,
      photo,
      basename,
      ext,
      folders,
    }
  }).map((entry) => {
    const numbered = String(entry.index).padStart(pad, '0')
    return {
      ...entry,
      basename: `${numbered}_${entry.basename}`,
    }
  })
}

export async function buildExportZip(
  opts: BuildExportOptions,
): Promise<BuildExportResult> {
  const zip = new JSZip()
  const errors: ExportError[] = []

  // Static artifacts first so they're always present even if a fetch
  // fails later.
  zip.file('map.png', opts.mapPng)
  if (opts.mapPdf) {
    zip.file('map.pdf', opts.mapPdf)
  }

  const entries = buildEntries(
    opts.placedPhotos,
    opts.includeAllFolder,
    opts.includeZoneFolders,
  )

  // Parallel fetch, bounded concurrency, cached by file_url so two
  // entries pointing at the same source image only fetch once.
  const total = entries.length
  let completed = 0
  const report = (label: string) => {
    opts.onProgress?.(completed, total, label)
  }
  report(`Fetching images (0/${total})`)

  const cache = new Map<string, Promise<Blob>>()
  const fetchOne = (url: string): Promise<Blob> => {
    const cached = cache.get(url)
    if (cached) return cached
    const p = (async () => {
      const res = await fetch(url, { signal: opts.signal, cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.blob()
    })()
    cache.set(url, p)
    return p
  }

  let cursor = 0
  const worker = async (): Promise<void> => {
    while (cursor < entries.length) {
      const idx = cursor++
      throwIfAborted(opts.signal)
      const entry = entries[idx]
      const filename = `${entry.basename}.${entry.ext}`
      try {
        const blob = await fetchOne(entry.photo.file_url)
        for (const folder of entry.folders) {
          zip.file(`${folder}/${filename}`, blob)
        }
      } catch (err) {
        if ((err as DOMException)?.name === 'AbortError') throw err
        errors.push({
          photoId: entry.photo.id,
          name: entry.photo.name || '(untitled)',
          url: entry.photo.file_url,
          message: (err as Error).message || 'fetch failed',
        })
      }
      completed++
      report(`Fetching images (${completed}/${total})`)
    }
  }

  const pool: Array<Promise<void>> = []
  for (let i = 0; i < Math.min(FETCH_CONCURRENCY, total); i++) {
    pool.push(worker())
  }
  await Promise.all(pool)

  if (errors.length > 0) {
    const body =
      `The export completed, but ${errors.length} image(s) could not be fetched.\n\n` +
      errors
        .map(
          (e, i) =>
            `${i + 1}. ${e.name}\n   id: ${e.photoId}\n   url: ${e.url}\n   error: ${e.message}\n`,
        )
        .join('\n')
    zip.file('EXPORT_ERRORS.txt', body)
  }

  throwIfAborted(opts.signal)
  opts.onProgress?.(0, 1, 'Compressing ZIP')
  const blob = await zip.generateAsync({
    type: 'blob',
    streamFiles: true,
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  })

  return { blob, errors }
}
