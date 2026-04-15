'use client'

import { useMemo, useState } from 'react'
import {
  Upload,
  Pencil,
  FileText,
  Tag,
  MapPin,
  Move,
  RotateCw,
  Palette,
  Link as LinkIcon,
  Link2Off,
  Trash2,
  ArchiveRestore,
  CircleDashed,
} from 'lucide-react'
import {
  usePhotoHistory,
  type PhotoHistoryEvent,
  type PhotoHistoryEventType,
} from '@/lib/photoHistory'
import type { Photo } from '@/lib/types'
import { zoneRankLabel } from '@/lib/types'

interface Props {
  photoId: string | null
  photos?: Photo[]
}

// All lucide-react icons share this type, so `typeof Upload` works as
// the shared icon type without pulling in LucideIcon (not always exported
// depending on the lucide-react version).
type IconComponent = typeof Upload

const EVENT_META: Record<
  PhotoHistoryEventType,
  { icon: IconComponent; color: string }
> = {
  uploaded: { icon: Upload, color: 'text-blue-600 bg-blue-50' },
  renamed: { icon: Pencil, color: 'text-gray-600 bg-gray-100' },
  notes_changed: { icon: FileText, color: 'text-gray-600 bg-gray-100' },
  zone_changed: { icon: Tag, color: 'text-indigo-600 bg-indigo-50' },
  placed_on_map: { icon: MapPin, color: 'text-emerald-600 bg-emerald-50' },
  moved_on_map: { icon: Move, color: 'text-emerald-600 bg-emerald-50' },
  removed_from_map: {
    icon: CircleDashed,
    color: 'text-amber-600 bg-amber-50',
  },
  rotated: { icon: RotateCw, color: 'text-emerald-600 bg-emerald-50' },
  fov_changed: { icon: RotateCw, color: 'text-emerald-600 bg-emerald-50' },
  color_changed: { icon: Palette, color: 'text-purple-600 bg-purple-50' },
  linked_to_real: { icon: LinkIcon, color: 'text-fuchsia-600 bg-fuchsia-50' },
  unlinked_from_real: {
    icon: Link2Off,
    color: 'text-fuchsia-600 bg-fuchsia-50',
  },
  soft_deleted: { icon: Trash2, color: 'text-red-600 bg-red-50' },
  restored: { icon: ArchiveRestore, color: 'text-green-600 bg-green-50' },
  hard_deleted: { icon: Trash2, color: 'text-red-700 bg-red-100' },
}

function readString(details: Record<string, unknown>, key: string): string | null {
  const v = details[key]
  if (typeof v === 'string') return v
  if (v == null) return null
  return String(v)
}

function readNumber(details: Record<string, unknown>, key: string): number | null {
  const v = details[key]
  return typeof v === 'number' ? v : null
}

function formatZone(zone: number | null | undefined, rank?: number | null): string {
  if (zone == null) return 'no zone'
  const label = zoneRankLabel(rank ?? null)
  return label ? `Zone ${zone} (${label})` : `Zone ${zone}`
}

