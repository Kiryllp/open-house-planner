'use client'

import { createContext, useContext } from 'react'
import type { Board, Photo, Comment, Annotation, ActivityEntry } from './types'

export interface AppState {
  photos: Photo[]
  boards: Board[]
  comments: Comment[]
  selectedId: string | null
  selectedKind: 'photo' | 'board' | null
  draggingId: string | null
  filters: {
    showReal: boolean
    showConcept: boolean
    showBoards: boolean
    showTrash: boolean
  }
  userName: string
  topCarouselCollapsed: boolean
  bottomCarouselCollapsed: boolean
  selectedPhotoIds: Set<string>
  annotations: Annotation[]
  activityLog: ActivityEntry[]
  showAnnotations: boolean
  coneOpacity: number // 0-1, default 0.7
  drawMode: 'none' | 'text' | 'rectangle' | 'polygon'
}

export interface AppActions {
  setPhotos: (photos: Photo[]) => void
  setBoards: (boards: Board[]) => void
  setComments: (comments: Comment[]) => void
  select: (id: string | null, kind: 'photo' | 'board' | null) => void
  setDraggingId: (id: string | null) => void
  toggleFilter: (key: keyof AppState['filters']) => void
  updatePhoto: (id: string, updates: Partial<Photo>) => void
  updateBoard: (id: string, updates: Partial<Board>) => void
  addPhoto: (photo: Photo) => void
  addBoard: (board: Board) => void
  addComment: (comment: Comment) => void
  removePhoto: (id: string) => void
  removeBoard: (id: string) => void
  togglePhotoVisibility: (id: string) => void
  setPhotoTags: (id: string, tags: string[]) => void
  togglePhotoSelection: (id: string) => void
  clearPhotoSelection: () => void
  toggleTopCarousel: () => void
  toggleBottomCarousel: () => void
  setAnnotations: (annotations: Annotation[]) => void
  addAnnotation: (annotation: Annotation) => void
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void
  removeAnnotation: (id: string) => void
  setActivityLog: (log: ActivityEntry[]) => void
  addActivityEntry: (entry: ActivityEntry) => void
  setShowAnnotations: (show: boolean) => void
  setConeOpacity: (opacity: number) => void
  setDrawMode: (mode: 'none' | 'text' | 'rectangle' | 'polygon') => void
}

export const AppContext = createContext<(AppState & AppActions) | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
