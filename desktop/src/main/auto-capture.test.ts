import { afterEach, describe, expect, it, vi } from "vitest";
import type { AutoCaptureSnapshot } from "../shared/types";
import {
  captureDesktopNow,
  cleanupExpiredAutoCaptures,
  configureAutoCapture,
  deleteAutoCaptureEntry,
  getAutoCaptureSnapshot,
  pauseAutoCaptureForPrivacy,
  registerAutoCaptureProtocol,
  startAutoCapture,
  stopAutoCapture,
  subscribeAutoCaptureSnapshots,
} from "./auto-capture";

const fsMocks = vi.hoisted(() => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
}));

const protocolMocks = vi.hoisted(() => ({
  registerFileProtocol: vi.fn(),
}));

const electronMocks = vi.hoisted(() => ({
  desktopCapturer: {
    getSources: vi.fn(),
  },
  screen: {
    getPrimaryDisplay: vi.fn(),
  },
}));

const windowsOcrMocks = vi.hoisted(() => ({
  runWindowsOcr: vi.fn(),
}));

vi.mock("node:fs/promises", () => ({
  ...fsMocks,
  default: fsMocks,
}));

vi.mock("./windows-ocr", () => windowsOcrMocks);

vi.mock("electron", () => ({
  protocol: protocolMocks,
  desktopCapturer: electronMocks.desktopCapturer,
  screen: electronMocks.screen,
}));

function createSnapshot(entries: AutoCaptureSnapshot["entries"] = []): AutoCaptureSnapshot {
  return {
    entries,
    running: false,
    intervalMs: 60_000,
    lastError: "",
    ocrAvailable: false,
    ocrStatus: "",
    paused: true,
    pauseReason: "manual",
  };
}

function createStoreDouble() {
  const entries: AutoCaptureSnapshot["entries"] = [];
  return {
    getWorkbenchSnapshot: vi.fn(),
    getNotepadSnapshot: vi.fn(),
    createNotepadGroup: vi.fn(),
    createNotepadNote: vi.fn(),
    getAutoCaptureSnapshot: vi.fn(() => createSnapshot(entries)),
    addAutoCaptureEntry: vi.fn((imagePath: string, ocrText: string) => {
      entries.unshift({
        id: entries.length + 1,
        imagePath,
        imageUrl: `file:///${imagePath}`,
        ocrText,
        createdAt: "2026-05-04T00:00:00.000Z",
      });
      return createSnapshot(entries);
    }),
    pruneAutoCaptureEntriesBefore: vi.fn(() => []),
    deleteAutoCaptureEntry: vi.fn(() => createSnapshot(entries)),
    clearAutoCaptureEntries: vi.fn(() => createSnapshot([])),
    getAutoCaptureEntryPath: vi.fn(),
    getAutoCaptureEntryPaths: vi.fn(() => []),
    captureTextOrLink: vi.fn(),
    captureTextOrLinkIntoBox: vi.fn(),
    captureImageData: vi.fn(),
    captureImageDataIntoBox: vi.fn(),
    captureDroppedPaths: vi.fn(),
    captureDroppedPathsIntoBox: vi.fn(),
    createBox: vi.fn(),
    updateBox: vi.fn(),
    reorderBox: vi.fn(),
    deleteBox: vi.fn(),
    clearBoxItems: vi.fn(),
    deleteItem: vi.fn(),
    updateItemTitle: vi.fn(),
    removeBundleEntry: vi.fn(),
    groupItems: vi.fn(),
    moveItemToBox: vi.fn(),
    moveItemToIndex: vi.fn(),
    reorderItem: vi.fn(),
    applyAiOrganization: vi.fn(),
    selectBox: vi.fn(),
    getBundleEntries: vi.fn(),
    updateLinkTitle: vi.fn(),
    close: vi.fn(),
  };
}

async function startAndFlushAutoCapture(intervalMs = 60_000) {
  startAutoCapture(intervalMs);
  for (let index = 0; index < 8; index += 1) {
    await Promise.resolve();
  }
  return getAutoCaptureSnapshot();
}

