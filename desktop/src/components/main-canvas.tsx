import { DragEvent, type CSSProperties, type SyntheticEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Box, BundleEntry, Item, ItemKind } from "../shared/types";

const DRAGGED_ITEM_MIME = "application/x-brain-item-id";
const MASONRY_ROW_HEIGHT = 8;
const MASONRY_ROW_GAP = 16;
const KIND_FILTER_OPTIONS: Array<{ value: "all" | ItemKind; label: string }> = [
  { value: "all", label: "全部" },
  { value: "text", label: "文本" },
  { value: "link", label: "链接" },
  { value: "image", label: "图片" },
  { value: "file", label: "文件" },
  { value: "bundle", label: "组合" },
];

let transparentDragImage: HTMLImageElement | null = null;

function applyTransparentDragImage(dataTransfer: DataTransfer) {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof dataTransfer.setDragImage !== "function") {
    return;
  }

  if (!transparentDragImage) {
    transparentDragImage = new Image();
    transparentDragImage.src =
      "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";
  }

  dataTransfer.setDragImage(transparentDragImage, 0, 0);
}

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

function getImageCardLayout(aspectRatio?: number) {
  if (!aspectRatio) {
    return "visual";
  }

  if (aspectRatio < 0.9) {
    return "portrait";
  }

  if (aspectRatio < 1.25) {
    return "standard";
  }

  return "visual";
}

function getCardToneClass(item: Item, imageAspectRatio?: number) {
  if (item.kind === "file" || item.kind === "link") {
    return "work-card-compact";
  }

  if (item.kind === "image") {
    const imageLayout = getImageCardLayout(imageAspectRatio);
    if (imageLayout === "portrait") {
      return "work-card-compact";
    }

    if (imageLayout === "standard") {
      return "work-card-image-standard";
    }

    return "work-card-visual";
  }

  if (item.kind === "text") {
    return "work-card-reading";
  }

  return "";
}

function getFileExtensionLabel(item: Item) {
  const source = item.sourcePath || item.title;
  const pathSegments = source.split(/[\\/]/).filter(Boolean);
  const fileName = pathSegments[pathSegments.length - 1] ?? source;
  const extensionSegments = fileName.includes(".") ? fileName.split(".") : [];
  const extension = extensionSegments[extensionSegments.length - 1] ?? "";

  return extension ? extension.slice(0, 8).toUpperCase() : "FILE";
}

function getCompactFilePath(path: string) {
  const segments = path.split(/[\\/]+/).filter(Boolean);
  const normalizedSegments =
    segments.length > 0 && /^[A-Za-z]:$/.test(segments[0]) ? segments.slice(1) : segments;

  if (normalizedSegments.length === 0) {
    return path;
  }

  return normalizedSegments.slice(-3).join(" / ");
}

function getBundlePreviewKinds(items: Item[]) {
  return Array.from(new Set(items.map((item) => (item.kind === "file" ? getFileExtensionLabel(item) : getItemKindLabel(item.kind))))).slice(0, 3);
}

function getBundleMemberPreviewText(item: Item) {
  if (item.kind === "text") {
    return getTextCardCopy(item);
  }

  if (item.kind === "file" && item.sourcePath) {
    return getCompactFilePath(item.sourcePath);
  }

  if (item.kind === "link" && item.sourceUrl) {
    return item.sourceUrl;
  }

  if (item.kind === "image") {
    return item.title;
  }

  return item.content || item.title;
}

function getBundleTilePreviewText(item: Item) {
  const previewText = getBundleMemberPreviewText(item);
  if (item.kind !== "text") {
    return previewText;
  }

  return previewText.length > 36 ? `${previewText.slice(0, 36).trimEnd()}…` : previewText;
}

function getBundleDisplayTitle(item: Item, bundleItems: Item[]) {
  const rawTitle = item.title.trim();
  if (!rawTitle) {
    return "";
  }

  const firstMemberTitle = bundleItems[0]?.title.trim() ?? "";
  if (firstMemberTitle && rawTitle === firstMemberTitle) {
    return "";
  }

  return rawTitle;
}

function getBundleAccessibleName(item: Item, bundleItems: Item[]) {
  return getBundleDisplayTitle(item, bundleItems) || `组合 #${item.id}`;
}

function getBundlePreviewMembers(items: Item[]) {
  return items.slice(0, 3);
}

function getBundlePreviewDialogLabel(item: Item) {
  return `预览 ${item.title || getItemKindLabel(item.kind)}`;
}

function shouldShowPreviewTitle(item: Item) {
  if (item.kind === "text") {
    return false;
  }

  return Boolean(item.title.trim());
}

function getBundlePreviewPanelClass(item: Item) {
  return `bundle-item-preview-panel kind-${item.kind}`;
}

function getCardStackClass(item: Item, textLength: number, imageAspectRatio?: number) {
  if (item.kind === "file" || item.kind === "link") {
    return "card-stack card-stack-compact card-stack-priority-compact";
  }

  if (item.kind === "image") {
    const imageLayout = getImageCardLayout(imageAspectRatio);
    if (imageLayout === "portrait") {
      return "card-stack card-stack-compact card-stack-priority-compact";
    }

    if (imageLayout === "standard") {
      return "card-stack";
    }

    return "card-stack card-stack-visual card-stack-priority-visual";
  }

  if (item.kind === "bundle" || (item.kind === "text" && textLength > 40)) {
    return "card-stack card-stack-reading card-stack-priority-main";
  }

  return "card-stack";
}

