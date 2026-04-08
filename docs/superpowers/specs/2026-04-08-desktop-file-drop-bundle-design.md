# Brain Desktop File Drop Bundle Design

## Goal

Add the first desktop-native drag-in path to `brain desktop`: the user should be able to drag files, images, and folders from the operating system into the app window, and the app should convert them into `file` or `bundle` items without copying the underlying assets.

This slice is about direct desktop ingestion, not deep preview or file management.

## Scope

### In Scope

- external file drag into the Electron window
- external folder drag into the Electron window
- single dropped file becomes a `file` item
- multiple dropped files become one `bundle`
- single dropped folder becomes one `bundle`
- mixed file/folder drop becomes one `bundle`
- path-reference storage only
- drop target is the main work area
- renderer refresh after drop

### Out Of Scope

- copying files into app storage
- drag-to-specific-box hit testing on the left rail
- folder tree preview inside the bundle
- thumbnail extraction
- file-system sync or move operations
- drag out of the app

## Placement Rule

The user chose a simple placement rule:

- dropping into the main work area sends content into the current selected box
- if the app is effectively on the default main context, the target is `Inbox`

This slice does not introduce rail-level drop targeting yet.

## Storage Rule

Dropped content should be stored as path references only.

That means:

- files keep their original absolute paths
- folders keep their original absolute paths
- the app does not duplicate or move assets

This is the fastest path to a real desktop workflow and keeps first implementation risk low.

## Item Modeling

### Single File

One dropped file should create one `file` item.

Suggested shape:

- `kind = "file"`
- `title =` basename of the file path
- `content =` absolute path
- `sourcePath =` absolute path
- `boxId =` resolved target box

Images can use the same first-pass behavior as any other file. Image-specific display can come later.

### Bundle

Bundles represent grouped dropped assets created in one drop gesture.

A bundle should be created when:

- more than one file is dropped
- one folder is dropped
- a mixed set of files and folders is dropped

Suggested shape:

- `kind = "bundle"`
- `title =` a simple generated label such as `Dropped bundle`
- `content =` empty string or a short generated summary
- `boxId =` resolved target box

The bundle needs child path references. The current desktop model does not yet have a dedicated child table, so this slice should add a small persistence structure for bundle entries instead of overloading the main item row.

## Persistence Design

The desktop store needs to grow beyond text/link capture into dropped-path ingestion.

### New Responsibilities

- accept a list of dropped absolute paths
- classify drop as `file` or `bundle`
- create bundle children when needed
- return a refreshed `WorkbenchSnapshot`

### Schema Additions

Add the smallest structures required:

- `source_path text not null default ''` on `items`
- a new `bundle_entries` table with:
  - `id`
  - `bundle_item_id`
  - `entry_path`
  - `entry_kind`
  - `sort_order`

This keeps the main `items` table simple while giving bundles a real backing structure.

Existing databases should migrate additively during store bootstrap.

## Desktop IPC Design

The renderer should not inspect dropped file paths and write directly to SQLite.

Add one IPC path:

- `captureDroppedPaths(paths: string[]): Promise<WorkbenchSnapshot>`

The renderer only forwards dropped absolute paths; classification and persistence stay in the main process.

## Renderer Interaction Design

### Drop Zone

The first drop target should be the central workspace column, not the whole window chrome.

Expected behavior:

- dragging external files over the workspace gives a visible drop-active state
- dropping triggers item creation
- leaving the area clears the drop-active state

This should feel like a work surface, not a generic upload zone.

### Immediate Feedback

After drop succeeds:

- the newly created `file` or `bundle` appears in the current canvas
- no modal appears
- no forced navigation happens

If the current selected box is visible, the new card should appear near the top because items are read in reverse insertion order.

## Bundle Card Design

The user explicitly chose a very light first version.

Bundle cards should show only:

- bundle title
- item count

No file-name preview is required in this slice.

This is enough to prove the model and interaction without dragging in a second UI problem.

## Error Handling

Only handle the meaningful cases.

### Ignore

- empty drop payload
- unsupported payloads with no file paths

### Inline Failure

If persistence fails:

- keep the existing canvas unchanged
- show a lightweight inline drop error in the workspace region

No modal dialog is needed.

## Testing Strategy

This slice should add tests at three levels.

### Store Tests

- single file path creates a `file` item with `sourcePath`
- multiple file paths create one `bundle`
- single folder path creates one `bundle`
- bundle entries persist with count and order

These should remain unit-style with the store test double.

### Renderer Component Tests

- workspace drop target enters active state on drag over
- dropping file paths calls the drop callback
- drop error is shown inline when submit fails

### App Integration Tests

- dropping one file updates the canvas with a `file` item
- dropping multiple paths updates the canvas with a `bundle`
- dropping into the current workspace uses the selected box

## Implementation Boundary

This feature should remain a narrow vertical slice:

- one renderer drop target
- one IPC write path
- one store persistence path for file/bundle creation
- minimal bundle card display

It should not expand into previews, folder browsing, rail drop targeting, or asset copying in this round.

## Recommendation

Implement desktop drag-in as path-reference capture with:

- workspace-only drop handling
- single-file => `file`
- multiple paths or any folder => `bundle`
- bundle cards that show only title and count

This gives `brain desktop` its first genuinely desktop-native ingestion flow without overcommitting to heavier file-management behavior.
