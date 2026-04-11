# Brain Desktop File Drop Bundle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add desktop-native file and folder dropping to the workspace so single paths become `file` items, grouped drops become `bundle` items, and the current canvas refreshes immediately using path-reference storage.

**Architecture:** Extend the current desktop ingestion flow in place. Keep the renderer responsible only for detecting external drop events on the workspace column and forwarding absolute paths through preload IPC. Keep all classification and persistence in the main-process store, including additive schema migration for `sourcePath` and a dedicated `bundle_entries` table. Update the existing snapshot-driven renderer so dropped items appear without changing navigation.

**Tech Stack:** Electron Forge, Electron drag/drop events, Electron IPC, TypeScript, React, Vitest, Testing Library, SQLite, `better-sqlite3`

---

## File Structure

### Existing Files To Modify

- `D:\02-Projects\brain\desktop\src\shared\types.ts`
  Extend item typing for dropped file paths and bundle counts.
- `D:\02-Projects\brain\desktop\src\shared\ipc.ts`
  Add the dropped-path capture channel.
- `D:\02-Projects\brain\desktop\src\preload.ts`
  Expose the dropped-path bridge to the renderer.
- `D:\02-Projects\brain\desktop\src\renderer-globals.d.ts`
  Extend `window.brainDesktop` typing for dropped paths.
- `D:\02-Projects\brain\desktop\src\main\store.ts`
  Add path-reference schema migration, bundle-entry persistence, and drop capture helpers.
- `D:\02-Projects\brain\desktop\src\main\ipc.ts`
  Register the dropped-path capture handler.
- `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
  Make the workspace column the external drop surface.
- `D:\02-Projects\brain\desktop\src\components\main-canvas.tsx`
  Render the minimal bundle card summary.
- `D:\02-Projects\brain\desktop\src\app.tsx`
  Replace snapshots after successful drop capture and expose workspace errors.
- `D:\02-Projects\brain\desktop\src\index.css`
  Add drag-active and drop-error styling for the workspace surface.
- `D:\02-Projects\brain\desktop\src\main\store.test.ts`
  Add store tests for file and bundle path persistence.
- `D:\02-Projects\brain\desktop\src\app.test.tsx`
  Add integration tests for dropped file and bundle updates.
- `D:\02-Projects\brain\desktop\src\components\app-shell.test.tsx`
  Add workspace drop behavior tests.

### New Files To Create

- `D:\02-Projects\brain\desktop\src\components\workspace-drop-zone.tsx`
  Focused drop-surface component that wraps the main workspace column.
- `D:\02-Projects\brain\desktop\src\components\workspace-drop-zone.test.tsx`
  Renderer tests for drag-over state, dropped-path extraction, and inline errors.

### Files Explicitly Out Of Scope

- `D:\02-Projects\brain\desktop\src\components\box-rail.tsx`
  No rail drop hit-testing in this slice.
- `D:\02-Projects\brain\desktop\src\components\quick-capture.tsx`
  Text/link capture should remain unchanged.
- `D:\02-Projects\brain\desktop\src\index.ts`
  No window lifecycle changes are needed for this feature.

## Task 1: Extend Types And Store For File And Bundle Path Persistence

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\shared\types.ts`
- Modify: `D:\02-Projects\brain\desktop\src\main\store.ts`
- Test: `D:\02-Projects\brain\desktop\src\main\store.test.ts`

- [ ] **Step 1: Write the failing store tests**

```ts
  it("creates a file item from one dropped path", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureDroppedPaths(["C:\\assets\\hero.png"]);

    expect(snapshot.items[0].kind).toBe("file");
    expect(snapshot.items[0].title).toBe("hero.png");
    expect(snapshot.items[0].sourcePath).toBe("C:\\assets\\hero.png");
  });

  it("creates one bundle from multiple dropped paths", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureDroppedPaths([
      "C:\\assets\\hero.png",
      "C:\\assets\\detail.png",
    ]);

    expect(snapshot.items[0].kind).toBe("bundle");
    expect(snapshot.items[0].bundleCount).toBe(2);
  });

  it("creates one bundle from a dropped folder path", () => {
    const store = createStore("brain-desktop.db");

    const snapshot = store.captureDroppedPaths(["C:\\assets\\moodboard"]);

    expect(snapshot.items[0].kind).toBe("bundle");
    expect(snapshot.items[0].bundleCount).toBe(1);
    expect(store.getBundleEntries(snapshot.items[0].id)).toEqual([
      { entryPath: "C:\\assets\\moodboard", entryKind: "folder", sortOrder: 0 },
    ]);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/main/store.test.ts`

