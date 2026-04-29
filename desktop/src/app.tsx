import { useEffect, useRef, useState } from "react";
import { AppShell } from "./components/app-shell";
import { IPC_CHANNELS } from "./shared/ipc";
import type { BundleEntry, Item, WorkbenchSnapshot } from "./shared/types";

type Toast = {
  id: number;
  message: string;
  tone: "info" | "error";
  actionLabel?: string;
  onAction?: () => void;
};

const TOAST_DURATION_MS = 2400;
const DELETE_COMMIT_DELAY_MS = 4000;

function isMissingIpcHandlerError(cause: unknown, channel: string) {
  return cause instanceof Error && cause.message.includes(`No handler registered for '${channel}'`);
}

function extractClipboardImageFile(clipboardData: DataTransfer | null | undefined) {
  const item = Array.from(clipboardData?.items ?? []).find(
    (entry) => entry.kind === "file" && entry.type.startsWith("image/")
  );
  return item?.getAsFile() ?? null;
}

function shouldIgnorePasteTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable
  );
}

function readBlobAsDataUrl(blob: Blob) {
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
    reader.readAsDataURL(blob);
  });
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

export function App() {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null);
  const [bundleEntriesByItem, setBundleEntriesByItem] = useState<Record<number, BundleEntry[]>>({});
  const [dropError, setDropError] = useState("");
  const [clipboardWatcherRunning, setClipboardWatcherRunning] = useState(false);
  const [clipboardCaptureBoxId, setClipboardCaptureBoxId] = useState<number | null>(null);
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
        void window.brainDesktop.setClipboardCaptureBox(defaultBoxId).then((status) => {
          if (active) {
            setClipboardCaptureBoxId(status.boxId);
          }
        });
      }
    });

    window.brainDesktop.getClipboardWatcherStatus().then((status) => {
      if (active) {
        setClipboardWatcherRunning(status.running);
      }
    });

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
    if (
      !snapshot?.panelState.simpleMode ||
      (snapshot.panelState.simpleModeView !== "panel" && snapshot.panelState.simpleModeView !== "box")
    ) {
      return;
    }

    function handleExitSimpleMode(event: KeyboardEvent) {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      void window.brainDesktop.setSimpleMode(false);
    }

    window.addEventListener("keydown", handleExitSimpleMode);
    return () => {
      window.removeEventListener("keydown", handleExitSimpleMode);
    };
  }, [snapshot?.panelState.simpleMode]);

  useEffect(() => {
    if (
      !snapshot?.panelState.simpleMode ||
      (snapshot.panelState.simpleModeView !== "panel" && snapshot.panelState.simpleModeView !== "box")
    ) {
      return;
    }

    async function handleSimpleModePaste(event: ClipboardEvent) {
      if (event.defaultPrevented || shouldIgnorePasteTarget(event.target)) {
        return;
      }

      const imageFile = extractClipboardImageFile(event.clipboardData);
      if (!imageFile) {
        return;
      }

      const targetBoxId = snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null;
      if (!targetBoxId) {
        return;
      }

      event.preventDefault();
      setDropError("");

      try {
        const dataUrl = await readBlobAsDataUrl(imageFile);
        const nextSnapshot = await window.brainDesktop.captureImageDataIntoBox(
          dataUrl,
          imageFile.name || "粘贴图片",
          targetBoxId
        );
        setSnapshot(nextSnapshot);
      } catch (cause) {
        pushToast({
          message:
            cause instanceof Error ? cause.message : "图片粘贴失败",
          tone: "error",
        });
      }
    }

    window.addEventListener("paste", handleSimpleModePaste);
    return () => {
      window.removeEventListener("paste", handleSimpleModePaste);
    };
  }, [snapshot]);

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

    const title = deriveImageTitleFromUrl(input);
    const nextSnapshot =
      boxId == null
        ? await window.brainDesktop.captureImageData(input, title)
        : await window.brainDesktop.captureImageDataIntoBox(input, title, boxId);
    setSnapshot(nextSnapshot);
    return true;
  }

  async function captureTextLikeInput(input: string, boxId?: number) {
    const capturedAsImage = await captureRemoteImageUrlIntoTarget(input, boxId);
    if (capturedAsImage) {
      return;
    }

    const nextSnapshot =
      boxId == null
        ? await window.brainDesktop.captureTextOrLink(input)
        : await window.brainDesktop.captureTextOrLinkIntoBox(input, boxId);
    setSnapshot(nextSnapshot);

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

  async function handleQuickCapture(input: string) {
    await captureTextLikeInput(input);
  }

  async function handleQuickCaptureIntoBox(boxId: number, input: string) {
    await captureTextLikeInput(input, boxId);
  }

  async function handlePasteImage(dataUrl: string, title: string) {
    try {
      const nextSnapshot = await window.brainDesktop.captureImageData(dataUrl, title);
      setSnapshot(nextSnapshot);
    } catch (cause) {
      pushToast({
        message: isMissingIpcHandlerError(cause, IPC_CHANNELS.captureImageData)
          ? "图片粘贴需要完整重启一次开发进程后才能使用"
          : "图片粘贴失败",
        tone: "error",
      });
    }
  }

  async function handleDroppedImage(dataUrl: string, title: string) {
    try {
      setDropError("");
      const nextSnapshot = await window.brainDesktop.captureImageData(dataUrl, title);
      setSnapshot(nextSnapshot);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "拖放失败");
    }
  }

  async function handleDroppedImageIntoBox(boxId: number, dataUrl: string, title: string) {
    try {
      setDropError("");
      const nextSnapshot = await window.brainDesktop.captureImageDataIntoBox(dataUrl, title, boxId);
      setSnapshot(nextSnapshot);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "拖放失败");
    }
  }

  async function handleDroppedPaths(paths: string[]) {
    try {
      setDropError("");
      const nextSnapshot = await window.brainDesktop.captureDroppedPaths(paths);
      setSnapshot(nextSnapshot);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "拖放失败");
    }
  }

  async function handleDroppedPathsIntoBox(boxId: number, paths: string[]) {
    try {
      setDropError("");
      const nextSnapshot = await window.brainDesktop.captureDroppedPathsIntoBox(paths, boxId);
      setSnapshot(nextSnapshot);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "拖放失败");
    }
  }

  async function handleSelectBox(boxId: number) {
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

  async function handleSetClipboardCaptureBox(boxId: number) {
    setClipboardCaptureBoxId(boxId);
    const status = await window.brainDesktop.setClipboardCaptureBox(boxId);
    setClipboardCaptureBoxId(status.boxId);
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

  async function handleReorderBox(boxId: number, direction: "up" | "down") {
    try {
      const nextSnapshot = await window.brainDesktop.reorderBox(boxId, direction);
      setSnapshot(nextSnapshot);
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "盒子排序失败",
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
      pushToast({ message: "路径已复制" });
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

  async function handleMoveItemsToBox(itemIds: number[], boxId: number) {
    try {
      const sourceSnapshot = snapshotRef.current;
      if (!sourceSnapshot) {
        return;
      }

      const movableIds = itemIds.filter((itemId) => {
        const item = sourceSnapshot.items.find((entry) => entry.id === itemId);
        return item && item.boxId !== boxId;
      });

      if (movableIds.length === 0) {
        return;
      }

      let nextSnapshot: WorkbenchSnapshot | null = sourceSnapshot;
      for (const itemId of movableIds) {
        nextSnapshot = await window.brainDesktop.moveItemToBox(itemId, boxId);
      }

      if (!nextSnapshot) {
        return;
      }

      setSnapshot(nextSnapshot);
      const boxName = nextSnapshot.boxes.find((box) => box.id === boxId)?.name ?? "目标盒子";
      pushToast({
        message:
          movableIds.length === 1
            ? `已移动到 ${boxName}`
            : `已将 ${movableIds.length} 张卡片移动到 ${boxName}`,
      });
    } catch (cause) {
      pushToast({
        message: cause instanceof Error ? cause.message : "移动失败",
        tone: "error",
      });
    }
  }

  async function handleMoveItemToBox(itemId: number, boxId: number) {
    await handleMoveItemsToBox([itemId], boxId);
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

  async function handleExitSimpleMode() {
    await window.brainDesktop.setSimpleMode(false);
  }

  async function handleEnterSimpleMode() {
    await window.brainDesktop.setSimpleMode(true);
  }

  async function handleSetSimpleModeView(view: "ball" | "panel") {
    await window.brainDesktop.setSimpleModeView(view);
  }

  async function handleMoveFloatingBall(deltaX: number, deltaY: number) {
    await window.brainDesktop.moveFloatingBall(deltaX, deltaY);
  }

  async function handleLoadBundleEntries(itemId: number) {
    if (bundleEntriesByItem[itemId]) {
      return;
    }

    const entries = await window.brainDesktop.getBundleEntries(itemId);
    setBundleEntriesByItem((current) => ({ ...current, [itemId]: entries }));
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
        onQuickCapture={handleQuickCapture}
        onEnterSimpleMode={handleEnterSimpleMode}
        onExitSimpleMode={handleExitSimpleMode}
        onSetSimpleModeView={handleSetSimpleModeView}
        onMoveFloatingBall={handleMoveFloatingBall}
        onSelectBox={handleSelectBox}
        onDropPaths={handleDroppedPaths}
        onDropText={handleQuickCapture}
        onDropImage={handleDroppedImage}
        onDropToBox={handleDroppedPathsIntoBox}
        onDropTextToBox={handleQuickCaptureIntoBox}
        onDropImageToBox={handleDroppedImageIntoBox}
        onPasteImage={handlePasteImage}
        onCreateBox={handleCreateBox}
        onRenameBox={handleRenameBox}
        onReorderBox={handleReorderBox}
        onDeleteBox={handleDeleteBox}
        onDeleteItem={handleDeleteItem}
        onRenameItem={handleRenameItem}
        onRemoveBundleEntry={handleRemoveBundleEntry}
        onOpenPath={handleOpenPath}
        onOpenExternal={handleOpenExternal}
        onCopyText={handleCopyText}
        onExportBundleAi={handleExportBundleAi}
        onGroupItems={handleGroupItems}
        onMoveItemToBox={handleMoveItemToBox}
        onMoveItemToIndex={handleMoveItemToIndex}
        onLoadBundleEntries={handleLoadBundleEntries}
        bundleEntriesByItem={bundleEntriesByItem}
        dropError={dropError}
        clipboardWatcherRunning={clipboardWatcherRunning}
        clipboardCaptureBoxId={clipboardCaptureBoxId ?? visibleSnapshot.boxes[0]?.id ?? null}
        onToggleClipboardWatcher={handleToggleClipboardWatcher}
        onSetClipboardCaptureBox={handleSetClipboardCaptureBox}
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
