import type { BundleEntry, WorkbenchSnapshot } from "../shared/types";
import { resolveDroppedFilePaths } from "../dropped-file-paths";
import { BoxRail } from "./box-rail";
import { MainCanvas } from "./main-canvas";
import { WorkspaceDropZone } from "./workspace-drop-zone";
import type { CSSProperties, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";

const FLOATING_BALL_DRAG_THRESHOLD_PX = 6;
const IMAGE_PREVIEW_MIN_SCALE = 1;
const IMAGE_PREVIEW_MAX_SCALE = 4;
const IMAGE_PREVIEW_SCALE_STEP = 0.12;

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

function FloatingBallIcon() {
  return (
    <svg
      className="simple-mode-ball-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 8.4v7.2" />
      <path d="M8.4 12h7.2" />
    </svg>
  );
}

function getPointerScreenPosition(event: {
  screenX: number;
  screenY: number;
  clientX: number;
  clientY: number;
}) {
  return {
    x: event.screenX,
    y: event.screenY,
  };
}

type AppShellProps = {
  snapshot: WorkbenchSnapshot;
  onQuickCapture: (input: string) => Promise<void>;
  onEnterSimpleMode?: () => Promise<void>;
  onExitSimpleMode?: () => Promise<void>;
  onSetSimpleModeView?: (view: "ball" | "panel") => Promise<void>;
  onMoveFloatingBall?: (deltaX: number, deltaY: number) => Promise<void>;
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
  onReorderBox?: (boxId: number, direction: "up" | "down") => Promise<void>;
  onDeleteBox?: (boxId: number) => Promise<void>;
  onDeleteItem?: (itemId: number) => Promise<void>;
  onRenameItem?: (itemId: number, title: string) => Promise<void>;
  onRemoveBundleEntry?: (itemId: number, entryPath: string) => Promise<void>;
  onOpenPath?: (path: string) => Promise<void>;
  onOpenExternal?: (url: string) => Promise<void>;
  onCopyText?: (text: string) => Promise<void>;
  onExportBundleAi?: (bundleName: string, html: string) => Promise<void>;
  onGroupItems?: (sourceItemId: number, targetItemId: number) => Promise<void>;
  onMoveItemToBox?: (itemId: number, boxId: number) => Promise<void>;
  onMoveItemToIndex?: (itemId: number, targetIndex: number) => Promise<void>;
  onLoadBundleEntries?: (itemId: number) => Promise<void>;
  bundleEntriesByItem?: Record<number, BundleEntry[]>;
  dropError?: string;
};

export function AppShell({
  snapshot,
  onQuickCapture,
  onEnterSimpleMode = async () => undefined,
  onExitSimpleMode = async () => undefined,
  onSetSimpleModeView = async () => undefined,
  onMoveFloatingBall = async () => undefined,
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
  onReorderBox = async () => undefined,
  onDeleteBox = async () => undefined,
  onDeleteItem = async () => undefined,
  onRenameItem = async () => undefined,
  onRemoveBundleEntry = async () => undefined,
  onOpenPath = async () => undefined,
  onOpenExternal = async () => undefined,
  onCopyText = async () => undefined,
  onExportBundleAi = async () => undefined,
  onGroupItems = async () => undefined,
  onMoveItemToBox = async () => undefined,
  onMoveItemToIndex = async () => undefined,
  onLoadBundleEntries = async () => undefined,
  bundleEntriesByItem = {},
  dropError = "",
}: AppShellProps) {
  const [previewImageItem, setPreviewImageItem] = useState<WorkbenchSnapshot["items"][number] | null>(null);
  const [previewImageScale, setPreviewImageScale] = useState(1);
  const [previewImageOrigin, setPreviewImageOrigin] = useState({ x: "50%", y: "50%" });
  const [activePanel, setActivePanel] = useState<"workspace" | "settings" | "about">("workspace");
  const [selectedBoxId, setSelectedBoxId] = useState<number | null>(
    snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null
  );
  const [workspaceView, setWorkspaceView] = useState<"home" | "box">("home");
  const [creatingBox, setCreatingBox] = useState(false);
  const [newBoxName, setNewBoxName] = useState("");
  const floatingBallGestureRef = useRef<{
    active: boolean;
    dragged: boolean;
    originX: number;
    originY: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const suppressFloatingBallClickRef = useRef(false);
  const previewViewportRef = useRef<HTMLDivElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const simpleMode = Boolean(snapshot.panelState.simpleMode);
  const simpleModeView = snapshot.panelState.simpleModeView ?? "ball";
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
    if (!previewImageItem) {
      setPreviewImageScale(1);
      setPreviewImageOrigin({ x: "50%", y: "50%" });
      return;
    }

    setPreviewImageScale(1);
    setPreviewImageOrigin({ x: "50%", y: "50%" });
  }, [previewImageItem?.id]);

  const currentBox = snapshot.boxes.find((box) => box.id === selectedBoxId);
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
      onPasteText={onQuickCapture}
      onPasteImage={onPasteImage}
      error={dropError}
    >
      <section className="main-canvas workspace-home-panel" aria-label="主界面盒子总览">
        <header className="canvas-header workspace-home-header">
          <div className="canvas-header-copy">
            <p className="eyebrow">主界面</p>
            <h1>盒子总览</h1>
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
      </section>
    </WorkspaceDropZone>
  );

  const workspaceDetailPanel = (
    <WorkspaceDropZone
      onDropPaths={onDropPaths}
      onDropText={onDropText}
      onDropImage={onDropImage}
      onPasteText={onQuickCapture}
      onPasteImage={onPasteImage}
      error={dropError}
    >
      <div className="workspace-column">
        <MainCanvas
          box={currentBox}
          items={currentItems}
          bundleEntriesByItem={bundleEntriesByItem}
          onBackToWorkspace={() => setWorkspaceView("home")}
          onPreviewImage={setPreviewImageItem}
          onRenameBox={onRenameBox}
          onRenameItem={onRenameItem}
          onRemoveBundleEntry={onRemoveBundleEntry}
          onOpenPath={onOpenPath}
          onOpenExternal={onOpenExternal}
          onCopyText={onCopyText}
          onExportBundleAi={onExportBundleAi}
          onGroupItems={onGroupItems}
          onMoveItemToIndex={onMoveItemToIndex}
          onLoadBundleEntries={onLoadBundleEntries}
          bundleItemsByItem={bundleItemsByItem}
        />
      </div>
    </WorkspaceDropZone>
  );

  const workspacePanel = workspaceView === "home" ? workspaceHomePanel : workspaceDetailPanel;

  const settingsPanel = (
    <section className="main-canvas app-static-panel" aria-label="设置">
      <header className="canvas-header">
        <div className="canvas-header-copy">
          <p className="eyebrow">设置</p>
          <h1>应用设置</h1>
        </div>
      </header>
      <div className="static-panel-grid">
        <article className="static-panel-card">
          <h2>开发版菜单</h2>
          <p>当前开发版继续保留原生菜单里的文件、编辑、视图和窗口，方便调试和快捷键操作。</p>
        </article>
        <article className="static-panel-card">
          <h2>正式版策略</h2>
          <p>正式打包版会隐藏顶部原生菜单，只保留应用侧栏导航和窗口控制。</p>
        </article>
        <article className="static-panel-card">
          <h2>简易模式</h2>
          <p>简易模式保留为侧栏入口，进入后只显示盒子面板，适合作为桌面悬浮收纳板。</p>
          <button type="button" className="card-action-button" onClick={() => void onEnterSimpleMode()}>
            进入简易模式
          </button>
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
          <p>界面采用侧栏导航加主工作区结构，简易模式作为独立的悬浮收纳入口。</p>
        </article>
      </div>
    </section>
  );

  function handleFloatingBallPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    if (event.button !== 0) {
      return;
    }

    const origin = getPointerScreenPosition(event);

    floatingBallGestureRef.current = {
      active: true,
      dragged: false,
      originX: origin.x,
      originY: origin.y,
      lastX: origin.x,
      lastY: origin.y,
    };

    function handlePointerMove(pointerEvent: PointerEvent) {
      const gesture = floatingBallGestureRef.current;
      if (!gesture?.active) {
        return;
      }

      const nextPosition = getPointerScreenPosition(pointerEvent);

      const totalDeltaX = nextPosition.x - gesture.originX;
      const totalDeltaY = nextPosition.y - gesture.originY;
      if (
        !gesture.dragged &&
        Math.hypot(totalDeltaX, totalDeltaY) < FLOATING_BALL_DRAG_THRESHOLD_PX
      ) {
        return;
      }

      const deltaX = nextPosition.x - gesture.lastX;
      const deltaY = nextPosition.y - gesture.lastY;
      if (deltaX === 0 && deltaY === 0) {
        return;
      }

      gesture.dragged = true;
      gesture.lastX = nextPosition.x;
      gesture.lastY = nextPosition.y;
      suppressFloatingBallClickRef.current = true;
      void onMoveFloatingBall(deltaX, deltaY);
    }

    function handlePointerUp() {
      floatingBallGestureRef.current = null;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
  }

  if (simpleMode && simpleModeView === "ball") {
    return (
      <div className="app-shell simple-mode simple-mode-ball-view">
        <div className="simple-mode-floating-ball-shell" data-testid="simple-mode-floating-ball-shell">
          <button
            type="button"
            className="simple-mode-floating-ball"
            data-testid="simple-mode-floating-ball"
            aria-label="Open simple mode panel"
            onPointerDown={handleFloatingBallPointerDown}
            onClick={() => {
              if (suppressFloatingBallClickRef.current) {
                suppressFloatingBallClickRef.current = false;
                return;
              }
              void onSetSimpleModeView("panel");
            }}
          >
            <FloatingBallIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={simpleMode ? "app-shell simple-mode" : "app-shell"}>
      {simpleMode ? <div className="simple-mode-drag-strip" aria-hidden="true" /> : null}
      <BoxRail
        boxes={snapshot.boxes}
        items={snapshot.items}
        selectedBoxId={selectedBoxId}
        activePanel={activePanel}
        simpleMode={simpleMode}
        onDeleteItem={onDeleteItem}
        onDeleteBox={onDeleteBox}
        onEnterSimpleMode={onEnterSimpleMode}
        onExitSimpleMode={onExitSimpleMode}
        onCollapseSimpleMode={() => void onSetSimpleModeView("ball")}
        onSelectPanel={(panel) => {
          setActivePanel(panel);
          if (panel === "workspace") {
            setWorkspaceView("home");
          }
        }}
        onSelectBox={onSelectBox}
        onDropToBox={onDropToBox}
        onDropTextToBox={onDropTextToBox}
        onDropImageToBox={onDropImageToBox}
        onMoveItemToBox={onMoveItemToBox}
        onReorderBox={onReorderBox}
      />
      {simpleMode ? null : activePanel === "workspace" ? workspacePanel : activePanel === "settings" ? settingsPanel : aboutPanel}
      {previewImageItem && !simpleMode ? (
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
    </div>
  );
}
