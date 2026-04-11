import { afterEach, describe, expect, it, vi } from "vitest";

const fsMocks = vi.hoisted(() => ({
  existsSync: vi.fn((targetPath: string) => !targetPath.includes("missing")),
}));

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
  source_path: string;
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
  quick_panel_open: number;
  simple_mode: number;
  always_on_top: number;
};

class FakeDatabase {
  static omitPanelStateRow = false;
  private boxes: BoxRow[] = [];
  private items: ItemRow[] = [];
  private bundleEntries: BundleEntryRow[] = [];
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
        run: (selectedBoxId: number, quickPanelOpen = 1, simpleMode = 0, alwaysOnTop = 0) => {
          this.panelState = {
            selected_box_id: selectedBoxId,
            quick_panel_open: quickPanelOpen,
            simple_mode: simpleMode,
            always_on_top: alwaysOnTop,
          };
          return {};
        },
      };
    }

    if (sql.includes("update panel_state set simple_mode = ?, always_on_top = ? where id = 1")) {
      return {
        run: (simpleMode: number, alwaysOnTop: number) => {
          if (!this.panelState) {
            this.panelState = {
              selected_box_id: this.boxes[0]?.id ?? null,
              quick_panel_open: 1,
              simple_mode: simpleMode,
              always_on_top: alwaysOnTop,
            };
          } else {
            this.panelState.simple_mode = simpleMode;
            this.panelState.always_on_top = alwaysOnTop;
          }
          return { changes: 1 };
        },
      };
    }

    if (sql.includes("update panel_state set simple_mode = ? where id = 1")) {
      return {
        run: (simpleMode: number) => {
          if (!this.panelState) {
            this.panelState = {
              selected_box_id: this.boxes[0]?.id ?? null,
              quick_panel_open: 1,
              simple_mode: simpleMode,
              always_on_top: 0,
            };
          } else {
            this.panelState.simple_mode = simpleMode;
          }
          return { changes: 1 };
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
          const matches = this.items.filter((item) => item.box_id === boxId);
          return {
            sortOrder: matches.length
              ? Math.min(...matches.map((item) => item.sort_order))
              : null,
          };
        },
      };
    }

    if (sql.includes("select max(sort_order) as sortOrder from items where box_id = ?")) {
      return {
        get: (boxId: number) => {
          const matches = this.items.filter((item) => item.box_id === boxId);
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
            .filter((item) => item.box_id === boxId)
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
            kind,
            title,
            content,
            source_url: sourceUrl,
            source_path: sourcePath,
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

    if (sql.includes("select items.id, items.box_id as boxId")) {
      return {
        all: () =>
          this.items
            .slice()
            .sort((left, right) => left.box_id - right.box_id || left.sort_order - right.sort_order || right.id - left.id)
            .map((item) => ({
              id: item.id,
              boxId: item.box_id,
              kind: item.kind,
              title: item.title,
              content: item.content,
              sourceUrl: item.source_url,
              sourcePath: item.source_path,
              sortOrder: item.sort_order,
              bundleCount: this.bundleEntries.filter((entry) => entry.bundle_item_id === item.id)
                .length,
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
                quickPanelOpen: this.panelState.quick_panel_open,
                simpleMode: this.panelState.simple_mode,
                alwaysOnTop: this.panelState.always_on_top,
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

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    default: actual,
    existsSync: fsMocks.existsSync,
  };
});

import { createStore } from "./store";

describe("createStore", () => {
  afterEach(() => {
    FakeDatabase.omitPanelStateRow = false;
    fsMocks.existsSync.mockClear();
    fsMocks.existsSync.mockImplementation((targetPath: string) => !targetPath.includes("missing"));
  });

  it("bootstraps an inbox box and empty panel state", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.getWorkbenchSnapshot();

    expect(snapshot.boxes).toHaveLength(1);
    expect(snapshot.boxes[0].name).toBe("收件箱");
    expect(snapshot.panelState.selectedBoxId).toBe(snapshot.boxes[0].id);
    expect(snapshot.items).toEqual([]);
  });

  it("persists simple mode in panel state", () => {
    const store = createStore("brain-desktop.db");

    const updated = store.setSimpleMode(true);

    expect(updated.panelState.simpleMode).toBe(true);
    expect(store.getWorkbenchSnapshot().panelState.simpleMode).toBe(true);
  });

  it("persists always-on-top in panel state", () => {
    const store = createStore("brain-desktop.db");

    const updated = store.setAlwaysOnTop(true);

    expect(updated.panelState.alwaysOnTop).toBe(true);
    expect(store.getWorkbenchSnapshot().panelState.alwaysOnTop).toBe(true);
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

  it("creates an image item from pasted data", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureImageData("data:image/png;base64,ZmFrZQ==", "截图.png");

    expect(snapshot.items[0].kind).toBe("image");
    expect(snapshot.items[0].title).toBe("截图.png");
    expect(snapshot.items[0].content).toBe("data:image/png;base64,ZmFrZQ==");
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

  it("closes the backing database handle", () => {
    const store = createStore("brain-desktop.db");
    const database = databaseInstances[databaseInstances.length - 1];

    store.close();

    expect(database?.closed).toBe(true);
  });
});
