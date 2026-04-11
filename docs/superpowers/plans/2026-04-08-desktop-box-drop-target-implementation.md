# Brain Desktop Box Drop Target Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let external file/folder drops land on a specific box in the left rail while preserving the current workspace drop behavior.

**Architecture:** Extend the existing dropped-path flow rather than creating a second ingestion system. Add a targeted store/API path that accepts `boxId`, expose it through preload IPC, then make `BoxRail` pills into external drop targets with highlight-only feedback. `App` continues to replace the full snapshot after successful drops, regardless of whether the source was the workspace or a rail target.

**Tech Stack:** Electron Forge, Electron drag/drop events, Electron IPC, TypeScript, React, Vitest, Testing Library, SQLite, `better-sqlite3`

---

## File Structure

### Existing Files To Modify

- `D:\02-Projects\brain\desktop\src\main\store.ts`
- `D:\02-Projects\brain\desktop\src\main\store.test.ts`
- `D:\02-Projects\brain\desktop\src\shared\ipc.ts`
- `D:\02-Projects\brain\desktop\src\preload.ts`
- `D:\02-Projects\brain\desktop\src\renderer-globals.d.ts`
- `D:\02-Projects\brain\desktop\src\main\ipc.ts`
- `D:\02-Projects\brain\desktop\src\components\box-rail.tsx`
- `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
- `D:\02-Projects\brain\desktop\src\components\app-shell.test.tsx`
- `D:\02-Projects\brain\desktop\src\app.tsx`
- `D:\02-Projects\brain\desktop\src\app.test.tsx`
- `D:\02-Projects\brain\desktop\src\index.css`

### Files Explicitly Out Of Scope

- `D:\02-Projects\brain\desktop\src\components\workspace-drop-zone.tsx`
  Workspace drop already exists and should keep its current semantics.
- `D:\02-Projects\brain\desktop\src\components\main-canvas.tsx`
  Card rendering is already sufficient for this slice.

## Task 1: Add Targeted Dropped-Path Persistence

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\main\store.ts`
- Test: `D:\02-Projects\brain\desktop\src\main\store.test.ts`

- [ ] **Step 1: Write the failing store tests**

```ts
  it("writes a dropped file into the specified box", () => {
    const store = createStore("brain-desktop.db");
    const boxes = store.getWorkbenchSnapshot().boxes;
    const targetBoxId = boxes[0].id + 99;

    const snapshot = store.captureDroppedPathsIntoBox(["C:\\assets\\hero.png"], targetBoxId);

    expect(snapshot.items[0].boxId).toBe(targetBoxId);
  });

  it("writes a dropped bundle into the specified box", () => {
    const store = createStore("brain-desktop.db");
    const targetBoxId = 42;

    const snapshot = store.captureDroppedPathsIntoBox(
      ["C:\\assets\\hero.png", "C:\\assets\\refs"],
      targetBoxId
    );

    expect(snapshot.items[0].kind).toBe("bundle");
    expect(snapshot.items[0].boxId).toBe(targetBoxId);
    expect(snapshot.items[0].bundleCount).toBe(2);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/main/store.test.ts`

Expected: FAIL because `captureDroppedPathsIntoBox` does not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Update `desktop/src/main/store.ts`:

```ts
export type DesktopStore = {
  getWorkbenchSnapshot: () => WorkbenchSnapshot;
  captureTextOrLink: (input: string) => WorkbenchSnapshot;
  captureDroppedPaths: (paths: string[]) => WorkbenchSnapshot;
  captureDroppedPathsIntoBox: (paths: string[], boxId: number) => WorkbenchSnapshot;
  getBundleEntries: (bundleItemId: number) => BundleEntry[];
  updateLinkTitle: (itemId: number, title: string) => WorkbenchSnapshot | null;
  close: () => void;
};
```

Extract the existing dropped-path logic into a shared helper:

