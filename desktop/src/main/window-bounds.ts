import type { Rectangle } from "electron";

export type WindowLaunchBounds = Pick<Rectangle, "width" | "height"> & Partial<Pick<Rectangle, "x" | "y">>;

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

export const SIMPLE_BOX_WINDOW_BOUNDS = {
  width: 1120,
  height: 760,
  minWidth: 900,
  minHeight: 620,
} as const;

export const FLOATING_BALL_BOUNDS = {
  width: 80,
  height: 80,
  margin: 26,
} as const;

export function resolveMainModeBounds(previousMainBounds?: Rectangle): WindowLaunchBounds {
  return (
    previousMainBounds ?? {
      width: NORMAL_WINDOW_BOUNDS.width,
      height: NORMAL_WINDOW_BOUNDS.height,
    }
  );
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

export function resolveSimpleBoxBounds(workArea: Rectangle): Rectangle {
  return resolveSimpleModeWindowBounds(workArea, {
    width: SIMPLE_BOX_WINDOW_BOUNDS.width,
    height: SIMPLE_BOX_WINDOW_BOUNDS.height,
  });
}

export function resolveFloatingBallBounds(
  workArea: Rectangle,
  rememberedBounds?: Partial<Rectangle> | null
): Rectangle {
  const width = FLOATING_BALL_BOUNDS.width;
  const height = FLOATING_BALL_BOUNDS.height;
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  const fallbackX = maxX - FLOATING_BALL_BOUNDS.margin;
  const fallbackY = maxY - FLOATING_BALL_BOUNDS.margin;
  const nextX = rememberedBounds?.x ?? fallbackX;
  const nextY = rememberedBounds?.y ?? fallbackY;

  return {
    x: Math.max(workArea.x, Math.min(nextX, maxX)),
    y: Math.max(workArea.y, Math.min(nextY, maxY)),
    width,
    height,
  };
}
