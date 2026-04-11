import { DragEvent, useEffect, useMemo, useState } from "react";
import type { Box, BundleEntry, Item, ItemKind } from "../shared/types";

const DRAGGED_ITEM_MIME = "application/x-brain-item-id";

function getItemKindLabel(kind: ItemKind) {
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

function getBundleEntryKindLabel(kind: BundleEntry["entryKind"]) {
  return kind === "folder" ? "文件夹" : "文件";
}

function isTitleEditable(kind: ItemKind) {
  return kind !== "text";
}

function getTextCardCopy(item: Item) {
  return item.content.trim() || item.title.trim() || "空白笔记";
}

function getBodyText(item: Item) {
  if (item.kind === "text") {
    return getTextCardCopy(item);
  }

  return item.content || "";
}

type MainCanvasProps = {
  box: Box | undefined;
  items: Item[];
  bundleEntriesByItem?: Record<number, BundleEntry[]>;
  onBackToWorkspace?: () => void;
  onPreviewImage?: (item: Item) => void;
  onRenameBox?: (boxId: number, name: string, description: string) => Promise<void>;
  onRenameItem?: (itemId: number, title: string) => Promise<void>;
  onRemoveBundleEntry?: (itemId: number, entryPath: string) => Promise<void>;
  onOpenPath?: (path: string) => Promise<void>;
  onOpenExternal?: (url: string) => Promise<void>;
  onCopyText?: (text: string) => Promise<void>;
  onMoveItemToIndex?: (itemId: number, targetIndex: number) => Promise<void>;
  onLoadBundleEntries?: (itemId: number) => Promise<void>;
};

export function MainCanvas({
  box,
  items,
  bundleEntriesByItem = {},
  onBackToWorkspace,
  onPreviewImage = () => undefined,
  onRenameBox = async () => undefined,
  onRenameItem = async () => undefined,
  onRemoveBundleEntry = async () => undefined,
  onOpenPath = async () => undefined,
  onOpenExternal = async () => undefined,
  onCopyText = async () => undefined,
  onMoveItemToIndex = async () => undefined,
  onLoadBundleEntries = async () => undefined,
}: MainCanvasProps) {
  const [expandedBundleIds, setExpandedBundleIds] = useState<Record<number, boolean>>({});
  const [loadingBundleIds, setLoadingBundleIds] = useState<Record<number, boolean>>({});
  const [bundleErrors, setBundleErrors] = useState<Record<number, string>>({});
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingBoxName, setEditingBoxName] = useState(false);
  const [boxNameDraft, setBoxNameDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ItemKind>("all");
  const [selectionModeItemId, setSelectionModeItemId] = useState<number | null>(null);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const hasActiveFilters = normalizedQuery.length > 0 || kindFilter !== "all";

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (kindFilter !== "all" && item.kind !== kindFilter) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const searchableText = [item.title, item.content, item.sourceUrl, item.sourcePath]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(normalizedQuery);
      }),
    [items, kindFilter, normalizedQuery]
  );

  useEffect(() => {
    setEditingBoxName(false);
    setBoxNameDraft(box?.name ?? "");
  }, [box?.id, box?.name]);

  useEffect(() => {
    function resetSelectionMode() {
      setSelectionModeItemId(null);
    }

    window.addEventListener("mouseup", resetSelectionMode);
    window.addEventListener("dragend", resetSelectionMode);

    return () => {
      window.removeEventListener("mouseup", resetSelectionMode);
      window.removeEventListener("dragend", resetSelectionMode);
    };
  }, []);

  async function handleBundleToggle(item: Item) {
    const expanded = Boolean(expandedBundleIds[item.id]);
    if (expanded) {
      setExpandedBundleIds((current) => ({ ...current, [item.id]: false }));
      return;
    }

    setExpandedBundleIds((current) => ({ ...current, [item.id]: true }));
    if (bundleEntriesByItem[item.id]) {
      return;
    }

    setLoadingBundleIds((current) => ({ ...current, [item.id]: true }));
    setBundleErrors((current) => ({ ...current, [item.id]: "" }));

    try {
      await onLoadBundleEntries(item.id);
    } catch (cause) {
      setBundleErrors((current) => ({
        ...current,
        [item.id]: cause instanceof Error ? cause.message : "读取组合内容失败",
      }));
    } finally {
      setLoadingBundleIds((current) => ({ ...current, [item.id]: false }));
    }
  }

  function handleCardDragStart(itemId: number, event: DragEvent<HTMLElement>) {
    event.dataTransfer.setData(DRAGGED_ITEM_MIME, String(itemId));
    event.dataTransfer.effectAllowed = "move";
    setDraggedItemId(itemId);
  }

  function handleCardDragEnd() {
    setDraggedItemId(null);
    setDraggedOverIndex(null);
    setSelectionModeItemId(null);
  }

  function handleDropZoneDragOver(index: number, event: DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.getData(DRAGGED_ITEM_MIME)) {
      return;
    }

    event.preventDefault();
    setDraggedOverIndex(index);
  }

  async function handleDropZoneDrop(index: number, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDraggedOverIndex(null);

    const itemId = Number(event.dataTransfer.getData(DRAGGED_ITEM_MIME) ?? "");
    if (!Number.isFinite(itemId) || itemId <= 0) {
      return;
    }

    const sourceIndex = items.findIndex((entry) => entry.id === itemId);
    if (sourceIndex === -1) {
      return;
    }

    const targetIndex = index > sourceIndex ? index - 1 : index;
    if (targetIndex === sourceIndex) {
      return;
    }

    await onMoveItemToIndex(itemId, targetIndex);
    setDraggedItemId(null);
  }

  function startRenaming(item: Item) {
    if (!isTitleEditable(item.kind)) {
      return;
    }

    setEditingItemId(item.id);
    setTitleDraft(item.title);
  }

  function stopRenaming() {
    setEditingItemId(null);
    setTitleDraft("");
  }

  async function submitRename(item: Item) {
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === item.title) {
      stopRenaming();
      return;
    }

    await onRenameItem(item.id, trimmed);
    stopRenaming();
  }

  async function submitBoxRename() {
    if (!box) {
      return;
    }

    const nextName = boxNameDraft.trim();
    if (!nextName || nextName === box.name) {
      setEditingBoxName(false);
      setBoxNameDraft(box.name);
      return;
    }

    await onRenameBox(box.id, nextName, box.description);
    setEditingBoxName(false);
  }

  return (
    <main className="main-canvas">
      <header className="canvas-header">
        <div className="canvas-header-copy">
          {onBackToWorkspace ? (
            <button
              type="button"
              className="canvas-back-button"
              aria-label="返回主界面"
              onClick={onBackToWorkspace}
            >
              返回主界面
            </button>
          ) : null}
          <p className="eyebrow">当前盒子</p>
          {editingBoxName && box ? (
            <form
              className="canvas-box-rename-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitBoxRename();
              }}
            >
              <input
                className="canvas-box-name-input"
                aria-label="编辑当前盒子名称"
                value={boxNameDraft}
                onChange={(event) => setBoxNameDraft(event.target.value)}
                autoFocus
              />
              <div className="card-inline-actions">
                <button type="submit" className="card-action-button" aria-label="保存当前盒子名称">
                  保存
                </button>
                <button
                  type="button"
                  className="card-action-button"
                  aria-label="取消当前盒子重命名"
                  onClick={() => {
                    setEditingBoxName(false);
                    setBoxNameDraft(box.name);
                  }}
                >
                  取消
                </button>
              </div>
            </form>
          ) : box ? (
            <button
              type="button"
              className="canvas-title-button"
              aria-label={`编辑当前盒子名称 ${box.name}`}
              onClick={() => {
                setEditingBoxName(true);
                setBoxNameDraft(box.name);
              }}
            >
              {box.name}
            </button>
          ) : (
            <h1>未选择盒子</h1>
          )}
        </div>
        <div className="canvas-header-side">
          <p className="canvas-meta">
            {hasActiveFilters ? `${filteredItems.length} / ${items.length}` : items.length} 张卡片
          </p>
        </div>
      </header>

      <div className="canvas-toolbar" aria-label="当前盒子筛选">
        <label className="canvas-filter-field">
          <span className="canvas-filter-label">搜索</span>
          <input
            className="canvas-filter-input"
            aria-label="筛选当前盒子"
            placeholder="搜索标题、内容或路径"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
        <label className="canvas-filter-field canvas-filter-kind">
          <span className="canvas-filter-label">类型</span>
          <select
            className="canvas-filter-select"
            aria-label="筛选卡片类型"
            value={kindFilter}
            onChange={(event) => setKindFilter(event.target.value as "all" | ItemKind)}
          >
            <option value="all">全部</option>
            <option value="text">文本</option>
            <option value="link">链接</option>
            <option value="image">图片</option>
            <option value="file">文件</option>
            <option value="bundle">组合</option>
          </select>
        </label>
      </div>

      <section
        className="card-grid"
        aria-label="当前盒子内容"
        data-layout="tiles"
        data-dragging={!hasActiveFilters && draggedItemId ? "true" : "false"}
      >
        {filteredItems.length === 0 ? (
          <div className="empty-state">
            <h2>{hasActiveFilters ? "没有匹配的卡片" : "这里还没有内容"}</h2>
            <p>
              {hasActiveFilters
                ? "试试别的搜索词或类型筛选。"
                : "拖入链接、图片或笔记，开始收集灵感。"}
            </p>
          </div>
        ) : (
          filteredItems.map((item, index) => {
            const expanded = Boolean(expandedBundleIds[item.id]);
            const bundleEntries = bundleEntriesByItem[item.id] ?? [];
            const loadingBundle = Boolean(loadingBundleIds[item.id]);
            const bundleError = bundleErrors[item.id];
            const isRenaming = editingItemId === item.id;
            const bodyText = getBodyText(item);
            const textCardCopy = item.kind === "text" ? getTextCardCopy(item) : "";
            const dragEnabled = !hasActiveFilters && selectionModeItemId !== item.id;

            return (
              <div
                key={item.id}
                className={
                  expanded && item.kind === "bundle" ? "card-stack card-stack-wide" : "card-stack"
                }
              >
                {!hasActiveFilters ? (
                  <div
                    className={draggedOverIndex === index ? "card-drop-slot active" : "card-drop-slot"}
                    aria-label={`放到位置 ${index + 1}`}
                    onDragOver={(event) => handleDropZoneDragOver(index, event)}
                    onDragLeave={() => {
                      if (draggedOverIndex === index) {
                        setDraggedOverIndex(null);
                      }
                    }}
                    onDrop={(event) => void handleDropZoneDrop(index, event)}
                  />
                ) : null}

                <article
                  className={`work-card kind-${item.kind}`}
                  aria-label={`卡片 ${item.title}`}
                  draggable={dragEnabled}
                  data-dragging={draggedItemId === item.id ? "true" : "false"}
                  onDragStart={(event) => handleCardDragStart(item.id, event)}
                  onDragEnd={handleCardDragEnd}
                >
                  <div className="card-topline">
                    <span className="card-kind">{getItemKindLabel(item.kind)}</span>
                    <span className="card-id">#{item.id}</span>
                  </div>

                  {item.kind === "text" ? (
                    <div
                      className="card-copy selectable text-card-copy"
                      draggable={false}
                      onMouseDown={() => setSelectionModeItemId(item.id)}
                      onMouseUp={() => setSelectionModeItemId(null)}
                      onDragStart={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <p>{textCardCopy}</p>
                    </div>
                  ) : isRenaming ? (
                    <form
                      className="card-rename-form"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void submitRename(item);
                      }}
                    >
                      <input
                        className="card-rename-input"
                        aria-label={`编辑 ${item.title} 的标题`}
                        value={titleDraft}
                        onChange={(event) => setTitleDraft(event.target.value)}
                        autoFocus
                      />
                      <div className="card-inline-actions">
                        <button
                          type="submit"
                          className="card-action-button"
                          aria-label={`保存 ${item.title} 的标题`}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="card-action-button"
                          aria-label={`取消重命名 ${item.title}`}
                          onClick={stopRenaming}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : (
                    <button
                      type="button"
                      className="card-title-button"
                      aria-label={`编辑 ${item.title} 的标题`}
                      onClick={() => startRenaming(item)}
                    >
                      {item.title}
                    </button>
                  )}

                  {item.kind === "bundle" ? <p>{item.bundleCount} 个项目</p> : null}

                  {item.kind === "image" && item.content ? (
                    <button
                      type="button"
                      className="card-image-button"
                      aria-label={`放大查看 ${item.title}`}
                      draggable={false}
                      onClick={() => onPreviewImage(item)}
                      onDragStart={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <img className="card-image-preview" src={item.content} alt={item.title} />
                    </button>
                  ) : null}

                  {item.kind === "link" && item.sourceUrl ? (
                    <div
                      className="card-copy selectable"
                      draggable={false}
                      onDragStart={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <a
                        className="card-link"
                        href={item.sourceUrl}
                        aria-label={`打开 ${item.sourceUrl}`}
                        onClick={(event) => {
                          event.preventDefault();
                          void onOpenExternal(item.sourceUrl);
                        }}
                      >
                        {item.sourceUrl}
                      </a>
                    </div>
                  ) : null}

                  {item.kind === "file" && item.sourcePath ? (
                    <div
                      className="card-copy selectable"
                      draggable={false}
                      onDragStart={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <p>{item.sourcePath}</p>
                    </div>
                  ) : null}

                  {!["text", "file", "link", "bundle", "image"].includes(item.kind) && bodyText ? (
                    <div className="card-copy">
                      <p>{bodyText}</p>
                    </div>
                  ) : null}

                  <div className="card-actions">
                    {item.kind === "file" && item.sourcePath ? (
                      <>
                        <button
                          type="button"
                          className="card-action-button"
                          aria-label={`打开 ${item.title} 的路径`}
                          onClick={() => void onOpenPath(item.sourcePath)}
                        >
                          打开
                        </button>
                        <button
                          type="button"
                          className="card-action-button"
                          aria-label={`复制 ${item.title} 的路径`}
                          onClick={() => void onCopyText(item.sourcePath)}
                        >
                          复制路径
                        </button>
                      </>
                    ) : null}

                    {item.kind === "bundle" ? (
                      <button
                        type="button"
                        className="card-action-button"
                        aria-label={`${expanded ? "收起" : "展开"} ${item.title} 的内容`}
                        onClick={() => void handleBundleToggle(item)}
                      >
                        {expanded ? "收起内容" : "展开内容"}
                      </button>
                    ) : null}
                  </div>

                  {item.kind === "bundle" && expanded ? (
                    <div className="bundle-preview">
                      {loadingBundle ? <p>正在加载路径...</p> : null}
                      {!loadingBundle && bundleError ? (
                        <p className="bundle-list-meta">{bundleError}</p>
                      ) : null}
                      {!loadingBundle && !bundleError && bundleEntries.length === 0 ? (
                        <p>还没有保存的路径。</p>
                      ) : null}
                      {!loadingBundle && !bundleError && bundleEntries.length > 0 ? (
                        <ul className="bundle-entry-list">
                          {bundleEntries.map((entry) => (
                            <li key={`${item.id}-${entry.entryPath}`} className="bundle-entry">
                              <div className="bundle-entry-copy">
                                <div className="bundle-entry-meta">
                                  <span className="bundle-entry-kind">
                                    {getBundleEntryKindLabel(entry.entryKind)}
                                  </span>
                                  {!entry.exists ? (
                                    <span className="bundle-entry-status missing">路径缺失</span>
                                  ) : null}
                                </div>
                                <span className="bundle-entry-path">{entry.entryPath}</span>
                              </div>
                              <div className="bundle-entry-actions">
                                <button
                                  type="button"
                                  className="card-action-button"
                                  aria-label={`打开 ${entry.entryPath}`}
                                  onClick={() => void onOpenPath(entry.entryPath)}
                                >
                                  打开
                                </button>
                                <button
                                  type="button"
                                  className="card-action-button"
                                  aria-label={`复制 ${entry.entryPath}`}
                                  onClick={() => void onCopyText(entry.entryPath)}
                                >
                                  复制
                                </button>
                                <button
                                  type="button"
                                  className="card-action-button destructive"
                                  aria-label={`移除 ${entry.entryPath}`}
                                  onClick={() => void onRemoveBundleEntry(item.id, entry.entryPath)}
                                >
                                  移除
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </article>

                {!hasActiveFilters && index === filteredItems.length - 1 ? (
                  <div
                    className={
                      draggedOverIndex === filteredItems.length ? "card-drop-slot active" : "card-drop-slot"
                    }
                    aria-label={`放到位置 ${filteredItems.length + 1}`}
                    onDragOver={(event) => handleDropZoneDragOver(filteredItems.length, event)}
                    onDragLeave={() => {
                      if (draggedOverIndex === filteredItems.length) {
                        setDraggedOverIndex(null);
                      }
                    }}
                    onDrop={(event) => void handleDropZoneDrop(filteredItems.length, event)}
                  />
                ) : null}
              </div>
            );
          })
        )}
      </section>

    </main>
  );
}
