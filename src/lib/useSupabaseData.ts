'use client'

import { useEffect, useRef } from 'react'
import { REALTIME_SUBSCRIBE_STATES, type RealtimePostgresChangesPayload } from '@supabase/realtime-js'
import { createClient } from './supabase/client'
import type { Photo } from './types'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface UserPresence {
  userName: string
}

interface UseSupabaseDataProps {
  setPhotos: (photos: Photo[]) => void
  updatePhoto: (id: string, updates: Partial<Photo>) => void
  addPhoto: (photo: Photo) => void
  removePhoto: (id: string) => void
  draggingId: string | null
  userName: string
  onLoaded?: () => void
  onError?: (message: string) => void
  onConnectionStatusChange?: (status: ConnectionStatus) => void
  onPresenceChange?: (users: UserPresence[]) => void
}

export function useSupabaseData(props: UseSupabaseDataProps) {
  const {
    setPhotos,
    updatePhoto,
    addPhoto,
    removePhoto,
    draggingId,
    userName,
    onLoaded,
    onError,
    onConnectionStatusChange,
    onPresenceChange,
  } = props

  const draggingIdRef = useRef(draggingId)
  draggingIdRef.current = draggingId

  const cbRef = useRef({ updatePhoto, addPhoto, removePhoto })
  cbRef.current = { updatePhoto, addPhoto, removePhoto }

  const lifecycleRef = useRef({ onLoaded, onError, onConnectionStatusChange, onPresenceChange })
  lifecycleRef.current = { onLoaded, onError, onConnectionStatusChange, onPresenceChange }

  const userNameRef = useRef(userName)
  userNameRef.current = userName

  const loadDataRef = useRef<(() => Promise<void>) | null>(null)

  // Initial load
  useEffect(() => {
    const supabase = createClient()

    loadDataRef.current = async () => {
      try {
        const res = await supabase
          .from('photos')
          .select('*')
          .order('created_at', { ascending: true })
        if (res.error) {
          console.error('Photos query failed:', res.error)
          throw new Error(`Photos: ${res.error.message}`)
        }
        if (res.data) setPhotos(res.data as Photo[])
        lifecycleRef.current.onLoaded?.()
      } catch (err) {
        console.error('Failed to load data:', err)
        lifecycleRef.current.onError?.((err as Error).message || 'Failed to load data')
      }
    }

    void loadDataRef.current()
  }, [setPhotos])

  // Realtime subscriptions + presence
  useEffect(() => {
    const supabase = createClient()
    let hasConnectedOnce = false
    let shouldReloadOnReconnect = false
    let isReloading = false

    lifecycleRef.current.onConnectionStatusChange?.('connecting')

    const channel = supabase
      .channel('realtime-photos')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'photos' },
        (payload: RealtimePostgresChangesPayload<Photo>) => {
          if (isReloading) return
          const cb = cbRef.current
          if (payload.eventType === 'INSERT') {
            if (payload.new) cb.addPhoto(payload.new as Photo)
          } else if (payload.eventType === 'UPDATE') {
            if (!payload.new) return
            const updated = payload.new as Photo
            if (updated.id === draggingIdRef.current) return
            cb.updatePhoto(updated.id, updated)
          } else if (payload.eventType === 'DELETE') {
            const oldRow = payload.old as Partial<Photo> | null
            if (oldRow?.id) cb.removePhoto(oldRow.id)
          }
        },
      )
      .subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          lifecycleRef.current.onConnectionStatusChange?.('connected')
          if (shouldReloadOnReconnect && loadDataRef.current) {
            isReloading = true
            void loadDataRef.current().finally(() => { isReloading = false })
          }
          hasConnectedOnce = true
          shouldReloadOnReconnect = false
          return
        }
        if (
          status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
          status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT ||
          status === REALTIME_SUBSCRIBE_STATES.CLOSED
        ) {
          lifecycleRef.current.onConnectionStatusChange?.('disconnected')
          shouldReloadOnReconnect = hasConnectedOnce
        }
      })

    const presenceKey = userName || 'anonymous'
    const presenceChannel = supabase.channel('user-presence', {
      config: { presence: { key: presenceKey } },
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        const users: UserPresence[] = []
        Object.values(state).forEach((presences: unknown) => {
          ;(presences as Array<{ userName?: string }>).forEach((p) => {
            if (p.userName && p.userName !== userNameRef.current) {
              users.push({ userName: p.userName })
            }
          })
        })
        lifecycleRef.current.onPresenceChange?.(users)
      })
      .subscribe(async (status: REALTIME_SUBSCRIBE_STATES) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          await presenceChannel.track({ userName: userNameRef.current })
        }
      })

    return () => {
      lifecycleRef.current.onConnectionStatusChange?.('connecting')
      void supabase.removeChannel(channel)
      void supabase.removeChannel(presenceChannel)
    }
  }, [userName])
}
