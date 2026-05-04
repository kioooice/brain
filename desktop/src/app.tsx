import { useEffect, useRef, useState } from "react";
import { AppShell } from "./components/app-shell";
import { IPC_CHANNELS } from "./shared/ipc";
import { redactSensitiveText } from "./shared/sensitive-redaction";
import type {
  AiOrganizationSuggestion,
  AiProviderConfig,
  AiProviderConfigInput,
  AiProviderConnectionTestResult,
  AutoCaptureSnapshot,
  BundleEntry,
  ClearBoxItemsKind,
  Item,
  LocalSearchResult,
  NotepadSnapshot,
  StorageCleanupResult,
  StorageUsageSnapshot,
  WorkbenchSnapshot,
} from "./shared/types";

type Toast = {
  id: number;
  message: string;
  tone: "info" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

const TOAST_DURATION_MS = 2400;
const DELETE_COMMIT_DELAY_MS = 4000;
const LOCAL_SEARCH_RESULT_LIMIT = 8;

function isMissingIpcHandlerError(cause: unknown, channel: string) {
  return cause instanceof Error && cause.message.includes(`No handler registered for '${channel}'`);
}

function deriveImageTitleFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const segments = pathname.split("/").filter(Boolean);
    const segment = segments[segments.length - 1];
    return segment ? decodeURIComponent(segment) : "拖入图片";
  } catch {
    return "拖入图片";
  }
}

function isHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isImageLikeUrl(value: string) {
  try {
    const url = new URL(value);
    return /\.(png|jpe?g|gif|webp|bmp|svg|ico|avif)(?:$|\?)/i.test(url.pathname + url.search);
  } catch {
    return false;
  }
}

function getSafeErrorMessage(cause: unknown, fallback: string, explicitSecrets: Array<string | null | undefined> = []) {
  return cause instanceof Error ? redactSensitiveText(cause.message, explicitSecrets) : fallback;
}

function getTopLevelItemCount(snapshot: WorkbenchSnapshot) {
  return snapshot.items.filter((item) => item.bundleParentId == null).length;
}

function getBoxName(snapshot: WorkbenchSnapshot, boxId: number | null | undefined) {
  return snapshot.boxes.find((box) => box.id === boxId)?.name ?? "当前盒子";
}

function getRecentStagingBoxId(snapshot: WorkbenchSnapshot | null) {
  return snapshot?.boxes[0]?.id ?? null;
}

function getCapturedItemCount(item: Item) {
  return item.kind === "bundle" && item.bundleCount > 0 ? item.bundleCount : 1;
}

function getStorageCleanupMessage(result: StorageCleanupResult) {
  if (result.removedFiles === 0) {
    return "没有可清理的文件";
  }

  return `已清理 ${result.removedFiles} 个文件`;
}

