'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
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

  // Drag-over feedback
  const [dragOverCount, setDragOverCount] = useState(0)

  // Upload progress
  const [uploading, setUploading] = useState<{ name: string; done: boolean }[]>([])

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

  const assignPhotoToBoard = useCallback((photoId: string, boardId: string) => {
    // Unassign the previously assigned photo from this board (1 photo per board)
    setPhotos(prev => prev.map(p => {
      if (p.board_id === boardId && p.id !== photoId) {
        updatePhotoDb(p.id, { board_id: null })
        return { ...p, board_id: null }
      }
      if (p.id === photoId) {
        updatePhotoDb(photoId, { board_id: boardId })
        return { ...p, board_id: boardId }
      }
      return p
    }))
  }, [])

  const unassignPhoto = useCallback((photoId: string) => {
    setPhotos(prev => prev.map(p => p.id === photoId ? { ...p, board_id: null } : p))
    updatePhotoDb(photoId, { board_id: null })
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

  // Upload photos
  async function doUploadPhotos(files: File[], pinX: number | null, pinY: number | null) {
    const boardId = mode.kind === 'board-focus' ? mode.boardId : null
    const newUploads = files.map(f => ({ name: f.name, done: false }))
    setUploading(prev => [...prev, ...newUploads])

    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadPhoto(files[i])
        await insertPhoto({
          file_url: url,
          type: 'real',
          pin_x: pinX != null ? Math.max(0, Math.min(100, pinX + i * 2)) : null as any,
          pin_y: pinY != null ? Math.max(0, Math.min(100, pinY + i * 2)) : null as any,
          direction_deg: 0,
          fov_deg: 70,
          cone_length: 120,
          notes: '',
          board_id: boardId,
          deleted_at: null,
          created_by_name: userName,
          visible: true,
          sort_order: 0,
          paired_photo_id: null,
          tags: [],
          color: null,
        })
        setUploading(prev => prev.map((u) => u.name === files[i].name && !u.done ? { ...u, done: true } : u))
      } catch (err) {
        toast.error(`Failed to upload ${files[i].name}: ${(err as Error).message}`)
        setUploading(prev => prev.filter(u => u.name !== files[i].name))
      }
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

  // Pin click
  function handlePinClick(id: string, kind: 'photo' | 'board', e: React.MouseEvent) {
    e.stopPropagation()
    if (isDraggingRef.current) return

    if (kind === 'board' && mode.kind === 'overview') {
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
        if (kind === 'photo') updatePhotoDb(id, { pin_x: x, pin_y: y })
        else updateBoardDb(id, { pin_x: x, pin_y: y })
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

    select(null, null)
  }

  // Keyboard: Escape exits board focus
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return
      if (e.key === 'Escape' && mode.kind === 'board-focus') {
        exitBoardFocus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [mode, exitBoardFocus])

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
    } catch (err) {
      toast.error(`Failed to add board: ${(err as Error).message}`)
    }
  }

  async function handleDeleteBoard() {
    if (mode.kind !== 'board-focus') return
    const boardId = mode.boardId
    exitBoardFocus()
    await hardDeleteBoards([boardId])
    removeBoard(boardId)
    toast.success('Board deleted')
  }

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
        updatePhotoDb(photoId, lastConeRef.current)
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
        updateBoardDb(boardId, { facing_deg: lastBoardAngleRef.current })
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
  const activeBoards = boards.filter(b => !b.deleted_at)
  const activePhotos = photos.filter(p => !p.deleted_at)

  const focusedBoardId = mode.kind === 'board-focus' ? mode.boardId : null
  const focusedBoard = focusedBoardId ? boards.find(b => b.id === focusedBoardId) : null

  // In board focus mode: only show photo pins assigned to this board that have pin coordinates
  const visiblePhotoPins = focusedBoardId
    ? activePhotos.filter(p => p.board_id === focusedBoardId && p.pin_x != null && p.pin_y != null)
    : []

  const selectedPhoto = selectedKind === 'photo' ? photos.find((p) => p.id === selectedId) : null
  const selectedBoard = selectedKind === 'board' ? boards.find((b) => b.id === selectedId) : null

  // Photo URL map for board pins
  const boardPhotoUrls = new Map<string, string>()
  activePhotos.forEach(p => {
    if (p.board_id && !boardPhotoUrls.has(p.board_id)) {
      boardPhotoUrls.set(p.board_id, p.file_url)
    }
  })

  const isEmpty = !loading && photos.length === 0 && boards.length === 0

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

  // Context value
  const ctx: AppState & AppActions = {
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
  }

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
            className="flex-1 overflow-hidden relative"
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
                  {floorplanUrl ? (
                    <img
                      ref={floorplanRef}
                      src={floorplanUrl}
                      alt="Floor plan"
                      className="max-w-none select-none shadow-lg rounded-sm"
                      draggable={false}
                      style={{ display: 'block' }}
                    />
                  ) : (
                    <div
                      ref={floorplanRef as React.Ref<HTMLDivElement>}
                      className="w-[800px] h-[600px] bg-white border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 rounded-lg"
                    >
                      No floor plan configured — set NEXT_PUBLIC_FLOORPLAN_URL
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
                      selected={selectedId === board.id}
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
                  <span className="text-sm text-gray-400">They&apos;ll be placed on the floor plan</span>
                </div>
              </div>
            )}

            {/* Loading spinner */}
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/50 z-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
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

            {/* Hidden file input for empty state upload button */}
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
                {uploading.map((u, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-gray-500 py-0.5">
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
              onUploadPhotos={handleUploadPhotos}
              onDeleteBoard={handleDeleteBoard}
              onBack={exitBoardFocus}
              updateBoard={updateBoard}
            />
          )}
        </div>
      </div>
    </AppContext>
  )
}
