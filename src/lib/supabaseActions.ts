import { createClient } from './supabase/client'
import type { Board, Photo, Annotation, ActivityEntry } from './types'

function getClient() {
  return createClient()
}

export async function uploadPhoto(file: File): Promise<string> {
  const supabase = getClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const fileName = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('photos').upload(fileName, file)
  if (error) throw error
  const { data } = supabase.storage.from('photos').getPublicUrl(fileName)
  return data.publicUrl
}

export async function insertPhoto(photo: Omit<Photo, 'id' | 'created_at'>): Promise<Photo> {
  const supabase = getClient()
  const { data, error } = await supabase.from('photos').insert(photo).select().single()
  if (error) throw error
  return data
}

export async function updatePhotoDb(id: string, updates: Partial<Photo>) {
  const supabase = getClient()
  const { error } = await supabase.from('photos').update(updates).eq('id', id)
  if (error) throw error
}

export async function insertBoard(board: Omit<Board, 'id' | 'created_at'>): Promise<Board> {
  const supabase = getClient()
  const { data, error } = await supabase.from('boards').insert(board).select().single()
  if (error) throw error
  return data
}

export async function updateBoardDb(id: string, updates: Partial<Board>) {
  const supabase = getClient()
  const { error } = await supabase.from('boards').update(updates).eq('id', id)
  if (error) throw error
}

export async function insertComment(comment: Omit<import('./types').Comment, 'id' | 'created_at'>) {
  const supabase = getClient()
  const { data, error } = await supabase.from('comments').insert(comment).select().single()
  if (error) throw error
  return data
}

export async function hardDeletePhotos(ids: string[]) {
  const supabase = getClient()
  const { error } = await supabase.from('photos').delete().in('id', ids)
  if (error) throw error
}

export async function hardDeleteBoards(ids: string[]) {
  const supabase = getClient()
  const { error } = await supabase.from('boards').delete().in('id', ids)
  if (error) throw error
}

export async function insertAnnotation(annotation: Omit<Annotation, 'id' | 'created_at'>): Promise<Annotation> {
  const supabase = getClient()
  const { data, error } = await supabase.from('annotations').insert(annotation).select().single()
  if (error) throw error
  return data
}

export async function updateAnnotationDb(id: string, updates: Partial<Annotation>) {
  const supabase = getClient()
  const { error } = await supabase.from('annotations').update(updates).eq('id', id)
  if (error) throw error
}

export async function insertActivity(entry: Omit<ActivityEntry, 'id' | 'created_at'>): Promise<ActivityEntry> {
  const supabase = getClient()
  const { data, error } = await supabase.from('activity_log').insert(entry).select().single()
  if (error) throw error
  return data
}
