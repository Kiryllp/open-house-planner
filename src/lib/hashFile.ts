/**
 * Compute SHA-256 of a File/Blob, return as lowercase hex.
 *
 * Used by the upload dedup check in UploadDialog — two files with the
 * same bytes produce the same hex digest regardless of filename, so
 * renames, re-exports, and duplicate-drops all collide correctly.
 *
 * Browser-only: relies on `crypto.subtle`, which is unavailable in the
 * Next.js Edge runtime and in older Node versions. All call sites are
 * in `'use client'` components so this is fine.
 */
export async function hashFile(file: Blob): Promise<string> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const bytes = new Uint8Array(digest)
  let hex = ''
  for (const b of bytes) hex += b.toString(16).padStart(2, '0')
  return hex
}
