'use client'
/* eslint-disable @next/next/no-img-element */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { toast } from 'sonner'
import { AppContext, type AppState, type AppActions } from '@/lib/store'
import { useSupabaseData, type UserPresence } from '@/lib/useSupabaseData'
import {
  uploadPhoto,
  insertPhoto,
  updatePhotoDb,
  insertBoard,
  updateBoardDb,
  hardDeleteBoards,
  hardDeletePhotos,
} from '@/lib/supabaseActions'
import type { Photo, Board, AppMode } from '@/lib/types'
import { useUndoRedo } from '@/lib/undoRedo'
import { TopBar } from './TopBar'
import { BoardFocusPanel } from './BoardFocusPanel'
import { PhotoPin } from './PhotoPin'
import { BoardPin } from './BoardPin'
import { Upload, ImagePlus, Plus, Loader2, Camera, Lightbulb, MapPin, Eye, EyeOff } from 'lucide-react'

interface MainScreenProps {
  userName: string
  onChangeName: (name: string) => void
}

type UploadProgressItem = {
  id: string
  name: string
  size: number
  done: boolean
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected'

const DRAG_DISTANCE_THRESHOLD = 6
const DRAG_HOLD_THRESHOLD_MS = 120
const DRAG_FORCE_THRESHOLD = 14
const PANEL_TRANSITION_MS = 220

export function MainScreen({ userName, onChangeName }: MainScreenProps) {
  // Core state
  const [photos, setPhotos] = useState<Photo[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [mode, setMode] = useState<AppMode>({ kind: 'overview' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<'photo' | 'board' | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [galleryTab, setGalleryTab] = useState<'potential' | 'all'>('potential')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'board' | 'photo'; id: string; label: string } | null>(null)

  // Place photo on map mode
  const [placingPhotoId, setPlacingPhotoId] = useState<string | null>(null)

  // Drag-over feedback
  const [dragOverCount, setDragOverCount] = useState(0)

  // Upload progress
  const [uploading, setUploading] = useState<UploadProgressItem[]>([])
  const [photoActionIds, setPhotoActionIds] = useState<string[]>([])
  const [boardLabelDraft, setBoardLabelDraft] = useState<string | null>(null)
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting')
  const [panelBoardId, setPanelBoardId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  // Map photo filter: which photo pins to show in overview mode
  type MapPhotoFilter = 'none' | 'real' | 'concept' | 'all'
  const [mapPhotoFilter, setMapPhotoFilter] = useState<MapPhotoFilter>('none')

  // Presence
  const [presenceUsers, setPresenceUsers] = useState<UserPresence[]>([])

  // Floor plan error
  const [floorplanError, setFloorplanError] = useState(false)

  // Refs
  const canvasRef = useRef<HTMLDivElement>(null)
  const floorplanRef = useRef<HTMLElement | null>(null)
  const dragStartRef = useRef<{ id: string; kind: 'photo' | 'board'; startX: number; startY: number; pinX: number; pinY: number; startedAt: number } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleJustFinishedRef = useRef(false)
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null)
  const lastConnectionStatusRef = useRef<ConnectionStatus>('connecting')
  const dragAbortRef = useRef<AbortController | null>(null)
  const modeRef = useRef(mode)
  modeRef.current = mode
  const photosRef = useRef(photos)
  photosRef.current = photos
  const boardsRef = useRef(boards)
  boardsRef.current = boards

  // Undo/redo
  const { execute: pushUndo, undo, redo, canUndo, canRedo } = useUndoRedo()

  // Actions
  const select = useCallback((id: string | null, kind: 'photo' | 'board' | null) => {
    setSelectedId(id)
    setSelectedKind(kind)
  }, [])

  const updatePhoto = useCallback((id: string, updates: Partial<Photo>) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, ...updates } : p)))
  }, [])

  const updateBoard = useCallback((id: string, updates: Partial<Board>) => {
    setBoards((prev) => prev.map((b) => (b.id === id ? { ...b, ...updates } : b)))
  }, [])

  const addPhoto = useCallback((photo: Photo) => {
    setPhotos((prev) => {
      if (prev.some((p) => p.id === photo.id)) return prev
      return [...prev, photo]
    })
  }, [])

  const addBoard = useCallback((board: Board) => {
    setBoards((prev) => {
      if (prev.some((b) => b.id === board.id)) return prev
      return [...prev, board]
    })
  }, [])

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
    setPhotoActionIds((prev) => prev.filter((photoId) => photoId !== id))
  }, [])

  const removeBoard = useCallback((id: string) => {
    setBoards((prev) => prev.filter((b) => b.id !== id))
    // Auto-exit board focus if the focused board was deleted (e.g. by another user)
    setMode(prev => {
      if (prev.kind === 'board-focus' && prev.boardId === id) {
        return { kind: 'overview' }
      }
      return prev
    })
  }, [])

  const enterBoardFocus = useCallback((boardId: string) => {
    setMode({ kind: 'board-focus', boardId })
    setSelectedId(null)
    setSelectedKind(null)
  }, [])

  const exitBoardFocus = useCallback(() => {
    setMode({ kind: 'overview' })
    setSelectedId(null)
    setSelectedKind(null)
  }, [])

  const updatePendingPhotoIds = useCallback((ids: string[], pending: boolean) => {
    const uniqueIds = Array.from(new Set(ids))
    setPhotoActionIds((prev) => {
      if (pending) return Array.from(new Set([...prev, ...uniqueIds]))
      const toRemove = new Set(uniqueIds)
      return prev.filter((id) => !toRemove.has(id))
    })
  }, [])

  const assignPhotoToBoard = useCallback((photoId: string, boardId: string) => {
    const targetPhoto = photos.find((photo) => photo.id === photoId && !photo.deleted_at)
    if (!targetPhoto) return

    const boardLabel = boards.find((board) => board.id === boardId)?.label || 'board'
    const photosToUnassign = photos.filter((photo) =>
      photo.board_id === boardId &&
      photo.id !== photoId &&
      !photo.deleted_at &&
      photo.board_status === 'assigned' &&
      photo.type === targetPhoto.type
    )
    const affectedIds = Array.from(new Set([photoId, ...photosToUnassign.map((photo) => photo.id)]))
    const rollbackSnapshots = new Map(affectedIds.map((id) => {
      const p = photos.find((photo) => photo.id === id)
      return [id, { board_id: p?.board_id ?? null, board_status: p?.board_status ?? 'assigned' as const }]
    }))

    updatePendingPhotoIds(affectedIds, true)
    setPhotos((prev) => prev.map((photo) => {
      if (photosToUnassign.some((other) => other.id === photo.id)) return { ...photo, board_id: null, board_status: 'assigned' as const }
      if (photo.id === photoId) return { ...photo, board_id: boardId, board_status: 'assigned' as const }
      return photo
    }))

    void Promise.all([
      ...photosToUnassign.map((photo) => updatePhotoDb(photo.id, { board_id: null, board_status: 'assigned' })),
      updatePhotoDb(photoId, { board_id: boardId, board_status: 'assigned' }),
    ]).then(() => {
      toast.success(`Photo assigned to ${boardLabel}`)
      // Capture snapshots for undo closure
      const undoSnapshots = new Map(rollbackSnapshots)
      pushUndo({
        description: `Assigned photo to ${boardLabel}`,
        undo: async () => {
          // Optimistic: restore all affected photos to their previous state
          setPhotos((prev) => prev.map((photo) => {
            const snap = undoSnapshots.get(photo.id)
            return snap ? { ...photo, board_id: snap.board_id, board_status: snap.board_status } : photo
          }))
          try {
            await Promise.all(
              Array.from(undoSnapshots.entries()).map(([id, snap]) =>
                updatePhotoDb(id, { board_id: snap.board_id, board_status: snap.board_status })
              )
            )
            toast.info(`Undone: Assigned photo to ${boardLabel}`)
          } catch {
            toast.error('Undo failed — could not save to database')
          }
        },
        redo: async () => {
          // Re-do the assignment
          setPhotos((prev) => prev.map((photo) => {
            if (photosToUnassign.some((other) => other.id === photo.id)) return { ...photo, board_id: null, board_status: 'assigned' as const }
            if (photo.id === photoId) return { ...photo, board_id: boardId, board_status: 'assigned' as const }
            return photo
          }))
          try {
            await Promise.all([
              ...photosToUnassign.map((photo) => updatePhotoDb(photo.id, { board_id: null, board_status: 'assigned' })),
              updatePhotoDb(photoId, { board_id: boardId, board_status: 'assigned' }),
            ])
            toast.info(`Redone: Assigned photo to ${boardLabel}`)
          } catch {
            toast.error('Redo failed — could not save to database')
          }
        },
      })
    }).catch(() => {
      setPhotos((prev) => prev.map((photo) => {
        const snap = rollbackSnapshots.get(photo.id)
        return snap ? { ...photo, board_id: snap.board_id, board_status: snap.board_status } : photo
      }))
      toast.error('Failed to assign photo. Your local changes were rolled back.')
    }).finally(() => {
      updatePendingPhotoIds(affectedIds, false)
    })
  }, [boards, photos, updatePendingPhotoIds, pushUndo])

  const unassignPhoto = useCallback((photoId: string) => {
    const photo = photos.find((item) => item.id === photoId && !item.deleted_at)
    if (!photo) return
    const previousBoardId = photo.board_id
    const previousBoardStatus = photo.board_status

    updatePendingPhotoIds([photoId], true)
    setPhotos((prev) => prev.map((item) => item.id === photoId ? { ...item, board_id: null, board_status: 'assigned' as const } : item))

    void updatePhotoDb(photoId, { board_id: null, board_status: 'assigned' }).then(() => {
      toast.success('Photo removed from board')
      const savedBoardId = previousBoardId
      const savedBoardStatus = previousBoardStatus
      pushUndo({
        description: 'Removed photo from board',
        undo: async () => {
          setPhotos((prev) => prev.map((item) => item.id === photoId ? { ...item, board_id: savedBoardId, board_status: savedBoardStatus } : item))
          try {
            await updatePhotoDb(photoId, { board_id: savedBoardId, board_status: savedBoardStatus })
            toast.info('Undone: Removed photo from board')
          } catch {
            toast.error('Undo failed — could not save to database')
          }
        },
        redo: async () => {
          setPhotos((prev) => prev.map((item) => item.id === photoId ? { ...item, board_id: null, board_status: 'assigned' as const } : item))
          try {
            await updatePhotoDb(photoId, { board_id: null, board_status: 'assigned' })
            toast.info('Redone: Removed photo from board')
          } catch {
            toast.error('Redo failed — could not save to database')
          }
        },
      })
    }).catch(() => {
      setPhotos((prev) => prev.map((item) => item.id === photoId ? { ...item, board_id: previousBoardId, board_status: previousBoardStatus } : item))
      toast.error('Failed to remove photo from the board')
    }).finally(() => {
      updatePendingPhotoIds([photoId], false)
    })
  }, [photos, updatePendingPhotoIds, pushUndo])

  const handleSetGalleryTab = useCallback((tab: 'potential' | 'all') => {
    setGalleryTab(tab)
  }, [])

  // Load data & realtime
  const focusedBoardId = mode.kind === 'board-focus' ? mode.boardId : null

  useSupabaseData({
    setPhotos, setBoards,
    updatePhoto, updateBoard,
    addPhoto, addBoard,
    removePhoto, removeBoard,
    draggingId,
    userName,
    currentBoardId: focusedBoardId,
    onLoaded: () => setLoading(false),
    onError: (msg) => { setLoading(false); setLoadError(msg) },
    onConnectionStatusChange: setConnectionStatus,
    onPresenceChange: setPresenceUsers,
  })

  // Coordinate conversion
  function screenToPercent(clientX: number, clientY: number): { x: number; y: number } | null {
    const img = floorplanRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
  }

  function getUploadErrorMessage(error: unknown, fileName: string, pinX: number | null, pinY: number | null) {
    const message = (error as Error).message || 'Upload failed'

    if ((pinX == null || pinY == null) && /null value in column "(pin_x|pin_y)"/i.test(message)) {
      return `Failed to upload ${fileName}: the database schema is outdated. Apply migration 002 to allow pool photos without map pins.`
    }

    return `Failed to upload ${fileName}: ${message}`
  }

  // Upload photos — in board focus mode, only the FIRST photo is auto-assigned (1 per board)
  async function doUploadPhotos(files: File[], pinX: number | null, pinY: number | null) {
    const currentMode = modeRef.current
    const boardId = currentMode.kind === 'board-focus' ? currentMode.boardId : null
    const newUploads = files.map((file) => ({ id: crypto.randomUUID(), name: file.name, size: file.size, done: false }))
    setUploading(prev => [...prev, ...newUploads])

    let firstAssigned = false
    let successfulUploads = 0
    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadPhoto(files[i])
        const assignToBoard = boardId && !firstAssigned ? boardId : null
        if (assignToBoard) {
          const previousBoardPhotos = photosRef.current.filter((photo) => photo.board_id === boardId && !photo.deleted_at)
          previousBoardPhotos.forEach((photo) => {
            updatePhoto(photo.id, { board_id: null })
          })
          await Promise.all(previousBoardPhotos.map((photo) => updatePhotoDb(photo.id, { board_id: null })))
          firstAssigned = true
        }
        await insertPhoto({
          file_url: url,
          type: 'real',
          pin_x: pinX != null ? Math.max(0, Math.min(100, pinX + i * 2)) : null,
          pin_y: pinY != null ? Math.max(0, Math.min(100, pinY + i * 2)) : null,
          direction_deg: 0,
          fov_deg: 70,
          cone_length: 120,
          notes: '',
          board_id: assignToBoard,
          board_status: assignToBoard ? 'assigned' : 'assigned',
          deleted_at: null,
          created_by_name: userName,
          visible: true,
          sort_order: 0,
          paired_photo_id: null,
          tags: [],
          color: null,
        })
        successfulUploads += 1
        setUploading(prev => prev.map((u) => u.id === newUploads[i].id ? { ...u, done: true } : u))
      } catch (err) {
        console.error('Upload failed for', files[i].name, err)
        toast.error(getUploadErrorMessage(err, files[i].name, pinX, pinY))
        setUploading(prev => prev.filter(u => u.id !== newUploads[i].id))
      }
    }

    if (successfulUploads > 0) {
      if (boardId && files.length > 1) {
        toast.success(`${successfulUploads} photos uploaded. The first photo was assigned to this board.`)
      } else if (boardId) {
        toast.success('Photo uploaded and assigned to this board')
      } else if (successfulUploads === 1) {
        toast.success('Photo uploaded')
      } else {
        toast.success(`${successfulUploads} photos uploaded`)
      }
    }

    const batchIds = new Set(newUploads.map(u => u.id))
    setTimeout(() => setUploading(prev => prev.filter(u => !batchIds.has(u.id) || !u.done)), 2000)
  }

  // Drop handler
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCount(0)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) {
      toast.error('Only image files can be uploaded')
      return
    }

    const pos = screenToPercent(e.clientX, e.clientY)
    if (!pos) return

    doUploadPhotos(files, pos.x, pos.y)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault()
    setDragOverCount(c => c + 1)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setDragOverCount(c => Math.max(0, c - 1))
  }

  // Upload via button (no pin coordinates)
  function handleUploadPhotos(files: FileList) {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) {
      toast.error('Only image files can be uploaded')
      return
    }
    doUploadPhotos(imageFiles, null, null)
  }

  // Pin click — FIXED: clicking any board always enters/switches focus
  function handlePinClick(id: string, kind: 'photo' | 'board', e: React.MouseEvent) {
    e.stopPropagation()
    if (isDraggingRef.current) return

    if (kind === 'board') {
      // Clicking any board enters (or switches) board focus
      enterBoardFocus(id)
    } else {
      select(id, kind)
    }
  }

  // Drag to move pin
  function handlePinMouseDown(id: string, kind: 'photo' | 'board', e: React.MouseEvent) {
    if (e.button !== 0) return
    e.stopPropagation()

    const item = kind === 'photo' ? photos.find((p) => p.id === id) : boards.find((b) => b.id === id)
    if (!item) return
    const pinX = kind === 'photo' ? (item as Photo).pin_x : (item as Board).pin_x
    const pinY = kind === 'photo' ? (item as Photo).pin_y : (item as Board).pin_y
    if (pinX == null || pinY == null) return

    isDraggingRef.current = false
    lastDragPosRef.current = null
    dragStartRef.current = { id, kind, startX: e.clientX, startY: e.clientY, pinX, pinY, startedAt: Date.now() }

    function onMouseMove(ev: MouseEvent) {
      if (!dragStartRef.current) return
      const dx = ev.clientX - dragStartRef.current.startX
      const dy = ev.clientY - dragStartRef.current.startY
      const distance = Math.hypot(dx, dy)
      const elapsed = Date.now() - dragStartRef.current.startedAt

      if (!isDraggingRef.current) {
        if (distance < DRAG_DISTANCE_THRESHOLD) return
        if (elapsed < DRAG_HOLD_THRESHOLD_MS && distance < DRAG_FORCE_THRESHOLD) return
        setDraggingId(id)
        document.body.style.cursor = 'grabbing'
      }

      isDraggingRef.current = true
      ev.preventDefault()

      const img = floorplanRef.current
      if (!img) return
      const rect = img.getBoundingClientRect()
      const newX = dragStartRef.current.pinX + (dx / rect.width) * 100
      const newY = dragStartRef.current.pinY + (dy / rect.height) * 100
      const clampedX = Math.max(0, Math.min(100, newX))
      const clampedY = Math.max(0, Math.min(100, newY))

      lastDragPosRef.current = { x: clampedX, y: clampedY }

      if (kind === 'photo') updatePhoto(id, { pin_x: clampedX, pin_y: clampedY })
      else updateBoard(id, { pin_x: clampedX, pin_y: clampedY })
    }

    function onMouseUp() {
      dragAbortRef.current?.abort()
      dragAbortRef.current = null

      if (isDraggingRef.current && lastDragPosRef.current) {
        const { x, y } = lastDragPosRef.current
        if (kind === 'photo') updatePhotoDb(id, { pin_x: x, pin_y: y }).catch(() => toast.error('Failed to save position'))
        else updateBoardDb(id, { pin_x: x, pin_y: y }).catch(() => toast.error('Failed to save position'))
        handleJustFinishedRef.current = true
        setTimeout(() => { handleJustFinishedRef.current = false }, 50)
      }

      if (debounceRef.current) clearTimeout(debounceRef.current)
      dragStartRef.current = null
      lastDragPosRef.current = null
      setDraggingId(null)
      document.body.style.cursor = ''
      setTimeout(() => { isDraggingRef.current = false }, 0)
    }

    dragAbortRef.current?.abort()
    const ac = new AbortController()
    dragAbortRef.current = ac
    window.addEventListener('mousemove', onMouseMove, { signal: ac.signal })
    window.addEventListener('mouseup', onMouseUp, { signal: ac.signal })
  }

  function placePhotoAt(photoId: string, x: number, y: number, directionDeg?: number) {
    const updates: Partial<Photo> = { pin_x: x, pin_y: y }
    if (directionDeg != null) updates.direction_deg = directionDeg
    updatePhoto(photoId, updates)
    select(photoId, 'photo')
    void updatePhotoDb(photoId, updates).then(() => {
      toast.success('Photo placed on map — drag the handle to aim its cone')
    }).catch(() => {
      updatePhoto(photoId, { pin_x: null, pin_y: null })
      select(null, null)
      toast.error('Failed to place photo on map')
    })
  }

  function placePhotoAtBoard(photoId: string) {
    const board = focusedBoard
    if (!board) return
    // Offset slightly so it doesn't sit exactly on the board pin
    const offsetX = Math.max(0, Math.min(100, board.pin_x + 3))
    const offsetY = Math.max(0, Math.min(100, board.pin_y + 3))
    placePhotoAt(photoId, offsetX, offsetY, board.facing_deg)
    setPlacingPhotoId(null)
  }

  function handleCanvasClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-pin-id]')) return
    if (target.closest('.handle-element')) return
    if (handleJustFinishedRef.current) return

    // Place photo on map mode
    if (placingPhotoId) {
      const pos = screenToPercent(e.clientX, e.clientY)
      if (pos) {
        placePhotoAt(placingPhotoId, pos.x, pos.y)
      }
      setPlacingPhotoId(null)
      return
    }

    // In any mode, clicking empty canvas deselects
    select(null, null)
    // Close delete confirmation if open
    setDeleteConfirm(null)
  }

  // Keyboard: Escape exits board focus or deselects
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return

      if ((e.key === 'z') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        if (e.shiftKey) {
          redo()
        } else {
          undo()
        }
        return
      }

      if (e.key === 'Escape') {
        // Cancel placing mode first
        if (placingPhotoId) { setPlacingPhotoId(null); toast.info('Cancelled placing photo'); return }
        // Close delete confirmation first
        if (deleteConfirm) { setDeleteConfirm(null); return }
        // Exit board focus
        if (mode.kind === 'board-focus') { exitBoardFocus(); return }
        // Deselect in overview
        if (selectedId) { select(null, null); return }
      }

      // Delete/Backspace deletes selected photo (with confirmation)
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && selectedKind === 'photo') {
        const photo = photos.find(p => p.id === selectedId)
        if (photo) {
          setDeleteConfirm({ type: 'photo', id: photo.id, label: 'this photo' })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, exitBoardFocus, selectedId, selectedKind, photos, deleteConfirm, select, undo, redo, placingPhotoId])

  // Cleanup drag listeners on unmount
  useEffect(() => {
    return () => { dragAbortRef.current?.abort() }
  }, [])

  async function handleAddBoard() {
    const img = floorplanRef.current
    if (!img) return
    const rect = img.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight
    const cx = ((vw / 2 - rect.left) / rect.width) * 100
    const cy = ((vh / 2 - rect.top) / rect.height) * 100

    try {
      const board = await insertBoard({
        label: 'New Board',
        pin_x: Math.max(0, Math.min(100, cx)),
        pin_y: Math.max(0, Math.min(100, cy)),
        facing_deg: 0,
        notes: '',
        deleted_at: null,
        color: null,
      })
      enterBoardFocus(board.id)
      toast.success('Board created')
    } catch (err) {
      toast.error(`Failed to add board: ${(err as Error).message}`)
    }
  }

  // Delete board — with confirmation
  function requestDeleteBoard() {
    if (mode.kind !== 'board-focus') return
    const board = boards.find(b => b.id === mode.boardId)
    if (!board) return
    setDeleteConfirm({ type: 'board', id: board.id, label: board.label || 'this board' })
  }

  async function confirmDelete() {
    if (!deleteConfirm) return
    const { type, id } = deleteConfirm
    setDeleteConfirm(null)

    if (type === 'board') {
      // Unassign photos from this board first
      const boardPhotos = photos.filter(p => p.board_id === id && !p.deleted_at)
      for (const p of boardPhotos) {
        updatePhoto(p.id, { board_id: null })
        updatePhotoDb(p.id, { board_id: null }).catch((err) => {
          console.error('Failed to unassign photo during board delete:', p.id, err)
          toast.error('Failed to unassign a photo from the board')
        })
      }
      exitBoardFocus()
      try {
        await hardDeleteBoards([id])
        removeBoard(id)
        toast.success('Board deleted')
      } catch {
        toast.error('Failed to delete board')
      }
    } else if (type === 'photo') {
      select(null, null)
      try {
        await hardDeletePhotos([id])
        removePhoto(id)
        toast.success('Photo deleted')
      } catch {
        toast.error('Failed to delete photo')
      }
    }
  }

  // Delete photo from gallery
  const deletePhoto = useCallback((photoId: string) => {
    const photo = photos.find(p => p.id === photoId)
    setDeleteConfirm({ type: 'photo', id: photoId, label: photo ? 'this photo' : 'photo' })
  }, [photos])

  // Toggle photo type
  const togglePhotoType = useCallback((photoId: string) => {
    const photo = photos.find(p => p.id === photoId && !p.deleted_at)
    if (!photo) return
    const newType = photo.type === 'real' ? 'concept' : 'real'
    updatePendingPhotoIds([photoId], true)
    updatePhoto(photoId, { type: newType })
    const oldType = photo.type
    void updatePhotoDb(photoId, { type: newType }).then(() => {
      toast.success(`Photo marked as ${newType}`)
      pushUndo({
        description: `Changed photo to ${newType}`,
        undo: async () => {
          updatePhoto(photoId, { type: oldType })
          try {
            await updatePhotoDb(photoId, { type: oldType })
            toast.info(`Undone: Changed photo to ${newType}`)
          } catch {
            toast.error('Undo failed — could not save to database')
          }
        },
        redo: async () => {
          updatePhoto(photoId, { type: newType })
          try {
            await updatePhotoDb(photoId, { type: newType })
            toast.info(`Redone: Changed photo to ${newType}`)
          } catch {
            toast.error('Redo failed — could not save to database')
          }
        },
      })
    }).catch(() => {
      updatePhoto(photoId, { type: photo.type })
      toast.error('Failed to update photo type')
    }).finally(() => {
      updatePendingPhotoIds([photoId], false)
    })
  }, [photos, updatePhoto, updatePendingPhotoIds, pushUndo])

  const markPhotoAsPotential = useCallback((photoId: string, boardId: string) => {
    const photo = photos.find(p => p.id === photoId && !p.deleted_at)
    if (!photo) return
    const previousBoardId = photo.board_id
    const previousBoardStatus = photo.board_status

    updatePendingPhotoIds([photoId], true)
    setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, board_id: boardId, board_status: 'potential' as const } : p))

    void updatePhotoDb(photoId, { board_id: boardId, board_status: 'potential' }).then(() => {
      toast.success('Photo saved as potential')
    }).catch(() => {
      setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, board_id: previousBoardId, board_status: previousBoardStatus } : p))
      toast.error('Failed to save photo as potential')
    }).finally(() => {
      updatePendingPhotoIds([photoId], false)
    })
  }, [photos, updatePendingPhotoIds])

  const removeFromPotential = useCallback((photoId: string) => {
    const photo = photos.find(p => p.id === photoId && !p.deleted_at)
    if (!photo) return
    const previousBoardId = photo.board_id
    const previousBoardStatus = photo.board_status

    updatePendingPhotoIds([photoId], true)
    setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, board_id: null, board_status: 'assigned' as const } : p))

    void updatePhotoDb(photoId, { board_id: null, board_status: 'assigned' }).then(() => {
      toast.success('Photo removed from potential')
    }).catch(() => {
      setPhotos((prev) => prev.map((p) => p.id === photoId ? { ...p, board_id: previousBoardId, board_status: previousBoardStatus } : p))
      toast.error('Failed to remove photo from potential')
    }).finally(() => {
      updatePendingPhotoIds([photoId], false)
    })
  }, [photos, updatePendingPhotoIds])

  // Cone handle drag
  const lastConeRef = useRef<{ direction_deg: number; cone_length: number } | null>(null)

  function handleConeHandleMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!selectedId || selectedKind !== 'photo') return
    const photoSnap = photos.find((p) => p.id === selectedId)
    if (!photoSnap || photoSnap.pin_x == null) return
    const photoId = photoSnap.id
    const pinX = photoSnap.pin_x
    const pinY = photoSnap.pin_y!
    lastConeRef.current = null
    setDraggingId(photoId)

    function onMouseMove(ev: MouseEvent) {
      const pos = screenToPercent(ev.clientX, ev.clientY)
      if (!pos) return
      const dx = pos.x - pinX
      const dy = pos.y - pinY
      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
      if (angle < 0) angle += 360
      if (ev.shiftKey) angle = Math.round(angle / 5) * 5

      const img = floorplanRef.current
      if (!img) return
      const rect = img.getBoundingClientRect()
      const dxPx = (dx / 100) * rect.width
      const dyPx = (dy / 100) * rect.height
      const dist = Math.hypot(dxPx, dyPx)
      const currentPhoto = photos.find(p => p.id === photoId)
      const fov = currentPhoto?.fov_deg || 70
      const maxLen = Math.max(80, 120 + (fov - 30) * 2)
      const newLength = Math.max(30, Math.min(maxLen, dist))
      lastConeRef.current = { direction_deg: angle, cone_length: newLength }
      updatePhoto(photoId, { direction_deg: angle, cone_length: newLength })
    }

    function onMouseUp() {
      dragAbortRef.current?.abort()
      dragAbortRef.current = null
      if (lastConeRef.current) {
        updatePhotoDb(photoId, lastConeRef.current).catch(() => toast.error('Failed to save cone'))
      }
      lastConeRef.current = null
      setDraggingId(null)
      handleJustFinishedRef.current = true
      setTimeout(() => { handleJustFinishedRef.current = false }, 50)
    }

    dragAbortRef.current?.abort()
    const ac = new AbortController()
    dragAbortRef.current = ac
    window.addEventListener('mousemove', onMouseMove, { signal: ac.signal })
    window.addEventListener('mouseup', onMouseUp, { signal: ac.signal })
  }

  // Board rotate handle
  const lastBoardAngleRef = useRef<number | null>(null)

  function handleBoardRotateMouseDown(boardId: string) {
    return (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const boardSnap = boards.find((b) => b.id === boardId)
      if (!boardSnap) return
      const pinX = boardSnap.pin_x
      const pinY = boardSnap.pin_y
      lastBoardAngleRef.current = null
      setDraggingId(boardId)

      function onMouseMove(ev: MouseEvent) {
        const pos = screenToPercent(ev.clientX, ev.clientY)
        if (!pos) return
        const dx = pos.x - pinX
        const dy = pos.y - pinY
        let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
        if (angle < 0) angle += 360
        if (ev.shiftKey) angle = Math.round(angle / 5) * 5
        lastBoardAngleRef.current = angle
        updateBoard(boardId, { facing_deg: angle })
      }

      function onMouseUp() {
        dragAbortRef.current?.abort()
        dragAbortRef.current = null
        if (lastBoardAngleRef.current !== null) {
          updateBoardDb(boardId, { facing_deg: lastBoardAngleRef.current }).catch(() => toast.error('Failed to save rotation'))
        }
        lastBoardAngleRef.current = null
        setDraggingId(null)
        handleJustFinishedRef.current = true
        setTimeout(() => { handleJustFinishedRef.current = false }, 50)
      }

      dragAbortRef.current?.abort()
      const ac = new AbortController()
      dragAbortRef.current = ac
      window.addEventListener('mousemove', onMouseMove, { signal: ac.signal })
      window.addEventListener('mouseup', onMouseUp, { signal: ac.signal })
    }
  }

  // Computed
  const activeBoards = useMemo(() => boards.filter(b => !b.deleted_at), [boards])
  const activePhotos = useMemo(() => photos.filter(p => !p.deleted_at), [photos])
  const activeBoardIds = useMemo(() => new Set(activeBoards.map((board) => board.id)), [activeBoards])
  const pendingPhotoIdSet = useMemo(() => new Set(photoActionIds), [photoActionIds])

  const focusedBoard = focusedBoardId ? activeBoards.find(b => b.id === focusedBoardId) ?? null : null
  const panelBoard = panelBoardId ? activeBoards.find((board) => board.id === panelBoardId) ?? null : null

  // If focused board no longer exists, auto-exit
  const hasFocusedBoard = focusedBoardId ? activeBoards.some((b) => b.id === focusedBoardId) : false

  useEffect(() => {
    if (focusedBoardId && !hasFocusedBoard) {
      exitBoardFocus()
      toast.info('Board was deleted')
    }
  }, [focusedBoardId, hasFocusedBoard, exitBoardFocus])

  useEffect(() => {
    const previous = lastConnectionStatusRef.current
    if (previous === connectionStatus) return

    if (previous === 'connected' && connectionStatus === 'disconnected') {
      toast.error('Live sync connection lost. Changes may be stale until it reconnects.')
    } else if (previous === 'disconnected' && connectionStatus === 'connected') {
      toast.success('Live sync restored')
    }

    lastConnectionStatusRef.current = connectionStatus
  }, [connectionStatus])

  useEffect(() => {
    if (focusedBoardId) {
      setPanelBoardId(focusedBoardId)
      const frame = window.requestAnimationFrame(() => setPanelOpen(true))
      return () => window.cancelAnimationFrame(frame)
    }

    setPanelOpen(false)
    const timeout = window.setTimeout(() => setPanelBoardId(null), PANEL_TRANSITION_MS)
    return () => window.clearTimeout(timeout)
  }, [focusedBoardId])

  useEffect(() => {
    if (focusedBoard) {
      setBoardLabelDraft(focusedBoard.label)
      return
    }

    setBoardLabelDraft(null)
  }, [focusedBoard])

  const { assignedPhotoByBoardId, canonicalAssignedPhotoIds, potentialPhotosByBoardId } = useMemo(() => {
    const byBoardId = new Map<string, Photo[]>()
    const canonicalIds = new Set<string>()
    const potentialByBoard = new Map<string, Photo[]>()

    activePhotos.forEach((photo) => {
      if (!photo.board_id || !activeBoardIds.has(photo.board_id)) return

      if (photo.board_status === 'potential') {
        const bucket = potentialByBoard.get(photo.board_id) ?? []
        bucket.push(photo)
        potentialByBoard.set(photo.board_id, bucket)
        return
      }

      const bucket = byBoardId.get(photo.board_id) ?? []
      bucket.push(photo)
      byBoardId.set(photo.board_id, bucket)
    })

    byBoardId.forEach((bucket, boardId) => {
      const sorted = [...bucket].sort((a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )
      byBoardId.set(boardId, sorted)
      sorted.forEach((p) => canonicalIds.add(p.id))
    })

    return { assignedPhotoByBoardId: byBoardId, canonicalAssignedPhotoIds: canonicalIds, potentialPhotosByBoardId: potentialByBoard }
  }, [activeBoardIds, activePhotos])

  const focusedAssignedPhotos: Photo[] = focusedBoardId ? assignedPhotoByBoardId.get(focusedBoardId) ?? [] : []

  // Photo pins visible on the map:
  // Overview: filtered by mapPhotoFilter toggle
  // Board focus: the assigned photo (if pinned) for the focused board
  const visiblePhotoPins = useMemo(() => {
    if (mode.kind === 'board-focus') {
      return focusedAssignedPhotos.filter(p => p.pin_x != null && p.pin_y != null)
    }
    if (mapPhotoFilter === 'none') return []
    return activePhotos.filter(p => {
      if (p.pin_x == null || p.pin_y == null) return false
      if (mapPhotoFilter === 'all') return true
      return p.type === mapPhotoFilter
    })
  }, [mode.kind, focusedAssignedPhotos, activePhotos, mapPhotoFilter])

  const selectedPhoto = selectedKind === 'photo' ? photos.find((p) => p.id === selectedId) : null
  const selectedBoard = selectedKind === 'board' ? boards.find((b) => b.id === selectedId) : null

  const boardPhotoUrls = useMemo(() => {
    const map = new Map<string, string>()
    assignedPhotoByBoardId.forEach((photos, boardId) => {
      if (photos.length > 0) map.set(boardId, photos[0].file_url)
    })
    return map
  }, [assignedPhotoByBoardId])

  const colocatedCountByBoard = useMemo(() => {
    const counts = new Map<string, number>()
    const PROXIMITY = 5 // within 5% of board position counts as co-located
    activeBoards.forEach(board => {
      const count = activePhotos.filter(photo => {
        if (!photo.board_id || photo.board_id !== board.id) return false
        if (photo.pin_x == null || photo.pin_y == null) return false
        return Math.abs(photo.pin_x - board.pin_x) < PROXIMITY && Math.abs(photo.pin_y - board.pin_y) < PROXIMITY
      }).length
      if (count > 0) counts.set(board.id, count)
    })
    return counts
  }, [activeBoards, activePhotos])

  const panelAssignedPhotos: Photo[] = panelBoard ? assignedPhotoByBoardId.get(panelBoard.id) ?? [] : []
  const panelPotentialPhotos: Photo[] = panelBoard ? potentialPhotosByBoardId.get(panelBoard.id) ?? [] : []
  const panelAssignedPhotoIds = useMemo(() => new Set(panelAssignedPhotos.map(p => p.id)), [panelAssignedPhotos])

  const panelGalleryPhotos = useMemo(() => {
    if (!panelBoard) return []

    if (galleryTab === 'potential') {
      return panelPotentialPhotos
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    return activePhotos
      .filter((photo) => {
        if (panelAssignedPhotoIds.has(photo.id)) return false
        if (photo.board_id === panelBoard.id && photo.board_status === 'potential') return false
        return true
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  }, [activePhotos, panelAssignedPhotoIds, panelBoard, panelPotentialPhotos, galleryTab])

  const isEmpty = !loading && !loadError && activePhotos.length === 0 && activeBoards.length === 0

  // Cone handles
  function renderConeHandles() {
    if (!selectedPhoto || selectedPhoto.pin_x == null) return null
    const dirRad = (selectedPhoto.direction_deg - 90) * (Math.PI / 180)
    const len = selectedPhoto.cone_length
    const tipX = Math.cos(dirRad) * len
    const tipY = Math.sin(dirRad) * len

    return (
      <div className="absolute pointer-events-none" style={{ left: `${selectedPhoto.pin_x}%`, top: `${selectedPhoto.pin_y}%`, transform: 'translate(-50%, -50%)', zIndex: 30 }}>
        <svg className="absolute pointer-events-none" style={{ left: 0, top: 0, overflow: 'visible' }}>
          <line x1={0} y1={0} x2={tipX} y2={tipY} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.5} />
        </svg>
        <div className="handle-element absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-full cursor-move pointer-events-auto shadow-lg flex items-center justify-center"
          style={{ left: tipX - 10, top: tipY - 10 }}
          onMouseDown={handleConeHandleMouseDown}
          title="Drag to rotate &amp; set length"
        >
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
        </div>
        <div className="absolute text-[9px] font-semibold text-blue-600 bg-white/90 px-1 rounded pointer-events-none"
          style={{ left: tipX - 16, top: tipY + 12 }}>
          {Math.round(selectedPhoto.direction_deg)}&deg; / {Math.round(selectedPhoto.cone_length)}px
        </div>
      </div>
    )
  }

  function renderBoardRotateHandle() {
    const rotateBoard = focusedBoard ?? selectedBoard
    if (!rotateBoard) return null
    const rad = (rotateBoard.facing_deg - 90) * (Math.PI / 180)
    const handleDist = 35
    const hx = Math.cos(rad) * handleDist
    const hy = Math.sin(rad) * handleDist

    return (
      <div className="absolute pointer-events-none" style={{ left: `${rotateBoard.pin_x}%`, top: `${rotateBoard.pin_y}%`, transform: 'translate(-50%, -50%)', zIndex: 30 }}>
        <svg className="absolute pointer-events-none" style={{ left: 0, top: 0, overflow: 'visible' }}>
          <line x1={0} y1={0} x2={hx} y2={hy} stroke="#4b5563" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.4} />
        </svg>
        <div className="handle-element absolute w-4 h-4 bg-white border-2 border-gray-600 rounded-full cursor-grab pointer-events-auto shadow-lg flex items-center justify-center"
          style={{ left: hx - 8, top: hy - 8 }}
          onMouseDown={handleBoardRotateMouseDown(rotateBoard.id)}
          title="Drag to rotate"
        >
          <div className="w-1 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="absolute text-[9px] font-semibold text-gray-600 bg-white/90 px-1 rounded pointer-events-none"
          style={{ left: hx - 10, top: hy + 10 }}>
          {Math.round(rotateBoard.facing_deg)}&deg;
        </div>
      </div>
    )
  }

  // Context value — memoized to prevent unnecessary re-renders
  const ctx = useMemo<AppState & AppActions>(() => ({
    photos, boards, mode,
    selectedId, selectedKind, draggingId, galleryTab, userName,
    setPhotos, setBoards,
    select, setDraggingId,
    updatePhoto, updateBoard,
    addPhoto, addBoard,
    removePhoto, removeBoard,
    enterBoardFocus, exitBoardFocus,
    assignPhotoToBoard, unassignPhoto,
    setGalleryTab: handleSetGalleryTab,
  }), [photos, boards, mode, selectedId, selectedKind, draggingId, galleryTab, userName,
    select, setDraggingId, updatePhoto, updateBoard, addPhoto, addBoard, removePhoto, removeBoard,
    enterBoardFocus, exitBoardFocus, assignPhotoToBoard, unassignPhoto, handleSetGalleryTab])

  const floorplanUrl = process.env.NEXT_PUBLIC_FLOORPLAN_URL || ''

  return (
    <AppContext value={ctx}>
      <div className="h-screen flex flex-col overflow-hidden">
        <TopBar
          userName={userName}
          onChangeName={onChangeName}
          onAddBoard={handleAddBoard}
          onUploadPhotos={handleUploadPhotos}
          onBack={exitBoardFocus}
          mode={mode}
          boardLabel={boardLabelDraft ?? focusedBoard?.label}
          connectionStatus={connectionStatus}
          totalBoards={activeBoards.length}
          assignedBoards={assignedPhotoByBoardId.size}
          presenceUsers={presenceUsers}
          boardId={focusedBoardId}
          canUndo={canUndo}
          canRedo={canRedo}
          onUndo={undo}
          onRedo={redo}
        />

        <div className="relative flex min-h-0 flex-1 overflow-hidden">
          {/* Canvas area */}
          <div
            className="flex-1 overflow-hidden relative min-w-0"
            style={{ background: 'radial-gradient(circle, #e5e7eb 1px, #f3f4f6 1px)', backgroundSize: '20px 20px' }}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
          >
            <TransformWrapper
              minScale={0.3}
              maxScale={5}
              initialScale={1}
              centerOnInit
              panning={{ excluded: ['pin-element', 'handle-element'] }}
            >
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <div
                  ref={canvasRef}
                  className="relative"
                  onClick={handleCanvasClick}
                  style={{ pointerEvents: 'auto', cursor: placingPhotoId ? 'crosshair' : undefined }}
                >
                  {floorplanUrl && !floorplanError ? (
                    <img
                      ref={(node) => { floorplanRef.current = node }}
                      src={floorplanUrl}
                      alt="Floor plan"
                      className="max-w-none select-none shadow-lg rounded-sm"
                      draggable={false}
                      style={{ display: 'block' }}
                      onError={() => setFloorplanError(true)}
                    />
                  ) : (
                    <div
                      ref={(node) => { floorplanRef.current = node }}
                      className="w-[800px] h-[600px] bg-white border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 rounded-lg"
                    >
                      {floorplanError
                        ? 'Floor plan image failed to load — check NEXT_PUBLIC_FLOORPLAN_URL'
                        : 'No floor plan configured — set NEXT_PUBLIC_FLOORPLAN_URL'}
                    </div>
                  )}

                  {/* Photo pins (overview: all pinned, board focus: assigned photo) */}
                  {visiblePhotoPins.map((photo) => (
                    <PhotoPin
                      key={photo.id}
                      photo={photo}
                      selected={selectedId === photo.id}
                      onClick={(e) => handlePinClick(photo.id, 'photo', e)}
                      onMouseDown={(e) => handlePinMouseDown(photo.id, 'photo', e)}
                    />
                  ))}

                  {/* Board pins (always visible) */}
                  {activeBoards.map((board) => (
                    <BoardPin
                      key={board.id}
                      board={board}
                      selected={focusedBoardId === board.id}
                      focused={focusedBoardId ? focusedBoardId === board.id : true}
                      showCone={focusedBoardId ? focusedBoardId === board.id : true}
                      assignedPhotoUrl={boardPhotoUrls.get(board.id) || null}
                      colocatedPhotos={colocatedCountByBoard.get(board.id) ?? 0}
                      onClick={(e) => handlePinClick(board.id, 'board', e)}
                      onMouseDown={(e) => handlePinMouseDown(board.id, 'board', e)}
                    />
                  ))}

                  {renderConeHandles()}
                  {renderBoardRotateHandle()}
                </div>
              </TransformComponent>
            </TransformWrapper>

            {/* Drag-over feedback overlay */}
            {dragOverCount > 0 && (
              <div className="absolute inset-0 bg-blue-500/10 border-4 border-dashed border-blue-400 z-30 flex items-center justify-center pointer-events-none transition-all">
                <div className="bg-white rounded-xl shadow-xl px-8 py-6 flex flex-col items-center gap-2">
                  <Upload className="w-10 h-10 text-blue-500" />
                  <span className="text-lg font-semibold text-gray-700">Drop photos here</span>
                  <span className="text-sm text-gray-400">
                    {mode.kind === 'board-focus' ? "First photo will be assigned to this board" : "They'll be placed on the floor plan"}
                  </span>
                </div>
              </div>
            )}

            {mode.kind === 'board-focus' && (
              <div className="pointer-events-none absolute top-4 left-4 z-20">
                <div className="rounded-full border border-gray-200 bg-white/92 px-3 py-1.5 text-xs text-gray-600 shadow-sm backdrop-blur">
                  Click another board to switch. Use Back or Esc to return.
                </div>
              </div>
            )}

            {/* Placing photo on map indicator */}
            {placingPhotoId && (
              <div className="absolute inset-0 z-30 pointer-events-none">
                <div className="absolute top-4 left-1/2 -translate-x-1/2 pointer-events-auto">
                  <div className="flex items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-800 shadow-lg">
                    <MapPin className="h-4 w-4 animate-bounce" />
                    <span>Click on the map to place this photo</span>
                    {focusedBoard && (
                      <button
                        onClick={() => placePhotoAtBoard(placingPhotoId)}
                        className="rounded-full bg-blue-600 px-3 py-0.5 text-xs text-white hover:bg-blue-700 transition-colors"
                      >
                        Same location as {focusedBoard.label || 'board'}
                      </button>
                    )}
                    <button onClick={() => setPlacingPhotoId(null)} className="rounded-full bg-blue-200 px-2 py-0.5 text-xs hover:bg-blue-300 transition-colors">
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Photo pin toggles — overview mode only */}
            {mode.kind === 'overview' && activePhotos.some(p => p.pin_x != null) && (
              <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 p-1 shadow-sm backdrop-blur">
                <span className="px-1.5 text-[10px] font-medium text-gray-400 uppercase tracking-wide">
                  <MapPin className="inline h-3 w-3 -mt-0.5" /> Photos
                </span>
                {([
                  ['none', 'Off', EyeOff],
                  ['real', 'Real', Camera],
                  ['concept', 'Concept', Lightbulb],
                  ['all', 'All', Eye],
                ] as const).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    onClick={() => setMapPhotoFilter(value as MapPhotoFilter)}
                    className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                      mapPhotoFilter === value
                        ? value === 'real'
                          ? 'bg-blue-100 text-blue-700'
                          : value === 'concept'
                            ? 'bg-purple-100 text-purple-700'
                            : value === 'all'
                              ? 'bg-gray-800 text-white'
                              : 'bg-gray-100 text-gray-600'
                        : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label}
                  </button>
                ))}
              </div>
            )}

            {/* Loading spinner */}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            )}

            {/* Load error */}
            {loadError && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="bg-white rounded-xl shadow-lg px-10 py-8 flex flex-col items-center gap-4 pointer-events-auto max-w-sm text-center">
                  <div className="text-red-500 text-lg font-semibold">Failed to load data</div>
                  <p className="text-sm text-gray-500">{loadError}</p>
                  <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
                    Reload
                  </button>
                </div>
              </div>
            )}

            {/* Empty state */}
            {isEmpty && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="bg-white rounded-xl shadow-lg px-10 py-8 flex flex-col items-center gap-4 pointer-events-auto max-w-sm text-center">
                  <ImagePlus className="w-12 h-12 text-gray-300" />
                  <div>
                    <h2 className="text-lg font-semibold text-gray-700 mb-1">Get started</h2>
                    <p className="text-sm text-gray-400">Drop photos on the floor plan or use the upload button above</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
                    >
                      <ImagePlus className="w-4 h-4" />
                      Upload Photos
                    </button>
                    <button
                      onClick={handleAddBoard}
                      className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Board
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              className="hidden"
              onChange={(e) => { if (e.target.files) handleUploadPhotos(e.target.files); e.target.value = '' }}
            />

            {/* Upload progress */}
            {uploading.length > 0 && mode.kind !== 'board-focus' && (
              <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-40 min-w-[200px]">
                <div className="text-xs font-semibold text-gray-600 mb-2">Uploading...</div>
                {uploading.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 text-xs text-gray-500 py-0.5">
                    {u.done ? <span className="text-green-500">&#10003;</span> : <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                    <span className="truncate max-w-[150px]">{u.name}</span>
                    <span className="ml-auto text-gray-400">{u.size >= 1024 * 1024 ? `${(u.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(u.size / 1024))} KB`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Board Focus Panel (side panel) */}
          <div
            className={`absolute inset-y-0 right-0 z-40 w-full max-w-full transition-[width] duration-200 ease-out md:static md:shrink-0 ${
              panelBoard ? 'md:w-[min(40vw,420px)]' : 'w-0 md:w-0'
            }`}
          >
            <div className={`h-full transition-all duration-200 ease-out ${panelOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-6 opacity-0'}`}>
              {panelBoard && (
                <BoardFocusPanel
                  key={panelBoard.id}
                  board={panelBoard}
                  photos={photos}
                  boards={activeBoards}
                  assignedPhotos={panelAssignedPhotos}
                  potentialPhotos={panelPotentialPhotos}
                  galleryPhotos={panelGalleryPhotos}
                  canonicalAssignedPhotoIds={canonicalAssignedPhotoIds}
                  pendingPhotoIds={pendingPhotoIdSet}
                  uploading={uploading}
                  galleryTab={galleryTab}
                  onSetGalleryTab={handleSetGalleryTab}
                  onAssignPhoto={(photoId) => assignPhotoToBoard(photoId, panelBoard.id)}
                  onUnassignPhoto={(photoId) => unassignPhoto(photoId)}
                  onMarkPotential={(photoId) => markPhotoAsPotential(photoId, panelBoard.id)}
                  onRemoveFromPotential={removeFromPotential}
                  onDeletePhoto={deletePhoto}
                  onTogglePhotoType={togglePhotoType}
                  onUploadPhotos={handleUploadPhotos}
                  onDeleteBoard={requestDeleteBoard}
                  onPlaceOnMap={(photoId) => setPlacingPhotoId(photoId)}
                  onBack={exitBoardFocus}
                  onLabelDraftChange={setBoardLabelDraft}
                  updateBoard={updateBoard}
                />
              )}
            </div>
          </div>
        </div>

        {/* Delete confirmation dialog */}
        {deleteConfirm && (
          <>
            <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setDeleteConfirm(null)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl p-6 z-50 max-w-sm w-full">
              <h3 className="font-semibold text-gray-900 mb-2">
                Delete {deleteConfirm.type === 'board' ? 'Board' : 'Photo'}?
              </h3>
              <p className="text-sm text-gray-500 mb-4">
                {deleteConfirm.type === 'board'
                  ? `"${deleteConfirm.label}" will be permanently deleted. Photos assigned to it will be unassigned.`
                  : 'This photo will be permanently deleted. This cannot be undone.'}
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  Cancel
                </button>
                <button onClick={confirmDelete} className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors">
                  Delete
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppContext>
  )
}