function getFallbackStackRowSpan(item: Item, textLength: number, imageAspectRatio?: number) {
  if (item.kind === "image") {
    const imageLayout = getImageCardLayout(imageAspectRatio);
    if (imageLayout === "portrait") {
      return 22;
    }

    if (imageLayout === "standard") {
      return 24;
    }

    return 30;
  }

  if (item.kind === "text") {
    if (textLength > 360) {
      return 30;
    }

    if (textLength > 180) {
      return 24;
    }

    return 18;
  }

  if (item.kind === "bundle") {
    return 16;
  }

  if (item.kind === "file" || item.kind === "link") {
    return 12;
  }

  return 14;
}

type BundleExtractionRecord =
  | {
      key: string;
      kind: "text";
      label: string;
      title: string;
      text: string;
      item: Item;
    }
  | {
      key: string;
      kind: "link";
      label: string;
      title: string;
      url: string;
      item: Item;
    }
  | {
      key: string;
      kind: "file";
      label: string;
      title: string;
      path: string;
      item: Item;
    }
  | {
      key: string;
      kind: "image";
      label: string;
      title: string;
      item: Item;
    }
  | {
      key: string;
      kind: "entry";
      label: string;
      title: string;
      path: string;
      exists: boolean;
    };

function getBundleExtractionRecords(bundleItems: Item[], bundleEntries: BundleEntry[]) {
  const itemRecords: BundleExtractionRecord[] = bundleItems.map((item) => {
    if (item.kind === "text") {
      return {
        key: `item-${item.id}`,
        kind: "text",
        label: getItemKindLabel(item.kind),
        title: item.title.trim(),
        text: getTextCardCopy(item),
        item,
      };
    }

    if (item.kind === "link") {
      return {
        key: `item-${item.id}`,
        kind: "link",
        label: getItemKindLabel(item.kind),
        title: item.title.trim() || item.sourceUrl || "未命名链接",
        url: item.sourceUrl || item.content,
        item,
      };
    }

    if (item.kind === "file") {
      return {
        key: `item-${item.id}`,
        kind: "file",
        label: getFileExtensionLabel(item),
        title: item.title.trim() || item.sourcePath || "未命名文件",
        path: item.sourcePath || item.content,
        item,
      };
    }

    if (item.kind === "image") {
      return {
        key: `item-${item.id}`,
        kind: "image",
        label: getItemKindLabel(item.kind),
        title: item.title.trim() || "未命名图片",
        item,
      };
    }

    return {
      key: `item-${item.id}`,
      kind: "text",
      label: getItemKindLabel(item.kind),
      title: item.title.trim(),
      text: getBundleMemberPreviewText(item),
      item,
    };
  });

  const entryRecords: BundleExtractionRecord[] = bundleEntries.map((entry) => ({
    key: `entry-${entry.entryPath}`,
    kind: "entry",
    label: getBundleEntryKindLabel(entry.entryKind),
    title:
      entry.entryPath
        .split(/[\\/]/)
        .filter(Boolean)
        .slice(-1)[0] ?? entry.entryPath,
    path: entry.entryPath,
    exists: entry.exists,
  }));

  return [...itemRecords, ...entryRecords];
}

