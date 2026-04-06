'use client'

import { useEffect, useRef } from 'react'
import { createClient } from './supabase/client'
import type { Board, Photo, Comment, Annotation, ActivityEntry } from './types'

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
  setAnnotations?: (annotations: Annotation[]) => void
  addAnnotation?: (annotation: Annotation) => void
  updateAnnotation?: (id: string, updates: Partial<Annotation>) => void
  removeAnnotation?: (id: string) => void
  setActivityLog?: (log: ActivityEntry[]) => void
  addActivityEntry?: (entry: ActivityEntry) => void
}

export function useSupabaseData(props: UseSupabaseDataProps) {
  const {
    setPhotos, setBoards, setComments,
    updatePhoto, updateBoard,
    addPhoto, addBoard, addComment,
    removePhoto, removeBoard,
    draggingId,
    onLoaded,
    setAnnotations, addAnnotation, updateAnnotation, removeAnnotation,
    setActivityLog, addActivityEntry,
  } = props

  // Use a REF for draggingId so the subscription callback always reads
  // the latest value without needing to tear down / recreate the channel.
  const draggingIdRef = useRef(draggingId)
  draggingIdRef.current = draggingId

  // Also use refs for the mutation callbacks so the subscription is stable
  const cbRef = useRef({ updatePhoto, updateBoard, addPhoto, addBoard, addComment, removePhoto, removeBoard, addAnnotation, updateAnnotation, removeAnnotation, addActivityEntry })
  cbRef.current = { updatePhoto, updateBoard, addPhoto, addBoard, addComment, removePhoto, removeBoard, addAnnotation, updateAnnotation, removeAnnotation, addActivityEntry }

  // Load initial data — runs once
  useEffect(() => {
    const supabase = createClient()

    async function loadData() {
      const [photosRes, boardsRes, commentsRes, annotationsRes, activityRes] = await Promise.all([
        supabase.from('photos').select('*').order('created_at', { ascending: true }),
        supabase.from('boards').select('*').order('created_at', { ascending: true }),
        supabase.from('comments').select('*').order('created_at', { ascending: true }),
        supabase.from('annotations').select('*').order('created_at', { ascending: true }),
        supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100),
      ])

      if (photosRes.data) setPhotos(photosRes.data)
      if (boardsRes.data) setBoards(boardsRes.data)
      if (commentsRes.data) setComments(commentsRes.data)
      if (annotationsRes.data) setAnnotations?.(annotationsRes.data)
      if (activityRes.data) setActivityLog?.(activityRes.data)
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'annotations' }, (payload) => {
        const cb = cbRef.current
        if (payload.eventType === 'INSERT') cb.addAnnotation?.(payload.new as Annotation)
        else if (payload.eventType === 'UPDATE') cb.updateAnnotation?.(payload.new.id, payload.new as Annotation)
        else if (payload.eventType === 'DELETE') cb.removeAnnotation?.((payload.old as any).id)
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'activity_log' }, (payload) => {
        if (payload.eventType === 'INSERT') cbRef.current.addActivityEntry?.(payload.new as ActivityEntry)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // Empty deps = subscribe once, never recreate
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
