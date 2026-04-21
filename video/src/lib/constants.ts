/**
 * Shared constants for the Bastrop open-house slideshow.
 * Brand language mirrors Paideum's Noctua system for cohesion
 * across UATX-produced content.
 */

export const VIDEO = {
  WIDTH: 1920,
  HEIGHT: 1080,
  FPS: 60,
} as const;

/** UATX / Noctua design palette. Hex values are copied from the Paideum
 *  video project so both productions feel like the same visual system. */
export const UATX_COLORS = {
  // Surfaces
  cosmicLatte: "#FDF7E3",
  cornsilk: "#FDF5D9",
  lemonChiffon: "#FDF1C5",
  vanilla: "#FCE99D",

  // Text
  jet: "#302A24",
  walnutBrown: "#64573C",
  drabDarkBrown: "#4A4130",

  // Accents
  gold: "#fad643",
  goldDarker: "#e6c239",
  metallicGold: "#D4AF37",
  purple: "#8b5cf6",

  // Sidebar / panels (carried from app parity)
  sidebarBg: "#f5eed8",
  sidebarActive: "#e8dbb2",
  sidebarGold: "#d4a824",
  sidebarText: "#3a3226",

  // Deep surfaces for dark backgrounds
  navy: "#0A1328",
} as const;

/** Semantic tokens — prefer these in scenes over raw palette values so a
 *  global look-and-feel change is one edit. */
export const TOKENS = {
  bgPrimary: UATX_COLORS.cosmicLatte,
  bgSecondary: UATX_COLORS.cornsilk,
  bgDeep: UATX_COLORS.navy,

  textPrimary: UATX_COLORS.jet,
  textSecondary: UATX_COLORS.walnutBrown,
  textTertiary: UATX_COLORS.drabDarkBrown,

  accentPrimary: UATX_COLORS.gold,
  accentPrimaryDarker: UATX_COLORS.goldDarker,
  accentHighlight: UATX_COLORS.metallicGold,

  borderSoft: "rgba(194,162,96,0.14)",
  borderStrong: "rgba(194,162,96,0.45)",

  shadowMd: "0 8px 24px rgba(10,19,40,0.35)",
  shadowLg: "0 20px 60px rgba(10,19,40,0.45)",
} as const;

export const FONTS = {
  serif: "'Merriweather', Georgia, serif",
  mono: "'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace",
} as const;

/** Zone IDs from the open-house-planner app (6 zones). Scene copy can
 *  reference these by ID so slide captions stay in lockstep with what
 *  the venue planner team assigned. */
export const ZONE_IDS = [1, 2, 3, 4, 5, 6] as const;
export type ZoneId = (typeof ZONE_IDS)[number];

/** Zone display labels. Update if the venue planner team changes them. */
export const ZONE_LABELS: Record<ZoneId, string> = {
  1: "Zone 1",
  2: "Zone 2",
  3: "Zone 3",
  4: "Zone 4",
  5: "Zone 5",
  6: "Zone 6",
};
