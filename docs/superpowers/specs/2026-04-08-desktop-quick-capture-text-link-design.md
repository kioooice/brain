# Brain Desktop Quick Capture Text/Link Design

## Goal

Add the first real capture loop to `brain desktop`: the top `Quick Capture` area should let the user paste text or links, create a new item immediately, and place it into the right box without interrupting the current desktop flow.

This slice is intentionally narrow. It is not the full drag-and-drop system yet. It is the first shippable capture path for typed and pasted content.

## Scope

### In Scope

- top `Quick Capture` input becomes interactive
- automatic text vs link detection
- immediate item creation
- contextual target-box selection based on current desktop state
- async link-title enrichment after the item already exists
- renderer refresh after creation
- local persistence for newly created items

### Out Of Scope

- file drag-and-drop ingestion
- image or screenshot capture
- drag target hit-testing on box rail
- bundle creation
- metadata editing UI
- link preview thumbnails

## Product Rule

The user clarified one simple rule for where new content goes:

- if the user is currently inside a box, pasted or typed content goes into that current box
- if the user is on the default main view and has not intentionally switched into another box, new content goes into `Inbox`
- later, when drag-and-drop is implemented, dropping onto a specific box should override this rule and place the item into that box

For the current desktop shell, this maps cleanly to the existing selection model:

- `Inbox` is the default active box on first launch
- switching to another box makes that box the capture target
- this feature does not add a separate target-box picker in the capture strip

## Interaction Design

### Quick Capture Input

The existing top capture field becomes an active text input with:

- placeholder: `Paste a link or note`
- an `Add` button
- Enter submits
- empty or whitespace-only input does nothing

The user flow is:

1. paste or type content
2. press Enter or click `Add`
3. app creates the new item immediately
4. input clears
5. the new card appears in the target box view if that target is currently visible

This should feel instant and low-friction, not form-driven.

### Type Detection

Detection stays intentionally simple in v1:

- if the trimmed input is a valid `http` or `https` URL, create a `link` item
- otherwise create a `text` item

No extra classifier is needed in this slice.

### Immediate Link Creation

Links should not block on metadata fetch.

When the input is a URL:

- create the item immediately
- set the first visible title to the raw URL or a simple normalized fallback
- start a background title fetch
- if a title is fetched successfully, update the existing item in place

This keeps capture fast even when the network is slow.

### Box Placement Feedback

This slice should not add extra notifications unless needed for errors.

Expected behavior:

- if the current box is the target, the new card appears at the top of the main canvas
- if the current box is `Inbox`, the new card appears at the top of `Inbox`
- no forced box switching

The goal is to preserve spatial continuity.

## Data Design

The current `Item` shape is enough for the first version, but this feature should start filling a few more fields consistently.

### For Text Items

- `kind = "text"`
- `title =` first meaningful line or a short fallback such as `Quick note`
- `content =` full pasted text
- `boxId =` resolved target box

### For Link Items

- `kind = "link"`
- `title =` initial URL string, then async-updated title if available
- `content =` URL string
- `boxId =` resolved target box
- `sourceUrl =` URL string

Because the current desktop `Item` type does not yet include `sourceUrl`, this slice should extend the shared type and SQLite schema so links are not forced into ambiguous storage.

## Persistence Design

The desktop store needs to grow from read-only bootstrap into minimal write support.

### New Store Responsibilities

- resolve the current target box from panel state
- create a text item
- create a link item
- update a link title after background fetch
- return a fresh workbench snapshot after writes

### Schema Changes

Add the smallest fields needed to support this slice:

- `source_url text not null default ''`
- `created_at text not null`
- `updated_at text not null`

`items` should still remain one unified table.

Existing rows should remain valid through additive schema migration logic in the store bootstrap.

## Desktop IPC Design

The preload bridge needs one new write path and one new enrichment path.

### New IPC Actions

- `captureTextOrLink(input: string): Promise<WorkbenchSnapshot>`
- `enrichLinkTitle(itemId: number, url: string): Promise<WorkbenchSnapshot | null>`

The renderer should only talk to these safe IPC entry points, not to SQLite directly.

## Link Title Fetching

This should run outside the renderer so the UI path stays simple and browser-origin issues do not become the renderer's problem.

Recommended behavior:

- renderer submits the link immediately
- main process creates the item
- renderer kicks off a follow-up background request through IPC
- main/store layer fetches the HTML, extracts `<title>`, normalizes whitespace, and updates the item if a better title is found

Failure behavior:

- if fetch fails, keep the original URL title
- no modal error
- no retry UI in this slice

This is enrichment, not a blocking dependency.

## UI State Updates

The current renderer can stay simple.

Recommended behavior:

- `App` owns the latest `WorkbenchSnapshot`
- `QuickCapture` receives the active box context and a submit callback
- on submit success, `App` replaces the in-memory snapshot with the returned snapshot
- if a later link-title enrichment returns a newer snapshot, `App` replaces snapshot again

No global state library is needed.

## Error Handling

Only handle the errors that matter in this slice.

### Validation Errors

- blank input: ignore and keep focus in the field
- invalid URL parsing: treat as plain text instead of erroring

### Runtime Errors

- failed item creation: show a small inline error in the capture strip
- failed title enrichment: silent fallback, keep the raw URL title

This keeps the user-facing behavior calm and desktop-like.

## Testing Strategy

This slice should add coverage at three levels.

### Store Tests

- creates text item in the selected box
- creates link item with `sourceUrl`
- updates link title after enrichment
- falls back to `Inbox` when no selected box exists

These should stay unit-style and avoid native-module coupling in Node test runs.

### Renderer Tests

- `QuickCapture` submits text input and clears the field
- valid URL input calls link capture path
- blank input does not submit
- inline error appears on failed capture

### Integration Path

- `App` receives updated snapshot after capture
- newly created item renders at the top of the current canvas
- link enrichment updates the rendered title after the initial URL-based card appears

## Implementation Boundary

This feature should remain a narrow vertical slice:

- one active input
- one write path into SQLite-backed store
- one async enrichment path for links
- one renderer refresh path

It should not expand into drag-drop, previews, or box targeting controls during this round.

## Recommendation

Implement `Quick Capture` as the first real desktop capture loop with:

- contextual box targeting based on current selected box
- simple text/link auto-detection
- immediate item creation
- async link-title enrichment

This gives the desktop app its first meaningful end-to-end behavior without pulling in the larger drag-and-drop system yet.
