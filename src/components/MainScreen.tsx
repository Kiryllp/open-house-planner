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
  hardDeletePhotos,
  hardDeleteBoards,
} from '@/lib/supabaseActions'
import type { Photo, Board, Comment } from '@/lib/types'
import { TopBar } from './TopBar'
import { SidePanel } from './SidePanel'
import { PhotoPin } from './PhotoPin'
import { BoardPin } from './BoardPin'
import { OverlapPopover } from './OverlapPopover'
import { TypePickerModal } from './TypePickerModal'
import { toPng } from 'html-to-image'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'
import { Upload, ImagePlus, Plus, Loader2 } from 'lucide-react'

interface MainScreenProps {
  userName: string
  onChangeName: (name: string) => void
}

export function MainScreen({ userName, onChangeName }: MainScreenProps) {
  // State
  const [photos, setPhotos] = useState<Photo[]>([])
  const [boards, setBoards] = useState<Board[]>([])
  const [comments, setComments] = useState<Comment[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<'photo' | 'board' | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [filters, setFilters] = useState({
    showReal: true,
    showConcept: true,
    showBoards: true,
    showTrash: false,
  })
  const [loading, setLoading] = useState(true)

  // Overlap popover
  const [overlap, setOverlap] = useState<{
    items: { id: string; kind: 'photo' | 'board'; label: string; type?: 'real' | 'concept' }[]
    position: { x: number; y: number }
  } | null>(null)

  // Type picker queue (supports multi-file drops)
  const [typePickerQueue, setTypePickerQueue] = useState<string[]>([])
  const [typePickerPos, setTypePickerPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  // Drag-over feedback
  const [dragOverCount, setDragOverCount] = useState(0)

  // Upload progress
  const [uploading, setUploading] = useState<{ name: string; done: boolean }[]>([])

  // Trash confirm
  const [showTrashConfirm, setShowTrashConfirm] = useState(false)

  // Refs
  const canvasRef = useRef<HTMLDivElement>(null)
  const floorplanRef = useRef<HTMLImageElement>(null)
  const dragStartRef = useRef<{ id: string; kind: 'photo' | 'board'; startX: number; startY: number; pinX: number; pinY: number } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Cone handle dragging
  const [coneHandleDrag, setConeHandleDrag] = useState<'tip' | 'edge' | null>(null)

  // Actions
  const select = useCallback((id: string | null, kind: 'photo' | 'board' | null) => {
    setSelectedId(id)
    setSelectedKind(kind)
  }, [])

  const toggleFilter = useCallback((key: keyof AppState['filters']) => {
    setFilters((f) => ({ ...f, [key]: !f[key] }))
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

  const addComment = useCallback((comment: Comment) => {
    setComments((prev) => {
      if (prev.some((c) => c.id === comment.id)) return prev
      return [...prev, comment]
    })
  }, [])

  const removePhoto = useCallback((id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id))
  }, [])

  const removeBoard = useCallback((id: string) => {
    setBoards((prev) => prev.filter((b) => b.id !== id))
  }, [])

  // Load data & realtime
  useSupabaseData({
    setPhotos, setBoards, setComments,
    updatePhoto, updateBoard,
    addPhoto, addBoard, addComment,
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

  // Upload photos (shared by drop and button)
  async function doUploadPhotos(files: File[], posX: number, posY: number, screenPos: { x: number; y: number }) {
    const newUploads = files.map(f => ({ name: f.name, done: false }))
    setUploading(prev => [...prev, ...newUploads])
    const uploadedIds: string[] = []

    for (let i = 0; i < files.length; i++) {
      try {
        const url = await uploadPhoto(files[i])
        const photo = await insertPhoto({
          file_url: url,
          type: 'real',
          pin_x: Math.max(0, Math.min(100, posX + i * 2)),
          pin_y: Math.max(0, Math.min(100, posY + i * 2)),
          direction_deg: 0,
          fov_deg: 70,
          cone_length: 120,
          notes: '',
          board_id: null,
          deleted_at: null,
          created_by_name: userName,
        })
        uploadedIds.push(photo.id)
        setUploading(prev => prev.map((u, idx) => u.name === files[i].name && !u.done ? { ...u, done: true } : u))
      } catch (err) {
        toast.error(`Failed to upload ${files[i].name}: ${(err as Error).message}`)
        setUploading(prev => prev.filter(u => u.name !== files[i].name))
      }
    }

    // Clear upload indicators after delay
    setTimeout(() => setUploading(prev => prev.filter(u => !u.done)), 2000)

    // Open type picker queue
    if (uploadedIds.length > 0) {
      setTypePickerQueue(uploadedIds)
      setTypePickerPos(screenPos)
    }
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

    doUploadPhotos(files, pos.x, pos.y, { x: e.clientX, y: e.clientY })
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

  // Upload via button
  function handleUploadPhotos(files: FileList) {
    const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'))
    if (imageFiles.length === 0) return
    // Place at center of floor plan
    const vw = window.innerWidth
    const vh = window.innerHeight
    doUploadPhotos(imageFiles, 50, 50, { x: vw / 2, y: vh / 2 })
  }

  // Type picker handlers
  function handleTypePick(type: 'real' | 'concept') {
    if (typePickerQueue.length === 0) return
    const photoId = typePickerQueue[0]
    updatePhoto(photoId, { type })
    updatePhotoDb(photoId, { type })
    setTypePickerQueue(prev => prev.slice(1))
  }

  function handleTypePickCancel() {
    if (typePickerQueue.length === 0) return
    // Default to 'real' and move on
    setTypePickerQueue(prev => prev.slice(1))
  }

  function handleApplyAllType(type: 'real' | 'concept') {
    for (const photoId of typePickerQueue) {
      updatePhoto(photoId, { type })
      updatePhotoDb(photoId, { type })
    }
    setTypePickerQueue([])
  }

  // Pin click / selection
  function handlePinClick(id: string, kind: 'photo' | 'board', e: React.MouseEvent) {
    e.stopPropagation()
    if (isDraggingRef.current) return

    const clickX = e.clientX
    const clickY = e.clientY
    const nearbyItems: { id: string; kind: 'photo' | 'board'; label: string; type?: 'real' | 'concept' }[] = []

    const allPins = canvasRef.current?.querySelectorAll('[data-pin-id]')
    if (allPins) {
      allPins.forEach((el) => {
        const rect = el.getBoundingClientRect()
        const cx = rect.left + rect.width / 2
        const cy = rect.top + rect.height / 2
        const dist = Math.hypot(clickX - cx, clickY - cy)
        if (dist < 30) {
          const pinId = el.getAttribute('data-pin-id')!
          const pinKind = el.getAttribute('data-pin-kind') as 'photo' | 'board'
          if (pinKind === 'photo') {
            const photo = photos.find((p) => p.id === pinId)
            if (photo) nearbyItems.push({ id: pinId, kind: pinKind, label: `Photo (${photo.type})`, type: photo.type })
          } else {
            const board = boards.find((b) => b.id === pinId)
            if (board) nearbyItems.push({ id: pinId, kind: pinKind, label: board.label })
          }
        }
      })
    }

    if (nearbyItems.length > 1) {
      setOverlap({ items: nearbyItems, position: { x: clickX, y: clickY } })
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

    isDraggingRef.current = false
    dragStartRef.current = { id, kind, startX: e.clientX, startY: e.clientY, pinX: item.pin_x, pinY: item.pin_y }

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

      if (kind === 'photo') updatePhoto(id, { pin_x: clampedX, pin_y: clampedY })
      else updateBoard(id, { pin_x: clampedX, pin_y: clampedY })

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (kind === 'photo') updatePhotoDb(id, { pin_x: clampedX, pin_y: clampedY })
        else updateBoardDb(id, { pin_x: clampedX, pin_y: clampedY })
      }, 150)
    }

    function onMouseUp() {
      if (isDraggingRef.current && debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      dragStartRef.current = null
      setDraggingId(null)
      setTimeout(() => { isDraggingRef.current = false }, 0)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  function handleCanvasClick(e: React.MouseEvent) {
    const target = e.target as HTMLElement
    if (target.closest('[data-pin-id]')) return
    select(null, null)
    setOverlap(null)
  }

  // Keyboard delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'SELECT') return
        handleSoftDelete()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  async function handleSoftDelete() {
    if (!selectedId || !selectedKind) return
    const now = new Date().toISOString()
    const capturedId = selectedId
    const capturedKind = selectedKind

    if (capturedKind === 'photo') {
      updatePhoto(capturedId, { deleted_at: now })
      await updatePhotoDb(capturedId, { deleted_at: now })
      toast('Photo deleted', {
        action: { label: 'Undo', onClick: async () => { updatePhoto(capturedId, { deleted_at: null }); await updatePhotoDb(capturedId, { deleted_at: null }) } },
      })
    } else {
      updateBoard(capturedId, { deleted_at: now })
      await updateBoardDb(capturedId, { deleted_at: now })
      toast('Board deleted', {
        action: { label: 'Undo', onClick: async () => { updateBoard(capturedId, { deleted_at: null }); await updateBoardDb(capturedId, { deleted_at: null }) } },
      })
    }
    select(null, null)
  }

  async function handleRestore() {
    if (!selectedId || !selectedKind) return
    if (selectedKind === 'photo') { updatePhoto(selectedId, { deleted_at: null }); await updatePhotoDb(selectedId, { deleted_at: null }) }
    else { updateBoard(selectedId, { deleted_at: null }); await updateBoardDb(selectedId, { deleted_at: null }) }
    toast.success('Restored')
  }

  async function handleEmptyTrash() {
    const trashPhotos = photos.filter((p) => p.deleted_at)
    const trashBoards = boards.filter((b) => b.deleted_at)
    if (trashPhotos.length === 0 && trashBoards.length === 0) { toast.info('Trash is empty'); return }
    if (trashPhotos.length > 0) { await hardDeletePhotos(trashPhotos.map((p) => p.id)); trashPhotos.forEach((p) => removePhoto(p.id)) }
    if (trashBoards.length > 0) { await hardDeleteBoards(trashBoards.map((b) => b.id)); trashBoards.forEach((b) => removeBoard(b.id)) }
    setShowTrashConfirm(false)
    toast.success('Trash emptied')
  }

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
      })
      select(board.id, 'board')
    } catch (err) {
      toast.error(`Failed to add board: ${(err as Error).message}`)
    }
  }

  // Cone handle drag
  function handleConeHandleMouseDown(handleType: 'tip' | 'edge', e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!selectedId || selectedKind !== 'photo') return
    const photoSnap = photos.find((p) => p.id === selectedId)
    if (!photoSnap) return
    const photoId = photoSnap.id
    const pinX = photoSnap.pin_x
    const pinY = photoSnap.pin_y

    setConeHandleDrag(handleType)

    function onMouseMove(ev: MouseEvent) {
      const pos = screenToPercent(ev.clientX, ev.clientY)
      if (!pos) return
      const dx = pos.x - pinX
      const dy = pos.y - pinY
      let angle = Math.atan2(dy, dx) * (180 / Math.PI) + 90
      if (angle < 0) angle += 360
      if (ev.shiftKey) angle = Math.round(angle / 5) * 5

      if (handleType === 'tip') {
        const img = floorplanRef.current
        if (!img) return
        const rect = img.getBoundingClientRect()
        const dxPx = (dx / 100) * rect.width
        const dyPx = (dy / 100) * rect.height
        const dist = Math.hypot(dxPx, dyPx)
        const newLength = Math.max(30, Math.min(300, dist))
        updatePhoto(photoId, { direction_deg: angle, cone_length: newLength })
      } else {
        setPhotos(prev => {
          const current = prev.find(p => p.id === photoId)
          if (!current) return prev
          const diff = Math.abs(angle - current.direction_deg)
          const fov = Math.min(180, Math.max(10, diff * 2))
          return prev.map(p => p.id === photoId ? { ...p, fov_deg: fov } : p)
        })
      }
    }

    function onMouseUp() {
      setConeHandleDrag(null)
      setPhotos(prev => {
        const current = prev.find(p => p.id === photoId)
        if (current) {
          updatePhotoDb(photoId, { direction_deg: current.direction_deg, fov_deg: current.fov_deg, cone_length: current.cone_length })
        }
        return prev
      })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Board rotate handle
  function handleBoardRotateMouseDown(e: React.MouseEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (!selectedId || selectedKind !== 'board') return
    const boardSnap = boards.find((b) => b.id === selectedId)
    if (!boardSnap) return
    const boardId = boardSnap.id
    const pinX = boardSnap.pin_x
    const pinY = boardSnap.pin_y

    function onMouseMove(ev: MouseEvent) {
      const pos = screenToPercent(ev.clientX, ev.clientY)
      if (!pos) return
      const dx = pos.x - pinX
      const dy = pos.y - pinY
      let angle = Math.atan2(dy, dx) * (180 / Math.PI)
      if (ev.shiftKey) angle = Math.round(angle / 5) * 5
      updateBoard(boardId, { facing_deg: angle })
    }

    function onMouseUp() {
      setBoards(prev => {
        const current = prev.find(b => b.id === boardId)
        if (current) updateBoardDb(boardId, { facing_deg: current.facing_deg })
        return prev
      })
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
  }

  // Exports
  function handleExportJSON() {
    const data = JSON.stringify({ boards, photos, comments }, null, 2)
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `open-house-planner-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('JSON exported')
  }

  async function handleExportMapPDF() {
    const canvas = canvasRef.current
    if (!canvas) return
    toast.info('Generating PDF...')
    try {
      const png = await toPng(canvas, { quality: 0.95 })
      const pdfDoc = await PDFDocument.create()
      const pngImage = await pdfDoc.embedPng(await fetch(png).then((r) => r.arrayBuffer()))
      const { width, height } = pngImage.scale(1)
      const page = pdfDoc.addPage([width, height])
      page.drawImage(pngImage, { x: 0, y: 0, width, height })
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const legendY = 20
      page.drawCircle({ x: 20, y: legendY, size: 6, color: rgb(0.231, 0.510, 0.965) })
      page.drawText('Real', { x: 30, y: legendY - 4, size: 10, font, color: rgb(0, 0, 0) })
      page.drawCircle({ x: 80, y: legendY, size: 6, color: rgb(0.659, 0.333, 0.969) })
      page.drawText('Concept', { x: 90, y: legendY - 4, size: 10, font, color: rgb(0, 0, 0) })
      page.drawRectangle({ x: 150, y: legendY - 5, width: 16, height: 10, color: rgb(0.294, 0.333, 0.388) })
      page.drawText('Board', { x: 170, y: legendY - 4, size: 10, font, color: rgb(0, 0, 0) })
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `map-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Map PDF exported')
    } catch (err) {
      toast.error(`PDF export failed: ${(err as Error).message}`)
    }
  }

  async function handleExportBoardPDF() {
    toast.info('Generating board packets...')
    try {
      const pdfDoc = await PDFDocument.create()
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
      const activeBoards = boards.filter((b) => !b.deleted_at)
      for (const board of activeBoards) {
        const page = pdfDoc.addPage([792, 612])
        page.drawText(board.label, { x: 40, y: 572, size: 20, font: fontBold, color: rgb(0, 0, 0) })
        if (board.notes) page.drawText(board.notes.slice(0, 100), { x: 40, y: 550, size: 10, font, color: rgb(0.4, 0.4, 0.4) })
        const boardPhotos = photos.filter((p) => p.board_id === board.id && !p.deleted_at)
        let xPos = 40, yPos = 500
        for (const photo of boardPhotos) {
          try {
            const imgRes = await fetch(photo.file_url)
            const imgBytes = await imgRes.arrayBuffer()
            const img = photo.file_url.toLowerCase().endsWith('.png') ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes)
            const scale = Math.min(150 / img.width, 120 / img.height)
            page.drawImage(img, { x: xPos, y: yPos - img.height * scale, width: img.width * scale, height: img.height * scale })
            if (photo.notes) page.drawText(photo.notes.slice(0, 40), { x: xPos, y: yPos - img.height * scale - 14, size: 8, font, color: rgb(0.3, 0.3, 0.3) })
            xPos += 170
            if (xPos > 650) { xPos = 40; yPos -= 160 }
          } catch { /* skip */ }
        }
      }
      const unassigned = photos.filter((p) => p.type === 'concept' && !p.board_id && !p.deleted_at)
      if (unassigned.length > 0) {
        const page = pdfDoc.addPage([792, 612])
        page.drawText('Unassigned Concepts', { x: 40, y: 572, size: 20, font: fontBold, color: rgb(0, 0, 0) })
        let xPos = 40, yPos = 500
        for (const photo of unassigned) {
          try {
            const imgRes = await fetch(photo.file_url)
            const imgBytes = await imgRes.arrayBuffer()
            const img = photo.file_url.toLowerCase().endsWith('.png') ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes)
            const scale = Math.min(150 / img.width, 120 / img.height)
            page.drawImage(img, { x: xPos, y: yPos - img.height * scale, width: img.width * scale, height: img.height * scale })
            if (photo.notes) page.drawText(photo.notes.slice(0, 40), { x: xPos, y: yPos - img.height * scale - 14, size: 8, font, color: rgb(0.3, 0.3, 0.3) })
            xPos += 170
            if (xPos > 650) { xPos = 40; yPos -= 160 }
          } catch { /* skip */ }
        }
      }
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `board-packets-${new Date().toISOString().slice(0, 10)}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      toast.success('Board packets PDF exported')
    } catch (err) {
      toast.error(`PDF export failed: ${(err as Error).message}`)
    }
  }

  // Computed
  const filteredPhotos = photos.filter((p) => {
    if (p.deleted_at) return filters.showTrash
    if (p.type === 'real' && !filters.showReal) return false
    if (p.type === 'concept' && !filters.showConcept) return false
    return true
  })

  const filteredBoards = boards.filter((b) => {
    if (b.deleted_at) return filters.showTrash
    return filters.showBoards
  })

  const selectedPhoto = selectedKind === 'photo' ? photos.find((p) => p.id === selectedId) : null
  const selectedBoard = selectedKind === 'board' ? boards.find((b) => b.id === selectedId) : null

  // Determine which photos are highlighted (connected to selected board)
  const highlightedPhotoIds = selectedBoard ? new Set(photos.filter(p => p.board_id === selectedBoard.id && !p.deleted_at).map(p => p.id)) : null
  // Determine which board is highlighted (connected to selected photo)
  const highlightedBoardId = selectedPhoto?.board_id || null

  // Photo counts per board
  const boardPhotoCounts = new Map<string, number>()
  photos.filter(p => !p.deleted_at && p.board_id).forEach(p => {
    boardPhotoCounts.set(p.board_id!, (boardPhotoCounts.get(p.board_id!) || 0) + 1)
  })

  // Filter counts for TopBar
  const photoCounts = {
    real: photos.filter(p => p.type === 'real' && !p.deleted_at).length,
    concept: photos.filter(p => p.type === 'concept' && !p.deleted_at).length,
  }
  const boardCount = boards.filter(b => !b.deleted_at).length
  const trashCount = photos.filter(p => p.deleted_at).length + boards.filter(b => b.deleted_at).length

  const isEmpty = !loading && photos.length === 0 && boards.length === 0

  function renderConeHandles() {
    if (!selectedPhoto) return null
    const dirRad = (selectedPhoto.direction_deg - 90) * (Math.PI / 180)
    const halfFov = (selectedPhoto.fov_deg / 2) * (Math.PI / 180)
    const len = selectedPhoto.cone_length
    const tipX = Math.cos(dirRad) * len
    const tipY = Math.sin(dirRad) * len
    const edgeX = Math.cos(dirRad + halfFov) * len * 0.7
    const edgeY = Math.sin(dirRad + halfFov) * len * 0.7

    return (
      <div className="absolute pointer-events-none" style={{ left: `${selectedPhoto.pin_x}%`, top: `${selectedPhoto.pin_y}%`, transform: 'translate(-50%, -50%)', zIndex: 30 }}>
        {/* Dashed connecting lines */}
        <svg className="absolute pointer-events-none" style={{ left: 0, top: 0, overflow: 'visible' }}>
          <line x1={0} y1={0} x2={tipX} y2={tipY} stroke="#3b82f6" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.5} />
          <line x1={0} y1={0} x2={edgeX} y2={edgeY} stroke="#a855f7" strokeWidth={1} strokeDasharray="3 3" strokeOpacity={0.5} />
        </svg>
        {/* Tip handle */}
        <div className="absolute w-5 h-5 bg-white border-2 border-blue-500 rounded-full cursor-move pointer-events-auto shadow-lg flex items-center justify-center"
          style={{ left: tipX - 10, top: tipY - 10 }}
          onMouseDown={(e) => handleConeHandleMouseDown('tip', e)}
          title="Drag to rotate & set length"
        >
          <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
        </div>
        {/* Tip label */}
        <div className="absolute text-[9px] font-semibold text-blue-600 bg-white/90 px-1 rounded pointer-events-none"
          style={{ left: tipX - 16, top: tipY + 12 }}>
          {Math.round(selectedPhoto.direction_deg)}°
        </div>
        {/* Edge handle */}
        <div className="absolute w-4 h-4 bg-white border-2 border-purple-500 rounded-sm cursor-ew-resize pointer-events-auto shadow-lg flex items-center justify-center"
          style={{ left: edgeX - 8, top: edgeY - 8 }}
          onMouseDown={(e) => handleConeHandleMouseDown('edge', e)}
          title="Drag to adjust FOV"
        >
          <div className="w-1 h-1 bg-purple-500 rounded-full" />
        </div>
        {/* Edge label */}
        <div className="absolute text-[9px] font-semibold text-purple-600 bg-white/90 px-1 rounded pointer-events-none"
          style={{ left: edgeX - 14, top: edgeY + 10 }}>
          FOV {Math.round(selectedPhoto.fov_deg)}°
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
        <div className="absolute w-4 h-4 bg-white border-2 border-gray-600 rounded-full cursor-grab pointer-events-auto shadow-lg flex items-center justify-center"
          style={{ left: hx - 8, top: hy - 8 }}
          onMouseDown={handleBoardRotateMouseDown}
          title="Drag to rotate"
        >
          <div className="w-1 h-1 bg-gray-600 rounded-full" />
        </div>
        <div className="absolute text-[9px] font-semibold text-gray-600 bg-white/90 px-1 rounded pointer-events-none"
          style={{ left: hx - 10, top: hy + 10 }}>
          {Math.round(selectedBoard.facing_deg)}°
        </div>
      </div>
    )
  }

  // Board-photo connection lines
  function renderConnectionLines() {
    if (!selectedBoard) return null
    const assignedPhotos = photos.filter(p => p.board_id === selectedBoard.id && !p.deleted_at)
    if (assignedPhotos.length === 0) return null

    return (
      <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%', zIndex: 5 }}>
        {assignedPhotos.map(p => (
          <line
            key={p.id}
            x1={`${selectedBoard.pin_x}%`} y1={`${selectedBoard.pin_y}%`}
            x2={`${p.pin_x}%`} y2={`${p.pin_y}%`}
            stroke="#6b7280"
            strokeWidth={1}
            strokeDasharray="4 4"
            strokeOpacity={0.5}
          />
        ))}
      </svg>
    )
  }

  const ctx: AppState & AppActions = {
    photos, boards, comments,
    selectedId, selectedKind, draggingId, filters, userName,
    setPhotos, setBoards, setComments,
    select, setDraggingId, toggleFilter,
    updatePhoto, updateBoard,
    addPhoto, addBoard, addComment,
    removePhoto, removeBoard,
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
          onExportJSON={handleExportJSON}
          onExportMapPDF={handleExportMapPDF}
          onExportBoardPDF={handleExportBoardPDF}
          onEmptyTrash={() => setShowTrashConfirm(true)}
          photoCounts={photoCounts}
          boardCount={boardCount}
          trashCount={trashCount}
        />
        <div className="flex-1 flex overflow-hidden">
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
              disabled={!!draggingId || !!coneHandleDrag}
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

                  {/* Connection lines from selected board to its photos */}
                  {renderConnectionLines()}

                  {filteredPhotos.map((photo) => (
                    <PhotoPin
                      key={photo.id}
                      photo={photo}
                      selected={selectedId === photo.id}
                      dimmed={!!photo.deleted_at}
                      highlighted={highlightedPhotoIds ? highlightedPhotoIds.has(photo.id) : true}
                      onClick={(e) => handlePinClick(photo.id, 'photo', e)}
                      onMouseDown={(e) => handlePinMouseDown(photo.id, 'photo', e)}
                    />
                  ))}

                  {filteredBoards.map((board) => (
                    <BoardPin
                      key={board.id}
                      board={board}
                      selected={selectedId === board.id}
                      dimmed={!!board.deleted_at}
                      highlighted={highlightedBoardId ? highlightedBoardId === board.id : true}
                      photoCount={boardPhotoCounts.get(board.id) || 0}
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
                  <span className="text-sm text-gray-400">They'll be placed on the floor plan</span>
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

            {/* Overlap popover */}
            {overlap && (
              <OverlapPopover
                items={overlap.items}
                position={overlap.position}
                onSelect={(id, kind) => select(id, kind)}
                onClose={() => setOverlap(null)}
              />
            )}
          </div>

          {/* Side panel */}
          {selectedId && (
            <SidePanel onDelete={handleSoftDelete} onRestore={handleRestore} />
          )}
        </div>

        {/* Type picker modal */}
        {typePickerQueue.length > 0 && (
          <TypePickerModal
            position={typePickerPos}
            onPick={handleTypePick}
            onCancel={handleTypePickCancel}
            remaining={typePickerQueue.length - 1}
            onApplyAll={typePickerQueue.length > 1 ? handleApplyAllType : undefined}
          />
        )}

        {/* Trash confirm dialog */}
        {showTrashConfirm && (
          <>
            <div className="fixed inset-0 bg-black/30 z-50" onClick={() => setShowTrashConfirm(false)} />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white rounded-xl shadow-2xl p-6 z-50 max-w-sm w-full">
              <h3 className="font-semibold text-gray-900 mb-2">Empty Trash?</h3>
              <p className="text-sm text-gray-500 mb-4">
                This will permanently delete {trashCount} item{trashCount !== 1 ? 's' : ''}. This cannot be undone.
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={() => setShowTrashConfirm(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                <button onClick={handleEmptyTrash} className="px-4 py-2 text-sm bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors">Delete permanently</button>
              </div>
            </div>
          </>
        )}
      </div>
    </AppContext>
  )
}
