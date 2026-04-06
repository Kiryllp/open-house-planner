'use client'

import { useState, useRef, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { updatePhotoDb, updateBoardDb, insertComment } from '@/lib/supabaseActions'
import { X, Camera, Lightbulb, Trash2, RotateCcw, Send } from 'lucide-react'
import type { Photo, Board, Comment } from '@/lib/types'

interface SidePanelProps {
  onDelete: () => void
  onRestore: () => void
}

export function SidePanel({ onDelete, onRestore }: SidePanelProps) {
  const { selectedId, selectedKind, photos, boards, comments, select, userName, updatePhoto, updateBoard } = useApp()

  if (!selectedId || !selectedKind) return null

  if (selectedKind === 'photo') {
    const photo = photos.find((p) => p.id === selectedId)
    if (!photo) return null
    return (
      <PhotoPanel
        photo={photo}
        boards={boards.filter((b) => !b.deleted_at)}
        comments={comments.filter((c) => c.parent_type === 'photo' && c.parent_id === photo.id)}
        userName={userName}
        onClose={() => select(null, null)}
        onDelete={onDelete}
        onRestore={onRestore}
        updatePhoto={updatePhoto}
      />
    )
  }

  const board = boards.find((b) => b.id === selectedId)
  if (!board) return null
  return (
    <BoardPanel
      board={board}
      photos={photos.filter((p) => p.board_id === board.id && !p.deleted_at)}
      comments={comments.filter((c) => c.parent_type === 'board' && c.parent_id === board.id)}
      userName={userName}
      onClose={() => select(null, null)}
      onDelete={onDelete}
      onRestore={onRestore}
      onSelectPhoto={(id: string) => select(id, 'photo')}
      updateBoard={updateBoard}
    />
  )
}

function PhotoPanel({
  photo,
  boards,
  comments,
  userName,
  onClose,
  onDelete,
  onRestore,
  updatePhoto,
}: {
  photo: Photo
  boards: Board[]
  comments: Comment[]
  userName: string
  onClose: () => void
  onDelete: () => void
  onRestore: () => void
  updatePhoto: (id: string, updates: Partial<Photo>) => void
}) {
  const [notes, setNotes] = useState(photo.notes)
  const [commentText, setCommentText] = useState('')
  const notesRef = useRef(photo.id)

  useEffect(() => {
    if (notesRef.current !== photo.id) {
      setNotes(photo.notes)
      notesRef.current = photo.id
    }
  }, [photo.id, photo.notes])

  async function handleNotesBlur() {
    if (notes !== photo.notes) {
      updatePhoto(photo.id, { notes })
      await updatePhotoDb(photo.id, { notes })
    }
  }

  async function handleTypeToggle(type: 'real' | 'concept') {
    updatePhoto(photo.id, { type })
    await updatePhotoDb(photo.id, { type })
  }

  async function handleBoardAssign(boardId: string | null) {
    updatePhoto(photo.id, { board_id: boardId })
    await updatePhotoDb(photo.id, { board_id: boardId })
  }

  async function handleSendComment() {
    if (!commentText.trim()) return
    await insertComment({
      parent_type: 'photo',
      parent_id: photo.id,
      author_name: userName,
      body: commentText.trim(),
    })
    setCommentText('')
  }

  const isDeleted = !!photo.deleted_at

  return (
    <div className="w-[360px] bg-white border-l border-gray-200 flex flex-col h-full shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-medium text-sm text-gray-900">Photo</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Image */}
        <div className="p-3">
          <img src={photo.file_url} alt="" className="w-full rounded border border-gray-200" />
        </div>

        {/* Type toggle */}
        <div className="px-4 pb-3">
          <label className="text-xs text-gray-500 font-medium mb-1 block">Type</label>
          <div className="flex gap-1">
            <button
              onClick={() => handleTypeToggle('real')}
              className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
                photo.type === 'real' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Camera className="w-3.5 h-3.5" /> Real
            </button>
            <button
              onClick={() => handleTypeToggle('concept')}
              className={`flex items-center gap-1 px-3 py-1 rounded text-sm font-medium transition-colors ${
                photo.type === 'concept' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" /> Concept
            </button>
          </div>
        </div>

        {/* Notes */}
        <div className="px-4 pb-3">
          <label className="text-xs text-gray-500 font-medium mb-1 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={3}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            placeholder="Add notes..."
          />
        </div>

        {/* Board assignment */}
        <div className="px-4 pb-3">
          <label className="text-xs text-gray-500 font-medium mb-1 block">Assigned Board</label>
          <select
            value={photo.board_id || ''}
            onChange={(e) => handleBoardAssign(e.target.value || null)}
            className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          >
            <option value="">Unassigned</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>

        {/* Comments */}
        <div className="px-4 pb-3">
          <label className="text-xs text-gray-500 font-medium mb-2 block">Comments</label>
          <div className="space-y-2 mb-3">
            {comments.map((c) => (
              <div key={c.id} className="bg-gray-50 rounded p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-xs font-medium text-gray-700">{c.author_name}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
              className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              placeholder="Add comment..."
            />
            <button
              onClick={handleSendComment}
              disabled={!commentText.trim()}
              className="px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-3">
        {isDeleted ? (
          <button onClick={onRestore} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
            <RotateCcw className="w-4 h-4" /> Restore
          </button>
        ) : (
          <button onClick={onDelete} className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        )}
      </div>
    </div>
  )
}

function BoardPanel({
  board,
  photos,
  comments,
  userName,
  onClose,
  onDelete,
  onRestore,
  onSelectPhoto,
  updateBoard,
}: {
  board: Board
  photos: Photo[]
  comments: Comment[]
  userName: string
  onClose: () => void
  onDelete: () => void
  onRestore: () => void
  onSelectPhoto: (id: string) => void
  updateBoard: (id: string, updates: Partial<Board>) => void
}) {
  const [label, setLabel] = useState(board.label)
  const [notes, setNotes] = useState(board.notes)
  const [commentText, setCommentText] = useState('')
  const boardIdRef = useRef(board.id)

  useEffect(() => {
    if (boardIdRef.current !== board.id) {
      setLabel(board.label)
      setNotes(board.notes)
      boardIdRef.current = board.id
    }
  }, [board.id, board.label, board.notes])

  async function handleLabelBlur() {
    if (label !== board.label) {
      updateBoard(board.id, { label })
      await updateBoardDb(board.id, { label })
    }
  }

  async function handleNotesBlur() {
    if (notes !== board.notes) {
      updateBoard(board.id, { notes })
      await updateBoardDb(board.id, { notes })
    }
  }

  async function handleSendComment() {
    if (!commentText.trim()) return
    await insertComment({
      parent_type: 'board',
      parent_id: board.id,
      author_name: userName,
      body: commentText.trim(),
    })
    setCommentText('')
  }

  const isDeleted = !!board.deleted_at

  return (
    <div className="w-[360px] bg-white border-l border-gray-200 flex flex-col h-full shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <span className="font-medium text-sm text-gray-900">Board</span>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Label */}
        <div className="px-4 pt-3 pb-3">
          <label className="text-xs text-gray-500 font-medium mb-1 block">Label</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelBlur}
            className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
        </div>

        {/* Notes */}
        <div className="px-4 pb-3">
          <label className="text-xs text-gray-500 font-medium mb-1 block">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={3}
            className="w-full border border-gray-200 rounded px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            placeholder="Add notes..."
          />
        </div>

        {/* Assigned photos */}
        <div className="px-4 pb-3">
          <label className="text-xs text-gray-500 font-medium mb-2 block">Assigned Photos ({photos.length})</label>
          {photos.length === 0 ? (
            <p className="text-xs text-gray-400">No photos assigned to this board yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <button key={p.id} onClick={() => onSelectPhoto(p.id)} className="group">
                  <img
                    src={p.file_url}
                    alt=""
                    className="w-full aspect-square object-cover rounded border border-gray-200 group-hover:ring-2 group-hover:ring-blue-400"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Comments */}
        <div className="px-4 pb-3">
          <label className="text-xs text-gray-500 font-medium mb-2 block">Comments</label>
          <div className="space-y-2 mb-3">
            {comments.map((c) => (
              <div key={c.id} className="bg-gray-50 rounded p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <span className="text-xs font-medium text-gray-700">{c.author_name}</span>
                  <span className="text-xs text-gray-400">
                    {new Date(c.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-sm text-gray-600">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
              className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              placeholder="Add comment..."
            />
            <button
              onClick={handleSendComment}
              disabled={!commentText.trim()}
              className="px-2 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 px-4 py-3">
        {isDeleted ? (
          <button onClick={onRestore} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
            <RotateCcw className="w-4 h-4" /> Restore
          </button>
        ) : (
          <button onClick={onDelete} className="flex items-center gap-1 text-sm text-red-600 hover:text-red-800">
            <Trash2 className="w-4 h-4" /> Delete
          </button>
        )}
      </div>
    </div>
  )
}
