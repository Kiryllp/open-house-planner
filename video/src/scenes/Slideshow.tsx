import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { FONTS, TOKENS, VIDEO } from "../lib/constants";
import slideshowData from "../data/slideshow.json";

/**
 * Slideshow — scaffolded placeholder.
 *
 * Current behavior:
 *   - If slideshow.json has zero slides, shows a holding card so Studio
 *     boots cleanly. This is intentional for first-run.
 *   - If slides are present, renders each as a full-frame image with
 *     a simple crossfade between them. Captions are NOT yet rendered —
 *     the production plan (per SCRIPT.md) will swap this component for
 *     the specified treatment (Ken-Burns, split-compare, zone headers,
 *     etc.) once the script lands.
 *
 * All beat math reads from src/data/slideshow.json so a non-coder can
 * change slide order, per-slide time, and captions without touching
 * this file.
 */

type SlideshowData = typeof slideshowData & {
  slides: Array<{
    imagePath: string;
    type?: "real" | "concept";
    zone?: number;
    zoneRank?: number;
    caption?: string;
    durationSeconds?: number;
    transition?: "cut" | "crossfade" | "kenburns";
    linkedRealImagePath?: string;
  }>;
};

const data = slideshowData as SlideshowData;
const DEFAULT_DURATION = (data as { defaultDurationSeconds?: number })
  .defaultDurationSeconds ?? 4;
const CROSSFADE_FRAMES = 18;

export const Slideshow: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (data.slides.length === 0) {
    return <HoldingCard frame={frame} />;
  }

  // Compute each slide's [startFrame, endFrame] window.
  const windows = data.slides.reduce<
    Array<{ start: number; end: number }>
  >((acc, slide) => {
    const duration = Math.round(
      (slide.durationSeconds ?? DEFAULT_DURATION) * fps,
    );
    const start = acc.length === 0 ? 0 : acc[acc.length - 1].end;
    acc.push({ start, end: start + duration });
    return acc;
  }, []);

  return (
    <AbsoluteFill style={{ background: TOKENS.bgDeep }}>
      {data.slides.map((slide, i) => {
        const { start, end } = windows[i];
        return (
          <Sequence
            key={i}
            from={start}
            durationInFrames={end - start + CROSSFADE_FRAMES}
          >
            <CrossfadeSlide
              imagePath={slide.imagePath}
              caption={slide.caption}
              localStartFrame={0}
              localEndFrame={end - start}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const CrossfadeSlide: React.FC<{
  imagePath: string;
  caption?: string;
  localStartFrame: number;
  localEndFrame: number;
}> = ({ imagePath, caption, localStartFrame, localEndFrame }) => {
  const frame = useCurrentFrame();
  // Fade in over CROSSFADE_FRAMES, hold, fade out over CROSSFADE_FRAMES.
  const opacity = interpolate(
    frame,
    [
      localStartFrame,
      localStartFrame + CROSSFADE_FRAMES,
      localEndFrame,
      localEndFrame + CROSSFADE_FRAMES,
    ],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  return (
    <AbsoluteFill style={{ opacity }}>
      <Img
        src={staticFile(imagePath)}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
        }}
      />
      {caption && (
        <div
          style={{
            position: "absolute",
            left: 60,
            bottom: 60,
            padding: "14px 22px",
            background: "rgba(10,19,40,0.55)",
            border: `1px solid ${TOKENS.borderStrong}`,
            borderRadius: 12,
            color: TOKENS.bgPrimary,
            fontFamily: FONTS.serif,
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: 0.3,
            backdropFilter: "blur(8px)",
          }}
        >
          {caption}
        </div>
      )}
    </AbsoluteFill>
  );
};

/** Renders when slideshow.json has zero slides. Keeps Studio/CLI
 *  functional during scaffolding. */
const HoldingCard: React.FC<{ frame: number }> = ({ frame }) => {
  const pulse = 0.6 + 0.2 * Math.sin(frame * 0.08);
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(ellipse at top, ${TOKENS.bgSecondary} 0%, ${TOKENS.bgPrimary} 55%, ${TOKENS.bgDeep} 100%)`,
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTS.serif,
      }}
    >
      <div
        style={{
          fontSize: 54,
          fontWeight: 900,
          color: TOKENS.textPrimary,
          letterSpacing: -0.5,
          marginBottom: 18,
        }}
      >
        Bastrop Open House
      </div>
      <div
        style={{
          fontFamily: FONTS.mono,
          fontSize: 16,
          color: TOKENS.textSecondary,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          opacity: pulse,
        }}
      >
        slideshow scaffold ready — run npm run pull-images
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 40,
          right: 56,
          fontFamily: FONTS.mono,
          fontSize: 11,
          color: TOKENS.textTertiary,
          opacity: 0.6,
        }}
      >
        {VIDEO.WIDTH}×{VIDEO.HEIGHT} @ {VIDEO.FPS}fps
      </div>
    </AbsoluteFill>
  );
};

export default Slideshow;
