import { describe, expect, it, vi } from "vitest";

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
  kind: string;
  title: string;
  content: string;
};

type PanelStateRow = {
  selected_box_id: number | null;
  quick_panel_open: number;
};

class FakeDatabase {
  private boxes: BoxRow[] = [];
  private items: ItemRow[] = [];
  private panelState: PanelStateRow | null = null;
  private lastInsertRowid = 0;
  closed = false;

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

    if (sql.includes("insert or replace into panel_state")) {
      return {
        run: (selectedBoxId: number) => {
          this.panelState = {
            selected_box_id: selectedBoxId,
            quick_panel_open: 1,
          };
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

    if (sql.includes("select id, box_id as boxId, kind, title, content from items")) {
      return {
        all: () =>
          this.items
            .slice()
            .reverse()
            .map((item) => ({
              id: item.id,
              boxId: item.box_id,
              kind: item.kind,
              title: item.title,
              content: item.content,
            })),
      };
    }

    if (sql.includes("select selected_box_id as selectedBoxId")) {
      return {
        get: () =>
          this.panelState
            ? {
                selectedBoxId: this.panelState.selected_box_id,
                quickPanelOpen: this.panelState.quick_panel_open,
              }
            : undefined,
      };
    }

    throw new Error(`Unhandled SQL in test double: ${sql}`);
  }

  close() {
    this.closed = true;
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

import { createStore } from "./store";

describe("createStore", () => {
  it("bootstraps an inbox box and empty panel state", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.getWorkbenchSnapshot();

    expect(snapshot.boxes).toHaveLength(1);
    expect(snapshot.boxes[0].name).toBe("Inbox");
    expect(snapshot.panelState.selectedBoxId).toBe(snapshot.boxes[0].id);
    expect(snapshot.items).toEqual([]);
  });

  it("closes the backing database handle", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];

    store.close();

    expect(database?.closed).toBe(true);
  });
});
