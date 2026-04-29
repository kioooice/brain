import { beforeEach, describe, expect, it, vi } from "vitest";

const ipcMainMocks = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock("electron", () => ({
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
}));

import { IPC_CHANNELS } from "../shared/ipc";
import { registerIpc } from "./ipc";

function createStoreDouble() {
  return {
    getWorkbenchSnapshot: vi.fn(),
    setSimpleMode: vi.fn(),
    setSimpleModeView: vi.fn(),
    moveFloatingBall: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    setFloatingBallBounds: vi.fn(),
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
    deleteItem: vi.fn(),
    updateItemTitle: vi.fn(),
    removeBundleEntry: vi.fn(),
    groupItems: vi.fn(),
    moveItemToBox: vi.fn(),
    moveItemToIndex: vi.fn(),
    reorderItem: vi.fn(),
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

  it("registers the box selection handler", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.selectBox, expect.any(Function));
  });

  it("registers the simple mode handler", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.setSimpleMode, expect.any(Function));
  });

  it("registers the simple mode view handler", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.setSimpleModeView, expect.any(Function));
  });

  it("registers the floating ball move handler", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.moveFloatingBall, expect.any(Function));
  });

  it("registers the always-on-top handler", () => {
    registerIpc(createStoreDouble());

    expect(ipcMainMocks.handle).toHaveBeenCalledWith(IPC_CHANNELS.setAlwaysOnTop, expect.any(Function));
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
  });
});