function truncate(s: string | null, max = 40): string {
  if (!s) return ''
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

function formatXY(pt: unknown): string {
  if (!pt || typeof pt !== 'object') return '?'
  const p = pt as { x?: unknown; y?: unknown }
  const x = typeof p.x === 'number' ? p.x.toFixed(1) : '?'
  const y = typeof p.y === 'number' ? p.y.toFixed(1) : '?'
  return `(${x}%, ${y}%)`
}

function describeEvent(
  ev: PhotoHistoryEvent,
  realNameLookup: (realId: string | null | undefined) => string | null,
): string {
  const d = ev.details
  switch (ev.event_type) {
    case 'uploaded': {
      const type = readString(d, 'type') ?? 'photo'
      const zoneVal = d.zone
      const zones = Array.isArray(d.zones) ? (d.zones as unknown[]) : []
      const backfill = d.backfill === true
      const parts: string[] = []
      parts.push(`Uploaded as ${type}`)
      if (zones.length > 0) {
        parts.push(`in Zone ${zones.join(', ')}`)
      } else if (typeof zoneVal === 'number') {
        parts.push(`in Zone ${zoneVal}`)
      }
      if (backfill) parts.push('(backfilled)')
      return parts.join(' ')
    }
    case 'renamed': {
      const oldName = readString(d, 'old')
      const newName = readString(d, 'new')
      if (!oldName) return `Named "${truncate(newName)}"`
      if (!newName) return `Cleared name (was "${truncate(oldName)}")`
      return `Renamed "${truncate(oldName)}" → "${truncate(newName)}"`
    }
    case 'notes_changed': {
      const oldNotes = readString(d, 'old')
      const newNotes = readString(d, 'new')
      if (!oldNotes && newNotes) return `Added notes`
      if (oldNotes && !newNotes) return `Cleared notes`
      return `Edited notes`
    }
    case 'zone_changed': {
      const oldZone = readNumber(d, 'old_zone')
      const newZone = readNumber(d, 'new_zone')
      const oldRank = readNumber(d, 'old_rank')
      const newRank = readNumber(d, 'new_rank')
      return `Moved from ${formatZone(oldZone, oldRank)} to ${formatZone(newZone, newRank)}`
    }
    case 'placed_on_map': {
      const x = readNumber(d, 'pin_x')
      const y = readNumber(d, 'pin_y')
      const color = readString(d, 'color')
      const autoColor = d.auto_assigned_color === true
      const loc =
        x != null && y != null ? `at (${x.toFixed(1)}%, ${y.toFixed(1)}%)` : ''
      const colorNote = color
        ? autoColor
          ? ` (color auto-assigned)`
          : ''
        : ''
      return `Placed on map ${loc}${colorNote}`.trim()
    }
    case 'moved_on_map': {
      return `Moved pin ${formatXY(d.old)} → ${formatXY(d.new)}`
    }
    case 'removed_from_map': {
      return `Removed from map ${formatXY(d.old)}`
    }
    case 'rotated': {
      const oldDeg = readNumber(d, 'old_deg')
      const newDeg = readNumber(d, 'new_deg')
      return `Rotated ${oldDeg ?? '?'}° → ${newDeg ?? '?'}°`
    }
    case 'fov_changed': {
      const oldFov = readNumber(d, 'old_fov')
      const newFov = readNumber(d, 'new_fov')
      return `Field of view ${oldFov ?? '?'}° → ${newFov ?? '?'}°`
    }
    case 'color_changed': {
      const oldColor = readString(d, 'old_color') ?? 'none'
      const newColor = readString(d, 'new_color') ?? 'none'
      return `Pin color ${oldColor} → ${newColor}`
    }
    case 'linked_to_real': {
      const realId = readString(d, 'real_id')
      const cachedName = readString(d, 'real_name')
      const liveName = realNameLookup(realId)
      const name = liveName ?? cachedName ?? 'a real photo'
      return `Linked to "${truncate(name)}"`
    }
    case 'unlinked_from_real': {
      const priorId = readString(d, 'prior_real_id')
      const cachedName = readString(d, 'prior_real_name')
      const liveName = realNameLookup(priorId)
      const name = liveName ?? cachedName
      return name ? `Unlinked from "${truncate(name)}"` : 'Unlinked from real photo'
    }
    case 'soft_deleted':
      return 'Moved to trash'
    case 'restored':
      return 'Restored from trash'
    case 'hard_deleted':
      return 'Permanently deleted'
    default:
      return ev.event_type
  }
}

function formatRelativeTime(iso: string, now: number): string {
  const ts = new Date(iso).getTime()
  if (Number.isNaN(ts)) return iso
  const diffMs = now - ts
  if (diffMs < 0) return 'just now'
  const sec = Math.floor(diffMs / 1000)
  if (sec < 10) return 'just now'
  if (sec < 60) return `${sec}s ago`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 30) return `${day}d ago`
  const month = Math.floor(day / 30)
  if (month < 12) return `${month}mo ago`
  const year = Math.floor(day / 365)
  return `${year}y ago`
}

export function PhotoHistoryPanel({ photoId, photos }: Props) {
  const { events, loading, error } = usePhotoHistory(photoId)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const now = Date.now()

  const realNameLookup = useMemo(() => {
    return (realId: string | null | undefined): string | null => {
      if (!realId || !photos) return null
      const hit = photos.find((p) => p.id === realId)
      return hit?.name ?? null
    }
  }, [photos])

  // Group consecutive same-actor events within a 2s window visually.
  const grouped = useMemo(() => {
    const out: Array<PhotoHistoryEvent & { _subdued: boolean }> = []
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]
      const prev = events[i - 1]
      const sameActor =
        prev != null &&
        prev.actor_name === ev.actor_name &&
        Math.abs(
          new Date(prev.created_at).getTime() -
            new Date(ev.created_at).getTime(),
        ) <= 2000
      out.push({ ...ev, _subdued: sameActor })
    }
    return out
  }, [events])

  if (loading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-10 animate-pulse rounded bg-gray-100"
          />
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-xs text-red-600">
        Failed to load history: {error}
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-gray-400">
        No history yet.
      </div>
    )
  }

  return (
    <ul className="divide-y divide-gray-100">
      {grouped.map((ev) => {
        const meta = EVENT_META[ev.event_type] ?? EVENT_META.uploaded
        const Icon = meta.icon
        const actor = ev.actor_name || 'Unknown'
        const isExpanded = expandedId === ev.id
        const label = describeEvent(ev, realNameLookup)
        return (
          <li
            key={ev.id}
            className={`px-4 py-2.5 transition hover:bg-gray-50 ${
              ev._subdued ? 'opacity-70' : ''
            }`}
          >
            <button
              type="button"
              onClick={() =>
                setExpandedId((prev) => (prev === ev.id ? null : ev.id))
              }
              className="flex w-full items-start gap-2.5 text-left"
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${meta.color}`}
              >
                <Icon size={12} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-700">
                    {actor}
                  </span>
                  <span className="min-w-0 truncate text-xs text-gray-800">
                    {label}
                  </span>
                  <span
                    className="ml-auto text-[10px] text-gray-400"
                    title={new Date(ev.created_at).toLocaleString()}
                  >
                    {formatRelativeTime(ev.created_at, now)}
                  </span>
                </div>
                {isExpanded && (
                  <pre className="mt-1.5 max-h-48 overflow-auto rounded bg-gray-50 p-2 font-mono text-[10px] leading-snug text-gray-600">
                    {JSON.stringify(ev.details, null, 2)}
                  </pre>
                )}
              </div>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

