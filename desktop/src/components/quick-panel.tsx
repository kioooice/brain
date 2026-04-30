import { DragEvent, useMemo, useState } from "react";
import type { Box, Item } from "../shared/types";

const DRAGGED_ITEM_MIME = "application/x-brain-item-id";
const DRAGGED_BOX_MIME = "application/x-brain-box-id";

function hasDragType(event: DragEvent<HTMLElement>, mime: string) {
  return Array.from(event.dataTransfer?.types ?? []).includes(mime);
}

function readDragData(event: DragEvent<HTMLElement>, mime: string) {
  return typeof event.dataTransfer?.getData === "function" ? event.dataTransfer.getData(mime) : "";
}

type QuickPanelProps = {
  items: Item[];
  boxes: Box[];
  open: boolean;
  onDeleteItem?: (itemId: number) => void | Promise<void>;
  onDeleteBox?: (boxId: number) => void | Promise<void>;
};

export function QuickPanel({
  items,
  boxes,
  open,
  onDeleteItem = async () => undefined,
  onDeleteBox = async () => undefined,
}: QuickPanelProps) {
  const [trashActive, setTrashActive] = useState<"item" | "box" | null>(null);

  function handleRecentItemDragStart(event: DragEvent<HTMLElement>, itemId: number) {
    event.dataTransfer.setData(DRAGGED_ITEM_MIME, String(itemId));
    event.dataTransfer.effectAllowed = "move";
  }

  function getKindLabel(kind: Item["kind"]) {
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

  const recentItems = items
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(left.updatedAt || left.createdAt || "") || 0;
      const rightTime = Date.parse(right.updatedAt || right.createdAt || "") || 0;
      return rightTime - leftTime;
    })
    .slice(0, 5);

  const protectedBoxId = useMemo(
    () => (boxes.length > 0 ? Math.min(...boxes.map((box) => box.id)) : null),
    [boxes]
  );

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
    <aside className={open ? "quick-panel open" : "quick-panel"} aria-label="快速面板">
      <div className="panel-header">
        <div className="panel-header-copy">
          <p className="eyebrow">PANEL</p>
          <h2>最近</h2>
        </div>
        <span className="panel-header-meta">{recentItems.length} items</span>
      </div>

      <div className="quick-list">
        {recentItems.map((item) => (
          <article
            key={item.id}
            className="quick-item"
            aria-label={`最近卡片 ${item.title}`}
            draggable
            onDragStart={(event) => handleRecentItemDragStart(event, item.id)}
          >
            <span className="quick-kind">{getKindLabel(item.kind)}</span>
            <strong>{item.title}</strong>
          </article>
        ))}

        {recentItems.length === 0 ? (
          <div className="empty-panel">
            <p>还没有最近内容。</p>
          </div>
        ) : null}
      </div>

      <div
        className={trashActive ? "trash-drop-zone active" : "trash-drop-zone"}
        aria-label="删除垃圾桶"
        data-testid="quick-panel-trash"
        data-drop-kind={trashActive ?? "idle"}
        onDragEnter={handleTrashDragOver}
        onDragOver={handleTrashDragOver}
        onDragLeave={handleTrashDragLeave}
        onDrop={(event) => void handleTrashDrop(event)}
      >
        <strong>垃圾桶</strong>
        <span>把卡片或盒子拖到这里删除</span>
      </div>
    </aside>
  );
}