function buildBundleExportText(bundleName: string, records: BundleExtractionRecord[]) {
  const sections = records.map((record, index) => {
    if (record.kind === "text") {
      return [`[${index + 1}] ${record.label}`, record.text].join("\n");
    }

    if (record.kind === "link") {
      return [`[${index + 1}] ${record.label}`, `标题： ${record.title}`, `链接： ${record.url}`].join("\n");
    }

    if (record.kind === "file") {
      return [`[${index + 1}] ${record.label}`, `标题： ${record.title}`, `路径： ${record.path}`].join("\n");
    }

    if (record.kind === "image") {
      return [`[${index + 1}] ${record.label}`, `图片： ${record.title}`].join("\n");
    }

    return [
      `[${index + 1}] ${record.label}`,
      `标题： ${record.title}`,
      `路径： ${record.path}`,
      record.exists ? "状态： 可用" : "状态： 路径缺失",
    ].join("\n");
  });

  return [bundleName, `共 ${records.length} 项`, ...sections].filter(Boolean).join("\n\n");
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderHtmlParagraphs(value: string) {
  return escapeHtml(value)
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${paragraph.replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function buildBundleAiHtml(bundleName: string, records: BundleExtractionRecord[]) {
  const sectionHtml = records
    .map((record, index) => {
      const heading = `<div class="record-topline"><span class="kind">${escapeHtml(record.label)}</span><span class="index">#${index + 1}</span></div>`;

      if (record.kind === "text") {
        return `<section class="record kind-text">${heading}<div class="record-body">${renderHtmlParagraphs(record.text)}</div></section>`;
      }

      if (record.kind === "link") {
        return `<section class="record kind-link">${heading}<h2>${escapeHtml(record.title)}</h2><p><a href="${escapeHtml(
          record.url
        )}">${escapeHtml(record.url)}</a></p></section>`;
      }

      if (record.kind === "file") {
        return `<section class="record kind-file">${heading}<h2>${escapeHtml(record.title)}</h2><p class="path">${escapeHtml(
          record.path
        )}</p></section>`;
      }

      if (record.kind === "image") {
        return `<section class="record kind-image">${heading}<h2>${escapeHtml(record.title)}</h2><figure><img src="${escapeHtml(
          record.item.content
        )}" alt="${escapeHtml(record.title)}" /></figure></section>`;
      }

      return `<section class="record kind-entry">${heading}<h2>${escapeHtml(record.title)}</h2><p class="path">${escapeHtml(
        record.path
      )}</p><p class="status">${record.exists ? "状态：可用" : "状态：路径缺失"}</p></section>`;
    })
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(bundleName)}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        background: #f5f3ef;
        color: #23211c;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        padding: 32px;
        background:
          radial-gradient(circle at top, rgba(255,255,255,0.92), rgba(245,243,239,0.96)),
          #f5f3ef;
      }
      main {
        max-width: 1080px;
        margin: 0 auto;
        display: grid;
        gap: 18px;
      }
      header {
        display: grid;
        gap: 8px;
      }
      h1 {
        margin: 0;
        font-size: 1.8rem;
      }
      .meta {
        color: rgba(35, 33, 28, 0.62);
        font-size: 0.95rem;
      }
      .record {
        display: grid;
        gap: 12px;
        padding: 18px;
        border-radius: 22px;
        background: rgba(255, 255, 255, 0.94);
        border: 1px solid rgba(18, 18, 18, 0.06);
        box-shadow: rgba(15, 15, 15, 0.04) 0 10px 30px;
      }
      .record-topline {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
      }
      .kind {
        display: inline-flex;
        align-items: center;
        min-height: 24px;
        padding: 0 10px;
        border-radius: 999px;
        background: rgba(109, 128, 247, 0.1);
        border: 1px solid rgba(109, 128, 247, 0.18);
        color: #5368d6;
        font-size: 0.78rem;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      .index {
        color: rgba(35, 33, 28, 0.46);
        font-size: 0.84rem;
      }
      h2 {
        margin: 0;
        font-size: 1.1rem;
      }
      p {
        margin: 0;
        line-height: 1.75;
        white-space: normal;
      }
      .path,
      .status {
        color: rgba(35, 33, 28, 0.68);
        word-break: break-all;
      }
      a {
        color: #3f57d1;
      }
      figure {
        margin: 0;
        display: grid;
        gap: 10px;
      }
      img {
        display: block;
        width: 100%;
        max-width: 100%;
        border-radius: 18px;
        background: #f1efea;
        border: 1px solid rgba(18, 18, 18, 0.06);
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <h1>${escapeHtml(bundleName)}</h1>
        <p class="meta">共 ${records.length} 项。此文件为 Brain 的 AI 导出上下文，文本与图片保持同一语义顺序。</p>
      </header>
      ${sectionHtml || `<section class="record"><p>这个组合里还没有可导出的内容。</p></section>`}
    </main>
  </body>
</html>`;
}

type MainCanvasProps = {
  box: Box | undefined;
  items: Item[];
  bundleEntriesByItem?: Record<number, BundleEntry[]>;
  bundleItemsByItem?: Record<number, Item[]>;
  onBackToWorkspace?: () => void;
  onPreviewImage?: (item: Item) => void;
  onRenameBox?: (boxId: number, name: string, description: string) => Promise<void>;
  onRenameItem?: (itemId: number, title: string) => Promise<void>;
  onRemoveBundleEntry?: (itemId: number, entryPath: string) => Promise<void>;
  onGroupItems?: (sourceItemId: number, targetItemId: number) => Promise<void>;
  onOpenPath?: (path: string) => Promise<void>;
  onOpenExternal?: (url: string) => Promise<void>;
  onCopyText?: (text: string) => Promise<void>;
  onExportBundleAi?: (bundleName: string, html: string) => Promise<void>;
  onMoveItemToIndex?: (itemId: number, targetIndex: number) => Promise<void>;
  onLoadBundleEntries?: (itemId: number) => Promise<void>;
};

export function MainCanvas({
  box,
  items,
  bundleEntriesByItem = {},
  bundleItemsByItem = {},
  onBackToWorkspace,
  onPreviewImage = () => undefined,
  onRenameBox = async () => undefined,
  onRenameItem = async () => undefined,
  onGroupItems = async () => undefined,
  onOpenPath = async () => undefined,
  onOpenExternal = async () => undefined,
  onCopyText = async () => undefined,
  onExportBundleAi = async () => undefined,
  onMoveItemToIndex = async () => undefined,
  onLoadBundleEntries = async () => undefined,
}: MainCanvasProps) {
  const [loadingBundleIds, setLoadingBundleIds] = useState<Record<number, boolean>>({});
  const [bundleErrors, setBundleErrors] = useState<Record<number, string>>({});
  const [stackRowSpans, setStackRowSpans] = useState<Record<number, number>>({});
  const [imageAspectRatios, setImageAspectRatios] = useState<Record<number, number>>({});
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [draggedOverIndex, setDraggedOverIndex] = useState<number | null>(null);
  const [draggedOverItemId, setDraggedOverItemId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingBoxName, setEditingBoxName] = useState(false);
  const [boxNameDraft, setBoxNameDraft] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | ItemKind>("all");
  const [selectionModeItemId, setSelectionModeItemId] = useState<number | null>(null);
  const [previewedBundleItem, setPreviewedBundleItem] = useState<Item | null>(null);
  const [extractedBundleItemId, setExtractedBundleItemId] = useState<number | null>(null);
  const stackRefs = useRef(new Map<number, HTMLDivElement>());

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
  const bundledItemIds = useMemo(
    () =>
      new Set(
        Object.values(bundleItemsByItem)
          .flat()
          .map((item) => item.id)
      ),
    [bundleItemsByItem]
  );
  const draggingBundleMember = draggedItemId != null && bundledItemIds.has(draggedItemId);

  useEffect(() => {
    const visibleIds = new Set(filteredItems.map((item) => item.id));
    setStackRowSpans((current) => {
      const nextEntries = Object.entries(current).filter(([itemId]) => visibleIds.has(Number(itemId)));
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
    setImageAspectRatios((current) => {
      const nextEntries = Object.entries(current).filter(([itemId]) => visibleIds.has(Number(itemId)));
      if (nextEntries.length === Object.keys(current).length) {
        return current;
      }

      return Object.fromEntries(nextEntries);
    });
  }, [filteredItems]);

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

  useEffect(() => {
    function handlePreviewDismiss(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPreviewedBundleItem(null);
        setExtractedBundleItemId(null);
      }
    }

    if (!previewedBundleItem && extractedBundleItemId == null) {
      return;
    }

    window.addEventListener("keydown", handlePreviewDismiss);
    return () => {
      window.removeEventListener("keydown", handlePreviewDismiss);
    };
  }, [previewedBundleItem, extractedBundleItemId]);

  useLayoutEffect(() => {
    const cleanupCallbacks: Array<() => void> = [];

    function updateRowSpan(itemId: number, element: HTMLDivElement) {
      const height = Math.ceil(element.getBoundingClientRect().height);
      if (!height) {
        return;
      }

      const nextSpan = Math.max(1, Math.ceil((height + MASONRY_ROW_GAP) / (MASONRY_ROW_HEIGHT + MASONRY_ROW_GAP)));
      setStackRowSpans((current) => (current[itemId] === nextSpan ? current : { ...current, [itemId]: nextSpan }));
    }

    stackRefs.current.forEach((element, itemId) => {
      updateRowSpan(itemId, element);

      if (typeof ResizeObserver === "undefined") {
        return;
      }

      const observer = new ResizeObserver(() => {
        updateRowSpan(itemId, element);
      });
      observer.observe(element);
      cleanupCallbacks.push(() => observer.disconnect());
    });

    return () => {
      cleanupCallbacks.forEach((cleanup) => cleanup());
    };
  }, [filteredItems, draggedOverIndex, bundleEntriesByItem, loadingBundleIds, bundleErrors]);

  async function handleBundleExtractOpen(item: Item) {
    setExtractedBundleItemId(item.id);
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
    setDraggedOverItemId(null);
    setSelectionModeItemId(null);
  }

  function handleImagePreviewLoad(itemId: number, event: SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth, naturalHeight } = event.currentTarget;
    if (!naturalWidth || !naturalHeight) {
      return;
    }

    const nextAspectRatio = naturalWidth / naturalHeight;
    setImageAspectRatios((current) =>
      current[itemId] === nextAspectRatio ? current : { ...current, [itemId]: nextAspectRatio }
    );
  }

  function getDraggedCardId(event: DragEvent<HTMLElement | HTMLDivElement>) {
    const rawItemId = event.dataTransfer.getData(DRAGGED_ITEM_MIME) ?? "";
    const parsedItemId = Number(rawItemId);
    if (Number.isFinite(parsedItemId) && parsedItemId > 0) {
      return parsedItemId;
    }

    return draggedItemId;
  }

  function getGridWhitespaceDropIndex(clientX: number, clientY: number) {
    const stackEntries = filteredItems
      .map((item, index) => {
        const element = stackRefs.current.get(item.id);
        if (!element) {
          return null;
        }

        const rect = element.getBoundingClientRect();
        return { index, rect };
      })
      .filter((entry): entry is { index: number; rect: DOMRect } => Boolean(entry));

    if (stackEntries.length === 0) {
      return filteredItems.length;
    }

    const hasMeasuredRects = stackEntries.some((entry) => entry.rect.width > 0 || entry.rect.height > 0);
    if (!hasMeasuredRects) {
      return filteredItems.length;
    }

    let bestMatch: { distance: number; targetIndex: number } | null = null;

    stackEntries.forEach(({ index, rect }) => {
      const horizontalGap =
        clientX < rect.left ? rect.left - clientX : clientX > rect.right ? clientX - rect.right : 0;
      const verticalGap =
        clientY < rect.top ? rect.top - clientY : clientY > rect.bottom ? clientY - rect.bottom : 0;
      const distance = Math.hypot(horizontalGap, verticalGap);
      const targetIndex = clientY > rect.top + rect.height / 2 ? index + 1 : index;

      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { distance, targetIndex };
      }
    });

    return bestMatch ? Math.max(0, Math.min(bestMatch.targetIndex, filteredItems.length)) : filteredItems.length;
  }

  function handleDropZoneDragOver(index: number, event: DragEvent<HTMLDivElement | HTMLElement>) {
    if (!getDraggedCardId(event)) {
      return;
    }

    event.preventDefault();
    setDraggedOverIndex(index);
  }

  async function handleDropZoneDrop(index: number, event: DragEvent<HTMLDivElement | HTMLElement>) {
    event.preventDefault();
    setDraggedOverIndex(null);

    const itemId = getDraggedCardId(event);
    if (!itemId) {
      return;
    }

    const sourceIndex = items.findIndex((entry) => entry.id === itemId);
    if (sourceIndex === -1) {
      await onMoveItemToIndex(itemId, index);
      setDraggedItemId(null);
      return;
    }

    const targetIndex = index > sourceIndex ? index - 1 : index;
    if (targetIndex === sourceIndex) {
      return;
    }

    await onMoveItemToIndex(itemId, targetIndex);
    setDraggedItemId(null);
  }

  function handleGridWhitespaceDragOver(event: DragEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (!getDraggedCardId(event)) {
      return;
    }

    event.preventDefault();
    setDraggedOverItemId(null);
    setDraggedOverIndex(getGridWhitespaceDropIndex(event.clientX, event.clientY));
  }

  async function handleGridWhitespaceDrop(event: DragEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    const targetIndex = getGridWhitespaceDropIndex(event.clientX, event.clientY);
    await handleDropZoneDrop(targetIndex, event);
  }

  function handleStackWhitespaceDragOver(index: number, event: DragEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    handleDropZoneDragOver(index + 1, event);
    setDraggedOverItemId(null);
  }

  async function handleStackWhitespaceDrop(index: number, event: DragEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) {
      return;
    }

    await handleDropZoneDrop(index + 1, event);
    setDraggedOverItemId(null);
  }

  function handleCardDragOver(targetItemId: number, event: DragEvent<HTMLElement>) {
    const sourceItemId = getDraggedCardId(event);
    if (!sourceItemId || sourceItemId === targetItemId) {
      return;
    }

    const targetItem = items.find((entry) => entry.id === targetItemId);
    if (!targetItem) {
      return;
    }

    event.preventDefault();
    setDraggedOverItemId(targetItemId);
    setDraggedOverIndex(null);
  }

  async function handleCardDrop(targetItemId: number, event: DragEvent<HTMLElement>) {
    event.preventDefault();
    const sourceItemId = getDraggedCardId(event);
    setDraggedOverItemId(null);
    if (!sourceItemId || sourceItemId === targetItemId) {
      return;
    }

    const targetItem = items.find((entry) => entry.id === targetItemId);
    if (!targetItem) {
      return;
    }

    if (bundledItemIds.has(sourceItemId) && targetItem.kind !== "bundle") {
      const targetIndex = items.findIndex((entry) => entry.id === targetItemId);
      if (targetIndex === -1) {
        return;
      }

      await onMoveItemToIndex(sourceItemId, targetIndex);
      setDraggedItemId(null);
      return;
    }

    await onGroupItems(sourceItemId, targetItemId);
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

  const extractedBundleItem =
    extractedBundleItemId != null ? items.find((entry) => entry.id === extractedBundleItemId) ?? null : null;
  const extractedBundleItems = extractedBundleItem ? bundleItemsByItem[extractedBundleItem.id] ?? [] : [];
  const extractedBundleEntries = extractedBundleItem ? bundleEntriesByItem[extractedBundleItem.id] ?? [] : [];
  const extractedBundleName = extractedBundleItem
    ? getBundleAccessibleName(extractedBundleItem, extractedBundleItems)
    : "";
  const extractedBundleLoading = extractedBundleItem ? Boolean(loadingBundleIds[extractedBundleItem.id]) : false;
  const extractedBundleError = extractedBundleItem ? bundleErrors[extractedBundleItem.id] ?? "" : "";
  const extractedBundleRecords = useMemo(
    () => getBundleExtractionRecords(extractedBundleItems, extractedBundleEntries),
    [extractedBundleEntries, extractedBundleItems]
  );
  const extractedBundleExportText = useMemo(
    () => buildBundleExportText(extractedBundleName, extractedBundleRecords),
    [extractedBundleName, extractedBundleRecords]
  );
  const extractedBundleAiHtml = useMemo(
    () => buildBundleAiHtml(extractedBundleName, extractedBundleRecords),
    [extractedBundleName, extractedBundleRecords]
  );

  function renderBundleItemPreview(item: Item) {
    if (item.kind === "image" && item.content) {
      return (
        <button
          type="button"
          className="bundle-item-preview-image-button"
          aria-label={`放大查看 ${item.title}`}
          onClick={() => onPreviewImage(item)}
        >
          <img
            className="bundle-item-preview-image"
            src={item.content}
            alt={item.title || "组合图片预览"}
            draggable={false}
          />
        </button>
      );
    }

    if (item.kind === "file" && item.sourcePath) {
      return (
        <div className="bundle-item-preview-body">
          <button
            type="button"
            className="card-path-button"
            aria-label={`打开 ${item.sourcePath}`}
            title={item.sourcePath}
            onClick={() => void onOpenPath(item.sourcePath)}
          >
            <span className="card-path-copy">{getCompactFilePath(item.sourcePath)}</span>
          </button>
        </div>
      );
    }

    if (item.kind === "link" && item.sourceUrl) {
      return (
        <div className="bundle-item-preview-body">
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
      );
    }

    if (item.kind === "text") {
      return (
        <div className="bundle-item-preview-body bundle-item-preview-text selectable">
          <p>{getTextCardCopy(item)}</p>
        </div>
      );
    }

    return (
      <div className="bundle-item-preview-body">
        {shouldShowPreviewTitle(item) ? <h2>{item.title}</h2> : null}
        <p>{getBundleMemberPreviewText(item)}</p>
      </div>
    );
  }

  function renderBundleExtractionRecord(record: BundleExtractionRecord) {
    if (record.kind === "text") {
      return (
        <article key={record.key} className="bundle-extract-card">
          <div className="bundle-extract-card-topline">
            <span className="card-kind">{record.label}</span>
          </div>
          <div className="bundle-extract-copy selectable">
            <p>{record.text}</p>
          </div>
        </article>
      );
    }

    if (record.kind === "link") {
      return (
        <article key={record.key} className="bundle-extract-card">
          <div className="bundle-extract-card-topline">
            <span className="card-kind">{record.label}</span>
          </div>
          <strong>{record.title}</strong>
          <a
            className="card-link"
            href={record.url}
            aria-label={`打开 ${record.url}`}
            onClick={(event) => {
              event.preventDefault();
              void onOpenExternal(record.url);
            }}
          >
            {record.url}
          </a>
        </article>
      );
    }

    if (record.kind === "file") {
      return (
        <article key={record.key} className="bundle-extract-card">
          <div className="bundle-extract-card-topline">
            <span className="card-kind card-kind-file">{record.label}</span>
          </div>
          <strong>{record.title}</strong>
          <button
            type="button"
            className="card-path-button"
            aria-label={`打开 ${record.path}`}
            title={record.path}
            onClick={() => void onOpenPath(record.path)}
          >
            <span className="card-path-copy">{getCompactFilePath(record.path)}</span>
          </button>
        </article>
      );
    }

    if (record.kind === "image") {
      return (
        <article key={record.key} className="bundle-extract-card">
          <div className="bundle-extract-card-topline">
            <span className="card-kind">{record.label}</span>
          </div>
          <strong>{record.title}</strong>
          <button
            type="button"
            className="bundle-extract-image-button"
            aria-label={`放大查看 ${record.title}`}
            onClick={() => onPreviewImage(record.item)}
          >
            <img
              className="bundle-extract-image-preview"
              src={record.item.content}
              alt={record.title}
              draggable={false}
            />
          </button>
        </article>
      );
    }

    return (
      <article key={record.key} className="bundle-extract-card">
        <div className="bundle-extract-card-topline">
          <span className="card-kind">{record.label}</span>
          {!record.exists ? <span className="bundle-entry-status missing">路径缺失</span> : null}
        </div>
        <strong>{record.title}</strong>
        <button
          type="button"
          className="card-path-button"
          aria-label={`打开 ${record.path}`}
          title={record.path}
          onClick={() => void onOpenPath(record.path)}
        >
          <span className="card-path-copy">{record.path}</span>
        </button>
      </article>
    );
  }

  return (
    <main className="main-canvas">
      <div className="canvas-topbar">
        <header className="canvas-header">
          <div className="canvas-header-copy">
            <div className="canvas-header-kicker">
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
            </div>
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
          <div className="canvas-filter-field canvas-filter-kind" aria-label="筛选卡片类型">
            <span className="canvas-filter-label">类型</span>
            <div className="canvas-filter-pills" role="group" aria-label="筛选卡片类型选项">
              {KIND_FILTER_OPTIONS.map((option) => {
                const active = kindFilter === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={active ? "canvas-filter-pill is-active" : "canvas-filter-pill"}
                    aria-pressed={active}
                    onClick={() => setKindFilter(option.value)}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {filteredItems.length === 0 ? (
        <section className="empty-state-panel" aria-label="当前盒子内容为空">
          <div className="empty-state">
            <h2>{hasActiveFilters ? "没有匹配的卡片" : "这里还没有内容"}</h2>
            <p>
              {hasActiveFilters
                ? "试试别的搜索词或类型筛选。"
                : "拖入链接、图片或笔记，开始收集灵感。"}
            </p>
          </div>
        </section>
      ) : (
        <section
          className="card-grid"
          aria-label="当前盒子内容"
          data-layout="masonry"
          data-dragging={!hasActiveFilters && draggedItemId ? "true" : "false"}
          data-dragging-bundle-member={!hasActiveFilters && draggingBundleMember ? "true" : "false"}
          onDragOver={(event) => handleGridWhitespaceDragOver(event)}
          onDrop={(event) => void handleGridWhitespaceDrop(event)}
          onDragLeave={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }

            setDraggedOverIndex(null);
          }}
        >
          {filteredItems.map((item, index) => {
            const bundleItems = bundleItemsByItem[item.id] ?? [];
            const cardTitle = item.kind === "bundle" ? getBundleDisplayTitle(item, bundleItems) : item.title;
            const cardAccessibleName =
              item.kind === "bundle" ? getBundleAccessibleName(item, bundleItems) : item.title;
            const isRenaming = editingItemId === item.id;
            const bodyText = getBodyText(item);
            const textCardCopy = item.kind === "text" ? getTextCardCopy(item) : "";
            const imageAspectRatio = item.kind === "image" ? imageAspectRatios[item.id] : undefined;
            const dragEnabled = !hasActiveFilters && selectionModeItemId !== item.id;
            const stackRowSpan =
              stackRowSpans[item.id] ?? getFallbackStackRowSpan(item, textCardCopy.length, imageAspectRatio);

            return (
              <div
                key={item.id}
                ref={(node) => {
                  if (node) {
                    stackRefs.current.set(item.id, node);
                  } else {
                    stackRefs.current.delete(item.id);
                  }
                }}
                className={getCardStackClass(item, textCardCopy.length, imageAspectRatio)}
                data-row-span={stackRowSpan}
                data-whitespace-drop-target={draggedOverIndex === index + 1 ? "true" : "false"}
                style={{ gridRowEnd: `span ${stackRowSpan}` }}
                onDragOver={(event) => handleStackWhitespaceDragOver(index, event)}
                onDrop={(event) => void handleStackWhitespaceDrop(index, event)}
                onDragLeave={(event) => {
                  if (event.target !== event.currentTarget) {
                    return;
                  }

                  if (draggedOverIndex === index + 1) {
                    setDraggedOverIndex(null);
                  }
                }}
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
                  className={`work-card kind-${item.kind} ${getCardToneClass(item, imageAspectRatio)}`.trim()}
                  aria-label={`卡片 ${cardAccessibleName}`}
                  draggable={dragEnabled}
                  data-dragging={draggedItemId === item.id ? "true" : "false"}
                  data-group-target={draggedOverItemId === item.id ? "true" : "false"}
                  onDragStart={(event) => handleCardDragStart(item.id, event)}
                  onDragEnd={handleCardDragEnd}
                  onDragOver={(event) => handleCardDragOver(item.id, event)}
                  onDragLeave={() => {
                    if (draggedOverItemId === item.id) {
                      setDraggedOverItemId(null);
                    }
                  }}
                  onDrop={(event) => void handleCardDrop(item.id, event)}
                >
                  <div className="card-topline">
                    <span className={item.kind === "file" ? "card-kind card-kind-file" : "card-kind"}>
                      {item.kind === "file" ? getFileExtensionLabel(item) : getItemKindLabel(item.kind)}
                    </span>
                    <span className="card-id">#{item.id}</span>
                  </div>

                  {item.kind === "text" ? (
                    <div
                      className="card-copy selectable text-card-copy text-card-copy-clamped"
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
                        aria-label={`编辑 ${cardAccessibleName} 的标题`}
                        value={titleDraft}
                        onChange={(event) => setTitleDraft(event.target.value)}
                        autoFocus
                      />
                      <div className="card-inline-actions">
                        <button
                          type="submit"
                          className="card-action-button"
                          aria-label={`保存 ${cardAccessibleName} 的标题`}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="card-action-button"
                          aria-label={`取消重命名 ${cardAccessibleName}`}
                          onClick={stopRenaming}
                        >
                          取消
                        </button>
                      </div>
                    </form>
                  ) : cardTitle ? (
                    <button
                      type="button"
                      className="card-title-button"
                      aria-label={`编辑 ${cardAccessibleName} 的标题`}
                      onClick={() => startRenaming(item)}
                    >
                      {cardTitle}
                    </button>
                  ) : null}

                  {item.kind === "bundle" ? (
                    <div className="bundle-card-summary">
                      <p>{item.bundleCount} 个项目</p>
                      {bundleItems.length > 0 ? (
                        <>
                          <div className="bundle-preview-grid" aria-label={`${cardAccessibleName} 预览成员`}>
                            {getBundlePreviewMembers(bundleItems).map((previewItem) => (
                                <button
                                  key={previewItem.id}
                                  type="button"
                                  className={`bundle-preview-tile kind-${previewItem.kind}`}
                                  data-kind={previewItem.kind}
                                  aria-label={getBundlePreviewDialogLabel(previewItem)}
                                  draggable={!hasActiveFilters}
                                  onClick={() => {
                                    if (previewItem.kind === "image" && previewItem.content) {
                                      onPreviewImage(previewItem);
                                      return;
                                    }
                                    setPreviewedBundleItem(previewItem);
                                  }}
                                  onDragStart={(event) => {
                                    event.stopPropagation();
                                    handleCardDragStart(previewItem.id, event);
                                    applyTransparentDragImage(event.dataTransfer);
                                  }}
                                  onDragEnd={(event) => {
                                    event.stopPropagation();
                                    handleCardDragEnd();
                                  }}
                                >
                                  <div className="bundle-preview-tile-topline">
                                    <span
                                      className={
                                        previewItem.kind === "file" ? "card-kind card-kind-file" : "card-kind"
                                      }
                                    >
                                      {previewItem.kind === "file"
                                        ? getFileExtensionLabel(previewItem)
                                        : getItemKindLabel(previewItem.kind)}
                                    </span>
                                  </div>
                                  {previewItem.kind === "image" && previewItem.content ? (
                                    <img
                                      className="bundle-preview-image"
                                      src={previewItem.content}
                                      alt={previewItem.title}
                                      draggable={false}
                                    />
                                  ) : (
                                    <>
                                      {previewItem.kind !== "text" ? <strong>{previewItem.title}</strong> : null}
                                      <p className="bundle-cover-copy">{getBundleTilePreviewText(previewItem)}</p>
                                    </>
                                  )}
                                </button>
                            ))}
                          </div>
                          <div className="bundle-kind-pills" aria-label={`${cardAccessibleName} 组合预览`}>
                            {getBundlePreviewKinds(bundleItems).map((kindLabel) => (
                              <span key={`${item.id}-${kindLabel}`} className="bundle-kind-pill">
                                {kindLabel}
                              </span>
                            ))}
                          </div>
                        </>
                      ) : null}
                    </div>
                  ) : null}

                  {item.kind === "image" && item.content ? (
                    <button
                      type="button"
                      className="card-image-button"
                      aria-label={`放大查看 ${item.title}`}
                      draggable={false}
                      onClick={() => onPreviewImage(item)}
                      style={
                        imageAspectRatio
                          ? ({ "--card-image-aspect-ratio": String(imageAspectRatio) } as CSSProperties)
                          : undefined
                      }
                      onDragStart={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <img
                        className="card-image-preview"
                        src={item.content}
                        alt={item.title}
                        onLoad={(event) => handleImagePreviewLoad(item.id, event)}
                      />
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
                      className="card-copy card-copy-compact"
                      draggable={false}
                      onDragStart={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                    >
                      <button
                        type="button"
                        className="card-path-button"
                        aria-label={`打开 ${item.sourcePath}`}
                        title={item.sourcePath}
                        onClick={() => void onOpenPath(item.sourcePath)}
                      >
                        <span className="card-path-copy">{getCompactFilePath(item.sourcePath)}</span>
                      </button>
                    </div>
                  ) : null}

                  {!["text", "file", "link", "bundle", "image"].includes(item.kind) && bodyText ? (
                    <div className="card-copy">
                      <p>{bodyText}</p>
                    </div>
                  ) : null}

                  {item.kind === "bundle" ? (
                    <div className="card-actions">
                      <button
                        type="button"
                        className="card-action-button"
                        aria-label={`提取 ${cardAccessibleName} 的内容`}
                        onClick={() => void handleBundleExtractOpen(item)}
                      >
                        内容提取
                      </button>
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
          })}
        </section>
      )}

      {extractedBundleItem ? (
        <div className="bundle-extract-layer">
          <button
            type="button"
            className="bundle-item-preview-backdrop"
            aria-label="点击背景关闭内容提取"
            onClick={() => setExtractedBundleItemId(null)}
          />
          <div
            className="bundle-extract-panel"
            role="dialog"
            aria-modal="true"
            aria-label={`内容提取 ${extractedBundleName}`}
          >
            <div className="bundle-extract-bar">
              <div className="bundle-extract-meta">
                <span className="card-kind">组合</span>
                <strong>{extractedBundleName}</strong>
                <span className="bundle-extract-count">{extractedBundleRecords.length} 项</span>
              </div>
              <button
                type="button"
                className="bundle-item-preview-close"
                aria-label="关闭内容提取"
                onClick={() => setExtractedBundleItemId(null)}
              >
                <span className="bundle-item-preview-close-icon" aria-hidden="true" />
              </button>
            </div>
            <div className="bundle-extract-layout">
              <section className="bundle-extract-section" aria-label="阅读视图">
                <div className="bundle-extract-section-header">
                  <h2>阅读视图</h2>
                </div>
                <div className="bundle-extract-reading">
                  {extractedBundleLoading ? <p>正在整理组合内容...</p> : null}
                  {!extractedBundleLoading && extractedBundleError ? (
                    <p className="bundle-preview-error">{extractedBundleError}</p>
                  ) : null}
                  {!extractedBundleLoading && !extractedBundleError && extractedBundleRecords.length === 0 ? (
                    <p>这个组合里还没有可提取的内容。</p>
                  ) : null}
                  {!extractedBundleLoading && !extractedBundleError && extractedBundleRecords.length > 0 ? (
                    <div className="bundle-extract-list">
                      {extractedBundleRecords.map((record) => renderBundleExtractionRecord(record))}
                    </div>
                  ) : null}
                </div>
              </section>
              <section className="bundle-extract-section" aria-label="导出文本">
                <div className="bundle-extract-section-header bundle-extract-export-header">
                  <h2>导出文本</h2>
                  <div className="bundle-extract-actions">
                    <button
                      type="button"
                      className="card-action-button"
                      aria-label="导出给AI"
                      onClick={() => void onExportBundleAi(extractedBundleName, extractedBundleAiHtml)}
                      disabled={extractedBundleLoading || Boolean(extractedBundleError) || extractedBundleRecords.length === 0}
                    >
                      导出给AI
                    </button>
                    <button
                      type="button"
                      className="card-action-button"
                      aria-label="复制导出文本"
                      onClick={() => void onCopyText(extractedBundleExportText)}
                      disabled={extractedBundleLoading || Boolean(extractedBundleError) || !extractedBundleExportText}
                    >
                      复制导出文本
                    </button>
                  </div>
                </div>
                <textarea
                  className="bundle-extract-textarea"
                  aria-label="导出文本内容"
                  readOnly
                  value={
                    extractedBundleLoading
                      ? "正在整理组合内容..."
                      : extractedBundleError
                        ? extractedBundleError
                        : extractedBundleExportText
                  }
                />
              </section>
            </div>
          </div>
        </div>
      ) : null}

      {previewedBundleItem ? (
        <div className="bundle-item-preview-layer">
          <button
            type="button"
            className="bundle-item-preview-backdrop"
            aria-label="点击背景关闭预览"
            onClick={() => setPreviewedBundleItem(null)}
          />
          <div
            className={getBundlePreviewPanelClass(previewedBundleItem)}
            role="dialog"
            aria-modal="true"
            aria-label={getBundlePreviewDialogLabel(previewedBundleItem)}
          >
            <div className="bundle-item-preview-bar">
              <div className="bundle-item-preview-meta">
                <span
                  className={
                    previewedBundleItem.kind === "file" ? "card-kind card-kind-file" : "card-kind"
                  }
                >
                  {previewedBundleItem.kind === "file"
                    ? getFileExtensionLabel(previewedBundleItem)
                    : getItemKindLabel(previewedBundleItem.kind)}
                </span>
                {shouldShowPreviewTitle(previewedBundleItem) ? <strong>{previewedBundleItem.title}</strong> : null}
              </div>
              <button
                type="button"
                className="bundle-item-preview-close"
                aria-label="关闭预览"
                onClick={() => setPreviewedBundleItem(null)}
              >
                <span className="bundle-item-preview-close-icon" aria-hidden="true" />
              </button>
            </div>
            {renderBundleItemPreview(previewedBundleItem)}
          </div>
        </div>
      ) : null}

    </main>
  );
}
