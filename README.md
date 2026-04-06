# Open House Planner

A password-gated collaborative web app for planning an open-house fundraiser. Teams upload photos (real + concept renders), place them on a floor plan as directional pins with field-of-view cones, position poster boards, assign photos to boards, and export everything as PDFs. Built for 3-5 concurrent users with real-time sync.

## For New Developers — Quick Start

### 1. Clone and install

```bash
git clone https://github.com/Kiryllp/open-house-planner.git
cd open-house-planner
npm install
```

### 2. Get your `.env.local` file

Ask the project owner (Kiryll) for the `.env.local` file. It contains 5 secrets that connect to the shared Supabase backend and Vercel deployment. **Never commit this file.**

Create `.env.local` in the project root with these variables:

```
NEXT_PUBLIC_SUPABASE_URL=<ask project owner>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ask project owner>
SUPABASE_SERVICE_ROLE_KEY=<ask project owner>
APP_PASSWORD=openhouse2026
NEXT_PUBLIC_FLOORPLAN_URL=<ask project owner>
```

### 3. Run locally

```bash
npm run dev
```

Open http://localhost:3000. Enter the password `openhouse2026` at the login screen. Enter your name when prompted.

### 4. Build check before pushing

```bash
npm run build
```

Always verify the build passes before pushing. Vercel auto-deploys on every push to `main`.

---

## Project Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS 4 |
| Database | Supabase (Postgres) |
| Storage | Supabase Storage (photos bucket) |
| Realtime | Supabase Realtime (Postgres Changes) |
| Canvas | react-zoom-pan-pinch |
| PDF Export | pdf-lib + html-to-image |
| Icons | lucide-react |
| Toasts | sonner |

### File Structure

```
src/
├── app/
│   ├── api/login/route.ts     # POST endpoint, validates APP_PASSWORD, sets auth cookie
│   ├── login/page.tsx         # Login page UI
│   ├── page.tsx               # Main page (dynamic import, no SSR)
│   ├── layout.tsx             # Root layout with Toaster
│   └── globals.css            # Tailwind + CSS variables
├── components/
│   ├── MainScreen.tsx         # ★ Core app — canvas, state, all interactions (~1200 lines)
│   ├── TopBar.tsx             # Top navigation bar with filters, upload, export
│   ├── SidePanel.tsx          # Right panel for photo/board editing
│   ├── PhotoPin.tsx           # Photo pin + cone SVG on canvas
│   ├── BoardPin.tsx           # Board pin + cone SVG on canvas
│   ├── CarouselPanel.tsx      # Collapsible horizontal thumbnail strip
│   ├── PhotoCard.tsx          # Thumbnail card for carousels
│   ├── BoardCard.tsx          # Board card for carousel (drop target)
│   ├── AnnotationLayer.tsx    # SVG overlay for text/rect/polygon annotations
│   ├── AnnotationEditor.tsx   # Floating editor for selected annotation
│   ├── DrawToolbar.tsx        # Drawing mode tool selection
│   ├── DrawPreview.tsx        # In-progress shape preview (dashed outlines)
│   ├── OverlapPopover.tsx     # Pin disambiguation when multiple pins overlap
│   ├── TypePickerModal.tsx    # Real/Concept picker after photo upload
│   ├── TagPicker.tsx          # Tag management (predefined + custom tags)
│   ├── ColorPicker.tsx        # Color picker with presets + custom
│   ├── NameModal.tsx          # First-visit name entry
│   └── AppShell.tsx           # Auth/name wrapper
├── lib/
│   ├── types.ts               # TypeScript interfaces (Photo, Board, Comment, Annotation, etc.)
│   ├── store.ts               # React Context (AppState + AppActions)
│   ├── supabaseActions.ts     # Database mutation helpers
│   ├── useSupabaseData.ts     # Data loading + realtime subscriptions
│   └── supabase/
│       ├── client.ts          # Browser Supabase client
│       └── server.ts          # Server Supabase client (for route handlers)
└── proxy.ts                   # Auth middleware (Next.js 16 proxy)
```

### Key Concepts

- **All coordinates are percentages (0-100)** of the floor plan image, not pixels. This survives zoom, resize, and image swaps.
- **Soft delete pattern**: Items have a `deleted_at` timestamp. Null = active, set = trashed. Undo via toast.
- **Realtime**: Uses Supabase Postgres Changes. Subscriptions are created once (not recreated on state changes) using refs for latest values.
- **Drag interactions**: Use `panning.excluded` CSS classes (`pin-element`, `handle-element`) to prevent react-zoom-pan-pinch from capturing pin/handle mouse events. Drawing mode uses `panning.disabled`.

---

## Database Schema

### Initial setup (run once)

