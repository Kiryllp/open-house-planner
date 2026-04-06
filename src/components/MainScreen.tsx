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

  // Overlap popover
  const [overlap, setOverlap] = useState<{
    items: { id: string; kind: 'photo' | 'board'; label: string; type?: 'real' | 'concept' }[]
    position: { x: number; y: number }
  } | null>(null)

  // Type picker for newly dropped photos
  const [typePicker, setTypePicker] = useState<{
    photoId: string
    position: { x: number; y: number }
  } | null>(null)

  // Refs
  const canvasRef = useRef<HTMLDivElement>(null)
  const floorplanRef = useRef<HTMLImageElement>(null)
  const dragStartRef = useRef<{ id: string; kind: 'photo' | 'board'; startX: number; startY: number; pinX: number; pinY: number } | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isDraggingRef = useRef(false)

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
  })

  // Coordinate conversion: screen px → percentage of floor plan
  function screenToPercent(clientX: number, clientY: number): { x: number; y: number } | null {
    const img = floorplanRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) }
  }

  // Drop handler for image upload
  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return

    const pos = screenToPercent(e.clientX, e.clientY)
    if (!pos) return

    files.forEach(async (file, i) => {
      try {
        const url = await uploadPhoto(file)
        const photo = await insertPhoto({
          file_url: url,
          type: 'real',
          pin_x: pos.x + i * 2,
          pin_y: pos.y + i * 2,
          direction_deg: 0,
          fov_deg: 70,
          cone_length: 120,
          notes: '',
          board_id: null,
          deleted_at: null,
          created_by_name: userName,
        })
        if (i === 0) {
          setTypePicker({
            photoId: photo.id,
            position: { x: e.clientX, y: e.clientY },
          })
        }
        toast.success('Photo uploaded')
      } catch (err) {
        toast.error(`Upload failed: ${(err as Error).message}`)
      }
    })
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  async function handleTypePick(type: 'real' | 'concept') {
    if (!typePicker) return
    updatePhoto(typePicker.photoId, { type })
    await updatePhotoDb(typePicker.photoId, { type })
    setTypePicker(null)
  }

  // Pin click / selection
  function handlePinClick(id: string, kind: 'photo' | 'board', e: React.MouseEvent) {
    e.stopPropagation()
    // If we were dragging, don't select
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
    dragStartRef.current = {
      id,
      kind,
      startX: e.clientX,
      startY: e.clientY,
      pinX: item.pin_x,
      pinY: item.pin_y,
    }

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

      if (kind === 'photo') {
        updatePhoto(id, { pin_x: clampedX, pin_y: clampedY })
      } else {
        updateBoard(id, { pin_x: clampedX, pin_y: clampedY })
      }

      if (debounceRef.current) clearTimeout(debounceRef.current)
      debounceRef.current = setTimeout(() => {
        if (kind === 'photo') updatePhotoDb(id, { pin_x: clampedX, pin_y: clampedY })
        else updateBoardDb(id, { pin_x: clampedX, pin_y: clampedY })
      }, 150)
    }

    function onMouseUp() {
      if (isDraggingRef.current) {
        // Final persist using current state from the closure
        const img = floorplanRef.current
        if (img && dragStartRef.current) {
          // The last mousemove already scheduled a debounced write — flush it
          if (debounceRef.current) clearTimeout(debounceRef.current)
          // Read the latest coordinates from DOM position (they were set via updatePhoto/updateBoard)
        }
      }
      dragStartRef.current = null
      setDraggingId(null)
      // Reset isDragging after a tick so the click handler can read it
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
        action: {
          label: 'Undo',
          onClick: async () => {
            updatePhoto(capturedId, { deleted_at: null })
            await updatePhotoDb(capturedId, { deleted_at: null })
          },
        },
      })
    } else {
      updateBoard(capturedId, { deleted_at: now })
      await updateBoardDb(capturedId, { deleted_at: now })
      toast('Board deleted', {
        action: {
          label: 'Undo',
          onClick: async () => {
            updateBoard(capturedId, { deleted_at: null })
            await updateBoardDb(capturedId, { deleted_at: null })
          },
        },
      })
    }
    select(null, null)
  }

  async function handleRestore() {
    if (!selectedId || !selectedKind) return
    if (selectedKind === 'photo') {
      updatePhoto(selectedId, { deleted_at: null })
      await updatePhotoDb(selectedId, { deleted_at: null })
    } else {
      updateBoard(selectedId, { deleted_at: null })
      await updateBoardDb(selectedId, { deleted_at: null })
    }
    toast.success('Restored')
  }

  async function handleEmptyTrash() {
    const trashPhotos = photos.filter((p) => p.deleted_at)
    const trashBoards = boards.filter((b) => b.deleted_at)
    if (trashPhotos.length === 0 && trashBoards.length === 0) {
      toast.info('Trash is empty')
      return
    }
    if (trashPhotos.length > 0) {
      await hardDeletePhotos(trashPhotos.map((p) => p.id))
      trashPhotos.forEach((p) => removePhoto(p.id))
    }
    if (trashBoards.length > 0) {
      await hardDeleteBoards(trashBoards.map((b) => b.id))
      trashBoards.forEach((b) => removeBoard(b.id))
    }
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

      if (ev.shiftKey) {
        angle = Math.round(angle / 5) * 5
      }

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
        // Read current direction from state
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
      // Persist final values
      setPhotos(prev => {
        const current = prev.find(p => p.id === photoId)
        if (current) {
          updatePhotoDb(photoId, {
            direction_deg: current.direction_deg,
            fov_deg: current.fov_deg,
            cone_length: current.cone_length,
          })
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

  // Export JSON
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

  // Export Map PDF
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

  // Export Board Packets PDF
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
        if (board.notes) {
          page.drawText(board.notes.slice(0, 100), { x: 40, y: 550, size: 10, font, color: rgb(0.4, 0.4, 0.4) })
        }

        const boardPhotos = photos.filter((p) => p.board_id === board.id && !p.deleted_at)
        let xPos = 40
        let yPos = 500
        for (const photo of boardPhotos) {
          try {
            const imgRes = await fetch(photo.file_url)
            const imgBytes = await imgRes.arrayBuffer()
            let img
            const lowerUrl = photo.file_url.toLowerCase()
            if (lowerUrl.endsWith('.png')) {
              img = await pdfDoc.embedPng(imgBytes)
            } else {
              img = await pdfDoc.embedJpg(imgBytes)
            }
            const scale = Math.min(150 / img.width, 120 / img.height)
            const w = img.width * scale
            const h = img.height * scale
            page.drawImage(img, { x: xPos, y: yPos - h, width: w, height: h })
            if (photo.notes) {
              page.drawText(photo.notes.slice(0, 40), { x: xPos, y: yPos - h - 14, size: 8, font, color: rgb(0.3, 0.3, 0.3) })
            }
            xPos += 170
            if (xPos > 650) {
              xPos = 40
              yPos -= 160
            }
          } catch { /* skip unloadable images */ }
        }
      }

      const unassigned = photos.filter((p) => p.type === 'concept' && !p.board_id && !p.deleted_at)
      if (unassigned.length > 0) {
        const page = pdfDoc.addPage([792, 612])
        page.drawText('Unassigned Concepts', { x: 40, y: 572, size: 20, font: fontBold, color: rgb(0, 0, 0) })
        let xPos = 40
        let yPos = 500
        for (const photo of unassigned) {
          try {
            const imgRes = await fetch(photo.file_url)
            const imgBytes = await imgRes.arrayBuffer()
            let img
            if (photo.file_url.toLowerCase().endsWith('.png')) {
              img = await pdfDoc.embedPng(imgBytes)
            } else {
              img = await pdfDoc.embedJpg(imgBytes)
            }
            const scale = Math.min(150 / img.width, 120 / img.height)
            const w = img.width * scale
            const h = img.height * scale
            page.drawImage(img, { x: xPos, y: yPos - h, width: w, height: h })
            if (photo.notes) {
              page.drawText(photo.notes.slice(0, 40), { x: xPos, y: yPos - h - 14, size: 8, font, color: rgb(0.3, 0.3, 0.3) })
            }
            xPos += 170
            if (xPos > 650) {
              xPos = 40
              yPos -= 160
            }
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

  // Filter visible items
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
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${selectedPhoto.pin_x}%`,
          top: `${selectedPhoto.pin_y}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 30,
        }}
      >
        <div
          className="absolute w-4 h-4 bg-white border-2 border-blue-500 rounded-full cursor-move pointer-events-auto shadow-md"
          style={{ left: tipX - 8, top: tipY - 8 }}
          onMouseDown={(e) => handleConeHandleMouseDown('tip', e)}
          title="Drag to rotate & set length"
        />
        <div
          className="absolute w-3 h-3 bg-white border-2 border-purple-500 rounded-sm cursor-ew-resize pointer-events-auto shadow-md"
          style={{ left: edgeX - 6, top: edgeY - 6 }}
          onMouseDown={(e) => handleConeHandleMouseDown('edge', e)}
          title="Drag to adjust FOV"
        />
      </div>
    )
  }

  function renderBoardRotateHandle() {
    if (!selectedBoard) return null
    const rad = selectedBoard.facing_deg * (Math.PI / 180)
    const handleDist = 30
    const hx = Math.cos(rad) * handleDist
    const hy = Math.sin(rad) * handleDist

    return (
      <div
        className="absolute pointer-events-none"
        style={{
          left: `${selectedBoard.pin_x}%`,
          top: `${selectedBoard.pin_y}%`,
          transform: 'translate(-50%, -50%)',
          zIndex: 30,
        }}
      >
        <div
          className="absolute w-3.5 h-3.5 bg-white border-2 border-gray-600 rounded-full cursor-grab pointer-events-auto shadow-md"
          style={{ left: hx - 7, top: hy - 7 }}
          onMouseDown={handleBoardRotateMouseDown}
          title="Drag to rotate"
        />
      </div>
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
          onExportJSON={handleExportJSON}
          onExportMapPDF={handleExportMapPDF}
          onExportBoardPDF={handleExportBoardPDF}
          onEmptyTrash={handleEmptyTrash}
        />
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-hidden bg-gray-200 relative">
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
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  style={{ pointerEvents: 'auto' }}
                >
                  {floorplanUrl ? (
                    <img
                      ref={floorplanRef}
                      src={floorplanUrl}
                      alt="Floor plan"
                      className="max-w-none select-none"
                      draggable={false}
                      style={{ display: 'block' }}
                    />
                  ) : (
                    <div
                      ref={floorplanRef as React.Ref<HTMLDivElement>}
                      className="w-[800px] h-[600px] bg-white border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400"
                    >
                      No floor plan configured — set NEXT_PUBLIC_FLOORPLAN_URL
                    </div>
                  )}

                  {filteredPhotos.map((photo) => (
                    <PhotoPin
                      key={photo.id}
                      photo={photo}
                      selected={selectedId === photo.id}
                      dimmed={!!photo.deleted_at}
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
                      onClick={(e) => handlePinClick(board.id, 'board', e)}
                      onMouseDown={(e) => handlePinMouseDown(board.id, 'board', e)}
                    />
                  ))}

                  {renderConeHandles()}
                  {renderBoardRotateHandle()}

                  {typePicker && (
                    <TypePickerModal
                      position={typePicker.position}
                      onPick={handleTypePick}
                    />
                  )}
                </div>
              </TransformComponent>
            </TransformWrapper>

            {overlap && (
              <OverlapPopover
                items={overlap.items}
                position={overlap.position}
                onSelect={(id, kind) => select(id, kind)}
                onClose={() => setOverlap(null)}
              />
            )}
          </div>

          {selectedId && (
            <SidePanel onDelete={handleSoftDelete} onRestore={handleRestore} />
          )}
        </div>
      </div>
    </AppContext>
  )
}
