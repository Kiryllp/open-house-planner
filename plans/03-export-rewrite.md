# Plan 3: Export Rewrite (ZIP + PDF)

## Goal

Replace the currently-broken export with a reliable two-artifact export:

1. A ZIP containing
   - `All/` — every placed concept's **original-quality** image
   - One `Zone-<N>/` folder per zone that actually has placed photos
   - `Unzoned/` if any
   - A generated `map.pdf` (see next bullet)

2. A PDF (`map.pdf`) embedded in the ZIP, containing
   - The floorplan with numbered pins rendered at their placed positions
   - A key / legend that lists every concept with a preview thumbnail,
     pin number, name, zone, and notes
   - Optionally a full-resolution reference page per concept

The end user can hand the PDF to anyone on the team and they'll immediately
understand what the event space will look like.

## Current state (verified from code)

### Export trigger
- Button: `src/components/TopBar.tsx:107-115` "Export Project".
- Handler: `src/components/MainScreen.tsx:293-322` `handleExportProject`.
- Map image is generated via `html-to-image` `toPng(exportMapRef.current, { width, height, pixelRatio })` — **no `useCORS`, no image pre-load**.
- ZIP is built in `src/lib/exportOriginalsZip.ts:15-79` via JSZip.

### Current ZIP structure
```
open-house-export-YYYY-MM-DD.zip
├── zone-1/01_name.jpg
├── zone-2/02_name.jpg
├── ...
├── unzoned/...
├── map.png         ← rendered map, currently broken
└── legend.html     ← pretty HTML table of concepts
```

### Bugs verified in the current code path

1. **Canvas taint from cached floorplan** (root cause of the broken map
   image). `MapCanvas.tsx:321` loads the floorplan as a CSS
   `backgroundImage: url(...)` without CORS, so Chromium caches the
   response without the CORS headers. Later,
   `ExportMapRenderer.tsx:32-43` loads the same URL into an `<img
   crossOrigin="anonymous">`. In many Chromium versions the cached
   non-CORS response "wins" and the image is flagged as tainted. `toPng`
   then silently produces a blank or partial PNG instead of throwing.
   Verified from the outside with `curl -H "Origin: http://localhost:3000"`
   — the Supabase response **does** include
   `access-control-allow-origin: *`, so the bucket itself is fine. The
   bug lives entirely on the client.

2. **Silent `.ERROR.txt` fallback.**
   `exportOriginalsZip.ts:62-67` catches any `fetch` failure on a concept
   image and writes a `<name>.ERROR.txt` file next to it. The user sees a
   successful "Export downloaded" toast and only later discovers empty
   folders in the ZIP.

3. **Sequential fetches** (`for` loop, not parallel) — slow on projects
   with many concepts.

4. **No `All/` folder** — the user explicitly wants one.

5. **No PDF.** `package.json` has no PDF library. `legend.html` exists
   but is an HTML file, not a PDF.

6. **No progress UI.** The Export Project button just shows "Exporting…".

### What's worth keeping
- `buildExportZip` → signature + JSZip call → useful skeleton.
- Filename sanitization helpers (`sanitizeFilename`, `extractExt`) → reuse.
- `ExportMapRenderer` component → source of pin geometry math → extract
  into a shared function (see below).
- `downloadBlob` → reuse.

## Why not stay on `html-to-image`

- `toPng` failure mode is silent, not throw-y → hard to trust.
- It depends on the browser agreeing to rasterize cross-origin images, which
  we've just demonstrated breaks for Cloudflare-cached Supabase objects.
- It serializes all CSS including fonts, backdrop-filter, transforms — any
  minor styling change in the future can break the output.

Better: draw the map ourselves with `<canvas>`. We control every pixel,
CORS is handled by `fetch(floorplanUrl)` → `Blob` → `createImageBitmap`,
and the output is deterministic and testable.

## Library choice

**Add**: `pdf-lib` (~400kB minified, ~100kB gzipped, MIT). Builds PDFs
programmatically in the browser, supports embedding PNG/JPG images,
standard fonts (no font download needed), and pages with arbitrary sizes.
Battle-tested; maintained; no native dep.

