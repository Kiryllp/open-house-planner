'use client'
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { Photo, ZoneId } from '@/lib/types'
import { ZONE_IDS } from '@/lib/types'
import { updatePhotoTracked } from '@/lib/supabaseActions'

interface Props {
  conceptPhotos: Photo[]
  realPhotos: Photo[]
  userName: string
}

export function LinkingView({ conceptPhotos, realPhotos, userName }: Props) {
  const [leftZone, setLeftZone] = useState<ZoneId | null>(null)
  const [rightZone, setRightZone] = useState<ZoneId | null>(null)
  const [leftSearch, setLeftSearch] = useState('')
  const [rightSearch, setRightSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  const unlinkedConcepts = useMemo(() => {
    let list = conceptPhotos.filter((c) => !c.linked_real_id)
    if (leftZone) list = list.filter((c) => c.zone === leftZone)
    if (leftSearch.trim()) {
      const q = leftSearch.toLowerCase()
      list = list.filter((c) => c.name?.toLowerCase().includes(q))
    }
    return list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [conceptPhotos, leftZone, leftSearch])

  const filteredReal = useMemo(() => {
    let list = realPhotos
    if (rightZone) list = list.filter((r) => r.zone === rightZone)
    if (rightSearch.trim()) {
      const q = rightSearch.toLowerCase()
      list = list.filter((r) => r.name?.toLowerCase().includes(q))
    }
    return list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
  }, [realPhotos, rightZone, rightSearch])

  const linkedCount = useMemo(
    () => conceptPhotos.filter((c) => c.linked_real_id).length,
    [conceptPhotos],
  )

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function selectAll() {
    setSelected(new Set(unlinkedConcepts.map((c) => c.id)))
  }

  function clearSelection() {
    setSelected(new Set())
  }

  async function linkToReal(realId: string) {
    if (busy || selected.size === 0) return
    setBusy(true)
    try {
      const ids = Array.from(selected)
      const target = realPhotos.find((r) => r.id === realId) ?? null
      await Promise.all(
        ids.map((id) => {
          const concept = conceptPhotos.find((c) => c.id === id)
          if (!concept) return Promise.resolve()
          const priorReal =
            concept.linked_real_id != null
              ? realPhotos.find((r) => r.id === concept.linked_real_id) ?? null
              : null
          return updatePhotoTracked({
            before: concept,
            updates: { linked_real_id: realId },
            actorName: userName,
            linkedRealName: target?.name ?? null,
            priorLinkedRealName: priorReal?.name ?? null,
          })
        }),
      )
      toast.success(`Linked ${ids.length} concept${ids.length > 1 ? 's' : ''}`)
      setSelected(new Set())
    } catch (err) {
      toast.error((err as Error).message || 'Link failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {/* Stats bar */}
      <div className="flex items-center gap-4 border-b border-gray-200 bg-white px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-800">Link Concepts to Real Photos</h2>
        <div className="flex gap-3 text-xs text-gray-500">
          <span>{unlinkedConcepts.length} unlinked</span>
          <span className="text-gray-300">|</span>
          <span>{linkedCount} linked</span>
        </div>
        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
              {selected.size} selected
            </span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] text-gray-500 hover:text-gray-700"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Two panels */}
      <div className="flex min-h-0 flex-1">
        {/* LEFT: unlinked concepts */}
        <div className="flex w-1/2 flex-col border-r border-gray-200">
          <div className="space-y-2 border-b border-gray-100 bg-gray-50/80 px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                Unlinked Concepts
              </span>
              {unlinkedConcepts.length > 0 && (
                <button
                  type="button"
                  onClick={selected.size === unlinkedConcepts.length ? clearSelection : selectAll}
                  className="text-[10px] font-medium text-blue-600 hover:underline"
                >
                  {selected.size === unlinkedConcepts.length ? 'Deselect all' : `Select all ${unlinkedConcepts.length}`}
                </button>
              )}
            </div>
            <ZoneTabs current={leftZone} onChange={setLeftZone} />
            <input
              type="text"
              value={leftSearch}
              onChange={(e) => setLeftSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-400"
            />
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-50 p-2">
            {unlinkedConcepts.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                {conceptPhotos.filter((c) => !c.linked_real_id).length === 0
                  ? 'All concepts are linked!'
                  : 'No matches for current filters.'}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
                {unlinkedConcepts.map((c) => {
                  const isSel = selected.has(c.id)
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={busy}
                      onClick={() => toggleSelect(c.id)}
                      className={`group relative aspect-square overflow-hidden rounded-md border-2 transition disabled:opacity-50 ${
                        isSel
                          ? 'border-blue-500 ring-2 ring-blue-200'
                          : 'border-transparent hover:border-blue-300'
                      }`}
                    >
                      <img
                        src={c.file_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      {c.zone && (
                        <span className="absolute left-0.5 top-0.5 rounded bg-blue-600/80 px-1 py-px text-[8px] font-medium text-white">
                          Z{c.zone}
                        </span>
                      )}
                      {c.name && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1 pb-0.5 pt-3 text-[8px] text-white">
                          {c.name}
                        </span>
                      )}
                      {isSel && (
                        <span className="absolute right-0.5 top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[9px] font-bold text-white shadow">
                          ✓
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: real photos */}
        <div className="flex w-1/2 flex-col">
          <div className="space-y-2 border-b border-gray-100 bg-gray-50/80 px-3 py-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
              Real Photos
              {selected.size > 0 && (
                <span className="ml-1.5 font-normal normal-case text-blue-600">
                  — click one to link {selected.size} concept{selected.size > 1 ? 's' : ''}
                </span>
              )}
            </span>
            <ZoneTabs current={rightZone} onChange={setRightZone} />
            <input
              type="text"
              value={rightSearch}
              onChange={(e) => setRightSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-full rounded-md border border-gray-200 bg-white px-2 py-1 text-xs text-gray-900 outline-none placeholder:text-gray-400 focus:border-blue-400"
            />
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-50 p-2">
            {filteredReal.length === 0 ? (
              <div className="py-12 text-center text-xs text-gray-400">
                No real photos match current filters.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-5">
                {filteredReal.map((r) => {
                  const linkCount = conceptPhotos.filter(
                    (c) => c.linked_real_id === r.id,
                  ).length
                  return (
                    <button
                      key={r.id}
                      type="button"
                      disabled={busy || selected.size === 0}
                      onClick={() => linkToReal(r.id)}
                      className={`group relative aspect-square overflow-hidden rounded-md border-2 transition ${
                        selected.size > 0
                          ? 'border-transparent hover:border-green-400 hover:ring-2 hover:ring-green-200 disabled:opacity-50'
                          : 'border-transparent opacity-60'
                      }`}
                      title={selected.size > 0 ? `Link ${selected.size} concept(s) here` : 'Select concepts first'}
                    >
                      <img
                        src={r.file_url}
                        alt=""
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                      {r.zone && (
                        <span className="absolute left-0.5 top-0.5 rounded bg-green-600/80 px-1 py-px text-[8px] font-medium text-white">
                          Z{r.zone}
                        </span>
                      )}
                      {linkCount > 0 && (
                        <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-purple-600/90 px-1 text-[8px] font-bold text-white shadow">
                          {linkCount}
                        </span>
                      )}
                      {r.name && (
                        <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/60 to-transparent px-1 pb-0.5 pt-3 text-[8px] text-white">
                          {r.name}
                        </span>
                      )}
                      {selected.size > 0 && (
                        <span className="absolute inset-0 flex items-center justify-center bg-green-500/0 text-transparent transition group-hover:bg-green-500/20 group-hover:text-white">
                          <span className="rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-medium opacity-0 shadow transition group-hover:opacity-100">
                            Link here
                          </span>
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function ZoneTabs({
  current,
  onChange,
}: {
  current: ZoneId | null
  onChange: (z: ZoneId | null) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
          !current
            ? 'border-blue-500 bg-blue-50 text-blue-700'
            : 'border-gray-200 text-gray-500 hover:bg-gray-50'
        }`}
      >
        All
      </button>
      {ZONE_IDS.map((z) => (
        <button
          key={z}
          type="button"
          onClick={() => onChange(z === current ? null : z)}
          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
            z === current
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-gray-200 text-gray-500 hover:bg-gray-50'
          }`}
        >
          Z{z}
        </button>
      ))}
    </div>
  )
}
