import { DragEvent, useState } from "react";
import type { Box, Item } from "../shared/types";
import { DRAG_FEEDBACK, DROP_VISUAL, getMoveTargetStatusText } from "./drag-feedback";

type BoxRailProps = {
  boxes: Box[];
  items: Item[];
  selectedBoxId: number | null;
  activePanel?: "workspace" | "recent" | "notepad" | "autoCapture" | "settings" | "about";
  onDeleteItem?: (itemId: number) => void | Promise<void>;
  onDeleteBox?: (boxId: number) => void | Promise<void>;
  onMoveItemToBox?: (itemId: number, boxId: number) => void | Promise<void>;
  onSelectPanel?: (panel: "workspace" | "recent" | "notepad" | "autoCapture" | "settings" | "about") => void | Promise<void>;
};

const DRAGGED_ITEM_MIME = "application/x-brain-item-id";
const DRAGGED_BOX_MIME = "application/x-brain-box-id";

function readDragData(event: DragEvent<HTMLElement>, mime: string) {
  return typeof event.dataTransfer?.getData === "function" ? event.dataTransfer.getData(mime) : "";
}

function hasDragType(event: DragEvent<HTMLElement>, mime: string) {
  return Array.from(event.dataTransfer?.types ?? []).includes(mime);
}

function readDraggedItemId(event: DragEvent<HTMLElement>) {
  const itemId = Number(readDragData(event, DRAGGED_ITEM_MIME) ?? "");
  if (Number.isFinite(itemId) && itemId > 0) {
    return itemId;
  }

  return hasDragType(event, DRAGGED_ITEM_MIME) ? 0 : null;
}

