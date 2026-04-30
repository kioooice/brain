import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC_CHANNELS } from "./shared/ipc";
import type {
  BundleEntry,
  ClearBoxItemsKind,
  ClipboardCaptureBoxStatus,
  ClipboardCaptureIpcResult,
  ClipboardWatcherStatus,
  WorkbenchSnapshot,
} from "./shared/types";

contextBridge.exposeInMainWorld("brainDesktop", {
  bootstrap(): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.bootstrap);
  },
  getPathsForFiles(files: File[]): string[] {
    return files.map((file) => webUtils.getPathForFile(file)).filter((path) => path.trim().length > 0);
  },
  setAlwaysOnTop(enabled: boolean): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.setAlwaysOnTop, enabled);
  },
  captureClipboardNow(): Promise<ClipboardCaptureIpcResult> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureClipboardNow);
  },
  setClipboardWatcherEnabled(enabled: boolean): Promise<ClipboardWatcherStatus> {
    return ipcRenderer.invoke(IPC_CHANNELS.setClipboardWatcherEnabled, enabled);
  },
  getClipboardWatcherStatus(): Promise<ClipboardWatcherStatus> {
    return ipcRenderer.invoke(IPC_CHANNELS.getClipboardWatcherStatus);
  },
  setClipboardCaptureBox(boxId: number): Promise<ClipboardCaptureBoxStatus> {
    return ipcRenderer.invoke(IPC_CHANNELS.setClipboardCaptureBox, boxId);
  },
  getClipboardCaptureBox(): Promise<ClipboardCaptureBoxStatus> {
    return ipcRenderer.invoke(IPC_CHANNELS.getClipboardCaptureBox);
  },
  captureTextOrLink(input: string): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureTextOrLink, input);
  },
  captureTextOrLinkIntoBox(input: string, boxId: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureTextOrLinkIntoBox, input, boxId);
  },
  captureImageData(dataUrl: string, title: string): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureImageData, dataUrl, title);
  },
  captureImageDataIntoBox(dataUrl: string, title: string, boxId: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureImageDataIntoBox, dataUrl, title, boxId);
  },
  captureDroppedPaths(paths: string[]): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureDroppedPaths, paths);
  },
  captureDroppedPathsIntoBox(paths: string[], boxId: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureDroppedPathsIntoBox, paths, boxId);
  },
  createBox(name: string): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.createBox, name);
  },
  updateBox(boxId: number, name: string, description: string): Promise<WorkbenchSnapshot | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.updateBox, boxId, name, description);
  },
  reorderBox(boxId: number, direction: "up" | "down"): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.reorderBox, boxId, direction);
  },
  deleteBox(boxId: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.deleteBox, boxId);
  },
  clearBoxItems(boxId: number, kind: ClearBoxItemsKind): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.clearBoxItems, boxId, kind);
  },
  deleteItem(itemId: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.deleteItem, itemId);
  },
  updateItemTitle(itemId: number, title: string): Promise<WorkbenchSnapshot | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.updateItemTitle, itemId, title);
  },
  removeBundleEntry(itemId: number, entryPath: string): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.removeBundleEntry, itemId, entryPath);
  },
  groupItems(sourceItemId: number, targetItemId: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.groupItems, sourceItemId, targetItemId);
  },
  selectBox(boxId: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.selectBox, boxId);
  },
  openPath(path: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.openPath, path);
  },
  openExternal(url: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.openExternal, url);
  },
  copyText(text: string): Promise<void> {
    return ipcRenderer.invoke(IPC_CHANNELS.copyText, text);
  },
  exportBundleAi(bundleName: string, html: string): Promise<string | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.exportBundleAi, bundleName, html);
  },
  enrichLinkTitle(itemId: number, url: string): Promise<WorkbenchSnapshot | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.enrichLinkTitle, itemId, url);
  },
  moveItemToBox(itemId: number, boxId: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.moveItemToBox, itemId, boxId);
  },
  moveItemToIndex(itemId: number, targetIndex: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.moveItemToIndex, itemId, targetIndex);
  },
  reorderItem(itemId: number, direction: "up" | "down"): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.reorderItem, itemId, direction);
  },
  getBundleEntries(itemId: number): Promise<BundleEntry[]> {
    return ipcRenderer.invoke(IPC_CHANNELS.getBundleEntries, itemId);
  },
});
