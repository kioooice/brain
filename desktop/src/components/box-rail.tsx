import { DragEvent, useState } from "react";
import { resolveDroppedFilePaths } from "../dropped-file-paths";
import type { Box, Item } from "../shared/types";

type BoxRailProps = {
  boxes: Box[];
  items: Item[];
  selectedBoxId: number | null;
  activePanel?: "workspace" | "settings" | "about";
  simpleMode?: boolean;
  onDeleteItem?: (itemId: number) => void | Promise<void>;
  onDeleteBox?: (boxId: number) => void | Promise<void>;
  onEnterSimpleMode?: () => void | Promise<void>;
  onExitSimpleMode?: () => void | Promise<void>;
  onCollapseSimpleMode?: () => void | Promise<void>;
  onSelectPanel?: (panel: "workspace" | "settings" | "about") => void | Promise<void>;
  onSelectBox?: (boxId: number) => void | Promise<void>;
  onDropToBox?: (boxId: number, paths: string[]) => void | Promise<void>;
  onDropTextToBox?: (boxId: number, text: string) => void | Promise<void>;
  onDropImageToBox?: (boxId: number, dataUrl: string, title: string) => void | Promise<void>;
  onMoveItemToBox?: (itemId: number, boxId: number) => void | Promise<void>;
  onReorderBox?: (boxId: number, direction: "up" | "down") => void | Promise<void>;
  onOpenBox?: (boxId: number) => void | Promise<void>;
};

const DRAGGED_ITEM_MIME = "application/x-brain-item-id";
const DRAGGED_BOX_MIME = "application/x-brain-box-id";

function extractPaths(event: DragEvent<HTMLButtonElement>) {
  return resolveDroppedFilePaths(event.dataTransfer?.files);
}

function extractDroppedText(event: DragEvent<HTMLButtonElement>) {
  const uriList = event.dataTransfer?.getData("text/uri-list")?.trim() ?? "";
  if (uriList) {
    return (
      uriList
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line && !line.startsWith("#")) ?? ""
    );
  }

  return (
    event.dataTransfer?.getData("text/plain")?.trim() ??
    event.dataTransfer?.getData("text")?.trim() ??
    ""
  );
}

