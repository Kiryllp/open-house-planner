import React from "react";
import { Composition } from "remotion";
import { VIDEO } from "./lib/constants";
import { Slideshow } from "./scenes/Slideshow";
import slideshowData from "./data/slideshow.json";

/**
 * Root composition registry.
 *
 * Each entry is a `<Composition>` Remotion can list in Studio and render
 * from the CLI. Add new scenes by creating a file in `src/scenes/`,
 * importing it here, and registering it below.
 *
 * For the main deliverable — the looping slideshow — duration is
 * computed from the data file so editing slideshow.json changes the
 * render length automatically.
 */
const slideshowTotalFrames =
  slideshowData.slides.reduce(
    (acc: number, slide: { durationSeconds: number }) =>
      acc + Math.round(slide.durationSeconds * VIDEO.FPS),
    0,
  ) || 60; // fallback so Studio can boot with an empty slides[] array

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="Slideshow"
        component={Slideshow}
        durationInFrames={slideshowTotalFrames}
        fps={VIDEO.FPS}
        width={VIDEO.WIDTH}
        height={VIDEO.HEIGHT}
      />
    </>
  );
};
