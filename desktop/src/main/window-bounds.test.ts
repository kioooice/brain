import type { Rectangle } from "electron";
import { describe, expect, it } from "vitest";
import { NORMAL_WINDOW_BOUNDS, resolveMainModeBounds } from "./window-bounds";

describe("resolveMainModeBounds", () => {
  it("restores the previous main window bounds", () => {
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
});
