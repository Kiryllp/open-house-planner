'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import type { Photo } from '@/lib/types'
import { renderMapToPng } from '@/lib/mapRender'
import { sortPlacedPhotosForExport } from '@/lib/exportSort'
import { fetchOriginalNames } from '@/lib/photoHistory'
import {
  buildExportZip,
  downloadBlob,
  type ExportError,
} from '@/lib/buildExportZip'

interface Props {
  photos: Photo[]
  floorplanUrl: string | null
  onClose: () => void
}

type Stage =
  | 'idle'
  | 'rendering-map'
  | 'building-pdf'
  | 'fetching-images'
  | 'compressing'
  | 'done'
  | 'error'
  | 'cancelled'

interface ProgressState {
  stage: Stage
  done: number
  total: number
  label: string
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let u = 0
  let v = bytes
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u++
  }
  return `${v.toFixed(v >= 10 || u === 0 ? 0 : 1)} ${units[u]}`
}

export function ExportDialog({ photos, floorplanUrl, onClose }: Props) {
  const [includePdf, setIncludePdf] = useState(true)
  const [includeAll, setIncludeAll] = useState(true)
  const [includeZones, setIncludeZones] = useState(true)
  const [includeIndex, setIncludeIndex] = useState(true)
  const [includeFullsize, setIncludeFullsize] = useState(false)

  const [progress, setProgress] = useState<ProgressState>({
    stage: 'idle',
    done: 0,
    total: 0,
    label: '',
  })
  const [errors, setErrors] = useState<ExportError[]>([])
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [finalFilename, setFinalFilename] = useState<string | null>(null)
  const [finalSize, setFinalSize] = useState<number>(0)
  const [errorsOpen, setErrorsOpen] = useState(false)

  const abortRef = useRef<AbortController | null>(null)

  // Zone-sorted list of placed concepts. All downstream consumers
  // (map render, PDF builder, ZIP) derive pin numbers from this array's
  // order, so sorting once here is enough to renumber everything.
  const placed = useMemo(
    () =>
      sortPlacedPhotosForExport(
        photos.filter(
          (p) =>
            !p.deleted_at &&
            p.type === 'concept' &&
            p.pin_x != null &&
            p.pin_y != null,
        ),
      ),
    [photos],
  )

  // Real photos the PDF index table may need to look up via
  // linked_real_id. Soft-deleted reals are excluded.
  const realPhotos = useMemo(
    () => photos.filter((p) => p.type === 'real' && !p.deleted_at),
    [photos],
  )

  // Abort any in-flight export on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const running =
    progress.stage !== 'idle' &&
    progress.stage !== 'done' &&
    progress.stage !== 'error' &&
    progress.stage !== 'cancelled'

  const canClose = !running

  const canStart =
    placed.length > 0 && (includeAll || includeZones) && !running

  const handleStart = useCallback(async () => {
    if (!canStart) return
    const ac = new AbortController()
    abortRef.current = ac
    setErrors([])
    setErrorMessage(null)
    setFinalFilename(null)
    setFinalSize(0)
    setErrorsOpen(false)

    try {
      // 1. Render the map PNG.
      setProgress({
        stage: 'rendering-map',
        done: 0,
        total: 1,
        label: 'Rendering map',
      })
      const rendered = await renderMapToPng({
        floorplanUrl,
        photos: placed,
        signal: ac.signal,
      })

      // 2. Build the PDF if requested.
      let mapPdf: Blob | null = null
      if (includePdf) {
        // Dynamic import keeps pdf-lib out of the main bundle.
        const { buildMapPdf } = await import('@/lib/buildMapPdf')

        // Look up the pre-first-rename display name for every placed
        // photo so the index table can render a "was: <original>" line
        // under any row whose display name has changed. Fails open:
        // returns an empty Map on query error.
        const originalNames = includeIndex
          ? await fetchOriginalNames(placed.map((p) => p.id))
          : new Map<string, string>()

        setProgress({
          stage: 'building-pdf',
          done: 0,
          total: placed.length,
          label: 'Building PDF',
        })
        mapPdf = await buildMapPdf({
          placedPhotos: placed,
          realPhotos,
          mapPng: rendered.blob,
          includeIndex,
          includeFullsize,
          originalNames,
          signal: ac.signal,
          onProgress: (done, total, label) => {
            setProgress({
              stage: 'building-pdf',
              done,
              total,
              label,
            })
          },
        })
      }

      // 3. Build the ZIP (parallel fetches inside).
      setProgress({
        stage: 'fetching-images',
        done: 0,
        total: placed.length,
        label: 'Fetching images',
      })
      const result = await buildExportZip({
        placedPhotos: placed,
        mapPng: rendered.blob,
        mapPdf,
        includeAllFolder: includeAll,
        includeZoneFolders: includeZones,
        signal: ac.signal,
        onProgress: (done, total, label) => {
          // Switch stage when the builder moves from fetching to compressing.
          const stage: Stage = label.startsWith('Compressing')
            ? 'compressing'
            : 'fetching-images'
          setProgress({ stage, done, total, label })
        },
      })

      if (ac.signal.aborted) return

      const stamp = new Date().toISOString().slice(0, 10)
      const filename = `open-house-export-${stamp}.zip`
      downloadBlob(result.blob, filename)

      setErrors(result.errors)
      setFinalFilename(filename)
      setFinalSize(result.blob.size)
      setProgress({
        stage: 'done',
        done: 1,
        total: 1,
        label: 'Done',
      })

      if (result.errors.length === 0) {
        toast.success(`Exported ${filename}`)
      } else {
        toast.warning(
          `Exported ${filename} (${result.errors.length} image${
            result.errors.length === 1 ? '' : 's'
          } failed)`,
        )
      }
    } catch (err) {
      if ((err as DOMException)?.name === 'AbortError') {
        setProgress({
          stage: 'cancelled',
          done: 0,
          total: 0,
          label: 'Cancelled',
        })
        return
      }
      console.error('Export failed:', err)
      setErrorMessage((err as Error).message || 'Export failed')
      setProgress({
        stage: 'error',
        done: 0,
        total: 0,
        label: 'Error',
      })
      toast.error((err as Error).message || 'Export failed')
    } finally {
      if (abortRef.current === ac) abortRef.current = null
    }
  }, [
    canStart,
    floorplanUrl,
    placed,
    realPhotos,
    includePdf,
    includeAll,
    includeZones,
    includeIndex,
    includeFullsize,
  ])

  const handleCancel = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const progressPct = useMemo(() => {
    if (progress.stage === 'done') return 100
    if (!running) return 0
    if (progress.total === 0) return 5
    return Math.min(100, Math.round((progress.done / progress.total) * 100))
  }, [progress, running])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2
            id="export-dialog-title"
            className="text-sm font-semibold text-gray-800"
          >
            Export Project
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!canClose}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40"
          >
            Close
          </button>
        </header>

        <div className="flex flex-col gap-4 px-5 py-4">
          {/* Options */}
          <fieldset
            disabled={running}
            className="flex flex-col gap-2 text-sm text-gray-700"
          >
            <legend className="sr-only">Export options</legend>
            <Option
              checked={includePdf}
              onChange={setIncludePdf}
              label="Include PDF (map + key)"
              hint="Cover page, key grid, optionally full-size reference pages"
            />
            <Option
              checked={includeAll}
              onChange={setIncludeAll}
              label="Include All/ folder"
              hint="Every placed concept in a single folder"
            />
            <Option
              checked={includeZones}
              onChange={setIncludeZones}
              label="Include per-zone folders"
              hint="Zone-1/, Zone-2/, ... Unzoned/"
            />
            <Option
              checked={includeIndex && includePdf}
              onChange={setIncludeIndex}
              disabled={!includePdf}
              label="Include photo index table"
              hint="One row per placed concept with filename, zone, and concept + linked-real preview"
            />
            <Option
              checked={includeFullsize && includePdf}
              onChange={setIncludeFullsize}
              disabled={!includePdf}
              label="Include full-size reference pages in PDF"
              hint="One landscape page per concept — increases PDF size"
            />
          </fieldset>

          {placed.length === 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
              No placed photos to export
            </div>
          )}

          {/* Progress */}
          {(running ||
            progress.stage === 'done' ||
            progress.stage === 'cancelled' ||
            progress.stage === 'error') && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-xs text-gray-600">
                <span>{progress.label || progress.stage}</span>
                <span>
                  {progress.stage === 'done'
                    ? 'Done'
                    : running
                      ? `${progressPct}%`
                      : ''}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded bg-gray-200">
                <div
                  className={`h-full transition-all ${
                    progress.stage === 'error'
                      ? 'bg-red-500'
                      : progress.stage === 'done'
                        ? 'bg-emerald-500'
                        : 'bg-blue-600'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}

          {progress.stage === 'done' && finalFilename && (
            <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Exported <span className="font-mono">{finalFilename}</span>{' '}
              ({formatBytes(finalSize)})
            </div>
          )}

          {progress.stage === 'error' && errorMessage && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
              {errorMessage}
            </div>
          )}

          {errors.length > 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <button
                type="button"
                onClick={() => setErrorsOpen((o) => !o)}
                className="flex w-full items-center justify-between font-medium"
              >
                <span>
                  {errors.length} image{errors.length === 1 ? '' : 's'} failed
                  to download
                </span>
                <span className="text-amber-700">
                  {errorsOpen ? 'hide' : 'show'}
                </span>
              </button>
              {errorsOpen && (
                <ul className="mt-2 max-h-40 overflow-y-auto font-mono text-[11px]">
                  {errors.map((e) => (
                    <li key={e.photoId} className="py-1">
                      {e.name}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
              <div className="mt-1 text-[11px] text-amber-700">
                See EXPORT_ERRORS.txt inside the ZIP for the full list.
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-gray-200 bg-gray-50 px-5 py-3">
          {running ? (
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={!canStart}
                className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-40"
              >
                {progress.stage === 'done' ? 'Export again' : 'Start export'}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}

interface OptionProps {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  hint?: string
  disabled?: boolean
}

function Option({ checked, onChange, label, hint, disabled }: OptionProps) {
  return (
    <label
      className={`flex items-start gap-2 ${
        disabled ? 'opacity-50' : 'cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="flex flex-col">
        <span className="text-sm text-gray-800">{label}</span>
        {hint && <span className="text-[11px] text-gray-500">{hint}</span>}
      </span>
    </label>
  )
}
