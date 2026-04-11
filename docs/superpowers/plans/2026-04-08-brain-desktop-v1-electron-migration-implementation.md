# Brain Desktop V1 Electron Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `desktop/` Electron application that boots a single-window Brain workbench with local SQLite persistence, preload IPC, and the first renderer shell for boxes, canvas, and quick panel.

**Architecture:** Treat the Flask app as reference only and build a fresh Electron app under `desktop/` using the official Forge webpack TypeScript scaffold. Keep desktop responsibilities split into four small layers: Electron main process, preload IPC bridge, renderer React workbench, and a local SQLite store powered by `better-sqlite3`. Start with a thin bootstrap path that loads boxes/items/layout state into the renderer without any Flask dependency.

**Tech Stack:** Electron Forge, Electron, TypeScript, React, ReactDOM, better-sqlite3, Vitest, Testing Library, SQLite

---

## File Structure

### Existing Files To Modify

- `D:\02-Projects\brain\.gitignore`
  Add desktop-specific ignores for `desktop/node_modules`, packaged output, and local desktop database files.

### New Desktop Project Files

- `D:\02-Projects\brain\desktop\package.json`
  Electron Forge app manifest, scripts, and desktop-only dependencies.
- `D:\02-Projects\brain\desktop\forge.config.ts`
  Forge packaging config.
- `D:\02-Projects\brain\desktop\tsconfig.json`
  Shared TypeScript config for main, preload, renderer, and tests.
- `D:\02-Projects\brain\desktop\webpack.main.config.ts`
- `D:\02-Projects\brain\desktop\webpack.renderer.config.ts`
- `D:\02-Projects\brain\desktop\webpack.rules.ts`
- `D:\02-Projects\brain\desktop\webpack.plugins.ts`
  Official Forge webpack configuration.
- `D:\02-Projects\brain\desktop\vitest.config.ts`
  Vitest config with `jsdom` and path aliases.
- `D:\02-Projects\brain\desktop\src\index.ts`
  Electron main-process entry and window bootstrap.
- `D:\02-Projects\brain\desktop\src\preload.ts`
  Safe bridge exposing desktop bootstrap APIs to the renderer.
- `D:\02-Projects\brain\desktop\src\main\store.ts`
  SQLite schema creation and repository-style bootstrap queries.
- `D:\02-Projects\brain\desktop\src\main\ipc.ts`
  IPC handlers that map renderer requests to the store.
- `D:\02-Projects\brain\desktop\src\shared\types.ts`
  Shared `Box`, `Item`, `PanelState`, and `WorkbenchSnapshot` types.
- `D:\02-Projects\brain\desktop\src\shared\ipc.ts`
  Central IPC channel names and payload types.
- `D:\02-Projects\brain\desktop\src\renderer-globals.d.ts`
  `window.brainDesktop` typing for the renderer.
- `D:\02-Projects\brain\desktop\src\renderer.ts`
  React root bootstrap.
- `D:\02-Projects\brain\desktop\src\app.tsx`
  Renderer bootstrap component that loads initial snapshot.
