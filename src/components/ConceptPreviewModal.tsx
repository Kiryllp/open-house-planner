'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Photo, ZoneId } from '@/lib/types'
import { ZONE_IDS, zoneRankLabel } from '@/lib/types'
import { ComparisonSlider } from './ComparisonSlider'
import { RealPhotoPicker } from './RealPhotoPicker'
import {
  linkConceptToReal,
  updatePhotoDb,
  uploadPhoto,
  insertPhotos,
  softDeletePhoto,
  type PhotoInsert,
} from '@/lib/supabaseActions'

interface Props {
  concept: Photo
  realPhotos: Photo[]
  userName: string
  onClose: () => void
}

export function ConceptPreviewModal({
  concept,
  realPhotos,
  userName,
  onClose,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [showPicker, setShowPicker] = useState(!concept.linked_real_id)
  const [notes, setNotes] = useState(concept.notes ?? '')
  const [editName, setEditName] = useState(concept.name ?? '')
  const [direction, setDirection] = useState(concept.direction_deg)
  const [fov, setFov] = useState(concept.fov_deg)
  const [coneLen, setConeLen] = useState(concept.cone_length)

  const linkedReal = useMemo(
    () => realPhotos.find((r) => r.id === concept.linked_real_id) ?? null,
    [realPhotos, concept.linked_real_id],
  )

  async function handlePickReal(realId: string) {
    if (busy) return
    setBusy(true)
    try {
      await linkConceptToReal(concept.id, realId)
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
      await linkConceptToReal(concept.id, null)
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
      const [inserted] = await insertPhotos([row])
      if (inserted) {
        await linkConceptToReal(concept.id, inserted.id)
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
      await updatePhotoDb(concept.id, { zone, zone_rank: null })
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
      await softDeletePhoto(concept.id)
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
    setBusy(true)
    try {
      await updatePhotoDb(concept.id, { notes: notes || null })
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
      await updatePhotoDb(concept.id, { name: newName })
      toast.success('Name saved')
    } catch (err) {
      toast.error((err as Error).message || 'Rename failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveCone() {
    if (busy) return
    setBusy(true)
    try {
      await updatePhotoDb(concept.id, {
        direction_deg: direction,
        fov_deg: fov,
        cone_length: coneLen,
      })
    } catch (err) {
      toast.error((err as Error).message || 'Cone update failed')
    } finally {
      setBusy(false)
    }
  }

  const isConcept = concept.type === 'concept'
  const needsZone = concept.zone == null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
              {isConcept ? 'Concept' : 'Real'}
            </span>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="Untitled"
              className="min-w-0 flex-1 border-b border-transparent bg-transparent text-base font-semibold text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-400"
            />
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
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-sm text-gray-500 hover:bg-gray-100"
          >
            Close
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {/* LEFT: preview image */}
          <div className="flex min-h-0 items-center justify-center bg-gray-900/95 p-4">
            {linkedReal && !showPicker ? (
              <div className="w-full max-h-full">
                <ComparisonSlider leftPhoto={linkedReal} rightPhoto={concept} />
              </div>
            ) : (
              <img
                src={concept.file_url}
                alt=""
                className="max-h-full max-w-full rounded object-contain"
              />
            )}
          </div>

          {/* RIGHT: controls, scrollable */}
          <div className="flex min-h-0 flex-col overflow-y-auto border-l border-gray-200">
            <section className="border-b border-gray-100 p-4">
              <div className="mb-2 flex items-center gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Zone
                </h3>
                {needsZone && (
                  <span className="text-[10px] text-amber-600">
                    Pick one to assign this photo
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ZONE_IDS.map((zone) => (
                  <button
                    type="button"
                    key={zone}
                    disabled={busy || zone === concept.zone}
                    onClick={() => handleChangeZone(zone)}
                    className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                      zone === concept.zone
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50'
                    }`}
                  >
                    Zone {zone}
                  </button>
                ))}
              </div>
            </section>

            {isConcept && concept.pin_x != null && (
              <section className="border-b border-gray-100 p-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-700">
                  Cone / Direction
                </h3>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-[11px] text-gray-600">
                    <span className="w-16 shrink-0">Direction</span>
                    <input
                      type="range"
                      min={0}
                      max={360}
                      value={direction}
                      onChange={(e) => setDirection(Number(e.target.value))}
                      onMouseUp={handleSaveCone}
                      onTouchEnd={handleSaveCone}
                      className="flex-1"
                    />
                    <span className="w-8 text-right tabular-nums">{direction}°</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-gray-600">
                    <span className="w-16 shrink-0">FOV</span>
                    <input
                      type="range"
                      min={10}
                      max={180}
                      value={fov}
                      onChange={(e) => setFov(Number(e.target.value))}
                      onMouseUp={handleSaveCone}
                      onTouchEnd={handleSaveCone}
                      className="flex-1"
                    />
                    <span className="w-8 text-right tabular-nums">{fov}°</span>
                  </label>
                  <label className="flex items-center gap-2 text-[11px] text-gray-600">
                    <span className="w-16 shrink-0">Length</span>
                    <input
                      type="range"
                      min={20}
                      max={300}
                      value={coneLen}
                      onChange={(e) => setConeLen(Number(e.target.value))}
                      onMouseUp={handleSaveCone}
                      onTouchEnd={handleSaveCone}
                      className="flex-1"
                    />
                    <span className="w-8 text-right tabular-nums">{coneLen}</span>
                  </label>
                </div>
              </section>
            )}

            <section className="border-b border-gray-100 p-4">
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-gray-700">
                Notes
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Add a note about this photo..."
                className="w-full resize-none rounded-md border border-gray-200 bg-gray-50 p-2 text-xs focus:border-blue-400 focus:bg-white focus:outline-none"
              />
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveNotes}
                  disabled={busy}
                  className="rounded-md bg-gray-800 px-3 py-1 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-50"
                >
                  Save notes
                </button>
              </div>
            </section>

            {isConcept && (
              <section className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                    Linked Real Photo
                  </h3>
                  {linkedReal && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowPicker((v) => !v)}
                        className="text-[11px] font-medium text-blue-600 hover:underline"
                      >
                        {showPicker ? 'Hide picker' : 'Change'}
                      </button>
                      <button
                        type="button"
                        onClick={handleUnlink}
                        className="text-[11px] font-medium text-red-600 hover:underline"
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
                  <div className="text-[11px] text-gray-500">
                    Linked. Use the slider in the preview to compare.
                  </div>
                ) : (
                  <div className="text-[11px] text-gray-500">
                    Not linked yet.{' '}
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
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-gray-200 bg-gray-50 px-5 py-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-gray-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-gray-800"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
