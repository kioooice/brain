import type {
  AiOrganizationSuggestion,
  AiProviderConfig,
  AiProviderConfigInput,
  AutoCaptureSnapshot,
  BundleEntry,
  ClearBoxItemsKind,
  LocalSearchResult,
  NotepadSnapshot,
  StorageUsageSnapshot,
  WorkbenchSnapshot,
} from "../shared/types";
import { matchesNormalizedSearch } from "../shared/search-normalization";
import { resolveDroppedFilePaths } from "../dropped-file-paths";
import { BoxRail } from "./box-rail";
import { MainCanvas } from "./main-canvas";
import { WorkspaceDropZone } from "./workspace-drop-zone";
import type { CSSProperties, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const IMAGE_PREVIEW_MIN_SCALE = 1;
const IMAGE_PREVIEW_MAX_SCALE = 4;
const IMAGE_PREVIEW_SCALE_STEP = 0.12;
const GLOBAL_SEARCH_RESULT_LIMIT = 8;
const NOTEPAD_DRAFT_STORAGE_KEY = "brain:notepad:draft";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getBoxPreviewKindLabel(kind: string) {
  switch (kind) {
    case "text":
      return "文本";
    case "link":
      return "链接";
    case "image":
      return "图片";
    case "file":
      return "文件";
    case "bundle":
      return "组合";
    default:
      return kind;
  }
}

function getSearchableItemText(item: WorkbenchSnapshot["items"][number]) {
  return [item.title, item.content, item.sourceUrl, item.sourcePath].filter(Boolean).join(" ").toLowerCase();
}

function getGlobalSearchPreview(item: WorkbenchSnapshot["items"][number]) {
  const source = item.kind === "file" ? item.sourcePath : item.kind === "link" ? item.sourceUrl : item.content;
  const preview = source.trim() || item.title.trim() || getBoxPreviewKindLabel(item.kind);
  return preview.length > 92 ? `${preview.slice(0, 92).trimEnd()}...` : preview;
}

function formatLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatStorageBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const formatted = value >= 10 || Number.isInteger(value) ? Math.round(value).toString() : value.toFixed(1);
  return `${formatted.replace(/\.0$/, "")} ${units[unitIndex]}`;
}

