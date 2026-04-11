# Brain Desktop Quick Capture Text/Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the desktop `Quick Capture` strip into a real text/link capture flow that stores new items in the selected box, immediately refreshes the workbench, and enriches link titles asynchronously.

**Architecture:** Extend the current desktop shell in place. Keep the renderer thin by routing all writes through preload IPC into the main-process SQLite store, then return full `WorkbenchSnapshot` payloads back to `App`. Use one synchronous create path for text/link items and one follow-up asynchronous enrichment path for link titles so capture stays instant even when metadata fetch is slow.

**Tech Stack:** Electron Forge, Electron IPC, TypeScript, React, Vitest, Testing Library, SQLite, `better-sqlite3`

---

## File Structure

### Existing Files To Modify

- `D:\02-Projects\brain\desktop\src\shared\types.ts`
  Extend desktop item typing for persisted link metadata and timestamps.
- `D:\02-Projects\brain\desktop\src\shared\ipc.ts`
  Add channel names for capture and async title enrichment.
- `D:\02-Projects\brain\desktop\src\preload.ts`
  Expose safe capture APIs to the renderer.
- `D:\02-Projects\brain\desktop\src\renderer-globals.d.ts`
  Extend `window.brainDesktop` typing.
- `D:\02-Projects\brain\desktop\src\main\store.ts`
  Add additive schema migration, item creation, and link title update methods.
- `D:\02-Projects\brain\desktop\src\main\ipc.ts`
  Register main-process handlers for capture and enrichment.
- `D:\02-Projects\brain\desktop\src\app.tsx`
  Own snapshot updates after quick capture and link-title enrichment.
- `D:\02-Projects\brain\desktop\src\components\quick-capture.tsx`
  Convert the static strip into an interactive input with submit/error states.
- `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
  Pass active box context and submit callbacks into `QuickCapture`.
- `D:\02-Projects\brain\desktop\src\index.css`
  Style active input, button, and inline error states.
- `D:\02-Projects\brain\desktop\src\app.test.tsx`
  Extend app-level integration tests for snapshot refresh.
- `D:\02-Projects\brain\desktop\src\main\store.test.ts`
  Extend store tests for create/update behavior with the test double.
- `D:\02-Projects\brain\desktop\src\components\app-shell.test.tsx`
  Keep shell rendering expectations aligned with the now-interactive quick capture strip.

### New Files To Create

- `D:\02-Projects\brain\desktop\src\components\quick-capture.test.tsx`
  Component tests for input submission, validation, and error feedback.

### Files Explicitly Out Of Scope

- `D:\02-Projects\brain\desktop\src\components\box-rail.tsx`
  No drag-target behavior yet.
- `D:\02-Projects\brain\desktop\src\components\main-canvas.tsx`
  It should only reflect updated snapshots, not gain edit controls in this slice.
- `D:\02-Projects\brain\desktop\src\index.ts`
  Main window boot flow should not change for this feature.

## Task 1: Extend Shared Types And Desktop Store For Text/Link Writes

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\shared\types.ts`
- Modify: `D:\02-Projects\brain\desktop\src\main\store.ts`
- Test: `D:\02-Projects\brain\desktop\src\main\store.test.ts`

