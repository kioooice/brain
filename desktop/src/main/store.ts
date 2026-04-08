import Database from "better-sqlite3";
import type { Box, Item, PanelState, WorkbenchSnapshot } from "../shared/types";

export type DesktopStore = {
  getWorkbenchSnapshot: () => WorkbenchSnapshot;
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
      content text not null default ''
    );
    create table if not exists panel_state (
      id integer primary key check (id = 1),
      selected_box_id integer,
      quick_panel_open integer not null default 1
    );
  `);

  const boxCount = db.prepare("select count(*) as count from boxes").get() as { count: number };
  if (boxCount.count === 0) {
    const info = db
      .prepare("insert into boxes (name, color, description, sort_order) values (?, ?, ?, ?)")
      .run("Inbox", "#f97316", "Default collection box", 0);
    db.prepare(
      "insert or replace into panel_state (id, selected_box_id, quick_panel_open) values (1, ?, 1)"
    ).run(Number(info.lastInsertRowid));
  }

  return {
    getWorkbenchSnapshot(): WorkbenchSnapshot {
      const boxes = db
        .prepare(
          "select id, name, color, description, sort_order as sortOrder from boxes order by sort_order asc"
        )
        .all() as Box[];
      const items = db
        .prepare("select id, box_id as boxId, kind, title, content from items order by id desc")
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
    },
    close() {
      db.close();
    },
  };
}