Expected: FAIL because `captureDroppedPaths`, `getBundleEntries`, `sourcePath`, and `bundleCount` do not exist yet.

- [ ] **Step 3: Write the minimal type and store implementation**

Update `desktop/src/shared/types.ts`:

```ts
export type Item = {
  id: number;
  boxId: number;
  kind: ItemKind;
  title: string;
  content: string;
  sourceUrl: string;
  sourcePath: string;
  bundleCount: number;
  createdAt: string;
  updatedAt: string;
};
```

Update `desktop/src/main/store.ts`:

```ts
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
```

Add additive schema migration:

```ts
for (const statement of [
  "alter table items add column source_path text not null default ''",
]) {
  try {
    db.exec(statement);
  } catch {
    // Column already exists.
  }
}

db.exec(`
  create table if not exists bundle_entries (
    id integer primary key autoincrement,
    bundle_item_id integer not null,
    entry_path text not null,
    entry_kind text not null,
    sort_order integer not null
  )
`);
```

Add helpers:

```ts
import { basename, extname } from "node:path";

function titleFromPath(filePath: string) {
  return basename(filePath) || filePath;
}

function isLikelyFolderPath(filePath: string) {
  return extname(filePath) === "";
}
```

Add the write methods:

```ts
captureDroppedPaths(paths: string[]): WorkbenchSnapshot {
  const cleanedPaths = paths.map((value) => value.trim()).filter(Boolean);
  const targetBoxId = getTargetBoxId();
  if (!cleanedPaths.length || !targetBoxId) return readWorkbenchSnapshot();

  const timestamp = nowIso();
  const shouldBundle = cleanedPaths.length > 1 || cleanedPaths.some(isLikelyFolderPath);

  if (!shouldBundle) {
    const singlePath = cleanedPaths[0];
    db.prepare(`
      insert into items (box_id, kind, title, content, source_url, source_path, created_at, updated_at)
      values (?, 'file', ?, ?, '', ?, ?, ?)
    `).run(targetBoxId, titleFromPath(singlePath), singlePath, singlePath, timestamp, timestamp);
    return readWorkbenchSnapshot();
  }

  const summary = `${cleanedPaths.length} item${cleanedPaths.length === 1 ? "" : "s"}`;
  const result = db.prepare(`
    insert into items (box_id, kind, title, content, source_url, source_path, created_at, updated_at)
    values (?, 'bundle', 'Dropped bundle', ?, '', '', ?, ?)
  `).run(targetBoxId, summary, timestamp, timestamp) as { lastInsertRowid: number | bigint };

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
  return db.prepare(`
    select entry_path as entryPath, entry_kind as entryKind, sort_order as sortOrder
    from bundle_entries
    where bundle_item_id = ?
    order by sort_order asc
  `).all(bundleItemId) as BundleEntry[];
},
```

Update `readWorkbenchSnapshot()` item query:

```ts
select
  items.id,
  items.box_id as boxId,
  items.kind,
  items.title,
  items.content,
  items.source_url as sourceUrl,
  items.source_path as sourcePath,
  coalesce(bundle_counts.bundleCount, 0) as bundleCount,
  items.created_at as createdAt,
  items.updated_at as updatedAt
from items
left join (
  select bundle_item_id, count(*) as bundleCount
  from bundle_entries
  group by bundle_item_id
) bundle_counts on bundle_counts.bundle_item_id = items.id
order by items.id desc
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/main/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/shared/types.ts D:/02-Projects/brain/desktop/src/main/store.ts D:/02-Projects/brain/desktop/src/main/store.test.ts
git commit -m "add desktop dropped path store support"
```

