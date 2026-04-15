/**
 * Convert a point from client screen coordinates into 0..100 percentage
 * coordinates relative to the given element's bounding box. All stored pin
 * coordinates in the app use this percentage system so they survive zoom,
 * pan, window resize, and floorplan image swaps.
 */
export function screenToPercent(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): { x: number; y: number } {
  const x = ((clientX - rect.left) / rect.width) * 100
  const y = ((clientY - rect.top) / rect.height) * 100
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  }
}

export function percentToPixels(
  xPct: number,
  yPct: number,
  rect: { width: number; height: number },
): { x: number; y: number } {
  return {
    x: (xPct / 100) * rect.width,
    y: (yPct / 100) * rect.height,
  }
}

// Drag thresholds (kept from the previous implementation) — prevent
// accidental pin drags when the user just wants to click.
export const DRAG_DISTANCE_THRESHOLD = 6
export const DRAG_HOLD_THRESHOLD_MS = 120
export const DRAG_FORCE_THRESHOLD = 14
