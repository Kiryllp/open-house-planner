'use client'

import { useEffect, useRef, useState } from 'react'
import type { RealtimePostgresInsertPayload } from '@supabase/realtime-js'
import { createClient } from './supabase/client'

export type PhotoHistoryEventType =
  | 'uploaded'
  | 'renamed'
  | 'notes_changed'
  | 'zone_changed'
  | 'placed_on_map'
  | 'moved_on_map'
  | 'removed_from_map'
  | 'rotated'
  | 'fov_changed'
  | 'color_changed'
  | 'linked_to_real'
  | 'unlinked_from_real'
  | 'soft_deleted'
  | 'restored'
  | 'hard_deleted'

export interface PhotoHistoryEvent {
  id: string
  photo_id: string
  event_type: PhotoHistoryEventType
  actor_name: string | null
  details: Record<string, unknown>
  created_at: string
}

export interface PhotoHistoryEventInsert {
  photo_id: string
  event_type: PhotoHistoryEventType
  actor_name: string | null
  details: Record<string, unknown>
}

function getClient() {
  return createClient()
}

/**
 * Insert a single history event. Rejects rather than throws so callers
 * can opt into graceful degradation (history loss is less bad than a
 * failing user-visible mutation).
 */
export async function logPhotoEvent(
  photoId: string,
  eventType: PhotoHistoryEventType,
  actorName: string | null,
  details: Record<string, unknown> = {},
): Promise<void> {
  const supabase = getClient()
  const { error } = await supabase.from('photo_history').insert({
    photo_id: photoId,
    event_type: eventType,
    actor_name: actorName && actorName.trim() ? actorName.trim() : null,
    details,
  })
  if (error) throw error
}

/**
 * Insert a batch of history events in a single round trip.
 */
export async function logPhotoEvents(
  events: PhotoHistoryEventInsert[],
): Promise<void> {
  if (events.length === 0) return
  const supabase = getClient()
  const rows = events.map((e) => ({
    photo_id: e.photo_id,
    event_type: e.event_type,
    actor_name: e.actor_name && e.actor_name.trim() ? e.actor_name.trim() : null,
    details: e.details,
  }))
  const { error } = await supabase.from('photo_history').insert(rows)
  if (error) throw error
}

/**
 * Fetch the full history for a photo, newest first.
 */
export async function fetchPhotoHistory(
  photoId: string,
): Promise<PhotoHistoryEvent[]> {
  const supabase = getClient()
  const { data, error } = await supabase
    .from('photo_history')
    .select('*')
    .eq('photo_id', photoId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as PhotoHistoryEvent[]
}

/**
 * For each supplied photo ID, return the pre-first-rename display name
 * — i.e. what `photo.name` was before any user rename happened. Photos
 * that were never renamed are absent from the returned map.
 *
 * Implementation detail: `diffUpdatesToEvents` (in supabaseActions.ts)
 * logs a `renamed` event with `details = { old, new }` on every rename.
 * The *oldest* such event per photo has `details.old` equal to the
 * name the photo was inserted with, which matches the original upload
 * filename sans extension (set by `UploadDialog.tsx` from `file.name`).
 *
 * Fails open: a query error logs a warning and returns an empty Map so
 * the export can still proceed without rename information.
 */
export async function fetchOriginalNames(
  photoIds: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  if (photoIds.length === 0) return result
  const supabase = getClient()
  const { data, error } = await supabase
    .from('photo_history')
    .select('photo_id, details, created_at')
    .in('photo_id', photoIds)
    .eq('event_type', 'renamed')
    .order('created_at', { ascending: true })
  if (error) {
    console.warn('fetchOriginalNames: query failed', error)
    return result
  }
  for (const row of (data ?? []) as Array<{
    photo_id: string
    details: Record<string, unknown> | null
  }>) {
    if (result.has(row.photo_id)) continue
    const old = row.details?.old
    if (typeof old === 'string' && old.length > 0) {
      result.set(row.photo_id, old)
    }
  }
  return result
}

interface UsePhotoHistoryResult {
  events: PhotoHistoryEvent[]
  loading: boolean
  error: string | null
}

/**
 * Hook that loads and live-subscribes to the history for a single
 * photo. Unsubscribes on photoId change or unmount. Pass `null` to
 * suspend loading (e.g., while a modal is closed).
 */
export function usePhotoHistory(photoId: string | null): UsePhotoHistoryResult {
  const [events, setEvents] = useState<PhotoHistoryEvent[]>([])
  const [loading, setLoading] = useState<boolean>(photoId !== null)
  const [error, setError] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!photoId) {
      setEvents([])
      setLoading(false)
      setError(null)
      return
    }

    setLoading(true)
    setError(null)
    let cancelled = false

    fetchPhotoHistory(photoId)
      .then((rows) => {
        if (cancelled) return
        setEvents(rows)
        setLoading(false)
      })
      .catch((err: Error) => {
        if (cancelled) return
        setError(err.message || 'Failed to load history')
        setLoading(false)
      })

    const supabase = getClient()
    const channel = supabase
      .channel(`photo-history-${photoId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'photo_history',
          filter: `photo_id=eq.${photoId}`,
        },
        (payload: RealtimePostgresInsertPayload<PhotoHistoryEvent>) => {
          if (!payload.new) return
          const inserted = payload.new as PhotoHistoryEvent
          setEvents((prev) => {
            if (prev.some((e) => e.id === inserted.id)) return prev
            // Newest first — the realtime insert is almost always the newest,
            // but sort defensively anyway.
            const next = [inserted, ...prev]
            next.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
            return next
          })
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [photoId])

  return { events, loading, error }
}