function extractImageFile(event: DragEvent<HTMLElement>) {
  const item = Array.from(event.dataTransfer?.items ?? []).find(
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

function hasExternalDropPayload(event: DragEvent<HTMLElement>) {
  const transferTypes = Array.from(event.dataTransfer?.types ?? []);
  if (
    transferTypes.includes("Files") ||
    transferTypes.includes("text/plain") ||
    transferTypes.includes("text/uri-list") ||
    transferTypes.includes("text")
  ) {
    return true;
  }

  return (
    extractPaths(event as DragEvent<HTMLButtonElement>).length > 0 ||
    Boolean(extractDroppedText(event as DragEvent<HTMLButtonElement>)) ||
    Boolean(extractImageFile(event))
  );
}

function getDraggedItemValue(event: DragEvent<HTMLElement>) {
  return typeof event.dataTransfer?.getData === "function"
    ? event.dataTransfer.getData(DRAGGED_ITEM_MIME)
    : "";
}

function HomeIcon() {
  return (
    <svg
      className="simple-mode-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4.5 10.5 12 4l7.5 6.5" />
      <path d="M6.5 9.5V19h11V9.5" />
    </svg>
  );
}

function FloatingBallIcon() {
  return (
    <svg
      className="simple-mode-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="7.5" />
      <path d="M8.5 12h7" />
      <path d="M12 8.5v7" />
    </svg>
  );
}

export function BoxRail({
  boxes,
  items,
  selectedBoxId,
  activePanel = "workspace",
  simpleMode = false,
  onDeleteItem = async () => undefined,
  onDeleteBox = async () => undefined,
  onEnterSimpleMode = async () => undefined,
  onExitSimpleMode = async () => undefined,
  onCollapseSimpleMode = async () => undefined,
  onSelectPanel = async () => undefined,
  onSelectBox = async () => undefined,
  onDropToBox = async () => undefined,
  onDropTextToBox = async () => undefined,
  onDropImageToBox = async () => undefined,
  onMoveItemToBox = async () => undefined,
  onReorderBox = async () => undefined,
  onOpenBox = async () => undefined,
}: BoxRailProps) {
  const [dropTargetBoxId, setDropTargetBoxId] = useState<number | null>(null);
  const [draggedBoxId, setDraggedBoxId] = useState<number | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  const [trashActive, setTrashActive] = useState<"item" | "box" | null>(null);

  const itemCountByBoxId = items.reduce<Map<number, number>>((counts, item) => {
    counts.set(item.boxId, (counts.get(item.boxId) ?? 0) + 1);
    return counts;
  }, new Map<number, number>());
  const protectedBoxId = boxes.length > 0 ? Math.min(...boxes.map((box) => box.id)) : null;

  function canDeleteBox(boxId: number) {
    return boxes.length > 1 && boxId !== protectedBoxId;
  }

  function handleDragEnter(boxId: number, event: DragEvent<HTMLButtonElement>) {
    if (!getDraggedItemValue(event) && !hasExternalDropPayload(event)) {
      return;
    }
    event.preventDefault();
    setDropTargetBoxId(boxId);
  }

  function handleDragOver(boxId: number, event: DragEvent<HTMLButtonElement>) {
    if (!getDraggedItemValue(event) && !hasExternalDropPayload(event)) {
      return;
    }
    event.preventDefault();
    setDropTargetBoxId(boxId);
  }

  function handleDragLeave(boxId: number, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (dropTargetBoxId === boxId) {
      setDropTargetBoxId(null);
    }
  }

  async function handleDrop(boxId: number, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setDropTargetBoxId(null);

    const itemId = Number(getDraggedItemValue(event));
    if (Number.isFinite(itemId) && itemId > 0) {
      await onMoveItemToBox(itemId, boxId);
      return;
    }

    const paths = extractPaths(event);
    if (paths.length) {
      await onDropToBox(boxId, paths);
      return;
    }

    const imageFile = extractImageFile(event);
    if (imageFile) {
      const dataUrl = await readFileAsDataUrl(imageFile);
      await onDropImageToBox(boxId, dataUrl, imageFile.name || "拖入图片");
      return;
    }

    const text = extractDroppedText(event);
    if (text) {
      await onDropTextToBox(boxId, text);
    }
  }

  function handleBoxDragStart(boxId: number, event: DragEvent<HTMLButtonElement>) {
    event.dataTransfer.setData(DRAGGED_BOX_MIME, String(boxId));
    event.dataTransfer.effectAllowed = "move";
    setDraggedBoxId(boxId);
  }

  function handleBoxDragEnd() {
    setDraggedBoxId(null);
    setDraggedOverIndex(null);
  }

  function handleBoxDropSlotDragOver(index: number, event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.getData(DRAGGED_BOX_MIME)) {
      return;
    }

    event.preventDefault();
    setDraggedOverIndex(index);
  }

  async function handleBoxDropSlotDrop(index: number, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggedOverIndex(null);

    const boxId = Number(
      typeof event.dataTransfer?.getData === "function" ? event.dataTransfer.getData(DRAGGED_BOX_MIME) : ""
    );
    if (!Number.isFinite(boxId) || boxId <= 0) {
      return;
    }

    const sourceIndex = boxes.findIndex((box) => box.id === boxId);
    if (sourceIndex === -1) {
      return;
    }

    const targetIndex = index > sourceIndex ? index - 1 : index;
    if (targetIndex === sourceIndex) {
      setDraggedBoxId(null);
      return;
    }

    const direction = targetIndex > sourceIndex ? "down" : "up";
    for (let step = 0; step < Math.abs(targetIndex - sourceIndex); step += 1) {
      await onReorderBox(boxId, direction);
    }

    setDraggedBoxId(null);
  }

  function hasDragType(event: DragEvent<HTMLElement>, mime: string) {
    return Array.from(event.dataTransfer?.types ?? []).includes(mime);
  }

  function readDragData(event: DragEvent<HTMLElement>, mime: string) {
    return typeof event.dataTransfer?.getData === "function" ? event.dataTransfer.getData(mime) : "";
  }

  function handleTrashDragOver(event: DragEvent<HTMLDivElement>) {
    const itemId = Number(readDragData(event, DRAGGED_ITEM_MIME) ?? "");
    if ((Number.isFinite(itemId) && itemId > 0) || hasDragType(event, DRAGGED_ITEM_MIME)) {
      event.preventDefault();
      setTrashActive("item");
      return;
    }

    const boxId = Number(readDragData(event, DRAGGED_BOX_MIME) ?? "");
    if ((Number.isFinite(boxId) && boxId > 0 && canDeleteBox(boxId)) || hasDragType(event, DRAGGED_BOX_MIME)) {
      event.preventDefault();
      setTrashActive("box");
    }
  }

  function handleTrashDragLeave() {
    setTrashActive(null);
  }

  async function handleTrashDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setTrashActive(null);

    const itemId = Number(readDragData(event, DRAGGED_ITEM_MIME) ?? "");
    if (Number.isFinite(itemId) && itemId > 0) {
      await onDeleteItem(itemId);
      return;
    }

    const boxId = Number(readDragData(event, DRAGGED_BOX_MIME) ?? "");
    if (Number.isFinite(boxId) && boxId > 0 && canDeleteBox(boxId)) {
      await onDeleteBox(boxId);
    }
  }

  const boxList = (
    <div
      className={simpleMode ? "box-list simple-grid" : "box-list rail-box-list"}
      data-testid="rail-box-list"
      data-dragging={draggedBoxId ? "true" : "false"}
    >
      {boxes.map((box, index) => {
        const active = box.id === selectedBoxId;
        const dropTarget = box.id === dropTargetBoxId;
        const itemCount = itemCountByBoxId.get(box.id) ?? 0;

        return (
          <div key={box.id} className="box-row">
            <div
              className={draggedOverIndex === index ? "box-drop-slot active" : "box-drop-slot"}
              aria-label={`盒子放置位置 ${index + 1}`}
              onDragOver={(event) => handleBoxDropSlotDragOver(index, event)}
              onDragLeave={() => {
                if (draggedOverIndex === index) {
                  setDraggedOverIndex(null);
                }
              }}
              onDrop={(event) => void handleBoxDropSlotDrop(index, event)}
            />
            <button
              type="button"
              className={active ? "box-pill active" : "box-pill"}
              aria-label={`选择盒子 ${box.name}`}
              data-drop-target={dropTarget ? "true" : "false"}
              data-box-dragging={draggedBoxId === box.id ? "true" : "false"}
              draggable
              onClick={() => {
                void onSelectPanel("workspace");
                void onSelectBox(box.id);
              }}
              onDoubleClick={() => {
                if (!simpleMode) {
                  return;
                }
                void onOpenBox(box.id);
              }}
              onDragStart={(event) => handleBoxDragStart(box.id, event)}
              onDragEnd={handleBoxDragEnd}
              onDragEnter={(event) => handleDragEnter(box.id, event)}
              onDragOver={(event) => handleDragOver(box.id, event)}
              onDragLeave={(event) => handleDragLeave(box.id, event)}
              onDrop={(event) => void handleDrop(box.id, event)}
            >
              {simpleMode ? null : <span className="box-swatch" style={{ backgroundColor: box.color }} />}
              <span className="box-text">
                <strong>{box.name}</strong>
              </span>
              {simpleMode ? null : <span className="box-count">{String(itemCount).padStart(2, "0")}</span>}
            </button>
            {index === boxes.length - 1 ? (
              <div
                className={draggedOverIndex === boxes.length ? "box-drop-slot active" : "box-drop-slot"}
                aria-label={`盒子放置位置 ${boxes.length + 1}`}
                onDragOver={(event) => handleBoxDropSlotDragOver(boxes.length, event)}
                onDragLeave={() => {
                  if (draggedOverIndex === boxes.length) {
                    setDraggedOverIndex(null);
                  }
                }}
                onDrop={(event) => void handleBoxDropSlotDrop(boxes.length, event)}
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );

  return (
    <aside className={simpleMode ? "box-rail simple-mode" : "box-rail"} aria-label="盒子">
      {simpleMode ? null : (
        <>
          <div className="rail-header rail-app-header">
            <div className="rail-header-copy">
              <h2>Brain</h2>
            </div>
          </div>

          <div className="rail-content">
            <nav className="rail-nav" aria-label="应用导航">
              <button
                type="button"
                className={
                  activePanel === "workspace"
                    ? "rail-nav-button rail-nav-button-primary active"
                    : "rail-nav-button rail-nav-button-primary"
                }
                aria-label="打开主界面"
                onClick={() => void onSelectPanel("workspace")}
              >
                主界面
              </button>
              <button
                type="button"
                className={activePanel === "settings" ? "rail-nav-button active" : "rail-nav-button"}
                aria-label="打开设置"
                onClick={() => void onSelectPanel("settings")}
              >
                设置
              </button>
              <button
                type="button"
                className={activePanel === "about" ? "rail-nav-button active" : "rail-nav-button"}
                aria-label="打开关于"
                onClick={() => void onSelectPanel("about")}
              >
                关于
              </button>
              <button
                type="button"
                className="rail-nav-button"
                aria-label="进入简易模式"
                onClick={() => void onEnterSimpleMode()}
              >
                简易模式
              </button>
            </nav>
          </div>
        </>
      )}
      {simpleMode ? boxList : null}
      {simpleMode ? null : (
        <div className="rail-footer-tools">
          <div
            className={trashActive ? "trash-drop-zone rail-trash-drop-zone active" : "trash-drop-zone rail-trash-drop-zone"}
            aria-label="删除垃圾箱"
            data-testid="quick-panel-trash"
            data-drop-kind={trashActive ?? "idle"}
            onDragEnter={handleTrashDragOver}
            onDragOver={handleTrashDragOver}
            onDragLeave={handleTrashDragLeave}
            onDrop={(event) => void handleTrashDrop(event)}
          >
            <span className="sr-only">快速面板垃圾箱</span>
            <strong>垃圾箱</strong>
            <span>把卡片或盒子拖到这里删除</span>
          </div>
        </div>
      )}
      {simpleMode ? (
        <div className="simple-mode-footer">
          <button
            type="button"
            className="simple-mode-pin-button"
            data-testid="simple-mode-collapse-button"
            aria-label="Collapse to floating ball"
            title="Collapse to floating ball"
            onClick={() => void onCollapseSimpleMode()}
          >
            <FloatingBallIcon />
          </button>
          <button
            type="button"
            className="simple-mode-home-button"
            data-testid="simple-mode-home-button"
            aria-label="回到主界面"
            title="回到主界面"
            onClick={() => void onExitSimpleMode()}
          >
            <HomeIcon />
          </button>
        </div>
      ) : null}
    </aside>
  );
}
