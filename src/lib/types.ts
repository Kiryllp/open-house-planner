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
  linked_real_id: string | null

  // Marked as a ground-truth reference image for the AI zone classifier.
  // Must have a zone set to be useful.
  is_anchor: boolean

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

export function zoneRankLabel(rank: number | null | undefined): string {
  if (!rank || rank < 1) return ''
  if (rank === 1) return 'Primary'
  if (rank === 2) return 'Secondary'
  if (rank === 3) return 'Tertiary'
  if (rank === 4) return 'Quaternary'
  return `#${rank}`
}
