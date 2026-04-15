import type { ZoneId } from './types'

/**
 * Parse zone assignments from a filename.
 *
 * Rule: scan the name for ASCII digits 1–6, deduplicate, preserve first-seen
 * order. The first digit found becomes the Primary placement (rank 1), the
 * second becomes Secondary (rank 2), etc.
 *
 *   parseZonesFromFilename("356.png")     → [3, 5, 6]
 *   parseZonesFromFilename("334.png")     → [3, 4]
 *   parseZonesFromFilename("zone_6a.jpg") → [6]
 *   parseZonesFromFilename("hello.jpg")   → []
 *
 * Digits 0, 7, 8, 9 are ignored (we only have six zones).
 */
export function parseZonesFromFilename(name: string): ZoneId[] {
  const cleaned = name
    .replace(/_v\d+(?=\.[^.]+$)/i, '') // strip version suffix (_v1, _v10) before extension
    .replace(/\d+(st|nd|rd|th)/gi, '') // strip ordinals (1st, 2nd, 3rd, 4th)
  const matches = cleaned.match(/[1-6]/g) ?? []
  const seen = new Set<number>()
  const ordered: ZoneId[] = []
  for (const ch of matches) {
    const n = Number(ch) as ZoneId
    if (!seen.has(n)) {
      seen.add(n)
      ordered.push(n)
    }
  }
  return ordered
}
