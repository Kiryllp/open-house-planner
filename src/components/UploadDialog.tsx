'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Photo, ZoneId } from '@/lib/types'
import { ZONE_IDS, zoneRankLabel } from '@/lib/types'
import { parseZonesFromFilename } from '@/lib/parseZones'
import { insertPhotos, uploadPhoto, type PhotoInsert } from '@/lib/supabaseActions'

type PendingType = 'concept' | 'real'

interface PendingFile {
  file: File
  previewUrl: string
  type: PendingType
  zones: ZoneId[]
}

interface Props {
  files: File[]
  userName: string
  onClose: () => void
  onInserted: (photos: Photo[]) => void
}

export function UploadDialog({ files, userName, onClose, onInserted }: Props) {
  const [pending, setPending] = useState<PendingFile[]>(() =>
    files.map((file) => {
      const zones = parseZonesFromFilename(file.name)
      return {
        file,
        previewUrl: URL.createObjectURL(file),
        type: 'concept' as PendingType,
        zones,
      }
    }),
  )
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 })

  // Clean up preview URLs
  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const canSubmit = useMemo(
    () =>
      pending.every(
        (p) => p.type === 'real' || p.zones.length > 0,
      ) && pending.length > 0,
    [pending],
  )

  function toggleZone(idx: number, zone: ZoneId) {
    setPending((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p
        const has = p.zones.includes(zone)
        return {
          ...p,
          zones: has ? p.zones.filter((z) => z !== zone) : [...p.zones, zone],
        }
      }),
    )
  }

  function setType(idx: number, type: PendingType) {
    setPending((prev) => prev.map((p, i) => (i === idx ? { ...p, type } : p)))
  }

  function removeFile(idx: number) {
    setPending((prev) => {
      const dropped = prev[idx]
      if (dropped) URL.revokeObjectURL(dropped.previewUrl)
      return prev.filter((_, i) => i !== idx)
    })
  }

  async function handleConfirm() {
    if (!canSubmit || uploading) return
    setUploading(true)
    const total = pending.length
    setUploadProgress({ done: 0, total })

    const allInserted: Photo[] = []
    let errorCount = 0
    const queue = [...pending]

    async function worker() {
      while (queue.length > 0) {
        const entry = queue.shift()
        if (!entry) break
        try {
          const fileUrl = await uploadPhoto(entry.file)
          const sourceUploadId =
            typeof crypto !== 'undefined' && 'randomUUID' in crypto
              ? crypto.randomUUID()
              : `upload-${Date.now()}-${Math.random()}`

          const photoName = entry.file.name.replace(/\.[^.]+$/, '')

          if (entry.type === 'real') {
            const row: PhotoInsert = basePhoto({
              file_url: fileUrl,
              type: 'real',
              zone: null,
              zone_rank: null,
              source_upload_id: sourceUploadId,
              userName,
              name: photoName,
            })
            const inserted = await insertPhotos([row])
            allInserted.push(...inserted)
          } else {
            const rows: PhotoInsert[] = entry.zones.map((zone, i) =>
              basePhoto({
                file_url: fileUrl,
                type: 'concept',
                zone,
                zone_rank: i + 1,
                source_upload_id: sourceUploadId,
                userName,
                name: photoName,
              }),
            )
            const inserted = await insertPhotos(rows)
            allInserted.push(...inserted)
          }
        } catch (err) {
          errorCount++
          console.error(`Upload failed: ${entry.file.name}`, err)
          toast.error(`${entry.file.name}: ${(err as Error).message || 'Upload failed'}`)
        }
        setUploadProgress((prev) => ({ ...prev, done: prev.done + 1 }))
      }
    }

    const concurrency = 3
    await Promise.all(Array.from({ length: concurrency }, () => worker()))

    if (allInserted.length > 0) {
      onInserted(allInserted)
    }
    const successCount = total - errorCount
    if (successCount > 0) {
      toast.success(`Uploaded ${successCount} file(s)${errorCount > 0 ? `, ${errorCount} failed` : ''}`)
    }
    setUploading(false)
    if (errorCount === 0) {
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Upload Photos ({pending.length})
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="text-gray-400 hover:text-gray-600"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {pending.map((entry, idx) => (
            <div key={entry.file.name + idx} className="flex gap-3 p-4">
              <img
                src={entry.previewUrl}
                alt=""
                className="h-20 w-20 rounded object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-gray-800">
                      {entry.file.name}
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {(entry.file.size / 1024).toFixed(0)} KB
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFile(idx)}
                    disabled={uploading}
                    className="text-xs text-gray-400 hover:text-red-500"
                  >
                    Remove
                  </button>
                </div>

                <div className="mt-2 flex items-center gap-2 text-[11px]">
                  <span className="text-gray-500">Type:</span>
                  <button
                    type="button"
                    onClick={() => setType(idx, 'concept')}
                    className={`rounded-full px-2 py-0.5 ${
                      entry.type === 'concept'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Concept
                  </button>
                  <button
                    type="button"
                    onClick={() => setType(idx, 'real')}
                    className={`rounded-full px-2 py-0.5 ${
                      entry.type === 'real'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Real
                  </button>
                </div>

                {entry.type === 'concept' && (
                  <div className="mt-2">
                    <div className="mb-1 text-[11px] text-gray-500">
                      Zones{' '}
                      {entry.zones.length === 0 && (
                        <span className="text-red-500">
                          (pick at least one)
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {ZONE_IDS.map((zone) => {
                        const rank = entry.zones.indexOf(zone)
                        const active = rank !== -1
                        return (
                          <button
                            type="button"
                            key={zone}
                            onClick={() => toggleZone(idx, zone)}
                            className={`rounded-md border px-2 py-0.5 text-[11px] ${
                              active
                                ? 'border-blue-500 bg-blue-50 text-blue-700'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                            }`}
                          >
                            Zone {zone}
                            {active && (
                              <span className="ml-1 text-[9px] text-blue-500">
                                {zoneRankLabel(rank + 1)}
                              </span>
                            )}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={uploading}
            className="rounded-md px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canSubmit || uploading}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300"
          >
            {uploading
              ? `Uploading ${uploadProgress.done + 1} of ${uploadProgress.total}…`
              : 'Upload'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function basePhoto(args: {
  file_url: string
  type: 'real' | 'concept'
  zone: ZoneId | null
  zone_rank: number | null
  source_upload_id: string
  userName: string
  name: string | null
}): PhotoInsert {
  return {
    file_url: args.file_url,
    type: args.type,
    zone: args.zone,
    zone_rank: args.zone_rank,
    source_upload_id: args.source_upload_id,
    pin_x: null,
    pin_y: null,
    direction_deg: 0,
    fov_deg: 70,
    cone_length: 120,
    linked_real_id: null,
    color: null,
    name: args.name,
    notes: null,
    tags: null,
    sort_order: null,
    created_by_name: args.userName || null,
    deleted_at: null,
    is_anchor: false,
  }
}
