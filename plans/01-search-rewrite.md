# Plan 1: Tolerant / Fuzzy Search Rewrite

## Goal

Replace the current naive substring search across the four search sites with
a single, tolerant, fuzzy search that:

- Tolerates typos (`kichen` → Kitchen)
- Tolerates whitespace and separators (`kitchen island` ↔ `kitchen_island`)
- Tolerates diacritics (`cafe` → Café)
- Handles token re-ordering (`red barn` ↔ `barn red`)
- Searches across multiple fields (`name`, `notes`, zone label, tags, author)
- Behaves the same way everywhere — one shared implementation

## Current state (verified from code)

| # | File | Lines | Scope | Fields | How |
|---|------|------|-------|--------|-----|
| 1 | `src/components/LeftPane.tsx` | 34-49 | unused concepts | `name`, `notes`, `file_url` | `.toLowerCase().includes()` |
| 2 | `src/components/RealPhotosView.tsx` | 114-137 | per-row picker (unlinked concepts) | `name` only | `.toLowerCase().includes()` + stem sort |
| 3 | `src/components/LinkingView.tsx` | 23-31 | unlinked concepts | `name` only | `.toLowerCase().includes()` |
| 4 | `src/components/LinkingView.tsx` | 33-41 | real photos | `name` only | `.toLowerCase().includes()` |

Observations:

- `file_url` in LeftPane is useless — Supabase URLs are UUID hashes.
- `notes` is searched in only one site.
- Nothing uses Supabase `.ilike` or full-text search; all filtering is in-memory on the
  `photos[]` state populated by `useSupabaseData`.
- Data volume is bounded (this is a single-event planner, hundreds of images, not
  thousands). Client-side fuzzy over in-memory state is appropriate.
- No fuzzy library is currently installed (`package.json` has no Fuse/fuzzysort/etc).

## Library choice

**Fuse.js** (`fuse.js`, ~12kB gzipped, MIT, battle-tested).

Why Fuse over alternatives:

- Multi-field weighted keys out of the box.
- Levenshtein-based scoring (typo tolerance).
- `useExtendedSearch: true` for power-user syntax (`'exact`, `!not`, `^prefix`).
- `includeMatches: true` gives us match indices for highlighting.
- No native dependencies, runs in Edge/workers/Node.
- Maintained, stable API.

Alternatives considered and rejected:

- **fuzzysort**: faster but single-field, weaker multi-field weighting.
- **minisearch**: inverted index, great for very large corpora — overkill here.
- **match-sorter**: only sorts by match rank, no Levenshtein.
- **Supabase full-text / `pg_trgm`**: requires migrations, adds network
  round-trips per keystroke, breaks offline, and is weaker at typo tolerance
  than Levenshtein without a tsvector pipeline. Stick with client-side.

## Architecture

### New files

1. **`src/lib/searchPhotos.ts`** — pure function

   ```ts
   export interface SearchOptions {
     query: string
     // Optional pre-filter applied before the fuzzy pass (zone, type, etc.)
     zone?: ZoneId | null
     type?: 'concept' | 'real' | 'both'
     // When true, the matcher is stricter. Default false = permissive.
     strict?: boolean
   }

   export interface SearchResult {
     photo: Photo
     score: number            // 0 (perfect) — 1 (barely)
     matches: MatchRange[]    // For highlighting in the UI
   }

   export function searchPhotos(
     photos: Photo[],
     options: SearchOptions,
   ): SearchResult[]
   ```

   Implementation:
   - Normalize query and fields with `.normalize('NFD').replace(/[\u0300-\u036f]/g, '')`
     to strip diacritics.
   - Replace `_`, `-`, `.` with spaces in both query and indexed strings so
     separator differences vanish.
   - Build a Fuse instance with keys and weights:
     - `name` — weight 3
     - `notes` — weight 2
     - `zoneLabel` (derived, e.g. `"Zone 3 Primary"`) — weight 1
     - `tags` (joined string) — weight 1
     - `created_by_name` — weight 0.5
   - Config: `threshold: strict ? 0.25 : 0.4`, `ignoreLocation: true`,
     `minMatchCharLength: 2`, `includeMatches: true`, `useExtendedSearch: true`.
   - If `options.query` is empty, return all photos (score 0) untouched.
   - If `options.query` is a special prefix like `z:3` or `zone:3`, treat that
     as a zone pre-filter even if the user didn't pick a chip.

