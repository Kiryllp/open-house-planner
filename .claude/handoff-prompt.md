# Open House Planner — Agent Handoff Context

## Context

This is a Next.js 16 + Supabase + TypeScript collaborative web app for planning open-house fundraisers. Teams of 3-5 people upload photos (real reference shots + AI concept renders), organize them into 6 spatial zones, place concept pins on a zoomable floor plan, and export for print. It was rewritten from a board-based model to a zone-based model — the database has a single `photos` table, no boards.

The app lives at `/Users/kiryll/Repos/BastropMapApp/open-house-planner/`.

## Architecture Overview

**Three tabs:**
- **Concept** (default): Left pane showing unused concepts grouped by zone + zoomable map canvas with placed concept pins + bottom strip of visible photos. Drag from left pane to map to place.
- **Real**: Flat grid gallery of real (reference) photos.
- **Trash**: Soft-deleted photos with Restore / Delete Forever actions.

**Key files:**
- `src/components/MainScreen.tsx` — Main orchestrator (~400 lines). Owns all state via `useState`. Manages tabs, photo CRUD, drag-drop, upload dialog, preview modal.
- `src/components/LeftPane.tsx` — Left sidebar: unused concepts sorted by zone, search filter, drag source, file drop target.
- `src/components/ZoneSection.tsx` — Zone group within LeftPane, drop target for zone reassignment.
- `src/components/UnusedPhotoCard.tsx` — Draggable thumbnail with rank badge, sibling highlighting, delete button. `React.memo`.
- `src/components/MapCanvas.tsx` — Zoomable/pannable floor plan (react-zoom-pan-pinch). Renders `PhotoPin` for each placed concept. Handles pin drag, left-pane drop, file drop.
- `src/components/PhotoPin.tsx` — Map pin: 20px colored circle + SVG FOV cone. `React.memo` with custom comparator (only checks `photo` and `selected`, intentionally ignores callback props).
- `src/components/DropPreviewOverlay.tsx` — Ghost pin shown during drag-over.
- `src/components/VisiblePhotosBar.tsx` — Bottom strip: horizontal scrollable thumbnails of map-placed concepts.
- `src/components/TopBar.tsx` — Header with tab buttons (Real/Concept/Trash), user name, upload, print, download originals.
- `src/components/UploadDialog.tsx` — Upload modal: per-file type/zone selection, parallel upload (concurrency 3) with progress counter.
- `src/components/ConceptPreviewModal.tsx` — Full-size preview with comparison slider (concept vs linked real), zone reassignment, notes, linking controls, delete.
- `src/components/ComparisonSlider.tsx` — Draggable before/after image slider.
- `src/components/RealPhotoPicker.tsx` — Grid picker for linking a concept to a real photo.
- `src/components/SimpleGallery.tsx` — Flat grid gallery used by Real and Trash tabs.
- `src/components/AppShell.tsx` — Auth wrapper: name prompt then MainScreen.
- `src/components/NameModal.tsx` — First-visit name entry.
- `src/lib/types.ts` — `Photo` interface, `ZoneId` type, `ZONE_IDS`, `zoneRankLabel`.
- `src/lib/store.ts` — `TopTab` type (used by TopBar/MainScreen). Also has unused `AppContext`/`useApp` stubs.
- `src/lib/supabaseActions.ts` — DB mutation helpers: upload, insert, update, soft/hard delete, link, zone placement.
- `src/lib/useSupabaseData.ts` — Initial data load + realtime subscription + presence tracking.
- `src/lib/coords.ts` — Coordinate conversion (screen to percentage), drag thresholds.
- `src/lib/parseZones.ts` — Filename zone parser: strips `_vN` suffixes and ordinals, then extracts digits 1-6.
- `src/lib/exportOriginalsZip.ts` — Client-side ZIP builder for placed concepts + manifest.
- `src/lib/undoRedo.ts` — Unused undo/redo hook (kept for potential future use).
- `src/proxy.ts` — Auth middleware (cookie-based password gate, Next.js 16 proxy).
- `src/app/api/login/route.ts` — Login API.
- `src/app/login/page.tsx` — Login page.
- `src/app/page.tsx` — Main page (dynamic import of AppShell, no SSR).
- `src/app/layout.tsx` — Root layout with Toaster.
- `src/app/export/print/page.tsx` — Print-friendly map view (server component).
- `src/app/export/print/PrintAutoTrigger.tsx` — Auto-triggers window.print() after floorplan loads.
- `supabase/migrations/001-005` — DB schema evolution (boards → zones).

## Data Model

Single table: `photos`. Key columns: `id` (uuid), `file_url`, `type` ('real'|'concept'), `zone` (1-6 nullable), `zone_rank` (nullable), `pin_x`/`pin_y` (0-100% nullable), `direction_deg`, `fov_deg`, `cone_length`, `source_upload_id` (groups duplicates from one upload), `linked_real_id` (concept→real self-FK), `is_anchor` (reserved), `notes`, `tags`, `created_by_name`, `deleted_at`, `created_at`.

## State Management

All state lives in `MainScreen.tsx` via `useState` hooks — there is no external state management library or context provider. The `AppContext`/`useApp` exports in `store.ts` are unused legacy code. `useSupabaseData` handles initial fetch and realtime sync, calling setter callbacks that update MainScreen's local state.

## How To Work

1. **Read ALL source files first.** Build the complete picture before changing anything.
2. **Group fixes by file** to minimize context switching.
3. **After each group of fixes, run `npm run build`** from the `open-house-planner` directory to catch type errors.
4. **Do NOT add new features** unless asked. Focus on making existing features work correctly.
5. **Keep changes minimal and targeted.** Don't rewrite entire files unless necessary.
6. **Test the build compiles after every phase.** TypeScript errors are the fastest feedback.

## Known Remaining Issues

### Code Quality
1. **`store.ts` has unused exports** — `AppContext`, `AppState`, `AppActions`, `useApp()` are dead code. Only `TopTab` is imported.
2. **`undoRedo.ts` is dead code** — never imported anywhere.
3. **No `React.memo` on several list components** — `VisiblePhotosBar`, `ZoneSection` re-render on every MainScreen state change. Consider wrapping in `memo`.

### UX Polish
4. **No visual transition when switching tabs** — content swaps instantly with no animation.
5. **Gallery scroll position resets** when photos change — the left pane re-renders and may jump.
6. **No way to see a photo at full size** from the gallery — only from the ConceptPreviewModal.
7. **Upload dialog with 260+ files** could be slow to render — consider virtualizing the file list.

### Edge Cases
8. **Concurrent zone reassignment** — two users moving the same photo to different zones simultaneously could produce inconsistent `zone_rank` values. No unique constraint prevents this.
9. **No broken image fallback** — if a `file_url` 404s, the thumbnail shows a broken image icon. Should fall back gracefully.
10. **Upload progress counter** shows `done + 1` which can briefly exceed `total` at the end. Cosmetic issue.