- `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
  Three-column desktop workbench shell.
- `D:\02-Projects\brain\desktop\src\components\box-rail.tsx`
  Box rail and active-box list UI.
- `D:\02-Projects\brain\desktop\src\components\quick-capture.tsx`
  Always-available top capture strip for text, links, and drop affordance copy.
- `D:\02-Projects\brain\desktop\src\components\main-canvas.tsx`
  Current-box card canvas UI.
- `D:\02-Projects\brain\desktop\src\components\quick-panel.tsx`
  Collapsible recent-items and utility panel.
- `D:\02-Projects\brain\desktop\src\index.html`
  Renderer HTML host.
- `D:\02-Projects\brain\desktop\src\index.css`
  Desktop shell tokens and layout styling.
- `D:\02-Projects\brain\desktop\src\test\setup.ts`
  Testing Library and DOM setup.
- `D:\02-Projects\brain\desktop\src\app.test.tsx`
- `D:\02-Projects\brain\desktop\src\main\store.test.ts`
- `D:\02-Projects\brain\desktop\src\components\app-shell.test.tsx`
  First desktop regression tests.

### Files Explicitly Out Of Scope

- `D:\02-Projects\brain\brain_app\*`
  Flask runtime stays untouched in this migration slice.
- `D:\02-Projects\brain\tests\*`
  Existing Flask tests remain the reference suite, not the desktop suite.

## Task 1: Scaffold The Desktop Workspace And Test Harness

**Files:**
- Modify: `D:\02-Projects\brain\.gitignore`
- Create: `D:\02-Projects\brain\desktop\package.json`
- Create: `D:\02-Projects\brain\desktop\forge.config.ts`
- Create: `D:\02-Projects\brain\desktop\tsconfig.json`
- Create: `D:\02-Projects\brain\desktop\webpack.main.config.ts`
- Create: `D:\02-Projects\brain\desktop\webpack.renderer.config.ts`
- Create: `D:\02-Projects\brain\desktop\webpack.rules.ts`
- Create: `D:\02-Projects\brain\desktop\webpack.plugins.ts`
- Create: `D:\02-Projects\brain\desktop\vitest.config.ts`
- Create: `D:\02-Projects\brain\desktop\src\renderer.ts`
- Create: `D:\02-Projects\brain\desktop\src\app.tsx`
- Create: `D:\02-Projects\brain\desktop\src\index.html`
- Create: `D:\02-Projects\brain\desktop\src\index.css`
- Create: `D:\02-Projects\brain\desktop\src\test\setup.ts`
- Test: `D:\02-Projects\brain\desktop\src\app.test.tsx`

- [ ] **Step 1: Write the failing renderer smoke test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./app";

describe("App", () => {
  it("shows the desktop loading shell", () => {
    render(<App />);
    expect(screen.getByText("Loading Brain Desktop...")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: FAIL because the `desktop/` project and `App` component do not exist yet.

- [ ] **Step 3: Scaffold the official Electron Forge project and add React test support**

Run:

```bash
cd D:\02-Projects\brain
npx create-electron-app@latest desktop --template=webpack-typescript
cd desktop
npm install react react-dom better-sqlite3
npm install -D @testing-library/react @testing-library/jest-dom @types/react @types/react-dom jsdom vitest
```

Update `.gitignore`:

```gitignore
desktop/node_modules/
desktop/.vite/
desktop/out/
desktop/.webpack/
desktop/dist/
desktop/data/
```

Create the first renderer files:

```tsx
// desktop/src/app.tsx
export function App() {
  return <div className="app-loading">Loading Brain Desktop...</div>;
}
```

```tsx
// desktop/src/renderer.ts
import { createRoot } from "react-dom/client";
import { App } from "./app";
import "./index.css";

const container = document.getElementById("app");
if (!container) throw new Error("Missing #app container");
createRoot(container).render(<App />);
```

```ts
// desktop/vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
```

```ts
// desktop/src/test/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/.gitignore D:/02-Projects/brain/desktop
git commit -m "scaffold electron desktop workspace"
```

## Task 2: Add Shared Workbench Types And SQLite Bootstrap Store

**Files:**
- Create: `D:\02-Projects\brain\desktop\src\shared\types.ts`
- Create: `D:\02-Projects\brain\desktop\src\main\store.ts`
- Test: `D:\02-Projects\brain\desktop\src\main\store.test.ts`

- [ ] **Step 1: Write the failing store test**

```ts
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStore } from "./store";

