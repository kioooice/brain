import { DragEvent, useState } from "react";
import type { Box, Item } from "../shared/types";

type BoxRailProps = {
  boxes: Box[];
  items: Item[];
  selectedBoxId: number | null;
  activePanel?: "workspace" | "settings" | "about";
  onDeleteItem?: (itemId: number) => void | Promise<void>;
  onDeleteBox?: (boxId: number) => void | Promise<void>;
  onSelectPanel?: (panel: "workspace" | "settings" | "about") => void | Promise<void>;
};

const DRAGGED_ITEM_MIME = "application/x-brain-item-id";
const DRAGGED_BOX_MIME = "application/x-brain-box-id";

function readDragData(event: DragEvent<HTMLElement>, mime: string) {
  return typeof event.dataTransfer?.getData === "function" ? event.dataTransfer.getData(mime) : "";
}

function hasDragType(event: DragEvent<HTMLElement>, mime: string) {
  return Array.from(event.dataTransfer?.types ?? []).includes(mime);
}

export function BoxRail({
  boxes,
  activePanel = "workspace",
  onDeleteItem = async () => undefined,
  onDeleteBox = async () => undefined,
  onSelectPanel = async () => undefined,
}: BoxRailProps) {
  const [trashActive, setTrashActive] = useState<"item" | "box" | null>(null);
  const protectedBoxId = boxes.length > 0 ? Math.min(...boxes.map((box) => box.id)) : null;

  function canDeleteBox(boxId: number) {
    return boxes.length > 1 && boxId !== protectedBoxId;
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
    <aside className="box-rail" aria-label="盒子">
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
        </nav>
      </div>

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
    </aside>
  );
}
