export type ZoneId = 1 | 2 | 3 | 4 | 5 | 6

export interface Photo {
  id: string
  file_url: string
  type: 'real' | 'concept'

  // Zone placement (concepts have a zone; real photos have zone = null).
  // zone_rank is 1 = Primary, 2 = Secondary, 3 = Tertiary, etc.
  zone: ZoneId | null
  zone_rank: number | null

  // Sibling-grouping for duplicates created from a single upload.
  // All rows created from the same file share the same source_upload_id.
  source_upload_id: string | null

  // Map placement. pin_x === null means the photo is in the left pane
  // (unused). pin_x / pin_y are 0..100 percentages of the floorplan.
  pin_x: number | null
  pin_y: number | null
  direction_deg: number
  fov_deg: number
  cone_length: number

  // Concept → Real linking (one real can be linked by many concepts).
  // Only meaningful when type === 'concept'.
  //
  // INVARIANT: All concept rows that share a `source_upload_id` MUST have the
  // same `linked_real_id`. A multi-zone upload produces one row per zone, and
  // the link state is cascaded across the whole group. Write only via
  // `updateConceptGroupLinkTracked` in `supabaseActions.ts` — writing this
  // column directly will leave sibling zones inconsistent.
  linked_real_id: string | null

  // Marked as a ground-truth reference image for the AI zone classifier.
  // Must have a zone set to be useful.
  is_anchor: boolean

  // Human-readable display name (defaults to original filename sans extension)
  name: string | null

  // Misc
  color: string | null
  notes: string | null
  tags: string[] | null
  sort_order: number | null
  created_by_name: string | null
  deleted_at: string | null
  created_at: string
}

export const ZONE_IDS: ZoneId[] = [1, 2, 3, 4, 5, 6]

export const PIN_COLORS = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6',
  '#1abc9c', '#e67e22', '#2980b9', '#27ae60', '#c0392b',
  '#8e44ad', '#d35400', '#16a085', '#f1c40f', '#e84393',
]

export function zoneRankLabel(rank: number | null | undefined): string {
  if (!rank || rank < 1) return ''
  if (rank === 1) return 'Primary'
  if (rank === 2) return 'Secondary'
  if (rank === 3) return 'Tertiary'
  if (rank === 4) return 'Quaternary'
  return `#${rank}`
}
