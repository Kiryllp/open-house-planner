'use client'

import { useEffect, useRef } from 'react'
import { createClient } from './supabase/client'
import type { Board, Photo } from './types'

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
}

export function useSupabaseData(props: UseSupabaseDataProps) {
  const {
    setPhotos, setBoards,
    updatePhoto, updateBoard,
    addPhoto, addBoard,
    removePhoto, removeBoard,
    draggingId,
    onLoaded,
  } = props

  const draggingIdRef = useRef(draggingId)
  draggingIdRef.current = draggingId

  const cbRef = useRef({ updatePhoto, updateBoard, addPhoto, addBoard, removePhoto, removeBoard })
  cbRef.current = { updatePhoto, updateBoard, addPhoto, addBoard, removePhoto, removeBoard }

  // Load initial data
  useEffect(() => {
    const supabase = createClient()

    async function loadData() {
      const [photosRes, boardsRes] = await Promise.all([
        supabase.from('photos').select('*').order('created_at', { ascending: true }),
        supabase.from('boards').select('*').order('created_at', { ascending: true }),
      ])

      if (photosRes.data) setPhotos(photosRes.data)
      if (boardsRes.data) setBoards(boardsRes.data)
      onLoaded?.()
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, (payload) => {
        const cb = cbRef.current
        if (payload.eventType === 'INSERT') {
          cb.addPhoto(payload.new as Photo)
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Photo
          if (updated.id === draggingIdRef.current) return
          cb.updatePhoto(updated.id, updated)
        } else if (payload.eventType === 'DELETE') {
          cb.removePhoto((payload.old as any).id)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, (payload) => {
        const cb = cbRef.current
        if (payload.eventType === 'INSERT') {
          cb.addBoard(payload.new as Board)
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Board
          if (updated.id === draggingIdRef.current) return
          cb.updateBoard(updated.id, updated)
        } else if (payload.eventType === 'DELETE') {
          cb.removeBoard((payload.old as any).id)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
