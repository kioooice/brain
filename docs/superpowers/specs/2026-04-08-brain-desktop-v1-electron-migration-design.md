# Brain Desktop V1 Electron Migration Design

## Goal

Move `brain` from a browser-based Flask app toward a desktop-first product whose core experience feels closer to a Pogget-style inspiration workbench.

The first desktop version should not attempt to fully clone Pogget. It should establish a strong single-window desktop workbench for mixed inspiration materials, with direct manipulation as the primary interaction model.

## Product Direction

`brain desktop v1` is a desktop application for collecting and organizing inspiration materials:

- links
- text snippets
- screenshots
- images
- local files

The product is not a general file manager in v1. It is an inspiration-material workstation with desktop interaction patterns.

The design target is:

- desktop-first
- single main window
- componentized workbench layout
- low-form, high-direct-manipulation interaction

## Strategic Decision

The current Flask app should no longer be treated as the long-term product shell.

It should instead become:

- a reference implementation for data shape and flows
- a source of reusable behavioral logic
- a migration baseline for tests and storage expectations

The desktop application should be built as a new Electron app rather than by wrapping the Flask UI.

## Why Electron

The user explicitly prioritized frontend interaction quality over preserving the current Python stack.

Electron is the preferred path because it is the most direct route to:

- custom desktop window behavior
- strong drag-and-drop support
- richer direct-manipulation interaction patterns
- a modern frontend rendering layer that can be shaped toward the desired Pogget-like feel

This is a product-shape decision first, not a language-loyalty decision.

## V1 Product Shape

The first desktop release should be a `single main window` workbench with four core areas:

### 1. Box Rail

The left side shows all boxes.

Responsibilities:

- switch work context
- show active box
- show item count
- support reorder and management entry

Boxes remain the primary navigation object.

### 2. Main Canvas

The center area shows the current box as a card-based material canvas.

Responsibilities:

- show mixed materials as type-specific cards
- support drag and reorder behaviors inside the work context
- support group/bundle style organization
- support direct actions without sending the user into form-heavy screens

This is the main product surface.

### 3. Quick Capture Entry

The top area provides always-available capture.

Responsibilities:

- accept dropped materials
- accept pasted text, links, and screenshots
- create new items quickly
- route fresh content into a default collection area

Capture must feel fast and ambient, not like filling in a record form.

### 4. Quick Panel

The right side or lower side acts as a collapsible quick panel.

Responsibilities:

- show recently added content
- provide cross-box search or filtering
- offer temporary staging before deeper organization
- support fast dispatch between boxes

This panel is a utility surface, not the main canvas.

## Core Interaction Model

The desktop version should center on:

`drop -> view -> sort -> group -> revisit`

The dominant user actions in v1 are:

- drag materials into the app
- inspect them as cards
- move them into boxes
- regroup or relabel as needed
- reopen them later from the same desktop workspace

The app should avoid leading with:

- table views
- large edit forms
- admin-style filter dashboards

Those may still exist as secondary tools, but not as the primary experience.

## Object Model

The desktop app should simplify the current mixed concepts into three core objects.

### Box

Represents a thematic work context and destination.

Suggested properties:

- `id`
- `name`
- `color`
- `description`
- `sort_order`
- `created_at`
- `updated_at`

### Item

Represents any material the user collects.

Suggested properties:

- `id`
- `box_id`
- `kind`
- `title`
- `content`
- `source_url`
- `source_path`
- `thumbnail_path`
- `notes`
- `tags`
- `children`
- `created_at`
- `updated_at`

Suggested `kind` values for v1:

- `text`
- `link`
- `image`
- `file`
- `bundle`

The important design rule is that files and inspiration records should not become separate first-class systems. They should be different `Item` kinds inside one unified workbench model.

### PanelState

Represents local UI state rather than user content.

Suggested responsibilities:

- selected box
- quick panel open/closed state
- active filters
- temporary layout state

This should remain separate from persistent content objects.

## Scope For V1

### In Scope

