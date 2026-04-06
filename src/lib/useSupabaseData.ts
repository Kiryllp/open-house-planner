'use client'

import { useEffect, useCallback } from 'react'
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
}

export function useSupabaseData(props: UseSupabaseDataProps) {
  const {
    setPhotos, setBoards, setComments,
    updatePhoto, updateBoard,
    addPhoto, addBoard, addComment,
    removePhoto, removeBoard,
    draggingId,
  } = props

  // Load initial data
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
    }

    loadData()
  }, [setPhotos, setBoards, setComments])

  // Realtime subscriptions
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('realtime-all')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'photos' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          addPhoto(payload.new as Photo)
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Photo
          // Skip updates for items being dragged locally
          if (updated.id === draggingId) return
          updatePhoto(updated.id, updated)
        } else if (payload.eventType === 'DELETE') {
          removePhoto((payload.old as any).id)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'boards' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          addBoard(payload.new as Board)
        } else if (payload.eventType === 'UPDATE') {
          const updated = payload.new as Board
          if (updated.id === draggingId) return
          updateBoard(updated.id, updated)
        } else if (payload.eventType === 'DELETE') {
          removeBoard((payload.old as any).id)
        }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comments' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          addComment(payload.new as Comment)
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [addPhoto, addBoard, addComment, updatePhoto, updateBoard, removePhoto, removeBoard, draggingId])
}