2. **`src/lib/usePhotoSearch.ts`** — React hook

   ```ts
   export function usePhotoSearch(
     source: Photo[],
     opts: {
       query: string
       zone?: ZoneId | null
       type?: 'concept' | 'real' | 'both'
       debounceMs?: number       // default 150
     }
   ): {
     results: SearchResult[]
     isEmpty: boolean           // query was non-empty but yielded nothing
     hasQuery: boolean          // query is non-empty after trim
   }
   ```

   Internals:
   - Debounces the query with `useDeferredValue` (React 19 primitive, already on
     the stack) so we don't call Fuse on every keystroke.
   - Rebuilds the Fuse index via `useMemo` keyed on
     `source.length + source.map(p => p.id + p.name + p.notes).join('')`
     so we don't pay index cost on non-search-relevant updates (pin drags,
     color changes, etc.). A stable content signature avoids unnecessary
     rebuilds when someone drags a pin on the map.
   - Returns both the filtered list and the match metadata so the UI can
     highlight matched substrings.

3. **`src/components/HighlightedText.tsx`** — tiny reusable highlight

   ```tsx
   interface Props { text: string; matches?: [number, number][] }
   export function HighlightedText({ text, matches }: Props) { ... }
   ```

   Wraps matched ranges in `<mark className="rounded bg-yellow-100 ...">`
   without breaking whitespace or mutating the underlying text.

### Edited files

4. **`src/components/LeftPane.tsx`** (core search site)
   - Remove the hand-rolled filter at 34-49.
   - Call `usePhotoSearch(unusedConcepts, { query })`.
   - Pass `results` + `matches` into `ZoneSection` / `UnusedPhotoCard` so the
     name on the card can render with `<HighlightedText>`.
   - Keep the `primaryOnly` toggle — apply it before calling the hook, or after
     filtering, doesn't matter.
   - Add a small `×` clear button inside the input when `query.length > 0`.
   - Replace the empty state with a smarter message when `hasQuery && isEmpty`:
     > No matches for "foo". Try fewer letters, remove the Primary filter, or
     > enable *Search all concepts* to look on the map too.
   - (Optional, sub-task) Add a new `"Search all concepts"` toggle that swaps
     the source from `unusedConcepts` to `activePhotos.filter(p => p.type === 'concept')`.
     Clicking a result that is already placed scrolls the map pin into view and
     selects it. (See "MapCanvas pin focus" below — requires a small ref change.)

5. **`src/components/RealPhotosView.tsx`** (concept picker inside each real row)
   - Replace lines 114-137's search with `usePhotoSearch(unlinkedConcepts, { query: pickerSearch })`.
   - Preserve the existing "prefer concepts whose stem matches the real photo's
     stem" sort. The cleanest way: after getting results back, apply the same
     `realStem` comparator as a tiebreaker among equal-score items.
   - Use `HighlightedText` on each card's name overlay.
   - Replace the "No matches. Try a different search." empty state with the
     new helpful copy.

6. **`src/components/LinkingView.tsx`** (both panes)
   - Lines 23-31 and 33-41: replace with `usePhotoSearch(...)`.
   - Add zone to the searchable fields so the user can type `zone 3` or `z3`
     to narrow.
   - Wrap name labels in `HighlightedText`.