export function BoxRail({
  boxes,
  items,
  activePanel = "workspace",
  onDeleteItem = async () => undefined,
  onDeleteBox = async () => undefined,
  onMoveItemToBox = async () => undefined,
  onSelectPanel = async () => undefined,
}: BoxRailProps) {
  const [trashActive, setTrashActive] = useState<"item" | "box" | null>(null);
  const [railMoveItemId, setRailMoveItemId] = useState<number | null>(null);
  const [activeMoveBoxId, setActiveMoveBoxId] = useState<number | null>(null);
  const [moveDropState, setMoveDropState] = useState<{ boxId: number; status: "moving" | "error" } | null>(null);
  const protectedBoxId = boxes.length > 0 ? Math.min(...boxes.map((box) => box.id)) : null;
  const trashHint =
    trashActive === "item"
      ? DRAG_FEEDBACK.trash.itemReady
      : trashActive === "box"
        ? DRAG_FEEDBACK.trash.boxReady
        : DRAG_FEEDBACK.trash.idle;
  const movingItem = railMoveItemId != null ? items.find((item) => item.id === railMoveItemId) ?? null : null;
  const moveTargetBoxes =
    railMoveItemId != null ? boxes.filter((box) => (movingItem ? box.id !== movingItem.boxId : true)) : [];
  const trashVisual = trashActive ? DROP_VISUAL.delete : DROP_VISUAL.idle;

  function getMoveTargetVisual(boxId: number) {
    if (moveDropState?.boxId === boxId && moveDropState.status === "error") {
      return DROP_VISUAL.error;
    }

    if (activeMoveBoxId === boxId || moveDropState?.boxId === boxId) {
      return DROP_VISUAL.move;
    }

    return DROP_VISUAL.idle;
  }

  function canDeleteBox(boxId: number) {
    return boxes.length > 1 && boxId !== protectedBoxId;
  }

  function clearMoveTargetState() {
    setRailMoveItemId(null);
    setActiveMoveBoxId(null);
    setMoveDropState(null);
  }

  function handleRailDragOver(event: DragEvent<HTMLElement>) {
    const itemId = readDraggedItemId(event);
    if (itemId == null) {
      return;
    }

    if (itemId > 0) {
      setRailMoveItemId(itemId);
    }
  }

  function handleRailDragLeave(event: DragEvent<HTMLElement>) {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }

    clearMoveTargetState();
  }

  function handleMoveBoxDragOver(boxId: number, event: DragEvent<HTMLButtonElement>) {
    const itemId = readDraggedItemId(event);
    if (itemId == null) {
      return;
    }

    event.preventDefault();
    if (itemId > 0) {
      setRailMoveItemId(itemId);
    }
    setActiveMoveBoxId(boxId);
    setMoveDropState(null);
  }

  async function handleMoveBoxDrop(boxId: number, event: DragEvent<HTMLButtonElement>) {
    event.preventDefault();

    const itemId = Number(readDragData(event, DRAGGED_ITEM_MIME) ?? "");
    if (!Number.isFinite(itemId) || itemId <= 0) {
      clearMoveTargetState();
      return;
    }

    setRailMoveItemId(itemId);
    setActiveMoveBoxId(boxId);
    setMoveDropState({ boxId, status: "moving" });

    try {
      await onMoveItemToBox(itemId, boxId);
      clearMoveTargetState();
    } catch {
      setRailMoveItemId(itemId);
      setActiveMoveBoxId(boxId);
      setMoveDropState({ boxId, status: "error" });
    }
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

  return (
    <aside
      className="box-rail"
      aria-label="盒子"
      onDragEnter={handleRailDragOver}
      onDragOver={handleRailDragOver}
      onDragLeave={handleRailDragLeave}
    >
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
            className={activePanel === "recent" ? "rail-nav-button active" : "rail-nav-button"}
            aria-label="打开最近添加"
            onClick={() => void onSelectPanel("recent")}
          >
            最近添加
          </button>
          <button
            type="button"
            className={activePanel === "notepad" ? "rail-nav-button active" : "rail-nav-button"}
            aria-label="打开记事本"
            onClick={() => void onSelectPanel("notepad")}
          >
            记事本
          </button>
          <button
            type="button"
            className={activePanel === "autoCapture" ? "rail-nav-button active" : "rail-nav-button"}
            aria-label="打开自动记录"
            onClick={() => void onSelectPanel("autoCapture")}
          >
            自动记录
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
        </nav>
        {moveTargetBoxes.length > 0 ? (
          <section className="rail-move-targets" aria-label={DRAG_FEEDBACK.moveTarget.panelLabel}>
            <div className="rail-move-targets-heading">
              <strong>{DRAG_FEEDBACK.moveTarget.panelLabel}</strong>
              <span>{DRAG_FEEDBACK.moveTarget.panelHint}</span>
            </div>
            <div className="rail-move-target-list">
              {moveTargetBoxes.map((box) => (
                <button
                  key={box.id}
                  type="button"
                  className="rail-move-target"
                  aria-label={`移动到盒子 ${box.name}`}
                  data-drop-state={moveDropState?.boxId === box.id ? moveDropState.status : "idle"}
                  data-drop-visual={getMoveTargetVisual(box.id)}
                  onDragOver={(event) => handleMoveBoxDragOver(box.id, event)}
                  onDragLeave={() => {
                    if (activeMoveBoxId === box.id) {
                      setActiveMoveBoxId(null);
                    }
                  }}
                  onDrop={(event) => void handleMoveBoxDrop(box.id, event)}
                >
                  <span className="box-swatch" style={{ backgroundColor: box.color }} />
                  <span className="rail-move-target-copy">
                    <strong>{box.name}</strong>
                    <span>
                      {moveDropState?.boxId === box.id && moveDropState.status === "moving"
                        ? getMoveTargetStatusText("moving")
                        : moveDropState?.boxId === box.id && moveDropState.status === "error"
                          ? getMoveTargetStatusText("error")
                          : activeMoveBoxId === box.id
                            ? getMoveTargetStatusText("ready")
                            : getMoveTargetStatusText("idle")}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </div>

      <div className="rail-footer-tools">
        <div
          className="trash-drop-zone rail-trash-drop-zone"
          aria-label="删除垃圾箱"
          data-testid="rail-trash"
          data-drop-kind={trashActive ?? "idle"}
          data-drop-visual={trashVisual}
          onDragEnter={handleTrashDragOver}
          onDragOver={handleTrashDragOver}
          onDragLeave={handleTrashDragLeave}
          onDrop={(event) => void handleTrashDrop(event)}
        >
          <span className="sr-only">侧边栏垃圾箱</span>
          <strong>垃圾箱</strong>
          <span>{trashHint}</span>
        </div>
      </div>
    </aside>
  );
}
