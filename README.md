# Open House Planner

A password-gated collaborative web app for planning an open-house fundraiser. Teams upload photos (real reference shots + AI-generated concept renders), organize them into 6 spatial zones, place concept pins on an interactive floor plan with directional FOV cones, link concepts to their real-photo counterparts for side-by-side comparison, and export everything for print or as a ZIP handoff. Built for 3-5 concurrent users with real-time sync via Supabase.

## Quick Start

```bash
git clone https://github.com/Kiryllp/open-house-planner.git
cd open-house-planner
npm install
```

Create `.env.local` in the project root with these variables (ask the project owner for values):

```
NEXT_PUBLIC_SUPABASE_URL=<ask project owner>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ask project owner>
SUPABASE_SERVICE_ROLE_KEY=<ask project owner>
APP_PASSWORD=<ask project owner>
NEXT_PUBLIC_FLOORPLAN_URL=<ask project owner>
```

```bash
npm run dev        # http://localhost:3000
npm run build      # Always verify before pushing
```

Vercel auto-deploys on every push to `main`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript, `proxy.ts` auth gate) |
| Styling | Tailwind CSS 4 (via PostCSS plugin, no tailwind.config) |
| Database | Supabase Postgres (single `photos` table) |
| Storage | Supabase Storage (`photos` bucket, public) |
| Realtime | Supabase Realtime (Postgres Changes + Presence) |
| Canvas | react-zoom-pan-pinch (zoom/pan floor plan) |
| Export | Browser native print + JSZip (client-side ZIP) |
| Icons | lucide-react |
| Toasts | sonner |

---

## File Structure

```
src/
├── app/
│   ├── api/login/route.ts          # POST: validates APP_PASSWORD, sets httpOnly auth cookie
│   ├── export/print/
│   │   ├── page.tsx                # Server component: print-friendly map with placed concept pins
│   │   └── PrintAutoTrigger.tsx    # Client: auto-fires window.print() after floorplan loads
│   ├── login/page.tsx              # Password login form
│   ├── page.tsx                    # Main page (dynamic import of AppShell, no SSR)
│   ├── layout.tsx                  # Root layout with Toaster
│   └── globals.css                 # Tailwind import + CSS variables
├── components/
│   ├── AppShell.tsx                # Auth wrapper: name prompt → MainScreen
│   ├── MainScreen.tsx              # Main orchestrator: all state, tabs, layout (~400 lines)
│   ├── TopBar.tsx                  # Header: tabs (Real/Concept/Trash), upload, print, download
│   ├── LeftPane.tsx                # Left sidebar: unused concepts grouped by zone, search, drag source
│   ├── ZoneSection.tsx             # Zone group within LeftPane (drop target for zone reassignment)
│   ├── UnusedPhotoCard.tsx         # Draggable photo thumbnail with rank badge, sibling highlight
│   ├── MapCanvas.tsx               # Zoomable/pannable floor plan with pin rendering, drag-drop target
│   ├── PhotoPin.tsx                # Map pin: colored circle + SVG FOV cone (React.memo)
│   ├── DropPreviewOverlay.tsx      # Ghost pin shown during drag-over on map
│   ├── VisiblePhotosBar.tsx        # Bottom strip: thumbnails of map-placed concepts
│   ├── UploadDialog.tsx            # Modal: file preview, type/zone selection, parallel upload
│   ├── ConceptPreviewModal.tsx     # Modal: full-size preview, comparison slider, zone/notes/linking
│   ├── ComparisonSlider.tsx        # Before/after slider comparing real vs concept photos
│   ├── RealPhotoPicker.tsx         # Grid picker for linking a concept to a real photo
│   ├── SimpleGallery.tsx           # Flat grid gallery (used by Real and Trash tabs)
│   └── NameModal.tsx               # First-visit name entry prompt
├── lib/
│   ├── types.ts                    # Photo interface, ZoneId type, ZONE_IDS, zoneRankLabel
│   ├── store.ts                    # TopTab type (used by TopBar/MainScreen), unused context stubs
│   ├── supabaseActions.ts          # DB mutations: upload, insert, update, soft/hard delete, link, zone
│   ├── useSupabaseData.ts          # Initial data load + realtime subscription + presence
│   ├── coords.ts                   # screenToPercent, percentToPixels, drag thresholds
│   ├── parseZones.ts               # Extract zone assignments from filenames (digits 1-6)
│   ├── exportOriginalsZip.ts       # Build ZIP of placed concepts + manifest.json
│   ├── undoRedo.ts                 # Unused undo/redo hook (kept for potential future use)
│   └── supabase/
│       ├── client.ts               # Browser Supabase client (singleton)
│       └── server.ts               # Server Supabase client (cookie-based)
└── proxy.ts                        # Next.js 16 request proxy: cookie auth gate, redirects to /login
```

---

## Data Model

Single table: **`photos`** (after 5 migrations: `001_initial_schema` through `005_anchors`).

