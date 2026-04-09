export interface Board {
  id: string
  label: string
  pin_x: number
  pin_y: number
  facing_deg: number
  notes: string
  color: string | null
  deleted_at: string | null
  created_at: string
}

export interface Photo {
  id: string
  file_url: string
  type: 'real' | 'concept'
  pin_x: number | null
  pin_y: number | null
  direction_deg: number
  fov_deg: number
  cone_length: number
  notes: string
  color: string | null
  board_id: string | null
  board_status: 'assigned' | 'potential'
  deleted_at: string | null
  created_at: string
  created_by_name: string | null
  visible: boolean
  sort_order: number
  paired_photo_id: string | null
  tags: string[]
}

export type AppMode =
  | { kind: 'overview' }
  | { kind: 'board-focus'; boardId: string }
