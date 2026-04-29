import { describe, expect, it, vi } from "vitest";
import { buildTrayIconDataUrl, buildTrayMenuTemplate, shouldHideWindowToTray } from "./background";

describe("background helpers", () => {
  it("builds a tray menu for restoring views and quitting", () => {
    const onOpenMain = vi.fn();
    const onOpenSimple = vi.fn();
    const onCaptureClipboard = vi.fn();
    const onToggleClipboardWatcher = vi.fn();
    const onQuit = vi.fn();

    const template = buildTrayMenuTemplate({
      isClipboardWatcherRunning: false,
      onCaptureClipboard,
      onToggleClipboardWatcher,
      onOpenMain,
      onOpenSimple,
      onQuit,
    });

    expect(template).toEqual([
      expect.objectContaining({ label: "立即收集剪贴板" }),
      expect.objectContaining({ label: "开启自动监听" }),
      expect.objectContaining({ type: "separator" }),
      expect.objectContaining({ label: "打开主窗口" }),
      expect.objectContaining({ label: "打开简易模式" }),
      expect.objectContaining({ type: "separator" }),
      expect.objectContaining({ label: "退出" }),
    ]);

    template[0].click?.({} as never, {} as never, {} as never);
    template[1].click?.({} as never, {} as never, {} as never);
    template[3].click?.({} as never, {} as never, {} as never);
    template[4].click?.({} as never, {} as never, {} as never);
    template[6].click?.({} as never, {} as never, {} as never);

    expect(onCaptureClipboard).toHaveBeenCalledTimes(1);
    expect(onToggleClipboardWatcher).toHaveBeenCalledTimes(1);
    expect(onOpenMain).toHaveBeenCalledTimes(1);
    expect(onOpenSimple).toHaveBeenCalledTimes(1);
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("labels the tray watcher toggle as disabled when it is running", () => {
    const template = buildTrayMenuTemplate({
      isClipboardWatcherRunning: true,
      onOpenMain: vi.fn(),
      onOpenSimple: vi.fn(),
      onQuit: vi.fn(),
    });

    expect(template[1]).toEqual(expect.objectContaining({ label: "关闭自动监听" }));
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