describe("createStore", () => {
  let dir: string | undefined;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("bootstraps an inbox box and empty panel state", () => {
    dir = mkdtempSync(join(tmpdir(), "brain-desktop-store-"));
    const store = createStore(join(dir, "brain-desktop.db"));

    const snapshot = store.getWorkbenchSnapshot();

    expect(snapshot.boxes).toHaveLength(1);
    expect(snapshot.boxes[0].name).toBe("Inbox");
    expect(snapshot.panelState.selectedBoxId).toBe(snapshot.boxes[0].id);
    expect(snapshot.items).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/main/store.test.ts`

Expected: FAIL because `createStore` and shared workbench types do not exist.

- [ ] **Step 3: Write the minimal store and shared types**

```ts
// desktop/src/shared/types.ts
export type Box = {
  id: number;
  name: string;
  color: string;
  description: string;
  sortOrder: number;
};

export type ItemKind = "text" | "link" | "image" | "file" | "bundle";

export type Item = {
  id: number;
  boxId: number;
  kind: ItemKind;
  title: string;
  content: string;
};

export type PanelState = {
  selectedBoxId: number | null;
  quickPanelOpen: boolean;
};

export type WorkbenchSnapshot = {
  boxes: Box[];
  items: Item[];
  panelState: PanelState;
};
```

```ts
// desktop/src/main/store.ts
import Database from "better-sqlite3";
import type { WorkbenchSnapshot } from "../shared/types";

export function createStore(filename: string) {
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
    db.prepare("insert or replace into panel_state (id, selected_box_id, quick_panel_open) values (1, ?, 1)")
      .run(Number(info.lastInsertRowid));
  }

  return {
    getWorkbenchSnapshot(): WorkbenchSnapshot {
      const boxes = db
        .prepare("select id, name, color, description, sort_order as sortOrder from boxes order by sort_order asc")
        .all();
      const items = db
        .prepare("select id, box_id as boxId, kind, title, content from items order by id desc")
        .all();
      const panelState = db
        .prepare("select selected_box_id as selectedBoxId, quick_panel_open as quickPanelOpen from panel_state where id = 1")
        .get() as { selectedBoxId: number | null; quickPanelOpen: number };
      return {
        boxes,
        items,
        panelState: {
          selectedBoxId: panelState.selectedBoxId,
          quickPanelOpen: Boolean(panelState.quickPanelOpen),
        },
      };
    },
  };
}

export type DesktopStore = ReturnType<typeof createStore>;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/main/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/shared/types.ts D:/02-Projects/brain/desktop/src/main/store.ts D:/02-Projects/brain/desktop/src/main/store.test.ts
git commit -m "add desktop sqlite bootstrap store"
```

## Task 3: Expose Bootstrap Data Through Preload IPC

**Files:**
- Create: `D:\02-Projects\brain\desktop\src\shared\ipc.ts`
- Create: `D:\02-Projects\brain\desktop\src\preload.ts`
- Create: `D:\02-Projects\brain\desktop\src\main\ipc.ts`
- Modify: `D:\02-Projects\brain\desktop\src\index.ts`
- Create: `D:\02-Projects\brain\desktop\src\renderer-globals.d.ts`
- Test: `D:\02-Projects\brain\desktop\src\app.test.tsx`

- [ ] **Step 1: Expand the failing renderer test to require bootstrap data**

```tsx
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./app";

beforeEach(() => {
  window.brainDesktop = {
    bootstrap: vi.fn().mockResolvedValue({
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [],
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
    }),
  };
});

describe("App", () => {
  it("loads the first box name from preload bootstrap", async () => {
    render(<App />);
    expect(await screen.findByText("Inbox")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: FAIL because `window.brainDesktop.bootstrap()` is not defined in the renderer contract.

- [ ] **Step 3: Add shared IPC contract, preload bridge, and main handler**

```ts
// desktop/src/shared/ipc.ts
export const IPC_CHANNELS = {
  bootstrap: "workbench/bootstrap",
} as const;
```

```ts
// desktop/src/preload.ts
import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS } from "./shared/ipc";
import type { WorkbenchSnapshot } from "./shared/types";

contextBridge.exposeInMainWorld("brainDesktop", {
  bootstrap(): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.bootstrap);
  },
});
```

```ts
// desktop/src/main/ipc.ts
import { ipcMain } from "electron";
import { IPC_CHANNELS } from "../shared/ipc";
import type { DesktopStore } from "./store";

export function registerIpc(store: DesktopStore) {
  ipcMain.handle(IPC_CHANNELS.bootstrap, () => store.getWorkbenchSnapshot());
}
```

```ts
// desktop/src/renderer-globals.d.ts
import type { WorkbenchSnapshot } from "./shared/types";

declare global {
  interface Window {
    brainDesktop: {
      bootstrap(): Promise<WorkbenchSnapshot>;
    };
  }
}

export {};
```

```ts
// desktop/src/index.ts
import { app, BrowserWindow } from "electron";
import { join } from "node:path";
import { createStore } from "./main/store";
import { registerIpc } from "./main/ipc";

let mainWindow: BrowserWindow | null = null;

app.whenReady().then(() => {
  const store = createStore(join(app.getPath("userData"), "brain-desktop.db"));
  registerIpc(store);

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 760,
    titleBarStyle: "hiddenInset",
    backgroundColor: "#f4efe7",
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
});
```

Update `desktop/src/app.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { WorkbenchSnapshot } from "./shared/types";

export function App() {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null);

  useEffect(() => {
    window.brainDesktop.bootstrap().then(setSnapshot);
  }, []);

  if (!snapshot) return <div className="app-loading">Loading Brain Desktop...</div>;
  return <div>{snapshot.boxes[0]?.name}</div>;
}
```

Implementation note: keep `DesktopStore` exported from `desktop/src/main/store.ts` so `desktop/src/main/ipc.ts` can import the type directly from the real store module.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/shared/ipc.ts D:/02-Projects/brain/desktop/src/preload.ts D:/02-Projects/brain/desktop/src/main/ipc.ts D:/02-Projects/brain/desktop/src/index.ts D:/02-Projects/brain/desktop/src/renderer-globals.d.ts D:/02-Projects/brain/desktop/src/app.tsx D:/02-Projects/brain/desktop/src/app.test.tsx
git commit -m "add desktop preload bootstrap bridge"
```

## Task 4: Build The First Desktop Workbench Shell

**Files:**
- Create: `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
- Create: `D:\02-Projects\brain\desktop\src\components\box-rail.tsx`
- Create: `D:\02-Projects\brain\desktop\src\components\main-canvas.tsx`
- Create: `D:\02-Projects\brain\desktop\src\components\quick-panel.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\app.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\index.css`
- Test: `D:\02-Projects\brain\desktop\src\components\app-shell.test.tsx`

- [ ] **Step 1: Write the failing shell test**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("renders the box rail, canvas, and quick panel", () => {
    render(
      <AppShell
        snapshot={{
          boxes: [
            { id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 },
            { id: 2, name: "Brand", color: "#2563eb", description: "", sortOrder: 1 },
          ],
          items: [{ id: 11, boxId: 2, kind: "image", title: "Hero ref", content: "" }],
          panelState: { selectedBoxId: 2, quickPanelOpen: true },
        }}
      />
    );

    expect(screen.getByText("Boxes")).toBeInTheDocument();
    expect(screen.getByText("Brand")).toBeInTheDocument();
    expect(screen.getByText("Hero ref")).toBeInTheDocument();
    expect(screen.getByText("Quick Panel")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/app-shell.test.tsx`

Expected: FAIL because `AppShell` and its child components do not exist.

- [ ] **Step 3: Implement the first visual shell**

```tsx
// desktop/src/components/box-rail.tsx
import type { Box } from "../shared/types";

export function BoxRail({ boxes, selectedBoxId }: { boxes: Box[]; selectedBoxId: number | null }) {
  return (
    <aside className="box-rail">
      <p className="eyebrow">Boxes</p>
      {boxes.map((box) => (
        <button key={box.id} className={box.id === selectedBoxId ? "box-pill active" : "box-pill"}>
          <span className="box-swatch" style={{ backgroundColor: box.color }} />
          {box.name}
        </button>
      ))}
    </aside>
  );
}
```

```tsx
// desktop/src/components/main-canvas.tsx
import type { Box, Item } from "../shared/types";

export function MainCanvas({ box, items }: { box: Box | undefined; items: Item[] }) {
  return (
    <main className="main-canvas">
      <header>
        <p className="eyebrow">Current Box</p>
        <h1>{box?.name ?? "No box selected"}</h1>
      </header>
      <section className="card-grid">
        {items.map((item) => (
          <article key={item.id} className={`work-card kind-${item.kind}`}>
            <p className="card-kind">{item.kind}</p>
            <h2>{item.title}</h2>
          </article>
        ))}
      </section>
    </main>
  );
}
```

```tsx
// desktop/src/components/quick-panel.tsx
import type { Item } from "../shared/types";

export function QuickPanel({ items, open }: { items: Item[]; open: boolean }) {
  return (
    <aside className={open ? "quick-panel open" : "quick-panel"}>
      <p className="eyebrow">Quick Panel</p>
      {items.slice(0, 5).map((item) => (
        <div key={item.id} className="quick-item">{item.title}</div>
      ))}
    </aside>
  );
}
```

```tsx
// desktop/src/components/app-shell.tsx
import type { WorkbenchSnapshot } from "../shared/types";
import { BoxRail } from "./box-rail";
import { MainCanvas } from "./main-canvas";
import { QuickPanel } from "./quick-panel";

export function AppShell({ snapshot }: { snapshot: WorkbenchSnapshot }) {
  const currentBox = snapshot.boxes.find((box) => box.id === snapshot.panelState.selectedBoxId);
  const currentItems = snapshot.items.filter((item) => item.boxId === snapshot.panelState.selectedBoxId);

  return (
    <div className="app-shell">
      <BoxRail boxes={snapshot.boxes} selectedBoxId={snapshot.panelState.selectedBoxId} />
      <MainCanvas box={currentBox} items={currentItems} />
      <QuickPanel items={snapshot.items} open={snapshot.panelState.quickPanelOpen} />
    </div>
  );
}
```

Update `desktop/src/app.tsx`:

```tsx
import { useEffect, useState } from "react";
import { AppShell } from "./components/app-shell";
import type { WorkbenchSnapshot } from "./shared/types";

export function App() {
  const [snapshot, setSnapshot] = useState<WorkbenchSnapshot | null>(null);
  useEffect(() => {
    window.brainDesktop.bootstrap().then(setSnapshot);
  }, []);
  if (!snapshot) return <div className="app-loading">Loading Brain Desktop...</div>;
  return <AppShell snapshot={snapshot} />;
}
```

Update `desktop/src/index.css` with the first three-column workbench:

```css
:root {
  color-scheme: light;
  font-family: "Aptos", "Segoe UI", sans-serif;
  background: linear-gradient(180deg, #f7f1e8 0%, #efe6d8 100%);
  color: #231815;
}

body, html, #app {
  margin: 0;
  min-height: 100vh;
}

.app-shell {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr) 320px;
  gap: 18px;
  min-height: 100vh;
  padding: 18px;
}
```

- [ ] **Step 4: Run the component tests to verify they pass**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/app-shell.test.tsx src/app.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/components D:/02-Projects/brain/desktop/src/app.tsx D:/02-Projects/brain/desktop/src/index.css D:/02-Projects/brain/desktop/src/components/app-shell.test.tsx D:/02-Projects/brain/desktop/src/app.test.tsx
git commit -m "build first desktop workbench shell"
```

## Task 5: Add The Quick Capture Strip To The Shell

**Files:**
- Create: `D:\02-Projects\brain\desktop\src\components\quick-capture.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.test.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\index.css`

- [ ] **Step 1: Extend the failing shell test with quick capture expectations**

```tsx
expect(screen.getByPlaceholderText("Paste a link, note, or file hint")).toBeInTheDocument();
expect(screen.getByText("Drop screenshots, images, or files anywhere into the window")).toBeInTheDocument();
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/app-shell.test.tsx`

Expected: FAIL because the shell does not yet render a quick capture strip.

- [ ] **Step 3: Implement the quick capture component**

```tsx
// desktop/src/components/quick-capture.tsx
export function QuickCapture() {
  return (
    <section className="quick-capture">
      <div>
        <p className="eyebrow">Quick Capture</p>
        <h2>Pull fresh inspiration into the workbench</h2>
        <p>Drop screenshots, images, or files anywhere into the window</p>
      </div>
      <input
        className="capture-input"
        type="text"
        placeholder="Paste a link, note, or file hint"
        readOnly
      />
    </section>
  );
}
```

Update `desktop/src/components/app-shell.tsx`:

```tsx
import { QuickCapture } from "./quick-capture";

export function AppShell({ snapshot }: { snapshot: WorkbenchSnapshot }) {
  const currentBox = snapshot.boxes.find((box) => box.id === snapshot.panelState.selectedBoxId);
  const currentItems = snapshot.items.filter((item) => item.boxId === snapshot.panelState.selectedBoxId);

  return (
    <div className="app-shell">
      <BoxRail boxes={snapshot.boxes} selectedBoxId={snapshot.panelState.selectedBoxId} />
      <div className="workspace-column">
        <QuickCapture />
        <MainCanvas box={currentBox} items={currentItems} />
      </div>
      <QuickPanel items={snapshot.items} open={snapshot.panelState.quickPanelOpen} />
    </div>
  );
}
```

Update `desktop/src/index.css`:

```css
.workspace-column {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 18px;
}

.quick-capture {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: 16px;
  padding: 20px;
  border-radius: 24px;
  background: rgba(255, 248, 240, 0.88);
  box-shadow: 0 18px 40px rgba(60, 32, 12, 0.08);
}
```

- [ ] **Step 4: Run the shell tests to verify they pass**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/app-shell.test.tsx src/app.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/components/quick-capture.tsx D:/02-Projects/brain/desktop/src/components/app-shell.tsx D:/02-Projects/brain/desktop/src/components/app-shell.test.tsx D:/02-Projects/brain/desktop/src/index.css
git commit -m "add desktop quick capture shell"
```

## Task 6: Run Full Desktop Verification

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\main\store.ts` only if verification reveals bootstrap cleanup issues
- Modify: `D:\02-Projects\brain\desktop\src\index.css` only if the first-run window layout is visibly broken

- [ ] **Step 1: Run the desktop test suite**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run`

Expected: PASS with `src/app.test.tsx`, `src/main/store.test.ts`, and `src/components/app-shell.test.tsx` all green.

- [ ] **Step 2: Start the Electron app for a real smoke check**

Run: `cd D:\02-Projects\brain\desktop; npm start`

Expected:

- a single window opens
- the title bar uses the hidden inset style
- the left rail shows `Inbox`
- the center area shows `Quick Capture` and `Current Box`
- the right rail shows `Quick Panel`

- [ ] **Step 3: Commit any final fixes from verification**

```bash
git add D:/02-Projects/brain/desktop
git commit -m "finish desktop migration foundation"
```

## Self-Review

### Spec Coverage

- new Electron project under `desktop/`: covered by Task 1
- local SQLite persistence and unified bootstrap snapshot: covered by Task 2
- preload IPC bridge and safe renderer access: covered by Task 3
- single-window workbench shell with box rail, main canvas, and quick panel: covered by Task 4
- quick capture entry in the shell: covered by Task 5

This plan intentionally stops at the migration foundation named in the spec's recommendation section: scaffolding, persistence, and the first workbench shell. Drag and drop ingestion, bundle editing, and file import flows should be planned in a follow-up desktop interaction spec once this foundation is working.

### Placeholder Scan

- no `TODO`
- no `TBD`
- each task includes concrete files, commands, and code snippets
- follow-up work is explicitly scoped out rather than left vague

### Type Consistency

Consistent names used across the plan:

- `WorkbenchSnapshot`
- `createStore`
- `DesktopStore`
- `IPC_CHANNELS.bootstrap`
- `window.brainDesktop.bootstrap()`
- `AppShell`
- `QuickCapture`

`DesktopStore` is defined in `desktop/src/main/store.ts` and imported from that same module in `desktop/src/main/ipc.ts`; there is no stray `store-types` file left in the plan.
