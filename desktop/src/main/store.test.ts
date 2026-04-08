import { afterEach, describe, expect, it, vi } from "vitest";

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
  source_url: string;
  created_at: string;
  updated_at: string;
};

type PanelStateRow = {
  selected_box_id: number | null;
  quick_panel_open: number;
};

class FakeDatabase {
  static omitPanelStateRow = false;
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

    if (sql.includes("insert into items")) {
      return {
        run: (
          boxId: number,
          kind: string,
          title: string,
          content: string,
          sourceUrl: string,
          createdAt: string,
          updatedAt: string
        ) => {
          const id = ++this.lastInsertRowid;
          this.items.push({
            id,
            box_id: boxId,
            kind,
            title,
            content,
            source_url: sourceUrl,
            created_at: createdAt,
            updated_at: updatedAt,
          });
          return { lastInsertRowid: id };
        },
      };
    }

    if (sql.includes("update items")) {
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

    if (sql.includes("select id, box_id as boxId, kind, title, content, source_url as sourceUrl")) {
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
              sourceUrl: item.source_url,
              createdAt: item.created_at,
              updatedAt: item.updated_at,
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
  afterEach(() => {
    FakeDatabase.omitPanelStateRow = false;
  });

  it("bootstraps an inbox box and empty panel state", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.getWorkbenchSnapshot();

    expect(snapshot.boxes).toHaveLength(1);
    expect(snapshot.boxes[0].name).toBe("Inbox");
    expect(snapshot.panelState.selectedBoxId).toBe(snapshot.boxes[0].id);
    expect(snapshot.items).toEqual([]);
  });

  it("creates a text item in the selected box", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureTextOrLink("Collect this reference note");

    expect(snapshot.items[0].kind).toBe("text");
    expect(snapshot.items[0].content).toBe("Collect this reference note");
    expect(snapshot.items[0].boxId).toBe(snapshot.panelState.selectedBoxId);
  });

  it("creates a link item with sourceUrl metadata", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureTextOrLink("https://example.com/inspiration");

    expect(snapshot.items[0].kind).toBe("link");
    expect(snapshot.items[0].title).toBe("https://example.com/inspiration");
    expect(snapshot.items[0].sourceUrl).toBe("https://example.com/inspiration");
  });

  it("updates a link title after enrichment", () => {
    const store = createStore("brain-desktop.db");
    const created = store.captureTextOrLink("https://example.com/inspiration");

    const snapshot = store.updateLinkTitle(created.items[0].id, "Example Inspiration");

    expect(snapshot?.items[0].title).toBe("Example Inspiration");
  });

  it("falls back to Inbox when no selected box exists", () => {
    FakeDatabase.omitPanelStateRow = true;
    const store = createStore("brain-desktop.db");

    const snapshot = store.getWorkbenchSnapshot();

    expect(snapshot.panelState.selectedBoxId).toBe(snapshot.boxes[0].id);
  });

  it("closes the backing database handle", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];

    store.close();

    expect(database?.closed).toBe(true);
  });
});