```sql
create table boards (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  pin_x float not null,
  pin_y float not null,
  facing_deg float not null default 0,
  notes text default '',
  color text,
  deleted_at timestamptz,
  created_at timestamptz default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  file_url text not null,
  type text not null check (type in ('real','concept')),
  pin_x float not null,
  pin_y float not null,
  direction_deg float not null default 0,
  fov_deg float not null default 70,
  cone_length float not null default 120,
  notes text default '',
  board_id uuid references boards(id) on delete set null,
  color text,
  visible boolean not null default true,
  sort_order integer not null default 0,
  paired_photo_id uuid references photos(id) on delete set null,
  tags text[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz default now(),
  created_by_name text
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  parent_type text not null check (parent_type in ('photo','board')),
  parent_id uuid not null,
  author_name text not null,
  body text not null,
  created_at timestamptz default now()
);

create table annotations (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('text', 'rectangle', 'polygon')),
  points jsonb not null default '[]',
  label text not null default '',
  color text not null default '#3b82f6',
  fill_opacity float not null default 0.2,
  stroke_width float not null default 2,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  created_by_name text
);

create table activity_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  actor_name text not null,
  target_type text not null,
  target_id uuid not null,
  details jsonb not null default '{}',
  created_at timestamptz default now()
);

-- Enable realtime on all tables
alter publication supabase_realtime add table boards;
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table comments;
alter publication supabase_realtime add table annotations;
alter publication supabase_realtime add table activity_log;

-- RLS off for MVP (app is behind password gate)
alter table boards disable row level security;
alter table photos disable row level security;
alter table comments disable row level security;
alter table annotations disable row level security;
alter table activity_log disable row level security;
```

### Storage policies (required for photo uploads)

```sql
create policy "Allow public uploads" on storage.objects for insert with check (bucket_id = 'photos');
create policy "Allow public reads" on storage.objects for select using (bucket_id = 'photos');
create policy "Allow public updates" on storage.objects for update using (bucket_id = 'photos');
create policy "Allow public deletes" on storage.objects for delete using (bucket_id = 'photos');
```

---

## Supabase Access for Collaborators

The Supabase project is under Kiryll's account. For collaborators who need dashboard access:

1. **Read-only access (recommended):** Ask Kiryll to add you as an organization member at [supabase.com/dashboard](https://supabase.com/dashboard) → Organization Settings → Members
2. **For development, you only need the env vars** — the app connects via the anon key and service role key in `.env.local`. You don't need Supabase dashboard access for normal development.
3. **To run SQL migrations:** Either ask Kiryll to run them, or use the Supabase CLI:
   ```bash
   npx supabase login
   npx supabase link --project-ref brporfwhjowybknwioqy
   # Then run SQL via: npx supabase db execute --sql "YOUR SQL HERE"
   ```

## Vercel Access for Collaborators

The Vercel project auto-deploys from `main` branch pushes. As a GitHub collaborator:

- **Your pushes to `main` will trigger deploys** automatically
- **Preview deployments**: Push to a branch, open a PR — Vercel creates a preview URL
- **To view deploy logs or settings**, ask Kiryll to add you to the Vercel team, or just check the deploy status via GitHub PR checks

**Production URL:** https://open-house-planner-nine.vercel.app
**Password:** `openhouse2026`

---

## Development Workflow

1. Pull latest: `git pull origin main`
2. Create a branch: `git checkout -b feature/my-feature`
3. Make changes
4. Test build: `npm run build`
5. Commit and push: `git push origin feature/my-feature`
6. Open a PR on GitHub — Vercel creates a preview deploy
7. Merge to `main` — Vercel deploys to production

### Important notes for developers

- **Next.js 16** uses `proxy.ts` instead of `middleware.ts` for request interception
- **`cookies()` is async** in Next.js 16 — always `await cookies()`
- **No SSR** — the main app loads via `dynamic import` with `ssr: false`
- **All state lives in MainScreen.tsx** — there's no external state management. Components read state via `useApp()` context hook
- **Supabase realtime subscriptions** are set up once in `useSupabaseData.ts` using refs (never recreated on state changes)
- **Pin drag interactions** use `panning.excluded` CSS classes — if you add a new interactive element inside the canvas, give it the class `pin-element` or `handle-element` to prevent zoom-pan conflicts
- **Drawing mode** sets `panning.disabled: true` on the TransformWrapper to fully block panning while drawing annotations

---

## Decisions Log

| Decision | Value | Notes |
|----------|-------|-------|
| Photo pin size | 20px circle | Blue for real, purple for concept, custom color if set |
| Board pin size | 28x16px rectangle | Gray or custom color, with cone showing facing direction |
| Default FOV | 70 degrees | Adjustable via side panel slider |
| Default cone length | 120px | Adjustable via drag handle |
| Cone opacity | 70% default | Adjustable via slider in top carousel (0-100%) |
| Rotation snap | 5 degree increments | Hold Shift while dragging handles |
| Auth cookie | httpOnly, 7-day expiry | SameSite=Lax, Secure in production |
| Side panel width | 360px | Slides in on selection |
| Coordinate system | Percentages (0-100) | Not pixels — survives resize |
| Realtime | Supabase Postgres Changes | Stable subscription via refs, never recreates |
| Soft delete | deleted_at timestamp | Toast with undo for all item types |
| Drawing mode | Disables panning | Uses panning.disabled, keeps scroll-wheel zoom |

## Troubleshooting

- **Build fails on Vercel**: Check all 5 env vars are set. Most common: missing `NEXT_PUBLIC_SUPABASE_URL`
- **Photos not uploading (400 error)**: Storage policies not set. Run the storage policy SQL above.
- **"No floor plan configured"**: `NEXT_PUBLIC_FLOORPLAN_URL` not set or image not in the bucket
- **Realtime not working**: Ensure `alter publication supabase_realtime add table` was run for all tables
- **Drawing clicks pan the canvas**: Check `panning.disabled` is set during draw mode in TransformWrapper
- **Pin drag fights with canvas pan**: Ensure interactive elements have `pin-element` or `handle-element` CSS class
- **Annotations disappear on reload**: The `annotations` table hasn't been created. Run the full schema SQL.
