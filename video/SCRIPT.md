# Bastrop Open-House Slideshow — Script

> **Status:** template. User will replace this with the specific plan.
>
> Anything inside `<!-- -->` comments is author-only guidance and should be removed when the real plan lands.

## Intent

A looping slideshow shown on a TV in the UATX common area. Purpose: keep the community aware of the work being planned at the Bastrop open-house site even when they are not physically there.

## Audience / context

General mixed audience, no CTA. Passive viewing — people glance at the TV, not stare at it. Content must read at a glance; each slide must work as a standalone image if someone looks up for two seconds.

## Loop requirements

- **First frame = last frame** so the TV loop is invisible.
- Target total runtime: <!-- fill in once plan is firm -->
- Transitions must be consistent. If a fade is used, use it everywhere.

## Slide order

<!--
Fill in one row per slide. Columns:
  # — position in loop
  image — filename in public/images/ OR caption of the source image
  duration — seconds on screen
  transition — how this slide enters (e.g. "fade", "cut", "kenburns")
  caption — optional on-screen text overlay (short)
  notes — any per-slide direction
-->

| # | image | duration | transition | caption | notes |
|---|-------|----------|------------|---------|-------|
|   |       |          |            |         |       |

## Visual treatment

<!--
Pick one and stick with it:
- Ken-Burns pan+zoom on each slide (cinematic)
- Static images with cross-fade transitions (clean, readable)
- Split-compare real vs concept (uses the app's ComparisonSlider idea)
- Zone-by-zone walk (slides grouped by 1-6 zones with a zone heading every N slides)
-->

## Typography

- Merriweather serif for any caption or heading text.
- Tight hierarchy: zone label (small, uppercase) + main line (serif, 48-72 px).
- Gold accent underline on the main line if emphasis needed.

## Audio

<!--
Leave silent for now (TV in common area is often muted).
If sound is ever wanted, add an ambient track via <Audio /> at very low volume.
-->

## Open questions for the user

<!-- Delete as answered -->
- [ ] Total runtime target?
- [ ] Which images (or which subset of Supabase photos)? By zone, by type (real/concept), curated list?
- [ ] Captions: per-slide, or no text at all?
- [ ] Any zone hero moments (pause longer on a specific image)?
- [ ] Any logo / UATX tag at start or end of the loop?
