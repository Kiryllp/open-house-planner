'use client'

import { useRef } from 'react'
import type { TopTab } from '@/lib/store'

interface Props {
  tab: TopTab
  realCount: number
  conceptCount: number
  trashCount: number
  userName: string
  onChangeTab: (tab: TopTab) => void
  onChangeName: () => void
  onUploadFiles: (files: File[]) => void
  onPrintMap: () => void
  onDownloadOriginals: () => void
  downloading: boolean
}

export function TopBar({
  tab,
  realCount,
  conceptCount,
  trashCount,
  userName,
  onChangeTab,
  onChangeName,
  onUploadFiles,
  onPrintMap,
  onDownloadOriginals,
  downloading,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null)

  return (
    <header className="flex h-14 items-center justify-between border-b border-gray-200 bg-white px-5 shadow-sm">
      <div className="flex items-center gap-5">
        <h1 className="text-base font-semibold tracking-tight text-gray-900">
          Open House Planner
        </h1>
        <button
          type="button"
          onClick={onChangeName}
          className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200"
          title="Change name"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {userName || 'anon'}
        </button>
        <nav className="flex items-center gap-1.5">
          <TabButton
            active={tab === 'real'}
            color="blue"
            onClick={() => onChangeTab('real')}
          >
            Real ({realCount})
          </TabButton>
          <TabButton
            active={tab === 'concept'}
            color="purple"
            onClick={() => onChangeTab('concept')}
          >
            Concept ({conceptCount})
          </TabButton>
          <TabButton
            active={tab === 'trash'}
            color="gray"
            onClick={() => onChangeTab('trash')}
          >
            Trash ({trashCount})
          </TabButton>
        </nav>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Upload Photos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? [])
            if (files.length > 0) onUploadFiles(files)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={onPrintMap}
          className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          title="Open a print-friendly version of the map in a new tab"
        >
          Print Map
        </button>
        <button
          type="button"
          onClick={onDownloadOriginals}
          disabled={downloading}
          className="rounded-md border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          title="Export a ZIP with map, legend, and full-res photos organized by zone"
        >
          {downloading ? 'Exporting…' : 'Export Project'}
        </button>
      </div>
    </header>
  )
}

function TabButton({
  active,
  color,
  onClick,
  children,
}: {
  active: boolean
  color: 'blue' | 'purple' | 'gray'
  onClick: () => void
  children: React.ReactNode
}) {
  const activeClasses =
    color === 'blue'
      ? 'bg-blue-50 text-blue-700 border-blue-200'
      : color === 'purple'
        ? 'bg-purple-50 text-purple-700 border-purple-200'
        : 'bg-gray-100 text-gray-700 border-gray-200'
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
        active ? activeClasses : 'border-transparent text-gray-500 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  )
}
