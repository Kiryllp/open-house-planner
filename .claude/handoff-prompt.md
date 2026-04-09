# Open House Planner — Exhaustive UX/UI Fix Pass

## Context

This is a Next.js 16 + Supabase + TypeScript collaborative web app for planning open-house fundraisers. Teams of 3-5 people assign ~20-50 photos to 10+ poster boards (1 photo per board). It was recently rewritten from a bloated 1,400-line monolith into a simplified two-mode interface, but the rewrite left many UX/UI issues — broken interactions, missing feedback, edge cases, and incomplete flows.

The app lives at `/Users/kiryll/Repos/BastropMapApp/open-house-planner/`.

## Your Job

You are doing an exhaustive UX/UI fix pass. You must:

1. **Read every single source file** in `src/components/` and `src/lib/` line by line
2. **Build a complete mental model** of every user interaction, state transition, and edge case
3. **Fix every issue you find** — no matter how small
4. **Do NOT skip issues** — if GPT found 124 problems, you need to find and fix at least that many
5. **Build and verify** after each phase of fixes

## Architecture Overview

**Two modes:**
- **Overview Mode** (default): Floor plan showing board pins only. Click a board → enter Board Focus Mode.
- **Board Focus Mode**: Side panel slides open with assigned photo preview + scrollable photo gallery. Click a photo in gallery → assigns it to the focused board (1 photo per board). Back button or Escape → return to Overview.

**Key files:**
- `src/components/MainScreen.tsx` — Main orchestrator (~600 lines). Owns all state, mode switching, pin interactions, upload flow, delete confirmation dialog, context provider.
- `src/components/BoardFocusPanel.tsx` — Side panel with board label editing, assigned photo preview (with paired comparison), photo gallery grid, upload button.
- `src/components/PhotoGalleryItem.tsx` — Gallery thumbnail with type badge, hover actions (delete, toggle type), assigned-board overlay.
- `src/components/TopBar.tsx` — Minimal toolbar: title/board name, user name, upload button, add board button, back button.
- `src/components/BoardPin.tsx` — Board pin on floor plan with optional photo thumbnail, cone visualization, label, assignment indicator.
- `src/components/PhotoPin.tsx` — Photo pin with FOV cone (only visible in board focus mode for pinned photos).
- `src/components/AppShell.tsx` — Auth wrapper, name entry.
- `src/components/NameModal.tsx` — First-visit name prompt.
- `src/lib/types.ts` — Photo, Board, AppMode types.
- `src/lib/store.ts` — AppState (8 fields), AppActions (15 methods), React Context.
- `src/lib/supabaseActions.ts` — DB mutation helpers (upload, insert, update, delete).
- `src/lib/useSupabaseData.ts` — Initial data load + realtime subscriptions for photos and boards.
- `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts` — Supabase client setup.
- `src/proxy.ts` — Auth middleware (cookie-based password gate).
- `src/app/api/login/route.ts` — Login API.
- `src/app/login/page.tsx` — Login page.
- `src/app/page.tsx` — Main page (dynamic import of AppShell).
- `src/app/layout.tsx` — Root layout with Toaster.
- `supabase/migrations/001_initial_schema.sql`, `002_simplify_schema.sql` — DB schema.

## Known Issues To Fix (Comprehensive List)

### CRITICAL — Core Interaction Bugs

1. **Board pin click targets are too small** — The clickable area is just the 28x16px rectangle (or 36x36 thumbnail). Users miss clicks constantly. The click target should include the label area and have a larger invisible hit area.

2. **Clicking a board pin drags instead of clicking** — The mousedown handler for dragging fires before the click handler can register. If user clicks slightly imprecisely (moves 1-2px during click), it doesn't register as a click because the drag threshold is 3px but the click is consumed by the drag system. The `handlePinMouseDown` runs on every mousedown and only fires click on mouseup IF no drag happened. This means there's always a slight delay. Consider: clicks should feel instant, dragging should only start after a hold+move threshold.