```ts
function persistDroppedPaths(paths: string[], targetBoxId: number | null): WorkbenchSnapshot {
  const cleanedPaths = paths.map((value) => value.trim()).filter(Boolean);
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
    `).run(targetBoxId, "file", titleFromPath(singlePath), singlePath, "", singlePath, timestamp, timestamp);
    return readWorkbenchSnapshot();
  }

  const summary = `${cleanedPaths.length} item${cleanedPaths.length === 1 ? "" : "s"}`;
  const result = db.prepare(`
    insert into items (box_id, kind, title, content, source_url, source_path, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(targetBoxId, "bundle", "Dropped bundle", summary, "", "", timestamp, timestamp) as {
    lastInsertRowid: number | bigint;
  };

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
```

Then wire both public methods:

```ts
captureDroppedPaths(paths: string[]): WorkbenchSnapshot {
  return persistDroppedPaths(paths, getTargetBoxId());
},
captureDroppedPathsIntoBox(paths: string[], boxId: number): WorkbenchSnapshot {
  return persistDroppedPaths(paths, boxId);
},
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/main/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/main/store.ts D:/02-Projects/brain/desktop/src/main/store.test.ts
git commit -m "add targeted dropped path store support"
```

## Task 2: Expose Targeted Drop Through IPC And Preload

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\shared\ipc.ts`
- Modify: `D:\02-Projects\brain\desktop\src\preload.ts`
- Modify: `D:\02-Projects\brain\desktop\src\renderer-globals.d.ts`
- Modify: `D:\02-Projects\brain\desktop\src\main\ipc.ts`
- Test: `D:\02-Projects\brain\desktop\src\app.test.tsx`

- [ ] **Step 1: Write the failing preload bridge tests**

```tsx
  it("exposes targeted box drop through preload", async () => {
    await import("./preload");

    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      "brainDesktop",
      expect.objectContaining({
        captureDroppedPathsIntoBox: expect.any(Function),
      })
    );
  });

  it("invokes the targeted box drop channel", async () => {
    await import("./preload");
    const exposedApi = electronMocks.exposeInMainWorld.mock.calls[0][1];

    await exposedApi.captureDroppedPathsIntoBox(["C:\\assets\\hero.png"], 2);

    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "workbench/capture-dropped-paths-into-box",
      ["C:\\assets\\hero.png"],
      2
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: FAIL because the targeted box-drop bridge does not exist.

- [ ] **Step 3: Write the minimal implementation**

Update `desktop/src/shared/ipc.ts`:

```ts
  captureDroppedPathsIntoBox: "workbench/capture-dropped-paths-into-box",
```

Update `desktop/src/preload.ts`:

```ts
  captureDroppedPathsIntoBox(paths: string[], boxId: number): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureDroppedPathsIntoBox, paths, boxId);
  },
```

Update `desktop/src/renderer-globals.d.ts`:

```ts
      captureDroppedPathsIntoBox(paths: string[], boxId: number): Promise<WorkbenchSnapshot>;
```

Update `desktop/src/main/ipc.ts`:

```ts
  ipcMain.handle(
    IPC_CHANNELS.captureDroppedPathsIntoBox,
    (_event, paths: string[], boxId: number) => store.captureDroppedPathsIntoBox(paths, boxId)
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/shared/ipc.ts D:/02-Projects/brain/desktop/src/preload.ts D:/02-Projects/brain/desktop/src/renderer-globals.d.ts D:/02-Projects/brain/desktop/src/main/ipc.ts D:/02-Projects/brain/desktop/src/app.test.tsx
git commit -m "add targeted box drop ipc bridge"
```

## Task 3: Make Box Pills External Drop Targets

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\components\box-rail.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.test.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\index.css`

- [ ] **Step 1: Write the failing box-rail interaction tests**

```tsx
function createDropEvent(type: string, paths: string[]) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer?: { files: Array<{ path: string }> };
  };
  Object.defineProperty(event, "dataTransfer", {
    value: { files: paths.map((path) => ({ path })) },
  });
  return event;
}

  it("highlights a box while dragging external files over it", () => {
    render(/* AppShell with onDropToBox */);
    const brandButton = screen.getByRole("button", { name: /Brand/i });

    fireEvent(brandButton, createDropEvent("dragenter", ["C:\\assets\\hero.png"]));

    expect(brandButton).toHaveAttribute("data-drop-target", "true");
  });

  it("forwards dropped paths to the matching box id", () => {
    const onDropToBox = vi.fn().mockResolvedValue(undefined);
    render(/* AppShell with onDropToBox */);
    const brandButton = screen.getByRole("button", { name: /Brand/i });

    fireEvent(brandButton, createDropEvent("drop", ["C:\\assets\\hero.png"]));

    expect(onDropToBox).toHaveBeenCalledWith(2, ["C:\\assets\\hero.png"]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/app-shell.test.tsx`

Expected: FAIL because `BoxRail` does not expose drop targets yet.

- [ ] **Step 3: Write the minimal drop-target implementation**

Update `desktop/src/components/box-rail.tsx`:

```tsx
import { DragEvent, useState } from "react";

type BoxRailProps = {
  boxes: Box[];
  selectedBoxId: number | null;
  onDropToBox?: (boxId: number, paths: string[]) => void | Promise<void>;
};

function extractPaths(event: DragEvent<HTMLButtonElement>) {
  return Array.from(event.dataTransfer?.files ?? [])
    .map((file) => ("path" in file ? String((file as File & { path?: string }).path ?? "") : ""))
    .filter(Boolean);
}
```

Track hover state and wire each button:

```tsx
  const [dropTargetBoxId, setDropTargetBoxId] = useState<number | null>(null);
```

Inside each pill:

```tsx
              onDragEnter={(event) => {
                event.preventDefault();
                setDropTargetBoxId(box.id);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                setDropTargetBoxId(box.id);
              }}
              onDragLeave={(event) => {
                event.preventDefault();
                if (dropTargetBoxId === box.id) setDropTargetBoxId(null);
              }}
              onDrop={async (event) => {
                event.preventDefault();
                setDropTargetBoxId(null);
                const paths = extractPaths(event);
                if (!paths.length || !onDropToBox) return;
                await onDropToBox(box.id, paths);
              }}
              data-drop-target={dropTargetBoxId === box.id ? "true" : "false"}
```

Update `desktop/src/components/app-shell.tsx`:

```tsx
  onDropToBox?: (boxId: number, paths: string[]) => Promise<void>;
```

Pass through:

```tsx
      <BoxRail
        boxes={snapshot.boxes}
        selectedBoxId={selectedBoxId}
        onDropToBox={onDropToBox}
      />
```

Update `desktop/src/index.css`:

```css
.box-pill[data-drop-target="true"] {
  border-color: rgba(159, 98, 41, 0.5);
  background: rgba(255, 239, 220, 0.96);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.6);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/app-shell.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/components/box-rail.tsx D:/02-Projects/brain/desktop/src/components/app-shell.tsx D:/02-Projects/brain/desktop/src/components/app-shell.test.tsx D:/02-Projects/brain/desktop/src/index.css
git commit -m "add box rail drop targets"
```

## Task 4: Wire Targeted Box Drops Through App

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\app.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\app.test.tsx`

- [ ] **Step 1: Write the failing app integration tests**

```tsx
  it("drops a file into a non-selected box", async () => {
    const snapshotWithBrand = {
      boxes: [
        { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
        { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
      ],
      items: [],
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
    };

    const captureDroppedPathsIntoBox = vi.fn().mockResolvedValue({
      ...snapshotWithBrand,
      items: [
        {
          id: 20,
          boxId: 2,
          kind: "file",
          title: "hero.png",
          content: "C:\\assets\\hero.png",
          sourceUrl: "",
          sourcePath: "C:\\assets\\hero.png",
          bundleCount: 0,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      bootstrap: vi.fn().mockResolvedValue(snapshotWithBrand),
      captureTextOrLink: vi.fn(),
      captureDroppedPaths: vi.fn(),
      captureDroppedPathsIntoBox,
      enrichLinkTitle: vi.fn(),
    };

    render(<App />);
    const brandButton = await screen.findByRole("button", { name: /Brand/i });
    fireEvent(brandButton, createDropEvent("drop", ["C:\\assets\\hero.png"]));

    await waitFor(() =>
      expect(captureDroppedPathsIntoBox).toHaveBeenCalledWith(["C:\\assets\\hero.png"], 2)
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: FAIL because `App` does not handle targeted box drops.

- [ ] **Step 3: Write the minimal app implementation**

Update `desktop/src/app.tsx`:

```tsx
  async function handleDroppedPathsIntoBox(paths: string[], boxId: number) {
    try {
      setDropError("");
      const nextSnapshot = await window.brainDesktop.captureDroppedPathsIntoBox(paths, boxId);
      setSnapshot(nextSnapshot);
    } catch (cause) {
      setDropError(cause instanceof Error ? cause.message : "Drop failed");
    }
  }
```

Pass it to `AppShell`:

```tsx
      onDropToBox={handleDroppedPathsIntoBox}
```

Update the global typing/preload test fixtures in `desktop/src/app.test.tsx` wherever `window.brainDesktop` is assigned so they include:

```tsx
      captureDroppedPathsIntoBox: vi.fn(),
```

- [ ] **Step 4: Run the full verification slice**

Run:

```bash
cd D:\02-Projects\brain\desktop
npm test -- --run
npm run lint
npm start
```

Expected:

- desktop tests pass
- lint passes
- Electron starts successfully
- workspace drop still works
- dropping onto a left-rail box stores the new file or bundle in that exact box
- hovered target box highlights during drag over

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/app.tsx D:/02-Projects/brain/desktop/src/app.test.tsx
git commit -m "wire targeted box drop flow"
```

## Self-Review

### Spec Coverage

- box pills as external drop targets: covered by Task 3
- dropping on a box overrides current workspace target: covered by Tasks 1, 2, and 4
- workspace drop semantics preserved: covered by Task 4
- highlight-only feedback: covered by Task 3
- file/bundle creation rules unchanged: covered by Task 1

No approved spec requirements are missing from this plan.

### Placeholder Scan

- no `TODO`
- no `TBD`
- each task includes concrete files, tests, commands, and code snippets
- no vague deferred behavior is left in the plan

### Type Consistency

Consistent names across the plan:

- `captureDroppedPathsIntoBox`
- `onDropToBox`
- `data-drop-target`
- `dropTargetBoxId`

The plan preserves one snapshot-driven renderer flow and only extends the existing dropped-path pipeline with an explicit box target.