**Keep**: `jszip` (already installed).

Rejected alternatives:

- `jsPDF + html2canvas` → html2canvas has the same CORS pitfalls as
  html-to-image, and jsPDF is weaker than pdf-lib for programmatic layout.
- `@react-pdf/renderer` → nice DX but larger (~2MB), uses a separate React
  renderer, and SVG support is limited. Doesn't help here because we're
  drawing the map as a bitmap anyway.
- Server-side Puppeteer → would require a new API route with a headless
  browser dep. Overkill when the client can do it.

## Architecture

### 1. Shared pin geometry

**New file: `src/lib/pinGeometry.ts`**

Pure functions, no React dependency. The existing `ExportMapRenderer` and
the new canvas-based renderer both call these.

```ts
export interface PinRenderData {
  photo: Photo
  index: number            // 1-based
  // Absolute pixel position in the rendered canvas
  cx: number
  cy: number
  // Cone polygon in pixel space, three points (center, tipA, tipB)
  cone: [[number, number], [number, number], [number, number]]
  color: string
  label: string            // "3" etc.
}

export function layoutMapPins(
  photos: Photo[],          // placed concepts, in export order
  canvasWidth: number,
  canvasHeight: number,
  floorplanBounds: {        // inset where the actual floorplan is drawn
    x: number; y: number; w: number; h: number
  },
  coneLen?: number,
): PinRenderData[]

export function fitImageInBox(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
): { x: number; y: number; w: number; h: number }  // object-fit: contain
```

### 2. Canvas-based map renderer

**New file: `src/lib/mapRender.ts`**

```ts
export interface RenderedMap {
  blob: Blob               // PNG for ZIP + PDF
  width: number
  height: number
}

export interface RenderMapOptions {
  floorplanUrl: string
  photos: Photo[]          // placed concepts in export order
  width?: number           // default 2000
  height?: number          // default 1400
  signal?: AbortSignal
}

export async function renderMapToPng(
  opts: RenderMapOptions,
): Promise<RenderedMap>
```

Implementation sketch:

