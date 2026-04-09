'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch'
import { toast } from 'sonner'
import { AppContext, type AppState, type AppActions } from '@/lib/store'
import { useSupabaseData } from '@/lib/useSupabaseData'
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
import { TopBar } from './TopBar'
import { BoardFocusPanel } from './BoardFocusPanel'
import { PhotoPin } from './PhotoPin'
import { BoardPin } from './BoardPin'
import { Upload, ImagePlus, Plus, Loader2 } from 'lucide-react'

interface MainScreenProps {
  userName: string
  onChangeName: (name: string) => void
}

export function MainScreen({ userName, onChangeName }: MainScreenProps) {
  // Core state
  const [photos, setPhotos] = useState<Photo[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [mode, setMode] = useState<AppMode>({ kind: 'overview' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<'photo' | 'board' | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [showAllPhotos, setShowAllPhotos] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'board' | 'photo'; id: string; label: string } | null>(null)

  // Drag-over feedback
  const [dragOverCount, setDragOverCount] = useState(0)

  // Upload progress
  const [uploading, setUploading] = useState<{ id: string; name: string; done: boolean }[]>([])

  // Floor plan error
  const [floorplanError, setFloorplanError] = useState(false)

  // Refs
  const canvasRef = useRef<HTMLDivElement>(null)
  const floorplanRef = useRef<HTMLImageElement>(null)
  const dragStartRef = useRef<{ id: string; kind: 'photo' | 'board'; startX: number; startY: number; pinX: number; pinY: number } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleJustFinishedRef = useRef(false)
  const lastDragPosRef = useRef<{ x: number; y: number } | null>(null)

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
      if (prev.some((p) => p.id === photo.id)) return prev.map((p) => p.id === photo.id ? photo : p)
      return [...prev, photo]
    })
  }, [])

  const addBoard = useCallback((board: Board) => {
    setBoards((prev) => {
      if (prev.some((b) => b.id === board.id)) return prev.map((b) => b.id === board.id ? board : b)
      return [...prev, board]
    })
  }, [])

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
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

  // Fixed: async DB calls moved OUT of state setter, with error handling
  const assignPhotoToBoard = useCallback((photoId: string, boardId: string) => {
    // Find and unassign the previous photo on this board
    setPhotos(prev => {
      const prevAssigned = prev.find(p => p.board_id === boardId && p.id !== photoId && !p.deleted_at)
      const next = prev.map(p => {
        if (p.id === prevAssigned?.id) return { ...p, board_id: null }
        if (p.id === photoId) return { ...p, board_id: boardId }
        return p
      })
      // Fire DB updates after computing new state (not inside map)
      if (prevAssigned) {
        updatePhotoDb(prevAssigned.id, { board_id: null }).catch(() => {
          toast.error('Failed to unassign previous photo')
        })
      }
      updatePhotoDb(photoId, { board_id: boardId }).catch(() => {
        toast.error('Failed to assign photo')
      })
      return next
    })
    toast.success('Photo assigned')
  }, [])

  const unassignPhoto = useCallback((photoId: string) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, board_id: null } : p))
    updatePhotoDb(photoId, { board_id: null }).catch(() => {
      toast.error('Failed to unassign photo')
    })
    toast('Photo removed from board')
  }, [])

  const toggleShowAllPhotos = useCallback(() => {
    setShowAllPhotos(prev => !prev)
  }, [])

  // Load data & realtime
  useSupabaseData({
    setPhotos, setBoards,
    updatePhoto, updateBoard,
    addPhoto, addBoard,
    removePhoto, removeBoard,
    draggingId,
    onLoaded: () => setLoading(false),
    onError: (msg) => { setLoading(false); setLoadError(msg) },
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

  // Upload photos — in board focus mode, only the FIRST photo is auto-assigned (1 per board)
  async function doUploadPhotos(files: File[], pinX: number | null, pinY: number | null) {
    const boardId = mode.kind === 'board-focus' ? mode.boardId : null
    const newUploads = files.map(f => ({ id: crypto.randomUUID(), name: f.name, done: false }))
    setUploading(prev => [...prev, ...newUploads])

    let firstAssigned = false
    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadPhoto(files[i])
        // In board focus: assign only the first uploaded photo (1-per-board constraint)
        const assignToBoard = boardId && !firstAssigned ? boardId : null
        if (assignToBoard) {
          // Unassign previous photo from this board
          const prevPhoto = photos.find(p => p.board_id === boardId && !p.deleted_at)
          if (prevPhoto) {
            updatePhoto(prevPhoto.id, { board_id: null })
            updatePhotoDb(prevPhoto.id, { board_id: null }).catch(() => {})
          }
          firstAssigned = true
        }
        await insertPhoto({
          file_url: url,
          type: 'real',
          pin_x: pinX != null ? Math.max(0, Math.min(100, pinX + i * 2)) : null as any,
          pin_y: pinY != null ? Math.max(0, Math.min(100, pinY + i * 2)) : null as any,
          direction_deg: 0,
          fov_deg: 70,
          cone_length: 120,
          notes: '',
          board_id: assignToBoard,
          deleted_at: null,
          created_by_name: userName,
          visible: true,
          sort_order: 0,
          paired_photo_id: null,
          tags: [],
          color: null,
        })
        setUploading(prev => prev.map((u) => u.id === newUploads[i].id ? { ...u, done: true } : u))
      } catch (err) {
        toast.error(`Failed to upload ${files[i].name}: ${(err as Error).message}`)
        setUploading(prev => prev.filter(u => u.id !== newUploads[i].id))
      }
    }

    if (files.length > 1 && boardId) {
      toast.info(`${files.length} photos uploaded. First photo assigned to board, rest added to pool.`)
    }

    setTimeout(() => setUploading(prev => prev.filter(u => !u.done)), 2000)
  }

  // Drop handler
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOverCount(0)
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return

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
    if (imageFiles.length === 0) return
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
    e.preventDefault()

    const item = kind === 'photo' ? photos.find((p) => p.id === id) : boards.find((b) => b.id === id)
    if (!item) return
    const pinX = kind === 'photo' ? (item as Photo).pin_x : (item as Board).pin_x
    const pinY = kind === 'photo' ? (item as Photo).pin_y : (item as Board).pin_y
    if (pinX == null || pinY == null) return

    isDraggingRef.current = false
    lastDragPosRef.current = null
    dragStartRef.current = { id, kind, startX: e.clientX, startY: e.clientY, pinX, pinY }

    function onMouseMove(ev: MouseEvent) {
      if (!dragStartRef.current) return
      const dx = ev.clientX - dragStartRef.current.startX
      const dy = ev.clientY - dragStartRef.current.startY
      if (Math.hypot(dx, dy) < 3 && !isDraggingRef.current) return

      isDraggingRef.current = true
      setDraggingId(id)

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
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)

      if (isDraggingRef.current && lastDragPosRef.current) {
        const { x, y } = lastDragPosRef.current
        if (kind === 'photo') updatePhotoDb(id, { pin_x: x, pin_y: y }).catch(() => toast.error('Failed to save position'))
        else updateBoardDb(id, { pin_x: x, pin_y: y }).catch(() => toast.error('Failed to save position'))
      }

      handleJustFinishedRef.current = true
      setTimeout(() => { handleJustFinishedRef.current = false }, 50)

      if (debounceRef.current) clearTimeout(debounceRef.current)
      dragStartRef.current = null
      lastDragPosRef.current = null
      setDraggingId(null)
      setTimeout(() => { isDraggingRef.current = false }, 0)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function handleCanvasClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-pin-id]')) return
    if (target.closest('.handle-element')) return
    if (handleJustFinishedRef.current) return

    // In any mode, clicking empty canvas deselects
    select(null, null)
    // Close delete confirmation if open
    setDeleteConfirm(null)
  }

  // Keyboard: Escape exits board focus or deselects
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return

      if (e.key === 'Escape') {
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
  }, [mode, exitBoardFocus, selectedId, selectedKind, photos, deleteConfirm, select])

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
        updatePhotoDb(p.id, { board_id: null }).catch(() => {})
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
    const photo = photos.find(p => p.id === photoId)
    if (!photo) return
    const newType = photo.type === 'real' ? 'concept' : 'real'
    updatePhoto(photoId, { type: newType })
    updatePhotoDb(photoId, { type: newType }).catch(() => toast.error('Failed to update photo type'))
  }, [photos, updatePhoto])

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
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (lastConeRef.current) {
        updatePhotoDb(photoId, lastConeRef.current).catch(() => toast.error('Failed to save cone'))
      }
      lastConeRef.current = null
      setDraggingId(null)
      handleJustFinishedRef.current = true
      setTimeout(() => { handleJustFinishedRef.current = false }, 50)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Board rotate handle
  const lastBoardAngleRef = useRef<number | null>(null)

  function handleBoardRotateMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!selectedId || selectedKind !== 'board') return
    const boardSnap = boards.find((b) => b.id === selectedId)
    if (!boardSnap) return
    const boardId = boardSnap.id
    const pinX = boardSnap.pin_x
    const pinY = boardSnap.pin_y
    lastBoardAngleRef.current = null
    setDraggingId(boardId)

    function onMouseMove(ev: MouseEvent) {
      const pos = screenToPercent(ev.clientX, ev.clientY)
      if (!pos) return
      const dx = pos.x - pinX
      const dy = pos.y - pinY
      let angle = Math.atan2(dy, dx) * (180 / Math.PI)
      if (ev.shiftKey) angle = Math.round(angle / 5) * 5
      lastBoardAngleRef.current = angle
      updateBoard(boardId, { facing_deg: angle })
    }

    function onMouseUp() {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
      if (lastBoardAngleRef.current !== null) {
        updateBoardDb(boardId, { facing_deg: lastBoardAngleRef.current }).catch(() => toast.error('Failed to save rotation'))
      }
      lastBoardAngleRef.current = null
      setDraggingId(null)
      handleJustFinishedRef.current = true
      setTimeout(() => { handleJustFinishedRef.current = false }, 50)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Computed
  const activeBoards = useMemo(() => boards.filter(b => !b.deleted_at), [boards])
  const activePhotos = useMemo(() => photos.filter(p => !p.deleted_at), [photos])

  const focusedBoardId = mode.kind === 'board-focus' ? mode.boardId : null
  const focusedBoard = focusedBoardId ? boards.find(b => b.id === focusedBoardId) : null

  // If focused board no longer exists, auto-exit
  useEffect(() => {
    if (mode.kind === 'board-focus' && !boards.some(b => b.id === mode.boardId)) {
      exitBoardFocus()
      toast.info('Board was deleted')
    }
  }, [boards, mode, exitBoardFocus])

  // In board focus mode: only show photo pins assigned to this board that have pin coordinates
  const visiblePhotoPins = useMemo(() =>
    focusedBoardId
      ? activePhotos.filter(p => p.board_id === focusedBoardId && p.pin_x != null && p.pin_y != null)
      : [],
    [focusedBoardId, activePhotos]
  )

  const selectedPhoto = selectedKind === 'photo' ? photos.find((p) => p.id === selectedId) : null
  const selectedBoard = selectedKind === 'board' ? boards.find((b) => b.id === selectedId) : null

  // Photo URL map for board pins (first assigned photo per board)
  const boardPhotoUrls = useMemo(() => {
    const map = new Map<string, string>()
    activePhotos.forEach(p => {
      if (p.board_id && !map.has(p.board_id)) {
        map.set(p.board_id, p.file_url)
      }
    })
    return map
  }, [activePhotos])

  const isEmpty = !loading && !loadError && photos.length === 0 && boards.length === 0

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
    if (!selectedBoard) return null
    const rad = selectedBoard.facing_deg * (Math.PI / 180)
    const handleDist = 35
    const hx = Math.cos(rad) * handleDist
    const hy = Math.sin(rad) * handleDist

    return (
      <div className="absolute pointer-events-none" style={{ left: `${selectedBoard.pin_x}%`, top: `${selectedBoard.pin_y}%`, transform: 'translate(-50%, -50%)', zIndex: 30 }}>
        <svg className="absolute pointer-events-none" style={{ left: 0, top: 0, overflow: 'visible' }}>
          <line x1={0} y1={0} x2={hx} y2={hy} stroke="#4b5563" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.4} />
        </svg>
        <div className="handle-element absolute w-4 h-4 bg-white border-2 border-gray-600 rounded-full cursor-grab pointer-events-auto shadow-lg flex items-center justify-center"
          style={{ left: hx - 8, top: hy - 8 }}
          onMouseDown={handleBoardRotateMouseDown}
          title="Drag to rotate"
        >
          <div className="w-1 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="absolute text-[9px] font-semibold text-gray-600 bg-white/90 px-1 rounded pointer-events-none"
          style={{ left: hx - 10, top: hy + 10 }}>
          {Math.round(selectedBoard.facing_deg)}&deg;
        </div>
      </div>
    )
  }

  // Context value — memoized to prevent unnecessary re-renders
  const ctx = useMemo<AppState & AppActions>(() => ({
    photos, boards, mode,
    selectedId, selectedKind, draggingId, showAllPhotos, userName,
    setPhotos, setBoards,
    select, setDraggingId,
    updatePhoto, updateBoard,
    addPhoto, addBoard,
    removePhoto, removeBoard,
    enterBoardFocus, exitBoardFocus,
    assignPhotoToBoard, unassignPhoto,
    toggleShowAllPhotos,
  }), [photos, boards, mode, selectedId, selectedKind, draggingId, showAllPhotos, userName,
    select, setDraggingId, updatePhoto, updateBoard, addPhoto, addBoard, removePhoto, removeBoard,
    enterBoardFocus, exitBoardFocus, assignPhotoToBoard, unassignPhoto, toggleShowAllPhotos])

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
          boardLabel={focusedBoard?.label}
        />

        <div className="flex-1 flex overflow-hidden min-h-0">
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
                  style={{ pointerEvents: 'auto' }}
                >
                  {floorplanUrl && !floorplanError ? (
                    <img
                      ref={floorplanRef}
                      src={floorplanUrl}
                      alt="Floor plan"
                      className="max-w-none select-none shadow-lg rounded-sm"
                      draggable={false}
                      style={{ display: 'block' }}
                      onError={() => setFloorplanError(true)}
                    />
                  ) : (
                    <div
                      ref={floorplanRef as React.Ref<HTMLDivElement>}
                      className="w-[800px] h-[600px] bg-white border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 rounded-lg"
                    >
                      {floorplanError
                        ? 'Floor plan image failed to load — check NEXT_PUBLIC_FLOORPLAN_URL'
                        : 'No floor plan configured — set NEXT_PUBLIC_FLOORPLAN_URL'}
                    </div>
                  )}

                  {/* Photo pins (only in board focus mode) */}
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
                      assignedPhotoUrl={boardPhotoUrls.get(board.id) || null}
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
            {uploading.length > 0 && (
              <div className="absolute bottom-4 left-4 bg-white rounded-lg shadow-xl border border-gray-200 p-3 z-40 min-w-[200px]">
                <div className="text-xs font-semibold text-gray-600 mb-2">Uploading...</div>
                {uploading.map((u) => (
                  <div key={u.id} className="flex items-center gap-2 text-xs text-gray-500 py-0.5">
                    {u.done ? <span className="text-green-500">&#10003;</span> : <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                    <span className="truncate max-w-[150px]">{u.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Board Focus Panel (side panel) */}
          {focusedBoard && (
            <BoardFocusPanel
              board={focusedBoard}
              photos={photos}
              boards={activeBoards}
              showAllPhotos={showAllPhotos}
              onToggleShowAll={toggleShowAllPhotos}
              onAssignPhoto={(photoId) => assignPhotoToBoard(photoId, focusedBoard.id)}
              onUnassignPhoto={() => {
                const assigned = photos.find(p => p.board_id === focusedBoard.id && !p.deleted_at)
                if (assigned) unassignPhoto(assigned.id)
              }}
              onDeletePhoto={deletePhoto}
              onTogglePhotoType={togglePhotoType}
              onUploadPhotos={handleUploadPhotos}
              onDeleteBoard={requestDeleteBoard}
              onBack={exitBoardFocus}
              updateBoard={updateBoard}
            />
          )}
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
