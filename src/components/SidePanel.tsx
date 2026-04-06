'use client'

import { useState, useRef, useEffect } from 'react'
import { useApp } from '@/lib/store'
import { updatePhotoDb, updateBoardDb, insertComment } from '@/lib/supabaseActions'
import {
  X, Camera, Lightbulb, Trash2, RotateCcw, Send,
  Info, Compass, StickyNote, LayoutGrid, MessageSquare, Eye, Crosshair,
} from 'lucide-react'
import type { Photo, Board, Comment } from '@/lib/types'

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function relativeTime(dateStr: string): string {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const diffMs = now - then
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function Avatar({ name }: { name: string }) {
  const colors = ['bg-blue-500', 'bg-purple-500', 'bg-green-500', 'bg-orange-500', 'bg-pink-500']
  const idx = name.charCodeAt(0) % colors.length
  return (
    <div className={`w-6 h-6 rounded-full ${colors[idx]} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
      {name.charAt(0).toUpperCase()}
    </div>
  )
}

function SectionHeader({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5 mb-2">
      <Icon className="w-3.5 h-3.5 text-gray-400" />
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</span>
    </div>
  )
}

function Divider() {
  return <hr className="border-gray-100 mx-4" />
}

/* ------------------------------------------------------------------ */
/*  Comment list (shared)                                             */
/* ------------------------------------------------------------------ */

function CommentsSection({
  comments,
  userName,
  parentType,
  parentId,
}: {
  comments: Comment[]
  userName: string
  parentType: 'photo' | 'board'
  parentId: string
}) {
  const [commentText, setCommentText] = useState('')

  async function handleSendComment() {
    if (!commentText.trim()) return
    await insertComment({
      parent_type: parentType,
      parent_id: parentId,
      author_name: userName,
      body: commentText.trim(),
    })
    setCommentText('')
  }

  return (
    <div className="px-4 py-3">
      <SectionHeader icon={MessageSquare} label="Comments" />

      {comments.length === 0 ? (
        <div className="text-center py-4">
          <MessageSquare className="w-5 h-5 text-gray-300 mx-auto mb-1" />
          <p className="text-xs text-gray-400">No comments yet</p>
        </div>
      ) : (
        <div className="space-y-2.5 mb-3">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <Avatar name={c.author_name} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="text-xs font-semibold text-gray-800">{c.author_name}</span>
                  <span className="text-[10px] text-gray-400">{relativeTime(c.created_at)}</span>
                </div>
                <p className="text-sm text-gray-600 leading-snug mt-0.5">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-gray-400 mb-1.5">Commenting as <span className="font-medium text-gray-500">{userName}</span></p>
      <div className="flex gap-2">
        <input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSendComment()}
          className="flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
          placeholder="Write a comment..."
        />
        <button
          onClick={handleSendComment}
          disabled={!commentText.trim()}
          className="px-2.5 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  SidePanel (entry point)                                           */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  PhotoPanel                                                        */
/* ------------------------------------------------------------------ */

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

  const isDeleted = !!photo.deleted_at
  const assignedBoard = boards.find((b) => b.id === photo.board_id)

  return (
    <div className="w-[360px] bg-white border-l border-gray-200 flex flex-col h-full shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Camera className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-sm text-gray-900">Photo</span>
          {isDeleted && (
            <span className="text-[10px] bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded">Deleted</span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Image preview */}
        <div className="p-4">
          <img
            src={photo.file_url}
            alt=""
            className="w-full rounded-lg shadow-sm border border-gray-100"
          />
          {/* Photo info bar */}
          <div className="flex items-center justify-between mt-2 text-[11px] text-gray-400">
            <span>
              {photo.created_by_name ? `Added by ${photo.created_by_name}` : 'Unknown author'}
            </span>
            <span>{photo.created_at ? relativeTime(photo.created_at) : ''}</span>
          </div>
        </div>

        <Divider />

        {/* Info section: type toggle */}
        <div className="px-4 py-3">
          <SectionHeader icon={Info} label="Info" />
          <div className="flex gap-1.5">
            <button
              onClick={() => handleTypeToggle('real')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                photo.type === 'real'
                  ? 'bg-blue-100 text-blue-700 ring-1 ring-blue-200'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Camera className="w-3.5 h-3.5" /> Real
            </button>
            <button
              onClick={() => handleTypeToggle('concept')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                photo.type === 'concept'
                  ? 'bg-purple-100 text-purple-700 ring-1 ring-purple-200'
                  : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
              }`}
            >
              <Lightbulb className="w-3.5 h-3.5" /> Concept
            </button>
          </div>
        </div>

        <Divider />

        {/* Camera / Cone section */}
        <div className="px-4 py-3">
          <SectionHeader icon={Crosshair} label="Camera" />
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
              <p className="text-[10px] text-gray-400 font-medium mb-0.5">Direction</p>
              <p className="text-sm font-semibold text-gray-700">
                {photo.direction_deg != null ? `${Math.round(photo.direction_deg)}°` : '--'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
              <p className="text-[10px] text-gray-400 font-medium mb-0.5">FOV</p>
              <p className="text-sm font-semibold text-gray-700">
                {photo.fov_deg != null ? `${Math.round(photo.fov_deg)}°` : '--'}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2 text-center">
              <p className="text-[10px] text-gray-400 font-medium mb-0.5">Range</p>
              <p className="text-sm font-semibold text-gray-700">
                {photo.cone_length != null ? `${Math.round(photo.cone_length)}px` : '--'}
              </p>
            </div>
          </div>
          {/* FOV slider */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-400 font-medium">Field of View</span>
              <span className="text-[10px] font-semibold text-gray-500">{Math.round(photo.fov_deg)}°</span>
            </div>
            <input
              type="range"
              min={10}
              max={180}
              step={1}
              value={photo.fov_deg}
              onChange={(e) => {
                const fov = Number(e.target.value)
                updatePhoto(photo.id, { fov_deg: fov })
              }}
              onMouseUp={() => {
                updatePhotoDb(photo.id, { fov_deg: photo.fov_deg })
              }}
              className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-[9px] text-gray-300 mt-0.5">
              <span>10°</span>
              <span>180°</span>
            </div>
          </div>
        </div>

        <Divider />

        {/* Notes */}
        <div className="px-4 py-3">
          <SectionHeader icon={StickyNote} label="Notes" />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
            placeholder="Add notes..."
          />
        </div>

        <Divider />

        {/* Board assignment */}
        <div className="px-4 py-3">
          <SectionHeader icon={LayoutGrid} label="Board" />
          {assignedBoard ? (
            <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-2">
              <span className="text-sm font-medium text-gray-700">{assignedBoard.label}</span>
              <button
                onClick={() => handleBoardAssign(null)}
                className="text-[10px] text-gray-400 hover:text-red-500 transition-colors"
              >
                Remove
              </button>
            </div>
          ) : null}
          <select
            value={photo.board_id || ''}
            onChange={(e) => handleBoardAssign(e.target.value || null)}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 bg-white"
          >
            <option value="">Unassigned</option>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>{b.label}</option>
            ))}
          </select>
        </div>

        <Divider />

        {/* Comments */}
        <CommentsSection
          comments={comments}
          userName={userName}
          parentType="photo"
          parentId={photo.id}
        />
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-3">
        {isDeleted ? (
          <button onClick={onRestore} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
            <RotateCcw className="w-4 h-4" /> Restore Photo
          </button>
        ) : (
          <button onClick={onDelete} className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 transition-colors">
            <Trash2 className="w-4 h-4" /> Delete Photo
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  BoardPanel                                                        */
/* ------------------------------------------------------------------ */

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

  const isDeleted = !!board.deleted_at

  return (
    <div className="w-[360px] bg-white border-l border-gray-200 flex flex-col h-full shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <LayoutGrid className="w-4 h-4 text-gray-500" />
          <span className="font-semibold text-sm text-gray-900">Board</span>
          {isDeleted && (
            <span className="text-[10px] bg-red-100 text-red-600 font-medium px-1.5 py-0.5 rounded">Deleted</span>
          )}
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Label */}
        <div className="px-4 pt-4 pb-3">
          <SectionHeader icon={Info} label="Label" />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={handleLabelBlur}
            className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
          />
        </div>

        <Divider />

        {/* Facing */}
        <div className="px-4 py-3">
          <SectionHeader icon={Compass} label="Orientation" />
          <div className="bg-gray-50 rounded-lg px-3 py-2 inline-flex items-center gap-2">
            <Compass className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-semibold text-gray-700">
              {board.facing_deg != null ? `Facing ${Math.round(board.facing_deg)}°` : 'No facing set'}
            </span>
          </div>
        </div>

        <Divider />

        {/* Notes */}
        <div className="px-4 py-3">
          <SectionHeader icon={StickyNote} label="Notes" />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={handleNotesBlur}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 placeholder:text-gray-400"
            placeholder="Add notes..."
          />
        </div>

        <Divider />

        {/* Assigned photos */}
        <div className="px-4 py-3">
          <SectionHeader icon={Eye} label={`Photos (${photos.length})`} />
          {photos.length === 0 ? (
            <div className="text-center py-4">
              <Camera className="w-5 h-5 text-gray-300 mx-auto mb-1" />
              <p className="text-xs text-gray-400">No photos assigned yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {photos.map((p) => (
                <button key={p.id} onClick={() => onSelectPhoto(p.id)} className="group relative">
                  <img
                    src={p.file_url}
                    alt=""
                    className="w-full aspect-square object-cover rounded-lg border border-gray-200 group-hover:ring-2 group-hover:ring-blue-400 transition-shadow"
                  />
                  {/* Type indicator dot */}
                  <span
                    className={`absolute top-1 right-1 w-2.5 h-2.5 rounded-full border border-white shadow-sm ${
                      p.type === 'real' ? 'bg-blue-500' : 'bg-purple-500'
                    }`}
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* Comments */}
        <CommentsSection
          comments={comments}
          userName={userName}
          parentType="board"
          parentId={board.id}
        />
      </div>

      {/* Footer */}
      <div className="border-t border-gray-200 px-4 py-3">
        {isDeleted ? (
          <button onClick={onRestore} className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors">
            <RotateCcw className="w-4 h-4" /> Restore Board
          </button>
        ) : (
          <button onClick={onDelete} className="flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700 transition-colors">
            <Trash2 className="w-4 h-4" /> Delete Board
          </button>
        )}
      </div>
    </div>
  )
}
