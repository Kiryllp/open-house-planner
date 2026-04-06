export interface Board {
  id: string
  label: string
  pin_x: number
  pin_y: number
  facing_deg: number
  notes: string
  deleted_at: string | null
  created_at: string
}

export interface Photo {
  id: string
  file_url: string
  type: 'real' | 'concept'
  pin_x: number
  pin_y: number
  direction_deg: number
  fov_deg: number
  cone_length: number
  notes: string
  board_id: string | null
  deleted_at: string | null
  created_at: string
  created_by_name: string | null
  visible: boolean
  sort_order: number
  paired_photo_id: string | null
  tags: string[]
}

export interface Comment {
  id: string
  parent_type: 'photo' | 'board'
  parent_id: string
  author_name: string
  body: string
  created_at: string
}

export type PinItem =
  | { kind: 'photo'; data: Photo }
  | { kind: 'board'; data: Board }