- [ ] **Step 1: Write the failing store tests**

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/main/store.test.ts`

Expected: FAIL because `captureTextOrLink`, `updateLinkTitle`, `sourceUrl`, and timestamp fields do not exist yet.

- [ ] **Step 3: Write the minimal implementation**

Update `desktop/src/shared/types.ts`:

```ts
export type Item = {
  id: number;
  boxId: number;
  kind: ItemKind;
  title: string;
  content: string;
  sourceUrl: string;
  createdAt: string;
  updatedAt: string;
};
```

Update `desktop/src/main/store.ts`:

```ts
export type DesktopStore = {
  getWorkbenchSnapshot: () => WorkbenchSnapshot;
  captureTextOrLink: (input: string) => WorkbenchSnapshot;
  updateLinkTitle: (itemId: number, title: string) => WorkbenchSnapshot | null;
  close: () => void;
};

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
```

Add additive schema migration and item queries:

```ts
for (const statement of [
  "alter table items add column source_url text not null default ''",
  "alter table items add column created_at text not null default ''",
  "alter table items add column updated_at text not null default ''",
]) {
  try {
    db.exec(statement);
  } catch {
    // Column already exists on previously bootstrapped databases.
  }
}
```

Implementation note: keep each `alter table` isolated inside its own `try/catch`; SQLite aborts multi-statement migrations on the first duplicate-column error.

Add the write methods:

```ts
captureTextOrLink(input: string): WorkbenchSnapshot {
  const trimmed = input.trim();
  const snapshot = this.getWorkbenchSnapshot();
  const targetBoxId = snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null;
  if (!trimmed || !targetBoxId) return snapshot;

  const link = isHttpUrl(trimmed);
  const timestamp = nowIso();

  db.prepare(`
    insert into items (box_id, kind, title, content, source_url, created_at, updated_at)
    values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    targetBoxId,
    link ? "link" : "text",
    link ? trimmed : deriveTextTitle(trimmed),
    trimmed,
    link ? trimmed : "",
    timestamp,
    timestamp
  );

  return this.getWorkbenchSnapshot();
},

updateLinkTitle(itemId: number, title: string): WorkbenchSnapshot | null {
  const trimmed = title.trim();
  if (!trimmed) return null;

  const result = db.prepare(`
    update items
    set title = ?, updated_at = ?
    where id = ? and kind = 'link'
  `).run(trimmed, nowIso(), itemId);

  return Number(result.changes) > 0 ? this.getWorkbenchSnapshot() : null;
},
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/main/store.test.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/shared/types.ts D:/02-Projects/brain/desktop/src/main/store.ts D:/02-Projects/brain/desktop/src/main/store.test.ts
git commit -m "add desktop quick capture store writes"
```

## Task 2: Add IPC And Preload Support For Capture And Link Enrichment

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\shared\ipc.ts`
- Modify: `D:\02-Projects\brain\desktop\src\preload.ts`
- Modify: `D:\02-Projects\brain\desktop\src\renderer-globals.d.ts`
- Modify: `D:\02-Projects\brain\desktop\src\main\ipc.ts`
- Test: `D:\02-Projects\brain\desktop\src\app.test.tsx`

- [ ] **Step 1: Write the failing app-level contract test**

```tsx
  it("captures a quick note through the desktop bridge", async () => {
    const captureTextOrLink = vi.fn().mockResolvedValue({
      boxes: [{ id: 1, name: "Inbox", color: "#f97316", description: "", sortOrder: 0 }],
      items: [
        {
          id: 22,
          boxId: 1,
          kind: "text",
          title: "Quick note",
          content: "Quick note",
          sourceUrl: "",
          createdAt: "2026-04-08T00:00:00.000Z",
          updatedAt: "2026-04-08T00:00:00.000Z",
        },
      ],
      panelState: { selectedBoxId: 1, quickPanelOpen: true },
    });

    window.brainDesktop = {
      bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
      captureTextOrLink,
      enrichLinkTitle: vi.fn(),
    };

    render(<App />);
    fireEvent.change(await screen.findByPlaceholderText("Paste a link or note"), {
      target: { value: "Quick note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(captureTextOrLink).toHaveBeenCalledWith("Quick note"));
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: FAIL because `window.brainDesktop` does not expose capture APIs and `App` does not use them.

- [ ] **Step 3: Write the minimal IPC and preload implementation**

Update `desktop/src/shared/ipc.ts`:

```ts
export const IPC_CHANNELS = {
  bootstrap: "workbench/bootstrap",
  captureTextOrLink: "workbench/capture-text-or-link",
  enrichLinkTitle: "workbench/enrich-link-title",
} as const;
```

Update `desktop/src/preload.ts`:

```ts
contextBridge.exposeInMainWorld("brainDesktop", {
  bootstrap(): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.bootstrap);
  },
  captureTextOrLink(input: string): Promise<WorkbenchSnapshot> {
    return ipcRenderer.invoke(IPC_CHANNELS.captureTextOrLink, input);
  },
  enrichLinkTitle(itemId: number, url: string): Promise<WorkbenchSnapshot | null> {
    return ipcRenderer.invoke(IPC_CHANNELS.enrichLinkTitle, itemId, url);
  },
});
```

Update `desktop/src/renderer-globals.d.ts`:

```ts
    brainDesktop: {
      bootstrap(): Promise<WorkbenchSnapshot>;
      captureTextOrLink(input: string): Promise<WorkbenchSnapshot>;
      enrichLinkTitle(itemId: number, url: string): Promise<WorkbenchSnapshot | null>;
    };
```

Update `desktop/src/main/ipc.ts`:

```ts
async function fetchPageTitle(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const html = await response.text();
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!match) return null;
    const title = match[1].replace(/\s+/g, " ").trim();
    return title || null;
  } catch {
    return null;
  }
}

ipcMain.handle(IPC_CHANNELS.captureTextOrLink, (_event, input: string) => store.captureTextOrLink(input));
ipcMain.handle(IPC_CHANNELS.enrichLinkTitle, async (_event, itemId: number, url: string) => {
  const title = await fetchPageTitle(url);
  if (!title) return null;
  return store.updateLinkTitle(itemId, title);
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/shared/ipc.ts D:/02-Projects/brain/desktop/src/preload.ts D:/02-Projects/brain/desktop/src/renderer-globals.d.ts D:/02-Projects/brain/desktop/src/main/ipc.ts D:/02-Projects/brain/desktop/src/app.test.tsx
git commit -m "add desktop quick capture ipc bridge"
```

## Task 3: Make QuickCapture Interactive In The Renderer

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\components\quick-capture.tsx`
- Create: `D:\02-Projects\brain\desktop\src\components\quick-capture.test.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\index.css`

- [ ] **Step 1: Write the failing QuickCapture component tests**

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickCapture } from "./quick-capture";

describe("QuickCapture", () => {
  it("submits non-empty input and clears the field", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<QuickCapture activeBoxName="Inbox" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("Paste a link or note"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("https://example.com"));
    expect(screen.getByPlaceholderText("Paste a link or note")).toHaveValue("");
  });

  it("does not submit blank input", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<QuickCapture activeBoxName="Inbox" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("Paste a link or note"), {
      target: { value: "   " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onSubmit).not.toHaveBeenCalled());
  });

  it("shows an inline error if submit fails", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("Capture failed"));
    render(<QuickCapture activeBoxName="Inbox" onSubmit={onSubmit} />);

    fireEvent.change(screen.getByPlaceholderText("Paste a link or note"), {
      target: { value: "Broken" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Capture failed")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/quick-capture.test.tsx`

Expected: FAIL because `QuickCapture` does not accept props or manage input state.

- [ ] **Step 3: Write the minimal interactive component**

Update `desktop/src/components/quick-capture.tsx`:

```tsx
import { FormEvent, useState } from "react";

type QuickCaptureProps = {
  activeBoxName: string;
  onSubmit: (input: string) => Promise<void>;
};

export function QuickCapture({ activeBoxName, onSubmit }: QuickCaptureProps) {
  const [value, setValue] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError("");
    try {
      await onSubmit(trimmed);
      setValue("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Capture failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="quick-capture" aria-label="Quick Capture">
      <div className="quick-capture-copy">
        <p className="eyebrow">Quick Capture</p>
        <h2>Pull fresh inspiration into the workbench</h2>
        <p>New text and links will go into {activeBoxName}</p>
      </div>

      <form className="capture-form" onSubmit={handleSubmit}>
        <label className="capture-field">
          <span className="capture-label">Paste a link or note</span>
          <input
            className="capture-input"
            type="text"
            placeholder="Paste a link or note"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <button className="capture-button" type="submit" disabled={submitting}>
          {submitting ? "Adding..." : "Add"}
        </button>
        {error ? <p className="capture-error">{error}</p> : null}
      </form>
    </section>
  );
}
```

Update `desktop/src/index.css`:

```css
.capture-form {
  display: grid;
  gap: 12px;
}

.capture-button {
  min-height: 48px;
  border: 0;
  border-radius: 16px;
  background: #231815;
  color: #fff9f2;
  font: inherit;
  font-weight: 600;
}

.capture-error {
  margin: 0;
  color: #b43f24;
  font-size: 0.88rem;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/components/quick-capture.test.tsx`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/components/quick-capture.tsx D:/02-Projects/brain/desktop/src/components/quick-capture.test.tsx D:/02-Projects/brain/desktop/src/index.css
git commit -m "make desktop quick capture interactive"
```

## Task 4: Wire Snapshot Updates Through App And Shell

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\app.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.test.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\app.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

```tsx
  it("renders a newly captured note in the current canvas", async () => {
    window.brainDesktop = {
      bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
      captureTextOrLink: vi.fn().mockResolvedValue({
        ...initialSnapshot,
        items: [
          {
            id: 22,
            boxId: 1,
            kind: "text",
            title: "Quick note",
            content: "Quick note",
            sourceUrl: "",
            createdAt: "2026-04-08T00:00:00.000Z",
            updatedAt: "2026-04-08T00:00:00.000Z",
          },
        ],
      }),
      enrichLinkTitle: vi.fn().mockResolvedValue(null),
    };

    render(<App />);
    fireEvent.change(await screen.findByPlaceholderText("Paste a link or note"), {
      target: { value: "Quick note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Quick note")).toBeInTheDocument();
  });

  it("refreshes a link title after enrichment", async () => {
    const captureTextOrLink = vi.fn().mockResolvedValue(linkSnapshotWithUrlTitle);
    const enrichLinkTitle = vi.fn().mockResolvedValue(linkSnapshotWithFetchedTitle);

    window.brainDesktop = {
      bootstrap: vi.fn().mockResolvedValue(initialSnapshot),
      captureTextOrLink,
      enrichLinkTitle,
    };

    render(<App />);
    fireEvent.change(await screen.findByPlaceholderText("Paste a link or note"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findAllByText("https://example.com")).not.toHaveLength(0);
    expect(await screen.findAllByText("Example Domain")).not.toHaveLength(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx src/components/app-shell.test.tsx`

Expected: FAIL because `AppShell` does not receive capture callbacks and `App` does not update snapshots after quick capture.

- [ ] **Step 3: Write the minimal integration implementation**

Update `desktop/src/components/app-shell.tsx`:

```tsx
type AppShellProps = {
  snapshot: WorkbenchSnapshot;
  onQuickCapture: (input: string) => Promise<void>;
};

export function AppShell({ snapshot, onQuickCapture }: AppShellProps) {
  const selectedBoxId = snapshot.panelState.selectedBoxId ?? snapshot.boxes[0]?.id ?? null;
  const currentBox = snapshot.boxes.find((box) => box.id === selectedBoxId);
  const currentItems = snapshot.items.filter((item) => item.boxId === selectedBoxId);

  return (
    <div className="app-shell">
      <BoxRail boxes={snapshot.boxes} selectedBoxId={selectedBoxId} />
      <div className="workspace-column">
        <QuickCapture activeBoxName={currentBox?.name ?? "Inbox"} onSubmit={onQuickCapture} />
        <MainCanvas box={currentBox} items={currentItems} />
      </div>
      <QuickPanel items={snapshot.items} open={snapshot.panelState.quickPanelOpen} />
    </div>
  );
}
```

Update `desktop/src/app.tsx`:

```tsx
async function handleQuickCapture(input: string) {
  const nextSnapshot = await window.brainDesktop.captureTextOrLink(input);
  setSnapshot(nextSnapshot);

  const created = nextSnapshot.items[0];
  if (created?.kind !== "link" || !created.sourceUrl) return;

  const enrichedSnapshot = await window.brainDesktop.enrichLinkTitle(created.id, created.sourceUrl);
  if (enrichedSnapshot) {
    setSnapshot(enrichedSnapshot);
  }
}
```

Implementation note: keep the existing bootstrap `useEffect`; only add the new submit handler and pass it to `AppShell`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd D:\02-Projects\brain\desktop; npm test -- --run src/app.test.tsx src/components/app-shell.test.tsx`

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
- typing a note into `Quick Capture` creates a new card in the current box
- typing a URL creates a link card immediately and updates title later if the fetch succeeds

- [ ] **Step 6: Commit**

```bash
git add D:/02-Projects/brain/desktop/src/app.tsx D:/02-Projects/brain/desktop/src/components/app-shell.tsx D:/02-Projects/brain/desktop/src/components/app-shell.test.tsx D:/02-Projects/brain/desktop/src/app.test.tsx
git commit -m "wire desktop quick capture flow"
```

## Self-Review

### Spec Coverage

- interactive quick capture input: covered by Tasks 3 and 4
- text/link auto-detection: covered by Task 1
- contextual target box: covered by Tasks 1 and 4
- immediate item creation: covered by Task 1
- async link-title enrichment: covered by Tasks 2 and 4
- renderer snapshot refresh after create/enrich: covered by Task 4
- local persistence updates: covered by Task 1

No approved spec requirements are missing from this plan.

### Placeholder Scan

- no `TODO`
- no `TBD`
- each task includes exact files, tests, commands, and code snippets
- follow-up drag/drop work is explicitly out of scope rather than deferred vaguely

### Type Consistency

Consistent names across the plan:

- `captureTextOrLink`
- `updateLinkTitle`
- `enrichLinkTitle`
- `sourceUrl`
- `createdAt`
- `updatedAt`
- `QuickCapture`
- `onQuickCapture`

The plan keeps renderer writes flowing through `window.brainDesktop` only, with store writes implemented in `DesktopStore`.
