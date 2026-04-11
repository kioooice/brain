import { describe, expect, it, vi } from "vitest";
import { buildTrayIconDataUrl, buildTrayMenuTemplate, shouldHideWindowToTray } from "./background";

describe("background helpers", () => {
  it("builds a tray menu for restoring views and quitting", () => {
    const onOpenMain = vi.fn();
    const onOpenSimple = vi.fn();
    const onQuit = vi.fn();

    const template = buildTrayMenuTemplate({
      onOpenMain,
      onOpenSimple,
      onQuit,
    });

    expect(template).toEqual([
      expect.objectContaining({ label: "打开主界面" }),
      expect.objectContaining({ label: "打开简易模式" }),
      expect.objectContaining({ type: "separator" }),
      expect.objectContaining({ label: "退出" }),
    ]);

    template[0].click?.({} as never, {} as never, {} as never);
    template[1].click?.({} as never, {} as never, {} as never);
    template[3].click?.({} as never, {} as never, {} as never);

    expect(onOpenMain).toHaveBeenCalledTimes(1);
    expect(onOpenSimple).toHaveBeenCalledTimes(1);
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("hides a window to tray when the app is not quitting", () => {
    expect(shouldHideWindowToTray(false)).toBe(true);
    expect(shouldHideWindowToTray(true)).toBe(false);
  });

  it("builds a PNG tray icon data url for Windows-safe rendering", () => {
    const dataUrl = buildTrayIconDataUrl();

    expect(dataUrl.startsWith("data:image/png;base64,")).toBe(true);
  });
});