function tintBoxColor(color: string, alpha: number) {
  const normalized = color.trim();
  const hex = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
    return `rgba(244, 244, 242, ${alpha})`;
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function extractPaths(files: FileList | File[] | null | undefined) {
  return resolveDroppedFilePaths(files);
}

function extractDroppedText(dataTransfer: DataTransfer | null | undefined) {
  const uriList = dataTransfer?.getData("text/uri-list")?.trim() ?? "";
  if (uriList) {
    return (
      uriList
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#")) ?? ""
    );
  }

  return dataTransfer?.getData("text/plain")?.trim() ?? dataTransfer?.getData("text")?.trim() ?? "";
}

function extractImageFile(dataTransfer: DataTransfer | null | undefined) {
  const item = Array.from(dataTransfer?.items ?? []).find(
    (entry) => entry.kind === "file" && entry.type.startsWith("image/")
  );
  return item?.getAsFile() ?? null;
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      if (!result) {
        reject(new Error("读取图片失败"));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

type AppShellProps = {
  snapshot: WorkbenchSnapshot;
  notepadSnapshot?: NotepadSnapshot;
  autoCaptureSnapshot?: AutoCaptureSnapshot;
  onCaptureText: (input: string) => Promise<void>;
  onCreateNotepadGroup?: (name: string) => Promise<NotepadSnapshot>;
  onCreateNotepadNote?: (groupId: number, content: string) => Promise<NotepadSnapshot>;
  onStartAutoCapture?: (intervalMs: number) => Promise<void>;
  onStopAutoCapture?: () => Promise<void>;
  onPauseAutoCaptureForPrivacy?: () => Promise<void>;
  onCaptureDesktopNow?: () => Promise<void>;
  onSearchAutoCaptures?: (query: string) => Promise<void>;
  onDeleteAutoCaptureEntry?: (entryId: number) => Promise<void>;
  onClearAutoCaptures?: () => Promise<void>;
  storageUsage?: StorageUsageSnapshot | null;
  storageMaintaining?: boolean;
  onRefreshStorageUsage?: () => Promise<void>;
  onCleanupExpiredAutoCaptures?: () => Promise<void>;
  onCleanupOrphanedStorageFiles?: () => Promise<void>;
  localSearchResults?: LocalSearchResult[] | null;
  localSearchLoading?: boolean;
  onSearchLocal?: (query: string) => Promise<void>;
  onSelectBox?: (boxId: number) => Promise<void>;
  onDropPaths?: (paths: string[]) => Promise<void>;
  onDropText?: (text: string) => Promise<void>;
  onDropImage?: (dataUrl: string, title: string) => Promise<void>;
  onDropToBox?: (boxId: number, paths: string[]) => Promise<void>;
  onDropTextToBox?: (boxId: number, text: string) => Promise<void>;
  onDropImageToBox?: (boxId: number, dataUrl: string, title: string) => Promise<void>;
  onPasteImage?: (dataUrl: string, title: string) => Promise<void>;
  onCreateBox?: (name: string) => Promise<void>;
  onRenameBox?: (boxId: number, name: string, description: string) => Promise<void>;
  onDeleteBox?: (boxId: number) => Promise<void>;
  onClearBoxItems?: (boxId: number, kind: ClearBoxItemsKind) => Promise<void>;
  onDeleteItem?: (itemId: number) => Promise<void>;
  onRenameItem?: (itemId: number, title: string) => Promise<void>;
  onRemoveBundleEntry?: (itemId: number, entryPath: string) => Promise<void>;
  onOpenPath?: (path: string) => Promise<void>;
  onOpenExternal?: (url: string) => Promise<void>;
  onCopyText?: (text: string) => Promise<void>;
  onExportBundleAi?: (bundleName: string, html: string) => Promise<void>;
  onGroupItems?: (sourceItemId: number, targetItemId: number) => Promise<void>;
  onMoveItemToBox?: (itemId: number, boxId: number) => Promise<void>;
  onMoveItemsToBox?: (itemIds: number[], boxId: number) => Promise<void>;
  onDeleteItems?: (itemIds: number[]) => Promise<void>;
  onMoveItemToIndex?: (itemId: number, targetIndex: number) => Promise<void>;
  onLoadBundleEntries?: (itemId: number) => Promise<void>;
  aiOrganizationSuggestions?: AiOrganizationSuggestion[];
  aiOrganizing?: boolean;
  aiApplying?: boolean;
  onSuggestAiOrganization?: (boxId: number) => Promise<void>;
  onApplyAiOrganization?: (suggestions: AiOrganizationSuggestion[]) => Promise<void>;
  onClearAiOrganizationSuggestions?: () => void;
  aiProviderConfig?: AiProviderConfig | null;
  onSaveAiProviderConfig?: (input: AiProviderConfigInput) => Promise<void>;
  onTestAiProviderConnection?: (input: AiProviderConfigInput) => Promise<void>;
  aiTestingConnection?: boolean;
  bundleEntriesByItem?: Record<number, BundleEntry[]>;
  dropError?: string;
  clipboardWatcherRunning?: boolean;
  onToggleClipboardWatcher?: () => Promise<void>;
};

export function AppShell({
  snapshot,
  notepadSnapshot = { groups: [], notes: [] },
  autoCaptureSnapshot = {
    entries: [],
    running: false,
    paused: true,
    pauseReason: "manual",
    intervalMs: 60_000,
    lastError: "",
    ocrAvailable: false,
    ocrStatus: "等待首次识别",
  },
  onCaptureText,
  onCreateNotepadGroup = async () => notepadSnapshot,
  onCreateNotepadNote = async () => notepadSnapshot,
  onStartAutoCapture = async () => undefined,
  onStopAutoCapture = async () => undefined,
  onPauseAutoCaptureForPrivacy = async () => undefined,
  onCaptureDesktopNow = async () => undefined,
  onSearchAutoCaptures = async () => undefined,
  onDeleteAutoCaptureEntry = async () => undefined,
  onClearAutoCaptures = async () => undefined,
  storageUsage = null,
  storageMaintaining = false,
  onRefreshStorageUsage = async () => undefined,
  onCleanupExpiredAutoCaptures = async () => undefined,
  onCleanupOrphanedStorageFiles = async () => undefined,
  localSearchResults = null,
  localSearchLoading = false,
  onSearchLocal = async () => undefined,
  onSelectBox = async () => undefined,
  onDropPaths = async () => undefined,
  onDropText = async () => undefined,
  onDropImage = async () => undefined,
  onDropToBox = async () => undefined,
  onDropTextToBox = async () => undefined,
  onDropImageToBox = async () => undefined,
  onPasteImage = async () => undefined,
  onCreateBox = async () => undefined,
  onRenameBox = async () => undefined,
  onDeleteBox = async () => undefined,
  onClearBoxItems = async () => undefined,
  onDeleteItem = async () => undefined,
  onRenameItem = async () => undefined,
  onRemoveBundleEntry = async () => undefined,
  onOpenPath = async () => undefined,
  onOpenExternal = async () => undefined,
  onCopyText = async () => undefined,
  onExportBundleAi = async () => undefined,
  onGroupItems = async () => undefined,
  onMoveItemToBox = async () => undefined,
  onMoveItemsToBox = async () => undefined,
  onDeleteItems = async () => undefined,
  onMoveItemToIndex = async () => undefined,
  onLoadBundleEntries = async () => undefined,
  aiOrganizationSuggestions = [],
  aiOrganizing = false,
  aiApplying = false,
  onSuggestAiOrganization = async () => undefined,
  onApplyAiOrganization = async () => undefined,
  onClearAiOrganizationSuggestions = () => undefined,
  aiProviderConfig = null,
  onSaveAiProviderConfig = async () => undefined,
  onTestAiProviderConnection = async () => undefined,
  aiTestingConnection = false,
  bundleEntriesByItem = {},
  dropError = "",
  clipboardWatcherRunning = false,
  onToggleClipboardWatcher = async () => undefined,
}: AppShellProps) {
  const [previewImageItem, setPreviewImageItem] = useState<WorkbenchSnapshot["items"][number] | null>(null);
  const [previewImageScale, setPreviewImageScale] = useState(1);
  const [previewImageOrigin, setPreviewImageOrigin] = useState({ x: "50%", y: "50%" });
  const [activePanel, setActivePanel] = useState<"workspace" | "recent" | "notepad" | "autoCapture" | "settings" | "about">("workspace");
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(
    snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null
  );
  const [selectedNotepadGroupId, setSelectedNotepadGroupId] = useState<number | null>(
    notepadSnapshot.groups[0]?.id ?? null
  );
  const [notepadDraft, setNotepadDraft] = useState(() => {
    if (typeof window === "undefined") {
      return "";
    }

    try {
      return window.localStorage.getItem(NOTEPAD_DRAFT_STORAGE_KEY) ?? "";
    } catch {
      return "";
    }
  });
  const [newNotepadGroupName, setNewNotepadGroupName] = useState("");
  const [notepadSaving, setNotepadSaving] = useState(false);
  const [autoCaptureQuery, setAutoCaptureQuery] = useState("");
  const [autoCaptureBusy, setAutoCaptureBusy] = useState(false);
  const [previewAutoCaptureEntry, setPreviewAutoCaptureEntry] = useState<AutoCaptureSnapshot["entries"][number] | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"home" | "box">("home");
  const [creatingBox, setCreatingBox] = useState(false);
  const [newBoxName, setNewBoxName] = useState("");
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [aiApiKeyDraft, setAiApiKeyDraft] = useState("");
  const [aiBaseUrlDraft, setAiBaseUrlDraft] = useState(aiProviderConfig?.baseUrl ?? "https://api.deepseek.com");
  const [aiModelDraft, setAiModelDraft] = useState(aiProviderConfig?.model ?? "deepseek-v4-flash");
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const sortedBoxes = useMemo(
    () =>
      [...snapshot.boxes].sort((left, right) => {
        const sortOrderDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
        if (sortOrderDelta !== 0) {
          return sortOrderDelta;
        }
        return left.id - right.id;
      }),
    [snapshot.boxes]
  );

  useEffect(() => {
    setSelectedBoxId(snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null);
  }, [snapshot.panelState.selectedBoxId, snapshot.boxes]);

  useEffect(() => {
    setSelectedNotepadGroupId((current) =>
      current != null && notepadSnapshot.groups.some((group) => group.id === current)
        ? current
        : notepadSnapshot.groups[0]?.id ?? null
    );
  }, [notepadSnapshot.groups]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      if (notepadDraft) {
        window.localStorage.setItem(NOTEPAD_DRAFT_STORAGE_KEY, notepadDraft);
      } else {
        window.localStorage.removeItem(NOTEPAD_DRAFT_STORAGE_KEY);
      }
    } catch {
      // Draft persistence is best-effort; saving the note still uses the app store.
    }
  }, [notepadDraft]);

  useEffect(() => {
    if (!aiProviderConfig) {
      return;
    }

    setAiBaseUrlDraft(aiProviderConfig.baseUrl);
    setAiModelDraft(aiProviderConfig.model);
  }, [aiProviderConfig]);

  useEffect(() => {
    if (!previewImageItem) {
      setPreviewImageScale(1);
      setPreviewImageOrigin({ x: "50%", y: "50%" });
      return;
    }

    setPreviewImageScale(1);
    setPreviewImageOrigin({ x: "50%", y: "50%" });
  }, [previewImageItem?.id]);

  const currentBox = snapshot.boxes.find((box) => box.id === selectedBoxId);
  const recentStagingBox = sortedBoxes[0] ?? null;
  const recentItems = snapshot.items
    .filter((item) => item.boxId === recentStagingBox?.id && item.bundleParentId == null)
    .sort((left, right) => {
      const createdAtDelta = new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
      if (createdAtDelta !== 0) {
        return createdAtDelta;
      }
      return right.id - left.id;
    });
  const sortedNotepadGroups = useMemo(
    () =>
      [...notepadSnapshot.groups].sort((left, right) => {
        const sortOrderDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
        if (sortOrderDelta !== 0) {
          return sortOrderDelta;
        }
        return left.id - right.id;
      }),
    [notepadSnapshot.groups]
  );
  const selectedNotepadGroup = sortedNotepadGroups.find((group) => group.id === selectedNotepadGroupId);
  const currentNotepadNotes = useMemo(
    () =>
      notepadSnapshot.notes
        .filter((note) => note.groupId === selectedNotepadGroupId)
        .sort((left, right) => {
          const sortOrderDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
          if (sortOrderDelta !== 0) {
            return sortOrderDelta;
          }
          return right.id - left.id;
        }),
    [notepadSnapshot.notes, selectedNotepadGroupId]
  );
  const currentItems = snapshot.items
    .filter((item) => item.boxId === selectedBoxId && item.bundleParentId == null)
    .sort((left, right) => {
      const sortOrderDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (sortOrderDelta !== 0) {
        return sortOrderDelta;
      }
      return right.id - left.id;
    });
  const bundleItemsByItem = useMemo(() => {
    return snapshot.items
      .filter((item) => item.boxId === selectedBoxId && item.bundleParentId != null)
      .sort((left, right) => {
        const sortOrderDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
        if (sortOrderDelta !== 0) {
          return sortOrderDelta;
        }
        return left.id - right.id;
      })
      .reduce<Record<number, WorkbenchSnapshot["items"]>>((map, item) => {
        const parentId = item.bundleParentId;
        if (parentId == null) {
          return map;
        }

        map[parentId] = [...(map[parentId] ?? []), item];
        return map;
      }, {});
  }, [selectedBoxId, snapshot.items]);

  const boxPreviewById = useMemo(() => {
    return sortedBoxes.reduce<
      Record<
        number,
        {
          total: number;
          text: string[];
          kinds: string[];
        }
      >
    >((map, box) => {
      const items = snapshot.items
        .filter((item) => item.boxId === box.id)
        .sort((left, right) => {
          const sortOrderDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
          if (sortOrderDelta !== 0) {
            return sortOrderDelta;
          }
          return right.id - left.id;
        });

      map[box.id] = {
        total: items.length,
        text: items.slice(0, 3).map((item) => item.title || item.content || item.kind),
        kinds: Array.from(new Set(items.slice(0, 3).map((item) => item.kind))),
      };

      return map;
    }, {});
  }, [snapshot.items, sortedBoxes]);
  const normalizedGlobalSearchQuery = globalSearchQuery.trim().toLowerCase();
  const normalizedAutoCaptureQuery = autoCaptureQuery.trim().toLowerCase();
  const visibleAutoCaptureEntries = useMemo(() => {
    if (!normalizedAutoCaptureQuery) {
      return autoCaptureSnapshot.entries;
    }

    return autoCaptureSnapshot.entries.filter((entry) =>
      matchesNormalizedSearch(
        [entry.ocrText, entry.imagePath, entry.createdAt, formatLocalDateTime(entry.createdAt)],
        autoCaptureQuery
      )
    );
  }, [autoCaptureQuery, autoCaptureSnapshot.entries, normalizedAutoCaptureQuery]);
  const fallbackGlobalSearchResults = useMemo<LocalSearchResult[]>(() => {
    if (!normalizedGlobalSearchQuery) {
      return [];
    }

    return snapshot.items
      .filter((item) => item.bundleParentId == null && getSearchableItemText(item).includes(normalizedGlobalSearchQuery))
      .sort((left, right) => {
        const updatedAtDelta = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
        if (updatedAtDelta !== 0) {
          return updatedAtDelta;
        }
        return right.id - left.id;
      })
      .slice(0, GLOBAL_SEARCH_RESULT_LIMIT)
      .map((item) => {
        const boxName = snapshot.boxes.find((box) => box.id === item.boxId)?.name ?? "未知盒子";
        const title = item.title.trim() || getBoxPreviewKindLabel(item.kind);
        return {
          id: `workbench:${item.id}`,
          source: "workbench" as const,
          title,
          preview: getGlobalSearchPreview(item),
          boxId: item.boxId,
          boxName,
          item,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      });
  }, [normalizedGlobalSearchQuery, snapshot.boxes, snapshot.items]);
  const globalSearchResults = localSearchResults ?? fallbackGlobalSearchResults;

  async function openBox(boxId: number) {
    setSelectedBoxId(boxId);
    setWorkspaceView("box");
    await onSelectBox(boxId);
  }

  async function submitNewBox() {
    const trimmed = newBoxName.trim();
    if (!trimmed) {
      return;
    }

    await onCreateBox(trimmed);
    setNewBoxName("");
    setCreatingBox(false);
  }

  async function submitAiProviderConfig() {
    await onSaveAiProviderConfig({
      baseUrl: aiBaseUrlDraft,
      model: aiModelDraft,
      apiKey: aiApiKeyDraft.trim() || undefined,
    });
    setAiApiKeyDraft("");
  }

  async function clearAiProviderApiKey() {
    await onSaveAiProviderConfig({
      baseUrl: aiBaseUrlDraft,
      model: aiModelDraft,
      clearApiKey: true,
    });
    setAiApiKeyDraft("");
  }

  async function testAiProviderConfig() {
    await onTestAiProviderConnection({
      baseUrl: aiBaseUrlDraft,
      model: aiModelDraft,
      apiKey: aiApiKeyDraft.trim() || undefined,
    });
  }

  async function handleBoxCardDrop(boxId: number, dataTransfer: DataTransfer | null | undefined) {
    const paths = extractPaths(dataTransfer?.files);
    if (paths.length > 0) {
      await onDropToBox(boxId, paths);
      return;
    }

    const imageFile = extractImageFile(dataTransfer);
    if (imageFile) {
      const dataUrl = await readFileAsDataUrl(imageFile);
      await onDropImageToBox(boxId, dataUrl, imageFile.name || "拖入图片");
      return;
    }

    const droppedText = extractDroppedText(dataTransfer);
    if (droppedText) {
      await onDropTextToBox(boxId, droppedText);
    }
  }

  async function handleRecentItemMove(itemId: number, boxId: number) {
    if (!boxId || boxId === recentStagingBox?.id) {
      return;
    }

    await onMoveItemToBox(itemId, boxId);
  }

  async function submitNotepadNote() {
    const trimmed = notepadDraft.trim();
    const targetGroupId = selectedNotepadGroupId ?? sortedNotepadGroups[0]?.id ?? null;
    if (!trimmed || targetGroupId == null || notepadSaving) {
      return;
    }

    setNotepadSaving(true);
    try {
      await onCreateNotepadNote(targetGroupId, trimmed);
      setNotepadDraft("");
    } finally {
      setNotepadSaving(false);
    }
  }

  async function submitNotepadGroup() {
    const trimmed = newNotepadGroupName.trim();
    if (!trimmed) {
      return;
    }

    const nextSnapshot = await onCreateNotepadGroup(trimmed);
    const createdGroup = nextSnapshot.groups.find((group) => group.name === trimmed) ?? nextSnapshot.groups[0];
    setSelectedNotepadGroupId(createdGroup?.id ?? null);
    setNewNotepadGroupName("");
  }

  async function handleAutoCaptureToggle() {
    setAutoCaptureBusy(true);
    try {
      if (autoCaptureSnapshot.running) {
        await onStopAutoCapture();
      } else {
        await onStartAutoCapture(autoCaptureSnapshot.intervalMs || 60_000);
      }
    } finally {
      setAutoCaptureBusy(false);
    }
  }

  async function handleAutoCaptureNow() {
    setAutoCaptureBusy(true);
    try {
      await onCaptureDesktopNow();
    } finally {
      setAutoCaptureBusy(false);
    }
  }

  async function handleAutoCapturePrivacyPause() {
    setAutoCaptureBusy(true);
    try {
      await onPauseAutoCaptureForPrivacy();
    } finally {
      setAutoCaptureBusy(false);
    }
  }

  function handleAutoCaptureSearch(query: string) {
    setAutoCaptureQuery(query);
    void onSearchAutoCaptures(query).catch(() => undefined);
  }

  function handleGlobalSearch(query: string) {
    setGlobalSearchQuery(query);
    void onSearchLocal(query).catch(() => undefined);
  }

  function handleImagePreviewWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();

    const hostRect = event.currentTarget.getBoundingClientRect();
    const imageRect = previewViewportRef.current?.getBoundingClientRect() ?? previewImageRef.current?.getBoundingClientRect();
    const activeRect =
      imageRect && imageRect.width > 0 && imageRect.height > 0 ? imageRect : hostRect;

    if (activeRect.width <= 0 || activeRect.height <= 0) {
      return;
    }

    const nextOriginX = clamp(((event.clientX - activeRect.left) / activeRect.width) * 100, 0, 100);
    const nextOriginY = clamp(((event.clientY - activeRect.top) / activeRect.height) * 100, 0, 100);
    const step = event.deltaY < 0 ? IMAGE_PREVIEW_SCALE_STEP : -IMAGE_PREVIEW_SCALE_STEP;

    setPreviewImageScale((current) => {
      const nextScale = clamp(
        Number((current + step).toFixed(2)),
        IMAGE_PREVIEW_MIN_SCALE,
        IMAGE_PREVIEW_MAX_SCALE
      );
      return nextScale;
    });
    setPreviewImageOrigin({
      x: `${nextOriginX}%`,
      y: `${nextOriginY}%`,
    });
  }

  const workspaceHomePanel = (
    <WorkspaceDropZone
      onDropPaths={onDropPaths}
      onDropText={onDropText}
      onDropImage={onDropImage}
      onPasteText={onCaptureText}
      onPasteImage={onPasteImage}
      error={dropError}
    >
      <section className="main-canvas workspace-home-panel" aria-label="主界面盒子总览">
        <header className="canvas-header workspace-home-header">
          <div className="canvas-header-copy">
            <p className="eyebrow">主界面</p>
            <h1>盒子总览</h1>
          </div>
          <div className="clipboard-capture-status" aria-label="剪贴板收集状态">
            <button
              type="button"
              className={clipboardWatcherRunning ? "clipboard-toggle active" : "clipboard-toggle"}
              aria-pressed={clipboardWatcherRunning}
              onClick={() => void onToggleClipboardWatcher()}
            >
              自动监听：{clipboardWatcherRunning ? "开" : "关"}
            </button>
            <div className="clipboard-status-detail" aria-label="自动监听详情">
              <span>{clipboardWatcherRunning ? "监听中" : "已暂停"}</span>
              <span>进入 最近添加</span>
            </div>
          </div>
          <div className="workspace-home-actions">
            {creatingBox ? (
              <form
                className="workspace-home-create-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitNewBox();
                }}
              >
                <input
                  className="box-create-input"
                  aria-label="新盒子名称"
                  value={newBoxName}
                  onChange={(event) => setNewBoxName(event.target.value)}
                  placeholder="新盒子名称"
                  autoFocus
                />
                <button type="submit" className="box-create-button">
                  添加
                </button>
                <button
                  type="button"
                  className="box-action-button"
                  onClick={() => {
                    setCreatingBox(false);
                    setNewBoxName("");
                  }}
                >
                  取消
                </button>
              </form>
            ) : (
              <button
                type="button"
                className="workspace-home-create-button"
                aria-label="展开新建盒子"
                onClick={() => setCreatingBox(true)}
              >
                + 新建盒子
              </button>
            )}
          </div>
        </header>

        <section className="global-search-panel" aria-label="全局查找">
          <label className="global-search-field">
            <span className="canvas-filter-label">搜索全部盒子</span>
            <input
              className="global-search-input"
              aria-label="全局搜索"
              placeholder="搜标题、正文、链接或路径"
              value={globalSearchQuery}
              onChange={(event) => handleGlobalSearch(event.target.value)}
            />
          </label>
        </section>

        {normalizedGlobalSearchQuery ? (
          <section className="global-search-results" aria-label="全局搜索结果">
            {globalSearchResults.length > 0 ? (
              globalSearchResults.map((result) => {
                const sourceName = result.source === "workbench" ? result.boxName : "自动记录";
                return (
                  <button
                    key={result.id}
                    type="button"
                    className="global-search-result"
                    aria-label={`打开搜索结果 ${result.title}，位于 ${sourceName}`}
                    onClick={() => {
                      if (result.source === "autoCapture") {
                        setPreviewAutoCaptureEntry(result.entry);
                        return;
                      }

                      void openBox(result.boxId);
                    }}
                  >
                    <span className="global-search-result-kind">
                      {result.source === "workbench" ? getBoxPreviewKindLabel(result.item.kind) : "自动"}
                    </span>
                    <span className="global-search-result-copy">
                      <strong>{result.title}</strong>
                      <span>{result.preview}</span>
                    </span>
                    <span className="global-search-result-box">{sourceName}</span>
                  </button>
                );
              })
            ) : localSearchLoading ? (
              <div className="global-search-empty">
                <strong>搜索中</strong>
                <span>正在查询本地内容。</span>
              </div>
            ) : (
              <div className="global-search-empty">
                <strong>没有找到匹配内容</strong>
                <span>试试换个关键词，或进入盒子后用类型筛选。</span>
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="box-overview-grid" aria-label="盒子列表">
              {sortedBoxes.map((box) => {
                const preview = boxPreviewById[box.id];
                const heroStyle = {
                  "--box-overview-tint": tintBoxColor(box.color, 0.14),
                  "--box-overview-tint-strong": tintBoxColor(box.color, 0.22),
                } as CSSProperties;
                return (
                  <button
                    key={box.id}
                    type="button"
                    className={box.id === selectedBoxId ? "box-overview-card active" : "box-overview-card"}
                    aria-label={`打开盒子 ${box.name}`}
                    onClick={() => void openBox(box.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      void handleBoxCardDrop(box.id, event.dataTransfer);
                    }}
                  >
                    <div className="box-overview-hero" style={heroStyle}>
                      <div className="box-overview-sticker-stack" aria-hidden="true">
                        {(preview.text.length > 0 ? preview.text.slice(0, 2) : ["", ""]).map((entry, index) => (
                          <span
                            key={`${box.id}-sticker-${index}`}
                            className={index === 0 ? "box-overview-sticker sticker-primary" : "box-overview-sticker sticker-secondary"}
                          >
                            {entry}
                          </span>
                        ))}
                      </div>
                      <div className="box-overview-nameplate">
                        <strong>{box.name}</strong>
                      </div>
                      <div className="box-overview-preview" aria-hidden="true">
                        <span className="box-overview-ghost ghost-large" />
                        <span className="box-overview-ghost ghost-small" />
                      </div>
                    </div>
                    <div className="box-overview-body">
                      {preview.kinds.length > 0 ? (
                        <div className="box-overview-kinds">
                          {preview.kinds.map((kind) => (
                            <span key={`${box.id}-${kind}`} className="box-overview-kind">
                              {getBoxPreviewKindLabel(kind)}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </section>
          </>
        )}
      </section>
    </WorkspaceDropZone>
  );

  const workspaceDetailPanel = (
    <WorkspaceDropZone
      onDropPaths={onDropPaths}
      onDropText={onDropText}
      onDropImage={onDropImage}
      onPasteText={onCaptureText}
      onPasteImage={onPasteImage}
      error={dropError}
    >
      <div className="workspace-column">
        <MainCanvas
          box={currentBox}
          boxes={sortedBoxes}
          items={currentItems}
          onBackToWorkspace={() => setWorkspaceView("home")}
          bundleEntriesByItem={bundleEntriesByItem}
          onPreviewImage={setPreviewImageItem}
          onRenameBox={onRenameBox}
          onClearBoxItems={onClearBoxItems}
          onDeleteItem={onDeleteItem}
          onRenameItem={onRenameItem}
          onRemoveBundleEntry={onRemoveBundleEntry}
          onOpenPath={onOpenPath}
          onOpenExternal={onOpenExternal}
          onCopyText={onCopyText}
          onExportBundleAi={onExportBundleAi}
          onGroupItems={onGroupItems}
          onMoveItemToBox={onMoveItemToBox}
          onMoveItemsToBox={onMoveItemsToBox}
          onDeleteItems={onDeleteItems}
          onMoveItemToIndex={onMoveItemToIndex}
          onLoadBundleEntries={onLoadBundleEntries}
          aiOrganizationSuggestions={aiOrganizationSuggestions}
          aiOrganizing={aiOrganizing}
          aiApplying={aiApplying}
          onSuggestAiOrganization={onSuggestAiOrganization}
          onApplyAiOrganization={onApplyAiOrganization}
          onClearAiOrganizationSuggestions={onClearAiOrganizationSuggestions}
          bundleItemsByItem={bundleItemsByItem}
        />
      </div>
    </WorkspaceDropZone>
  );

  const workspacePanel = workspaceView === "home" ? workspaceHomePanel : workspaceDetailPanel;

  const recentPanel = (
    <section className="main-canvas recent-panel" aria-label="最近添加">
      <header className="canvas-header">
        <div className="canvas-header-copy">
          <p className="eyebrow">待分类</p>
          <h1>最近添加</h1>
        </div>
        <div className="recent-panel-meta">{recentItems.length} 条</div>
      </header>
      {recentItems.length > 0 ? (
        <div className="recent-item-list">
          {recentItems.map((item) => {
            const title = item.title.trim() || getBoxPreviewKindLabel(item.kind);
            return (
              <article key={item.id} className="recent-item-row">
                <button
                  type="button"
                  className="recent-item-main"
                  aria-label={`查看最近添加 ${title}`}
                  onClick={() => {
                    if (item.kind === "image") {
                      setPreviewImageItem(item);
                      return;
                    }

                    void openBox(item.boxId);
                  }}
                >
                  <span className="recent-item-kind">{getBoxPreviewKindLabel(item.kind)}</span>
                  <span className="recent-item-copy">
                    <strong>{title}</strong>
                    <span>{getGlobalSearchPreview(item)}</span>
                  </span>
                </button>
                <div className="recent-item-actions">
                  <label className="recent-item-move">
                    <span>分类到</span>
                    <select
                      aria-label={`分类 ${title} 到盒子`}
                      value=""
                      onChange={(event) => void handleRecentItemMove(item.id, Number(event.target.value))}
                    >
                      <option value="" disabled>
                        选择盒子
                      </option>
                      {sortedBoxes
                        .filter((box) => box.id !== recentStagingBox?.id)
                        .map((box) => (
                          <option key={box.id} value={box.id}>
                            {box.name}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="box-action-button recent-item-delete"
                    aria-label={`删除最近添加 ${title}`}
                    onClick={() => void onDeleteItem(item.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="recent-empty-state">
          <strong>这里暂时没有待分类内容</strong>
          <span>新的粘贴、拖入和剪贴板收集会先出现在这里。</span>
        </div>
      )}
    </section>
  );

  const notepadPanel = (
    <section className="main-canvas notepad-panel" aria-label="记事本">
      <header className="canvas-header">
        <div className="canvas-header-copy">
          <p className="eyebrow">快速记录</p>
          <h1>记事本</h1>
        </div>
      </header>
      <form
        className="notepad-form"
        onSubmit={(event) => {
          event.preventDefault();
          void submitNotepadNote();
        }}
      >
        <div className="notepad-layout">
          <aside className="notepad-groups" aria-label="记事本分组">
            <div className="notepad-group-list">
              {sortedNotepadGroups.map((group) => {
                const noteCount = notepadSnapshot.notes.filter((note) => note.groupId === group.id).length;
                return (
                  <button
                    key={group.id}
                    type="button"
                    className={group.id === selectedNotepadGroupId ? "notepad-group-button active" : "notepad-group-button"}
                    aria-label={`打开记事本分组 ${group.name}`}
                    onClick={() => setSelectedNotepadGroupId(group.id)}
                  >
                    <strong>{group.name}</strong>
                    <span>{noteCount} 条</span>
                  </button>
                );
              })}
            </div>
            <div className="notepad-group-create">
              <input
                className="notepad-group-input"
                aria-label="新记事本分组名称"
                value={newNotepadGroupName}
                onChange={(event) => setNewNotepadGroupName(event.target.value)}
                placeholder="新分组"
              />
              <button
                type="button"
                className="box-action-button"
                onClick={() => void submitNotepadGroup()}
                disabled={!newNotepadGroupName.trim()}
              >
                添加
              </button>
            </div>
          </aside>
          <section className="notepad-workspace" aria-label="记事本记录">
            <textarea
              className="notepad-textarea"
              aria-label="记事本内容"
              value={notepadDraft}
              onChange={(event) => setNotepadDraft(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void submitNotepadNote();
                }
              }}
              placeholder="写下一个想法..."
              autoFocus={activePanel === "notepad"}
            />
            <div className="notepad-actions">
              <span className="notepad-active-group">保存到 {selectedNotepadGroup?.name ?? "默认"}</span>
              <span className="notepad-draft-count">{notepadDraft.trim().length} 字</span>
              <button
                type="submit"
                className="box-create-button notepad-save-button"
                disabled={!notepadDraft.trim() || notepadSaving || sortedNotepadGroups.length === 0}
              >
                {notepadSaving ? "保存中" : "保存想法"}
              </button>
            </div>
            <div className="notepad-note-list" aria-label="当前分组记录">
              {currentNotepadNotes.length > 0 ? (
                currentNotepadNotes.map((note) => (
                  <article key={note.id} className="notepad-note-card">
                    <p>{note.content}</p>
                  </article>
                ))
              ) : (
                <div className="notepad-empty-state">这个分组还没有记录。</div>
              )}
            </div>
          </section>
        </div>
      </form>
    </section>
  );

  const autoCapturePaused = autoCaptureSnapshot.paused || !autoCaptureSnapshot.running;
  const autoCaptureStatusLabel = autoCaptureSnapshot.running
    ? "截取中"
    : autoCaptureSnapshot.pauseReason === "privacy"
      ? "隐私暂停中"
      : "已暂停";

  const autoCapturePanel = (
    <section className="main-canvas auto-capture-panel" aria-label="自动记录">
      <header className="canvas-header">
        <div className="canvas-header-copy">
          <p className="eyebrow">桌面快照</p>
          <h1>自动记录</h1>
        </div>
        <div className="auto-capture-actions">
          <button
            type="button"
            className={autoCaptureSnapshot.running ? "clipboard-toggle active" : "clipboard-toggle"}
            aria-pressed={autoCaptureSnapshot.running}
            onClick={() => void handleAutoCaptureToggle()}
            disabled={autoCaptureBusy}
          >
            {autoCaptureSnapshot.running ? "暂停" : "开启"}
          </button>
          <button
            type="button"
            className="box-action-button auto-capture-privacy-button"
            onClick={() => void handleAutoCapturePrivacyPause()}
            disabled={autoCaptureBusy}
          >
            隐私暂停
          </button>
          <button
            type="button"
            className="box-action-button"
            onClick={() => void handleAutoCaptureNow()}
            disabled={autoCaptureBusy || autoCapturePaused}
          >
            立即截取
          </button>
        </div>
      </header>

      <section className="auto-capture-toolbar" aria-label="自动记录控制">
        <label className="auto-capture-search">
          <span className="canvas-filter-label">搜索图片和文字</span>
          <input
            className="global-search-input"
            aria-label="搜索自动记录"
            placeholder="搜 OCR 文本、时间或图片路径"
            value={autoCaptureQuery}
            onChange={(event) => void handleAutoCaptureSearch(event.target.value)}
          />
        </label>
        <div className="auto-capture-status">
          <span>{autoCaptureStatusLabel}</span>
          <span>{Math.round(autoCaptureSnapshot.intervalMs / 1000)} 秒/次</span>
          <span>{autoCaptureSnapshot.ocrStatus || "等待 OCR"}</span>
        </div>
        <button
          type="button"
          className="box-action-button"
          onClick={() => void onClearAutoCaptures()}
          disabled={autoCaptureSnapshot.entries.length === 0}
        >
          清空
        </button>
      </section>

      {autoCaptureSnapshot.lastError ? (
        <div className="auto-capture-error" role="alert">
          {autoCaptureSnapshot.lastError}
        </div>
      ) : null}

      {visibleAutoCaptureEntries.length > 0 ? (
        <div className="auto-capture-list" aria-label="自动记录列表">
          {visibleAutoCaptureEntries.map((entry) => {
            const previewText = entry.ocrText.trim() || "暂无 OCR 文本";
            return (
              <article key={entry.id} className="auto-capture-row">
                <button
                  type="button"
                  className="auto-capture-thumb"
                  aria-label={`查看自动记录 ${formatLocalDateTime(entry.createdAt)}`}
                  onClick={() => setPreviewAutoCaptureEntry(entry)}
                >
                  <img src={entry.thumbnailUrl || entry.imageUrl} alt="自动记录缩略图" />
                </button>
                <button
                  type="button"
                  className="auto-capture-copy"
                  onClick={() => setPreviewAutoCaptureEntry(entry)}
                >
                  <strong>{formatLocalDateTime(entry.createdAt)}</strong>
                  <span>{previewText}</span>
                </button>
                <button
                  type="button"
                  className="box-action-button"
                  aria-label={`删除自动记录 ${formatLocalDateTime(entry.createdAt)}`}
                  onClick={() => void onDeleteAutoCaptureEntry(entry.id)}
                >
                  删除
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="recent-empty-state">
          <strong>{autoCaptureSnapshot.entries.length > 0 ? "没有匹配的自动记录" : "还没有自动记录"}</strong>
          <span>
            {autoCaptureSnapshot.entries.length > 0
              ? "换个 OCR 关键词、时间或图片路径再试。"
              : "开启后会定时保存桌面图片，本地 OCR 可用时会同步写入文字。"}
          </span>
        </div>
      )}
    </section>
  );

  const settingsPanel = (
    <section className="main-canvas app-static-panel" aria-label="设置">
      <header className="canvas-header">
        <div className="canvas-header-copy">
          <p className="eyebrow">设置</p>
          <h1>应用设置</h1>
        </div>
      </header>
      <div className="static-panel-grid">
        <article className="static-panel-card storage-usage-card">
          <div className="storage-card-header">
            <h2>本地占用</h2>
            <button
              type="button"
              className="box-action-button"
              onClick={() => void onRefreshStorageUsage()}
              disabled={storageMaintaining}
            >
              刷新占用
            </button>
          </div>
          <dl className="storage-usage-list" aria-label="本地占用明细">
            <div>
              <dt>数据库</dt>
              <dd>{formatStorageBytes(storageUsage?.databaseBytes ?? 0)}</dd>
            </div>
            <div>
              <dt>普通图片</dt>
              <dd>{formatStorageBytes(storageUsage?.imageBytes ?? 0)}</dd>
            </div>
            <div>
              <dt>缩略图</dt>
              <dd>{formatStorageBytes(storageUsage?.thumbnailBytes ?? 0)}</dd>
            </div>
            <div>
              <dt>自动截屏</dt>
              <dd>{formatStorageBytes(storageUsage?.autoCaptureBytes ?? 0)}</dd>
            </div>
          </dl>
          <div className="storage-total-row" aria-label="本地占用合计">
            <span>合计</span>
            <strong>{formatStorageBytes(storageUsage?.totalBytes ?? 0)}</strong>
          </div>
          <div className="storage-cleanup-actions">
            <button
              type="button"
              className="box-action-button"
              onClick={() => void onCleanupExpiredAutoCaptures()}
              disabled={storageMaintaining}
            >
              清理过期自动记录
            </button>
            <button
              type="button"
              className="box-action-button"
              onClick={() => void onCleanupOrphanedStorageFiles()}
              disabled={storageMaintaining}
            >
              清理无引用图片
            </button>
          </div>
        </article>
        <article className="static-panel-card">
          <h2>开发版菜单</h2>
          <p>当前开发版继续保留原生菜单里的文件、编辑、视图和窗口，方便调试和快捷键操作。</p>
        </article>
        <article className="static-panel-card">
          <h2>正式版策略</h2>
          <p>正式打包版会隐藏顶部原生菜单，只保留应用侧栏导航和窗口控制。</p>
        </article>
      </div>
    </section>
  );

  const aboutPanel = (
    <section className="main-canvas app-static-panel" aria-label="关于">
      <header className="canvas-header">
        <div className="canvas-header-copy">
          <p className="eyebrow">关于</p>
          <h1>Brain Desktop</h1>
        </div>
      </header>
      <div className="static-panel-grid">
        <article className="static-panel-card">
          <h2>定位</h2>
          <p>本地灵感收纳桌面版，围绕盒子、卡片、文件和图片拖入做快速整理。</p>
        </article>
        <article className="static-panel-card">
          <h2>当前形态</h2>
          <p>界面采用侧栏导航加主工作区结构，专注本地盒子、卡片和剪贴板收集。</p>
        </article>
        <article className="static-panel-card">
          <h2>快捷键</h2>
          <p>Ctrl+Shift+B 收集剪贴板；Ctrl+Alt+B 开启或关闭自动监听。</p>
        </article>
        <article className="static-panel-card ai-config-card">
          <h2>AI 接口</h2>
          <p>
            DeepSeek 用于盒子里的 AI 整理。API Key 只保存在本机，留空保存会保留原来的密钥。
          </p>
          <form
            className="ai-config-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submitAiProviderConfig();
            }}
          >
            <label className="ai-config-field">
              <span>API Key</span>
              <input
                className="ai-config-input"
                type="password"
                value={aiApiKeyDraft}
                onChange={(event) => setAiApiKeyDraft(event.target.value)}
                placeholder={
                  aiProviderConfig?.apiKeyConfigured
                    ? `已保存 ${aiProviderConfig.apiKeyPreview}，留空不变`
                    : "sk-..."
                }
                autoComplete="off"
              />
            </label>
            <label className="ai-config-field">
              <span>Base URL</span>
              <input
                className="ai-config-input"
                value={aiBaseUrlDraft}
                onChange={(event) => setAiBaseUrlDraft(event.target.value)}
                placeholder="https://api.deepseek.com"
              />
            </label>
            <label className="ai-config-field">
              <span>Model</span>
              <input
                className="ai-config-input"
                value={aiModelDraft}
                onChange={(event) => setAiModelDraft(event.target.value)}
                placeholder="deepseek-v4-flash"
              />
            </label>
            <div className="ai-config-actions">
              <span className="ai-config-status">
                {aiProviderConfig?.apiKeyConfigured ? `已配置 ${aiProviderConfig.apiKeyPreview}` : "未配置 API Key"}
              </span>
              <button type="submit" className="box-create-button">
                保存 API
              </button>
              <button
                type="button"
                className="box-action-button"
                onClick={() => void testAiProviderConfig()}
                disabled={aiTestingConnection}
              >
                {aiTestingConnection ? "测试中" : "测试连接"}
              </button>
              <button
                type="button"
                className="box-action-button"
                onClick={() => void clearAiProviderApiKey()}
              >
                清除 Key
              </button>
            </div>
          </form>
        </article>
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      <BoxRail
        boxes={snapshot.boxes}
        items={snapshot.items}
        selectedBoxId={selectedBoxId}
        activePanel={activePanel}
        onDeleteItem={onDeleteItem}
        onDeleteBox={onDeleteBox}
        onMoveItemToBox={onMoveItemToBox}
        onSelectPanel={(panel) => {
          setActivePanel(panel);
          if (panel === "workspace") {
            setWorkspaceView("home");
          }
        }}
      />
      {activePanel === "workspace"
        ? workspacePanel
        : activePanel === "recent"
          ? recentPanel
        : activePanel === "notepad"
          ? notepadPanel
        : activePanel === "autoCapture"
          ? autoCapturePanel
          : activePanel === "settings"
            ? settingsPanel
            : aboutPanel}
      {previewImageItem ? (
        <div className="workbench-image-preview-layer" aria-label="工作台图片预览层">
          <div
            className="workbench-image-preview-backdrop"
            onClick={() => setPreviewImageItem(null)}
          />
          <section className="workbench-image-preview-panel">
            <div className="workbench-image-preview-bar">
              <strong>{previewImageItem.title}</strong>
              <button
                type="button"
                className="image-preview-close"
                aria-label="关闭图片预览"
                onClick={() => setPreviewImageItem(null)}
              >
                关闭
              </button>
            </div>
            <div
              className="workbench-image-preview-stage"
              aria-label="滚轮缩放查看图片"
              tabIndex={0}
              onWheel={handleImagePreviewWheel}
            >
              <div className="image-preview-viewport" ref={previewViewportRef}>
                <img
                  ref={previewImageRef}
                  className="image-preview-full"
                  src={previewImageItem.content}
                  alt={`${previewImageItem.title} 预览大图`}
                  style={{
                    transform: `scale(${previewImageScale})`,
                    transformOrigin: `${previewImageOrigin.x} ${previewImageOrigin.y}`,
                  }}
                />
              </div>
            </div>
          </section>
        </div>
      ) : null}
      {previewAutoCaptureEntry ? (
        <div className="workbench-image-preview-layer" aria-label="自动记录图片预览层">
          <div
            className="workbench-image-preview-backdrop"
            onClick={() => setPreviewAutoCaptureEntry(null)}
          />
          <section className="workbench-image-preview-panel auto-capture-preview-panel">
            <div className="workbench-image-preview-bar">
              <strong>{formatLocalDateTime(previewAutoCaptureEntry.createdAt)}</strong>
              <button
                type="button"
                className="image-preview-close"
                aria-label="关闭自动记录预览"
                onClick={() => setPreviewAutoCaptureEntry(null)}
              >
                关闭
              </button>
            </div>
            <div className="auto-capture-preview-stage">
              <img
                className="image-preview-full"
                src={previewAutoCaptureEntry.imageUrl}
                alt="自动记录预览大图"
              />
            </div>
            <p className="auto-capture-preview-text">
              {previewAutoCaptureEntry.ocrText.trim() || "暂无 OCR 文本"}
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