| Column | Type | Purpose |
|--------|------|---------|
| `id` | uuid PK | Auto-generated |
| `file_url` | text | Supabase Storage public URL |
| `type` | `'real'` \| `'concept'` | Photo classification |
| `zone` | smallint 1-6, nullable | Venue zone assignment (null = unassigned) |
| `zone_rank` | smallint 1-9, nullable | Priority within zone (1=Primary, 2=Secondary, etc.) |
| `pin_x`, `pin_y` | float, nullable | Map position as 0-100 percentages; null = not placed on map |
| `direction_deg` | float | Camera direction in degrees |
| `fov_deg` | float | Field of view angle (default 70) |
| `cone_length` | float | Visual cone length in pixels (default 120) |
| `source_upload_id` | uuid, nullable | Groups duplicate rows from the same uploaded file |
| `linked_real_id` | uuid, nullable (self-FK) | Concept-to-real photo link |
| `is_anchor` | boolean | AI classifier reference flag (reserved for future use) |
| `color` | text, nullable | Custom pin color override |
| `notes` | text, nullable | Freeform notes |
| `tags` | text[], nullable | Tag array |
| `sort_order` | int, nullable | Manual ordering |
| `created_by_name` | text, nullable | Who uploaded this photo |
| `deleted_at` | timestamptz, nullable | Soft-delete timestamp (null = active) |
| `created_at` | timestamptz | Creation timestamp |

Legacy tables (`boards`, `comments`, `annotations`, `activity_log`) were dropped in migration `004_simplify_to_zones.sql`.

---

## Key Concepts

### Zones and Ranking
The venue is divided into 6 zones. Each concept photo belongs to one zone. A single uploaded file can be placed into multiple zones — this creates one `photos` row per zone, all sharing the same `source_upload_id` and `file_url`. Within a zone, photos are ranked: Primary (1), Secondary (2), Tertiary (3), etc. The rank is set by click order during upload.

### Filename-Based Zone Parsing
`parseZonesFromFilename` in `src/lib/parseZones.ts` scans filenames for digits 1-6 to auto-populate zones during upload. First-seen order determines rank. Example: `zone_3_4_5_concept.jpg` → zones [3, 4, 5] with ranks Primary/Secondary/Tertiary. Version suffixes (`_vN`) and ordinals (`1st`, `2nd`) are stripped before parsing to avoid false matches.

### Percentage Coordinate System
All pin coordinates are stored as percentages (0-100) of the floor plan image dimensions, not pixels. This survives zoom, pan, window resize, and floor plan image swaps.

### Two Photo Types
- **Real photos**: Reference shots of the actual venue. Zone assignment is optional. Used for comparison via the ComparisonSlider.
- **Concept photos**: AI-generated renders showing what the space should look like. Must have a zone. Can be placed on the floor plan map.

### Soft Delete
Photos use a `deleted_at` timestamp. Null = active, set = trashed. Soft-deleted photos appear in the Trash tab and can be restored. Hard-delete permanently removes from the database.

### Realtime Sync
Supabase Postgres Changes subscription on the `photos` table. INSERT/UPDATE/DELETE events are applied to local state in real-time. Photos currently being dragged are excluded from realtime updates to prevent fighting. On reconnection after disconnect, the full dataset is reloaded.

### Drag Interactions
- `pin-element` and `pin-handle` CSS classes on interactive elements prevent react-zoom-pan-pinch from capturing their mouse events
- Pin dragging uses a distance/hold threshold to distinguish clicks from drags
- HTML5 drag-and-drop moves photos from the left pane to the map

### Auth
Simple password gate via `proxy.ts` (Next.js 16's request proxy, replaces `middleware.ts`). `POST /api/login` compares password to `APP_PASSWORD` env var and sets an httpOnly `auth` cookie valid for 7 days. User identity is name-based (stored in localStorage), not account-based.

---

## App UI Layout (Concept Tab)

```
┌─────────────────────────────────────────────────────────────┐
│ TopBar: [Real] [Concept] [Trash] | Upload | Print | Export  │
├──────────┬──────────────────────────────────────────────────┤
│ LeftPane │              MapCanvas                           │
│ (unused  │  (zoomable/pannable floor plan with              │
│ concepts │   PhotoPin circles + FOV cones)                  │
│ by zone) │                                                  │
│          │                                                  │
│          ├──────────────────────────────────────────────────┤
│          │ VisiblePhotosBar (placed concept thumbnails)      │
└──────────┴──────────────────────────────────────────────────┘
```

Real tab and Trash tab each render a `SimpleGallery` (flat photo grid) in place of the LeftPane + MapCanvas layout.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anonymous key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | For server-side operations (not currently used in app code) |
| `APP_PASSWORD` | Yes | Password for the login gate |
| `NEXT_PUBLIC_FLOORPLAN_URL` | Yes | URL of the floor plan image (displayed as map background) |

---

## Development Notes

- **Next.js 16** uses `proxy.ts` instead of `middleware.ts` for request interception
- **`cookies()` is async** in Next.js 16 — always `await cookies()`
- **No SSR** — the main app loads via `dynamic()` with `ssr: false`
- **All state lives in `MainScreen.tsx`** via `useState` — no external state management library
- **Supabase realtime subscriptions** are set up once in `useSupabaseData.ts` using refs (never recreated on state changes)
- **Uploads are parallelized** with a concurrency limit of 3 and per-file error handling
- **Images use `loading="lazy"`** on gallery thumbnails to avoid loading all 2-10MB photos at once
