import Database from "better-sqlite3";
import { basename, extname } from "node:path";
import type { Box, Item, WorkbenchSnapshot } from "../shared/types";

export type BundleEntry = {
  entryPath: string;
  entryKind: "file" | "folder";
  sortOrder: number;
};

export type DesktopStore = {
  getWorkbenchSnapshot: () => WorkbenchSnapshot;
  captureTextOrLink: (input: string) => WorkbenchSnapshot;
  captureDroppedPaths: (paths: string[]) => WorkbenchSnapshot;
  getBundleEntries: (bundleItemId: number) => BundleEntry[];
  updateLinkTitle: (itemId: number, title: string) => WorkbenchSnapshot | null;
  close: () => void;
};

export function createStore(filename: string): DesktopStore {
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
      kind text not null,
      title text not null,
      content text not null default '',
      source_url text not null default '',
      source_path text not null default '',
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
      quick_panel_open integer not null default 1
    );
  `);
  for (const statement of [
    "alter table items add column source_url text not null default ''",
    "alter table items add column source_path text not null default ''",
    "alter table items add column created_at text not null default ''",
    "alter table items add column updated_at text not null default ''",
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
      .run("Inbox", "#f97316", "Default collection box", 0);
    db.prepare(
      "insert or replace into panel_state (id, selected_box_id, quick_panel_open) values (1, ?, 1)"
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
    return firstLine || "Quick note";
  }

  function titleFromPath(filePath: string) {
    return basename(filePath) || filePath;
  }

  function isLikelyFolderPath(filePath: string) {
    return extname(filePath) === "";
  }

  function readWorkbenchSnapshot(): WorkbenchSnapshot {
    const boxes = db
      .prepare(
        "select id, name, color, description, sort_order as sortOrder from boxes order by sort_order asc"
      )
      .all() as Box[];
    const items = db
      .prepare(
        "select items.id, items.box_id as boxId, items.kind, items.title, items.content, items.source_url as sourceUrl, items.source_path as sourcePath, coalesce(bundle_counts.bundleCount, 0) as bundleCount, items.created_at as createdAt, items.updated_at as updatedAt from items left join (select bundle_item_id, count(*) as bundleCount from bundle_entries group by bundle_item_id) bundle_counts on bundle_counts.bundle_item_id = items.id order by items.id desc"
      )
      .all() as Item[];
    const panelStateRow = db
      .prepare(
        "select selected_box_id as selectedBoxId, quick_panel_open as quickPanelOpen from panel_state where id = 1"
      )
      .get() as { selectedBoxId: number | null; quickPanelOpen: number } | undefined;

    return {
      boxes,
      items,
      panelState: panelStateRow
        ? {
            selectedBoxId: panelStateRow.selectedBoxId,
            quickPanelOpen: Boolean(panelStateRow.quickPanelOpen),
          }
        : { selectedBoxId: boxes[0]?.id ?? null, quickPanelOpen: true },
    };
  }

  function getTargetBoxId() {
    const snapshot = readWorkbenchSnapshot();
    return snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null;
  }

  return {
    getWorkbenchSnapshot: readWorkbenchSnapshot,
    captureTextOrLink(input: string): WorkbenchSnapshot {
      const trimmed = input.trim();
      const targetBoxId = getTargetBoxId();
      if (!trimmed || !targetBoxId) {
        return readWorkbenchSnapshot();
      }

      const link = isHttpUrl(trimmed);
      const timestamp = nowIso();
      db.prepare(`
        insert into items (box_id, kind, title, content, source_url, source_path, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetBoxId,
        link ? "link" : "text",
        link ? trimmed : deriveTextTitle(trimmed),
        link ? trimmed : trimmed,
        link ? trimmed : "",
        "",
        timestamp,
        timestamp
      );
      return readWorkbenchSnapshot();
    },
    captureDroppedPaths(paths: string[]): WorkbenchSnapshot {
      const cleanedPaths = paths.map((value) => value.trim()).filter(Boolean);
      const targetBoxId = getTargetBoxId();
      if (!cleanedPaths.length || !targetBoxId) {
        return readWorkbenchSnapshot();
      }

      const timestamp = nowIso();
      const shouldBundle = cleanedPaths.length > 1 || cleanedPaths.some(isLikelyFolderPath);

      if (!shouldBundle) {
        const singlePath = cleanedPaths[0];
        db.prepare(`
          insert into items (box_id, kind, title, content, source_url, source_path, created_at, updated_at)
          values (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          targetBoxId,
          "file",
          titleFromPath(singlePath),
          singlePath,
          "",
          singlePath,
          timestamp,
          timestamp
        );
        return readWorkbenchSnapshot();
      }

      const summary = `${cleanedPaths.length} item${cleanedPaths.length === 1 ? "" : "s"}`;
      const result = db.prepare(`
        insert into items (box_id, kind, title, content, source_url, source_path, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetBoxId,
        "bundle",
        "Dropped bundle",
        summary,
        "",
        "",
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
    },
    getBundleEntries(bundleItemId: number): BundleEntry[] {
      return db
        .prepare(
          "select entry_path as entryPath, entry_kind as entryKind, sort_order as sortOrder from bundle_entries where bundle_item_id = ? order by sort_order asc"
        )
        .all(bundleItemId) as BundleEntry[];
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
