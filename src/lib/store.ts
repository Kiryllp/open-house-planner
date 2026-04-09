'use client'

import { createContext, useContext } from 'react'
import type { Board, Photo, AppMode } from './types'

export interface AppState {
  photos: Photo[]
  boards: Board[]
  mode: AppMode
  selectedId: string | null
  selectedKind: 'photo' | 'board' | null
  draggingId: string | null
  showAllPhotos: boolean
  userName: string
}

export interface AppActions {
  setPhotos: (photos: Photo[]) => void
  setBoards: (boards: Board[]) => void
  select: (id: string | null, kind: 'photo' | 'board' | null) => void
  setDraggingId: (id: string | null) => void
  updatePhoto: (id: string, updates: Partial<Photo>) => void
  updateBoard: (id: string, updates: Partial<Board>) => void
  addPhoto: (photo: Photo) => void
  addBoard: (board: Board) => void
  removePhoto: (id: string) => void
  removeBoard: (id: string) => void
  enterBoardFocus: (boardId: string) => void
  exitBoardFocus: () => void
  assignPhotoToBoard: (photoId: string, boardId: string) => void
  unassignPhoto: (photoId: string) => void
  toggleShowAllPhotos: () => void
}

export const AppContext = createContext<(AppState & AppActions) | null>(null)

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
