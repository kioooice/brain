import { afterEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn((targetPath: string) => !targetPath.includes("missing")),
  mkdirSync: vi.fn(),
  readFileSync: vi.fn(() => Buffer.from("fake-png")),
  readdirSync: vi.fn(() => []),
  rmSync: vi.fn(),
  statSync: vi.fn(() => ({
    isDirectory: () => false,
    isFile: () => true,
    size: 0,
  })),
  writeFileSync: vi.fn(),
}));

const electronMocks = vi.hoisted(() => {
  const resizedImage = {
    toJPEG: vi.fn(() => Buffer.from("fake-thumb")),
  };
  const sourceImage = {
    isEmpty: vi.fn(() => false),
    getSize: vi.fn(() => ({ width: 1200, height: 800 })),
    resize: vi.fn(() => resizedImage),
  };
  return {
    nativeImage: {
      createFromPath: vi.fn(() => sourceImage),
    },
    resizedImage,
    sourceImage,
  };
});

type BoxRow = {
  id: number;
  name: string;
  color: string;
  description: string;
  sort_order: number;
};

type ItemRow = {
  id: number;
  box_id: number;
  bundle_parent_item_id: number | null;
  kind: string;
  title: string;
  content: string;
  source_url: string;
  source_path: string;
  thumbnail_path: string;
  capture_fingerprint: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type BundleEntryRow = {
  id: number;
  bundle_item_id: number;
  entry_path: string;
  entry_kind: "file" | "folder";
  sort_order: number;
};

type PanelStateRow = {
  selected_box_id: number | null;
};

type NotepadGroupRow = {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type NotepadNoteRow = {
  id: number;
  group_id: number;
  content: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type AutoCaptureEntryRow = {
  id: number;
  image_path: string;
  thumbnail_path: string;
  ocr_text: string;
  created_at: string;
};

class FakeDatabase {
  static omitPanelStateRow = false;
  static nextItems: ItemRow[] = [];
  private boxes: BoxRow[] = [];
  private items: ItemRow[] = [];
  private bundleEntries: BundleEntryRow[] = [];
  private notepadGroups: NotepadGroupRow[] = [];
  private notepadNotes: NotepadNoteRow[] = [];
  private autoCaptureEntries: AutoCaptureEntryRow[] = [];
  private panelState: PanelStateRow | null = null;
  private lastInsertRowid = 0;
  closed = false;

  constructor() {
    this.items = FakeDatabase.nextItems.map((item) => ({ ...item }));
    FakeDatabase.nextItems = [];
  }

  exec(sql: string) {
    void sql;
    return this;
  }

  prepare(sql: string) {
    if (sql.includes("select count(*) as count from boxes")) {
      return {
        get: () => ({ count: this.boxes.length }),
      };
    }

    if (sql.includes("select count(*) as count from notepad_groups")) {
      return {
        get: () => ({ count: this.notepadGroups.length }),
      };
    }

    if (sql.includes("insert into boxes")) {
      return {
        run: (name: string, color: string, description: string, sortOrder: number) => {
          const id = ++this.lastInsertRowid;
          this.boxes.push({
            id,
            name,
            color,
            description,
            sort_order: sortOrder,
          });
          return { lastInsertRowid: id };
        },
      };
    }

    if (sql.includes("insert into notepad_groups")) {
      return {
        run: (name: string, sortOrder: number, createdAt: string, updatedAt: string) => {
          const id = ++this.lastInsertRowid;
          this.notepadGroups.push({
            id,
            name,
            sort_order: sortOrder,
            created_at: createdAt,
            updated_at: updatedAt,
          });
          return { lastInsertRowid: id };
        },
      };
    }

    if (sql.includes("insert into notepad_notes")) {
      return {
        run: (groupId: number, content: string, sortOrder: number, createdAt: string, updatedAt: string) => {
          const id = ++this.lastInsertRowid;
          this.notepadNotes.push({
            id,
            group_id: groupId,
            content,
            sort_order: sortOrder,
            created_at: createdAt,
            updated_at: updatedAt,
          });
          return { lastInsertRowid: id };
        },
      };
    }

    if (sql.includes("insert into auto_capture_entries")) {
      return {
        run: (imagePath: string, thumbnailPathOrOcrText: string, ocrTextOrCreatedAt: string, createdAt?: string) => {
          const hasThumbnailPath = createdAt != null;
          const id = ++this.lastInsertRowid;
          this.autoCaptureEntries.push({
            id,
            image_path: imagePath,
            thumbnail_path: hasThumbnailPath ? thumbnailPathOrOcrText : "",
            ocr_text: hasThumbnailPath ? ocrTextOrCreatedAt : thumbnailPathOrOcrText,
            created_at: createdAt ?? ocrTextOrCreatedAt,
          });
          return { lastInsertRowid: id };
        },
      };
    }

    if (sql.includes("insert or replace into panel_state")) {
      return {
        run: (selectedBoxId: number | null) => {
          this.panelState = {
            selected_box_id: selectedBoxId,
          };
          return {};
        },
      };
    }

    if (sql.includes("update boxes set name = ?, description = ? where id = ?")) {
      return {
        run: (name: string, description: string, boxId: number) => {
          const box = this.boxes.find((entry) => entry.id === boxId);
          if (!box) {
            return { changes: 0 };
          }
          box.name = name;
          box.description = description;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("update boxes set sort_order = ? where id = ?")) {
      return {
        run: (sortOrder: number, boxId: number) => {
          const box = this.boxes.find((entry) => entry.id === boxId);
          if (!box) {
            return { changes: 0 };
          }
          box.sort_order = sortOrder;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("select id from boxes where id = ?")) {
      return {
        get: (boxId: number) => this.boxes.find((box) => box.id === boxId),
      };
    }

    if (sql.includes("select min(sort_order) as sortOrder from items where box_id = ?")) {
      return {
        get: (boxId: number) => {
          const matches = this.items.filter((item) => item.box_id === boxId && item.bundle_parent_item_id == null);
          return {
            sortOrder: matches.length
              ? Math.min(...matches.map((item) => item.sort_order))
              : null,
          };
        },
      };
    }

    if (sql.includes("select min(sort_order) as sortOrder from notepad_notes where group_id = ?")) {
      return {
        get: (groupId: number) => {
          const matches = this.notepadNotes.filter((note) => note.group_id === groupId);
          return {
            sortOrder: matches.length ? Math.min(...matches.map((note) => note.sort_order)) : null,
          };
        },
      };
    }

    if (sql.includes("select max(sort_order) as sortOrder from items where box_id = ?")) {
      return {
        get: (boxId: number) => {
          const matches = this.items.filter((item) => item.box_id === boxId && item.bundle_parent_item_id == null);
          return {
            sortOrder: matches.length
              ? Math.max(...matches.map((item) => item.sort_order))
              : null,
          };
        },
      };
    }

    if (sql.includes("select max(sort_order) as sortOrder from items where bundle_parent_item_id = ?")) {
      return {
        get: (bundleItemId: number) => {
          const matches = this.items.filter((item) => item.bundle_parent_item_id === bundleItemId);
          return {
            sortOrder: matches.length
              ? Math.max(...matches.map((item) => item.sort_order))
              : null,
          };
        },
      };
    }

    if (sql.includes("select id, box_id as boxId, sort_order as sortOrder from items where box_id = ?")) {
      return {
        all: (boxId: number) =>
          this.items
            .filter((item) => item.box_id === boxId && item.bundle_parent_item_id == null)
            .slice()
            .sort((left, right) => left.sort_order - right.sort_order || right.id - left.id)
            .map((item) => ({
              id: item.id,
              boxId: item.box_id,
              sortOrder: item.sort_order,
            })),
      };
    }

    if (sql.includes("select id, box_id as boxId from items where id = ?")) {
      return {
        get: (itemId: number) => {
          const item = this.items.find((entry) => entry.id === itemId);
          return item ? { id: item.id, boxId: item.box_id } : undefined;
        },
      };
    }

    if (sql.includes("select id from items where id = ?")) {
      return {
        get: (itemId: number) => {
          const item = this.items.find((entry) => entry.id === itemId);
          return item ? { id: item.id } : undefined;
        },
      };
    }

    if (sql.includes("capture_fingerprint = ?")) {
      return {
        get: (boxId: number, captureFingerprint: string, cutoff?: string) => {
          const item = this.items.find(
            (entry) =>
              entry.box_id === boxId &&
              entry.capture_fingerprint === captureFingerprint &&
              (cutoff == null || entry.created_at >= cutoff)
          );
          return item ? { id: item.id } : undefined;
        },
      };
    }

    if (sql.includes("from bundle_entries inner join items")) {
      return {
        get: (boxId: number, entryPath: string, cutoff?: string) => {
          const entry = this.bundleEntries.find((bundleEntry) => {
            const item = this.items.find((candidate) => candidate.id === bundleEntry.bundle_item_id);
            return (
              item?.box_id === boxId &&
              item.bundle_parent_item_id == null &&
              bundleEntry.entry_path.toLowerCase() === entryPath &&
              (cutoff == null || item.created_at >= cutoff)
            );
          });
          return entry ? { id: entry.id } : undefined;
        },
      };
    }

    if (sql.includes("insert into items") && sql.includes("capture_fingerprint")) {
      return {
        run: (...args: [
          boxId: number,
          kind: string,
          title: string,
          content: string,
          sourceUrl: string,
          sourcePath: string,
          thumbnailPathOrCaptureFingerprint: string,
          captureFingerprintOrSortOrder: string | number,
          sortOrderOrCreatedAt: number | string,
          createdAtOrUpdatedAt: string,
          updatedAt?: string
        ]) => {
          const [
            boxId,
            kind,
            title,
            content,
            sourceUrl,
            sourcePath,
            thumbnailPathOrCaptureFingerprint,
            captureFingerprintOrSortOrder,
            sortOrderOrCreatedAt,
            createdAtOrUpdatedAt,
            updatedAt,
          ] = args;
          const hasThumbnailPath = updatedAt != null;
          const thumbnailPath = hasThumbnailPath ? thumbnailPathOrCaptureFingerprint : "";
          const captureFingerprint = hasThumbnailPath
            ? String(captureFingerprintOrSortOrder)
            : thumbnailPathOrCaptureFingerprint;
          const sortOrder = hasThumbnailPath ? Number(sortOrderOrCreatedAt) : Number(captureFingerprintOrSortOrder);
          const createdAt = hasThumbnailPath ? createdAtOrUpdatedAt : String(sortOrderOrCreatedAt);
          const id = ++this.lastInsertRowid;
          this.items.push({
            id,
            box_id: boxId,
            bundle_parent_item_id: null,
            kind,
            title,
            content,
            source_url: sourceUrl,
            source_path: sourcePath,
            thumbnail_path: thumbnailPath,
            capture_fingerprint: captureFingerprint,
            sort_order: sortOrder,
            created_at: createdAt,
            updated_at: updatedAt ?? createdAtOrUpdatedAt,
          });
          return { lastInsertRowid: id };
        },
      };
    }

    if (sql.includes("insert into items")) {
      return {
        run: (
          boxId: number,
          kind: string,
          title: string,
          content: string,
          sourceUrl: string,
          sourcePath: string,
          sortOrder: number,
          createdAt: string,
          updatedAt: string
        ) => {
          const id = ++this.lastInsertRowid;
          this.items.push({
            id,
            box_id: boxId,
            bundle_parent_item_id: null,
            kind,
            title,
            content,
            source_url: sourceUrl,
            source_path: sourcePath,
            capture_fingerprint: "",
            sort_order: sortOrder,
            created_at: createdAt,
            updated_at: updatedAt,
          });
          return { lastInsertRowid: id };
        },
      };
    }

    if (sql.includes("insert into bundle_entries")) {
      return {
        run: (bundleItemId: number, entryPath: string, entryKind: "file" | "folder", sortOrder: number) => {
          const id = ++this.lastInsertRowid;
          this.bundleEntries.push({
            id,
            bundle_item_id: bundleItemId,
            entry_path: entryPath,
            entry_kind: entryKind,
            sort_order: sortOrder,
          });
          return { lastInsertRowid: id };
        },
      };
    }

    if (sql.includes("set bundle_parent_item_id = ?, sort_order = ?, updated_at = ?")) {
      return {
        run: (bundleParentItemId: number, sortOrder: number, updatedAt: string, itemId: number) => {
          const item = this.items.find((entry) => entry.id === itemId);
          if (!item) {
            return { changes: 0 };
          }
          item.bundle_parent_item_id = bundleParentItemId;
          item.sort_order = sortOrder;
          item.updated_at = updatedAt;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("set box_id = ?, sort_order = ?, updated_at = ?")) {
      return {
        run: (boxId: number, sortOrder: number, updatedAt: string, itemId: number) => {
          const item = this.items.find((entry) => entry.id === itemId);
          if (!item) {
            return { changes: 0 };
          }
          item.box_id = boxId;
          item.sort_order = sortOrder;
          item.updated_at = updatedAt;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("set box_id = ?, updated_at = ?") && sql.includes("where bundle_parent_item_id = ?")) {
      return {
        run: (boxId: number, updatedAt: string, bundleParentItemId: number) => {
          this.items.forEach((item) => {
            if (item.bundle_parent_item_id === bundleParentItemId) {
              item.box_id = boxId;
              item.updated_at = updatedAt;
            }
          });
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("set sort_order = ?, updated_at = ? where id = ?")) {
      return {
        run: (sortOrder: number, updatedAt: string, itemId: number) => {
          const item = this.items.find((entry) => entry.id === itemId);
          if (!item) {
            return { changes: 0 };
          }
          item.sort_order = sortOrder;
          item.updated_at = updatedAt;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("set sort_order = ? where id = ?")) {
      return {
        run: (sortOrder: number, itemId: number) => {
          const item = this.items.find((entry) => entry.id === itemId);
          if (!item) {
            return { changes: 0 };
          }
          item.sort_order = sortOrder;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("set title = ?, updated_at = ?")) {
      return {
        run: (title: string, updatedAt: string, itemId: number) => {
          const item = this.items.find((entry) => entry.id === itemId);
          if (!item) {
            return { changes: 0 };
          }
          item.title = title;
          item.updated_at = updatedAt;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("delete from bundle_entries where bundle_item_id = ? and entry_path = ?")) {
      return {
        run: (itemId: number, entryPath: string) => {
          this.bundleEntries = this.bundleEntries.filter(
            (entry) => !(entry.bundle_item_id === itemId && entry.entry_path === entryPath)
          );
          return {};
        },
      };
    }

    if (sql.includes("delete from bundle_entries where bundle_item_id = ?")) {
      return {
        run: (itemId: number) => {
          this.bundleEntries = this.bundleEntries.filter((entry) => entry.bundle_item_id !== itemId);
          return {};
        },
      };
    }

    if (sql.includes("delete from items where id = ?")) {
      return {
        run: (itemId: number) => {
          this.items = this.items.filter((entry) => entry.id !== itemId);
          return {};
        },
      };
    }

    if (sql.includes("delete from boxes where id = ?")) {
      return {
        run: (boxId: number) => {
          this.boxes = this.boxes.filter((entry) => entry.id !== boxId);
          return {};
        },
      };
    }

    if (sql.includes("select id, name, color, description, sort_order as sortOrder from boxes")) {
      return {
        all: () =>
          this.boxes
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((box) => ({
              id: box.id,
              name: box.name,
              color: box.color,
              description: box.description,
              sortOrder: box.sort_order,
            })),
      };
    }

    if (sql.includes("update items set content = ?, source_path = ?, thumbnail_path = ?, updated_at = ? where id = ?")) {
      return {
        run: (content: string, sourcePath: string, thumbnailPath: string, updatedAt: string, itemId: number) => {
          const item = this.items.find((entry) => entry.id === itemId);
          if (!item) {
            return { changes: 0 };
          }
          item.content = content;
          item.source_path = sourcePath;
          item.thumbnail_path = thumbnailPath;
          item.updated_at = updatedAt;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("update items set thumbnail_path = ?, updated_at = ? where id = ?")) {
      return {
        run: (thumbnailPath: string, updatedAt: string, itemId: number) => {
          const item = this.items.find((entry) => entry.id === itemId);
          if (!item) {
            return { changes: 0 };
          }
          item.thumbnail_path = thumbnailPath;
          item.updated_at = updatedAt;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("update auto_capture_entries set thumbnail_path = ? where id = ?")) {
      return {
        run: (thumbnailPath: string, entryId: number) => {
          const entry = this.autoCaptureEntries.find((candidate) => candidate.id === entryId);
          if (!entry) {
            return { changes: 0 };
          }
          entry.thumbnail_path = thumbnailPath;
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("delete from auto_capture_entries where id = ?")) {
      return {
        run: (entryId: number) => {
          this.autoCaptureEntries = this.autoCaptureEntries.filter((entry) => entry.id !== entryId);
          return {};
        },
      };
    }

    if (sql.includes("delete from auto_capture_entries where created_at < ?")) {
      return {
        run: (cutoffIso: string) => {
          this.autoCaptureEntries = this.autoCaptureEntries.filter((entry) => entry.created_at >= cutoffIso);
          return {};
        },
      };
    }

    if (sql.includes("delete from auto_capture_entries")) {
      return {
        run: (retainLimit?: number) => {
          if (typeof retainLimit === "number") {
            const retainedIds = this.autoCaptureEntries
              .slice()
              .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id)
              .slice(0, retainLimit)
              .map((entry) => entry.id);
            this.autoCaptureEntries = this.autoCaptureEntries.filter((entry) => retainedIds.includes(entry.id));
            return {};
          }
          this.autoCaptureEntries = [];
          return {};
        },
      };
    }

    if (sql.includes("select id, name, sort_order as sortOrder")) {
      return {
        all: () =>
          this.notepadGroups
            .slice()
            .sort((left, right) => left.sort_order - right.sort_order || left.id - right.id)
            .map((group) => ({
              id: group.id,
              name: group.name,
              sortOrder: group.sort_order,
              createdAt: group.created_at,
              updatedAt: group.updated_at,
            })),
      };
    }

    if (sql.includes("select id, group_id as groupId")) {
      return {
        all: () =>
          this.notepadNotes
            .slice()
            .sort(
              (left, right) =>
                left.group_id - right.group_id || left.sort_order - right.sort_order || right.id - left.id
            )
            .map((note) => ({
              id: note.id,
              groupId: note.group_id,
              content: note.content,
              sortOrder: note.sort_order,
              createdAt: note.created_at,
              updatedAt: note.updated_at,
            })),
      };
    }

    if (sql.includes("select id, image_path as imagePath, thumbnail_path as thumbnailPath, ocr_text as ocrText")) {
      return {
        all: () =>
          this.autoCaptureEntries
            .slice()
            .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id)
            .map((entry) => ({
              id: entry.id,
              imagePath: entry.image_path,
              thumbnailPath: entry.thumbnail_path,
              ocrText: entry.ocr_text,
              createdAt: entry.created_at,
            })),
      };
    }

    if (sql.includes("select id, image_path as imagePath") && sql.includes("where image_path != '' and thumbnail_path = ''")) {
      return {
        all: () =>
          this.autoCaptureEntries
            .filter((entry) => entry.image_path && !entry.thumbnail_path)
            .map((entry) => ({ id: entry.id, imagePath: entry.image_path })),
      };
    }

    if (sql.includes("select source_path as sourcePath, thumbnail_path as thumbnailPath from items where kind = 'image'")) {
      return {
        all: () =>
          this.items
            .filter((item) => item.kind === "image")
            .map((item) => ({ sourcePath: item.source_path, thumbnailPath: item.thumbnail_path })),
      };
    }

    if (sql.includes("select image_path as imagePath, thumbnail_path as thumbnailPath from auto_capture_entries")) {
      return {
        all: () =>
          this.autoCaptureEntries.map((entry) => ({
            imagePath: entry.image_path,
            thumbnailPath: entry.thumbnail_path,
          })),
      };
    }

    if (sql.includes("select image_path as imagePath, thumbnail_path as thumbnailPath") && sql.includes("where id = ?")) {
      return {
        all: (entryId: number) =>
          this.autoCaptureEntries
            .filter((candidate) => candidate.id === entryId)
            .map((entry) => ({ imagePath: entry.image_path, thumbnailPath: entry.thumbnail_path })),
      };
    }

    if (sql.includes("select image_path as imagePath") && sql.includes("where id = ?")) {
      return {
        get: (entryId: number) => {
          const entry = this.autoCaptureEntries.find((candidate) => candidate.id === entryId);
          return entry ? { imagePath: entry.image_path } : undefined;
        },
      };
    }

    if (sql.includes("select image_path as imagePath") && sql.includes("where created_at < ?")) {
      return {
        all: (cutoffIso: string) =>
          this.autoCaptureEntries
            .filter((entry) => entry.created_at < cutoffIso)
            .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id)
            .map((entry) => ({ imagePath: entry.image_path, thumbnailPath: entry.thumbnail_path })),
      };
    }

    if (sql.includes("select image_path as imagePath") && sql.includes("where id not in")) {
      return {
        all: (retainLimit: number) =>
          this.autoCaptureEntries
            .slice()
            .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id)
            .slice(retainLimit)
            .map((entry) => ({ imagePath: entry.image_path, thumbnailPath: entry.thumbnail_path })),
      };
    }

    if (sql.includes("select image_path as imagePath from auto_capture_entries")) {
      return {
        all: () =>
          this.autoCaptureEntries
            .slice()
            .sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id - left.id)
            .map((entry) => ({ imagePath: entry.image_path, thumbnailPath: entry.thumbnail_path })),
      };
    }

    if (sql.includes("select id, source_path as sourcePath") && sql.includes("thumbnail_path = ''")) {
      return {
        all: () =>
          this.items
            .filter((item) => item.kind === "image" && item.source_path && !item.thumbnail_path)
            .map((item) => ({ id: item.id, sourcePath: item.source_path })),
      };
    }

    if (sql.includes("where kind = 'image' and content like 'data:image/%'")) {
      return {
        all: () =>
          this.items
            .filter((item) => item.kind === "image" && item.content.startsWith("data:image/"))
            .map((item) => ({
              id: item.id,
              title: item.title,
              content: item.content,
              sourcePath: item.source_path,
            })),
      };
    }

    if (sql.includes("select items.id, items.box_id as boxId")) {
      return {
        all: () =>
          this.items
            .slice()
            .sort((left, right) => left.box_id - right.box_id || left.sort_order - right.sort_order || right.id - left.id)
            .map((item) => ({
              id: item.id,
              boxId: item.box_id,
              bundleParentId: item.bundle_parent_item_id,
              kind: item.kind,
              title: item.title,
            content: item.content,
            sourceUrl: item.source_url,
            sourcePath: item.source_path,
            thumbnailPath: item.thumbnail_path,
            sortOrder: item.sort_order,
              bundleEntryCount: this.bundleEntries.filter((entry) => entry.bundle_item_id === item.id).length,
              createdAt: item.created_at,
              updatedAt: item.updated_at,
            })),
      };
    }

    if (sql.includes("from bundle_entries where bundle_item_id = ? order by sort_order asc")) {
      return {
        all: (bundleItemId: number) =>
          this.bundleEntries
            .filter((entry) => entry.bundle_item_id === bundleItemId)
            .sort((left, right) => left.sort_order - right.sort_order)
            .map((entry) => ({
              entryPath: entry.entry_path,
              entryKind: entry.entry_kind,
              sortOrder: entry.sort_order,
            })),
      };
    }

    if (sql.includes("select selected_box_id as selectedBoxId")) {
      return {
        get: () =>
          FakeDatabase.omitPanelStateRow
            ? undefined
            : this.panelState
            ? {
                selectedBoxId: this.panelState.selected_box_id,
              }
            : undefined,
      };
    }

    throw new Error(`Unhandled SQL in test double: ${sql}`);
  }

  close() {
    this.closed = true;
  }

  seedBox(box: BoxRow) {
    this.boxes.push(box);
  }

  static seedNextItems(items: ItemRow[]) {
    FakeDatabase.nextItems = items.map((item) => ({ ...item }));
  }
}

const databaseInstances: FakeDatabase[] = [];

vi.mock("better-sqlite3", () => ({
  default: class {
    constructor(filename: string) {
      void filename;
      const instance = new FakeDatabase();
      databaseInstances.push(instance);
      return instance;
    }
  },
}));

vi.mock("electron", () => ({
  nativeImage: electronMocks.nativeImage,
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: actual,
    existsSync: fsMocks.existsSync,
    mkdirSync: fsMocks.mkdirSync,
    readFileSync: fsMocks.readFileSync,
    readdirSync: fsMocks.readdirSync,
    rmSync: fsMocks.rmSync,
    statSync: fsMocks.statSync,
    writeFileSync: fsMocks.writeFileSync,
  };
});

import { createStore } from "./store";

describe("createStore", () => {
  afterEach(() => {
    vi.useRealTimers();
    FakeDatabase.omitPanelStateRow = false;
    FakeDatabase.nextItems = [];
    electronMocks.nativeImage.createFromPath.mockClear();
    electronMocks.sourceImage.isEmpty.mockClear();
    electronMocks.sourceImage.getSize.mockClear();
    electronMocks.sourceImage.resize.mockClear();
    electronMocks.resizedImage.toJPEG.mockClear();
    fsMocks.existsSync.mockClear();
    fsMocks.existsSync.mockImplementation((targetPath: string) => !targetPath.includes("missing"));
    fsMocks.mkdirSync.mockClear();
    fsMocks.readFileSync.mockClear();
    fsMocks.readFileSync.mockImplementation(() => Buffer.from("fake-png"));
    fsMocks.readdirSync.mockClear();
    fsMocks.readdirSync.mockImplementation(() => []);
    fsMocks.rmSync.mockClear();
    fsMocks.statSync.mockClear();
    fsMocks.statSync.mockImplementation(() => ({
      isDirectory: () => false,
      isFile: () => true,
      size: 0,
    }));
    fsMocks.writeFileSync.mockClear();
  });

  it("bootstraps an inbox box and empty panel state", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.getWorkbenchSnapshot();

    expect(snapshot.boxes).toHaveLength(1);
    expect(snapshot.boxes[0].name).toBe("收件箱");
    expect(snapshot.panelState.selectedBoxId).toBe(snapshot.boxes[0].id);
    expect(snapshot.items).toEqual([]);
  });

  it("stores notepad notes in standalone groups instead of boxes", () => {
    const store = createStore("brain-desktop.db");
    const beforeWorkbench = store.getWorkbenchSnapshot();

    const withGroup = store.createNotepadGroup("灵感");
    const groupId = withGroup.groups.find((group) => group.name === "灵感")?.id ?? 0;
    const notepad = store.createNotepadNote(groupId, "单独记一条想法");
    const afterWorkbench = store.getWorkbenchSnapshot();

    expect(notepad.groups.map((group) => group.name)).toEqual(["默认", "灵感"]);
    expect(notepad.notes).toEqual([
      expect.objectContaining({
        groupId,
        content: "单独记一条想法",
      }),
    ]);
    expect(afterWorkbench.items).toEqual(beforeWorkbench.items);
  });

  it("stores automatic desktop captures outside boxes and makes OCR searchable", () => {
    const store = createStore("brain-desktop.db");
    const beforeWorkbench = store.getWorkbenchSnapshot();

    store.addAutoCaptureEntry("C:\\brain\\auto-captures\\first.png", "会议截图 预 算");
    store.addAutoCaptureEntry("C:\\brain\\auto-captures\\second.png", "浏览器 灵感");

    const searchResult = store.getAutoCaptureSnapshot("预算");

    expect(searchResult.entries).toEqual([
      expect.objectContaining({
        imagePath: "C:\\brain\\auto-captures\\first.png",
        imageUrl: "data:image/png;base64,ZmFrZS1wbmc=",
        ocrText: "会议截图 预 算",
      }),
    ]);
    expect(store.getWorkbenchSnapshot()).toEqual(beforeWorkbench);
  });

  it("removes automatic desktop captures older than the cutoff and returns their image paths", () => {
    vi.useFakeTimers();
    const store = createStore("brain-desktop.db");

    vi.setSystemTime(new Date("2026-05-04T00:00:00.000Z"));
    store.addAutoCaptureEntry("C:\\brain\\old.jpg", "old");
    vi.setSystemTime(new Date("2026-05-04T11:59:00.000Z"));
    store.addAutoCaptureEntry("C:\\brain\\recent.jpg", "recent");

    const removedPaths = store.pruneAutoCaptureEntriesBefore("2026-05-04T00:30:00.000Z");

    expect(removedPaths).toEqual([
      "C:\\brain\\old.jpg",
      expect.stringContaining("image-thumbnails"),
    ]);
    expect(store.getAutoCaptureSnapshot().entries.map((entry) => entry.imagePath)).toEqual([
      "C:\\brain\\recent.jpg",
    ]);
  });

  it("reports local database, image, thumbnail, and automatic capture storage usage", () => {
    const store = createStore("C:\\brain\\brain-desktop.db");
    const sizes = new Map([
      ["C:\\brain\\brain-desktop.db", 1024],
      ["C:\\brain\\image-captures\\saved.png", 2048],
      ["C:\\brain\\image-thumbnails\\saved.jpg", 512],
      ["C:\\brain\\auto-captures\\shot.jpg", 4096],
    ]);
    const directories = new Map([
      ["C:\\brain\\image-captures", ["saved.png"]],
      ["C:\\brain\\image-thumbnails", ["saved.jpg"]],
      ["C:\\brain\\auto-captures", ["shot.jpg"]],
    ]);
    fsMocks.existsSync.mockImplementation((targetPath: string) => sizes.has(targetPath) || directories.has(targetPath));
    fsMocks.statSync.mockImplementation((targetPath: string) => {
      if (directories.has(targetPath)) {
        return {
          isDirectory: () => true,
          isFile: () => false,
          size: 0,
        };
      }
      return {
        isDirectory: () => false,
        isFile: () => true,
        size: sizes.get(targetPath) ?? 0,
      };
    });
    fsMocks.readdirSync.mockImplementation((targetPath: string) => directories.get(targetPath) ?? []);

    expect(store.getStorageUsage("C:\\brain\\auto-captures")).toEqual({
      databaseBytes: 1024,
      imageBytes: 2048,
      thumbnailBytes: 512,
      autoCaptureBytes: 4096,
      totalBytes: 7680,
    });
  });

  it("cleans local image files that are no longer referenced by any card or automatic capture", () => {
    const imageDir = "C:\\brain\\image-captures";
    const thumbnailDir = "C:\\brain\\image-thumbnails";
    const autoDir = "C:\\brain\\auto-captures";
    FakeDatabase.seedNextItems([
      {
        id: 20,
        box_id: 1,
        bundle_parent_item_id: null,
        kind: "image",
        title: "saved.png",
        content: "file:///C:/brain/image-captures/saved.png",
        source_url: "",
        source_path: `${imageDir}\\saved.png`,
        thumbnail_path: `${thumbnailDir}\\saved-thumb.jpg`,
        capture_fingerprint: "image:saved",
        sort_order: 0,
        created_at: "2026-05-04T00:00:00.000Z",
        updated_at: "2026-05-04T00:00:00.000Z",
      },
    ]);
    const store = createStore("C:\\brain\\brain-desktop.db");
    store.addAutoCaptureEntry(`${autoDir}\\kept.jpg`, "screen text");
    const sizes = new Map([
      ["C:\\brain\\brain-desktop.db", 1024],
      [`${imageDir}\\saved.png`, 2048],
      [`${imageDir}\\stale.png`, 1536],
      [`${thumbnailDir}\\saved-thumb.jpg`, 512],
      [`${thumbnailDir}\\stale-thumb.jpg`, 256],
      [`${autoDir}\\kept.jpg`, 3072],
      [`${autoDir}\\stale.jpg`, 4096],
    ]);
    const directories = new Map([
      [imageDir, ["saved.png", "stale.png"]],
      [thumbnailDir, ["saved-thumb.jpg", "stale-thumb.jpg"]],
      [autoDir, ["kept.jpg", "stale.jpg"]],
    ]);
    fsMocks.existsSync.mockImplementation((targetPath: string) => sizes.has(targetPath) || directories.has(targetPath));
    fsMocks.statSync.mockImplementation((targetPath: string) => {
      if (directories.has(targetPath)) {
        return {
          isDirectory: () => true,
          isFile: () => false,
          size: 0,
        };
      }
      return {
        isDirectory: () => false,
        isFile: () => true,
        size: sizes.get(targetPath) ?? 0,
      };
    });
    fsMocks.readdirSync.mockImplementation((targetPath: string) => directories.get(targetPath) ?? []);
    fsMocks.rmSync.mockImplementation((targetPath: string) => {
      sizes.delete(targetPath);
      directories.forEach((children, directory) => {
        directories.set(directory, children.filter((child) => `${directory}\\${child}` !== targetPath));
      });
    });

    const result = store.cleanupOrphanedStorageFiles(autoDir);

    expect(fsMocks.rmSync).toHaveBeenCalledWith(`${imageDir}\\stale.png`, { force: true });
    expect(fsMocks.rmSync).toHaveBeenCalledWith(`${thumbnailDir}\\stale-thumb.jpg`, { force: true });
    expect(fsMocks.rmSync).toHaveBeenCalledWith(`${autoDir}\\stale.jpg`, { force: true });
    expect(fsMocks.rmSync).not.toHaveBeenCalledWith(`${imageDir}\\saved.png`, expect.anything());
    expect(fsMocks.rmSync).not.toHaveBeenCalledWith(`${autoDir}\\kept.jpg`, expect.anything());
    expect(result).toEqual(
      expect.objectContaining({
        removedFiles: 3,
        removedBytes: 5888,
      })
    );
  });

  it("searches cards and automatic capture OCR through one local search result list", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-04T03:00:00.000Z"));
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("预算报告 供应商");
    vi.setSystemTime(new Date("2026-05-04T03:10:00.000Z"));
    store.addAutoCaptureEntry("C:\\brain\\auto-captures\\budget.jpg", "发票 金额 预 算");

    const results = store.searchLocal("预算");

    expect(results.query).toBe("预算");
    expect(results.results).toEqual([
      expect.objectContaining({
        id: expect.stringMatching(/^auto-capture:/),
        source: "autoCapture",
        title: "自动记录 05/04 11:10",
        preview: "发票 金额 预 算",
        entry: expect.objectContaining({
          imagePath: "C:\\brain\\auto-captures\\budget.jpg",
          ocrText: "发票 金额 预 算",
        }),
      }),
      expect.objectContaining({
        source: "workbench",
        title: "预算报告 供应商",
        boxName: "收件箱",
        item: expect.objectContaining({
          kind: "text",
          content: "预算报告 供应商",
        }),
      }),
    ]);
  });

  it("creates a text item in the selected box", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureTextOrLink("Collect this reference note");

    expect(snapshot.items[0].kind).toBe("text");
    expect(snapshot.items[0].content).toBe("Collect this reference note");
    expect(snapshot.items[0].boxId).toBe(snapshot.panelState.selectedBoxId);
    expect(snapshot.items[0].sourcePath).toBe("");
  });

  it("creates a link item with sourceUrl metadata", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureTextOrLink("https://example.com/inspiration");

    expect(snapshot.items[0].kind).toBe("link");
    expect(snapshot.items[0].title).toBe("https://example.com/inspiration");
    expect(snapshot.items[0].sourceUrl).toBe("https://example.com/inspiration");
  });

  it("does not insert duplicate text captures in the same box after the short duplicate window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00.000Z"));
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("Repeated reference note");
    const duplicateSnapshot = store.captureTextOrLink("Repeated reference note");

    expect(duplicateSnapshot.items).toHaveLength(1);

    vi.advanceTimersByTime(10_001);
    const laterSnapshot = store.captureTextOrLink("Repeated reference note");

    expect(laterSnapshot.items).toHaveLength(1);
  });

  it("creates a text item in a specified box", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];
    database.seedBox({
      id: 2,
      name: "Brand",
      color: "#2563eb",
      description: "",
      sort_order: 1,
    });

    const snapshot = store.captureTextOrLinkIntoBox("Dragged idea", 2);

    expect(snapshot.items[0].kind).toBe("text");
    expect(snapshot.items[0].boxId).toBe(2);
    expect(snapshot.items[0].title).toBe("Dragged idea");
  });

  it("stores pasted image data as a file-backed image item", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureImageData("data:image/png;base64,ZmFrZQ==", "截图.png");

    expect(snapshot.items[0].kind).toBe("image");
    expect(snapshot.items[0].title).toBe("截图.png");
    expect(snapshot.items[0].content).toMatch(/^file:\/\/\/.+\.png$/);
    expect(snapshot.items[0].content).toContain("image-captures");
    expect(snapshot.items[0].sourcePath).toContain("image-captures");
    expect(snapshot.items[0]).toEqual(
      expect.objectContaining({
        thumbnailUrl: "data:image/jpeg;base64,ZmFrZS1wbmc=",
      })
    );
    expect(fsMocks.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("image-captures"), { recursive: true });
    expect(fsMocks.mkdirSync).toHaveBeenCalledWith(expect.stringContaining("image-thumbnails"), { recursive: true });
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(expect.stringContaining(".png"), Buffer.from("fake"));
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(expect.stringContaining(".jpg"), Buffer.from("fake-thumb"));
    expect(electronMocks.sourceImage.resize).toHaveBeenCalledWith({ width: 360, height: 240, quality: "good" });
  });

  it("migrates existing base64 image items into file-backed images on startup", () => {
    FakeDatabase.seedNextItems([
      {
        id: 17,
        box_id: 1,
        bundle_parent_item_id: null,
        kind: "image",
        title: "旧截图.png",
        content: "data:image/png;base64,ZmFrZQ==",
        source_url: "",
        source_path: "",
        thumbnail_path: "",
        capture_fingerprint: "",
        sort_order: 0,
        created_at: "2026-05-04T00:00:00.000Z",
        updated_at: "2026-05-04T00:00:00.000Z",
      },
    ]);

    const store = createStore("brain-desktop.db");
    const snapshot = store.getWorkbenchSnapshot();

    expect(snapshot.items[0].content).toMatch(/^file:\/\/\/.+\.png$/);
    expect(snapshot.items[0].content).toContain("image-captures");
    expect(snapshot.items[0].sourcePath).toContain("image-captures");
    expect(snapshot.items[0]).toEqual(
      expect.objectContaining({
        thumbnailUrl: "data:image/jpeg;base64,ZmFrZS1wbmc=",
      })
    );
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(expect.stringContaining("17"), Buffer.from("fake"));
  });

  it("exposes lightweight thumbnails separately from full automatic capture images", () => {
    fsMocks.readFileSync.mockImplementation((imagePath: string) =>
      imagePath.includes("image-thumbnails") ? Buffer.from("fake-thumb") : Buffer.from("fake-png")
    );
    const store = createStore("brain-desktop.db");

    store.addAutoCaptureEntry("C:\\brain\\auto-captures\\first.png", "会议截图");
    const snapshot = store.getAutoCaptureSnapshot();

    expect(snapshot.entries[0]).toEqual(
      expect.objectContaining({
        imageUrl: "data:image/png;base64,ZmFrZS1wbmc=",
        thumbnailUrl: "data:image/jpeg;base64,ZmFrZS10aHVtYg==",
      })
    );
    expect(fsMocks.writeFileSync).toHaveBeenCalledWith(expect.stringContaining(".jpg"), Buffer.from("fake-thumb"));
  });

  it("creates an image item in the specified box", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];
    database.seedBox({
      id: 2,
      name: "Brand",
      color: "#2563eb",
      description: "",
      sort_order: 1,
    });

    const snapshot = store.captureImageDataIntoBox("data:image/png;base64,ZmFrZQ==", "dragged.png", 2);

    expect(snapshot.items[0].kind).toBe("image");
    expect(snapshot.items[0].boxId).toBe(2);
    expect(snapshot.items[0].title).toBe("dragged.png");
  });

  it("updates a link title after enrichment", () => {
    const store = createStore("brain-desktop.db");
    const created = store.captureTextOrLink("https://example.com/inspiration");

    const snapshot = store.updateLinkTitle(created.items[0].id, "Example Inspiration");

    expect(snapshot?.items[0].title).toBe("Example Inspiration");
  });

  it("renames an existing item", () => {
    const store = createStore("brain-desktop.db");
    const created = store.captureTextOrLink("Original title");

    const snapshot = store.updateItemTitle(created.items[0].id, "Renamed title");

    expect(snapshot?.items[0].title).toBe("Renamed title");
  });

  it("falls back to Inbox when no selected box exists", () => {
    FakeDatabase.omitPanelStateRow = true;
    const store = createStore("brain-desktop.db");

    const snapshot = store.getWorkbenchSnapshot();

    expect(snapshot.panelState.selectedBoxId).toBe(snapshot.boxes[0].id);
  });

  it("creates an image item from one dropped image path", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureDroppedPaths(["C:\\assets\\hero.png"]);

    expect(snapshot.items[0].kind).toBe("image");
    expect(snapshot.items[0].title).toBe("hero.png");
    expect(snapshot.items[0].sourcePath).toBe("C:\\assets\\hero.png");
  });

  it("does not insert duplicate dropped paths in the same box after the short duplicate window", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00.000Z"));
    const store = createStore("brain-desktop.db");

    store.captureDroppedPaths(["C:\\assets\\hero.png"]);
    const duplicateSnapshot = store.captureDroppedPaths(["C:\\assets\\hero.png"]);

    expect(duplicateSnapshot.items).toHaveLength(1);

    vi.advanceTimersByTime(10_001);
    const laterSnapshot = store.captureDroppedPaths(["C:\\assets\\hero.png"]);

    expect(laterSnapshot.items).toHaveLength(1);
  });

  it("skips duplicate paths from a mixed multi-file drop while keeping new paths", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00.000Z"));
    const store = createStore("brain-desktop.db");

    store.captureDroppedPaths(["C:\\assets\\hero.png"]);
    const mixedSnapshot = store.captureDroppedPaths([
      "C:\\assets\\hero.png",
      "C:\\assets\\detail.png",
      "C:\\assets\\notes.pdf",
    ]);

    expect(mixedSnapshot.items).toHaveLength(2);
    expect(mixedSnapshot.items[0].kind).toBe("bundle");
    expect(mixedSnapshot.items[0].bundleCount).toBe(2);
    expect(store.getBundleEntries(mixedSnapshot.items[0].id)).toEqual([
      { entryPath: "C:\\assets\\detail.png", entryKind: "file", sortOrder: 0, exists: true },
      { entryPath: "C:\\assets\\notes.pdf", entryKind: "file", sortOrder: 1, exists: true },
    ]);
  });

  it("skips paths that were already captured inside an earlier bundle", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-30T00:00:00.000Z"));
    const store = createStore("brain-desktop.db");

    store.captureDroppedPaths(["C:\\assets\\hero.png", "C:\\assets\\detail.png"]);
    vi.advanceTimersByTime(10_001);
    const mixedSnapshot = store.captureDroppedPaths(["C:\\assets\\detail.png", "C:\\assets\\notes.pdf"]);

    expect(mixedSnapshot.items).toHaveLength(2);
    expect(mixedSnapshot.items[0].kind).toBe("file");
    expect(mixedSnapshot.items[0].title).toBe("notes.pdf");
    expect(mixedSnapshot.items[0].sourcePath).toBe("C:\\assets\\notes.pdf");
  });

  it("skips paths that were already captured as grouped bundle members", () => {
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("Bundle cover note");
    let snapshot = store.captureDroppedPaths(["C:\\assets\\hero.png"]);
    const coverItemId = snapshot.items.find((item) => item.title === "Bundle cover note")?.id ?? 0;
    const imageItemId = snapshot.items.find((item) => item.title === "hero.png")?.id ?? 0;
    snapshot = store.groupItems(imageItemId, coverItemId);

    const duplicateSnapshot = store.captureDroppedPaths(["C:\\assets\\hero.png"]);

    expect(snapshot.items.filter((item) => item.bundleParentId != null)).toHaveLength(2);
    expect(duplicateSnapshot.items).toHaveLength(snapshot.items.length);
  });

  it("creates a file item from one dropped non-image path", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureDroppedPaths(["C:\\assets\\notes.pdf"]);

    expect(snapshot.items[0].kind).toBe("file");
    expect(snapshot.items[0].title).toBe("notes.pdf");
    expect(snapshot.items[0].sourcePath).toBe("C:\\assets\\notes.pdf");
  });

  it("creates one bundle from multiple dropped paths", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureDroppedPaths([
      "C:\\assets\\hero.png",
      "C:\\assets\\detail.png",
    ]);

    expect(snapshot.items[0].kind).toBe("bundle");
    expect(snapshot.items[0].title).toBe("拖入组合");
    expect(snapshot.items[0].bundleCount).toBe(2);
  });

  it("creates one bundle from a dropped folder path", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureDroppedPaths(["C:\\assets\\moodboard"]);

    expect(snapshot.items[0].kind).toBe("bundle");
    expect(snapshot.items[0].title).toBe("拖入组合");
    expect(snapshot.items[0].bundleCount).toBe(1);
    expect(store.getBundleEntries(snapshot.items[0].id)).toEqual([
      { entryPath: "C:\\assets\\moodboard", entryKind: "folder", sortOrder: 0, exists: true },
    ]);
  });

  it("marks missing bundle entry paths when loading a bundle", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureDroppedPaths([
      "C:\\assets\\hero.png",
      "C:\\assets\\missing-folder",
    ]);

    expect(store.getBundleEntries(snapshot.items[0].id)).toEqual([
      { entryPath: "C:\\assets\\hero.png", entryKind: "file", sortOrder: 0, exists: true },
      { entryPath: "C:\\assets\\missing-folder", entryKind: "folder", sortOrder: 1, exists: false },
    ]);
  });

  it("removes a single path from a bundle without deleting the card", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureDroppedPaths([
      "C:\\assets\\hero.png",
      "C:\\assets\\detail.png",
    ]);
    const updated = store.removeBundleEntry(snapshot.items[0].id, "C:\\assets\\detail.png");

    expect(updated.items[0].kind).toBe("bundle");
    expect(updated.items[0].bundleCount).toBe(1);
    expect(store.getBundleEntries(snapshot.items[0].id)).toEqual([
      { entryPath: "C:\\assets\\hero.png", entryKind: "file", sortOrder: 0, exists: true },
    ]);
  });

  it("selects a box and uses it for later quick capture", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];
    database.seedBox({
      id: 2,
      name: "Brand",
      color: "#2563eb",
      description: "",
      sort_order: 1,
    });

    const selected = store.selectBox(2);
    const captured = store.captureTextOrLink("Brand direction note");

    expect(selected.panelState.selectedBoxId).toBe(2);
    expect(captured.items[0].boxId).toBe(2);
    expect(captured.items[0].content).toBe("Brand direction note");
  });

  it("keeps the current selection unchanged when selecting a missing box", () => {
    const store = createStore("brain-desktop.db");
    const before = store.getWorkbenchSnapshot();

    const after = store.selectBox(9999);

    expect(after.panelState.selectedBoxId).toBe(before.panelState.selectedBoxId);
    expect(after.boxes).toEqual(before.boxes);
  });

  it("creates a new box and selects it", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.createBox("Brand");

    expect(snapshot.boxes.map((box) => box.name)).toEqual(["收件箱", "Brand"]);
    expect(snapshot.panelState.selectedBoxId).toBe(snapshot.boxes[1].id);
  });

  it("updates an existing box name and description", () => {
    const store = createStore("brain-desktop.db");
    const created = store.createBox("Brand");
    const brandBoxId = created.boxes.find((box) => box.name === "Brand")?.id ?? 0;

    const renamed = store.updateBox(brandBoxId, "Visuals", "Saved references");

    expect(renamed?.boxes.map((box) => box.name)).toEqual(["收件箱", "Visuals"]);
    expect(renamed?.boxes.find((box) => box.id === brandBoxId)?.description).toBe("Saved references");
  });

  it("reorders boxes", () => {
    const store = createStore("brain-desktop.db");
    store.createBox("Brand");
    const visuals = store.createBox("Visuals");
    const visualsId = visuals.boxes.find((box) => box.name === "Visuals")?.id ?? 0;

    const reordered = store.reorderBox(visualsId, "up");

    expect(reordered.boxes.map((box) => box.name)).toEqual(["收件箱", "Visuals", "Brand"]);
  });

  it("deletes a box and moves its items into the fallback box", () => {
    const store = createStore("brain-desktop.db");
    const brand = store.createBox("Brand");
    const brandBoxId = brand.boxes.find((box) => box.name === "Brand")?.id ?? 0;

    store.captureTextOrLink("Brand note");
    const deleted = store.deleteBox(brandBoxId);

    expect(deleted.boxes.map((box) => box.name)).toEqual(["收件箱"]);
    expect(deleted.panelState.selectedBoxId).toBe(deleted.boxes[0].id);
    expect(deleted.items[0].boxId).toBe(deleted.boxes[0].id);
    expect(deleted.items[0].title).toBe("Brand note");
  });

  it("keeps the fallback box when asked to delete it", () => {
    const store = createStore("brain-desktop.db");
    const before = store.getWorkbenchSnapshot();

    const after = store.deleteBox(before.boxes[0].id);

    expect(after).toEqual(before);
  });

  it("clears only the requested item kind from one box", () => {
    const store = createStore("brain-desktop.db");
    const brand = store.createBox("Brand");
    const inboxBoxId = brand.boxes.find((box) => box.name === "收件箱")?.id ?? 0;
    const brandBoxId = brand.boxes.find((box) => box.name === "Brand")?.id ?? 0;

    store.captureTextOrLinkIntoBox("https://example.com/inbox", inboxBoxId);
    store.captureTextOrLinkIntoBox("Brand note", brandBoxId);
    store.captureTextOrLinkIntoBox("https://example.com/brand", brandBoxId);

    const cleared = store.clearBoxItems(brandBoxId, "link");

    expect(cleared.items.map((item) => ({ boxId: item.boxId, kind: item.kind, title: item.title }))).toEqual([
      { boxId: inboxBoxId, kind: "link", title: "https://example.com/inbox" },
      { boxId: brandBoxId, kind: "text", title: "Brand note" },
    ]);
  });

  it("creates an image item in the specified box from one dropped image path", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];
    database.seedBox({
      id: 2,
      name: "Brand",
      color: "#2563eb",
      description: "",
      sort_order: 1,
    });

    const snapshot = store.captureDroppedPathsIntoBox(["C:\\assets\\hero.png"], 2);

    expect(snapshot.items[0].kind).toBe("image");
    expect(snapshot.items[0].boxId).toBe(2);
    expect(snapshot.items[0].title).toBe("hero.png");
  });

  it("creates a bundle in the specified box", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];
    database.seedBox({
      id: 2,
      name: "Brand",
      color: "#2563eb",
      description: "",
      sort_order: 1,
    });

    const snapshot = store.captureDroppedPathsIntoBox(
      ["C:\\assets\\hero.png", "C:\\assets\\detail.png"],
      2
    );

    expect(snapshot.items[0].kind).toBe("bundle");
    expect(snapshot.items[0].boxId).toBe(2);
    expect(snapshot.items[0].bundleCount).toBe(2);
  });

  it("moves an item into another box", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];
    database.seedBox({
      id: 2,
      name: "Brand",
      color: "#2563eb",
      description: "",
      sort_order: 1,
    });

    const created = store.captureTextOrLink("Inbox note");
    const moved = store.moveItemToBox(created.items[0].id, 2);

    expect(moved.items[0].boxId).toBe(2);
    expect(moved.items[0].title).toBe("Inbox note");
  });

  it("applies AI organization by creating boxes, moving cards, and updating titles", () => {
    const store = createStore("brain-desktop.db");
    const captured = store.captureTextOrLink("rough note about model routing");
    const itemId = captured.items[0].id;

    const organized = store.applyAiOrganization([
      {
        itemId,
        suggestedTitle: "Model routing notes",
        targetBoxId: null,
        targetBoxName: "AI",
        createBox: true,
        confidence: 0.86,
        reason: "内容和 AI 工作流相关",
      },
    ]);

    const aiBox = organized.boxes.find((box) => box.name === "AI");
    expect(aiBox).toBeDefined();
    expect(organized.items.find((item) => item.id === itemId)).toEqual(
      expect.objectContaining({
        title: "Model routing notes",
        boxId: aiBox?.id,
      })
    );
  });

  it("deletes a bundle item and its saved entries", () => {
    const store = createStore("brain-desktop.db");
    const snapshot = store.captureDroppedPaths(["C:\\assets\\hero.png", "C:\\assets\\refs"]);

    const deleted = store.deleteItem(snapshot.items[0].id);

    expect(deleted.items).toEqual([]);
    expect(store.getBundleEntries(snapshot.items[0].id)).toEqual([]);
  });

  it("reorders items within the selected box", () => {
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("First note");
    const latest = store.captureTextOrLink("Second note");
    const reordered = store.reorderItem(latest.items[0].id, "down");

    expect(
      reordered.items
        .filter((item) => item.boxId === reordered.panelState.selectedBoxId)
        .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
        .map((item) => item.title)
    ).toEqual(["First note", "Second note"]);
  });

  it("moves an item to an explicit index within its box", () => {
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("First note");
    store.captureTextOrLink("Second note");
    const latest = store.captureTextOrLink("Third note");
    const firstItemId = latest.items.find((item) => item.title === "First note")?.id;

    const reordered = store.moveItemToIndex(firstItemId ?? 0, 1);

    expect(
      reordered.items
        .filter((item) => item.boxId === reordered.panelState.selectedBoxId)
        .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
        .map((item) => item.title)
    ).toEqual(["Third note", "First note", "Second note"]);
  });

  it("moves an item to a target index within the selected box", () => {
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("First note");
    const middle = store.captureTextOrLink("Second note");
    store.captureTextOrLink("Third note");
    const reordered = store.moveItemToIndex(middle.items[0].id, 2);

    expect(
      reordered.items
        .filter((item) => item.boxId === reordered.panelState.selectedBoxId)
        .sort((left, right) => (left.sortOrder ?? 0) - (right.sortOrder ?? 0))
        .map((item) => item.title)
    ).toEqual(["Third note", "First note", "Second note"]);
  });

  it("groups two top-level cards into a bundle and hides the member cards from the top level", () => {
    const store = createStore("brain-desktop.db");

    const first = store.captureTextOrLink("Cover note");
    const second = store.captureTextOrLink("Source note");
    const coverItemId = first.items.find((item) => item.title === "Cover note")?.id ?? 0;
    const sourceItemId = second.items.find((item) => item.title === "Source note")?.id ?? 0;

    const grouped = store.groupItems(sourceItemId, coverItemId);
    const topLevelItems = grouped.items.filter((item) => item.bundleParentId == null);
    const memberItems = grouped.items.filter((item) => item.bundleParentId != null);

    expect(topLevelItems).toHaveLength(1);
    expect(topLevelItems[0]).toEqual(
      expect.objectContaining({
        kind: "bundle",
        title: "",
        bundleCount: 2,
      })
    );
    expect(memberItems.map((item) => item.title)).toEqual(["Cover note", "Source note"]);
  });

  it("adds another top-level card into an existing bundle", () => {
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("Cover note");
    let snapshot = store.captureTextOrLink("Source note");
    const coverItemId = snapshot.items.find((item) => item.title === "Cover note")?.id ?? 0;
    const sourceItemId = snapshot.items.find((item) => item.title === "Source note")?.id ?? 0;
    snapshot = store.groupItems(sourceItemId, coverItemId);

    const bundleItemId = snapshot.items.find((item) => item.kind === "bundle")?.id ?? 0;
    snapshot = store.captureTextOrLink("Third note");
    const thirdItemId = snapshot.items.find((item) => item.title === "Third note")?.id ?? 0;

    const grouped = store.groupItems(thirdItemId, bundleItemId);

    expect(grouped.items.filter((item) => item.bundleParentId == null)).toEqual([
      expect.objectContaining({ id: bundleItemId, kind: "bundle", bundleCount: 3 }),
    ]);
    expect(grouped.items.filter((item) => item.bundleParentId === bundleItemId)).toHaveLength(3);
  });

  it("moves a bundle member back to the top level and dissolves the bundle when one member remains", () => {
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("Cover note");
    const created = store.captureTextOrLink("Source note");
    const coverItemId = created.items.find((item) => item.title === "Cover note")?.id ?? 0;
    const sourceItemId = created.items.find((item) => item.title === "Source note")?.id ?? 0;
    const grouped = store.groupItems(sourceItemId, coverItemId);
    const sourceMemberId = grouped.items.find((item) => item.title === "Source note")?.id ?? 0;

    const moved = store.moveItemToIndex(sourceMemberId, 1);

    expect(moved.items.find((item) => item.kind === "bundle")).toBeUndefined();
    expect(moved.items.filter((item) => item.bundleParentId == null).map((item) => item.title)).toEqual([
      "Cover note",
      "Source note",
    ]);
  });

  it("moves a bundle member back to the top level and keeps the bundle with the remaining members", () => {
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("Cover note");
    let snapshot = store.captureTextOrLink("Source note");
    const coverItemId = snapshot.items.find((item) => item.title === "Cover note")?.id ?? 0;
    const sourceItemId = snapshot.items.find((item) => item.title === "Source note")?.id ?? 0;
    snapshot = store.groupItems(sourceItemId, coverItemId);

    snapshot = store.captureTextOrLink("Third note");
    const thirdItemId = snapshot.items.find((item) => item.title === "Third note")?.id ?? 0;
    snapshot = store.groupItems(thirdItemId, snapshot.items.find((item) => item.kind === "bundle")?.id ?? 0);

    const sourceMemberId = snapshot.items.find((item) => item.title === "Source note")?.id ?? 0;
    const sourceBundleId = snapshot.items.find((item) => item.kind === "bundle")?.id ?? 0;

    const moved = store.moveItemToIndex(sourceMemberId, 1);

    expect(moved.items.find((item) => item.id === sourceMemberId)).toEqual(
      expect.objectContaining({
        title: "Source note",
        bundleParentId: null,
      })
    );
    expect(moved.items.find((item) => item.id === sourceBundleId)).toEqual(
      expect.objectContaining({
        kind: "bundle",
        bundleCount: 2,
      })
    );
    expect(moved.items.filter((item) => item.bundleParentId === sourceBundleId).map((item) => item.title)).toEqual([
      "Cover note",
      "Third note",
    ]);
  });

  it("moves a bundle member into another bundle and dissolves the source bundle when one member remains", () => {
    const store = createStore("brain-desktop.db");

    store.captureTextOrLink("Cover A");
    let snapshot = store.captureTextOrLink("Member A");
    const coverAId = snapshot.items.find((item) => item.title === "Cover A")?.id ?? 0;
    const memberAId = snapshot.items.find((item) => item.title === "Member A")?.id ?? 0;
    snapshot = store.groupItems(memberAId, coverAId);

    store.captureTextOrLink("Cover B");
    snapshot = store.captureTextOrLink("Member B");
    const coverBId = snapshot.items.find((item) => item.title === "Cover B")?.id ?? 0;
    const memberBId = snapshot.items.find((item) => item.title === "Member B")?.id ?? 0;
    snapshot = store.groupItems(memberBId, coverBId);

    const sourceMember = snapshot.items.find((item) => item.title === "Member A");
    const targetMember = snapshot.items.find((item) => item.title === "Member B");
    const sourceBundleId = sourceMember?.bundleParentId ?? 0;
    const targetBundleId = targetMember?.bundleParentId ?? 0;
    const sourceMemberId = sourceMember?.id ?? 0;

    const moved = store.groupItems(sourceMemberId, targetBundleId);

    expect(moved.items.find((item) => item.id === sourceBundleId && item.kind === "bundle")).toBeUndefined();
    expect(moved.items.find((item) => item.title === "Cover A" && item.bundleParentId == null)).toBeDefined();
    expect(moved.items.find((item) => item.id === targetBundleId)).toEqual(
      expect.objectContaining({
        kind: "bundle",
        bundleCount: 3,
      })
    );
    expect(
      moved.items
        .filter((item) => item.bundleParentId === targetBundleId)
        .map((item) => item.title)
    ).toEqual(["Cover B", "Member B", "Member A"]);
  });

  it("closes the backing database handle", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];

    store.close();

    expect(database?.closed).toBe(true);
  });
});
