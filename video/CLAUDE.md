# Bastrop Open-House Video Project

Remotion-based programmatic video for the open-house-planner app. This project produces a **looping slideshow** that plays on a TV in UATX's common area so people not at the Bastrop site can see what is being planned.

## Project scope

- **One deliverable: a looping slideshow video.** Not a product demo, not a tutorial.
- **Content source:** images already uploaded by the team to Supabase Storage (the same photos pinned on the app's floor plan map). Run `npm run pull-images` to sync them locally.
- **Runtime target:** 1920×1080 @ 60 fps, landscape, H.264 MP4, looped on a TV.
- **The loop must be seamless.** The last frame must match the first frame pixel-for-pixel so the TV's repeat is invisible.

## Where the specific plan lives

`SCRIPT.md` in this folder is the source of truth for scene order, beat lengths, captions, and transitions. The video script can change often; `SCRIPT.md` gets updated first and the code follows. Do not hard-code content that should live in `src/data/slideshow.json`.

## Relationship to the parent app

This `video/` folder lives INSIDE the `open-house-planner` repo (sibling of `src/`, `public/`, etc.). Everything one level up is the Next.js app.

- **`../` (the Next.js app):** MAY be read for styles, constants, type definitions. MUST NOT be written to from this folder.
- **`../../imagesofbastrop/`** (outside the repo) contains original `.HEIC` masters. Ignore it — we pull the processed copies from Supabase (same files, already normalized to JPEG/PNG by the app's upload flow).
- **Supabase Storage `photos` bucket** is the canonical image source. Public bucket; anon key is sufficient to read.

## Remotion determinism rules — NEVER list

These are hard bugs Remotion workers ship. Violating any of them causes per-chunk flicker, blank frames, or failed renders.

- **NEVER** use `setTimeout`, `setInterval`, `requestAnimationFrame`, or `useState` to drive animation. Use `useCurrentFrame()`. The renderer cannot capture cross-frame timer state.
- **NEVER** use `Math.random()`, `Date.now()`, or `new Date()` in component bodies — every render worker gets different values. Use `random(seed)` from `remotion`.
- **NEVER** call `delayRender()` at module top level (outside a component) — it blocks composition listing in Studio and CLI.
- **NEVER** load a font with raw `<link>` tags + `setTimeout(continueRender, N)`. Use `loadFont()` from `@remotion/google-fonts/<Family>` and gate with `waitUntilDone()`.
- **NEVER** use `style={{ maskImage: 'url(...)' }}` or `WebkitMaskImage` without rendering the same `staticFile()` URL via an off-screen `<Img>` sibling — Remotion does NOT block render-wait on `mask-image` or `background-image`. The first 1-3 frames per worker can render with the mask absent.
- **NEVER** load a Google Font with no `weights` or `subsets` — it triggers a 30 s timeout fetching every variant. Always: `loadFont('normal', { weights: ['400','700'], subsets: ['latin'] })`.
- **NEVER** ship a CSS `transition:` declaration on a property whose value changes mid-render. The frames render out of order; you'll see flicker. Drive the value from `useCurrentFrame()` instead.
- **NEVER** use the legacy `<Video>` tag. Use `<OffthreadVideo>` (or the newer `<Video>` from `@remotion/media`) — the legacy tag is Chrome-throttled and silently drops frames in render.

## Project rules

- **One scene per file** in `src/scenes/`. Never put multiple compositions in one file.
- **Data/code separation.** The slideshow order, per-slide duration, captions, and transitions live in `src/data/slideshow.json`. Components read from it. A non-coder can reorder the slideshow without touching code.
- **Shared UI primitives in `src/components/`.** Slide frame, caption strip, vignette, transitions. Fix the primitive once; every slide updates.
- **All compositions registered in `Root.tsx`.** One scene = one export, one `<Composition>` entry.
- **Assets in `public/images/`** via `staticFile()`. Directory is gitignored; `scripts/pull-supabase-images.mjs` regenerates it.
- **Output to `output/`** (gitignored). Renders land here.
- **Always preview** before marking a scene done. `npm run studio` starts Remotion Studio at http://localhost:3000.

## Visual language — UATX / Noctua

Match the Paideum video's brand language so this reads as "the same organization." Hard-coded in `src/lib/constants.ts`.

- **Surfaces:** Cosmic Latte `#FDF7E3`, Cornsilk `#FDF5D9`, Lemon Chiffon `#FDF1C5`, Vanilla `#FCE99D`.
- **Text:** Jet `#302A24`, Walnut Brown `#64573C`, Drab Dark Brown `#4A4130`.
- **Accents:** Gold `#fad643`, Gold Darker `#e6c239`, Metallic Gold `#D4AF37`, Purple `#8b5cf6`.
- **Typography:** Merriweather serif + monospace accents (same as Paideum).
- **Patterns:** Rounded corners 12 px, 250 ms material-ease transitions, blur+saturate glassmorphism, subtle black-shadow layering.

## Commands

```bash
# Pull the live image set from Supabase (reads NEXT_PUBLIC_SUPABASE_URL / ANON_KEY from .env)
npm run pull-images

# Start Studio with hot reload
npm run studio

# Render a composition
npm run render -- Slideshow --output output/slideshow.mp4

# Render a still for review
npm run still -- Slideshow --frame=30 --output output/frame.png
```

## Environment

Create `video/.env` with:

```
NEXT_PUBLIC_SUPABASE_URL=<ask project owner>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<ask project owner>
```

The pull script reads these. Both values are also in `../.env.local` (the Next.js app's env file) — you can copy them over.

## Workflow loop

1. User updates `SCRIPT.md` with the intended slide order, captions, and transitions.
2. Agent translates `SCRIPT.md` into updates to `src/data/slideshow.json` and scene components.
3. Agent runs `npm run studio`, takes stills / short renders for review.
4. User reviews, iterates on `SCRIPT.md`, repeat.
5. Final: `npm run render -- Slideshow --output output/slideshow-final.mp4` and deploy to the TV.
