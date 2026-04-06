export interface Board {
  id: string
  label: string
  pin_x: number
  pin_y: number
  facing_deg: number
  notes: string
  color: string | null // custom color, null = default gray
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
  color: string | null // custom color override, null = use type default
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

export interface Annotation {
  id: string
  type: 'text' | 'rectangle' | 'polygon'
  // For text: single point. For rect: two points (top-left, bottom-right). For polygon: array of points
  points: { x: number; y: number }[] // percentage coords (0-100)
  label: string
  color: string // hex color
  fill_opacity: number // 0-1
  stroke_width: number
  deleted_at: string | null
  created_at: string
  created_by_name: string | null
}

export interface ActivityEntry {
  id: string
  action: string // 'upload_photo' | 'move_pin' | 'assign_board' | 'add_comment' | 'create_board' | 'delete' | 'update' etc
  actor_name: string
  target_type: 'photo' | 'board' | 'annotation' | 'comment'
  target_id: string
  details: Record<string, any> // flexible JSON for before/after state
  created_at: string
}

export type PinItem =
  | { kind: 'photo'; data: Photo }
  | { kind: 'board'; data: Board }