1. Create an offscreen `OffscreenCanvas` (or `document.createElement('canvas')`).
2. `fetch(floorplanUrl, { signal })` → `blob()` → `createImageBitmap(blob)`.
3. Compute `fitImageInBox(bitmap.width, bitmap.height, canvasWidth, canvasHeight)`
   to preserve aspect ratio (matches the live map's `backgroundSize: contain`).
4. Fill background white, draw the bitmap at the fitted rect.
5. `const pins = layoutMapPins(photos, canvasWidth, canvasHeight, fittedRect)`.
6. For each pin, draw the cone polygon (fill + stroke), then the circle
   badge, then the index number. Use `ctx.filter` only if needed; prefer
   explicit shadow offsets.
7. `canvas.toBlob('image/png')` → return `{ blob, width, height }`.

Benefits vs. html-to-image:
- `fetch` → `createImageBitmap` path is CORS-clean (no stale cache problem).
- No dependence on DOM layout / offscreen positioning.
- Blazing fast (no DOM serialization).
- Deterministic — if the output looks wrong, we see exactly which pixel
  calls did it.

### 3. Thumbnail generator for the PDF key

**New file: `src/lib/imageThumb.ts`**

```ts
export async function fetchThumbnail(
  url: string,
  maxDim: number,          // e.g. 400
  signal?: AbortSignal,
): Promise<{ bytes: Uint8Array; mime: 'image/jpeg' | 'image/png' }>
```

Implementation:
- `fetch(url, { signal })` → blob.
- `createImageBitmap(blob)`.
- If `max(bitmap.width, bitmap.height) <= maxDim`, return the original
  bytes unmodified (PNG passthrough).
- Otherwise draw to an offscreen canvas at the scaled size, then
  `canvas.convertToBlob({ type: 'image/jpeg', quality: 0.82 })` → bytes.
- Return bytes + mime for pdf-lib to pick the right embed call.

### 4. PDF builder

**New file: `src/lib/buildMapPdf.ts`**

```ts
export interface BuildPdfOptions {
  placedPhotos: Photo[]           // export order
  mapPng: Blob                    // from renderMapToPng
  includeFullsize: boolean
  onProgress?: (done: number, total: number, label: string) => void
  signal?: AbortSignal
}

export async function buildMapPdf(
  opts: BuildPdfOptions,
): Promise<Blob>
```

Page layout:

- **Page 1 — Cover + Map** (Landscape Letter, 792pt × 612pt):
  - Top band (40pt): project title + export date + photo count
  - Main area: embed `mapPng` fitted with 24pt margins
  - Bottom band (20pt): "Open House Planner · [date]"

- **Pages 2..N — Key** (Portrait Letter, 612pt × 792pt):
  - 36pt top margin with "Photo Key" title + page number
  - 3-column × 4-row grid = 12 concepts per page
  - Each cell:
    - Thumbnail (scaled from `fetchThumbnail`, embedded as JPEG)
    - Pin number circle top-left
    - Zone badge bottom-left
    - Name below image, truncated
    - Notes (if any) on the next line, 8pt, grey, truncated
  - Auto-paginate

- **Pages N+1..M — Full-size reference (optional)**:
  - Only if `includeFullsize = true`
  - One concept per page, landscape letter
  - Large image + caption block with name, zone, notes, pin number

Implementation notes:
- Fonts: `StandardFonts.Helvetica`, `StandardFonts.HelveticaBold` — both
  built in to pdf-lib, no fetch needed.
- Embed the map png: `pdf.embedPng(await mapPng.arrayBuffer())`.
- Progress reporting via `onProgress` for "fetching thumbnails (8/42)",
  "drawing key pages", etc.
- AbortSignal is checked between page draws.

### 5. ZIP builder

**Rewrite: `src/lib/exportOriginalsZip.ts` → `src/lib/buildExportZip.ts`**

Why rename: the current file's name implies "originals only"; the new one
is the whole export.

```ts
export interface BuildExportOptions {
  placedPhotos: Photo[]           // in export order
  mapPng: Blob
  mapPdf: Blob
  includeAllFolder: boolean       // default true
  includeZoneFolders: boolean     // default true
  onProgress?: (done: number, total: number, label: string) => void
  signal?: AbortSignal
}

export async function buildExportZip(
  opts: BuildExportOptions,
): Promise<Blob>
```

Internals:
1. Add `mapPng` → `zip.file('map.png', mapPng)`.
2. Add `mapPdf` → `zip.file('map.pdf', mapPdf)`.
3. Build the entries list: `{ index, photo, basename, ext, folderList[] }`.
   A photo goes into `All/` and its own `Zone-N/` (or `Unzoned/`).
4. Parallel fetch with a concurrency limit of 5 (reuse the UploadDialog
   pattern). Cache by `file_url`.
5. Put each fetched blob in every folder it belongs to — JSZip does NOT
   deduplicate storage across folders, but the cost is CPU during compress,
   not fetch, and the file content is identical so gzip dedupes well.
6. If `includeAllFolder` is false, skip the `All/` write.
7. If `includeZoneFolders` is false, skip the `Zone-*/` write (only `All/`).
8. On individual fetch failure: collect into an `errors[]` array and
   write a single `EXPORT_ERRORS.txt` at the root of the ZIP listing each
   failure (file URL, photo name, HTTP status or error message). No more
   silent `.ERROR.txt` stubs.
9. Use `generateAsync({ type: 'blob', streamFiles: true, compression: 'DEFLATE', compressionOptions: { level: 6 } })`
   so large projects don't blow up browser memory.

### 6. Export dialog + progress UI

**New file: `src/components/ExportDialog.tsx`**

Modal opens when TopBar "Export Project" is clicked. Contents:

- **Options section** (all pre-checked sensibly):
  - ☑ Include PDF (map + key)
  - ☑ Include all images in a single All folder
  - ☑ Include per-zone folders
  - ☐ Include full-size reference pages in the PDF
- **Summary**:
  - "This will export N concepts" + computed zone breakdown
  - Estimated ZIP size (rough: sum of known file sizes or "~ calculating").
- **Start / Cancel buttons**.

During export:
- Progress bar with stage labels: "Rendering map (1/5)", "Fetching images
  (12/42)", "Building PDF (3/5)", "Compressing ZIP (4/5)", "Done (5/5)".
- Cancel button wired to an `AbortController`.

On success:
- Auto-trigger the download via `downloadBlob`.
- Show "Exported `open-house-export-2026-04-15.zip` (123 MB)".
- Any per-image errors are listed in a collapsible "N images failed"
  section and also appear in `EXPORT_ERRORS.txt` inside the ZIP.

### 7. Wire-up

**Edited files:**
- `src/components/MainScreen.tsx`:
  - Replace `handleExportProject` (lines 293-322) with a simple
    `setExportOpen(true)`.
  - Render `<ExportDialog>` conditionally, pass in `photos`, `userName`,
    `onClose`, and the floorplan URL.
- `src/components/TopBar.tsx`:
  - No behavior change; the button click still calls the prop, which now
    just toggles the dialog open.
- `src/components/ExportMapRenderer.tsx`:
  - **Delete.** No longer used for the final map render. (Or leave and mark
    `@deprecated` for one release, then delete — but the simpler path is
    to remove it with this change.)
- `src/lib/exportOriginalsZip.ts`:
  - Delete, or leave as a re-export from the new file for one release.
- `package.json`:
  - Add `"pdf-lib": "^1.17.1"`.

## Folder naming decisions

- Top-level folders: `All/`, `Zone-1/`, `Zone-2/`, ... `Zone-6/`, `Unzoned/`.
- File names inside each folder: `NN_name.ext`, where `NN` is the 1-based
  pin index on the map (zero-padded to width of total count), and `name`
  is `sanitizeFilename(photo.name ?? photo.id.slice(0, 8))`. Unicode is
  preserved where the OS supports it — sanitize only to remove path
  separators and control characters, not to strip non-ASCII.
- Concepts that live in multiple zones (`source_upload_id` groups them)
  appear in each zone folder separately, each with their own pin index.
  They also appear in `All/` — once per row, because each row is a
  distinct concept from the data model's perspective.

**Open decision**: do duplicates-in-multi-zone appear once or N times in
`All/`?
- *Current plan:* once per row (matches the photos table).
- *Alternative:* dedupe by `source_upload_id` in `All/`.
- **Recommendation:** once per row. `All/` is literally "all rows".

## How does the new export avoid the current bug?

The broken bit is "canvas taint from cached floorplan". The fix is
structural, not patch-y:

1. `renderMapToPng` does **not use** `html-to-image`. It uses `fetch` →
   `createImageBitmap` → explicit canvas draws. There is nothing in this
   path that consults the browser's `<img>` cache, so the taint-by-cache
   scenario cannot occur.
2. The offscreen canvas is never part of the document, so `html-to-image`'s
   offscreen-positioning hacks are gone.
3. The thumbnails in the PDF key also use `fetch`, so they can't fail for
   the same reason.

## Testing checklist

Against a running dev server:

- [ ] Click Export → dialog opens with correct option defaults.
- [ ] Default options + 5 placed photos → ZIP downloads in < 10 seconds.
- [ ] Extracted ZIP contains `All/`, `Zone-<N>/`, `map.png`, `map.pdf`.
- [ ] `map.png` shows the floorplan with all pins at the right positions
      and correct colors/numbers (visually verify against the live map).
- [ ] Open `map.pdf`:
  - [ ] Page 1: landscape, map fills the area, title + count visible.
  - [ ] Pages 2+: key in a 3×4 grid, thumbnails are crisp, names are
        truncated gracefully, pin numbers match the map.
  - [ ] No font fallback warnings in the PDF viewer.
- [ ] Turn on "Full-size reference pages" → PDF gains extra pages, one per
      concept, landscape orientation, large image.
- [ ] A concept with multiple zone rows appears in both `Zone-1/` and
      `Zone-3/` and once per row in `All/`.
- [ ] No-zone concepts go to `Unzoned/`.
- [ ] Cancel button in the middle of a big export aborts cleanly (no
      zombie promises, no downloaded file).
- [ ] Uncheck "Include PDF" → ZIP has no `map.pdf` but still has
      `map.png`.
- [ ] Uncheck "Include All folder" → only `Zone-*/` folders.
- [ ] Uncheck "Include zone folders" → only `All/`.
- [ ] Simulate a failing image (rename URL to 404 manually in DevTools) →
      export completes, `EXPORT_ERRORS.txt` lists the failure, the rest of
      the ZIP is intact.
- [ ] Very small project (1 photo) works.
- [ ] Large project (100+ photos, assume ~5MB each = ~500MB ZIP) completes
      without OOM in Chrome. Monitor memory.
- [ ] Open the PDF in Adobe Acrobat, Chrome, and Preview; check all three.
- [ ] On Safari (different canvas implementation) check that the map PNG
      still renders correctly.

## Risks and mitigations

- **Large ZIPs blow up browser memory.** JSZip's `streamFiles: true` keeps
  memory manageable but doesn't help the underlying problem — we still
  hold every image blob in RAM. For a realistic 50-concept event with
  ~5MB photos that's 250MB of blobs. Fine. For 500+ photos we would need
  streaming upload to a server, which is out of scope.
- **pdf-lib bundle weight.** ~100kB gzipped. Acceptable for an infrequently
  used feature. Lazy-load it inside `ExportDialog` via dynamic `import()`
  so it's not in the main bundle.
- **Chromium OffscreenCanvas on older versions.** Supported everywhere
  we care about (Chrome 69+, Safari 16.4+, Firefox 105+). Fall back to a
  regular `canvas` element appended off-screen if `OffscreenCanvas` is
  missing — same API surface.
- **Concurrent fetch limit too aggressive.** Start at 5 concurrent; if
  Supabase rate-limits we can drop to 3.
- **pdf-lib doesn't render SVG.** We're drawing pins to canvas for the
  map (no SVG needed) and using JPEGs/PNGs for key thumbnails. OK.
- **Fonts**: we stick to `StandardFonts.Helvetica` and
  `StandardFonts.HelveticaBold`. No font fetch, no licensing worry, no
  Cyrillic/CJK support — acceptable for a US-event tool.
- **Cancellation doesn't abort mid-pdf-draw.** pdf-lib doesn't accept an
  AbortSignal. We check `signal.aborted` between pages and at each
  thumbnail fetch; if the user cancels during the actual `pdf.save()`
  they wait a few extra seconds. Acceptable.
- **Existing print route** (`/export/print`) is unchanged. It remains the
  "quick print" path for anyone who wants to use the browser's native
  print dialog. The new ZIP+PDF path is the "artifact for the team" path.

## Files summary

**New:**
- `src/lib/pinGeometry.ts`
- `src/lib/mapRender.ts`
- `src/lib/imageThumb.ts`
- `src/lib/buildMapPdf.ts`
- `src/lib/buildExportZip.ts` (replaces `exportOriginalsZip.ts`)
- `src/components/ExportDialog.tsx`

**Edited:**
- `src/components/MainScreen.tsx` (replace `handleExportProject`, render
  `ExportDialog`)
- `src/components/TopBar.tsx` (no-op, just passes through)
- `package.json` (add `pdf-lib`)

**Deleted (or deprecated):**
- `src/components/ExportMapRenderer.tsx`
- `src/lib/exportOriginalsZip.ts`

## Out of scope

- Server-side rendering of the map (no Puppeteer).
- Streaming the ZIP to disk while building (would need File System Access
  API — nice-to-have, not essential).
- Generating a public share link to the PDF (no backend work).
- CSV/JSON export of the data model.
- Diffing two exports.
