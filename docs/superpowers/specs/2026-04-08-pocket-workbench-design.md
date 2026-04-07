# Pocket Workbench Design

## Goal

Turn `brain` from a simple inspiration list into a pocket-style sorting workbench:

- all new content first lands in one large `未整理` pocket
- the user sorts items into themed boxes by drag-and-drop or one-click actions
- items remain visually recognizable before sorting because cards are type-specific
- automatic suggestions assist sorting but never take control away from the user

This design is inspired by the interaction shape of Pogget's pocket/widget model, but applied to mixed inspiration content instead of desktop file-only management.

## Product Shape

The first version should be a `工作台型` layout:

- left rail: themed boxes
- top quick-capture area: paste links, text, images, or files
- main canvas: `未整理` pocket in a clean grid
- item cards: lightweight sorting cues, not detail-first forms

The app should feel like a sorting surface, not a database table and not a traditional admin dashboard.

## Primary Workflow

1. The user drops or pastes new content into the quick-capture area.
2. The content is saved immediately into the `未整理` pocket with a detected content type.
3. The card displays:
   - type-specific visual layout
   - 1 to 3 suggested boxes
   - tags and keywords
   - a primary `一键放入` action
4. The user either:
   - drags the card into a box
   - clicks `一键放入`
   - leaves it in `未整理` for later
5. Once placed into a box, the item disappears from the default `未整理` view but can still be shown through a toggle for already-sorted content.

## Information Architecture

### Top-Level Spaces

- `未整理`
  The default inbox pocket for all newly captured content.
- `盒子`
  User-defined themed containers such as product ideas, design references, writing prompts, visual language, or research.
- `已归位可见开关`
  A view switch that optionally shows content already placed into boxes.

### Box Model

First version box rules:

- flat boxes only
- editable name
- editable color
- item count
- optional short description
- sortable in the rail

Out of scope for first version:

- nested boxes
- advanced automation rules
- full knowledge-tree hierarchy

## Card System

The `未整理` pocket must use type-specific cards.

### Link Card

Shows:

- title
- source
- optional preview image
- short excerpt or description
- suggested boxes
- tags
- primary quick-place action

### Image Card

Shows:

- large preview image
- short title or note
- source if available
- suggested boxes
- tags

The image itself is the main recognition cue.

### Video Card

Shows:

- cover image
- platform or source
- duration or video badge
- title
- suggested boxes
- tags

### Bundle Card

This is the chosen shape for composite content.

Shows:

- folder-style visual container
- title
- `内含 N 项`
- 1 to 2 representative preview hints
- suggested boxes
- tags

Behavior:

- does not expand fully in the inbox grid
- opens into a detail view or modal for internal inspection

## Sorting Assistance

The app should provide guidance without forcing classification.

### Visible Signals On Every Card

- suggested boxes: 1 to 3
- tags and keywords
- content type badge
- quick action for the top suggestion

### Suggestion Sources

First version should combine:

- rule-based hints
  - source host
  - file type
  - keywords
  - existing tags
- lightweight adaptive hints
  - repeated user sorting behavior for similar content

The system should not attempt opaque full automation in version 1. User actions remain the ground truth.

## Interaction Design

### Placement

- drag card to box
- click primary suggestion to place instantly
- click secondary suggestions when needed

### After Placement

- default behavior: item disappears from `未整理`
- recovery behavior: a toggle reveals already-sorted items
- correction behavior: item can be moved to another box later

### Box Feedback

Boxes must visibly react during drag:

- highlight on hover
- clear drop target state
- short completion feedback after successful placement

## Data Model Direction

The current `Inspiration` model can evolve incrementally instead of being replaced.

Needed additions or adaptations:

- explicit inbox state vs sorted state
- box entity
- item-to-box relation
- saved suggestion metadata
- optional sort history for future adaptive ranking

A pragmatic first version can keep one primary box per item and add more flexible relationships later if needed.

## Page Structure

### Main Screen

- left: box rail
- top center: quick capture bar
- center: inbox grid
- optional right-side overlay or modal for bundle inspection

### Detail Layer

Details should stay secondary.

The main screen must support most sorting operations without forcing the user into a form-heavy edit screen.

## Error Handling

- failed uploads should remain local to the capture flow and show a clear inline error
- failed suggestions should not block saving; cards can still enter `未整理`
- moving an item to a box should be reversible
- incomplete metadata should degrade gracefully instead of showing broken layouts

## Testing Strategy

The implementation plan should cover:

- model tests for box placement and inbox visibility
- route tests for capture, suggestion, place, and move flows
- UI behavior checks for type-specific rendering branches
- regression tests for bundle-card handling
- tests that confirm failed suggestions do not break capture

## Scope

### In Scope For The First Build

- workbench-style main screen
- inbox-first workflow
- flat themed boxes
- drag/drop and one-click placement
- type-specific cards
- bundle card
- visible box suggestions and tags
- show/hide already-sorted items

### Explicitly Out Of Scope For The First Build

- nested box systems
- fully autonomous AI categorization
- mobile client
- desktop packaging shell
- advanced cross-device sync

## Recommendation

Build this in two implementation phases:

1. deliver the workbench UI shape, box model, and manual sorting flow first
2. layer in lightweight suggestion ranking once the sorting loop feels correct

This keeps the product centered on the user's judgment while still making the interface feel smart and fast.