describe("auto capture", () => {
  afterEach(() => {
    stopAutoCapture();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("captures the desktop image as a smaller JPEG, runs OCR, and stores the text", async () => {
    const store = createStoreDouble();
    configureAutoCapture({
      store,
      captureDirectory: "C:\\brain\\auto-captures",
      captureDesktopImage: vi.fn().mockResolvedValue(Buffer.from("jpg")),
      runOcr: vi.fn().mockResolvedValue({
        text: "OCR idea text",
        available: true,
        status: "OCR ready",
      }),
    });

    const snapshot = await startAndFlushAutoCapture();

    expect(fsMocks.writeFile).toHaveBeenCalledWith(expect.stringContaining(".jpg"), Buffer.from("jpg"));
    expect(store.addAutoCaptureEntry).toHaveBeenCalledWith(expect.stringContaining(".jpg"), "OCR idea text");
    expect(snapshot.entries[0].ocrText).toBe("OCR idea text");
    expect(snapshot.ocrAvailable).toBe(true);
  });

  it("downscales the default desktop capture before writing a JPEG", async () => {
    const resizedThumbnail = {
      toJPEG: vi.fn(() => Buffer.from("compressed-jpg")),
    };
    const thumbnail = {
      isEmpty: vi.fn(() => false),
      getSize: vi.fn(() => ({ width: 2560, height: 1440 })),
      resize: vi.fn(() => resizedThumbnail),
    };
    electronMocks.screen.getPrimaryDisplay.mockReturnValue({
      id: 1,
      size: { width: 2560, height: 1440 },
      bounds: { width: 2560, height: 1440 },
    });
    electronMocks.desktopCapturer.getSources.mockResolvedValue([
      {
        display_id: "1",
        thumbnail,
      },
    ]);
    const store = createStoreDouble();
    configureAutoCapture({
      store,
      captureDirectory: "C:\\brain\\auto-captures",
      runOcr: vi.fn().mockResolvedValue({ text: "", available: true, status: "OCR ready" }),
    });

    await startAndFlushAutoCapture();

    expect(thumbnail.resize).toHaveBeenCalledWith({ width: 1600, height: 900, quality: "good" });
    expect(resizedThumbnail.toJPEG).toHaveBeenCalledWith(72);
    expect(fsMocks.writeFile).toHaveBeenCalledWith(expect.stringContaining(".jpg"), Buffer.from("compressed-jpg"));
  });

  it("prunes captures older than twelve hours and removes their files after a capture", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00.000Z"));
    const store = createStoreDouble();
    store.pruneAutoCaptureEntriesBefore.mockReturnValue(["C:\\brain\\auto-captures\\old.jpg"]);
    configureAutoCapture({
      store,
      captureDirectory: "C:\\brain\\auto-captures",
      captureDesktopImage: vi.fn().mockResolvedValue(Buffer.from("jpg")),
      runOcr: vi.fn().mockResolvedValue({ text: "", available: true, status: "OCR ready" }),
    });

    await startAndFlushAutoCapture();

    expect(store.pruneAutoCaptureEntriesBefore).toHaveBeenCalledWith("2026-05-04T00:00:00.000Z");
    expect(fsMocks.rm).toHaveBeenCalledWith("C:\\brain\\auto-captures\\old.jpg", { force: true });
  });

  it("manually cleans expired automatic captures with the same twelve hour retention", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T12:00:00.000Z"));
    const store = createStoreDouble();
    store.pruneAutoCaptureEntriesBefore.mockReturnValue([
      "C:\\brain\\auto-captures\\old.jpg",
      "C:\\brain\\image-thumbnails\\old-thumb.jpg",
    ]);
    configureAutoCapture({
      store,
      captureDirectory: "C:\\brain\\auto-captures",
      captureDesktopImage: vi.fn().mockResolvedValue(Buffer.from("jpg")),
      runOcr: vi.fn().mockResolvedValue({ text: "", available: true, status: "OCR ready" }),
    });

    const result = await cleanupExpiredAutoCaptures();

    expect(store.pruneAutoCaptureEntriesBefore).toHaveBeenCalledWith("2026-05-04T00:00:00.000Z");
    expect(fsMocks.rm).toHaveBeenCalledWith("C:\\brain\\auto-captures\\old.jpg", { force: true });
    expect(fsMocks.rm).toHaveBeenCalledWith("C:\\brain\\image-thumbnails\\old-thumb.jpg", { force: true });
    expect(result.removedFiles).toBe(2);
  });

  it("uses built-in Windows OCR by default", async () => {
    windowsOcrMocks.runWindowsOcr.mockResolvedValue({
      text: "Windows OCR text",
      available: true,
      status: "Windows OCR 已启用",
    });
    const store = createStoreDouble();
    configureAutoCapture({
      store,
      captureDirectory: "C:\\brain\\auto-captures",
      captureDesktopImage: vi.fn().mockResolvedValue(Buffer.from("jpg")),
    });

    const snapshot = await startAndFlushAutoCapture();

    expect(windowsOcrMocks.runWindowsOcr).toHaveBeenCalledWith(expect.stringContaining(".jpg"));
    expect(store.addAutoCaptureEntry).toHaveBeenCalledWith(expect.stringContaining(".jpg"), "Windows OCR text");
    expect(snapshot.ocrStatus).toBe("Windows OCR 已启用");
  });

  it("notifies listeners when a background capture is stored", async () => {
    const store = createStoreDouble();
    const listener = vi.fn();
    const unsubscribe = subscribeAutoCaptureSnapshots(listener);
    configureAutoCapture({
      store,
      captureDirectory: "C:\\brain\\auto-captures",
      captureDesktopImage: vi.fn().mockResolvedValue(Buffer.from("jpg")),
      runOcr: vi.fn().mockResolvedValue({ text: "visible now", available: true, status: "OCR ready" }),
    });

    await startAndFlushAutoCapture();
    unsubscribe();

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      entries: [
        expect.objectContaining({
          ocrText: "visible now",
        }),
      ],
    }));
  });

  it("maps capture image urls back to files through Electron file protocol", () => {
    const store = createStoreDouble();
    store.getAutoCaptureEntryPath.mockReturnValue("C:\\brain\\auto-captures\\shot.png");

    registerAutoCaptureProtocol(store, "C:\\brain\\auto-captures");

    const handler = protocolMocks.registerFileProtocol.mock.calls[0]?.[1];
    const callback = vi.fn();
    handler({ url: "brain-capture://entry/12.png" }, callback);

    expect(callback).toHaveBeenCalledWith({
      path: "C:\\brain\\auto-captures\\shot.png",
    });
  });

  it("removes both original and thumbnail files when deleting an automatic capture", async () => {
    const store = createStoreDouble();
    store.getAutoCaptureEntryPaths.mockReturnValue([
      "C:\\brain\\auto-captures\\shot.jpg",
      "C:\\brain\\image-thumbnails\\shot-thumb.jpg",
    ]);
    configureAutoCapture({
      store,
      captureDirectory: "C:\\brain\\auto-captures",
      captureDesktopImage: vi.fn().mockResolvedValue(Buffer.from("jpg")),
      runOcr: vi.fn().mockResolvedValue({ text: "", available: true, status: "OCR ready" }),
    });

    await deleteAutoCaptureEntry(12);

    expect(store.getAutoCaptureEntryPaths).toHaveBeenCalledWith(12);
    expect(fsMocks.rm).toHaveBeenCalledWith("C:\\brain\\auto-captures\\shot.jpg", { force: true });
    expect(fsMocks.rm).toHaveBeenCalledWith("C:\\brain\\image-thumbnails\\shot-thumb.jpg", { force: true });
  });

  it("starts paused-by-default capture only when requested", () => {
    vi.useFakeTimers();
    const store = createStoreDouble();
    configureAutoCapture({
      store,
      captureDirectory: "C:\\brain\\auto-captures",
      captureDesktopImage: vi.fn().mockResolvedValue(Buffer.from("jpg")),
      runOcr: vi.fn().mockResolvedValue({ text: "", available: false, status: "OCR missing" }),
    });

    const snapshot = startAutoCapture(30_000);

    expect(snapshot.running).toBe(true);
    expect(snapshot.paused).toBe(false);
    expect(snapshot.pauseReason).toBe(null);
    expect(snapshot.intervalMs).toBe(30_000);
  });

  it("privacy pause stops automatic capture and blocks later desktop writes", async () => {
    vi.useFakeTimers();
    const store = createStoreDouble();
    const captureDesktopImage = vi.fn().mockResolvedValue(Buffer.from("private-jpg"));
    configureAutoCapture({
      store,
      captureDirectory: "C:\\brain\\auto-captures",
      captureDesktopImage,
      runOcr: vi.fn().mockResolvedValue({ text: "private screen", available: true, status: "OCR ready" }),
    });

    startAutoCapture(30_000);
    vi.clearAllMocks();

    const pausedSnapshot = pauseAutoCaptureForPrivacy();
    const capturedSnapshot = await captureDesktopNow();

    expect(pausedSnapshot.running).toBe(false);
    expect(pausedSnapshot.paused).toBe(true);
    expect(pausedSnapshot.pauseReason).toBe("privacy");
    expect(capturedSnapshot.entries).toEqual([]);
    expect(captureDesktopImage).not.toHaveBeenCalled();
    expect(fsMocks.writeFile).not.toHaveBeenCalled();
    expect(store.addAutoCaptureEntry).not.toHaveBeenCalled();
  });
});
