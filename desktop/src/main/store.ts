import Database from "better-sqlite3";
import * as fs from "node:fs";
import { basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import type {
  Box,
  BundleEntry,
  ClearBoxItemsKind,
  Item,
  SimpleModeView,
  WindowBounds,
  WorkbenchSnapshot,
} from "../shared/types";

export type DesktopStore = {
  getWorkbenchSnapshot: () => WorkbenchSnapshot;
  setAlwaysOnTop: (enabled: boolean) => WorkbenchSnapshot;
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
  selectBox: (boxId: number) => WorkbenchSnapshot;
  getBundleEntries: (bundleItemId: number) => BundleEntry[];
  updateLinkTitle: (itemId: number, title: string) => WorkbenchSnapshot | null;
  close: () => void;
};

export function createStore(filename: string): DesktopStore {
  const BOX_COLORS = ["#f97316", "#2563eb", "#16a34a", "#dc2626", "#d97706", "#0891b2"];
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
      selected_box_id integer,
      quick_panel_open integer not null default 1,
      simple_mode integer not null default 0,
      always_on_top integer not null default 0,
      simple_mode_view text not null default 'ball',
      floating_ball_x integer,
      floating_ball_y integer,
      floating_ball_width integer,
      floating_ball_height integer
    );
  `);
  for (const statement of [
    "alter table items add column source_url text not null default ''",
    "alter table items add column source_path text not null default ''",
    "alter table items add column sort_order integer not null default 0",
    "alter table items add column created_at text not null default ''",
    "alter table items add column updated_at text not null default ''",
    "alter table items add column bundle_parent_item_id integer",
    "alter table panel_state add column simple_mode integer not null default 0",
    "alter table panel_state add column always_on_top integer not null default 0",
    "alter table panel_state add column simple_mode_view text not null default 'ball'",
    "alter table panel_state add column floating_ball_x integer",
    "alter table panel_state add column floating_ball_y integer",
    "alter table panel_state add column floating_ball_width integer",
    "alter table panel_state add column floating_ball_height integer",
  ]) {
    try {
      db.exec(statement);
    } catch {
      // Column already exists in previously bootstrapped databases.
    }
  }

  const boxCount = db.prepare("select count(*) as count from boxes").get() as { count: number };
  if (boxCount.count === 0) {
    const info = db
      .prepare("insert into boxes (name, color, description, sort_order) values (?, ?, ?, ?)")
      .run("收件箱", "#f97316", "默认收集盒子", 0);
    db.prepare(
      "insert or replace into panel_state (id, selected_box_id, quick_panel_open, simple_mode, always_on_top, simple_mode_view, floating_ball_x, floating_ball_y, floating_ball_width, floating_ball_height) values (1, ?, 1, 0, 0, 'ball', null, null, null, null)"
    ).run(Number(info.lastInsertRowid));
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

  function readWorkbenchSnapshot(): WorkbenchSnapshot {
    const boxes = db
      .prepare(
        "select id, name, color, description, sort_order as sortOrder from boxes order by sort_order asc"
      )
      .all() as Box[];
    const rawItems = db
      .prepare(
        "select items.id, items.box_id as boxId, items.bundle_parent_item_id as bundleParentId, items.kind, items.title, items.content, items.source_url as sourceUrl, items.source_path as sourcePath, coalesce(bundle_entry_counts.bundleEntryCount, 0) as bundleEntryCount, items.sort_order as sortOrder, items.created_at as createdAt, items.updated_at as updatedAt from items left join (select bundle_item_id, count(*) as bundleEntryCount from bundle_entries group by bundle_item_id) bundle_entry_counts on bundle_entry_counts.bundle_item_id = items.id order by items.box_id asc, coalesce(items.bundle_parent_item_id, items.id) asc, items.sort_order asc, items.id desc"
      )
      .all() as Array<Item & { bundleParentId: number | null; bundleEntryCount: number }>;
    const bundleChildCounts = rawItems.reduce<Record<number, number>>((counts, item) => {
      if (item.bundleParentId != null) {
        counts[item.bundleParentId] = (counts[item.bundleParentId] ?? 0) + 1;
      }
      return counts;
    }, {});
    const items = rawItems.map(({ bundleEntryCount, ...item }) => ({
      ...item,
      bundleParentId: item.bundleParentId ?? null,
      bundleCount: bundleEntryCount + (bundleChildCounts[item.id] ?? 0),
    })) as Item[];
    const panelStateRow = db
      .prepare(
        "select selected_box_id as selectedBoxId, quick_panel_open as quickPanelOpen, simple_mode as simpleMode, always_on_top as alwaysOnTop, simple_mode_view as simpleModeView, floating_ball_x as floatingBallX, floating_ball_y as floatingBallY, floating_ball_width as floatingBallWidth, floating_ball_height as floatingBallHeight from panel_state where id = 1"
      )
      .get() as
      | {
          selectedBoxId: number | null;
          quickPanelOpen: number;
          simpleMode: number;
          alwaysOnTop: number;
          simpleModeView: string | null;
          floatingBallX: number | null;
          floatingBallY: number | null;
          floatingBallWidth: number | null;
          floatingBallHeight: number | null;
        }
      | undefined;

    return {
      boxes,
      items,
      panelState: panelStateRow
        ? {
            selectedBoxId: panelStateRow.selectedBoxId,
            quickPanelOpen: Boolean(panelStateRow.quickPanelOpen),
            simpleMode: Boolean(panelStateRow.simpleMode),
            alwaysOnTop: Boolean(panelStateRow.alwaysOnTop),
            simpleModeView:
              panelStateRow.simpleModeView === "panel"
                ? "panel"
                : panelStateRow.simpleModeView === "box"
                  ? "box"
                  : "ball",
            floatingBallBounds:
              panelStateRow.floatingBallX == null ||
              panelStateRow.floatingBallY == null ||
              panelStateRow.floatingBallWidth == null ||
              panelStateRow.floatingBallHeight == null
                ? null
                : {
                    x: panelStateRow.floatingBallX,
                    y: panelStateRow.floatingBallY,
                    width: panelStateRow.floatingBallWidth,
                    height: panelStateRow.floatingBallHeight,
                  },
          }
        : {
            selectedBoxId: boxes[0]?.id ?? null,
            quickPanelOpen: true,
            simpleMode: false,
            alwaysOnTop: false,
            simpleModeView: "ball",
            floatingBallBounds: null,
          },
    };
  }

  function writePanelState(
    selectedBoxId: number | null,
    quickPanelOpen: boolean,
    simpleMode: boolean,
    alwaysOnTop: boolean,
    simpleModeView: SimpleModeView,
    floatingBallBounds: WindowBounds | null
  ) {
    db.prepare(`
      insert or replace into panel_state (id, selected_box_id, quick_panel_open, simple_mode, always_on_top, simple_mode_view, floating_ball_x, floating_ball_y, floating_ball_width, floating_ball_height)
      values (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      selectedBoxId,
      quickPanelOpen ? 1 : 0,
      simpleMode ? 1 : 0,
      alwaysOnTop ? 1 : 0,
      simpleModeView,
      floatingBallBounds?.x ?? null,
      floatingBallBounds?.y ?? null,
      floatingBallBounds?.width ?? null,
      floatingBallBounds?.height ?? null
    );
  }

  function getPanelStateDefaults(snapshot = readWorkbenchSnapshot()): PanelStateDefaults {
    return {
      selectedBoxId: snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null,
      quickPanelOpen: snapshot.panelState.quickPanelOpen,
      simpleMode: Boolean(snapshot.panelState.simpleMode),
      alwaysOnTop: Boolean(snapshot.panelState.alwaysOnTop),
      simpleModeView:
        snapshot.panelState.simpleModeView === "panel"
          ? "panel"
          : snapshot.panelState.simpleModeView === "box"
            ? "box"
            : "ball",
      floatingBallBounds: snapshot.panelState.floatingBallBounds ?? null,
    };
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
    const sortOrder = getNextTopSortOrder(targetBoxId);
    const shouldBundle = cleanedPaths.length > 1 || cleanedPaths.some(isLikelyFolderPath);

    if (!shouldBundle) {
      const singlePath = cleanedPaths[0];
      const imagePath = isImagePath(singlePath);
      db.prepare(`
        insert into items (box_id, kind, title, content, source_url, source_path, sort_order, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetBoxId,
        imagePath ? "image" : "file",
        titleFromPath(singlePath),
        imagePath ? pathToFileURL(singlePath).href : singlePath,
        "",
        singlePath,
        sortOrder,
        timestamp,
        timestamp
      );
      return readWorkbenchSnapshot();
    }

    const summary = `${cleanedPaths.length} 个项目`;
    const result = db.prepare(`
      insert into items (box_id, kind, title, content, source_url, source_path, sort_order, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetBoxId,
      "bundle",
      "拖入组合",
      summary,
      "",
      "",
      sortOrder,
      timestamp,
      timestamp
    ) as { lastInsertRowid: number | bigint };

    const bundleItemId = Number(result.lastInsertRowid);
    const insertEntry = db.prepare(`
      insert into bundle_entries (bundle_item_id, entry_path, entry_kind, sort_order)
      values (?, ?, ?, ?)
    `);

    cleanedPaths.forEach((entryPath, index) => {
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
    const sortOrder = getNextTopSortOrder(targetBoxId);

    db.prepare(`
      insert into items (box_id, kind, title, content, source_url, source_path, sort_order, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetBoxId,
      isLink ? "link" : "text",
      isLink ? trimmed : deriveTextTitle(trimmed),
      isLink ? trimmed : trimmed,
      isLink ? trimmed : "",
      "",
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
    const sortOrder = getNextTopSortOrder(targetBoxId);

    db.prepare(`
      insert into items (box_id, kind, title, content, source_url, source_path, sort_order, created_at, updated_at)
      values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      targetBoxId,
      "image",
      trimmedTitle || "粘贴图片",
      trimmedDataUrl,
      "",
      "",
      sortOrder,
      timestamp,
      timestamp
    );

    return readWorkbenchSnapshot();
  }

  return {
    getWorkbenchSnapshot: readWorkbenchSnapshot,
    setAlwaysOnTop(enabled: boolean): WorkbenchSnapshot {
      const panelState = getPanelStateDefaults();
      writePanelState(
        panelState.selectedBoxId,
        panelState.quickPanelOpen,
        panelState.simpleMode,
        enabled,
        panelState.simpleModeView,
        panelState.floatingBallBounds
      );
      return readWorkbenchSnapshot();
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
      const panelState = getPanelStateDefaults();

      writePanelState(
        boxId,
        panelState.quickPanelOpen,
        panelState.simpleMode,
        panelState.alwaysOnTop,
        panelState.simpleModeView,
        panelState.floatingBallBounds
      );

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
      const panelState = getPanelStateDefaults(snapshot);
      writePanelState(
        nextSelectedBoxId,
        panelState.quickPanelOpen,
        panelState.simpleMode,
        panelState.alwaysOnTop,
        panelState.simpleModeView,
        panelState.floatingBallBounds
      );

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

      const panelState = getPanelStateDefaults(snapshot);
      writePanelState(
        boxId,
        panelState.quickPanelOpen,
        panelState.simpleMode,
        panelState.alwaysOnTop,
        panelState.simpleModeView,
        panelState.floatingBallBounds
      );

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
  type PanelStateDefaults = {
    selectedBoxId: number | null;
    quickPanelOpen: boolean;
    simpleMode: boolean;
    alwaysOnTop: boolean;
    simpleModeView: SimpleModeView;
    floatingBallBounds: WindowBounds | null;
  };
