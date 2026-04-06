'use client'

import { useEffect, useRef } from 'react'
import { createClient } from './supabase/client'
import type { Board, Photo, Comment } from './types'

interface UseSupabaseDataProps {
  setPhotos: (photos: Photo[]) => void
  setBoards: (boards: Board[]) => void
  setComments: (comments: Comment[]) => void
  updatePhoto: (id: string, updates: Partial<Photo>) => void
  updateBoard: (id: string, updates: Partial<Board>) => void
  addPhoto: (photo: Photo) => void
  addBoard: (board: Board) => void
  addComment: (comment: Comment) => void
  removePhoto: (id: string) => void
  removeBoard: (id: string) => void
  draggingId: string | null
  onLoaded?: () => void
}

export function useSupabaseData(props: UseSupabaseDataProps) {
  const {
    setPhotos, setBoards, setComments,
    updatePhoto, updateBoard,
    addPhoto, addBoard, addComment,
    removePhoto, removeBoard,
    draggingId,
    onLoaded,
  } = props

  // Use a REF for draggingId so the subscription callback always reads
  // the latest value without needing to tear down / recreate the channel.
  const draggingIdRef = useRef(draggingId)
  draggingIdRef.current = draggingId

  // Also use refs for the mutation callbacks so the subscription is stable
  const cbRef = useRef({ updatePhoto, updateBoard, addPhoto, addBoard, addComment, removePhoto, removeBoard })
  cbRef.current = { updatePhoto, updateBoard, addPhoto, addBoard, addComment, removePhoto, removeBoard }

  // Load initial data — runs once
  useEffect(() => {
    const supabase = createClient()

    async function loadData() {
      const [photosRes, boardsRes, commentsRes] = await Promise.all([
        supabase.from('photos').select('*').order('created_at', { ascending: true }),
        supabase.from('boards').select('*').order('created_at', { ascending: true }),
        supabase.from('comments').select('*').order('created_at', { ascending: true }),
      ])

      if (photosRes.data) setPhotos(photosRes.data)
      if (boardsRes.data) setBoards(boardsRes.data)
      if (commentsRes.data) setComments(commentsRes.data)
      onLoaded?.()
    }

    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Realtime subscriptions — runs ONCE, never tears down/recreates
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
          // Skip updates for the item currently being dragged locally
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          cbRef.current.addComment(payload.new as Comment)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // Empty deps = subscribe once, never recreate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
