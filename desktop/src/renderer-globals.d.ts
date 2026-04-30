import type {
  BundleEntry,
  ClearBoxItemsKind,
  ClipboardCaptureBoxStatus,
  ClipboardCaptureIpcResult,
  ClipboardWatcherStatus,
  WorkbenchSnapshot,
} from "./shared/types";

declare global {
  interface Window {
    brainDesktop: {
      bootstrap(): Promise<WorkbenchSnapshot>;
      getPathsForFiles(files: File[]): string[];
      setAlwaysOnTop(enabled: boolean): Promise<WorkbenchSnapshot>;
      captureClipboardNow(): Promise<ClipboardCaptureIpcResult>;
      setClipboardWatcherEnabled(enabled: boolean): Promise<ClipboardWatcherStatus>;
      getClipboardWatcherStatus(): Promise<ClipboardWatcherStatus>;
      setClipboardCaptureBox(boxId: number): Promise<ClipboardCaptureBoxStatus>;
      getClipboardCaptureBox(): Promise<ClipboardCaptureBoxStatus>;
      captureTextOrLink(input: string): Promise<WorkbenchSnapshot>;
      captureTextOrLinkIntoBox(input: string, boxId: number): Promise<WorkbenchSnapshot>;
      captureImageData(dataUrl: string, title: string): Promise<WorkbenchSnapshot>;
      captureImageDataIntoBox(dataUrl: string, title: string, boxId: number): Promise<WorkbenchSnapshot>;
      captureDroppedPaths(paths: string[]): Promise<WorkbenchSnapshot>;
      captureDroppedPathsIntoBox(paths: string[], boxId: number): Promise<WorkbenchSnapshot>;
      createBox(name: string): Promise<WorkbenchSnapshot>;
      updateBox(boxId: number, name: string, description: string): Promise<WorkbenchSnapshot | null>;
      reorderBox(boxId: number, direction: "up" | "down"): Promise<WorkbenchSnapshot>;
      deleteBox(boxId: number): Promise<WorkbenchSnapshot>;
      clearBoxItems(boxId: number, kind: ClearBoxItemsKind): Promise<WorkbenchSnapshot>;
      deleteItem(itemId: number): Promise<WorkbenchSnapshot>;
      updateItemTitle(itemId: number, title: string): Promise<WorkbenchSnapshot | null>;
      removeBundleEntry(itemId: number, entryPath: string): Promise<WorkbenchSnapshot>;
      groupItems(sourceItemId: number, targetItemId: number): Promise<WorkbenchSnapshot>;
      selectBox(boxId: number): Promise<WorkbenchSnapshot>;
      openPath(path: string): Promise<void>;
      openExternal(url: string): Promise<void>;
      copyText(text: string): Promise<void>;
      exportBundleAi(bundleName: string, html: string): Promise<string | null>;
      enrichLinkTitle(itemId: number, url: string): Promise<WorkbenchSnapshot | null>;
      moveItemToBox(itemId: number, boxId: number): Promise<WorkbenchSnapshot>;
      moveItemToIndex(itemId: number, targetIndex: number): Promise<WorkbenchSnapshot>;
      reorderItem(itemId: number, direction: "up" | "down"): Promise<WorkbenchSnapshot>;
      getBundleEntries(itemId: number): Promise<BundleEntry[]>;
    };
  }
}

export {};
