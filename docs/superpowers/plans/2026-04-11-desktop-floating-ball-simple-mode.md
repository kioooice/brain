# Desktop Floating Ball Simple Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace simple-mode entry with a draggable floating ball that expands into the existing fixed simple panel and collapses back to the saved ball position.

**Architecture:** Persist a new `simpleModeView` state and floating-ball bounds in the desktop store, let the main process own all window shape and position changes, and keep the renderer limited to ball-vs-panel UI switching plus existing simple-mode behavior.

**Tech Stack:** Electron, React, TypeScript, Vitest, Testing Library

---

### Task 1: Persist simple-mode ball state

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\shared\types.ts`
- Modify: `D:\02-Projects\brain\desktop\src\main\store.ts`
- Test: `D:\02-Projects\brain\desktop\src\main\store.test.ts`

- [ ] Add failing tests for `simpleModeView` defaulting to `ball` and resetting to `ball` on simple-mode exit.
- [ ] Run `npm test -- --run src/main/store.test.ts`
- [ ] Update shared types and store persistence for `simpleModeView`.
- [ ] Re-run `npm test -- --run src/main/store.test.ts`

### Task 2: Add floating-ball bounds helpers

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\main\window-bounds.ts`
- Test: `D:\02-Projects\brain\desktop\src\main\window-bounds.test.ts`

- [ ] Add failing tests for default floating-ball placement and off-screen clamping.
- [ ] Run `npm test -- --run src/main/window-bounds.test.ts`
- [ ] Implement floating-ball bounds helpers without changing fixed simple-panel placement.
- [ ] Re-run `npm test -- --run src/main/window-bounds.test.ts`

### Task 3: Wire main-process window transitions

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\index.ts`
- Modify: `D:\02-Projects\brain\desktop\src\shared\ipc.ts`
- Modify: `D:\02-Projects\brain\desktop\src\preload.ts`
- Modify: `D:\02-Projects\brain\desktop\src\renderer-globals.d.ts`
- Modify: `D:\02-Projects\brain\desktop\src\main\ipc.ts`
- Test: `D:\02-Projects\brain\desktop\src\main\ipc.test.ts`

- [ ] Add failing IPC coverage for the new simple-mode view toggle or setter.
- [ ] Run `npm test -- --run src/main/ipc.test.ts`
- [ ] Implement the IPC and main-process rebuild logic for `main`, `simple-ball`, and `simple-panel`.
- [ ] Re-run `npm test -- --run src/main/ipc.test.ts`

### Task 4: Render floating ball and keep panel behavior

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\box-rail.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\index.css`
- Modify: `D:\02-Projects\brain\desktop\src\app.tsx`
- Test: `D:\02-Projects\brain\desktop\src\components\app-shell.simple-mode.test.tsx`
- Test: `D:\02-Projects\brain\desktop\src\app.test.tsx`

- [ ] Add failing renderer tests for ball-only simple mode and ball-to-panel toggling.
- [ ] Run `npm test -- --run src/components/app-shell.simple-mode.test.tsx src/app.test.tsx`
- [ ] Implement the floating ball UI, remove the simple-mode always-on-top toggle, and keep paste-to-selected-box active only for `panel`.
- [ ] Re-run `npm test -- --run src/components/app-shell.simple-mode.test.tsx src/app.test.tsx`

### Task 5: Full verification

**Files:**
- Modify: `D:\02-Projects\brain\desktop\src\main\store.ts`
- Modify: `D:\02-Projects\brain\desktop\src\main\window-bounds.ts`
- Modify: `D:\02-Projects\brain\desktop\src\index.ts`
- Modify: `D:\02-Projects\brain\desktop\src\components\app-shell.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\components\box-rail.tsx`
- Modify: `D:\02-Projects\brain\desktop\src\app.tsx`

- [ ] Run focused tests again if any implementation changed during cleanup.
- [ ] Run `npm test -- --run`
- [ ] Run `npm run lint`
