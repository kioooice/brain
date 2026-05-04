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
    getWorkbenchSnapshot: vi.fn().mockReturnValue({
      boxes: [{ id: 1, name: "收件箱", color: "#f97316", description: "", sortOrder: 0 }],
      items: [],
      panelState: { selectedBoxId: 1 },
    }),
    captureTextOrLink: vi.fn().mockReturnValue({ items: [] }),
    captureTextOrLinkIntoBox: vi.fn().mockReturnValue({ items: [] }),
    captureImageData: vi.fn().mockReturnValue({ items: [] }),
    captureImageDataIntoBox: vi.fn().mockReturnValue({ items: [] }),
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
    expect(store.captureTextOrLinkIntoBox).toHaveBeenCalledWith("Useful clipped note", 1);
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
    expect(store.captureImageDataIntoBox).toHaveBeenCalledWith("data:image/png;base64,ZmFrZQ==", "剪贴板图片", 1);
  });

  it("does not capture recent duplicate fingerprints", () => {
    const store = createStoreDouble();
    electronMocks.readText.mockReturnValue("Repeated clipped note");
    electronMocks.readImage.mockReturnValue({ isEmpty: () => true, toDataURL: () => "" });

    captureClipboardNow(store);
    const result = captureClipboardNow(store);

    expect(result.captured).toBe(false);
    expect(result.reason).toContain("重复");
    expect(store.captureTextOrLinkIntoBox).toHaveBeenCalledTimes(1);
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

    expect(store.captureTextOrLinkIntoBox).toHaveBeenCalledTimes(1);

    clipboardText = "Another watcher note";
    vi.advanceTimersByTime(1500);

    expect(store.captureTextOrLinkIntoBox).toHaveBeenCalledTimes(2);
  });

  it("watcher does not recapture the same fingerprint after a transient empty clipboard read", () => {
    vi.useFakeTimers();
    const store = createStoreDouble();
    let clipboardText = "";
    electronMocks.readText.mockImplementation(() => clipboardText);
    electronMocks.readImage.mockReturnValue({ isEmpty: () => true, toDataURL: () => "" });

    startClipboardWatcher(store);

    clipboardText = "Stable watcher note";
    vi.advanceTimersByTime(1500);

    clipboardText = "";
    vi.advanceTimersByTime(1500);

    vi.advanceTimersByTime(10_001);
    clipboardText = "Stable watcher note";
    vi.advanceTimersByTime(1500);

    expect(store.captureTextOrLinkIntoBox).toHaveBeenCalledTimes(1);
  });
});
