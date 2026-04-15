import JSZip from 'jszip'
import type { Photo } from './types'

/**
 * Build a print-handoff ZIP entirely in the browser:
 *
 *   originals/<zone><rank>_<id>.<ext>   original image files
 *   manifest.json                        per-photo pin coords + zones
 *
 * Only photos that are (a) not deleted, (b) type 'concept', and (c) placed
 * on the map (pin_x not null) are included — these are what the events team
 * actually uses. Duplicate file URLs are fetched only once.
 */
export async function buildOriginalsZip(allPhotos: Photo[]): Promise<Blob> {
  const used = allPhotos.filter(
    (p) =>
      !p.deleted_at &&
      p.type === 'concept' &&
      p.pin_x != null &&
      p.pin_y != null,
  )

  const zip = new JSZip()
  const folder = zip.folder('originals')!

  const seenUrls = new Map<string, string>() // url -> filename (shared across siblings)
  const manifest: Array<Record<string, unknown>> = []

  for (const photo of used) {
    const filename = safeFilename(photo)
    manifest.push({
      id: photo.id,
      filename,
      zone: photo.zone,
      zone_rank: photo.zone_rank,
      pin_x: photo.pin_x,
      pin_y: photo.pin_y,
      direction_deg: photo.direction_deg,
      fov_deg: photo.fov_deg,
      cone_length: photo.cone_length,
      source_upload_id: photo.source_upload_id,
      linked_real_id: photo.linked_real_id,
      notes: photo.notes,
    })

    if (seenUrls.has(photo.file_url)) continue
    seenUrls.set(photo.file_url, filename)

    try {
      const res = await fetch(photo.file_url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      folder.file(filename, blob)
    } catch (err) {
      folder.file(
        `${filename}.ERROR.txt`,
        `Failed to fetch ${photo.file_url}: ${(err as Error).message}`,
      )
    }
  }

  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        photoCount: used.length,
        photos: manifest,
      },
      null,
      2,
    ),
  )

  return zip.generateAsync({ type: 'blob' })
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

function safeFilename(photo: Photo): string {
  const rawExt = photo.file_url.split('?')[0].split('.').pop() ?? 'jpg'
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
  const zonePart = photo.zone ? `z${photo.zone}` : 'nozone'
  const rankPart = photo.zone_rank ? `r${photo.zone_rank}` : ''
  return `${zonePart}${rankPart}_${photo.id.slice(0, 8)}.${ext}`
}
