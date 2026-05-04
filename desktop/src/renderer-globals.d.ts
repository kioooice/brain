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

declare global {
  interface Window {
    brainDesktop: {
      bootstrap(): Promise<WorkbenchSnapshot>;
      getNotepadSnapshot(): Promise<NotepadSnapshot>;
      createNotepadGroup(name: string): Promise<NotepadSnapshot>;
      createNotepadNote(groupId: number, content: string): Promise<NotepadSnapshot>;
      getAutoCaptureSnapshot(query?: string): Promise<AutoCaptureSnapshot>;
      startAutoCapture(intervalMs?: number): Promise<AutoCaptureSnapshot>;
      stopAutoCapture(): Promise<AutoCaptureSnapshot>;
      pauseAutoCaptureForPrivacy(): Promise<AutoCaptureSnapshot>;
      captureDesktopNow(): Promise<AutoCaptureSnapshot>;
      searchAutoCaptures(query: string): Promise<AutoCaptureSnapshot>;
      deleteAutoCaptureEntry(entryId: number): Promise<AutoCaptureSnapshot>;
      clearAutoCaptures(): Promise<AutoCaptureSnapshot>;
      getStorageUsage(): Promise<StorageUsageSnapshot>;
      cleanupExpiredAutoCaptures(): Promise<StorageCleanupResult>;
      cleanupOrphanedStorageFiles(): Promise<StorageCleanupResult>;
      searchLocal(query: string, limit?: number): Promise<LocalSearchSnapshot>;
      onAutoCaptureChanged?(handler: (snapshot: AutoCaptureSnapshot) => void): () => void;
      getPathsForFiles(files: File[]): string[];
      onClipboardCapture?(handler: (result: ClipboardCaptureIpcResult) => void): () => void;
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
      suggestAiOrganization(boxId: number): Promise<AiOrganizationResult>;
      applyAiOrganization(suggestions: AiOrganizationSuggestion[]): Promise<WorkbenchSnapshot>;
      getAiProviderConfig(): Promise<AiProviderConfig>;
      saveAiProviderConfig(input: AiProviderConfigInput): Promise<AiProviderConfig>;
      testAiProviderConnection(input: AiProviderConfigInput): Promise<AiProviderConnectionTestResult>;
      moveItemToBox(itemId: number, boxId: number): Promise<WorkbenchSnapshot>;
      moveItemToIndex(itemId: number, targetIndex: number): Promise<WorkbenchSnapshot>;
      reorderItem(itemId: number, direction: "up" | "down"): Promise<WorkbenchSnapshot>;
      getBundleEntries(itemId: number): Promise<BundleEntry[]>;
    };
  }
}

export {};
