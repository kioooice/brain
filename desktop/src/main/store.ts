import Database from "better-sqlite3";
import * as fs from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { nativeImage } from "electron";
import type {
  AiOrganizationSuggestion,
  AutoCaptureSnapshot,
  Box,
  BundleEntry,
  ClearBoxItemsKind,
  Item,
  LocalSearchSnapshot,
  NotepadSnapshot,
  StorageCleanupResult,
  StorageUsageSnapshot,
  WorkbenchSnapshot,
} from "../shared/types";
import { matchesNormalizedSearch } from "../shared/search-normalization";
import { buildFingerprint } from "./dedupe";

export type DesktopStore = {
  getWorkbenchSnapshot: () => WorkbenchSnapshot;
  getNotepadSnapshot: () => NotepadSnapshot;
  createNotepadGroup: (name: string) => NotepadSnapshot;
  createNotepadNote: (groupId: number, content: string) => NotepadSnapshot;
  getAutoCaptureSnapshot: (query?: string) => AutoCaptureSnapshot;
  addAutoCaptureEntry: (imagePath: string, ocrText: string) => AutoCaptureSnapshot;
  pruneAutoCaptureEntriesBefore: (cutoffIso: string) => string[];
  deleteAutoCaptureEntry: (entryId: number) => AutoCaptureSnapshot;
  clearAutoCaptureEntries: () => AutoCaptureSnapshot;
  getAutoCaptureEntryPath: (entryId: number) => string | null;
  getAutoCaptureEntryPaths: (entryId?: number) => string[];
  getStorageUsage: (autoCaptureDirectory?: string) => StorageUsageSnapshot;
  cleanupOrphanedStorageFiles: (autoCaptureDirectory?: string) => StorageCleanupResult;
  searchLocal: (query: string, limit?: number) => LocalSearchSnapshot;
  captureTextOrLink: (input: string) => WorkbenchSnapshot;
  captureTextOrLinkIntoBox: (input: string, boxId: number) => WorkbenchSnapshot;
  captureImageData: (dataUrl: string, title?: string) => WorkbenchSnapshot;
  captureImageDataIntoBox: (dataUrl: string, title: string, boxId: number) => WorkbenchSnapshot;
  captureDroppedPaths: (paths: string[]) => WorkbenchSnapshot;
  captureDroppedPathsIntoBox: (paths: string[], boxId: number) => WorkbenchSnapshot;
  createBox: (name: string) => WorkbenchSnapshot;
  updateBox: (boxId: number, name: string, description: string) => WorkbenchSnapshot | null;
  reorderBox: (boxId: number, direction: "up" | "down") => WorkbenchSnapshot;
  deleteBox: (boxId: number) => WorkbenchSnapshot;
  clearBoxItems: (boxId: number, kind: ClearBoxItemsKind) => WorkbenchSnapshot;
  deleteItem: (itemId: number) => WorkbenchSnapshot;
  updateItemTitle: (itemId: number, title: string) => WorkbenchSnapshot | null;
  removeBundleEntry: (bundleItemId: number, entryPath: string) => WorkbenchSnapshot;
  groupItems: (sourceItemId: number, targetItemId: number) => WorkbenchSnapshot;
  moveItemToBox: (itemId: number, boxId: number) => WorkbenchSnapshot;
  moveItemToIndex: (itemId: number, targetIndex: number) => WorkbenchSnapshot;
  reorderItem: (itemId: number, direction: "up" | "down") => WorkbenchSnapshot;
  applyAiOrganization: (suggestions: AiOrganizationSuggestion[]) => WorkbenchSnapshot;
  selectBox: (boxId: number) => WorkbenchSnapshot;
  getBundleEntries: (bundleItemId: number) => BundleEntry[];
  updateLinkTitle: (itemId: number, title: string) => WorkbenchSnapshot | null;
  close: () => void;
};

