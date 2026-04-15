'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Photo, ZoneId } from '@/lib/types'
import { ZONE_IDS } from '@/lib/types'
import {
  updateConceptGroupLinkTracked,
  updatePhotoTracked,
} from '@/lib/supabaseActions'
import { usePhotoSearch } from '@/lib/usePhotoSearch'
import type { FieldMatches } from '@/lib/searchPhotos'
import { LinkingView } from './LinkingView'
import { PhotoHistoryPanel } from './PhotoHistoryPanel'
import { HighlightedText } from './HighlightedText'

type RealSubTab = 'gallery' | 'link'

interface Props {
  realPhotos: Photo[]
  conceptPhotos: Photo[]
  userName: string
  onPhotoClick: (photo: Photo) => void
  onDelete: (photo: Photo) => void
}

export function RealPhotosView({
  realPhotos,
  conceptPhotos,
  userName,
  onPhotoClick,
  onDelete,
}: Props) {
  const [subTab, setSubTab] = useState<RealSubTab>('gallery')

  const allPhotos = useMemo(
    () => [...realPhotos, ...conceptPhotos],
    [realPhotos, conceptPhotos],
  )

  if (subTab === 'link') {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
          <SubTabButton active={false} onClick={() => setSubTab('gallery')}>Gallery</SubTabButton>
          <SubTabButton active onClick={() => setSubTab('link')}>Quick Link</SubTabButton>
        </div>
        <LinkingView conceptPhotos={conceptPhotos} realPhotos={realPhotos} userName={userName} />
      </div>
    )
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <SubTabButton active onClick={() => setSubTab('gallery')}>Gallery</SubTabButton>
        <SubTabButton active={false} onClick={() => setSubTab('link')}>Quick Link</SubTabButton>
        <span className="ml-auto text-xs text-gray-400">{realPhotos.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {realPhotos.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">
            No real photos yet. Use Upload Photos and select Real.
          </div>
        ) : (
          <div className="space-y-4">
            {realPhotos.map((real) => (
              <RealPhotoRow
                key={real.id}
                real={real}
                conceptPhotos={conceptPhotos}
                allPhotos={allPhotos}
                userName={userName}
                onPhotoClick={onPhotoClick}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SubTabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

function RealPhotoRow({
  real,
  conceptPhotos,
  allPhotos,
  userName,
  onPhotoClick,
  onDelete,
}: {
  real: Photo
  conceptPhotos: Photo[]
  allPhotos: Photo[]
  userName: string
  onPhotoClick: (photo: Photo) => void
  onDelete: (photo: Photo) => void
}) {
  const [busy, setBusy] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [editName, setEditName] = useState(real.name ?? '')
  const [selectedForLink, setSelectedForLink] = useState<Set<string>>(new Set())
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerZoneFilter, setPickerZoneFilter] = useState<ZoneId | null>(null)

  const linkedConcepts = useMemo(
    () => conceptPhotos.filter((c) => c.linked_real_id === real.id),
    [conceptPhotos, real.id],
  )

  const unlinkedConcepts = useMemo(
    () => conceptPhotos.filter((c) => !c.linked_real_id),
    [conceptPhotos],
  )

  // Fuzzy search across unlinked concepts; the zone chip is threaded in as
  // a pre-filter so "zone 3" typed in the box and a chip click reach the
  // same place inside the hook.
  const { results: pickerResults } = usePhotoSearch(unlinkedConcepts, {
    query: pickerSearch,
    zone: pickerZoneFilter,
    type: 'concept',
  })

  const filteredUnlinked = useMemo(() => {
    const realStem = (real.name ?? '').replace(/_v\d+$/i, '').toLowerCase()
    // Preserve the existing stem/zone tiebreaker behavior. Fuse has already
    // sorted by relevance; stem and zone matches still take precedence so a
    // photo that shares the real's filename stem floats to the top.
    return [...pickerResults].sort((a, b) => {
      const aName = (a.photo.name ?? '').replace(/_v\d+$/i, '').toLowerCase()
      const bName = (b.photo.name ?? '').replace(/_v\d+$/i, '').toLowerCase()
      const aStemMatch = realStem && aName.includes(realStem) ? 0 : 1
      const bStemMatch = realStem && bName.includes(realStem) ? 0 : 1
      if (aStemMatch !== bStemMatch) return aStemMatch - bStemMatch
      if (real.zone) {
        const aZone = a.photo.zone === real.zone ? 0 : 1
        const bZone = b.photo.zone === real.zone ? 0 : 1
        if (aZone !== bZone) return aZone - bZone
      }
      if (a.score !== b.score) return a.score - b.score
      return (a.photo.name ?? '').localeCompare(b.photo.name ?? '')
    })
  }, [pickerResults, real.zone, real.name])

  // Lookup of match ranges for per-card highlighting.
  const pickerMatchesById = useMemo(() => {
    const m = new Map<string, FieldMatches>()
    for (const r of pickerResults) m.set(r.photo.id, r.matches)
    return m
  }, [pickerResults])

  async function handleChangeZone(zone: ZoneId) {
    if (busy) return
    const newZone = zone === real.zone ? null : zone
    setBusy(true)
    try {
      await updatePhotoTracked({
        before: real,
        updates: { zone: newZone, zone_rank: null },
        actorName: userName,
      })
      toast.success(newZone ? `Assigned to Zone ${newZone}` : 'Zone removed')
    } catch (err) {
      toast.error((err as Error).message || 'Zone update failed')
    } finally {
      setBusy(false)
    }
  }

  function toggleSelectConcept(conceptId: string) {
    setSelectedForLink((prev) => {
      const next = new Set(prev)
      if (next.has(conceptId)) next.delete(conceptId)
      else next.add(conceptId)
      return next
    })
  }

  async function handleLinkSelected() {
    if (busy || selectedForLink.size === 0) return
    setBusy(true)
    try {
      const selectedConcepts = Array.from(selectedForLink)
        .map((id) => conceptPhotos.find((c) => c.id === id))
        .filter((c): c is Photo => !!c)

      // Dedupe by source_upload_id so multi-selecting two siblings of the
      // same multi-zone upload only triggers one cascade.
      const seenGroups = new Set<string>()
      const groupReps = selectedConcepts.filter((c) => {
        const key = c.source_upload_id ?? `id:${c.id}`
        if (seenGroups.has(key)) return false
        seenGroups.add(key)
        return true
      })

      await Promise.all(
        groupReps.map((concept) =>
          updateConceptGroupLinkTracked({
            concept,
            siblingPool: conceptPhotos,
            realPhotos: allPhotos,
            newRealId: real.id,
            actorName: userName,
          }),
        ),
      )
      toast.success(
        `Linked ${selectedConcepts.length} concept${selectedConcepts.length > 1 ? 's' : ''}`,
      )
      setSelectedForLink(new Set())
    } catch (err) {
      toast.error((err as Error).message || 'Link failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleUnlinkConcept(conceptId: string) {
    if (busy) return
    setBusy(true)
    try {
      const concept = conceptPhotos.find((c) => c.id === conceptId)
      if (!concept) return
      await updateConceptGroupLinkTracked({
        concept,
        siblingPool: conceptPhotos,
        realPhotos: allPhotos,
        newRealId: null,
        actorName: userName,
      })
      toast.success('Unlinked')
    } catch (err) {
      toast.error((err as Error).message || 'Unlink failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveName() {
    const trimmed = editName.trim()
    const newName = trimmed || null
    if (newName === real.name) return
    if (busy) return
    setBusy(true)
    try {
      await updatePhotoTracked({
        before: real,
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

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Left: large real photo */}
        <button
          type="button"
          onClick={() => onPhotoClick(real)}
          className="relative aspect-[4/3] w-full bg-gray-900"
        >
          <img
            src={real.file_url}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-contain"
          />
        </button>

        {/* Right: controls */}
        <div className="flex flex-col gap-4 p-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-700">
              Name
            </label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onBlur={handleSaveName}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              placeholder="Untitled"
              className="w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-sm text-gray-900 outline-none placeholder:text-gray-300 focus:border-blue-400 focus:bg-white"
            />
          </div>

          {/* Zone assignment */}
          <div>
            <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-700">
              Zone
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {ZONE_IDS.map((zone) => (
                <button
                  type="button"
                  key={zone}
                  disabled={busy}
                  onClick={() => handleChangeZone(zone)}
                  className={`rounded-md border px-3 py-1 text-xs font-medium transition ${
                    zone === real.zone
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50'
                  }`}
                >
                  Zone {zone}
                </button>
              ))}
            </div>
          </div>

          {/* Linked concepts */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-700">
                Linked Concepts
                {linkedConcepts.length > 0 && (
                  <span className="ml-1 font-normal text-gray-400">
                    ({linkedConcepts.length})
                  </span>
                )}
              </h3>
              <button
                type="button"
                onClick={() => {
                  const opening = !pickerOpen
                  setPickerOpen(opening)
                  if (opening) {
                    const stem = (real.name ?? '').replace(/_v\d+$/i, '')
                    setPickerSearch(stem)
                    setSelectedForLink(new Set())
                    setPickerZoneFilter(real.zone)
                  }
                }}
                className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
              >
                {pickerOpen ? 'Close picker' : '+ Link concept'}
              </button>
            </div>

            {linkedConcepts.length === 0 && !pickerOpen ? (
              <div className="rounded border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
                No concepts linked yet.
              </div>
            ) : linkedConcepts.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {linkedConcepts.map((concept) => (
                  <div
                    key={concept.id}
                    className="group relative aspect-[4/3] overflow-hidden rounded border border-gray-200"
                  >
                    <button
                      type="button"
                      onClick={() => onPhotoClick(concept)}
                      className="absolute inset-0"
                    >
                      <img
                        src={concept.file_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUnlinkConcept(concept.id)}
                      className="absolute right-0.5 top-0.5 hidden rounded bg-white/90 px-1 py-0.5 text-[9px] font-medium text-red-600 shadow hover:bg-red-500 hover:text-white group-hover:block"
                    >
                      Unlink
                    </button>
                    {concept.zone && (
                      <span className="absolute bottom-0.5 left-0.5 rounded bg-blue-600/80 px-1 py-0.5 text-[9px] font-medium text-white">
                        Z{concept.zone}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {/* Concept picker */}
          {pickerOpen && (
            <div>
              <div className="mb-2 flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setPickerZoneFilter(null)}
                  className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                    !pickerZoneFilter ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  All
                </button>
                {ZONE_IDS.map((z) => (
                  <button
                    key={z}
                    type="button"
                    onClick={() => setPickerZoneFilter(z === pickerZoneFilter ? null : z)}
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                      z === pickerZoneFilter ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    Z{z}
                  </button>
                ))}
              </div>
              <input
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search concepts by name..."
                className="mb-2 w-full rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-400 focus:bg-white"
              />
              <div className="mb-1.5 flex items-center justify-between">
                <div className="text-xs font-medium text-gray-600">
                  {filteredUnlinked.length} concepts
                  {pickerSearch && ` matching "${pickerSearch}"`}
                </div>
                <div className="flex gap-1.5">
                  {filteredUnlinked.length > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setSelectedForLink(new Set(filteredUnlinked.map((r) => r.photo.id)))
                      }}
                      className="rounded bg-gray-200 px-2 py-0.5 text-[11px] font-medium text-gray-700 hover:bg-gray-300 disabled:opacity-50"
                    >
                      Select all {filteredUnlinked.length}
                    </button>
                  )}
                  {selectedForLink.size > 0 && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleLinkSelected}
                      className="rounded bg-blue-600 px-2.5 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      Link {selectedForLink.size} selected
                    </button>
                  )}
                </div>
              </div>
              {filteredUnlinked.length === 0 ? (
                <div className="rounded border border-dashed border-gray-200 py-4 text-center text-xs text-gray-400">
                  {unlinkedConcepts.length === 0
                    ? 'All concepts are already linked.'
                    : pickerSearch
                      ? `No matches for "${pickerSearch}". Try fewer letters or clear the zone filter.`
                      : 'No unlinked concepts in this zone.'}
                </div>
              ) : (
                <div className="grid max-h-[40vh] grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
                  {filteredUnlinked.map(({ photo: concept }) => {
                    const isSelected = selectedForLink.has(concept.id)
                    const conceptMatches = pickerMatchesById.get(concept.id)
                    return (
                      <button
                        type="button"
                        key={concept.id}
                        disabled={busy}
                        onClick={() => toggleSelectConcept(concept.id)}
                        className={`group relative aspect-[4/3] overflow-hidden rounded border-2 transition disabled:opacity-50 ${
                          isSelected
                            ? 'border-blue-500 ring-2 ring-blue-200'
                            : 'border-gray-200 hover:border-blue-300'
                        }`}
                      >
                        <img
                          src={concept.file_url}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        {concept.zone && (
                          <span className="absolute bottom-0.5 left-0.5 rounded bg-blue-600/80 px-1 py-0.5 text-[9px] font-medium text-white">
                            Z{concept.zone}
                          </span>
                        )}
                        {concept.name && (
                          <span className="absolute bottom-0.5 right-0.5 max-w-[80%] truncate rounded bg-black/60 px-1 py-0.5 text-[8px] text-white">
                            <HighlightedText
                              text={concept.name}
                              matches={conceptMatches?.name}
                              markClassName="rounded bg-yellow-200 px-0.5 text-black"
                            />
                          </span>
                        )}
                        {isSelected && (
                          <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow">
                            ✓
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* History (inline collapsible) */}
          <div className="border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => setHistoryOpen((v) => !v)}
              className="flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-gray-700 hover:text-gray-900"
            >
              <span>History</span>
              <span className="text-[10px] text-gray-400">
                {historyOpen ? 'Hide ▴' : 'Show ▾'}
              </span>
            </button>
            {historyOpen && (
              <div className="mt-2 max-h-80 overflow-y-auto rounded border border-gray-100 bg-gray-50/50">
                <PhotoHistoryPanel photoId={real.id} photos={allPhotos} />
              </div>
            )}
          </div>

          {/* Delete */}
          <div className="mt-auto flex justify-end border-t border-gray-100 pt-3">
            <button
              type="button"
              onClick={() => onDelete(real)}
              className="text-xs font-medium text-red-600 hover:underline"
            >
              Delete photo
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
