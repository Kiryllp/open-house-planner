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
        notes: null,
        tags: null,
        sort_order: null,
        created_by_name: userName || null,
        deleted_at: null,
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
      await updatePhotoDb(concept.id, { zone })
      toast.success(`Moved to Zone ${zone}`)
    } catch (err) {
      toast.error((err as Error).message || 'Move failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (busy) return
    if (!confirm('Delete this photo? Its siblings in other zones stay.')) return
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-gray-800">
              {concept.type === 'concept' ? 'Concept preview' : 'Real photo'}
            </h2>
            {concept.zone && (
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                Zone {concept.zone} · {zoneRankLabel(concept.zone_rank)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            Close
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Preview area */}
          {linkedReal && !showPicker ? (
            <ComparisonSlider leftPhoto={linkedReal} rightPhoto={concept} />
          ) : (
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded border border-gray-100 bg-gray-50">
              <img
                src={concept.file_url}
                alt=""
                className="absolute inset-0 h-full w-full object-contain"
              />
            </div>
          )}

          {/* Link controls */}
          {concept.type === 'concept' && (
            <div className="mt-4 rounded border border-gray-100 p-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold text-gray-600">
                  Linked Real Photo
                </div>
                {linkedReal && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowPicker((v) => !v)}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      {showPicker ? 'Hide picker' : 'Change'}
                    </button>
                    <button
                      type="button"
                      onClick={handleUnlink}
                      className="text-[11px] text-red-600 hover:underline"
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
                  Currently linked to a real photo. Drag the slider above to compare.
                </div>
              ) : null}
            </div>
          )}

          {/* Zone editing for concepts */}
          {concept.type === 'concept' && (
            <div className="mt-4 rounded border border-gray-100 p-3">
              <div className="mb-2 text-xs font-semibold text-gray-600">
                Move to Zone
              </div>
              <div className="flex flex-wrap gap-1.5">
                {ZONE_IDS.map((zone) => (
                  <button
                    type="button"
                    key={zone}
                    disabled={busy || zone === concept.zone}
                    onClick={() => handleChangeZone(zone)}
                    className={`rounded border px-2 py-0.5 text-[11px] ${
                      zone === concept.zone
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50'
                    }`}
                  >
                    Zone {zone}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-4 rounded border border-gray-100 p-3">
            <label className="mb-1 block text-xs font-semibold text-gray-600">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full resize-none rounded border border-gray-200 bg-gray-50 p-2 text-xs focus:bg-white focus:outline-none"
            />
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={handleSaveNotes}
                disabled={busy}
                className="rounded bg-gray-800 px-2 py-0.5 text-[11px] text-white hover:bg-gray-900 disabled:opacity-50"
              >
                Save notes
              </button>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-between border-t border-gray-200 px-4 py-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="text-xs text-red-600 hover:underline disabled:opacity-50"
          >
            Delete
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
