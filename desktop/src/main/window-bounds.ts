import type { Rectangle } from "electron";

export const NORMAL_WINDOW_BOUNDS = {
  width: 1440,
  height: 920,
  minWidth: 1120,
  minHeight: 760,
} as const;

export const SIMPLE_WINDOW_BOUNDS = {
  width: 248,
  minWidth: 184,
  minHeight: 420,
} as const;

export function resolveMainModeBounds(previousMainBounds?: Rectangle): Rectangle {
  return previousMainBounds ?? NORMAL_WINDOW_BOUNDS;
}

export function resolveLastMainWindowBounds(options: {
  previousMode: "main" | "simple";
  currentWindowBounds?: Rectangle;
  lastMainWindowBounds?: Rectangle;
}) {
  if (options.previousMode === "main") {
    return options.currentWindowBounds ?? options.lastMainWindowBounds;
  }

  return options.lastMainWindowBounds;
}

export function resolveSimpleModeWindowBounds(
  workArea: Rectangle,
  size: {
    width: number;
    height: number;
  }
): Rectangle {
  const width = Math.max(SIMPLE_WINDOW_BOUNDS.minWidth, Math.round(size.width));
  const height = Math.max(SIMPLE_WINDOW_BOUNDS.minHeight, Math.round(size.height));
  const centeredY = workArea.y + Math.round((workArea.height - height) / 2);

  return {
    x: workArea.x + workArea.width - width,
    y: Math.max(workArea.y, centeredY),
    width,
    height,
  };
}

export function resolveSimpleModeBounds(workArea: Rectangle): Rectangle {
  return resolveSimpleModeWindowBounds(workArea, {
    width: SIMPLE_WINDOW_BOUNDS.minWidth,
    height: SIMPLE_WINDOW_BOUNDS.minHeight,
  });
}
