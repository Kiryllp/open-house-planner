'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Photo, ZoneId } from '@/lib/types'
import { ZONE_IDS, zoneRankLabel } from '@/lib/types'
import { ComparisonSlider } from './ComparisonSlider'
import { RealPhotoPicker } from './RealPhotoPicker'
import { PhotoHistoryPanel } from './PhotoHistoryPanel'
import {
  insertPhotoTracked,
  softDeletePhotoTracked,
  updateConceptGroupLinkTracked,
  updatePhotoTracked,
  uploadPhoto,
  type PhotoInsert,
} from '@/lib/supabaseActions'
import { hashFile } from '@/lib/hashFile'

type Tab = 'overview' | 'history'

interface Props {
  concept: Photo
  realPhotos: Photo[]
  allPhotos: Photo[]
  userName: string
  onClose: () => void
}

export function ConceptPreviewModal({
  concept,
  realPhotos,
  allPhotos,
  userName,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<Tab>('overview')
  const [showPicker, setShowPicker] = useState(!concept.linked_real_id)
  const [notes, setNotes] = useState(concept.notes ?? '')
  const [editName, setEditName] = useState(concept.name ?? '')

  const linkedReal = useMemo(
    () => realPhotos.find((r) => r.id === concept.linked_real_id) ?? null,
    [realPhotos, concept.linked_real_id],
  )

  async function handlePickReal(realId: string) {
    if (busy) return
    setBusy(true)
    try {
      await updateConceptGroupLinkTracked({
        concept,
        siblingPool: allPhotos,
        realPhotos,
        newRealId: realId,
        actorName: userName,
      })
      setShowPicker(false)
      toast.success('Linked')
    } catch (err) {
      toast.error((err as Error).message || 'Link failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlink() {
    if (busy) return
    setBusy(true)
    try {
      await updateConceptGroupLinkTracked({
        concept,
        siblingPool: allPhotos,
        realPhotos,
        newRealId: null,
        actorName: userName,
      })
      setShowPicker(true)
      toast.success('Unlinked')
    } catch (err) {
      toast.error((err as Error).message || 'Unlink failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleUploadNewReal(files: File[]) {
    if (busy || files.length === 0) return
    setBusy(true)
    try {
      const file = files[0]
      // Hash first so the new row carries content_hash, same as the
      // UploadDialog path. We don't dedup-check here — the user is
      // explicitly linking a fresh real to this concept.
      let contentHash: string | null = null
      try {
        contentHash = await hashFile(file)
      } catch (err) {
        console.warn('hashFile failed in handleUploadNewReal', err)
      }
      const fileUrl = await uploadPhoto(file)
      const sourceUploadId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `upload-${Date.now()}`
      const row: PhotoInsert = {
        file_url: fileUrl,
        type: 'real',
        zone: null,
        zone_rank: null,
        source_upload_id: sourceUploadId,
        content_hash: contentHash,
        pin_x: null,
        pin_y: null,
        direction_deg: 0,
        fov_deg: 70,
        cone_length: 120,
        linked_real_id: null,
        color: null,
        name: file.name.replace(/\.[^.]+$/, ''),
        notes: null,
        tags: null,
        sort_order: null,
        created_by_name: userName || null,
        deleted_at: null,
        is_anchor: false,
      }
      const inserted = await insertPhotoTracked(row, userName)
      if (inserted) {
        // Include the freshly-inserted real in the name-lookup pool so the
        // history event records its display name (it isn't in `realPhotos`
        // yet because the parent hasn't re-rendered).
        await updateConceptGroupLinkTracked({
          concept,
          siblingPool: allPhotos,
          realPhotos: [...realPhotos, inserted],
          newRealId: inserted.id,
          actorName: userName,
        })
        setShowPicker(false)
        toast.success('Uploaded and linked')
      }
    } catch (err) {
      toast.error((err as Error).message || 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleChangeZone(zone: ZoneId) {
    if (busy) return
    setBusy(true)
    try {
      await updatePhotoTracked({
        before: concept,
        updates: { zone, zone_rank: null },
        actorName: userName,
      })
      toast.success(`Moved to Zone ${zone}`)
    } catch (err) {
      toast.error((err as Error).message || 'Move failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (busy) return
    setBusy(true)
    try {
      await softDeletePhotoTracked(concept, userName)
      toast.success('Deleted')
      onClose()
    } catch (err) {
      toast.error((err as Error).message || 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveNotes() {
    if (busy) return
    const newNotes = notes || null
    if (newNotes === concept.notes) return
    setBusy(true)
    try {
      await updatePhotoTracked({
        before: concept,
        updates: { notes: newNotes },
        actorName: userName,
      })
      toast.success('Saved')
    } catch (err) {
      toast.error((err as Error).message || 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveName() {
    const trimmed = editName.trim()
    const newName = trimmed || null
    if (newName === concept.name) return
    if (busy) return
    setBusy(true)
    try {
      await updatePhotoTracked({
        before: concept,
        updates: { name: newName },
        actorName: userName,
      })
      toast.success('Name saved')
    } catch (err) {
      toast.error((err as Error).message || 'Rename failed')
    } finally {
      setBusy(false)
    }
  }

  const isConcept = concept.type === 'concept'
  const needsZone = concept.zone == null

  return (
    <div className="fixed right-0 top-0 z-50 flex h-full w-[600px] max-w-[45vw] flex-col border-l border-gray-200 bg-white shadow-2xl">
        {/* Header */}
        <header className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400">
              {isConcept ? 'Concept' : 'Real'}
            </span>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="Untitled"
              className="min-w-0 flex-1 border-b border-transparent bg-transparent text-sm font-semibold text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-400"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M1 1L13 13M13 1L1 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        {/* Tab bar */}
        <div className="flex shrink-0 items-center gap-1 border-b border-gray-200 bg-white px-3 py-1.5">
          <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
            Overview
          </TabButton>
          <TabButton active={tab === 'history'} onClick={() => setTab('history')}>
            History
          </TabButton>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {tab === 'overview' ? (
            <>
              {/* Large preview image */}
              <div className="bg-gray-900">
                {linkedReal && !showPicker ? (
                  <div className="aspect-[4/3] w-full">
                    <ComparisonSlider leftPhoto={linkedReal} rightPhoto={concept} />
                  </div>
                ) : (
                  <div className="flex aspect-[4/3] w-full items-center justify-center p-3">
                    <img
                      src={concept.file_url}
                      alt=""
                      className="max-h-full max-w-full rounded object-contain"
                    />
                  </div>
                )}
              </div>

              {/* Zone badge bar */}
              <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
                {concept.zone ? (
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                    Zone {concept.zone} · {zoneRankLabel(concept.zone_rank)}
                  </span>
                ) : (
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                    No zone
                  </span>
                )}
              </div>

              {/* Zone picker */}
              <section className="border-b border-gray-100 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-2">
                  <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                    Zone
                  </h3>
                  {needsZone && (
                    <span className="text-[10px] text-amber-600">Assign one</span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {ZONE_IDS.map((zone) => (
                    <button
                      type="button"
                      key={zone}
                      disabled={busy || zone === concept.zone}
                      onClick={() => handleChangeZone(zone)}
                      className={`rounded-md border px-2.5 py-0.5 text-[11px] font-medium transition ${
                        zone === concept.zone
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50'
                      }`}
                    >
                      Z{zone}
                    </button>
                  ))}
                </div>
              </section>

              {/* Notes */}
              <section className="border-b border-gray-100 px-4 py-3">
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Add a note..."
                  className="w-full resize-none rounded-md border border-gray-200 bg-gray-50 p-2 text-xs focus:border-blue-400 focus:bg-white focus:outline-none"
                />
                <div className="mt-1.5 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveNotes}
                    disabled={busy}
                    className="rounded-md bg-gray-800 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-gray-900 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </section>

              {/* Linked real photo */}
              {isConcept && (
                <section className="px-4 py-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                      Linked Real Photo
                    </h3>
                    {linkedReal && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => setShowPicker((v) => !v)}
                          className="text-[10px] font-medium text-blue-600 hover:underline"
                        >
                          {showPicker ? 'Hide' : 'Change'}
                        </button>
                        <button
                          type="button"
                          onClick={handleUnlink}
                          className="text-[10px] font-medium text-red-600 hover:underline"
                        >
                          Unlink
                        </button>
                      </div>
                    )}
                  </div>
                  {showPicker ? (
                    <RealPhotoPicker
                      realPhotos={realPhotos}
                      currentLinkedId={concept.linked_real_id}
                      onPick={handlePickReal}
                      onUploadNew={handleUploadNewReal}
                    />
                  ) : linkedReal ? (
                    <div className="text-[10px] text-gray-500">
                      Linked. Use the slider above to compare.
                    </div>
                  ) : (
                    <div className="text-[10px] text-gray-500">
                      Not linked.{' '}
                      <button
                        type="button"
                        onClick={() => setShowPicker(true)}
                        className="font-medium text-blue-600 hover:underline"
                      >
                        Link to a real photo
                      </button>
                    </div>
                  )}
                </section>
              )}
            </>
          ) : (
            <PhotoHistoryPanel photoId={concept.id} photos={allPhotos} />
          )}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 items-center justify-between border-t border-gray-200 bg-gray-50 px-4 py-2.5">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="text-[11px] font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800"
          >
            Done
          </button>
        </footer>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md px-3 py-1 text-xs font-medium transition ${
        active
          ? 'bg-gray-900 text-white'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
      }`}
    >
      {children}
    </button>
  )
}
