#!/usr/bin/env node
/**
 * pull-supabase-images.mjs
 *
 * Syncs the live `photos` table + `photos` bucket from the
 * open-house-planner Supabase project into `public/images/`, organized
 * by type (real | concept) and zone. Also writes
 * `src/data/image-manifest.json` so scenes can reference images with
 * their metadata (zone, rank, caption, linked real photo) without
 * touching Supabase at render time.
 *
 * Usage:
 *   cd video
 *   npm run pull-images
 *
 * Env (from video/.env):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * The `photos` bucket is public; the anon key is sufficient. If the app
 * owner rotates keys, copy them from ../.env.local (the Next.js app).
 */

import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// ── Tiny .env loader (no extra deps). Reads `video/.env` if present.
async function loadDotEnv(envPath) {
  if (!existsSync(envPath)) return;
  const fs = await import("node:fs/promises");
  const raw = await fs.readFile(envPath, "utf8");
  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    // strip surrounding single/double quotes if present
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    process.env[key] = value;
  }
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const videoRoot = path.resolve(scriptDir, "..");
await loadDotEnv(path.join(videoRoot, ".env"));

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.\n" +
      "Copy them from open-house-planner/.env.local into video/.env.",
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Pull every photos row that is not soft-deleted.
console.log("→ Fetching photos metadata from Supabase...");
const { data: rows, error } = await supabase
  .from("photos")
  .select(
    "id, file_url, type, zone, zone_rank, pin_x, pin_y, direction_deg, fov_deg, notes, created_by_name, linked_real_id, source_upload_id, created_at",
  )
  .is("deleted_at", null)
  .order("created_at", { ascending: true });

if (error) {
  console.error("Supabase query failed:", error);
  process.exit(1);
}

console.log(`  got ${rows.length} active photo rows`);

// Prepare output directories.
const imagesDir = path.join(videoRoot, "public", "images");
await mkdir(path.join(imagesDir, "real"), { recursive: true });
await mkdir(path.join(imagesDir, "concept"), { recursive: true });

// Download each image. Keep the Supabase-generated filename as-is so
// any metadata encoded in it (e.g. zone digits) survives. Skip files
// already present to keep reruns fast.
const manifest = [];
let downloaded = 0;
let skipped = 0;
let failed = 0;

for (const row of rows) {
  // Extract filename from the URL. Supabase storage URLs look like:
  //   https://<project>.supabase.co/storage/v1/object/public/photos/<uuid>-<filename>
  const urlParts = row.file_url.split("/");
  const rawName = decodeURIComponent(urlParts[urlParts.length - 1]);
  // Prefix with a short ID chunk to avoid filename collisions across rows
  // that share source_upload_id (the app de-dupes by upload, not filename).
  const safeName = `${row.id.slice(0, 8)}__${rawName}`;
  const subdir = row.type === "real" ? "real" : "concept";
  const relativePath = `images/${subdir}/${safeName}`;
  const absolutePath = path.join(imagesDir, subdir, safeName);

  if (!existsSync(absolutePath)) {
    try {
      const response = await fetch(row.file_url);
      if (!response.ok) {
        console.warn(
          `  ! skipped ${safeName} (HTTP ${response.status})`,
        );
        failed += 1;
        continue;
      }
      const buf = Buffer.from(await response.arrayBuffer());
      await writeFile(absolutePath, buf);
      downloaded += 1;
    } catch (err) {
      console.warn(`  ! failed ${safeName}: ${err.message}`);
      failed += 1;
      continue;
    }
  } else {
    skipped += 1;
  }

  manifest.push({
    id: row.id,
    imagePath: relativePath,
    type: row.type,
    zone: row.zone,
    zoneRank: row.zone_rank,
    pinX: row.pin_x,
    pinY: row.pin_y,
    directionDeg: row.direction_deg,
    fovDeg: row.fov_deg,
    notes: row.notes,
    createdByName: row.created_by_name,
    linkedRealId: row.linked_real_id,
    sourceUploadId: row.source_upload_id,
    createdAt: row.created_at,
  });
}

// Write the manifest so scenes can reference images with full metadata.
const manifestPath = path.join(
  videoRoot,
  "src",
  "data",
  "image-manifest.json",
);
await writeFile(
  manifestPath,
  JSON.stringify(
    {
      _readme:
        "Generated by scripts/pull-supabase-images.mjs. Do not edit by hand — rerun the script to refresh. Each entry mirrors one row from the Supabase `photos` table with the local file path added.",
      generatedAt: new Date().toISOString(),
      sourceRowCount: rows.length,
      entries: manifest,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `✓ downloaded ${downloaded}, reused ${skipped}, failed ${failed}`,
);
console.log(`✓ manifest written to ${path.relative(videoRoot, manifestPath)}`);
