'use client'
/* eslint-disable @next/next/no-img-element */

import type { Photo } from '@/lib/types'

interface Props {
  photos: Photo[]
  emptyText: string
  title: string
  onPhotoClick?: (photo: Photo) => void
  renderActions?: (photo: Photo) => React.ReactNode
}

/**
 * Flat grid gallery used by the Real and Trash top tabs. Not zone-grouped.
 */
export function SimpleGallery({
  photos,
  emptyText,
  title,
  onPhotoClick,
  renderActions,
}: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-2">
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
        <span className="text-xs text-gray-400">{photos.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto bg-gray-50 p-4">
        {photos.length === 0 ? (
          <div className="py-16 text-center text-sm text-gray-400">{emptyText}</div>
        ) : (
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-[4/3] overflow-hidden rounded border border-gray-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => onPhotoClick?.(photo)}
                  className="absolute inset-0"
                >
                  <img
                    src={photo.file_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
                {renderActions && (
                  <div className="absolute right-1 top-1 hidden gap-1 group-hover:flex">
                    {renderActions(photo)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
