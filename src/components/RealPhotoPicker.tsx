'use client'
/* eslint-disable @next/next/no-img-element */

import { useRef } from 'react'
import type { Photo } from '@/lib/types'

interface Props {
  realPhotos: Photo[]
  currentLinkedId: string | null
  onPick: (realId: string) => void
  onUploadNew: (files: File[]) => void
}

export function RealPhotoPicker({
  realPhotos,
  currentLinkedId,
  onPick,
  onUploadNew,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium text-gray-600">
          Link to a real photo
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded bg-blue-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-blue-700"
        >
          Upload new real
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) onUploadNew(files)
            e.target.value = ''
          }}
        />
      </div>

      {realPhotos.length === 0 ? (
        <div className="rounded border border-dashed border-gray-200 py-6 text-center text-xs text-gray-400">
          No real photos yet. Upload one to link.
        </div>
      ) : (
        <div className="grid max-h-[50vh] grid-cols-4 gap-2 overflow-y-auto">
          {realPhotos.map((real) => (
            <button
              type="button"
              key={real.id}
              onClick={() => onPick(real.id)}
              className={`group relative aspect-[4/3] overflow-hidden rounded border ${
                real.id === currentLinkedId
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              <img
                src={real.file_url}
                alt=""
                loading="lazy"
                className="absolute inset-0 h-full w-full object-cover"
              />
              {real.id === currentLinkedId && (
                <span className="absolute left-1 top-1 rounded bg-blue-600 px-1 text-[9px] text-white">
                  linked
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