7. **`src/components/MapCanvas.tsx`** (only needed for the Search-all toggle)
   - Add `useImperativeHandle` exposing a single method:
     `scrollPinIntoView(id: string): void`.
   - Implementation: find the matching pin element by `data-pin-id`, compute
     its position, and animate the `TransformWrapper` via
     `setTransform(x, y, scale, 300, 'easeOut')`.
   - This unlocks: type something in LeftPane → click a placed-pin result →
     map pans to the pin and highlights it.

8. **`package.json`**
   - Add `"fuse.js": "^7.1.0"` to `dependencies`.

### Not changed

- No database migration.
- No Supabase query changes. `useSupabaseData` still loads and subscribes
  exactly as today.
- The `photos[]` in-memory state remains the single source of truth.

## Field weight rationale

| Field | Weight | Reason |
|-------|-------:|--------|
| `name` | 3 | Strongest user-facing identifier; what they type first |
| `notes` | 2 | Often contains keywords like "fireplace", "window", "wood floor" |
| `zoneLabel` | 1 | Allows "zone 3" / "primary" / "z3" queries |
| `tags` | 1 | Currently unused in UI but column exists and may light up |
| `created_by_name` | 0.5 | Allows "things Bob uploaded" searches without being noisy |

Tuning advice: if Zone matches end up too dominant, drop `zoneLabel` to 0.7.

## Extended query syntax (power users, free from Fuse)

- `kitchen` → fuzzy match in any field
- `'kitchen` → exact substring in any field (no fuzzy)
- `!draft` → exclude matches containing "draft"
- `^z3` → starts-with match
- `kitchen | fireplace` → either
- `kitchen fireplace` → both (default)
- `zone:3 kitchen` → we parse the `zone:` prefix as a pre-filter, pass the
  rest to Fuse

Don't document this in the primary UI — it's additive, and the main UX is
just "type and it works". Add a tiny `?` hover tooltip next to the input
that lists the syntax for people who want it.

## Testing checklist (manual, in the running dev server)

Typed inputs — all in the LeftPane, the modal pickers, and LinkingView panes:

- [ ] `kichen` → matches "Kitchen" (typo, Levenshtein distance 1)
- [ ] `Cafe` → matches "Café" (diacritic)
- [ ] `red barn` ↔ `barn red` (token reorder)
- [ ] `kitchen island` finds `kitchen_island.jpg` (separator)
- [ ] Empty query → full list visible
- [ ] `zone 3` → only Zone 3 photos
- [ ] `primary` → only zone_rank === 1
- [ ] `z3 primary` → both filters
- [ ] `!trash` → excludes photos with "trash" in name or notes
- [ ] Clear button (`×`) empties the input
- [ ] Debounce doesn't lag typing
- [ ] Match highlighting appears on the name line
- [ ] Empty-state message is actionable
- [ ] (If implemented) "Search all" toggle finds placed pins and scrolls the
  map to them on click
- [ ] No regressions in the `primaryOnly` toggle or the existing zone grouping

## Risks and mitigations

- **Too-loose threshold makes search feel imprecise.** Start at `0.4`, expose
  an internal constant so it can be tuned without a rewrite.
- **Fuse re-indexing stalls on every pin drag.** The memo key excludes
  position fields; verified in the hook spec above.
- **Users type `zone3` without a space and expect it to work.** Add explicit
  prefix parsing for `z:`, `z`, `zone:`, `zone` in the query parser before
  passing to Fuse.
- **Match highlighting breaks when `name` is `null`.** `HighlightedText`
  accepts `undefined` and renders the placeholder "Untitled".
- **Search-all concepts toggle breaks performance on very large collections.**
  Still bounded by the in-memory array that already renders in the existing
  tabs; if it does become slow we can memoize the Fuse index on `activePhotos`
  independently.

## Out of scope (explicitly)

- Saved search / pinned filters.
- Server-side search indexes.
- Indexing `photo_history` events (plan #2 covers history storage only).
- Faceted filters (type, creator, date range). Can be added later if the
  Fuse result quality is sufficient to justify more UI surface.
