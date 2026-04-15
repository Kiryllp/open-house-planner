'use client'
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Photo, ZoneId } from '@/lib/types'
import { ZONE_IDS, zoneRankLabel } from '@/lib/types'
import { parseZonesFromFilename } from '@/lib/parseZones'
import { insertPhotosTracked, uploadPhoto, type PhotoInsert } from '@/lib/supabaseActions'
import { hashFile } from '@/lib/hashFile'
import { createClient } from '@/lib/supabase/client'

type PendingType = 'concept' | 'real'

interface PendingFile {
  /** Stable id we assign up-front so hash/dup maps key on something that doesn't shift on removeFile. */
  uid: string
  file: File
  previewUrl: string
  type: PendingType
  zones: ZoneId[]
}

interface DupExisting {
  id: string
  name: string | null
  type: 'real' | 'concept'
  zone: number | null
  file_url: string
  deleted_at: string | null
}

interface Props {
  files: File[]
  userName: string
  onClose: () => void
  onInserted: (photos: Photo[]) => void
}

export function UploadDialog({ files, userName, onClose, onInserted }: Props) {
  const [pending, setPending] = useState<PendingFile[]>(() =>
    files.map((file, i) => {
      const zones = parseZonesFromFilename(file.name)
      return {
        uid: `u${i}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        type: 'concept' as PendingType,
        zones,
      }
    }),
  )
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({ done: 0, total: 0 })

  // Dedup state: filled in asynchronously by the effect below. Keyed by
  // PendingFile.uid so removeFile / reordering doesn't break the mapping.
  const [hashByUid, setHashByUid] = useState<Map<string, string>>(new Map())
  const [dupByUid, setDupByUid] = useState<Map<string, DupExisting>>(new Map())
  const [dupCheckStatus, setDupCheckStatus] = useState<'pending' | 'ready' | 'error'>('pending')

  // Clean up preview URLs
  useEffect(() => {
    return () => {
      pending.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Hash every pending file once on mount, then query the DB to find any
  // row (active or trashed) that already has the same content. Dups are
  // rendered inline below with a red banner; the user sees them before
  // clicking Upload and can decide whether to remove them.
  useEffect(() => {
    let cancelled = false

    async function run() {
      setDupCheckStatus('pending')

      // Phase 1: hash in parallel with concurrency 3.
      const queue = [...pending]
      const localHashByUid = new Map<string, string>()
      async function hashWorker() {
        while (queue.length > 0) {
          const entry = queue.shift()
          if (!entry) break
          try {
            const hex = await hashFile(entry.file)
            localHashByUid.set(entry.uid, hex)
          } catch (err) {
            console.warn('hashFile failed', entry.file.name, err)
            // No hash means we can't dedup this one — it will upload unchecked.
          }
        }
      }
      await Promise.all([hashWorker(), hashWorker(), hashWorker()])
      if (cancelled) return
      setHashByUid(new Map(localHashByUid))

      // Phase 2: query the DB for every unique hash at once.
      const uniqueHashes = Array.from(new Set(localHashByUid.values()))
      if (uniqueHashes.length === 0) {
        setDupCheckStatus('ready')
        return
      }
      const supabase = createClient()
      const { data, error } = await supabase
        .from('photos')
        .select('id, name, type, zone, file_url, content_hash, deleted_at')
        .in('content_hash', uniqueHashes)
      if (cancelled) return
      if (error) {
        console.error('dedup query failed', error)
        setDupCheckStatus('error')
        return
      }

      // Build hash -> existing row. Prefer ACTIVE rows for display when
      // multiple rows share the same hash (so the banner shows the keeper,
      // not a trashed sibling).
      const existingByHash = new Map<string, DupExisting>()
      const rows = (data ?? []) as DupExisting[] & Array<{ content_hash: string }>
      for (const row of rows as unknown as Array<DupExisting & { content_hash: string }>) {
        const hash = row.content_hash
        const current = existingByHash.get(hash)
        if (!current) {
          existingByHash.set(hash, row)
        } else if (current.deleted_at && !row.deleted_at) {
          existingByHash.set(hash, row)
        }
      }

      const localDupByUid = new Map<string, DupExisting>()
      for (const [uid, hash] of localHashByUid) {
        const existing = existingByHash.get(hash)
        if (existing) localDupByUid.set(uid, existing)
      }
      setDupByUid(localDupByUid)
      setDupCheckStatus('ready')
    }

    run()
    return () => {
      cancelled = true
    }
    // Pending is seeded from files prop on first render and we only want
    // to hash once per dialog open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Intra-batch dedup: if the user dropped the same file twice, mark
  // later copies as dups of the first copy. We fold this into dupByUid
  // implicitly via the derived `effectiveDupByUid` below.
  const effectiveDupByUid = useMemo(() => {
    const out = new Map(dupByUid)
    const seenHashes = new Map<string, PendingFile>() // hash -> first-seen entry
    for (const entry of pending) {
      const h = hashByUid.get(entry.uid)
      if (!h) continue
      if (out.has(entry.uid)) continue // already DB-dup
      const firstSeen = seenHashes.get(h)
      if (firstSeen) {
        // This entry is a dup of an earlier entry in the same batch.
        out.set(entry.uid, {
          id: `batch:${firstSeen.uid}`,
          name: firstSeen.file.name.replace(/\.[^.]+$/, ''),
          type: 'concept',
          zone: null,
          file_url: firstSeen.previewUrl,
          deleted_at: null,
        })
      } else {
        seenHashes.set(h, entry)
      }
    }
    return out
  }, [pending, hashByUid, dupByUid])

  const dupCount = useMemo(
    () => pending.filter((p) => effectiveDupByUid.has(p.uid)).length,
    [pending, effectiveDupByUid],
  )
  const nonDupPending = useMemo(
    () => pending.filter((p) => !effectiveDupByUid.has(p.uid)),
    [pending, effectiveDupByUid],
  )

  const canSubmit = useMemo(
    () =>
      dupCheckStatus !== 'pending' &&
      nonDupPending.length > 0 &&
      nonDupPending.every((p) => p.type === 'real' || p.zones.length > 0),
    [dupCheckStatus, nonDupPending],
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

  function removeAllDuplicates() {
    setPending((prev) => {
      for (const p of prev) {
        if (effectiveDupByUid.has(p.uid)) URL.revokeObjectURL(p.previewUrl)
      }
      return prev.filter((p) => !effectiveDupByUid.has(p.uid))
    })
  }

  async function handleConfirm() {
    if (!canSubmit || uploading) return
    if (nonDupPending.length === 0) return
    setUploading(true)
    setUploadProgress({ done: 0, total: nonDupPending.length })

    const allInserted: Photo[] = []
    let errorCount = 0
    const queue = [...nonDupPending]

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
          const contentHash = hashByUid.get(entry.uid) ?? null

          if (entry.type === 'real') {
            const row: PhotoInsert = basePhoto({
              file_url: fileUrl,
              type: 'real',
              zone: entry.zones[0] ?? null,
              zone_rank: null,
              source_upload_id: sourceUploadId,
              userName,
              name: photoName,
              content_hash: contentHash,
            })
            const inserted = await insertPhotosTracked([row], userName)
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
                content_hash: contentHash,
              }),
            )
            const inserted = await insertPhotosTracked(rows, userName)
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
    const successCount = nonDupPending.length - errorCount
    if (successCount > 0) {
      const suffix = errorCount > 0 ? `, ${errorCount} failed` : ''
      toast.success(`Uploaded ${successCount} file${successCount > 1 ? 's' : ''}${suffix}`)
    }
    setUploading(false)
    if (errorCount === 0) {
      onClose()
    }
  }

  const uploadButtonLabel = (() => {
    if (uploading) {
      return `Uploading ${uploadProgress.done + 1} of ${uploadProgress.total}…`
    }
    if (dupCheckStatus === 'pending') return 'Checking for duplicates…'
    if (pending.length === 0) return 'Upload'
    if (nonDupPending.length === 0) return 'All files are duplicates'
    if (dupCount > 0) {
      return `Upload ${nonDupPending.length} (skipping ${dupCount} duplicate${dupCount > 1 ? 's' : ''})`
    }
    return `Upload ${nonDupPending.length}`
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">
            Upload Photos ({pending.length})
            {dupCount > 0 && (
              <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-medium text-red-700">
                {dupCount} duplicate{dupCount > 1 ? 's' : ''} found
              </span>
            )}
            {dupCheckStatus === 'pending' && (
              <span className="ml-2 text-[11px] font-normal text-gray-400">checking…</span>
            )}
            {dupCheckStatus === 'error' && (
              <span className="ml-2 text-[11px] font-normal text-amber-600">
                dup check failed — will re-check on upload
              </span>
            )}
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

        {dupCount > 0 && (
          <div className="flex items-center gap-2 border-b border-red-100 bg-red-50 px-4 py-2 text-[11px] text-red-700">
            <span className="flex-1">
              {dupCount === 1
                ? '1 file already exists in the project and will be skipped on upload.'
                : `${dupCount} files already exist and will be skipped on upload.`}
            </span>
            <button
              type="button"
              onClick={removeAllDuplicates}
              disabled={uploading}
              className="rounded-md border border-red-300 bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-100"
            >
              Remove duplicates
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto divide-y divide-gray-100">
          {pending.map((entry, idx) => {
            const dup = effectiveDupByUid.get(entry.uid)
            const isDup = !!dup
            return (
              <div
                key={entry.uid}
                className={`flex gap-3 p-4 ${isDup ? 'bg-red-50/70' : ''}`}
              >
                <div className="relative">
                  <img
                    src={entry.previewUrl}
                    alt=""
                    className={`h-20 w-20 rounded object-cover ${isDup ? 'opacity-60' : ''}`}
                  />
                  {isDup && (
                    <span className="absolute -top-1 -right-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white shadow">
                      DUP
                    </span>
                  )}
                </div>
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

                  {isDup && dup && (
                    <div className="mt-2 flex items-center gap-2 rounded-md border border-red-200 bg-white px-2 py-1.5">
                      <img
                        src={dup.file_url}
                        alt=""
                        className="h-10 w-10 rounded object-cover"
                      />
                      <div className="min-w-0 flex-1 text-[11px]">
                        <div className="font-semibold text-red-700">
                          {dup.id.startsWith('batch:')
                            ? 'Duplicate of another file in this batch'
                            : `Already ${dup.deleted_at ? 'in Trash' : 'uploaded'} as`}
                        </div>
                        {!dup.id.startsWith('batch:') && (
                          <div className="truncate text-gray-700">
                            {dup.name || '(unnamed)'}
                            <span className="ml-1 text-gray-400">
                              · {dup.type}
                              {dup.zone != null ? ` · Zone ${dup.zone}` : ''}
                              {dup.deleted_at ? ' · trashed' : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {!isDup && (
                    <>
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

                      <div className="mt-2">
                        <div className="mb-1 text-[11px] text-gray-500">
                          {entry.type === 'concept' ? 'Zones' : 'Zone'}{' '}
                          {entry.type === 'concept' && entry.zones.length === 0 && (
                            <span className="text-red-500">
                              (pick at least one)
                            </span>
                          )}
                          {entry.type === 'real' && entry.zones.length === 0 && (
                            <span className="text-gray-400">
                              (optional)
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
                                {active && entry.type === 'concept' && (
                                  <span className="ml-1 text-[9px] text-blue-500">
                                    {zoneRankLabel(rank + 1)}
                                  </span>
                                )}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          })}
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
            {uploadButtonLabel}
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
  content_hash: string | null
}): PhotoInsert {
  return {
    file_url: args.file_url,
    type: args.type,
    zone: args.zone,
    zone_rank: args.zone_rank,
    source_upload_id: args.source_upload_id,
    content_hash: args.content_hash,
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
