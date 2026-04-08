import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore } from "./store";

describe("createStore", () => {
  let dir: string | undefined;
  let store: { close: () => void } | undefined;

  afterEach(() => {
    store?.close();
    store = undefined;
    if (dir) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("bootstraps an inbox box and empty panel state", () => {
    dir = mkdtempSync(join(tmpdir(), "brain-desktop-store-"));
    store = createStore(join(dir, "brain-desktop.db"));

    const snapshot = store.getWorkbenchSnapshot();

    expect(snapshot.boxes).toHaveLength(1);
    expect(snapshot.boxes[0].name).toBe("Inbox");
    expect(snapshot.panelState.selectedBoxId).toBe(snapshot.boxes[0].id);
    expect(snapshot.items).toEqual([]);
  });
});
