import type { Photo } from './types'

/**
 * Pure geometry helpers for the export pipeline. Shared between the
 * canvas-based map renderer and anywhere else that needs to project
 * percentage-based pin positions onto a concrete pixel canvas.
 *
 * No DOM, no React, no async — just math. Deliberately testable.
 */

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface PinRenderData {
  photo: Photo
  /** 1-based pin number as it appears on the map and in the PDF key */
  index: number
  /** Absolute pixel center of the pin badge */
  cx: number
  cy: number
  /** Cone polygon in pixel space: [center, tipA, tipB] */
  cone: [[number, number], [number, number], [number, number]]
  /** Pin accent color (fallback when photo.color is unset) */
  color: string
  /** Label drawn inside the pin circle, e.g. "3" */
  label: string
}

const DEFAULT_PIN_COLOR = '#a855f7'

/**
 * `object-fit: contain`-style fit: preserve aspect ratio, center inside
 * the box, return the fitted rectangle in the box's own pixel space.
 */
export function fitImageInBox(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): Rect {
  if (imgW <= 0 || imgH <= 0 || boxW <= 0 || boxH <= 0) {
    return { x: 0, y: 0, w: boxW, h: boxH }
  }
  const imgAspect = imgW / imgH
  const boxAspect = boxW / boxH
  if (imgAspect > boxAspect) {
    // Image is wider than the box → fit to full box width
    const w = boxW
    const h = boxW / imgAspect
    return { x: 0, y: (boxH - h) / 2, w, h }
  }
  // Image is taller than the box → fit to full box height
  const h = boxH
  const w = boxH * imgAspect
  return { x: (boxW - w) / 2, y: 0, w, h }
}

/**
 * Compute pin render data for a flat list of placed photos.
 *
 * Pin positions use `(pin_x / 100, pin_y / 100)` relative to the *whole*
 * canvas, not the fitted floorplan rect — that matches how the live
 * `MapCanvas` stores click coordinates (relative to its container, with
 * letterboxing included). `floorplanBounds` is passed in so this function
 * can pick a sensible default cone length and so callers can reason about
 * where the image actually lives.
 */
export function layoutMapPins(
  photos: Photo[],
  canvasWidth: number,
  canvasHeight: number,
  floorplanBounds: Rect,
  coneLen?: number,
): PinRenderData[] {
  // Default cone length scales with the rendered image so the cones look
  // right whether the canvas is 1600×1067 or 2000×1400.
  const defaultLen =
    Math.min(floorplanBounds.w, floorplanBounds.h) * 0.06 || 60
  const len = coneLen ?? defaultLen

  const result: PinRenderData[] = []
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    if (photo.pin_x == null || photo.pin_y == null) continue

    const cx = (photo.pin_x / 100) * canvasWidth
    const cy = (photo.pin_y / 100) * canvasHeight

    // Match PhotoPin.tsx: direction_deg is measured clockwise from north,
    // so we offset by -90° to get standard math angles.
    const dirRad = ((photo.direction_deg ?? 0) - 90) * (Math.PI / 180)
    const halfFov = ((photo.fov_deg ?? 60) / 2) * (Math.PI / 180)

    const tipX1 = cx + Math.cos(dirRad - halfFov) * len
    const tipY1 = cy + Math.sin(dirRad - halfFov) * len
    const tipX2 = cx + Math.cos(dirRad + halfFov) * len
    const tipY2 = cy + Math.sin(dirRad + halfFov) * len

    result.push({
      photo,
      index: i + 1,
      cx,
      cy,
      cone: [
        [cx, cy],
        [tipX1, tipY1],
        [tipX2, tipY2],
      ],
      color: photo.color || DEFAULT_PIN_COLOR,
      label: String(i + 1),
    })
  }
  return result
}
