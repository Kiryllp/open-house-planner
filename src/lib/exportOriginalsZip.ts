import JSZip from 'jszip'
import type { Photo } from './types'

/**
 * Build a polished export ZIP for the events team:
 *
 *   map.png                          rendered floorplan with numbered pins
 *   legend.html                      visual key: pin# -> photo name, zone, notes
 *   zone-1/01_photo_name.jpg         full-res originals organized by zone
 *   zone-2/02_photo_name.jpg
 *   unzoned/03_photo_name.jpg
 *
 * Only non-deleted concepts placed on the map are included.
 */
export async function buildExportZip(
  allPhotos: Photo[],
  mapPngBlob: Blob | null,
): Promise<Blob> {
  const placed = allPhotos.filter(
    (p) =>
      !p.deleted_at &&
      p.type === 'concept' &&
      p.pin_x != null &&
      p.pin_y != null,
  )

  const zip = new JSZip()

  // Build numbered entries
  const entries: Array<{
    index: number
    photo: Photo
    folder: string
    filename: string
  }> = []

  for (let i = 0; i < placed.length; i++) {
    const photo = placed[i]
    const num = String(i + 1).padStart(2, '0')
    const baseName = sanitizeFilename(photo.name || photo.id.slice(0, 8))
    const ext = extractExt(photo.file_url)
    const folder = photo.zone ? `zone-${photo.zone}` : 'unzoned'
    const filename = `${num}_${baseName}.${ext}`

    entries.push({ index: i + 1, photo, folder, filename })
  }

  // Download images into zone folders (cache blobs for sibling duplicates)
  const blobCache = new Map<string, Blob>()
  for (const entry of entries) {
    const subFolder = zip.folder(entry.folder)!

    try {
      let blob = blobCache.get(entry.photo.file_url)
      if (!blob) {
        const res = await fetch(entry.photo.file_url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        blob = await res.blob()
        blobCache.set(entry.photo.file_url, blob)
      }
      subFolder.file(entry.filename, blob)
    } catch (err) {
      subFolder.file(
        `${entry.filename}.ERROR.txt`,
        `Failed to fetch ${entry.photo.file_url}: ${(err as Error).message}`,
      )
    }
  }

  // Add map image
  if (mapPngBlob) {
    zip.file('map.png', mapPngBlob)
  }

  // Generate legend HTML
  zip.file('legend.html', buildLegendHtml(entries))

  return zip.generateAsync({ type: 'blob' })
}

function buildLegendHtml(
  entries: Array<{
    index: number
    photo: Photo
    folder: string
    filename: string
  }>,
): string {
  const rows = entries
    .map((e) => {
      const name = e.photo.name || 'Untitled'
      const zone = e.photo.zone ? `Zone ${e.photo.zone}` : 'Unzoned'
      const notes = e.photo.notes
        ? e.photo.notes.replace(/</g, '&lt;').replace(/>/g, '&gt;')
        : ''
      return `
      <tr>
        <td class="num">${e.index}</td>
        <td class="name">${name.replace(/</g, '&lt;')}</td>
        <td>${zone}</td>
        <td class="file">${e.folder}/${e.filename}</td>
        <td class="notes">${notes}</td>
      </tr>`
    })
    .join('\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Open House Planner — Export Legend</title>
<style>
  body { font-family: system-ui, -apple-system, sans-serif; margin: 2rem; color: #1a1a1a; }
  h1 { font-size: 1.25rem; margin-bottom: 0.25rem; }
  .meta { color: #666; font-size: 0.85rem; margin-bottom: 1.5rem; }
  table { border-collapse: collapse; width: 100%; font-size: 0.85rem; }
  th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #f5f5f5; font-weight: 600; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; }
  .num { text-align: center; font-weight: 700; width: 3rem; }
  .name { font-weight: 500; }
  .file { font-family: monospace; font-size: 0.8rem; color: #555; }
  .notes { max-width: 300px; color: #666; }
  tr:nth-child(even) { background: #fafafa; }
</style>
</head>
<body>
<h1>Open House Planner — Photo Legend</h1>
<p class="meta">Exported ${new Date().toLocaleDateString()} · ${entries.length} photos · Pin numbers match map.png</p>
<table>
  <thead>
    <tr><th class="num">#</th><th>Name</th><th>Zone</th><th>File</th><th>Notes</th></tr>
  </thead>
  <tbody>${rows}
  </tbody>
</table>
</body>
</html>`
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9_\- ]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 60)
    || 'photo'
}

function extractExt(url: string): string {
  const raw = url.split('?')[0].split('.').pop() ?? 'jpg'
  return raw.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
