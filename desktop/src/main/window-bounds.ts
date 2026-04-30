import type { Rectangle } from "electron";

export type WindowLaunchBounds = Pick<Rectangle, "width" | "height"> & Partial<Pick<Rectangle, "x" | "y">>;

export const NORMAL_WINDOW_BOUNDS = {
  width: 1440,
  height: 920,
  minWidth: 1120,
  minHeight: 760,
} as const;

export function resolveMainModeBounds(previousMainBounds?: Rectangle): WindowLaunchBounds {
  return (
    previousMainBounds ?? {
      width: NORMAL_WINDOW_BOUNDS.width,
      height: NORMAL_WINDOW_BOUNDS.height,
    }
  );
}
