'use client'

import { useEffect, useRef } from 'react'
import { REALTIME_SUBSCRIBE_STATES, type RealtimePostgresChangesPayload } from '@supabase/realtime-js'
import { createClient } from './supabase/client'
import type { Board, Photo } from './types'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

interface UseSupabaseDataProps {
  setPhotos: (photos: Photo[]) => void
  setBoards: (boards: Board[]) => void
  updatePhoto: (id: string, updates: Partial<Photo>) => void
  updateBoard: (id: string, updates: Partial<Board>) => void
  addPhoto: (photo: Photo) => void
  addBoard: (board: Board) => void
  removePhoto: (id: string) => void
  removeBoard: (id: string) => void
  draggingId: string | null
  onLoaded?: () => void
  onError?: (message: string) => void
  onConnectionStatusChange?: (status: ConnectionStatus) => void
}

export function useSupabaseData(props: UseSupabaseDataProps) {
  const {
    setPhotos, setBoards,
    updatePhoto, updateBoard,
    addPhoto, addBoard,
    removePhoto, removeBoard,
    draggingId,
    onLoaded,
    onError,
    onConnectionStatusChange,
  } = props

  const draggingIdRef = useRef(draggingId)
  draggingIdRef.current = draggingId

  const cbRef = useRef({ updatePhoto, updateBoard, addPhoto, addBoard, removePhoto, removeBoard })
  cbRef.current = { updatePhoto, updateBoard, addPhoto, addBoard, removePhoto, removeBoard }

  const lifecycleRef = useRef({ onLoaded, onError, onConnectionStatusChange })
  lifecycleRef.current = { onLoaded, onError, onConnectionStatusChange }
  const loadDataRef = useRef<(() => Promise<void>) | null>(null)

  // Load initial data
  useEffect(() => {
    const supabase = createClient()

    loadDataRef.current = async () => {
      try {
        const [photosRes, boardsRes] = await Promise.all([
          supabase.from('photos').select('*').order('created_at', { ascending: true }),
          supabase.from('boards').select('*').order('created_at', { ascending: true }),
        ])

        if (photosRes.error) throw new Error(`Photos: ${photosRes.error.message}`)
        if (boardsRes.error) throw new Error(`Boards: ${boardsRes.error.message}`)

        if (photosRes.data) setPhotos(photosRes.data)
        if (boardsRes.data) setBoards(boardsRes.data)
        lifecycleRef.current.onLoaded?.()
      } catch (err) {
        console.error('Failed to load data:', err)
        lifecycleRef.current.onError?.((err as Error).message || 'Failed to load data')
      }
    }

    void loadDataRef.current()
  }, [setPhotos, setBoards])

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient()
    let hasConnectedOnce = false
    let shouldReloadOnReconnect = false

    lifecycleRef.current.onConnectionStatusChange?.('connecting')

    const channel = supabase
      .channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, (payload: RealtimePostgresChangesPayload<Photo>) => {
        const cb = cbRef.current
        if (payload.eventType === 'INSERT') {
          cb.addPhoto(payload.new as Photo)
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Photo
          if (updated.id === draggingIdRef.current) return
          cb.updatePhoto(updated.id, updated)
        } else if (payload.eventType === 'DELETE') {
          if (payload.old.id) cb.removePhoto(payload.old.id)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, (payload: RealtimePostgresChangesPayload<Board>) => {
        const cb = cbRef.current
        if (payload.eventType === 'INSERT') {
          cb.addBoard(payload.new as Board)
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Board
          if (updated.id === draggingIdRef.current) return
          cb.updateBoard(updated.id, updated)
        } else if (payload.eventType === 'DELETE') {
          if (payload.old.id) cb.removeBoard(payload.old.id)
        }
      })
      .subscribe((status: REALTIME_SUBSCRIBE_STATES) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          lifecycleRef.current.onConnectionStatusChange?.('connected')
          if (shouldReloadOnReconnect && loadDataRef.current) {
            void loadDataRef.current()
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

    return () => {
      lifecycleRef.current.onConnectionStatusChange?.('connecting')
      void supabase.removeChannel(channel)
    }
  }, [])
}
