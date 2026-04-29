import type { Rectangle } from "electron";
import { describe, expect, it } from "vitest";
import {
  FLOATING_BALL_BOUNDS,
  NORMAL_WINDOW_BOUNDS,
  resolveFloatingBallBounds,
  resolveLastMainWindowBounds,
  resolveMainModeBounds,
  resolveSimpleBoxBounds,
  resolveSimpleModeBounds,
  resolveSimpleModeWindowBounds,
  SIMPLE_BOX_WINDOW_BOUNDS,
  SIMPLE_WINDOW_BOUNDS,
} from "./window-bounds";

describe("resolveSimpleModeBounds", () => {
  it("keeps the floating-ball window tightly wrapped around the button", () => {
    expect(FLOATING_BALL_BOUNDS).toEqual({
      width: 80,
      height: 80,
      margin: 26,
    });
  });

  it("places the floating ball near the bottom-right corner by default", () => {
    const workArea: Rectangle = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };

    expect(resolveFloatingBallBounds(workArea)).toEqual({
      x: 1920 - FLOATING_BALL_BOUNDS.width - FLOATING_BALL_BOUNDS.margin,
      y: 1080 - FLOATING_BALL_BOUNDS.height - FLOATING_BALL_BOUNDS.margin,
      width: FLOATING_BALL_BOUNDS.width,
      height: FLOATING_BALL_BOUNDS.height,
    });
  });

  it("clamps remembered floating-ball bounds back into the active work area", () => {
    const workArea: Rectangle = {
      x: 100,
      y: 20,
      width: 1440,
      height: 900,
    };

    expect(
      resolveFloatingBallBounds(workArea, {
        x: 5000,
        y: -100,
        width: FLOATING_BALL_BOUNDS.width,
        height: FLOATING_BALL_BOUNDS.height,
      })
    ).toEqual({
      x: 100 + 1440 - FLOATING_BALL_BOUNDS.width,
      y: 20,
      width: FLOATING_BALL_BOUNDS.width,
      height: FLOATING_BALL_BOUNDS.height,
    });
  });

  it("places the simple window on the right side and vertically centered", () => {
    const workArea: Rectangle = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };

    expect(resolveSimpleModeBounds(workArea)).toEqual({
      x: 1920 - SIMPLE_WINDOW_BOUNDS.minWidth,
      y: Math.round((1080 - SIMPLE_WINDOW_BOUNDS.minHeight) / 2),
      width: SIMPLE_WINDOW_BOUNDS.minWidth,
      height: SIMPLE_WINDOW_BOUNDS.minHeight,
    });
  });

  it("places the simple box window on the right side with the larger detail size", () => {
    const workArea: Rectangle = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };

    expect(resolveSimpleBoxBounds(workArea)).toEqual({
      x: 1920 - SIMPLE_BOX_WINDOW_BOUNDS.width,
      y: Math.round((1080 - SIMPLE_BOX_WINDOW_BOUNDS.height) / 2),
      width: SIMPLE_BOX_WINDOW_BOUNDS.width,
      height: SIMPLE_BOX_WINDOW_BOUNDS.height,
    });
  });

  it("keeps the window inside the work area when the screen is shorter than the sidebar", () => {
    const workArea: Rectangle = {
      x: 100,
      y: 20,
      width: 1440,
      height: 360,
    };

    expect(resolveSimpleModeBounds(workArea)).toEqual({
      x: 100 + 1440 - SIMPLE_WINDOW_BOUNDS.minWidth,
      y: 20,
      width: SIMPLE_WINDOW_BOUNDS.minWidth,
      height: SIMPLE_WINDOW_BOUNDS.minHeight,
    });
  });

  it("re-centers based on the actual simple window size", () => {
    const workArea: Rectangle = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
    };

    expect(resolveSimpleModeWindowBounds(workArea, { width: 228, height: 540 })).toEqual({
      x: 1920 - 228,
      y: Math.round((1080 - 540) / 2),
      width: 228,
      height: 540,
    });
  });

  it("restores the previous main window bounds when leaving simple mode", () => {
    const previousMainBounds: Rectangle = {
      x: 220,
      y: 120,
      width: 1440,
      height: 920,
    };

    expect(resolveMainModeBounds(previousMainBounds)).toEqual(previousMainBounds);
  });

  it("falls back to the default main window bounds when no previous main bounds exist", () => {
    expect(resolveMainModeBounds()).toEqual({
      width: NORMAL_WINDOW_BOUNDS.width,
      height: NORMAL_WINDOW_BOUNDS.height,
    });
  });

  it("keeps the remembered main window bounds when switching back from simple mode", () => {
    const simpleBounds: Rectangle = {
      x: 1736,
      y: 330,
      width: 184,
      height: 420,
    };
    const rememberedMainBounds: Rectangle = {
      x: 220,
      y: 120,
      width: 1440,
      height: 920,
    };

    expect(
      resolveLastMainWindowBounds({
        previousMode: "simple",
        currentWindowBounds: simpleBounds,
        lastMainWindowBounds: rememberedMainBounds,
      })
    ).toEqual(rememberedMainBounds);
  });

  it("updates the remembered main window bounds while still in main mode", () => {
    const currentMainBounds: Rectangle = {
      x: 160,
      y: 90,
      width: 1320,
      height: 860,
    };

    expect(
      resolveLastMainWindowBounds({
        previousMode: "main",
        currentWindowBounds: currentMainBounds,
      })
    ).toEqual(currentMainBounds);
  });
});
