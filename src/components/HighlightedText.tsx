'use client'

import { Fragment } from 'react'
import type { MatchIndex } from '@/lib/searchPhotos'

interface Props {
  text: string | null | undefined
  matches?: readonly MatchIndex[]
  fallback?: string
  className?: string
  markClassName?: string
}

/**
 * Renders `text` with the character ranges in `matches` wrapped in `<mark>`.
 *
 * - If `text` is null/undefined, renders `fallback` (plain, not highlighted).
 * - If `matches` is empty or undefined, renders the text as-is.
 * - Overlapping / out-of-order ranges are sanitized defensively.
 *
 * Fuse's match indices are inclusive ranges like `[start, end]`, so we slice
 * `[start, end + 1)`.
 */
export function HighlightedText({
  text,
  matches,
  fallback = '',
  className,
  markClassName = 'rounded bg-yellow-100 px-0.5 text-inherit',
}: Props) {
  if (text == null || text === '') {
    return <span className={className}>{fallback}</span>
  }

  if (!matches || matches.length === 0) {
    return <span className={className}>{text}</span>
  }

  // Sort + clamp + merge overlapping ranges defensively.
  const sorted = [...matches]
    .map(([a, b]) => [Math.max(0, a), Math.min(text.length - 1, b)] as const)
    .filter(([a, b]) => b >= a)
    .sort((a, b) => a[0] - b[0])

  const merged: Array<readonly [number, number]> = []
  for (const [a, b] of sorted) {
    const last = merged[merged.length - 1]
    if (last && a <= last[1] + 1) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], b)] as const
    } else {
      merged.push([a, b] as const)
    }
  }

  const parts: React.ReactNode[] = []
  let cursor = 0
  merged.forEach(([start, end], i) => {
    if (start > cursor) {
      parts.push(<Fragment key={`p${i}`}>{text.slice(cursor, start)}</Fragment>)
    }
    parts.push(
      <mark key={`m${i}`} className={markClassName}>
        {text.slice(start, end + 1)}
      </mark>,
    )
    cursor = end + 1
  })
  if (cursor < text.length) {
    parts.push(<Fragment key="tail">{text.slice(cursor)}</Fragment>)
  }

  return <span className={className}>{parts}</span>
}
