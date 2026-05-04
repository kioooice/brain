import { contextBridge, ipcRenderer, webUtils } from "electron";
import { IPC_CHANNELS } from "./shared/ipc";
import type {
  AiOrganizationResult,
  AiOrganizationSuggestion,
  AiProviderConfig,
  AiProviderConfigInput,
  AiProviderConnectionTestResult,
  AutoCaptureSnapshot,
  BundleEntry,
  ClearBoxItemsKind,
  ClipboardCaptureBoxStatus,
  ClipboardCaptureIpcResult,
  ClipboardWatcherStatus,
  LocalSearchSnapshot,
  NotepadSnapshot,
  StorageCleanupResult,
  StorageUsageSnapshot,
  WorkbenchSnapshot,
} from "./shared/types";

contextBridge.exposeInMainWorld("brainDesktop", {
  bootstrap(): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.bootstrap);
  },
  getNotepadSnapshot(): Promise<NotepadSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.getNotepadSnapshot);
  },
  createNotepadGroup(name: string): Promise<NotepadSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.createNotepadGroup, name);
  },
  createNotepadNote(groupId: number, content: string): Promise<NotepadSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.createNotepadNote, groupId, content);
  },
  getAutoCaptureSnapshot(query?: string): Promise<AutoCaptureSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.getAutoCaptureSnapshot, query);
  },
  startAutoCapture(intervalMs?: number): Promise<AutoCaptureSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.startAutoCapture, intervalMs);
  },
  stopAutoCapture(): Promise<AutoCaptureSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.stopAutoCapture);
  },
  pauseAutoCaptureForPrivacy(): Promise<AutoCaptureSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.pauseAutoCaptureForPrivacy);
  },
  captureDesktopNow(): Promise<AutoCaptureSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureDesktopNow);
  },
  searchAutoCaptures(query: string): Promise<AutoCaptureSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.searchAutoCaptures, query);
  },
  deleteAutoCaptureEntry(entryId: number): Promise<AutoCaptureSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.deleteAutoCaptureEntry, entryId);
  },
  clearAutoCaptures(): Promise<AutoCaptureSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.clearAutoCaptures);
  },
  getStorageUsage(): Promise<StorageUsageSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.getStorageUsage);
  },
  cleanupExpiredAutoCaptures(): Promise<StorageCleanupResult> {
    return ipcRenderer.invoke(IPC_CHANNELS.cleanupExpiredAutoCaptures);
  },
  cleanupOrphanedStorageFiles(): Promise<StorageCleanupResult> {
    return ipcRenderer.invoke(IPC_CHANNELS.cleanupOrphanedStorageFiles);
  },
  searchLocal(query: string, limit?: number): Promise<LocalSearchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.searchLocal, query, limit);
  },
  onAutoCaptureChanged(handler: (snapshot: AutoCaptureSnapshot) => void): () => void {
    const listener = (_event: unknown, snapshot: AutoCaptureSnapshot) => handler(snapshot);
    ipcRenderer.on(IPC_CHANNELS.autoCaptureChanged, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.autoCaptureChanged, listener);
    };
  },
  getPathsForFiles(files: File[]): string[] {
    return files.map((file) => webUtils.getPathForFile(file)).filter((path) => path.trim().length > 0);
  },
  onClipboardCapture(handler: (result: ClipboardCaptureIpcResult) => void): () => void {
    const listener = (_event: unknown, result: ClipboardCaptureIpcResult) => handler(result);
    ipcRenderer.on(IPC_CHANNELS.clipboardCaptureChanged, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.clipboardCaptureChanged, listener);
    };
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
  suggestAiOrganization(boxId: number): Promise<AiOrganizationResult> {
    return ipcRenderer.invoke(IPC_CHANNELS.suggestAiOrganization, boxId);
  },
  applyAiOrganization(suggestions: AiOrganizationSuggestion[]): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.applyAiOrganization, suggestions);
  },
  getAiProviderConfig(): Promise<AiProviderConfig> {
    return ipcRenderer.invoke(IPC_CHANNELS.getAiProviderConfig);
  },
  saveAiProviderConfig(input: AiProviderConfigInput): Promise<AiProviderConfig> {
    return ipcRenderer.invoke(IPC_CHANNELS.saveAiProviderConfig, input);
  },
  testAiProviderConnection(input: AiProviderConfigInput): Promise<AiProviderConnectionTestResult> {
    return ipcRenderer.invoke(IPC_CHANNELS.testAiProviderConnection, input);
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