export function App() {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null);
  const [notepadSnapshot, setNotepadSnapshot] = useState<NotepadSnapshot | null>(null);
  const [autoCaptureSnapshot, setAutoCaptureSnapshot] = useState<AutoCaptureSnapshot | null>(null);
  const [bundleEntriesByItem, setBundleEntriesByItem] = useState<Record<number, BundleEntry[]>>({});
  const [dropError, setDropError] = useState("");
  const [clipboardWatcherRunning, setClipboardWatcherRunning] = useState(false);
  const [aiOrganizationSuggestions, setAiOrganizationSuggestions] = useState<AiOrganizationSuggestion[]>([]);
  const [aiOrganizing, setAiOrganizing] = useState(false);
  const [aiApplying, setAiApplying] = useState(false);
  const [aiProviderConfig, setAiProviderConfig] = useState<AiProviderConfig | null>(null);
  const [aiTestingConnection, setAiTestingConnection] = useState(false);
  const [storageUsage, setStorageUsage] = useState<StorageUsageSnapshot | null>(null);
  const [storageMaintaining, setStorageMaintaining] = useState(false);
  const [localSearchResults, setLocalSearchResults] = useState<LocalSearchResult[] | null>(null);
  const [localSearchLoading, setLocalSearchLoading] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [pendingDeleteItems, setPendingDeleteItems] = useState<Record<number, Item>>({});
  const nextToastIdRef = useRef(1);
  const toastTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pendingDeleteItemsRef = useRef<Record<number, Item>>({});
  const snapshotRef = useRef<WorkbenchSnapshot | null>(null);
  const nextDeleteBatchIdRef = useRef(1);
  const pendingDeleteBatchTimersRef = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const pendingDeleteBatchItemsRef = useRef<Record<number, number[]>>({});

  useEffect(() => {
    let active = true;

    window.brainDesktop.bootstrap().then((loadedSnapshot) => {
      if (active) {
        setSnapshot(loadedSnapshot);
      }
      const defaultBoxId = loadedSnapshot.boxes[0]?.id ?? null;
      if (defaultBoxId != null) {
        void window.brainDesktop.setClipboardCaptureBox(defaultBoxId).catch(() => undefined);
      }
    });

    window.brainDesktop.getNotepadSnapshot().then((loadedNotepadSnapshot) => {
      if (active) {
        setNotepadSnapshot(loadedNotepadSnapshot);
      }
    });

    window.brainDesktop.getClipboardWatcherStatus().then((status) => {
      if (active) {
        setClipboardWatcherRunning(status.running);
      }
    });

    window.brainDesktop
      .getAutoCaptureSnapshot()
      .then((loadedAutoCaptureSnapshot) => {
        if (active) {
          setAutoCaptureSnapshot(loadedAutoCaptureSnapshot);
        }
      })
      .catch(() => undefined);

    window.brainDesktop
      .getAiProviderConfig()
      .then((config) => {
        if (active) {
          setAiProviderConfig(config);
        }
      })
      .catch(() => undefined);

    window.brainDesktop
      .getStorageUsage()
      .then((usage) => {
        if (active) {
          setStorageUsage(usage);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      window.brainDesktop
        .getClipboardWatcherStatus()
        .then((status) => setClipboardWatcherRunning(status.running))
        .catch(() => undefined);
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    return window.brainDesktop.onClipboardCapture?.((result) => {
      if (result.snapshot) {
        setSnapshot(result.snapshot);
      }
    });
  }, []);

  useEffect(() => {
    return window.brainDesktop.onAutoCaptureChanged?.((nextSnapshot) => {
      setAutoCaptureSnapshot(nextSnapshot);
    });
  }, []);

  useEffect(() => {
    pendingDeleteItemsRef.current = pendingDeleteItems;
  }, [pendingDeleteItems]);

  useEffect(() => {
    snapshotRef.current = snapshot;
  }, [snapshot]);

  useEffect(() => {
    return () => {
      Object.values(toastTimersRef.current).forEach((timer) => clearTimeout(timer));
      Object.values(pendingDeleteBatchTimersRef.current).forEach((timer) => clearTimeout(timer));
    };
  }, []);

  function dismissToast(toastId: number) {
    const timer = toastTimersRef.current[toastId];
    if (timer) {
      clearTimeout(timer);
      delete toastTimersRef.current[toastId];
    }
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  function pushToast({
    message,
    tone = "info",
    duration = TOAST_DURATION_MS,
    actionLabel,
    onAction,
  }: {
    message: string;
    tone?: Toast["tone"];
    duration?: number;
    actionLabel?: string;
    onAction?: () => void;
  }) {
    const id = nextToastIdRef.current++;
    setToasts((current) => [...current, { id, message, tone, actionLabel, onAction }]);

    if (duration > 0) {
      toastTimersRef.current[id] = setTimeout(() => {
        dismissToast(id);
      }, duration);
    }

    return id;
  }

  function reportCaptureFeedback(
    previousSnapshot: WorkbenchSnapshot | null,
    nextSnapshot: WorkbenchSnapshot,
    targetBoxId?: number,
    attemptedCount = 1
  ) {
    if (!previousSnapshot) {
      return;
    }

    const previousItemCount = getTopLevelItemCount(previousSnapshot);
    const nextItemCount = getTopLevelItemCount(nextSnapshot);

    if (nextItemCount > previousItemCount) {
      const previousItemIds = new Set(previousSnapshot.items.map((item) => item.id));
      const createdItems = nextSnapshot.items.filter(
        (item) => item.bundleParentId == null && !previousItemIds.has(item.id)
      );
      const createdItem = createdItems[0] ?? nextSnapshot.items.find((item) => item.bundleParentId == null);
      const createdCount =
        createdItems.length > 0
          ? createdItems.reduce((count, item) => count + getCapturedItemCount(item), 0)
          : 1;
      const skippedCount = Math.max(attemptedCount - createdCount, 0);
      const boxName = getBoxName(
        nextSnapshot,
        createdItem?.boxId ?? targetBoxId ?? nextSnapshot.panelState.selectedBoxId
      );
      if (skippedCount > 0) {
        const message = `已收集 ${createdCount} 个到 ${boxName}，跳过 ${skippedCount} 个`;
        pushToast({ message });
        return;
      }
      const message = createdCount > 1 ? `已收集 ${createdCount} 个到 ${boxName}` : `已收集到 ${boxName}`;
      pushToast({
        message,
      });
      return;
    }

    if (nextItemCount === previousItemCount) {
      const message = attemptedCount > 1 ? `重复内容，已跳过 ${attemptedCount} 个` : "重复内容，已跳过";
      pushToast({
        message,
        duration: 2200,
      });
    }
  }

  function clearPendingDeletes(itemIds: number[]) {
    setPendingDeleteItems((current) => {
      const next = { ...current };
      let changed = false;

      itemIds.forEach((itemId) => {
        if (next[itemId]) {
          delete next[itemId];
          changed = true;
        }
      });

      if (!changed) {
        return current;
      }
      return next;
    });
  }

  function restorePendingDeleteBatch(batchId: number) {
    const timer = pendingDeleteBatchTimersRef.current[batchId];
    if (timer) {
      clearTimeout(timer);
      delete pendingDeleteBatchTimersRef.current[batchId];
    }

    const itemIds = pendingDeleteBatchItemsRef.current[batchId] ?? [];
    delete pendingDeleteBatchItemsRef.current[batchId];
    clearPendingDeletes(itemIds);
  }

  async function captureRemoteImageUrlIntoTarget(input: string, boxId?: number) {
    if (!isHttpUrl(input) || !isImageLikeUrl(input)) {
      return false;
    }

    const previousSnapshot = snapshotRef.current ?? snapshot;
    const targetBoxId = boxId ?? getRecentStagingBoxId(previousSnapshot);
    const title = deriveImageTitleFromUrl(input);
    const nextSnapshot =
      targetBoxId == null
        ? await window.brainDesktop.captureImageData(input, title)
        : await window.brainDesktop.captureImageDataIntoBox(input, title, targetBoxId);
    setSnapshot(nextSnapshot);
    reportCaptureFeedback(previousSnapshot, nextSnapshot, targetBoxId);
    return true;
  }

  async function captureTextLikeInput(input: string, boxId?: number) {
    const capturedAsImage = await captureRemoteImageUrlIntoTarget(input, boxId);
    if (capturedAsImage) {
      return;
    }

    const previousSnapshot = snapshotRef.current ?? snapshot;
    const targetBoxId = boxId ?? getRecentStagingBoxId(previousSnapshot);
    const nextSnapshot =
      targetBoxId == null
        ? await window.brainDesktop.captureTextOrLink(input)
        : await window.brainDesktop.captureTextOrLinkIntoBox(input, targetBoxId);
    setSnapshot(nextSnapshot);
    reportCaptureFeedback(previousSnapshot, nextSnapshot, targetBoxId);

    const createdItem = nextSnapshot.items[0];
    if (createdItem?.kind !== "link" || !createdItem.sourceUrl) {
      return;
    }

    const enrichedSnapshot = await window.brainDesktop.enrichLinkTitle(
      createdItem.id,
      createdItem.sourceUrl
    );
    if (enrichedSnapshot) {
      setSnapshot(enrichedSnapshot);
    }
  }

  async function handleCaptureText(input: string) {
    await captureTextLikeInput(input);
  }

  async function handleCaptureTextIntoBox(boxId: number, input: string) {
    await captureTextLikeInput(input, boxId);
  }

  async function handlePasteImage(dataUrl: string, title: string) {
    try {
      const previousSnapshot = snapshotRef.current ?? snapshot;
      const targetBoxId = getRecentStagingBoxId(previousSnapshot);
      const nextSnapshot =
        targetBoxId == null
          ? await window.brainDesktop.captureImageData(dataUrl, title)
          : await window.brainDesktop.captureImageDataIntoBox(dataUrl, title, targetBoxId);
      setSnapshot(nextSnapshot);
      reportCaptureFeedback(previousSnapshot, nextSnapshot, targetBoxId ?? undefined);
    } catch (cause) {
      pushToast({
        message: isMissingIpcHandlerError(cause, IPC_CHANNELS.captureImageData)
          || isMissingIpcHandlerError(cause, IPC_CHANNELS.captureImageDataIntoBox)
          ? "图片粘贴需要完整重启一次开发进程后才能使用"
          : "图片粘贴失败",
        tone: "error",
      });
    }
  }

  async function handleDroppedImage(dataUrl: string, title: string) {
    try {
      setDropError("");
      const previousSnapshot = snapshotRef.current ?? snapshot;
      const targetBoxId = getRecentStagingBoxId(previousSnapshot);
      const nextSnapshot =
        targetBoxId == null
          ? await window.brainDesktop.captureImageData(dataUrl, title)
          : await window.brainDesktop.captureImageDataIntoBox(dataUrl, title, targetBoxId);
      setSnapshot(nextSnapshot);
      reportCaptureFeedback(previousSnapshot, nextSnapshot, targetBoxId ?? undefined);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "拖放失败");
    }
  }

  async function handleDroppedImageIntoBox(boxId: number, dataUrl: string, title: string) {
    try {
      setDropError("");
      const previousSnapshot = snapshotRef.current ?? snapshot;
      const nextSnapshot = await window.brainDesktop.captureImageDataIntoBox(dataUrl, title, boxId);
      setSnapshot(nextSnapshot);
      reportCaptureFeedback(previousSnapshot, nextSnapshot, boxId);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "拖放失败");
    }
  }

  async function handleDroppedPaths(paths: string[]) {
    try {
      setDropError("");
      const previousSnapshot = snapshotRef.current ?? snapshot;
      const targetBoxId = getRecentStagingBoxId(previousSnapshot);
      const nextSnapshot =
        targetBoxId == null
          ? await window.brainDesktop.captureDroppedPaths(paths)
          : await window.brainDesktop.captureDroppedPathsIntoBox(paths, targetBoxId);
      setSnapshot(nextSnapshot);
      reportCaptureFeedback(previousSnapshot, nextSnapshot, targetBoxId ?? undefined, paths.length);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "拖放失败");
    }
  }

  async function handleDroppedPathsIntoBox(boxId: number, paths: string[]) {
    try {
      setDropError("");
      const previousSnapshot = snapshotRef.current ?? snapshot;
      const nextSnapshot = await window.brainDesktop.captureDroppedPathsIntoBox(paths, boxId);
      setSnapshot(nextSnapshot);
      reportCaptureFeedback(previousSnapshot, nextSnapshot, boxId, paths.length);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "拖放失败");
    }
  }

  async function handleSelectBox(boxId: number) {
    setAiOrganizationSuggestions([]);
    setSnapshot((current) =>
      current
        ? {
            ...current,
            panelState: {
              ...current.panelState,
              selectedBoxId: boxId,
            },
          }
        : current
    );
    const nextSnapshot = await window.brainDesktop.selectBox(boxId);
    setSnapshot(nextSnapshot);
  }

  async function handleToggleClipboardWatcher() {
    const status = await window.brainDesktop.setClipboardWatcherEnabled(!clipboardWatcherRunning);
    setClipboardWatcherRunning(status.running);
  }

  async function handleCreateNotepadGroup(name: string) {
    try {
      const nextSnapshot = await window.brainDesktop.createNotepadGroup(name);
      setNotepadSnapshot(nextSnapshot);
      pushToast({ message: `已创建记事本分组 ${name}` });
      return nextSnapshot;
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "创建记事本分组失败",
        tone: "error",
      });
      throw cause;
    }
  }

  async function handleCreateNotepadNote(groupId: number, content: string) {
    try {
      const nextSnapshot = await window.brainDesktop.createNotepadNote(groupId, content);
      setNotepadSnapshot(nextSnapshot);
      const groupName = nextSnapshot.groups.find((group) => group.id === groupId)?.name ?? "当前分组";
      pushToast({ message: `已保存到记事本：${groupName}` });
      return nextSnapshot;
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "保存记事本失败",
        tone: "error",
      });
      throw cause;
    }
  }

  async function handleCreateBox(name: string) {
    try {
      const nextSnapshot = await window.brainDesktop.createBox(name);
      setSnapshot(nextSnapshot);
      pushToast({ message: `已创建 ${name}` });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "创建盒子失败",
        tone: "error",
      });
    }
  }

  async function handleRenameBox(boxId: number, name: string, description: string) {
    try {
      const nextSnapshot = await window.brainDesktop.updateBox(boxId, name, description);
      if (!nextSnapshot) {
        pushToast({ message: "更新盒子失败", tone: "error" });
        return;
      }
      setSnapshot(nextSnapshot);
      pushToast({ message: `已更新 ${name}` });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "更新盒子失败",
        tone: "error",
      });
    }
  }

  async function handleDeleteBox(boxId: number) {
    try {
      const sourceSnapshot = snapshotRef.current ?? snapshot;
      if (!sourceSnapshot) {
        return;
      }

      const box = sourceSnapshot.boxes.find((entry) => entry.id === boxId);
      if (!box) {
        return;
      }

      const fallbackBox = sourceSnapshot.boxes.reduce((current, candidate) =>
        candidate.id < current.id ? candidate : current
      );
      const movedCount = sourceSnapshot.items.filter((item) => item.boxId === boxId).length;
      const nextSnapshot = await window.brainDesktop.deleteBox(boxId);
      setSnapshot(nextSnapshot);

      pushToast({
        message:
          movedCount > 0
            ? `已删除 ${box.name}，并将 ${movedCount} 张卡片移到 ${fallbackBox.name}`
            : `已删除 ${box.name}`,
      });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "删除盒子失败",
        tone: "error",
      });
    }
  }

  async function handleClearBoxItems(boxId: number, kind: ClearBoxItemsKind) {
    try {
      const nextSnapshot = await window.brainDesktop.clearBoxItems(boxId, kind);
      setSnapshot(nextSnapshot);
      setBundleEntriesByItem((current) => {
        const remainingItemIds = new Set(nextSnapshot.items.map((item) => item.id));
        const next = { ...current };
        Object.keys(next).forEach((itemId) => {
          if (!remainingItemIds.has(Number(itemId))) {
            delete next[Number(itemId)];
          }
        });
        return next;
      });
      const boxName = nextSnapshot.boxes.find((box) => box.id === boxId)?.name ?? "当前盒子";
      pushToast({ message: `已清空 ${boxName}` });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "清空盒子失败",
        tone: "error",
      });
    }
  }

  async function handleDeleteItems(itemIds: number[]) {
    const sourceSnapshot = snapshotRef.current;
    const pendingDeleteMap = pendingDeleteItemsRef.current;
    if (!sourceSnapshot) {
      return;
    }

    const deleteItems = itemIds
      .map((itemId) => sourceSnapshot.items.find((entry) => entry.id === itemId))
      .filter((item): item is Item => Boolean(item) && !pendingDeleteMap[item.id]);

    if (deleteItems.length === 0) {
      return;
    }

    const deleteItemIds = deleteItems.map((item) => item.id);
    const batchId = nextDeleteBatchIdRef.current++;
    pendingDeleteBatchItemsRef.current[batchId] = deleteItemIds;

    setPendingDeleteItems((current) => ({
      ...current,
      ...Object.fromEntries(deleteItems.map((item) => [item.id, item])),
    }));

    const toastId = pushToast({
      message: deleteItems.length === 1 ? `已删除 ${deleteItems[0].title}` : `已删除 ${deleteItems.length} 张卡片`,
      actionLabel: "撤销",
      onAction: () => restorePendingDeleteBatch(batchId),
      duration: DELETE_COMMIT_DELAY_MS,
    });

    pendingDeleteBatchTimersRef.current[batchId] = setTimeout(async () => {
      try {
        let nextSnapshot: WorkbenchSnapshot | null = snapshotRef.current;

        for (const itemId of deleteItemIds) {
          nextSnapshot = await window.brainDesktop.deleteItem(itemId);
        }

        if (nextSnapshot) {
          setSnapshot(nextSnapshot);
        }

        setBundleEntriesByItem((current) => {
          const next = { ...current };
          deleteItemIds.forEach((itemId) => {
            delete next[itemId];
          });
          return next;
        });
      } catch (cause) {
        pushToast({
          message: cause instanceof Error ? cause.message : "删除失败",
          tone: "error",
        });
      } finally {
        delete pendingDeleteBatchTimersRef.current[batchId];
        delete pendingDeleteBatchItemsRef.current[batchId];
        clearPendingDeletes(deleteItemIds);
        dismissToast(toastId);
      }
    }, DELETE_COMMIT_DELAY_MS);
  }

  async function handleDeleteItem(itemId: number) {
    await handleDeleteItems([itemId]);
  }

  async function handleBulkDeleteItems(itemIds: number[]) {
    await handleDeleteItems(itemIds);
  }

  async function handleOpenPath(path: string) {
    try {
      await window.brainDesktop.openPath(path);
      pushToast({ message: "已在系统中打开" });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "打开失败",
        tone: "error",
      });
    }
  }

  async function handleOpenExternal(url: string) {
    try {
      await window.brainDesktop.openExternal(url);
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "打开链接失败",
        tone: "error",
      });
    }
  }

  async function handleCopyText(text: string) {
    try {
      await window.brainDesktop.copyText(text);
      pushToast({ message: "已复制" });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "复制失败",
        tone: "error",
      });
    }
  }

  async function handleExportBundleAi(bundleName: string, html: string) {
    try {
      const savedPath = await window.brainDesktop.exportBundleAi(bundleName, html);
      if (!savedPath) {
        return;
      }

      pushToast({ message: `已导出给AI：${savedPath}` });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "导出给AI失败",
        tone: "error",
      });
    }
  }

  async function handleRenameItem(itemId: number, title: string) {
    try {
      const nextSnapshot = await window.brainDesktop.updateItemTitle(itemId, title);
      if (!nextSnapshot) {
        pushToast({ message: "重命名失败", tone: "error" });
        return;
      }

      setSnapshot(nextSnapshot);
      pushToast({ message: `已重命名为 ${title}` });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "重命名失败",
        tone: "error",
      });
    }
  }

  async function handleRemoveBundleEntry(itemId: number, entryPath: string) {
    try {
      const nextSnapshot = await window.brainDesktop.removeBundleEntry(itemId, entryPath);
      setSnapshot(nextSnapshot);
      setBundleEntriesByItem((current) => ({
        ...current,
        [itemId]: (current[itemId] ?? []).filter((entry) => entry.entryPath !== entryPath),
      }));
      pushToast({ message: `已移除 ${entryPath}` });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "移除失败",
        tone: "error",
      });
    }
  }

  async function handleGroupItems(sourceItemId: number, targetItemId: number) {
    try {
      const nextSnapshot = await window.brainDesktop.groupItems(sourceItemId, targetItemId);
      setSnapshot(nextSnapshot);
      pushToast({ message: "已组合卡片" });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "组合失败",
        tone: "error",
      });
    }
  }

  async function handleMoveItemToIndex(itemId: number, targetIndex: number) {
    try {
      const nextSnapshot = await window.brainDesktop.moveItemToIndex(itemId, targetIndex);
      setSnapshot(nextSnapshot);
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "排序失败",
        tone: "error",
      });
    }
  }

  async function handleLoadBundleEntries(itemId: number) {
    if (bundleEntriesByItem[itemId]) {
      return;
    }

    const entries = await window.brainDesktop.getBundleEntries(itemId);
    setBundleEntriesByItem((current) => ({ ...current, [itemId]: entries }));
  }

  async function handleSuggestAiOrganization(boxId: number) {
    try {
      setAiOrganizing(true);
      const result = await window.brainDesktop.suggestAiOrganization(boxId);
      if (!result.ok) {
        pushToast({ message: result.reason, tone: "error", duration: 4200 });
        setAiOrganizationSuggestions([]);
        return;
      }

      setAiOrganizationSuggestions(result.suggestions);
      pushToast({
        message:
          result.suggestions.length > 0
            ? `已生成 ${result.suggestions.length} 条 AI 整理建议`
            : result.reason,
        duration: 2600,
      });
    } catch (cause) {
      pushToast({
        message: getSafeErrorMessage(cause, "AI 整理失败"),
        tone: "error",
        duration: 4200,
      });
    } finally {
      setAiOrganizing(false);
    }
  }

  async function handleApplyAiOrganization(suggestions: AiOrganizationSuggestion[]) {
    if (suggestions.length === 0) {
      return;
    }

    try {
      setAiApplying(true);
      const nextSnapshot = await window.brainDesktop.applyAiOrganization(suggestions);
      setSnapshot(nextSnapshot);
      setAiOrganizationSuggestions([]);
      pushToast({ message: `已应用 ${suggestions.length} 条 AI 整理建议` });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "应用 AI 整理失败",
        tone: "error",
        duration: 4200,
      });
    } finally {
      setAiApplying(false);
    }
  }

  async function handleSaveAiProviderConfig(input: AiProviderConfigInput) {
    try {
      const nextConfig = await window.brainDesktop.saveAiProviderConfig(input);
      setAiProviderConfig(nextConfig);
      pushToast({ message: input.clearApiKey ? "DeepSeek API Key 已清除" : "DeepSeek API 配置已保存" });
    } catch (cause) {
      pushToast({
        message: getSafeErrorMessage(cause, "保存 AI 配置失败", [input.apiKey]),
        tone: "error",
        duration: 4200,
      });
    }
  }

  async function handleMoveItemToBox(itemId: number, boxId: number) {
    try {
      const nextSnapshot = await window.brainDesktop.moveItemToBox(itemId, boxId);
      setSnapshot(nextSnapshot);
      const boxName = nextSnapshot.boxes.find((box) => box.id === boxId)?.name ?? "目标盒子";
      pushToast({ message: `已移到 ${boxName}` });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "移动失败",
        tone: "error",
      });
      throw cause;
    }
  }

  async function handleMoveItemsToBox(itemIds: number[], boxId: number) {
    if (itemIds.length === 0) {
      return;
    }

    try {
      let nextSnapshot: WorkbenchSnapshot | null = snapshotRef.current ?? snapshot;

      for (const itemId of itemIds) {
        nextSnapshot = await window.brainDesktop.moveItemToBox(itemId, boxId);
      }

      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
      }

      const boxName = nextSnapshot?.boxes.find((box) => box.id === boxId)?.name ?? "目标盒子";
      pushToast({ message: itemIds.length === 1 ? `已移到 ${boxName}` : `已将 ${itemIds.length} 张卡片移到 ${boxName}` });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "批量移动失败",
        tone: "error",
      });
      throw cause;
    }
  }

  async function handleTestAiProviderConnection(input: AiProviderConfigInput) {
    try {
      setAiTestingConnection(true);
      const result: AiProviderConnectionTestResult = await window.brainDesktop.testAiProviderConnection(input);
      pushToast({
        message: result.reason,
        tone: result.ok ? "info" : "error",
        duration: result.ok ? 2600 : 4200,
      });
    } catch (cause) {
      pushToast({
        message: getSafeErrorMessage(cause, "测试 AI 连接失败", [input.apiKey]),
        tone: "error",
        duration: 4200,
      });
    } finally {
      setAiTestingConnection(false);
    }
  }

  async function handleStartAutoCapture(intervalMs: number) {
    try {
      const nextSnapshot = await window.brainDesktop.startAutoCapture(intervalMs);
      setAutoCaptureSnapshot(nextSnapshot);
    } catch (cause) {
      pushToast({
        message: getSafeErrorMessage(cause, "开启自动记录失败"),
        tone: "error",
        duration: 4200,
      });
    }
  }

  async function handleStopAutoCapture() {
    const nextSnapshot = await window.brainDesktop.stopAutoCapture();
    setAutoCaptureSnapshot(nextSnapshot);
  }

  async function handlePauseAutoCaptureForPrivacy() {
    const nextSnapshot = await window.brainDesktop.pauseAutoCaptureForPrivacy();
    setAutoCaptureSnapshot(nextSnapshot);
  }

  async function handleCaptureDesktopNow() {
    const nextSnapshot = await window.brainDesktop.captureDesktopNow();
    setAutoCaptureSnapshot(nextSnapshot);
  }

  async function handleSearchAutoCaptures() {
    const nextSnapshot = await window.brainDesktop.getAutoCaptureSnapshot();
    setAutoCaptureSnapshot(nextSnapshot);
  }

  async function handleSearchLocal(query: string) {
    const trimmed = query.trim();
    if (!trimmed) {
      setLocalSearchResults(null);
      return;
    }

    setLocalSearchLoading(true);
    try {
      const result = await window.brainDesktop.searchLocal(trimmed, LOCAL_SEARCH_RESULT_LIMIT);
      setLocalSearchResults(result.results);
    } catch {
      setLocalSearchResults([]);
    } finally {
      setLocalSearchLoading(false);
    }
  }

  async function handleDeleteAutoCaptureEntry(entryId: number) {
    const nextSnapshot = await window.brainDesktop.deleteAutoCaptureEntry(entryId);
    setAutoCaptureSnapshot(nextSnapshot);
  }

  async function handleClearAutoCaptures() {
    const nextSnapshot = await window.brainDesktop.clearAutoCaptures();
    setAutoCaptureSnapshot(nextSnapshot);
    await handleRefreshStorageUsage();
  }

  async function handleRefreshStorageUsage() {
    const usage = await window.brainDesktop.getStorageUsage();
    setStorageUsage(usage);
  }

  async function handleCleanupExpiredAutoCaptures() {
    setStorageMaintaining(true);
    try {
      const result = await window.brainDesktop.cleanupExpiredAutoCaptures();
      setStorageUsage(result.usage);
      const nextSnapshot = await window.brainDesktop.getAutoCaptureSnapshot();
      setAutoCaptureSnapshot(nextSnapshot);
      pushToast({ message: getStorageCleanupMessage(result) });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "清理过期自动记录失败",
        tone: "error",
      });
    } finally {
      setStorageMaintaining(false);
    }
  }

  async function handleCleanupOrphanedStorageFiles() {
    setStorageMaintaining(true);
    try {
      const result = await window.brainDesktop.cleanupOrphanedStorageFiles();
      setStorageUsage(result.usage);
      pushToast({ message: getStorageCleanupMessage(result) });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "清理无引用图片失败",
        tone: "error",
      });
    } finally {
      setStorageMaintaining(false);
    }
  }

  if (!snapshot) {
    return <div className="app-loading">正在加载 Brain Desktop...</div>;
  }

  const visibleSnapshot: WorkbenchSnapshot = {
    ...snapshot,
    items: snapshot.items.filter((item) => !pendingDeleteItems[item.id]),
  };

  return (
    <>
      <AppShell
        snapshot={visibleSnapshot}
        notepadSnapshot={notepadSnapshot ?? { groups: [], notes: [] }}
        autoCaptureSnapshot={autoCaptureSnapshot ?? {
          entries: [],
          running: false,
          paused: true,
          pauseReason: "manual",
          intervalMs: 60_000,
          lastError: "",
          ocrAvailable: false,
          ocrStatus: "等待首次识别",
        }}
        onCaptureText={handleCaptureText}
        onCreateNotepadGroup={handleCreateNotepadGroup}
        onCreateNotepadNote={handleCreateNotepadNote}
        onStartAutoCapture={handleStartAutoCapture}
        onStopAutoCapture={handleStopAutoCapture}
        onPauseAutoCaptureForPrivacy={handlePauseAutoCaptureForPrivacy}
        onCaptureDesktopNow={handleCaptureDesktopNow}
        onSearchAutoCaptures={handleSearchAutoCaptures}
        onDeleteAutoCaptureEntry={handleDeleteAutoCaptureEntry}
        onClearAutoCaptures={handleClearAutoCaptures}
        storageUsage={storageUsage}
        storageMaintaining={storageMaintaining}
        onRefreshStorageUsage={handleRefreshStorageUsage}
        onCleanupExpiredAutoCaptures={handleCleanupExpiredAutoCaptures}
        onCleanupOrphanedStorageFiles={handleCleanupOrphanedStorageFiles}
        localSearchResults={localSearchResults}
        localSearchLoading={localSearchLoading}
        onSearchLocal={handleSearchLocal}
        onSelectBox={handleSelectBox}
        onDropPaths={handleDroppedPaths}
        onDropText={handleCaptureText}
        onDropImage={handleDroppedImage}
        onDropToBox={handleDroppedPathsIntoBox}
        onDropTextToBox={handleCaptureTextIntoBox}
        onDropImageToBox={handleDroppedImageIntoBox}
        onPasteImage={handlePasteImage}
        onCreateBox={handleCreateBox}
        onRenameBox={handleRenameBox}
        onDeleteBox={handleDeleteBox}
        onClearBoxItems={handleClearBoxItems}
        onDeleteItem={handleDeleteItem}
        onDeleteItems={handleBulkDeleteItems}
        onRenameItem={handleRenameItem}
        onRemoveBundleEntry={handleRemoveBundleEntry}
        onOpenPath={handleOpenPath}
        onOpenExternal={handleOpenExternal}
        onCopyText={handleCopyText}
        onExportBundleAi={handleExportBundleAi}
        onGroupItems={handleGroupItems}
        onMoveItemToBox={handleMoveItemToBox}
        onMoveItemsToBox={handleMoveItemsToBox}
        onMoveItemToIndex={handleMoveItemToIndex}
        onLoadBundleEntries={handleLoadBundleEntries}
        aiOrganizationSuggestions={aiOrganizationSuggestions}
        aiOrganizing={aiOrganizing}
        aiApplying={aiApplying}
        onSuggestAiOrganization={handleSuggestAiOrganization}
        onApplyAiOrganization={handleApplyAiOrganization}
        onClearAiOrganizationSuggestions={() => setAiOrganizationSuggestions([])}
        aiProviderConfig={aiProviderConfig}
        onSaveAiProviderConfig={handleSaveAiProviderConfig}
        onTestAiProviderConnection={handleTestAiProviderConnection}
        aiTestingConnection={aiTestingConnection}
        bundleEntriesByItem={bundleEntriesByItem}
        dropError={dropError}
        clipboardWatcherRunning={clipboardWatcherRunning}
        onToggleClipboardWatcher={handleToggleClipboardWatcher}
      />
      {toasts.length ? (
        <div className="toast-stack" aria-live="polite" aria-label="工作台通知">
          {toasts.map((toast) => (
            <div key={toast.id} className={`toast-card tone-${toast.tone}`}>
              <span>{toast.message}</span>
              {toast.actionLabel ? (
                <button
                  type="button"
                  className="toast-action"
                  aria-label="撤销删除"
                  onClick={() => {
                    toast.onAction?.();
                    dismissToast(toast.id);
                  }}
                >
                  {toast.actionLabel}
                </button>
              ) : (
                <button
                  type="button"
                  className="toast-dismiss"
                  aria-label={`关闭 ${toast.message}`}
                  onClick={() => dismissToast(toast.id)}
                >
                  关闭
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