## Task 2: Add Preload And Main-Process IPC For Dropped Paths

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\shared\ipc.ts`
- Modify: `D:\02-Projects\brain\desktop\src\preload.ts`
- Modify: `D:\02-Projects\brain\desktop\src\renderer-globals.d.ts`
- Modify: `D:\02-Projects\brain\desktop\src\main\ipc.ts`
- Test: `D:\02-Projects\brain\desktop\src\app.test.tsx`

- [ ] **Step 1: Write the failing preload contract test**

```tsx
  it("exposes dropped-path capture through preload", async () => {
    await import("./preload");

    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      "brainDesktop",
      expect.objectContaining({
        captureDroppedPaths: expect.any(Function),
      })
    );
  });

  it("invokes the dropped-path channel", async () => {
    await import("./preload");
    const exposedApi = electronMocks.exposeInMainWorld.mock.calls[0][1];

    await exposedApi.captureDroppedPaths(["C:\\assets\\hero.png"]);

    expect(electronMocks.invoke).toHaveBeenCalledWith(
      "workbench/capture-dropped-paths",
      ["C:\\assets\\hero.png"]
    );
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: FAIL because the dropped-path bridge does not exist yet.

- [ ] **Step 3: Write the minimal IPC implementation**

Update `desktop/src/shared/ipc.ts`:

```ts
export const IPC_CHANNELS = {
  bootstrap: "workbench/bootstrap",
  captureTextOrLink: "workbench/capture-text-or-link",
  captureDroppedPaths: "workbench/capture-dropped-paths",
  enrichLinkTitle: "workbench/enrich-link-title",
} as const;
```

Update `desktop/src/preload.ts`:

```ts
  captureDroppedPaths(paths: string[]): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureDroppedPaths, paths);
  },
```

Update `desktop/src/renderer-globals.d.ts`:

```ts
      captureDroppedPaths(paths: string[]): Promise<WorkbenchSnapshot>;
```

Update `desktop/src/main/ipc.ts`:

```ts
  ipcMain.handle(IPC_CHANNELS.captureDroppedPaths, (_event, paths: string[]) =>
    store.captureDroppedPaths(paths)
  );
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/shared/ipc.ts D:/02-Projects/brain/desktop/src/preload.ts D:/02-Projects/brain/desktop/src/renderer-globals.d.ts D:/02-Projects/brain/desktop/src/main/ipc.ts D:/02-Projects/brain/desktop/src/app.test.tsx
git commit -m "add desktop dropped path ipc bridge"
```

## Task 3: Build A Workspace Drop Surface

**Files:**
- Create: `D:\02-Projects\brain\desktop\src\components\workspace-drop-zone.tsx`
- Create: `D:\02-Projects\brain\desktop\src\components\workspace-drop-zone.test.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\index.css`

- [ ] **Step 1: Write the failing drop-zone tests**

```tsx
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceDropZone } from "./workspace-drop-zone";

function createDropEvent(type: string, paths: string[]) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: {
      files: paths.map((path) => ({ path })),
    },
  });
  return event;
}

describe("WorkspaceDropZone", () => {
  it("shows the active state while dragging files over the workspace", () => {
    render(
      <WorkspaceDropZone onDropPaths={vi.fn()}><div>Canvas</div></WorkspaceDropZone>
    );

    fireEvent(screen.getByLabelText("Workspace Drop Zone"), createDropEvent("dragenter", ["C:\\a.png"]));

    expect(screen.getByLabelText("Workspace Drop Zone")).toHaveAttribute("data-drop-active", "true");
  });

  it("forwards dropped absolute paths", () => {
    const onDropPaths = vi.fn();
    render(
      <WorkspaceDropZone onDropPaths={onDropPaths}><div>Canvas</div></WorkspaceDropZone>
    );

    fireEvent(screen.getByLabelText("Workspace Drop Zone"), createDropEvent("drop", ["C:\\a.png", "C:\\b.png"]));

    expect(onDropPaths).toHaveBeenCalledWith(["C:\\a.png", "C:\\b.png"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/workspace-drop-zone.test.tsx`

Expected: FAIL because `WorkspaceDropZone` does not exist.

- [ ] **Step 3: Write the minimal drop surface**

Create `desktop/src/components/workspace-drop-zone.tsx`:

```tsx
import { DragEvent, ReactNode, useState } from "react";

type WorkspaceDropZoneProps = {
  children: ReactNode;
  error?: string;
  onDropPaths: (paths: string[]) => void | Promise<void>;
};

function extractPaths(event: DragEvent<HTMLDivElement>) {
  const files = Array.from(event.dataTransfer?.files ?? []);
  return files
    .map((file) => ("path" in file ? String((file as File & { path?: string }).path ?? "") : ""))
    .filter(Boolean);
}

export function WorkspaceDropZone({ children, error = "", onDropPaths }: WorkspaceDropZoneProps) {
  const [active, setActive] = useState(false);

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(false);
  }

  async function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setActive(false);
    const paths = extractPaths(event);
    if (!paths.length) return;
    await onDropPaths(paths);
  }

  return (
    <div
      className={active ? "workspace-drop-zone active" : "workspace-drop-zone"}
      aria-label="Workspace Drop Zone"
      data-drop-active={active ? "true" : "false"}
      onDragEnter={handleDragOver}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {error ? <p className="workspace-drop-error">{error}</p> : null}
      {children}
    </div>
  );
}
```

Update `desktop/src/components/app-shell.tsx`:

```tsx
import { WorkspaceDropZone } from "./workspace-drop-zone";
```

Implementation note: in this task, keep `AppShell` backward-compatible by adding optional props:

```tsx
  onDropPaths?: (paths: string[]) => Promise<void>;
  dropError?: string;
```

Wrap the workspace column:

```tsx
      <WorkspaceDropZone onDropPaths={onDropPaths ?? (async () => undefined)} error={dropError}>
        <div className="workspace-column">
          <QuickCapture activeBoxName={currentBox?.name ?? "Inbox"} onSubmit={onQuickCapture} />
          <MainCanvas box={currentBox} items={currentItems} />
        </div>
      </WorkspaceDropZone>
```

Update `desktop/src/index.css`:

```css
.workspace-drop-zone {
  border-radius: 32px;
  transition:
    transform 120ms ease,
    box-shadow 120ms ease,
    background 120ms ease;
}

.workspace-drop-zone.active {
  background: rgba(255, 244, 230, 0.78);
  box-shadow: 0 0 0 2px rgba(176, 132, 88, 0.32);
}

.workspace-drop-error {
  margin: 0 0 12px;
  color: #b43f24;
  font-size: 0.88rem;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/workspace-drop-zone.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/components/workspace-drop-zone.tsx D:/02-Projects/brain/desktop/src/components/workspace-drop-zone.test.tsx D:/02-Projects/brain/desktop/src/components/app-shell.tsx D:/02-Projects/brain/desktop/src/index.css
git commit -m "add desktop workspace drop surface"
```

## Task 4: Wire Dropped Paths Through App And Canvas

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\app.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\main-canvas.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.test.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\app.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

```tsx
  it("renders a dropped file in the current canvas", async () => {
    const captureDroppedPaths = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 10,
          boxId: 1,
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
      bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
      captureTextOrLink: vi.fn(),
      captureDroppedPaths,
      enrichLinkTitle: vi.fn(),
    };

    render(<App />);
    fireEvent(
      await screen.findByLabelText("Workspace Drop Zone"),
      createDropEvent("drop", ["C:\\assets\\hero.png"])
    );

    expect(await screen.findByText("hero.png")).toBeInTheDocument();
  });

  it("renders a dropped bundle summary", async () => {
    const captureDroppedPaths = vi.fn().mockResolvedValue({
      ...initialSnapshot,
      items: [
        {
          id: 11,
          boxId: 1,
          kind: "bundle",
          title: "Dropped bundle",
          content: "2 items",
          sourceUrl: "",
          sourcePath: "",
          bundleCount: 2,
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
    });

    window.brainDesktop = {
      bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
      captureTextOrLink: vi.fn(),
      captureDroppedPaths,
      enrichLinkTitle: vi.fn(),
    };

    render(<App />);
    fireEvent(
      await screen.findByLabelText("Workspace Drop Zone"),
      createDropEvent("drop", ["C:\\assets\\hero.png", "C:\\assets\\refs"])
    );

    expect(await screen.findByText("Dropped bundle")).toBeInTheDocument();
    expect(await screen.findByText("2 items")).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx src/components/app-shell.test.tsx`

Expected: FAIL because dropped-path handling is not wired through `App` and `MainCanvas` does not render bundle summaries.

- [ ] **Step 3: Write the minimal integration implementation**

Update `desktop/src/app.tsx`:

```tsx
  const [dropError, setDropError] = useState("");
```

Add the handler:

```tsx
  async function handleDroppedPaths(paths: string[]) {
    try {
      setDropError("");
      const nextSnapshot = await window.brainDesktop.captureDroppedPaths(paths);
      setSnapshot(nextSnapshot);
    } catch (error) {
      setDropError(error instanceof Error ? error.message : "Drop failed");
    }
  }
```

Pass props to `AppShell`:

```tsx
  return (
    <AppShell
      snapshot={snapshot}
      onQuickCapture={handleQuickCapture}
      onDropPaths={handleDroppedPaths}
      dropError={dropError}
    />
  );
```

Update `desktop/src/components/main-canvas.tsx`:

```tsx
              <h2>{item.title}</h2>
              {item.kind === "bundle" ? (
                <p>{item.bundleCount} item{item.bundleCount === 1 ? "" : "s"}</p>
              ) : (
                <p>{item.content || "No body text"}</p>
              )}
```

Update `desktop/src/components/app-shell.test.tsx` with a dropped-path callback assertion:

```tsx
    fireEvent(screen.getByLabelText("Workspace Drop Zone"), createDropEvent("drop", ["C:\\assets\\hero.png"]));
    expect(onDropPaths).toHaveBeenCalledWith(["C:\\assets\\hero.png"]);
```

Implementation note: define the same `createDropEvent` helper in test files that need it; do not rely on browser `File.path` existing naturally in jsdom.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx src/components/app-shell.test.tsx src/components/workspace-drop-zone.test.tsx`

Expected: PASS

- [ ] **Step 5: Run the full desktop verification slice**

Run:

```bash
cd D:\02-Projects\brain\desktop
npm test -- --run
npm run lint
npm start
```

Expected:

- all desktop tests pass
- lint passes
- Electron starts successfully
- dropping one file into the workspace creates a `file` card
- dropping multiple paths or a folder creates a `bundle` card with item count only
- no file copying occurs

- [ ] **Step 6: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/app.tsx D:/02-Projects/brain/desktop/src/components/main-canvas.tsx D:/02-Projects/brain/desktop/src/components/app-shell.test.tsx D:/02-Projects/brain/desktop/src/app.test.tsx
git commit -m "wire desktop dropped path flow"
```

## Self-Review

### Spec Coverage

- external file/folder drop support: covered by Tasks 1, 3, and 4
- single file => `file`: covered by Tasks 1 and 4
- multiple paths or any folder => `bundle`: covered by Tasks 1 and 4
- path-reference storage only: covered by Task 1
- workspace-only drop target: covered by Task 3
- renderer refresh after drop: covered by Task 4
- bundle card shows only title + count: covered by Task 4

No approved spec requirements are missing from this plan.

### Placeholder Scan

- no `TODO`
- no `TBD`
- each task includes exact files, tests, commands, and code snippets
- out-of-scope rail drop targeting and previews are explicitly excluded instead of deferred vaguely

### Type Consistency

Consistent names across the plan:

- `captureDroppedPaths`
- `sourcePath`
- `bundleCount`
- `BundleEntry`
- `WorkspaceDropZone`
- `onDropPaths`
- `dropError`

The renderer remains snapshot-driven, with all dropped-path persistence owned by `DesktopStore`.