export function createStore(filename: string): DesktopStore {
  const BOX_COLORS = ["#f97316", "#2563eb", "#16a34a", "#dc2626", "#d97706", "#0891b2"];
  const imageCaptureDirectory = resolve(dirname(filename), "image-captures");
  const imageThumbnailDirectory = resolve(dirname(filename), "image-thumbnails");
  const db = new Database(filename);
  db.exec(`
    create table if not exists boxes (
      id integer primary key autoincrement,
      name text not null,
      color text not null,
      description text not null default '',
      sort_order integer not null
    );
    create table if not exists items (
      id integer primary key autoincrement,
      box_id integer not null,
      bundle_parent_item_id integer,
      kind text not null,
      title text not null,
      content text not null default '',
      source_url text not null default '',
      source_path text not null default '',
      thumbnail_path text not null default '',
      capture_fingerprint text not null default '',
      sort_order integer not null default 0,
      created_at text not null default '',
      updated_at text not null default ''
    );
    create table if not exists bundle_entries (
      id integer primary key autoincrement,
      bundle_item_id integer not null,
      entry_path text not null,
      entry_kind text not null,
      sort_order integer not null
    );
    create table if not exists panel_state (
      id integer primary key check (id = 1),
      selected_box_id integer
    );
    create table if not exists notepad_groups (
      id integer primary key autoincrement,
      name text not null,
      sort_order integer not null,
      created_at text not null default '',
      updated_at text not null default ''
    );
    create table if not exists notepad_notes (
      id integer primary key autoincrement,
      group_id integer not null,
      content text not null,
      sort_order integer not null default 0,
      created_at text not null default '',
      updated_at text not null default ''
    );
    create table if not exists auto_capture_entries (
      id integer primary key autoincrement,
      image_path text not null,
      thumbnail_path text not null default '',
      ocr_text text not null default '',
      created_at text not null default ''
    );
  `);
  for (const statement of [
    "alter table items add column source_url text not null default ''",
    "alter table items add column source_path text not null default ''",
    "alter table items add column thumbnail_path text not null default ''",
    "alter table items add column sort_order integer not null default 0",
    "alter table items add column created_at text not null default ''",
    "alter table items add column updated_at text not null default ''",
    "alter table items add column bundle_parent_item_id integer",
    "alter table items add column capture_fingerprint text not null default ''",
    "alter table auto_capture_entries add column thumbnail_path text not null default ''",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists in previously bootstrapped databases.
    }
  }
  db.exec(
    "create index if not exists items_recent_capture_fingerprint on items (box_id, capture_fingerprint, created_at)"
  );
  db.exec("create index if not exists items_capture_fingerprint on items (box_id, capture_fingerprint)");
  db.exec("create index if not exists bundle_entries_entry_path on bundle_entries (entry_path)");
  db.exec("create index if not exists notepad_notes_group_sort on notepad_notes (group_id, sort_order)");
  db.exec("create index if not exists auto_capture_entries_created_at on auto_capture_entries (created_at)");
  db.exec("create index if not exists auto_capture_entries_ocr_text on auto_capture_entries (ocr_text)");

  const boxCount = db.prepare("select count(*) as count from boxes").get() as { count: number };
  if (boxCount.count === 0) {
    const info = db
      .prepare("insert into boxes (name, color, description, sort_order) values (?, ?, ?, ?)")
      .run("收件箱", "#f97316", "默认收集盒子", 0);
    db.prepare("insert or replace into panel_state (id, selected_box_id) values (1, ?)").run(
      Number(info.lastInsertRowid)
    );
  }

  const notepadGroupCount = db.prepare("select count(*) as count from notepad_groups").get() as { count: number };
  if (notepadGroupCount.count === 0) {
    const timestamp = new Date().toISOString();
    db.prepare("insert into notepad_groups (name, sort_order, created_at, updated_at) values (?, ?, ?, ?)").run(
      "默认",
      0,
      timestamp,
      timestamp
    );
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function isHttpUrl(value: string) {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  function deriveTextTitle(input: string) {
    const firstLine = input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return firstLine || "快速笔记";
  }

  function titleFromPath(filePath: string) {
    return basename(filePath) || filePath;
  }

  function isLikelyFolderPath(filePath: string) {
    return extname(filePath) === "";
  }

  function isImagePath(filePath: string) {
    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".ico", ".avif"].includes(
      extname(filePath).toLowerCase()
    );
  }

  function buildDroppedPathFingerprint(filePath: string) {
    return buildFingerprint(isImagePath(filePath) ? "image-path" : "file", filePath.toLowerCase());
  }

  function getImageMimeType(filePath: string) {
    switch (extname(filePath).toLowerCase()) {
      case ".jpg":
      case ".jpeg":
        return "image/jpeg";
      case ".webp":
        return "image/webp";
      case ".gif":
        return "image/gif";
      case ".bmp":
        return "image/bmp";
      case ".svg":
        return "image/svg+xml";
      case ".avif":
        return "image/avif";
      default:
        return "image/png";
    }
  }

  function getImageExtensionFromMimeType(mimeType: string) {
    switch (mimeType.toLowerCase()) {
      case "image/jpeg":
        return "jpg";
      case "image/webp":
        return "webp";
      case "image/gif":
        return "gif";
      case "image/bmp":
        return "bmp";
      case "image/svg+xml":
        return "svg";
      case "image/avif":
        return "avif";
      default:
        return "png";
    }
  }

  function parseImageDataUrl(dataUrl: string) {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/is.exec(dataUrl.trim());
    if (!match) {
      return null;
    }

    const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
    if (buffer.length === 0) {
      return null;
    }

    return {
      buffer,
      extension: getImageExtensionFromMimeType(match[1]),
    };
  }

  function buildImageCaptureFilename(title: string, fingerprint: string, extension: string, itemId?: number) {
    const titleStem = basename(title, extname(title))
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const hash = fingerprint.replace(/^image:/, "").slice(0, 16);
    const idPrefix = itemId == null ? "" : `${itemId}-`;
    const titleSuffix = titleStem ? `-${titleStem}` : "";
    return `${idPrefix}${timestamp}-${hash}${titleSuffix}.${extension}`;
  }

  function scaleToMaxEdge(width: number, height: number, maxEdge: number) {
    const safeWidth = Math.max(1, Math.round(width));
    const safeHeight = Math.max(1, Math.round(height));
    const longestEdge = Math.max(safeWidth, safeHeight);
    if (longestEdge <= maxEdge) {
      return {
        width: safeWidth,
        height: safeHeight,
      };
    }

    const scale = maxEdge / longestEdge;
    return {
      width: Math.max(1, Math.round(safeWidth * scale)),
      height: Math.max(1, Math.round(safeHeight * scale)),
    };
  }

  function buildThumbnailFilename(imagePath: string) {
    const stem = basename(imagePath, extname(imagePath))
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "image";
    const hash = buildFingerprint("thumbnail", imagePath).replace(/^thumbnail:/, "").slice(0, 12);
    return `${stem}-${hash}.jpg`;
  }

  function createImageThumbnail(imagePath: string) {
    try {
      const image = nativeImage.createFromPath(imagePath);
      if (image.isEmpty()) {
        return "";
      }

      const size = image.getSize();
      const targetSize = scaleToMaxEdge(size.width, size.height, 360);
      fs.mkdirSync(imageThumbnailDirectory, { recursive: true });
      const thumbnailPath = join(imageThumbnailDirectory, buildThumbnailFilename(imagePath));
      const thumbnail = image.resize({ ...targetSize, quality: "good" }).toJPEG(68);
      fs.writeFileSync(thumbnailPath, thumbnail);
      return thumbnailPath;
    } catch {
      return "";
    }
  }

  function saveImageDataUrl(dataUrl: string, title: string, fingerprint: string, itemId?: number) {
    const parsed = parseImageDataUrl(dataUrl);
    if (!parsed) {
      return null;
    }

    fs.mkdirSync(imageCaptureDirectory, { recursive: true });
    const imagePath = join(
      imageCaptureDirectory,
      buildImageCaptureFilename(title, fingerprint, parsed.extension, itemId)
    );
    fs.writeFileSync(imagePath, parsed.buffer);
    return imagePath;
  }

  function getImageDisplayUrl(imagePath: string) {
    try {
      const image = fs.readFileSync(imagePath);
      return `data:${getImageMimeType(imagePath)};base64,${image.toString("base64")}`;
    } catch {
      return "";
    }
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

  function getItemKindLabel(kind: string) {
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

  function getSearchPreview(parts: Array<string | null | undefined>, fallback: string) {
    const preview = parts.map((part) => part?.trim() ?? "").find(Boolean) ?? fallback;
    return preview.length > 92 ? `${preview.slice(0, 92).trimEnd()}...` : preview;
  }

  function getPathStat(targetPath: string) {
    try {
      return fs.statSync(targetPath);
    } catch {
      return null;
    }
  }

  function getPathSize(targetPath: string): number {
    if (!targetPath || !fs.existsSync(targetPath)) {
      return 0;
    }

    const stat = getPathStat(targetPath);
    if (!stat) {
      return 0;
    }

    if (stat.isFile()) {
      return stat.size;
    }

    if (!stat.isDirectory()) {
      return 0;
    }

    return fs.readdirSync(targetPath).reduce((total, entryName) => total + getPathSize(join(targetPath, entryName)), 0);
  }

  function getDatabaseBytes() {
    return [filename, `${filename}-wal`, `${filename}-shm`].reduce((total, path) => total + getPathSize(path), 0);
  }

  function readStorageUsage(autoCaptureDirectory = ""): StorageUsageSnapshot {
    const databaseBytes = getDatabaseBytes();
    const imageBytes = getPathSize(imageCaptureDirectory);
    const thumbnailBytes = getPathSize(imageThumbnailDirectory);
    const autoCaptureBytes = autoCaptureDirectory ? getPathSize(autoCaptureDirectory) : 0;

    return {
      databaseBytes,
      imageBytes,
      thumbnailBytes,
      autoCaptureBytes,
      totalBytes: databaseBytes + imageBytes + thumbnailBytes + autoCaptureBytes,
    };
  }

  function normalizeStoragePath(targetPath: string) {
    return resolve(targetPath).toLowerCase();
  }

  function getReferencedStoragePaths() {
    const referencedPaths = new Set<string>();
    const imageRows = db
      .prepare("select source_path as sourcePath, thumbnail_path as thumbnailPath from items where kind = 'image'")
      .all() as Array<{ sourcePath: string; thumbnailPath: string }>;
    const autoCaptureRows = db
      .prepare("select image_path as imagePath, thumbnail_path as thumbnailPath from auto_capture_entries")
      .all() as Array<{ imagePath: string; thumbnailPath: string }>;

    imageRows.forEach((row) => {
      [row.sourcePath, row.thumbnailPath].filter(Boolean).forEach((path) => referencedPaths.add(normalizeStoragePath(path)));
    });
    autoCaptureRows.forEach((row) => {
      [row.imagePath, row.thumbnailPath].filter(Boolean).forEach((path) => referencedPaths.add(normalizeStoragePath(path)));
    });

    return referencedPaths;
  }

  function collectFiles(directory: string): string[] {
    if (!directory || !fs.existsSync(directory)) {
      return [];
    }

    const stat = getPathStat(directory);
    if (!stat?.isDirectory()) {
      return [];
    }

    return fs.readdirSync(directory).flatMap((entryName) => {
      const targetPath = join(directory, entryName);
      const entryStat = getPathStat(targetPath);
      if (!entryStat) {
        return [];
      }

      if (entryStat.isDirectory()) {
        return collectFiles(targetPath);
      }

      return entryStat.isFile() ? [targetPath] : [];
    });
  }

  function cleanupOrphanedStorageFiles(autoCaptureDirectory = ""): StorageCleanupResult {
    const referencedPaths = getReferencedStoragePaths();
    const directories = [imageCaptureDirectory, imageThumbnailDirectory, autoCaptureDirectory].filter(Boolean);
    const uniqueFiles = Array.from(new Set(directories.flatMap((directory) => collectFiles(directory))));
    let removedFiles = 0;
    let removedBytes = 0;

    uniqueFiles.forEach((filePath) => {
      if (referencedPaths.has(normalizeStoragePath(filePath))) {
        return;
      }

      const fileBytes = getPathSize(filePath);
      try {
        fs.rmSync(filePath, { force: true });
        removedFiles += 1;
        removedBytes += fileBytes;
      } catch {
        // Cleanup is best-effort; a locked file should not block the rest.
      }
    });

    return {
      usage: readStorageUsage(autoCaptureDirectory),
      removedFiles,
      removedBytes,
    };
  }

  function searchLocal(query: string, limit = 8): LocalSearchSnapshot {
    const trimmedQuery = query.trim();
    const safeLimit = Math.max(1, Math.min(50, Math.round(limit || 8)));
    if (!trimmedQuery) {
      return {
        query: "",
        results: [],
      };
    }

    const workbench = readWorkbenchSnapshot();
    const boxesById = new Map(workbench.boxes.map((box) => [box.id, box]));
    const workbenchResults = workbench.items
      .filter((item) => item.bundleParentId == null)
      .filter((item) => {
        const box = boxesById.get(item.boxId);
        return matchesNormalizedSearch(
          [
            item.title,
            item.content,
            item.sourceUrl,
            item.sourcePath,
            box?.name,
            getItemKindLabel(item.kind),
            item.createdAt,
            item.updatedAt,
          ],
          trimmedQuery
        );
      })
      .map((item) => {
        const box = boxesById.get(item.boxId);
        const title = item.title.trim() || getItemKindLabel(item.kind);
        return {
          id: `workbench:${item.id}`,
          source: "workbench" as const,
          title,
          preview: getSearchPreview(
            [item.content, item.sourceUrl, item.sourcePath, item.title],
            getItemKindLabel(item.kind)
          ),
          boxId: item.boxId,
          boxName: box?.name ?? "未知盒子",
          item,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        };
      });

    const autoCaptureResults = readAutoCaptureSnapshot(trimmedQuery).entries.map((entry) => {
      const formattedTime = formatLocalDateTime(entry.createdAt);
      return {
        id: `auto-capture:${entry.id}`,
        source: "autoCapture" as const,
        title: `自动记录 ${formattedTime}`,
        preview: getSearchPreview([entry.ocrText, entry.imagePath], "暂无 OCR 文本"),
        entry,
        createdAt: entry.createdAt,
      };
    });

    return {
      query: trimmedQuery,
      results: [...workbenchResults, ...autoCaptureResults]
        .sort((left, right) => {
          const leftTime = new Date(left.source === "workbench" ? left.updatedAt : left.createdAt).getTime();
          const rightTime = new Date(right.source === "workbench" ? right.updatedAt : right.createdAt).getTime();
          if (rightTime !== leftTime) {
            return rightTime - leftTime;
          }
          return right.id.localeCompare(left.id);
        })
        .slice(0, safeLimit),
    };
  }

  function readWorkbenchSnapshot(): WorkbenchSnapshot {
    const boxes = db
      .prepare(
        "select id, name, color, description, sort_order as sortOrder from boxes order by sort_order asc"
      )
      .all() as Box[];
    const rawItems = db
      .prepare(
        "select items.id, items.box_id as boxId, items.bundle_parent_item_id as bundleParentId, items.kind, items.title, items.content, items.source_url as sourceUrl, items.source_path as sourcePath, items.thumbnail_path as thumbnailPath, coalesce(bundle_entry_counts.bundleEntryCount, 0) as bundleEntryCount, items.sort_order as sortOrder, items.created_at as createdAt, items.updated_at as updatedAt from items left join (select bundle_item_id, count(*) as bundleEntryCount from bundle_entries group by bundle_item_id) bundle_entry_counts on bundle_entry_counts.bundle_item_id = items.id order by items.box_id asc, coalesce(items.bundle_parent_item_id, items.id) asc, items.sort_order asc, items.id desc"
      )
      .all() as Array<Item & { bundleParentId: number | null; bundleEntryCount: number; thumbnailPath: string }>;
    const bundleChildCounts = rawItems.reduce<Record<number, number>>((counts, item) => {
      if (item.bundleParentId != null) {
        counts[item.bundleParentId] = (counts[item.bundleParentId] ?? 0) + 1;
      }
      return counts;
    }, {});
    const items = rawItems.map(({ bundleEntryCount, thumbnailPath, ...item }) => ({
      ...item,
      bundleParentId: item.bundleParentId ?? null,
      thumbnailUrl: item.kind === "image" && thumbnailPath ? getImageDisplayUrl(thumbnailPath) : undefined,
      bundleCount: bundleEntryCount + (bundleChildCounts[item.id] ?? 0),
    })) as Item[];
    const panelStateRow = db
      .prepare("select selected_box_id as selectedBoxId from panel_state where id = 1")
      .get() as
      | {
          selectedBoxId: number | null;
        }
      | undefined;

    return {
      boxes,
      items,
      panelState: panelStateRow
        ? {
            selectedBoxId: panelStateRow.selectedBoxId,
          }
        : {
            selectedBoxId: boxes[0]?.id ?? null,
          },
    };
  }

  function readNotepadSnapshot(): NotepadSnapshot {
    const groups = db
      .prepare(
        "select id, name, sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt from notepad_groups order by sort_order asc, id asc"
      )
      .all() as NotepadSnapshot["groups"];
    const notes = db
      .prepare(
        "select id, group_id as groupId, content, sort_order as sortOrder, created_at as createdAt, updated_at as updatedAt from notepad_notes order by group_id asc, sort_order asc, id desc"
      )
      .all() as NotepadSnapshot["notes"];

    return { groups, notes };
  }

  function readAutoCaptureSnapshot(query = ""): AutoCaptureSnapshot {
    const normalizedQuery = query.trim().toLowerCase();
    const rows = db
      .prepare(
        `select id, image_path as imagePath, thumbnail_path as thumbnailPath, ocr_text as ocrText, created_at as createdAt
         from auto_capture_entries
         order by created_at desc, id desc`
      )
      .all() as Array<Omit<AutoCaptureSnapshot["entries"][number], "imageUrl" | "thumbnailUrl"> & { thumbnailPath: string }>;
    const entries = rows
      .filter((entry) => {
        return !normalizedQuery || matchesNormalizedSearch([entry.ocrText, entry.imagePath, entry.createdAt], query);
      })
      .map((entry) => ({
        ...entry,
        imageUrl: getImageDisplayUrl(entry.imagePath),
        thumbnailUrl: getImageDisplayUrl(entry.thumbnailPath || entry.imagePath),
      }));

    return {
      entries,
      running: false,
      paused: true,
      pauseReason: "manual",
      intervalMs: 60_000,
      lastError: "",
      ocrAvailable: false,
      ocrStatus: "",
    };
  }

  function getAutoCaptureEntryPaths(entryId?: number) {
    if (entryId != null) {
      const rows = db
        .prepare("select image_path as imagePath, thumbnail_path as thumbnailPath from auto_capture_entries where id = ?")
        .all(entryId) as Array<{ imagePath: string; thumbnailPath: string }>;
      return rows.flatMap((row) => [row.imagePath, row.thumbnailPath].filter(Boolean));
    }

    const rows = db
      .prepare(
        "select image_path as imagePath, thumbnail_path as thumbnailPath from auto_capture_entries order by created_at desc, id desc"
      )
      .all() as Array<{ imagePath: string; thumbnailPath: string }>;
    return rows.flatMap((row) => [row.imagePath, row.thumbnailPath].filter(Boolean));
  }

  function pruneAutoCaptureEntriesBefore(cutoffIso: string) {
    const trimmedCutoff = cutoffIso.trim();
    if (!trimmedCutoff) {
      return [];
    }

    const removedRows = db
      .prepare(
        `select image_path as imagePath, thumbnail_path as thumbnailPath
         from auto_capture_entries
         where created_at < ?`
      )
      .all(trimmedCutoff) as Array<{ imagePath: string; thumbnailPath: string }>;

    db.prepare("delete from auto_capture_entries where created_at < ?").run(trimmedCutoff);

    return removedRows.flatMap((row) => [row.imagePath, row.thumbnailPath].filter(Boolean));
  }

  function migrateImageDataUrlsToFiles() {
    const rows = db
      .prepare(
        "select id, title, content, source_path as sourcePath from items where kind = 'image' and content like 'data:image/%'"
      )
      .all() as Array<{ id: number; title: string; content: string; sourcePath: string }>;
    if (rows.length === 0) {
      return;
    }

    const updateImage = db.prepare("update items set content = ?, source_path = ?, thumbnail_path = ?, updated_at = ? where id = ?");
    rows.forEach((row) => {
      const fingerprint = buildFingerprint("image", row.content);
      const imagePath = saveImageDataUrl(row.content, row.title || `image-${row.id}`, fingerprint, row.id);
      if (!imagePath) {
        return;
      }

      const thumbnailPath = createImageThumbnail(imagePath);
      updateImage.run(pathToFileURL(imagePath).href, imagePath, thumbnailPath, nowIso(), row.id);
    });
  }

  function ensureImageItemThumbnails() {
    const rows = db
      .prepare(
        "select id, source_path as sourcePath from items where kind = 'image' and source_path != '' and thumbnail_path = ''"
      )
      .all() as Array<{ id: number; sourcePath: string }>;
    if (rows.length === 0) {
      return;
    }

    const updateThumbnail = db.prepare("update items set thumbnail_path = ?, updated_at = ? where id = ?");
    rows.forEach((row) => {
      const thumbnailPath = createImageThumbnail(row.sourcePath);
      if (thumbnailPath) {
        updateThumbnail.run(thumbnailPath, nowIso(), row.id);
      }
    });
  }

  function ensureAutoCaptureThumbnails() {
    const rows = db
      .prepare(
        "select id, image_path as imagePath from auto_capture_entries where image_path != '' and thumbnail_path = ''"
      )
      .all() as Array<{ id: number; imagePath: string }>;
    if (rows.length === 0) {
      return;
    }

    const updateThumbnail = db.prepare("update auto_capture_entries set thumbnail_path = ? where id = ?");
    rows.forEach((row) => {
      const thumbnailPath = createImageThumbnail(row.imagePath);
      if (thumbnailPath) {
        updateThumbnail.run(thumbnailPath, row.id);
      }
    });
  }

  function getNextNotepadGroupSortOrder() {
    const snapshot = readNotepadSnapshot();
    return snapshot.groups.reduce((highest, group) => Math.max(highest, group.sortOrder), -1) + 1;
  }

  function getNextNotepadNoteSortOrder(groupId: number) {
    const row = db
      .prepare("select min(sort_order) as sortOrder from notepad_notes where group_id = ?")
      .get(groupId) as { sortOrder: number | null } | undefined;
    return (row?.sortOrder ?? 1) - 1;
  }

  function ensureNotepadGroup(groupId: number) {
    return readNotepadSnapshot().groups.some((group) => group.id === groupId);
  }

  function hasCaptureDuplicate(boxId: number, fingerprint: string) {
    const existing = db
      .prepare(
        "select id from items where box_id = ? and capture_fingerprint = ? limit 1"
      )
      .get(boxId, fingerprint) as { id: number } | undefined;
    return Boolean(existing);
  }

  function hasBundleEntryDuplicate(boxId: number, entryPath: string) {
    const existing = db
      .prepare(
        "select bundle_entries.id from bundle_entries inner join items on items.id = bundle_entries.bundle_item_id where items.box_id = ? and items.bundle_parent_item_id is null and lower(bundle_entries.entry_path) = ? limit 1"
      )
      .get(boxId, entryPath.toLowerCase()) as { id: number } | undefined;
    return Boolean(existing);
  }

  function hasDroppedPathDuplicate(boxId: number, entryPath: string) {
    return (
      hasCaptureDuplicate(boxId, buildDroppedPathFingerprint(entryPath)) ||
      hasBundleEntryDuplicate(boxId, entryPath)
    );
  }

  function writePanelState(selectedBoxId: number | null) {
    db.prepare("insert or replace into panel_state (id, selected_box_id) values (1, ?)").run(selectedBoxId);
  }

  function getTargetBoxId() {
    const snapshot = readWorkbenchSnapshot();
    return snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null;
  }

  function getNextBoxSortOrder() {
    const snapshot = readWorkbenchSnapshot();
    const maxSortOrder = snapshot.boxes.reduce((highest, box) => Math.max(highest, box.sortOrder), -1);
    return maxSortOrder + 1;
  }

  function getNextBottomSortOrder(boxId: number) {
    const row = db
      .prepare("select max(sort_order) as sortOrder from items where box_id = ? and bundle_parent_item_id is null")
      .get(boxId) as { sortOrder: number | null } | undefined;
    return (row?.sortOrder ?? -1) + 1;
  }

  function nextBoxColor() {
    const snapshot = readWorkbenchSnapshot();
    return BOX_COLORS[snapshot.boxes.length % BOX_COLORS.length] ?? BOX_COLORS[0];
  }

  function getNextTopSortOrder(boxId: number) {
    const row = db
      .prepare("select min(sort_order) as sortOrder from items where box_id = ? and bundle_parent_item_id is null")
      .get(boxId) as { sortOrder: number | null } | undefined;
    return (row?.sortOrder ?? 1) - 1;
  }

  function listItemsInBox(boxId: number) {
    return db
      .prepare(
        "select id, box_id as boxId, sort_order as sortOrder from items where box_id = ? and bundle_parent_item_id is null order by sort_order asc, id desc"
      )
      .all(boxId) as Array<{ id: number; boxId: number; sortOrder: number }>;
  }

  function getNextBundleMemberSortOrder(bundleItemId: number) {
    const row = db
      .prepare("select max(sort_order) as sortOrder from items where bundle_parent_item_id = ?")
      .get(bundleItemId) as { sortOrder: number | null } | undefined;
    return (row?.sortOrder ?? -1) + 1;
  }

  function dissolveBundleIfNeeded(bundleItemId: number) {
    const snapshot = readWorkbenchSnapshot();
    const bundleItem = snapshot.items.find((entry) => entry.id === bundleItemId && entry.kind === "bundle");
    if (!bundleItem) {
      return snapshot;
    }

    const memberItems = snapshot.items
      .filter((entry) => entry.bundleParentId === bundleItemId)
      .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0));

    if (memberItems.length > 1) {
      return snapshot;
    }

    const timestamp = nowIso();
    if (memberItems.length === 1) {
      db.prepare(`
        update items
        set bundle_parent_item_id = ?, sort_order = ?, updated_at = ?
        where id = ?
      `).run(null, bundleItem.sortOrder, timestamp, memberItems[0].id);
    }

    db.prepare("delete from bundle_entries where bundle_item_id = ?").run(bundleItemId);
    db.prepare("delete from items where id = ?").run(bundleItemId);
    normalizeItemSortOrders(bundleItem.boxId);
    return readWorkbenchSnapshot();
  }

  function normalizeItemSortOrders(boxId: number) {
    const items = listItemsInBox(boxId);
    const seen = new Set<number>();
    let needsNormalization = false;

    for (const item of items) {
      if (seen.has(item.sortOrder)) {
        needsNormalization = true;
        break;
      }
      seen.add(item.sortOrder);
    }

    if (!needsNormalization) {
      return items;
    }

    const updateSortOrder = db.prepare("update items set sort_order = ? where id = ?");
    items.forEach((item, index) => {
      updateSortOrder.run(index, item.id);
    });

    return listItemsInBox(boxId);
  }

  function normalizeBoxSortOrders() {
    const snapshot = readWorkbenchSnapshot();
    const boxes = snapshot.boxes.slice().sort((left, right) => left.sortOrder - right.sortOrder);
    const updateSortOrder = db.prepare("update boxes set sort_order = ? where id = ?");
    boxes.forEach((box, index) => {
      updateSortOrder.run(index, box.id);
    });
  }

  function persistDroppedPaths(paths: string[], targetBoxId: number | null) {
    const cleanedPaths = paths.map((value) => value.trim()).filter(Boolean);
    if (!cleanedPaths.length || targetBoxId == null) {
      return readWorkbenchSnapshot();
    }

    const timestamp = nowIso();
    const seenFingerprints = new Set<string>();
    const uniquePaths = cleanedPaths.filter((entryPath) => {
      const fingerprint = buildDroppedPathFingerprint(entryPath);
      if (seenFingerprints.has(fingerprint)) {
        return false;
      }
      seenFingerprints.add(fingerprint);
      return !hasDroppedPathDuplicate(targetBoxId, entryPath);
    });
    if (!uniquePaths.length) {
      return readWorkbenchSnapshot();
    }

    const shouldBundle = uniquePaths.length > 1 || uniquePaths.some(isLikelyFolderPath);
    const fingerprint = shouldBundle
      ? buildFingerprint("bundle", uniquePaths.map((entryPath) => entryPath.toLowerCase()).join("\n"))
      : buildDroppedPathFingerprint(uniquePaths[0]);
    const sortOrder = getNextTopSortOrder(targetBoxId);

    if (!shouldBundle) {
      const singlePath = uniquePaths[0];
      const imagePath = isImagePath(singlePath);
      db.prepare(`
        insert into items (box_id, kind, title, content, source_url, source_path, thumbnail_path, capture_fingerprint, sort_order, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetBoxId,
        imagePath ? "image" : "file",
        titleFromPath(singlePath),
        imagePath ? pathToFileURL(singlePath).href : singlePath,
        "",
        singlePath,
        imagePath ? createImageThumbnail(singlePath) : "",
        fingerprint,
        sortOrder,
        timestamp,
        timestamp
      );
      return readWorkbenchSnapshot();
    }

    const summary = `${uniquePaths.length} 个项目`;
    const result = db.prepare(`
      insert into items (box_id, kind, title, content, source_url, source_path, capture_fingerprint, sort_order, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetBoxId,
      "bundle",
      "拖入组合",
      summary,
      "",
      "",
      fingerprint,
      sortOrder,
      timestamp,
      timestamp
    ) as { lastInsertRowid: number | bigint };

    const bundleItemId = Number(result.lastInsertRowid);
    const insertEntry = db.prepare(`
      insert into bundle_entries (bundle_item_id, entry_path, entry_kind, sort_order)
      values (?, ?, ?, ?)
    `);

    uniquePaths.forEach((entryPath, index) => {
      insertEntry.run(bundleItemId, entryPath, isLikelyFolderPath(entryPath) ? "folder" : "file", index);
    });

    return readWorkbenchSnapshot();
  }

  function persistTextOrLink(input: string, targetBoxId: number | null) {
    const trimmed = input.trim();
    if (!trimmed || !targetBoxId) {
      return readWorkbenchSnapshot();
    }

    const isLink = isHttpUrl(trimmed);
    const timestamp = nowIso();
    const fingerprint = buildFingerprint("text", trimmed);
    if (hasCaptureDuplicate(targetBoxId, fingerprint)) {
      return readWorkbenchSnapshot();
    }

    const sortOrder = getNextTopSortOrder(targetBoxId);

    db.prepare(`
      insert into items (box_id, kind, title, content, source_url, source_path, capture_fingerprint, sort_order, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetBoxId,
      isLink ? "link" : "text",
      isLink ? trimmed : deriveTextTitle(trimmed),
      isLink ? trimmed : trimmed,
      isLink ? trimmed : "",
      "",
      fingerprint,
      sortOrder,
      timestamp,
      timestamp
    );

    return readWorkbenchSnapshot();
  }

  function persistImageData(dataUrl: string, title: string, targetBoxId: number | null) {
    const trimmedDataUrl = dataUrl.trim();
    const trimmedTitle = title.trim();
    if (!trimmedDataUrl || !targetBoxId) {
      return readWorkbenchSnapshot();
    }

    const timestamp = nowIso();
    const fingerprint = buildFingerprint("image", trimmedDataUrl);
    if (hasCaptureDuplicate(targetBoxId, fingerprint)) {
      return readWorkbenchSnapshot();
    }

    const imagePath = saveImageDataUrl(trimmedDataUrl, trimmedTitle || "粘贴图片", fingerprint);
    const content = imagePath ? pathToFileURL(imagePath).href : trimmedDataUrl;
    const sourceUrl = !imagePath && isHttpUrl(trimmedDataUrl) ? trimmedDataUrl : "";
    const sourcePath = imagePath ?? "";
    const thumbnailPath = imagePath ? createImageThumbnail(imagePath) : "";
    const sortOrder = getNextTopSortOrder(targetBoxId);

    db.prepare(`
      insert into items (box_id, kind, title, content, source_url, source_path, thumbnail_path, capture_fingerprint, sort_order, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetBoxId,
      "image",
      trimmedTitle || "粘贴图片",
      content,
      sourceUrl,
      sourcePath,
      thumbnailPath,
      fingerprint,
      sortOrder,
      timestamp,
      timestamp
    );

    return readWorkbenchSnapshot();
  }

  migrateImageDataUrlsToFiles();
  ensureImageItemThumbnails();
  ensureAutoCaptureThumbnails();

  return {
    getWorkbenchSnapshot: readWorkbenchSnapshot,
    getNotepadSnapshot: readNotepadSnapshot,
    getAutoCaptureSnapshot: readAutoCaptureSnapshot,
    addAutoCaptureEntry(imagePath: string, ocrText: string): AutoCaptureSnapshot {
      const trimmedPath = imagePath.trim();
      if (!trimmedPath) {
        return readAutoCaptureSnapshot();
      }

      const timestamp = nowIso();
      const thumbnailPath = createImageThumbnail(trimmedPath);
      db.prepare("insert into auto_capture_entries (image_path, thumbnail_path, ocr_text, created_at) values (?, ?, ?, ?)").run(
        trimmedPath,
        thumbnailPath,
        ocrText.trim(),
        timestamp
      );
      return readAutoCaptureSnapshot();
    },
    pruneAutoCaptureEntriesBefore,
    deleteAutoCaptureEntry(entryId: number): AutoCaptureSnapshot {
      db.prepare("delete from auto_capture_entries where id = ?").run(entryId);
      return readAutoCaptureSnapshot();
    },
    clearAutoCaptureEntries(): AutoCaptureSnapshot {
      db.prepare("delete from auto_capture_entries").run();
      return readAutoCaptureSnapshot();
    },
    getAutoCaptureEntryPath(entryId: number): string | null {
      const row = db
        .prepare("select image_path as imagePath from auto_capture_entries where id = ?")
        .get(entryId) as { imagePath: string } | undefined;
      return row?.imagePath ?? null;
    },
    getAutoCaptureEntryPaths,
    getStorageUsage: readStorageUsage,
    cleanupOrphanedStorageFiles,
    searchLocal,
    createNotepadGroup(name: string): NotepadSnapshot {
      const trimmed = name.trim();
      if (!trimmed) {
        return readNotepadSnapshot();
      }

      const timestamp = nowIso();
      db.prepare("insert into notepad_groups (name, sort_order, created_at, updated_at) values (?, ?, ?, ?)").run(
        trimmed,
        getNextNotepadGroupSortOrder(),
        timestamp,
        timestamp
      );
      return readNotepadSnapshot();
    },
    createNotepadNote(groupId: number, content: string): NotepadSnapshot {
      const trimmed = content.trim();
      if (!trimmed || !ensureNotepadGroup(groupId)) {
        return readNotepadSnapshot();
      }

      const timestamp = nowIso();
      db.prepare("insert into notepad_notes (group_id, content, sort_order, created_at, updated_at) values (?, ?, ?, ?, ?)").run(
        groupId,
        trimmed,
        getNextNotepadNoteSortOrder(groupId),
        timestamp,
        timestamp
      );
      return readNotepadSnapshot();
    },
    captureTextOrLink(input: string): WorkbenchSnapshot {
      return persistTextOrLink(input, getTargetBoxId());
    },
    captureTextOrLinkIntoBox(input: string, boxId: number): WorkbenchSnapshot {
      return persistTextOrLink(input, boxId);
    },
    captureImageData(dataUrl: string, title = "粘贴图片"): WorkbenchSnapshot {
      return persistImageData(dataUrl, title, getTargetBoxId());
    },
    captureImageDataIntoBox(dataUrl: string, title: string, boxId: number): WorkbenchSnapshot {
      return persistImageData(dataUrl, title, boxId);
    },
    captureDroppedPaths(paths: string[]): WorkbenchSnapshot {
      return persistDroppedPaths(paths, getTargetBoxId());
    },
    captureDroppedPathsIntoBox(paths: string[], boxId: number): WorkbenchSnapshot {
      return persistDroppedPaths(paths, boxId);
    },
    createBox(name: string): WorkbenchSnapshot {
      const trimmed = name.trim();
      if (!trimmed) {
        return readWorkbenchSnapshot();
      }

      const result = db
        .prepare("insert into boxes (name, color, description, sort_order) values (?, ?, ?, ?)")
        .run(trimmed, nextBoxColor(), "", getNextBoxSortOrder()) as { lastInsertRowid: number | bigint };
      const boxId = Number(result.lastInsertRowid);
      writePanelState(boxId);

      return readWorkbenchSnapshot();
    },
    updateBox(boxId: number, name: string, description: string): WorkbenchSnapshot | null {
      const trimmedName = name.trim();
      const trimmedDescription = description.trim();
      if (!trimmedName) {
        return null;
      }

      const result = db
        .prepare("update boxes set name = ?, description = ? where id = ?")
        .run(trimmedName, trimmedDescription, boxId) as {
          changes?: number;
        };
      return Number(result.changes ?? 0) > 0 ? readWorkbenchSnapshot() : null;
    },
    reorderBox(boxId: number, direction: "up" | "down"): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      const boxes = snapshot.boxes.slice().sort((left, right) => left.sortOrder - right.sortOrder);
      const currentIndex = boxes.findIndex((box) => box.id === boxId);
      if (currentIndex === -1) {
        return snapshot;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      const sibling = boxes[targetIndex];
      if (!sibling) {
        return snapshot;
      }

      db.prepare("update boxes set sort_order = ? where id = ?").run(sibling.sortOrder, boxId);
      db.prepare("update boxes set sort_order = ? where id = ?").run(boxes[currentIndex].sortOrder, sibling.id);
      return readWorkbenchSnapshot();
    },
    deleteBox(boxId: number): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      const protectedBoxId = snapshot.boxes.reduce(
        (lowestId, box) => (box.id < lowestId ? box.id : lowestId),
        Number.POSITIVE_INFINITY
      );
      const fallbackBox = snapshot.boxes.find((box) => box.id === protectedBoxId);
      if (!fallbackBox || boxId === fallbackBox.id) {
        return snapshot;
      }

      const targetBox = snapshot.boxes.find((box) => box.id === boxId);
      if (!targetBox) {
        return snapshot;
      }

      const movedItems = snapshot.items
        .filter((item) => item.boxId === boxId)
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder || right.id - left.id);
      const timestamp = nowIso();
      const updateItemBox = db.prepare(`
        update items
        set box_id = ?, sort_order = ?, updated_at = ?
        where id = ?
      `);
      let nextSortOrder = getNextBottomSortOrder(fallbackBox.id);
      movedItems.forEach((item) => {
        updateItemBox.run(fallbackBox.id, nextSortOrder, timestamp, item.id);
        nextSortOrder += 1;
      });

      db.prepare("delete from boxes where id = ?").run(boxId);
      normalizeBoxSortOrders();

      const nextSelectedBoxId =
        snapshot.panelState.selectedBoxId === boxId ? fallbackBox.id : snapshot.panelState.selectedBoxId;
      writePanelState(nextSelectedBoxId);

      return readWorkbenchSnapshot();
    },
    clearBoxItems(boxId: number, kind: ClearBoxItemsKind): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      if (!snapshot.boxes.some((box) => box.id === boxId)) {
        return snapshot;
      }

      const boxItems = snapshot.items.filter((item) => item.boxId === boxId);
      const deleteBundleEntries = db.prepare("delete from bundle_entries where bundle_item_id = ?");
      const deleteItemStatement = db.prepare("delete from items where id = ?");

      if (kind === "all") {
        boxItems.forEach((item) => {
          deleteBundleEntries.run(item.id);
          deleteItemStatement.run(item.id);
        });
        return readWorkbenchSnapshot();
      }

      if (kind === "bundle") {
        const bundleItems = boxItems.filter((item) => item.kind === "bundle");
        bundleItems.forEach((bundleItem) => {
          const childItems = boxItems.filter((item) => item.bundleParentId === bundleItem.id);
          childItems.forEach((childItem) => {
            deleteBundleEntries.run(childItem.id);
            deleteItemStatement.run(childItem.id);
          });
          deleteBundleEntries.run(bundleItem.id);
          deleteItemStatement.run(bundleItem.id);
        });
        normalizeItemSortOrders(boxId);
        return readWorkbenchSnapshot();
      }

      const affectedBundleIds = new Set<number>();
      boxItems
        .filter((item) => item.kind === kind)
        .forEach((item) => {
          if (item.bundleParentId != null) {
            affectedBundleIds.add(item.bundleParentId);
          }
          deleteBundleEntries.run(item.id);
          deleteItemStatement.run(item.id);
        });

      affectedBundleIds.forEach((bundleItemId) => {
        dissolveBundleIfNeeded(bundleItemId);
      });
      normalizeItemSortOrders(boxId);
      return readWorkbenchSnapshot();
    },
    deleteItem(itemId: number): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      const item = snapshot.items.find((entry) => entry.id === itemId);
      if (!item) {
        return snapshot;
      }

      const childItemIds = snapshot.items
        .filter((entry) => entry.bundleParentId === itemId)
        .map((entry) => entry.id);
      const deleteItemStatement = db.prepare("delete from items where id = ?");

      const exists = db
        .prepare("select id from items where id = ?")
        .get(itemId) as { id: number } | undefined;
      if (!exists) {
        return readWorkbenchSnapshot();
      }

      db.prepare("delete from bundle_entries where bundle_item_id = ?").run(itemId);
      childItemIds.forEach((childItemId) => {
        db.prepare("delete from bundle_entries where bundle_item_id = ?").run(childItemId);
        deleteItemStatement.run(childItemId);
      });
      deleteItemStatement.run(itemId);

      return readWorkbenchSnapshot();
    },
    updateItemTitle(itemId: number, title: string): WorkbenchSnapshot | null {
      const trimmed = title.trim();
      if (!trimmed) {
        return null;
      }

      const result = db.prepare(`
        update items
        set title = ?, updated_at = ?
        where id = ?
      `).run(trimmed, nowIso(), itemId) as { changes?: number };

      return Number(result.changes ?? 0) > 0 ? readWorkbenchSnapshot() : null;
    },
    removeBundleEntry(bundleItemId: number, entryPath: string): WorkbenchSnapshot {
      const trimmed = entryPath.trim();
      if (!trimmed) {
        return readWorkbenchSnapshot();
      }

      db.prepare("delete from bundle_entries where bundle_item_id = ? and entry_path = ?").run(
        bundleItemId,
        trimmed
      );

      return readWorkbenchSnapshot();
    },
    groupItems(sourceItemId: number, targetItemId: number): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      if (sourceItemId === targetItemId) {
        return snapshot;
      }

      const sourceItem = snapshot.items.find((entry) => entry.id === sourceItemId);
      const targetItem = snapshot.items.find((entry) => entry.id === targetItemId);
      if (!sourceItem || !targetItem) {
        return snapshot;
      }

      if (sourceItem.boxId !== targetItem.boxId) {
        return snapshot;
      }

      if (targetItem.bundleParentId != null) {
        return snapshot;
      }

      if (sourceItem.kind === "bundle") {
        return snapshot;
      }

      const timestamp = nowIso();
      const assignBundleParent = db.prepare(`
        update items
        set bundle_parent_item_id = ?, sort_order = ?, updated_at = ?
        where id = ?
      `);

      if (targetItem.kind === "bundle") {
        if (sourceItem.bundleParentId === targetItem.id) {
          return snapshot;
        }

        assignBundleParent.run(targetItem.id, getNextBundleMemberSortOrder(targetItem.id), timestamp, sourceItem.id);
        return sourceItem.bundleParentId != null ? dissolveBundleIfNeeded(sourceItem.bundleParentId) : readWorkbenchSnapshot();
      }

      if (sourceItem.bundleParentId != null) {
        return snapshot;
      }

      const bundleResult = db.prepare(`
        insert into items (box_id, kind, title, content, source_url, source_path, sort_order, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetItem.boxId,
        "bundle",
        "",
        "",
        targetItem.sourceUrl,
        targetItem.sourcePath,
        targetItem.sortOrder,
        timestamp,
        timestamp
      ) as { lastInsertRowid: number | bigint };

      const bundleItemId = Number(bundleResult.lastInsertRowid);
      assignBundleParent.run(bundleItemId, 0, timestamp, targetItem.id);
      assignBundleParent.run(bundleItemId, 1, timestamp, sourceItem.id);

      return readWorkbenchSnapshot();
    },
    moveItemToBox(itemId: number, boxId: number): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      if (!snapshot.boxes.some((box) => box.id === boxId)) {
        return snapshot;
      }

      const item = snapshot.items.find((entry) => entry.id === itemId);
      if (!item || item.boxId === boxId) {
        return snapshot;
      }

      db.prepare(`
        update items
        set box_id = ?, sort_order = ?, updated_at = ?
        where id = ?
      `).run(boxId, getNextTopSortOrder(boxId), nowIso(), itemId);

      if (item.kind === "bundle") {
        db.prepare(`
          update items
          set box_id = ?, updated_at = ?
          where bundle_parent_item_id = ?
        `).run(boxId, nowIso(), itemId);
      }

      return readWorkbenchSnapshot();
    },
    moveItemToIndex(itemId: number, targetIndex: number): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      const item = snapshot.items.find((entry) => entry.id === itemId);
      if (!item) {
        return snapshot;
      }

      if (item.bundleParentId != null) {
        const topLevelItems = normalizeItemSortOrders(item.boxId);
        const boundedIndex = Math.max(0, Math.min(targetIndex, topLevelItems.length));
        const nextItems = topLevelItems.slice();
        nextItems.splice(boundedIndex, 0, { id: item.id, boxId: item.boxId, sortOrder: boundedIndex });

        const timestamp = nowIso();
        const updateTopLevelItem = db.prepare(`
          update items
          set bundle_parent_item_id = ?, sort_order = ?, updated_at = ?
          where id = ?
        `);

        nextItems.forEach((entry, index) => {
          if (entry.id === item.id) {
            updateTopLevelItem.run(null, index, timestamp, entry.id);
            return;
          }

          db.prepare("update items set sort_order = ?, updated_at = ? where id = ?").run(index, timestamp, entry.id);
        });

        return dissolveBundleIfNeeded(item.bundleParentId);
      }

      const items = normalizeItemSortOrders(item.boxId);
      const currentIndex = items.findIndex((entry) => entry.id === itemId);
      if (currentIndex === -1) {
        return readWorkbenchSnapshot();
      }

      const remainingItems = items.filter((entry) => entry.id !== itemId);
      const boundedIndex = Math.max(0, Math.min(targetIndex, remainingItems.length));
      remainingItems.splice(boundedIndex, 0, items[currentIndex]);

      const timestamp = nowIso();
      const updateSortOrder = db.prepare("update items set sort_order = ?, updated_at = ? where id = ?");
      remainingItems.forEach((entry, index) => {
        updateSortOrder.run(index, timestamp, entry.id);
      });

      return readWorkbenchSnapshot();
    },
    reorderItem(itemId: number, direction: "up" | "down"): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      const item = snapshot.items.find((entry) => entry.id === itemId);
      if (!item) {
        return snapshot;
      }

      const items = normalizeItemSortOrders(item.boxId);
      const currentIndex = items.findIndex((entry) => entry.id === itemId);
      if (currentIndex === -1) {
        return readWorkbenchSnapshot();
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      const sibling = items[targetIndex];
      if (!sibling) {
        return readWorkbenchSnapshot();
      }

      const timestamp = nowIso();
      db.prepare("update items set sort_order = ?, updated_at = ? where id = ?").run(
        sibling.sortOrder,
        timestamp,
        itemId
      );
      db.prepare("update items set sort_order = ?, updated_at = ? where id = ?").run(
        items[currentIndex].sortOrder,
        timestamp,
        sibling.id
      );

      return readWorkbenchSnapshot();
    },
    selectBox(boxId: number): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      if (!snapshot.boxes.some((box) => box.id === boxId)) {
        return snapshot;
      }

      writePanelState(boxId);

      return readWorkbenchSnapshot();
    },
    applyAiOrganization(suggestions: AiOrganizationSuggestion[]): WorkbenchSnapshot {
      const snapshot = readWorkbenchSnapshot();
      const timestamp = nowIso();
      const boxIdsByName = new Map(snapshot.boxes.map((box) => [box.name.trim().toLowerCase(), box.id]));
      const insertBox = db.prepare("insert into boxes (name, color, description, sort_order) values (?, ?, ?, ?)");
      const updateTitle = db.prepare(`
        update items
        set title = ?, updated_at = ?
        where id = ?
      `);
      const updateItemBox = db.prepare(`
        update items
        set box_id = ?, sort_order = ?, updated_at = ?
        where id = ?
      `);
      const updateBundleChildrenBox = db.prepare(`
        update items
        set box_id = ?, updated_at = ?
        where bundle_parent_item_id = ?
      `);

      for (const suggestion of suggestions) {
        const targetName = suggestion.targetBoxName.trim();
        if (!targetName) {
          continue;
        }

        const key = targetName.toLowerCase();
        if (!boxIdsByName.has(key)) {
          const result = insertBox.run(targetName, nextBoxColor(), "", getNextBoxSortOrder()) as {
            lastInsertRowid: number | bigint;
          };
          boxIdsByName.set(key, Number(result.lastInsertRowid));
        }
      }

      const latestSnapshot = readWorkbenchSnapshot();
      const itemsById = new Map(latestSnapshot.items.map((item) => [item.id, item]));

      for (const suggestion of suggestions) {
        const item = itemsById.get(suggestion.itemId);
        if (!item) {
          continue;
        }

        const nextTitle = suggestion.suggestedTitle.trim();
        if (nextTitle && nextTitle !== item.title) {
          updateTitle.run(nextTitle, timestamp, item.id);
        }

        const targetBoxId = boxIdsByName.get(suggestion.targetBoxName.trim().toLowerCase());
        if (targetBoxId && targetBoxId !== item.boxId) {
          updateItemBox.run(targetBoxId, getNextTopSortOrder(targetBoxId), timestamp, item.id);
          if (item.kind === "bundle") {
            updateBundleChildrenBox.run(targetBoxId, timestamp, item.id);
          }
        }
      }

      normalizeBoxSortOrders();
      return readWorkbenchSnapshot();
    },
    getBundleEntries(bundleItemId: number): BundleEntry[] {
      const entries = db
        .prepare(
          "select entry_path as entryPath, entry_kind as entryKind, sort_order as sortOrder from bundle_entries where bundle_item_id = ? order by sort_order asc"
        )
        .all(bundleItemId) as Array<Pick<BundleEntry, "entryPath" | "entryKind" | "sortOrder">>;

      return entries.map((entry) => ({
        ...entry,
        exists: fs.existsSync(entry.entryPath),
      }));
    },
    updateLinkTitle(itemId: number, title: string): WorkbenchSnapshot | null {
      const trimmed = title.trim();
      if (!trimmed) return null;

      const result = db.prepare(`
        update items
        set title = ?, updated_at = ?
        where id = ? and kind = 'link'
      `).run(trimmed, nowIso(), itemId) as { changes?: number };

      return Number(result.changes ?? 0) > 0 ? readWorkbenchSnapshot() : null;
    },
    close() {
      db.close();
    },
  };
}
