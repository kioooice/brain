import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcMainMocks = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock("electron", () => ({
  app: {
    getPath: vi.fn(() => "C:\\mock-user-data"),
  },
  ipcMain: ipcMainMocks,
  shell: {
    openPath: vi.fn(),
    openExternal: vi.fn(),
  },
  dialog: {
    showSaveDialog: vi.fn(),
  },
  clipboard: {
    writeText: vi.fn(),
  },
  desktopCapturer: {
    getSources: vi.fn(),
  },
  screen: {
    getPrimaryDisplay: vi.fn(),
  },
}));

import { IPC_CHANNELS } from "../shared/ipc";
import { registerIpc } from "./ipc";

function createStoreDouble() {
  return {
    getWorkbenchSnapshot: vi.fn(),
    getNotepadSnapshot: vi.fn(),
    createNotepadGroup: vi.fn(),
    createNotepadNote: vi.fn(),
    getAutoCaptureSnapshot: vi.fn(),
    addAutoCaptureEntry: vi.fn(),
    pruneAutoCaptureEntriesBefore: vi.fn(),
    deleteAutoCaptureEntry: vi.fn(),
    clearAutoCaptureEntries: vi.fn(),
    getAutoCaptureEntryPath: vi.fn(),
    getAutoCaptureEntryPaths: vi.fn(),
    getStorageUsage: vi.fn(),
    cleanupOrphanedStorageFiles: vi.fn(),
    searchLocal: vi.fn(),
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

describe("registerIpc", () => {
  beforeEach(() => {
    ipcMainMocks.handle.mockClear();
  });

  it("registers the targeted box drop handler", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(
      IPC_CHANNELS.captureDroppedPathsIntoBox,
      expect.any(Function)
    );
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(
      IPC_CHANNELS.captureTextOrLinkIntoBox,
      expect.any(Function)
    );
  });

  it("registers standalone notepad handlers", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.getNotepadSnapshot, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.createNotepadGroup, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.createNotepadNote, expect.any(Function));
  });

  it("registers automatic desktop capture handlers", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.getAutoCaptureSnapshot, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.startAutoCapture, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.stopAutoCapture, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.pauseAutoCaptureForPrivacy, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.captureDesktopNow, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.searchAutoCaptures, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.deleteAutoCaptureEntry, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.clearAutoCaptures, expect.any(Function));
  });

  it("registers storage usage and cleanup handlers with the automatic capture directory", async () => {
    const store = createStoreDouble();
    store.getStorageUsage.mockReturnValue({
      databaseBytes: 1,
      imageBytes: 2,
      thumbnailBytes: 3,
      autoCaptureBytes: 4,
      totalBytes: 10,
    });
    store.cleanupOrphanedStorageFiles.mockReturnValue({
      usage: {
        databaseBytes: 1,
        imageBytes: 1,
        thumbnailBytes: 1,
        autoCaptureBytes: 1,
        totalBytes: 4,
      },
      removedFiles: 2,
      removedBytes: 2048,
    });

    registerIpc(store, { autoCaptureDirectory: "C:\\brain\\auto-captures" });
    const getUsageHandler = ipcMainMocks.handle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.getStorageUsage
    )?.[1];
    const cleanupOrphansHandler = ipcMainMocks.handle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.cleanupOrphanedStorageFiles
    )?.[1];

    await getUsageHandler();
    await cleanupOrphansHandler();

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.getStorageUsage, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.cleanupExpiredAutoCaptures, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.cleanupOrphanedStorageFiles, expect.any(Function));
    expect(store.getStorageUsage).toHaveBeenCalledWith("C:\\brain\\auto-captures");
    expect(store.cleanupOrphanedStorageFiles).toHaveBeenCalledWith("C:\\brain\\auto-captures");
  });

  it("registers the unified local search handler", async () => {
    const store = createStoreDouble();
    store.searchLocal.mockReturnValue({
      query: "预算",
      results: [],
    });

    registerIpc(store);
    const searchHandler = ipcMainMocks.handle.mock.calls.find(
      ([channel]) => channel === IPC_CHANNELS.searchLocal
    )?.[1];

    const result = await searchHandler(null, "预算", 12);

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.searchLocal, expect.any(Function));
    expect(store.searchLocal).toHaveBeenCalledWith("预算", 12);
    expect(result).toEqual({ query: "预算", results: [] });
  });

  it("registers the box selection handler", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.selectBox, expect.any(Function));
  });

  it("registers clipboard capture handlers", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.captureClipboardNow, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.setClipboardWatcherEnabled, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.getClipboardWatcherStatus, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.setClipboardCaptureBox, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.getClipboardCaptureBox, expect.any(Function));
  });

  it("registers card action handlers", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.createBox, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.updateBox, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.reorderBox, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.deleteBox, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.clearBoxItems, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.deleteItem, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.updateItemTitle, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.removeBundleEntry, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.groupItems, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.openPath, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.openExternal, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.copyText, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.exportBundleAi, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.captureImageData, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.captureImageDataIntoBox, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.moveItemToBox, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.moveItemToIndex, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.reorderItem, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.getBundleEntries, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.suggestAiOrganization, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.applyAiOrganization, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.getAiProviderConfig, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.saveAiProviderConfig, expect.any(Function));
    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.testAiProviderConnection, expect.any(Function));
  });
});
