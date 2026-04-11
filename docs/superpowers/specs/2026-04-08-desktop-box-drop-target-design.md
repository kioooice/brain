# Brain Desktop Box Drop Target Design

## Goal

Extend desktop external drag-and-drop so the user can drop files and folders directly onto a specific box in the left rail, while keeping the current workspace drop behavior unchanged.

## Scope

### In Scope

- left-rail boxes become external drop targets
- dropping on a box sends the dropped paths into that exact box
- workspace drop keeps its current behavior
- box targets show highlight-only feedback during drag over
- file and bundle creation rules stay exactly the same as the current dropped-path flow

### Out Of Scope

- drag-to-reorder boxes
- drag-to-move existing cards between boxes
- extra tooltip or label copy while hovering a box
- box-specific inline error UI beyond the existing app-level drop error

## Interaction Rule

The user selected a dual-path model:

- dropping into the main workspace still goes into the current selected box or `Inbox`
- dropping onto a specific left-rail box overrides that and goes into that box directly

This means the app now has two valid external drop surfaces:

- workspace column
- individual box pills

## Feedback Rule

The first version should only show highlight feedback on the hovered box.

That means:

- no text overlay
- no helper chip
- no “Drop to Brand” label

The hover state alone should communicate the target.

## Persistence Rule

This slice should not invent a second store path. It should reuse the current dropped-path logic and only add target-box override support.

That means:

- file => `file`
- multiple paths or any folder => `bundle`
- storage remains path-reference only

## Architecture

The cleanest extension is:

- store grows a `captureDroppedPathsIntoBox(paths, boxId)` path
- preload and IPC expose a targeted drop action
- box rail forwards external drops with the hovered box id
- app receives the refreshed snapshot and replaces state exactly like the workspace drop flow

This avoids overloading the renderer with persistence logic.

## UI Design

### Box Rail

Each box pill should support:

- drag enter / drag over => active drop highlight
- drag leave => remove highlight
- drop => forward absolute paths + `boxId`

The existing selected-box visual should remain. The drop-target highlight should layer on top of it, not replace selection.

### Workspace

No change to current workspace drop target semantics.

The app should simply route:

- workspace drop => `captureDroppedPaths`
- box drop => `captureDroppedPathsIntoBox`

## Error Handling

Use the same error strategy as current workspace drop:

- if the drop handler throws, keep current UI state
- surface the error through the shared drop-error channel

This slice does not need per-box error rendering.

## Testing Strategy

### Store

- targeted drop writes into the specified box id
- targeted bundle drop still creates one bundle with correct entry count

### Renderer Component

- dragging over a box pill adds drop-target highlight
- dropping paths on a box calls the box-drop callback with the right `boxId`

### App Integration

- dropping one file on a non-selected box stores it there
- dropping multiple paths on a non-selected box creates a bundle there
- workspace drop behavior still works

## Recommendation

Implement precise box drop targeting as a small extension to the current desktop drop system:

- add a targeted store/API path
- make box pills external drop targets
- keep feedback to highlight only

This adds the first real “drop into a box” desktop behavior without disturbing the new workspace drop flow.
