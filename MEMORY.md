# MEMORY.md - Long-Term Workspace Memory

Use this file for durable notes that should survive across sessions.

## Current Project

- `brain` is now an Electron desktop app for local inspiration capture and organization.
- The desktop app uses SQLite via `better-sqlite3`, React, and TypeScript.
- Local development runs from `desktop/` with `npm start`.
- The old Flask web app has been removed; new capture work belongs in Desktop only.
- The desktop home view shows clipboard watcher state and target box, without a recent capture element.
- Windows packaging uses an electron-builder NSIS `.exe` with directory selection enabled; close dev Electron before `npm run make`.
- Daily `npm test` excludes the NSIS packaging test; use `npm run test:packaging` only when checking installer flow.
- Capture dedupe is persistent per box using stored fingerprints and bundle entry paths, not only a short time window.
- Clipboard watcher keeps the last non-empty fingerprint so transient empty reads do not cause the same content to be captured again.
- Main canvas title and filters live in a distinct control panel with its own background and divider above the card area.
- Clear-by-kind now lives inside a collapsible "批量管理" panel instead of competing with search/date/type filters.
- The "批量管理" panel has a selection mode that shows card checkboxes, selected count, and cancel selection.
- Selected cards can be bulk moved to another box from the "批量管理" panel using the existing move-to-box workflow.
- Selected cards can be bulk deleted from the "批量管理" panel after a count-based confirmation.
- Batch selection supports select-all-current-filter, invert-current-filter, and clear-selection actions.
- The "批量管理" panel separates selected-card actions from clear-by-kind actions so destructive scopes are visually distinct.
- The selected-card area in "批量管理" stacks quick selection buttons above the move control to avoid crowded mid-width wrapping.
- Bulk move and bulk delete use single summary toasts instead of one toast per selected card.
- Box detail view uses a title-area breadcrumb to return directly to the box overview.
- Box overview supports global text search across boxes and opens the matching item's box from the result list.
- Box overview shows a "今天收集" panel for same-day top-level items and opens the matching box from each item.
- Today collected items can be moved directly into another existing box from the overview, and successful moves hide the item as handled.
- Today collected items can be temporarily marked handled and hidden from the Today panel without deleting stored content.
- The Today panel has a bulk "全部处理完" action that hides all currently visible Today items without changing stored content.
- Text, link, image, file, and bundle cards use a single "操作" menu for copy, preview/detail, extraction, and rename where available.
- Card action menus close on outside click and use viewport-fixed placement to avoid being clipped by card edges.
- Card dragging shows a live guidance pill for sorting/grouping, and the trash zone changes its hint when it can delete the dragged item.
- While dragging a card over the rail, temporary box targets appear so the card can be dropped directly into another box.
- Failed drag-to-box moves keep the rail target open with a rollback hint, while the app shows a single error toast.
- Drag feedback copy for sorting, grouping, moving to boxes, and deletion is centralized in the desktop component drag-feedback module.
- Drag target visuals share data-drop-visual variants for sorting, grouping, moving, deleting, and error states.
- Legacy drag visual markers such as active drop-slot classes and old drop-target attributes have been removed from the drag UI.
- Link cards show the source domain above the clickable URL for faster origin recognition.
- File cards show source path metadata separately from the open-file action.
- Item detail previews are fixed to the current viewport so opening a middle card does not require scrolling back to the top.
- Automatic desktop capture now has explicit manual/privacy pause state; while paused it will not take screenshots or write automatic capture records.
- Backend work should be evaluated only after the current desktop stages are done; a first backend version, if needed, is limited to encrypted backup and multi-device sync, not a complex platform.

## Structure

- `profile/` for user-oriented facts and preferences
- `insights/` for reusable patterns and lessons
- `experiences/` for dated notes

## Guidelines

- Keep entries short and useful.
- Prefer stable facts over transient chatter.
- Merge duplicates instead of creating noise.
