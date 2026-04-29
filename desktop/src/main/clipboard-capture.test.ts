import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DesktopStore } from "./store";

const electronMocks = vi.hoisted(() => ({
  readText: vi.fn(),
  readImage: vi.fn(),
}));

vi.mock("electron", () => ({
  clipboard: {
    readText: electronMocks.readText,
    readImage: electronMocks.readImage,
  },
}));

import {
  captureClipboardNow,
  setClipboardCaptureBoxId,
  startClipboardWatcher,
  stopClipboardWatcher,
} from "./clipboard-capture";

function createStoreDouble() {
  return {
    captureTextOrLink: vi.fn().mockReturnValue({ items: [] }),
    captureImageData: vi.fn().mockReturnValue({ items: [] }),
  } as unknown as DesktopStore;
}

describe("clipboard capture", () => {
  beforeEach(() => {
    vi.useRealTimers();
    stopClipboardWatcher();
    electronMocks.readText.mockReset();
    electronMocks.readImage.mockReset();
    setClipboardCaptureBoxId(null);
  });

  afterEach(() => {
    stopClipboardWatcher();
    vi.useRealTimers();
  });

  it("captures clipboard text through the store", () => {
    const store = createStoreDouble();
    electronMocks.readText.mockReturnValue("Useful clipped note");
    electronMocks.readImage.mockReturnValue({ isEmpty: () => true, toDataURL: () => "" });

    const result = captureClipboardNow(store);

    expect(result.captured).toBe(true);
    expect(store.captureTextOrLink).toHaveBeenCalledWith("Useful clipped note");
  });

  it("captures clipboard images through the store", () => {
    const store = createStoreDouble();
    electronMocks.readText.mockReturnValue("");
    electronMocks.readImage.mockReturnValue({
      isEmpty: () => false,
      toDataURL: () => "data:image/png;base64,ZmFrZQ==",
    });

    const result = captureClipboardNow(store);

    expect(result.captured).toBe(true);
    expect(store.captureImageData).toHaveBeenCalledWith("data:image/png;base64,ZmFrZQ==", "剪贴板图片");
  });

  it("does not capture recent duplicate fingerprints", () => {
    const store = createStoreDouble();
    electronMocks.readText.mockReturnValue("Repeated clipped note");
    electronMocks.readImage.mockReturnValue({ isEmpty: () => true, toDataURL: () => "" });

    captureClipboardNow(store);
    const result = captureClipboardNow(store);

    expect(result.captured).toBe(false);
    expect(result.reason).toContain("重复");
    expect(store.captureTextOrLink).toHaveBeenCalledTimes(1);
  });

  it("watcher captures a clipboard fingerprint only after it changes", () => {
    vi.useFakeTimers();
    const store = createStoreDouble();
    let clipboardText = "";
    electronMocks.readText.mockImplementation(() => clipboardText);
    electronMocks.readImage.mockReturnValue({ isEmpty: () => true, toDataURL: () => "" });

    startClipboardWatcher(store);

    clipboardText = "Useful watcher note";
    vi.advanceTimersByTime(1500);
    vi.advanceTimersByTime(30_000);

    expect(store.captureTextOrLink).toHaveBeenCalledTimes(1);

    clipboardText = "Another watcher note";
    vi.advanceTimersByTime(1500);

    expect(store.captureTextOrLink).toHaveBeenCalledTimes(2);
  });
});