- Electron desktop shell
- single main window
- box rail
- main card canvas
- quick capture
- quick panel
- local SQLite persistence
- local file references and file dropping
- inspiration-material item model
- type-specific cards
- box management
- grouping / bundle support

### Out Of Scope

- multiple floating widget windows
- system-wide magnetic attach windows
- target-folder sync
- mapped storage boxes
- full filesystem mirroring
- cloud sync
- collaborative features
- platform-specific shell integrations beyond basic desktop app behavior

These are intentionally excluded so the first desktop version can become real instead of remaining a forever-ambitious prototype.

## Visual And Interaction Principles

The desktop app should feel spatial and tactile.

### Primary Principles

- cards before forms
- space before density
- boxes before filters
- direct manipulation before modal-heavy workflows

### Visual Principles

- desktop utility, not web admin panel
- strong box identity through color and active state
- type-specific cards with visual recognition cues
- restrained but intentional motion
- minimal chrome around the main canvas

### Behavior Principles

- double-click and drag should matter
- keyboard shortcuts should be additive, not required
- browsing and sorting should stay in the main canvas
- editing metadata should feel inline or lightweight where possible

## Architecture Direction

The new desktop app should be built as a separate project, likely under a new top-level directory such as `desktop/`.

Suggested top-level architecture:

- `Electron main process`
  window lifecycle, filesystem integration, native menus, app events
- `frontend renderer`
  main workbench UI
- `local persistence layer`
  SQLite and local asset/file bookkeeping

The current Flask app should not be embedded as a runtime dependency of the desktop shell.

Instead, the migration should pull forward:

- data concepts that still fit
- useful heuristics for capture and classification
- current storage expectations where still valid

## Migration Strategy

This should be a dual-track migration, not an in-place mutation.

### Track 1: Freeze The Flask App As Reference

Keep the current app stable enough to inspect:

- current model behavior
- current tests
- current item flows

But stop treating it as the product shell for future growth.

### Track 2: Build The Desktop App Fresh

Start a separate Electron application and migrate in layers.

Recommended order:

1. desktop shell and local persistence
2. box rail and canvas layout
3. item rendering and box switching
4. drag/drop and capture
5. grouping and quick panel

This preserves momentum and avoids the trap of trying to evolve a web admin surface into a native-feeling desktop product.

## Data Migration Direction

V1 does not need a perfect automated migration from the Flask database on day one.

But it should preserve continuity wherever practical.

Recommended approach:

- keep SQLite as the persistence baseline
- design the desktop schema so existing ideas can be imported later
- maintain compatibility with current conceptual entities where reasonable

Migration should be treated as a follow-up capability, not a blocker for the first usable desktop build.

## Risks

### Risk 1: Over-scoping Toward Full Pogget

If v1 tries to include widget windows, mapped boxes, target-folder sync, and shell-level magnetic windows, the project will likely stall.

Mitigation:

- keep v1 focused on the single-window inspiration workbench

### Risk 2: Preserving Too Much Flask Shape

If the new desktop app inherits too much of the current web UI structure, it will carry web-admin interaction habits into the desktop product.

Mitigation:

- treat the current app as behavioral reference, not UI scaffolding

### Risk 3: Splitting Files And Inspiration Into Separate Products

If local files and inspiration materials are modeled too differently, the workbench will fragment.

Mitigation:

- unify them under one `Item` system with typed variants

## Testing Strategy

The desktop migration should keep a testing discipline, but the test mix will shift.

Recommended coverage:

- unit tests for item and box model behavior
- persistence tests for SQLite writes and reads
- integration tests for drag/drop and capture flows
- renderer-level tests for major workbench behaviors
- smoke checks for desktop startup and window rendering

Existing Flask tests remain useful as behavioral reference during migration, but they should not define the desktop test architecture.

## Recommendation

Build `brain desktop v1` as a new Electron application with:

- a single main window
- a unified `Box + Item` model
- a card-based inspiration canvas
- quick capture and quick panel workflows

Do not continue extending the Flask UI as the main product surface.

The next step after this design should be an implementation plan for:

- desktop project scaffolding
- desktop persistence
- v1 workbench shell