3. **No visual hover state on board pins in overview mode** — Users can't tell which pin they're about to click. The `group-hover:scale-110` is on the inner element but the rotation transform makes it hard to see. Need a clear hover indicator (glow, border change, cursor change).

4. **Dimmed boards in board-focus mode should show cursor:pointer** — They're clickable (switches focus) but look disabled due to 0.35 opacity. Need pointer cursor and better hover feedback to show they're interactive.

5. **Canvas click in board-focus mode behavior is unclear** — Currently just deselects. Users might expect it to exit focus mode. Consider: clicking empty canvas should NOT exit focus (that's what Back/Escape is for), but there should be clear affordance for how to exit.

### HIGH — Missing Feedback & States

6. **No loading state for photo assignment** — Click a photo in gallery → it assigns instantly in UI but DB call is async. If it fails, user sees the photo assigned but it reverts on next realtime sync. Need optimistic update with error rollback or at minimum a brief loading indicator.

7. **No visual transition when entering/exiting board focus** — The panel appears/disappears instantly. Add a CSS transition (slide from right, ~200ms).

8. **Toast messages are inconsistent** — Some actions show toasts (assign, delete), others don't (unassign, label edit, type toggle, drag move). Standardize: all user actions should have feedback. Successful drags don't need toasts, but assignment/unassignment/deletion should always confirm.

9. **Upload progress indicator position** — It's at bottom-left of the canvas, but in board-focus mode the side panel covers part of the view. The progress should appear in the side panel when in board-focus mode, or at least be visible.

10. **Board label in TopBar doesn't update live** — When user edits the label in the side panel, the TopBar title should update character-by-character. Currently it updates on blur (when the local state syncs). The TopBar reads from `focusedBoard?.label` which comes from the boards array, which is only updated on blur via `updateBoard`. This means typing in the label input doesn't update the TopBar until you click away.

11. **No indication of which boards need photos** — In overview mode, boards without photos show a small `?` badge, but it's tiny and easy to miss. Consider: unassigned boards should have a distinctly different visual (e.g., dashed border, pulsing indicator, different color scheme) so the user can immediately see progress at a glance.

### HIGH — Edge Cases & Error Handling

12. **What happens when board_id references a deleted board?** — Old photos from before the simplification may have board_id pointing to soft-deleted boards. The gallery filter should handle `!p.deleted_at` on the board lookup too, not just the photo.

13. **Duplicate photo assignment** — The assignPhotoToBoard function unassigns the previous photo, but if two users assign simultaneously, both could succeed. The DB has no unique constraint on (board_id) for non-deleted photos. Need to handle this gracefully — at minimum, the UI should show only one photo per board even if the DB has duplicates.

14. **Photo.pin_x / pin_y nullability mismatch** — The TypeScript type says `number | null` but the database migration 002 may not have been applied. The `insertPhoto` call uses `null as any` type hack. Clean this up: either make the type match (with proper Omit<> in insertPhoto) or add a runtime check.

15. **Realtime subscription has no reconnection logic** — If the Supabase WebSocket disconnects (network issues, laptop sleep), it never reconnects. Users see stale data until page reload. The Supabase client handles some reconnection, but verify this works and add a "connection lost" indicator if needed.

16. **useEffect dependency for board deletion auto-exit** — MainScreen has a useEffect that checks if the focused board still exists and calls exitBoardFocus. This fires on every `boards` array change, not just deletions. It should be more targeted to avoid unnecessary work.

### MEDIUM — UI/UX Polish

17. **Gallery photo size is inconsistent** — Photos are displayed in a 2-column grid with `aspect-[4/3]` and `object-cover`. Different aspect ratio photos are cropped, which is fine, but the crop position is always centered. Consider: face-detection or smart cropping would be ideal, but at minimum the thumbnails should look clean.

18. **Side panel is not responsive** — Hardcoded `w-[360px]`. On screens narrower than ~800px, the map is squeezed to unusability. On mobile, the panel should be full-width (overlay the map) or use a bottom sheet pattern. At minimum, add `max-w-full` so it doesn't overflow.

19. **Gallery scroll position resets when photos change** — When a photo is assigned/unassigned, the gallery re-renders and scroll position may jump. Use a key-stable list and avoid unnecessary re-mounts.

20. **Board pin thumbnail doesn't have fallback for broken images** — If the photo URL is 404/broken, the thumbnail shows a broken image. Add an `onError` handler that falls back to the colored rectangle.

21. **Photo gallery items should show more info on hover** — Currently shows delete + type toggle buttons on hover. Also show: filename, upload date, uploaded by, and dimensions if available. This helps users identify photos in a large set.

22. **No way to see a photo at full size** — Gallery thumbnails and the assigned preview are small. Users need to compare fine details. Add a click-to-zoom or lightbox for the assigned photo preview.

23. **The "Upload more photos" button at the bottom of the gallery** is easily missed when scrolling. Consider a sticky footer in the gallery section, or a floating action button.

24. **Board rotate handle in board-focus mode** — The handle for rotating the board's facing direction is only shown when a board is `selected` (via `selectedBoard`). But in board-focus mode, the focused board is not "selected" in the `selectedId/selectedKind` sense — it's "focused" via `mode.boardId`. So the rotate handle never appears in board-focus mode. Either: (a) show the rotate handle for the focused board, or (b) add a rotation control to the side panel.

25. **Cone visualization in overview mode** — All board cones are visible in overview mode (because `focused=true` for all when no board is focused). This is visually cluttered. Consider: hide cones in overview mode entirely, or make them very faint. Cones are most useful in board-focus mode to show where the board faces.

26. **The delete confirmation dialog** should be closable by pressing Escape (it is, via the keyboard handler in MainScreen) and by clicking outside (it is, via the backdrop onClick). Verify both work.

27. **Board label input in side panel** — The input doesn't have an obvious "editable" affordance. It looks like static text until you hover/focus. Add a subtle pencil icon or underline to indicate editability.

### LOW — Code Quality & Consistency

28. **`null as any` type hack** in doUploadPhotos for pin_x/pin_y. Fix by updating the insertPhoto function signature to accept nullable coordinates.

29. **AppContext value is wrapped in useMemo** but the dependency array lists every single state variable and action. If any state changes, the context value changes, triggering re-renders on all consumers. Consider splitting into separate contexts (state vs actions) or using a state management library.

30. **No React.memo on pin components** — BoardPin and PhotoPin re-render whenever MainScreen re-renders. Wrap them in React.memo to skip unnecessary re-renders when their props haven't changed.

31. **Upload progress uses UUID keys** (good) but the upload progress UI could be improved — show file size, a real progress bar (Supabase storage upload supports progress callbacks), and allow cancellation.

32. **Console warnings** — Check for React key warnings, missing dependency warnings in useEffect, and any runtime errors in the browser console during normal usage.

## How To Work

1. **Read ALL source files first.** Build the complete picture before changing anything.
2. **Group fixes by file** to minimize context switching.
3. **Fix in priority order**: Critical → High → Medium → Low.
4. **After each group of fixes, run `npm run build`** from the `open-house-planner` directory to catch type errors.
5. **Do NOT add new features** beyond what's listed. Focus on making existing features work correctly.
6. **Do NOT add comments or docstrings** to code you didn't change.
7. **Do NOT refactor code structure** unless it's needed to fix a bug.
8. **Keep changes minimal and targeted.** Don't rewrite entire files unless necessary.
9. **Test the build compiles after every phase.** TypeScript errors are the fastest feedback.
10. **When done, commit with a descriptive message and push.**

## Success Criteria

- Every board pin click reliably enters board focus mode (no missed clicks)
- Clicking a different board while in focus mode switches to that board
- Photo assignment/unassignment has clear visual feedback
- Delete actions have confirmation dialogs
- Error states are handled gracefully (network errors, missing data, broken images)
- The UI feels responsive and intentional — no jarring state changes, no silent failures
- `npm run build` passes with zero errors
- No console errors during normal usage
