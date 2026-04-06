# Open House Planner

A password-gated collaborative web app for planning an open-house fundraiser. Teams upload photos (real + concept renders), place them on a floor plan as directional pins with field-of-view cones, position poster boards, assign photos to boards, and export everything as PDFs. Built for 3-5 concurrent users, used for one event then retired.

## Database Setup

Paste this SQL into your Supabase project's SQL Editor (Dashboard > SQL Editor > New Query):

```sql
create table boards (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  pin_x float not null,
  pin_y float not null,
  facing_deg float not null default 0,
  notes text default '',
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

-- Enable realtime
alter publication supabase_realtime add table boards;
alter publication supabase_realtime add table photos;
alter publication supabase_realtime add table comments;

-- RLS off for MVP (app is behind password gate)
alter table boards disable row level security;
alter table photos disable row level security;
alter table comments disable row level security;
```

**Important:** All `pin_x` and `pin_y` values are stored as percentages (0-100) of the floor plan image dimensions, not pixels. This ensures coordinates survive any display scaling or image swaps.

## Storage Setup

Before using the app, create a public storage bucket in Supabase:

1. Go to Storage in your Supabase dashboard
2. Create a new bucket named `photos` with **Public bucket: ON**
3. Upload your floor plan image and rename it to `floorplan.png`
4. Copy the public URL of `floorplan.png`

## Environment Variables

Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
APP_PASSWORD=openhouse2026
NEXT_PUBLIC_FLOORPLAN_URL=https://xxxxx.supabase.co/storage/v1/object/public/photos/floorplan.png
```

## Local Development

```bash
npm install
npm run dev
```

Open http://localhost:3000. You'll hit the password gate - enter the `APP_PASSWORD` value.

## Deploy to Vercel

1. Push this repo to GitHub
2. Go to [vercel.com/new](https://vercel.com/new)
3. Click **Import Git Repository** and select this repo
4. Framework Preset will auto-detect **Next.js** - leave defaults
5. Expand **Environment Variables** and add all five variables from `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_PASSWORD`
   - `NEXT_PUBLIC_FLOORPLAN_URL`
6. Click **Deploy** and wait ~90 seconds
7. Open the provided URL, enter the password, and you're in

Share the Vercel URL + password with your team.

## Decisions Log

| Decision | Default Value | Notes |
|----------|--------------|-------|
| Photo pin size | 18px circle | Blue (#3b82f6) for real, purple (#a855f7) for concept |
| Board pin size | 24x14px rectangle | Dark gray (#4b5563) with facing triangle |
| Default FOV angle | 70 degrees | Adjustable via edge cone handle |
| Default cone length | 120px | Adjustable via tip cone handle |
| Default direction | 0 degrees (north) | Adjustable via tip cone handle |
| Cone fill opacity | 15% of pin color | Stroke at 50% opacity |
| Rotation snap (Shift) | 5 degree increments | Hold Shift while dragging handles |
| Drag debounce | 150ms | Prevents excessive DB writes during drag |
| Position persist | On mouse-up | With debounced interim saves |
| Auth cookie | httpOnly, 7-day expiry | SameSite=Lax, Secure in production |
| Side panel width | 360px | Slides in from right on selection |
| Overlap detection | 30px radius | Shows popover to disambiguate |
| Multi-file drop offset | 2% per file | Prevents stacking |
| Soft delete | Sets deleted_at timestamp | Toast with Undo action |
| Realtime strategy | Supabase Postgres Changes | Last write wins, no conflict resolution |
| Jitter guard | Skip realtime events for dragged items | Prevents local drag jitter |
| PDF export method | html-to-image -> embed PNG in pdf-lib | Pragmatic shortcut for cone rendering |
| Board packets layout | 150x120px thumbnails, 170px grid spacing | Landscape pages (792x612) |
| Coordinate system | Percentages (0-100) of floor plan | Not pixels - survives resize/swap |

## Known Limitations

- **Desktop only** - No mobile-optimized layout
- **No image compression** - Photos uploaded at full resolution
- **No user accounts** - Single shared password, names stored in localStorage
- **Last write wins** - No conflict resolution for concurrent edits
- **No version history** - Only soft delete, no undo beyond that
- **Presence cursors** - Not implemented (cut for time)
- **PDF cone rendering** - Uses rasterized PNG capture, not vector

## Troubleshooting

- **Build fails on Vercel**: Check that all 5 environment variables are set. The most common issue is a missing or malformed `NEXT_PUBLIC_SUPABASE_URL`.
- **"No floor plan configured"**: Set `NEXT_PUBLIC_FLOORPLAN_URL` to the public URL of your floor plan image in Supabase Storage.
- **Photos not uploading**: Verify the `photos` storage bucket exists in Supabase and is set to **Public**.
- **Realtime not working**: Ensure the `alter publication supabase_realtime add table ...` SQL statements were run.
- **Login doesn't work**: Check `APP_PASSWORD` is set in both `.env.local` and Vercel environment variables.

## Tech Stack

- Next.js 16 (App Router, TypeScript, Tailwind CSS)
- Supabase (Postgres + Storage + Realtime)
- react-zoom-pan-pinch (canvas zoom/pan)
- pdf-lib + html-to-image (PDF export)
- lucide-react (icons)
- sonner (toasts)
