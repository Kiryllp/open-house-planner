'use client'

import { createContext, useContext } from 'react'
import type { Photo } from './types'

export type TopTab = 'real' | 'concept' | 'trash'

export interface AppState {
  photos: Photo[]
  selectedId: string | null
  draggingId: string | null
  tab: TopTab
  userName: string
}

export interface AppActions {
  setPhotos: (photos: Photo[]) => void
  select: (id: string | null) => void
  setDraggingId: (id: string | null) => void
  updatePhoto: (id: string, updates: Partial<Photo>) => void
  addPhoto: (photo: Photo) => void
  removePhoto: (id: string) => void
  setTab: (tab: TopTab) => void
}

export const AppContext = createContext<(AppState & AppActions) | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
