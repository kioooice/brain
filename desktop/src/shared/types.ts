export type Box = {
  id: number;
  name: string;
  color: string;
  description: string;
  sortOrder: number;
};

export type ItemKind = "text" | "link" | "image" | "file" | "bundle";
export type ClearBoxItemsKind = "all" | ItemKind;

export type Item = {
  id: number;
  boxId: number;
  bundleParentId?: number | null;
  kind: ItemKind;
  title: string;
  content: string;
  sourceUrl: string;
  sourcePath: string;
  thumbnailUrl?: string;
  bundleCount: number;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BundleEntry = {
  entryPath: string;
  entryKind: "file" | "folder";
  sortOrder: number;
  exists: boolean;
};

export type BundleMemberItem = Item;

export type PanelState = {
  selectedBoxId: number | null;
};

export type WorkbenchSnapshot = {
  boxes: Box[];
  items: Item[];
  panelState: PanelState;
};

export type NotepadGroup = {
  id: number;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type NotepadNote = {
  id: number;
  groupId: number;
  content: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type NotepadSnapshot = {
  groups: NotepadGroup[];
  notes: NotepadNote[];
};

export type AutoCaptureEntry = {
  id: number;
  imagePath: string;
  imageUrl: string;
  thumbnailUrl?: string;
  ocrText: string;
  createdAt: string;
};

export type AutoCapturePauseReason = "manual" | "privacy" | null;

export type AutoCaptureSnapshot = {
  entries: AutoCaptureEntry[];
  running: boolean;
  paused: boolean;
  pauseReason: AutoCapturePauseReason;
  intervalMs: number;
  lastError: string;
  ocrAvailable: boolean;
  ocrStatus: string;
};

export type StorageUsageSnapshot = {
  databaseBytes: number;
  imageBytes: number;
  thumbnailBytes: number;
  autoCaptureBytes: number;
  totalBytes: number;
};

export type StorageCleanupResult = {
  usage: StorageUsageSnapshot;
  removedFiles: number;
  removedBytes: number;
};

export type WorkbenchLocalSearchResult = {
  id: string;
  source: "workbench";
  title: string;
  preview: string;
  boxId: number;
  boxName: string;
  item: Item;
  createdAt: string;
  updatedAt: string;
};

export type AutoCaptureLocalSearchResult = {
  id: string;
  source: "autoCapture";
  title: string;
  preview: string;
  entry: AutoCaptureEntry;
  createdAt: string;
};

export type LocalSearchResult = WorkbenchLocalSearchResult | AutoCaptureLocalSearchResult;

export type LocalSearchSnapshot = {
  query: string;
  results: LocalSearchResult[];
};

export type ClipboardCaptureIpcResult = {
  captured: boolean;
  kind: "text" | "image" | "empty";
  reason: string;
  snapshot?: WorkbenchSnapshot;
};

export type ClipboardWatcherStatus = {
  running: boolean;
  reason?: string;
};

export type ClipboardCaptureBoxStatus = {
  boxId: number | null;
  boxName: string;
};

export type AiOrganizationSuggestion = {
  itemId: number;
  suggestedTitle: string;
  targetBoxId: number | null;
  targetBoxName: string;
  createBox: boolean;
  confidence: number;
  reason: string;
};

export type AiOrganizationResult = {
  ok: boolean;
  reason: string;
  model?: string;
  suggestions: AiOrganizationSuggestion[];
};

export type AiProviderConfig = {
  provider: "deepseek";
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  apiKeyPreview: string;
};

export type AiProviderConfigInput = {
  baseUrl: string;
  model: string;
  apiKey?: string;
  clearApiKey?: boolean;
};

export type AiProviderConnectionTestResult = {
  ok: boolean;
  reason: string;
  model?: string;
};
