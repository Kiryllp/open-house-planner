'use client'

import { useEffect, useRef } from 'react'
import { REALTIME_SUBSCRIBE_STATES, type RealtimePostgresChangesPayload } from '@supabase/realtime-js'
import { createClient } from './supabase/client'
import type { Board, Photo } from './types'

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

export interface UserPresence {
  userName: string
  boardId: string | null
}

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
  userName: string
  currentBoardId: string | null
  onLoaded?: () => void
  onError?: (message: string) => void
  onConnectionStatusChange?: (status: ConnectionStatus) => void
  onPresenceChange?: (users: UserPresence[]) => void
}

export function useSupabaseData(props: UseSupabaseDataProps) {
  const {
    setPhotos, setBoards,
    updatePhoto, updateBoard,
    addPhoto, addBoard,
    removePhoto, removeBoard,
    draggingId,
    userName,
    currentBoardId,
    onLoaded,
    onError,
    onConnectionStatusChange,
    onPresenceChange,
  } = props

  const draggingIdRef = useRef(draggingId)
  draggingIdRef.current = draggingId

  const cbRef = useRef({ updatePhoto, updateBoard, addPhoto, addBoard, removePhoto, removeBoard })
  cbRef.current = { updatePhoto, updateBoard, addPhoto, addBoard, removePhoto, removeBoard }

  const lifecycleRef = useRef({ onLoaded, onError, onConnectionStatusChange, onPresenceChange })
  lifecycleRef.current = { onLoaded, onError, onConnectionStatusChange, onPresenceChange }

  const userNameRef = useRef(userName)
  userNameRef.current = userName
  const currentBoardIdRef = useRef(currentBoardId)
  currentBoardIdRef.current = currentBoardId
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

        if (photosRes.error) {
          console.error('Photos query failed:', photosRes.error.code, photosRes.error.message, photosRes.error.details, photosRes.error.hint)
          throw new Error(`Photos: ${photosRes.error.message}`)
        }
        if (boardsRes.error) {
          console.error('Boards query failed:', boardsRes.error.code, boardsRes.error.message, boardsRes.error.details, boardsRes.error.hint)
          throw new Error(`Boards: ${boardsRes.error.message}`)
        }

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

    let isReloading = false

    const channel = supabase
      .channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, (payload: RealtimePostgresChangesPayload<Photo>) => {
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
          if (payload.old?.id) cb.removePhoto(payload.old.id)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, (payload: RealtimePostgresChangesPayload<Board>) => {
        if (isReloading) return
        const cb = cbRef.current
        if (payload.eventType === 'INSERT') {
          if (payload.new) cb.addBoard(payload.new as Board)
        } else if (payload.eventType === 'UPDATE') {
          if (!payload.new) return
          const updated = payload.new as Board
          if (updated.id === draggingIdRef.current) return
          cb.updateBoard(updated.id, updated)
        } else if (payload.eventType === 'DELETE') {
          if (payload.old?.id) cb.removeBoard(payload.old.id)
        }
      })
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
      config: { presence: { key: presenceKey } }
    })

    presenceChannel
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        const users: UserPresence[] = []
        Object.values(state).forEach((presences: unknown) => {
          (presences as any[]).forEach((p: any) => {
            if (p.userName !== userNameRef.current) {
              users.push({ userName: p.userName, boardId: p.boardId })
            }
          })
        })
        lifecycleRef.current.onPresenceChange?.(users)
      })
      .subscribe(async (status: REALTIME_SUBSCRIBE_STATES) => {
        if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
          await presenceChannel.track({
            userName: userNameRef.current,
            boardId: currentBoardIdRef.current
          })
        }
      })

    return () => {
      lifecycleRef.current.onConnectionStatusChange?.('connecting')
      void supabase.removeChannel(channel)
      void supabase.removeChannel(presenceChannel)
    }
  }, [userName])

  // Re-track presence when currentBoardId changes
  useEffect(() => {
    const supabase = createClient()
    const presenceKey = userName || 'anonymous'
    const channels = supabase.getChannels()
    const presenceChannel = channels.find((ch: any) => ch.topic === 'realtime:user-presence')
    if (presenceChannel) {
      void presenceChannel.track({
        userName,
        boardId: currentBoardId
      })
    }
  }, [currentBoardId, userName])
}
