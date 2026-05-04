import { writeFile } from "node:fs/promises";
import { BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type {
  AiOrganizationSuggestion,
  AiProviderConfigInput,
  ClearBoxItemsKind,
} from "../shared/types";
import { getAiProviderConfigStatus, saveAiProviderConfig, testAiProviderConnection } from "./ai-config";
import {
  captureDesktopNow,
  cleanupExpiredAutoCaptures as cleanupExpiredAutoCaptureEntries,
  clearAutoCaptures,
  deleteAutoCaptureEntry,
  getAutoCaptureSnapshot,
  pauseAutoCaptureForPrivacy,
  startAutoCapture,
  stopAutoCapture,
  subscribeAutoCaptureSnapshots,
} from "./auto-capture";
import {
  captureClipboardNow,
  getClipboardCaptureBoxId,
  isClipboardWatcherRunning,
  setClipboardCaptureBoxId,
  startClipboardWatcher,
  stopClipboardWatcher,
  subscribeClipboardCaptureResults,
} from "./clipboard-capture";
import { suggestAiOrganization } from "./ai-organizer";
import type { DesktopStore } from "./store";

let unsubscribeClipboardCaptureResults: (() => void) | null = null;
let unsubscribeAutoCaptureSnapshots: (() => void) | null = null;

function getSafeExportName(bundleName: string) {
  const normalized = Array.from(bundleName.trim())
    .map((character) => {
      if (/[<>:"/\\|?*]/.test(character) || character.charCodeAt(0) < 32) {
        return "-";
      }

      return character;
    })
    .join("")
    .replace(/\s+/g, " ");
  const safe = normalized.slice(0, 80).trim();
  return safe || "brain-ai-context";
}

function getClipboardCaptureBoxStatus(store: DesktopStore) {
  const snapshot = store.getWorkbenchSnapshot();
  const fallbackBox = snapshot.boxes[0] ?? null;
  const targetBoxId = getClipboardCaptureBoxId();
  const targetBox =
    targetBoxId == null ? fallbackBox : snapshot.boxes.find((box) => box.id === targetBoxId) ?? fallbackBox;

  return {
    boxId: targetBox?.id ?? null,
    boxName: targetBox?.name ?? "收件箱",
  };
}

export function registerIpc(
  store: DesktopStore,
  options: { autoCaptureDirectory?: string } = {}
) {
  const autoCaptureDirectory = options.autoCaptureDirectory ?? "";

  if (!unsubscribeClipboardCaptureResults) {
    unsubscribeClipboardCaptureResults = subscribeClipboardCaptureResults((result) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.clipboardCaptureChanged, result);
        }
      });
    });
  }

  if (!unsubscribeAutoCaptureSnapshots) {
    unsubscribeAutoCaptureSnapshots = subscribeAutoCaptureSnapshots((snapshot) => {
      BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
          window.webContents.send(IPC_CHANNELS.autoCaptureChanged, snapshot);
        }
      });
    });
  }

  ipcMain.handle(IPC_CHANNELS.bootstrap, () => store.getWorkbenchSnapshot());
  ipcMain.handle(IPC_CHANNELS.getNotepadSnapshot, () => store.getNotepadSnapshot());
  ipcMain.handle(IPC_CHANNELS.createNotepadGroup, (_event, name: string) => store.createNotepadGroup(name));
  ipcMain.handle(IPC_CHANNELS.createNotepadNote, (_event, groupId: number, content: string) =>
    store.createNotepadNote(groupId, content)
  );
  ipcMain.handle(IPC_CHANNELS.getAutoCaptureSnapshot, (_event, query?: string) =>
    getAutoCaptureSnapshot(query)
  );
  ipcMain.handle(IPC_CHANNELS.startAutoCapture, (_event, nextIntervalMs?: number) =>
    startAutoCapture(nextIntervalMs)
  );
  ipcMain.handle(IPC_CHANNELS.stopAutoCapture, () => stopAutoCapture());
  ipcMain.handle(IPC_CHANNELS.pauseAutoCaptureForPrivacy, () => pauseAutoCaptureForPrivacy());
  ipcMain.handle(IPC_CHANNELS.captureDesktopNow, () => captureDesktopNow());
  ipcMain.handle(IPC_CHANNELS.searchAutoCaptures, (_event, query: string) => getAutoCaptureSnapshot(query));
  ipcMain.handle(IPC_CHANNELS.deleteAutoCaptureEntry, (_event, entryId: number) =>
    deleteAutoCaptureEntry(entryId)
  );
  ipcMain.handle(IPC_CHANNELS.clearAutoCaptures, () => clearAutoCaptures());
  ipcMain.handle(IPC_CHANNELS.getStorageUsage, () => store.getStorageUsage(autoCaptureDirectory));
  ipcMain.handle(IPC_CHANNELS.cleanupExpiredAutoCaptures, async () => {
    const result = await cleanupExpiredAutoCaptureEntries();
    return {
      usage: store.getStorageUsage(autoCaptureDirectory),
      removedFiles: result.removedFiles,
      removedBytes: result.removedBytes,
    };
  });
  ipcMain.handle(IPC_CHANNELS.cleanupOrphanedStorageFiles, () =>
    store.cleanupOrphanedStorageFiles(autoCaptureDirectory)
  );
  ipcMain.handle(IPC_CHANNELS.searchLocal, (_event, query: string, limit?: number) => store.searchLocal(query, limit));
  ipcMain.handle(IPC_CHANNELS.captureClipboardNow, () => captureClipboardNow(store));
  ipcMain.handle(IPC_CHANNELS.setClipboardWatcherEnabled, (_event, enabled: boolean) =>
    enabled ? startClipboardWatcher(store) : stopClipboardWatcher()
  );
  ipcMain.handle(IPC_CHANNELS.getClipboardWatcherStatus, () => ({
    running: isClipboardWatcherRunning(),
  }));
  ipcMain.handle(IPC_CHANNELS.setClipboardCaptureBox, (_event, boxId: number) => {
    const snapshot = store.getWorkbenchSnapshot();
    const targetBox = snapshot.boxes.find((box) => box.id === boxId) ?? snapshot.boxes[0] ?? null;
    setClipboardCaptureBoxId(targetBox?.id ?? null);
    return getClipboardCaptureBoxStatus(store);
  });
  ipcMain.handle(IPC_CHANNELS.getClipboardCaptureBox, () => getClipboardCaptureBoxStatus(store));
  ipcMain.handle(IPC_CHANNELS.captureTextOrLink, (_event, input: string) => store.captureTextOrLink(input));
  ipcMain.handle(IPC_CHANNELS.captureTextOrLinkIntoBox, (_event, input: string, boxId: number) =>
    store.captureTextOrLinkIntoBox(input, boxId)
  );
  ipcMain.handle(IPC_CHANNELS.captureImageData, (_event, dataUrl: string, title: string) =>
    store.captureImageData(dataUrl, title)
  );
  ipcMain.handle(IPC_CHANNELS.captureImageDataIntoBox, (_event, dataUrl: string, title: string, boxId: number) =>
    store.captureImageDataIntoBox(dataUrl, title, boxId)
  );
  ipcMain.handle(IPC_CHANNELS.captureDroppedPaths, (_event, paths: string[]) =>
    store.captureDroppedPaths(paths)
  );
  ipcMain.handle(IPC_CHANNELS.captureDroppedPathsIntoBox, (_event, paths: string[], boxId: number) =>
    store.captureDroppedPathsIntoBox(paths, boxId)
  );
  ipcMain.handle(IPC_CHANNELS.createBox, (_event, name: string) => store.createBox(name));
  ipcMain.handle(IPC_CHANNELS.updateBox, (_event, boxId: number, name: string, description: string) =>
    store.updateBox(boxId, name, description)
  );
  ipcMain.handle(IPC_CHANNELS.reorderBox, (_event, boxId: number, direction: "up" | "down") =>
    store.reorderBox(boxId, direction)
  );
  ipcMain.handle(IPC_CHANNELS.deleteBox, (_event, boxId: number) => store.deleteBox(boxId));
  ipcMain.handle(IPC_CHANNELS.clearBoxItems, (_event, boxId: number, kind: ClearBoxItemsKind) =>
    store.clearBoxItems(boxId, kind)
  );
  ipcMain.handle(IPC_CHANNELS.deleteItem, (_event, itemId: number) => store.deleteItem(itemId));
  ipcMain.handle(IPC_CHANNELS.updateItemTitle, (_event, itemId: number, title: string) =>
    store.updateItemTitle(itemId, title)
  );
  ipcMain.handle(IPC_CHANNELS.removeBundleEntry, (_event, itemId: number, entryPath: string) =>
    store.removeBundleEntry(itemId, entryPath)
  );
  ipcMain.handle(IPC_CHANNELS.groupItems, (_event, sourceItemId: number, targetItemId: number) =>
    store.groupItems(sourceItemId, targetItemId)
  );
  ipcMain.handle(IPC_CHANNELS.openPath, async (_event, path: string) => {
    await shell.openPath(path);
  });
  ipcMain.handle(IPC_CHANNELS.openExternal, async (_event, url: string) => {
    await shell.openExternal(url);
  });
  ipcMain.handle(IPC_CHANNELS.copyText, (_event, text: string) => {
    clipboard.writeText(text);
  });
  ipcMain.handle(IPC_CHANNELS.exportBundleAi, async (_event, bundleName: string, html: string) => {
    const defaultFileName = `${getSafeExportName(bundleName)}.html`;
    const result = await dialog.showSaveDialog({
      title: "导出给AI",
      defaultPath: defaultFileName,
      filters: [{ name: "HTML", extensions: ["html"] }],
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    await writeFile(result.filePath, html, "utf8");
    return result.filePath;
  });
  ipcMain.handle(IPC_CHANNELS.moveItemToBox, (_event, itemId: number, boxId: number) =>
    store.moveItemToBox(itemId, boxId)
  );
  ipcMain.handle(IPC_CHANNELS.moveItemToIndex, (_event, itemId: number, targetIndex: number) =>
    store.moveItemToIndex(itemId, targetIndex)
  );
  ipcMain.handle(IPC_CHANNELS.reorderItem, (_event, itemId: number, direction: "up" | "down") =>
    store.reorderItem(itemId, direction)
  );
  ipcMain.handle(IPC_CHANNELS.getBundleEntries, (_event, itemId: number) => store.getBundleEntries(itemId));
  ipcMain.handle(IPC_CHANNELS.suggestAiOrganization, (_event, boxId: number) =>
    suggestAiOrganization(store, boxId)
  );
  ipcMain.handle(IPC_CHANNELS.applyAiOrganization, (_event, suggestions: AiOrganizationSuggestion[]) =>
    store.applyAiOrganization(suggestions)
  );
  ipcMain.handle(IPC_CHANNELS.getAiProviderConfig, () => getAiProviderConfigStatus());
  ipcMain.handle(IPC_CHANNELS.saveAiProviderConfig, (_event, input: AiProviderConfigInput) =>
    saveAiProviderConfig(input)
  );
  ipcMain.handle(IPC_CHANNELS.testAiProviderConnection, (_event, input: AiProviderConfigInput) =>
    testAiProviderConnection(input)
  );
  ipcMain.handle(IPC_CHANNELS.selectBox, (_event, boxId: number) => store.selectBox(boxId));
  ipcMain.handle(IPC_CHANNELS.enrichLinkTitle, async (_event, itemId: number, url: string) => {
    try {
      const response = await fetch(url);
      const html = await response.text();
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (!match) return null;
      const title = match[1].replace(/\s+/g, " ").trim();
      return title ? store.updateLinkTitle(itemId, title) : null;
    } catch {
      return null;
    }
  });
}
