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
