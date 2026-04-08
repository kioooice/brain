import Database from "better-sqlite3";
import type { Box, Item, WorkbenchSnapshot } from "../shared/types";

export type DesktopStore = {
  getWorkbenchSnapshot: () => WorkbenchSnapshot;
  captureTextOrLink: (input: string) => WorkbenchSnapshot;
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
      created_at text not null default '',
      updated_at text not null default ''
    );
    create table if not exists panel_state (
      id integer primary key check (id = 1),
      selected_box_id integer,
      quick_panel_open integer not null default 1
    );
  `);
  for (const statement of [
    "alter table items add column source_url text not null default ''",
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

  function readWorkbenchSnapshot(): WorkbenchSnapshot {
    const boxes = db
      .prepare(
        "select id, name, color, description, sort_order as sortOrder from boxes order by sort_order asc"
      )
      .all() as Box[];
    const items = db
      .prepare(
        "select id, box_id as boxId, kind, title, content, source_url as sourceUrl, created_at as createdAt, updated_at as updatedAt from items order by id desc"
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
        insert into items (box_id, kind, title, content, source_url, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?)
      `).run(
        targetBoxId,
        link ? "link" : "text",
        link ? trimmed : deriveTextTitle(trimmed),
        link ? trimmed : trimmed,
        link ? trimmed : "",
        timestamp,
        timestamp
      );
      return readWorkbenchSnapshot();
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
