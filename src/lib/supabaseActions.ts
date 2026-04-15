import { createClient } from './supabase/client'
import type { Photo } from './types'

export type PhotoInsert = Omit<Photo, 'id' | 'created_at'>

function getClient() {
  return createClient()
}

export async function uploadPhoto(file: File): Promise<string> {
  const supabase = getClient()
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
  const fileName = `${crypto.randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('photos').upload(fileName, file, {
    contentType: file.type || undefined,
  })
  if (error) throw error
  const { data } = supabase.storage.from('photos').getPublicUrl(fileName)
  return data.publicUrl
}

export async function insertPhoto(photo: PhotoInsert): Promise<Photo> {
  const supabase = getClient()
  const { data, error } = await supabase.from('photos').insert(photo).select().single()
  if (error) throw error
  return data as Photo
}

export async function insertPhotos(photos: PhotoInsert[]): Promise<Photo[]> {
  if (photos.length === 0) return []
  const supabase = getClient()
  const { data, error } = await supabase.from('photos').insert(photos).select()
  if (error) throw error
  return (data ?? []) as Photo[]
}

export async function updatePhotoDb(id: string, updates: Partial<Photo>) {
  const supabase = getClient()
  const { error } = await supabase.from('photos').update(updates).eq('id', id)
  if (error) throw error
}

export async function softDeletePhoto(id: string) {
  return updatePhotoDb(id, { deleted_at: new Date().toISOString() })
}

export async function restorePhoto(id: string) {
  return updatePhotoDb(id, { deleted_at: null })
}

export async function hardDeletePhotos(ids: string[]) {
  if (ids.length === 0) return
  const supabase = getClient()
  const { error } = await supabase.from('photos').delete().in('id', ids)
  if (error) throw error
}

export async function linkConceptToReal(conceptId: string, realId: string | null) {
  return updatePhotoDb(conceptId, { linked_real_id: realId })
}

export async function setPhotoZone(
  id: string,
  zone: Photo['zone'],
  zone_rank: number | null,
) {
  return updatePhotoDb(id, { zone, zone_rank })
}

export async function placePhotoOnMap(
  id: string,
  pin_x: number,
  pin_y: number,
) {
  return updatePhotoDb(id, { pin_x, pin_y })
}

export async function removePhotoFromMap(id: string) {
  return updatePhotoDb(id, { pin_x: null, pin_y: null })
}
