# Box Management Panel Design

## Goal

Add lightweight box management to the pocket workbench without changing its main navigation model.

The user should still click a box in the left rail to open and browse that box. Once a box is open, they can enter a small management panel to:

- rename the box
- change the box color
- move the box up or down in the rail
- delete the box and all cards inside it

This feature should feel like an in-context enhancement to the current workbench, not a separate admin screen.

## Product Shape

The existing workbench interaction stays intact:

- left rail click opens a box
- main area shows that box's contents
- box management is secondary and only appears for the currently opened box

The new management entry point lives in the selected box header area. It opens a small overlay panel rather than navigating to a new page.

## Primary Workflow

1. The user clicks a box in the left rail.
2. The app shows that box's content in the main workbench area.
3. The user clicks `管理这个盒子`.
4. A compact management panel opens for the selected box.
5. The user can:
   - edit name
   - edit color
   - edit description
   - move the box up
   - move the box down
   - delete the box
6. Save and move actions refresh the page and keep the user in the current workbench flow.
7. Delete requires an explicit confirmation because it also deletes all cards in that box.

## Interaction Design

### Entry Point

When a box is selected, the main header for that box gains a `管理这个盒子` button.

This avoids changing the left rail behavior and keeps box browsing as the primary click path.

### Management Panel

The panel should reuse the app's current light overlay style so it feels native to the existing quick-capture and new-box flows.

The panel contains:

- box name input
- box color input
- description input
- `上移` button
- `下移` button
- danger-zone delete action

### Save Behavior

For this version, successful changes should reload the page instead of trying to do partial DOM patching.

This keeps the implementation simpler and safer while preserving the current user context through URL parameters such as `box_id` and `show_sorted`.

### Delete Behavior

Deleting a box removes:

- the box record
- every inspiration assigned to that box
- uploaded files belonging to those deleted inspirations

Delete must use a confirmation step with clear language that the cards will also be deleted.

## Data Model Direction

No schema redesign is needed. The current `Box` and `Inspiration` relationship already supports box ownership.

Required behavior additions:

- update a box's editable fields
- move a box by changing `sort_order`
- delete a box and cascade delete its assigned inspirations in application logic
- clean up uploaded files for deleted inspirations

Application-level delete handling is preferred over database cascade behavior because file cleanup must happen together with record deletion.

## API Design

### Update Box

`PUT /api/boxes/<id>`

Request body:

- `name`
- `color`
- `description`

Rules:

- name cannot be blank
- name must remain unique

Response returns the updated box payload.

### Move Box

`POST /api/boxes/<id>/move`

Request body:

- `direction` with `up` or `down`

Rules:

- first box cannot move up
- last box cannot move down
- invalid directions return a readable error

Move works by swapping `sort_order` with the adjacent box.

### Delete Box

`DELETE /api/boxes/<id>`

Behavior:

- find all inspirations in the box
- delete any uploaded files for those inspirations
- delete the inspirations
- delete the box

Response returns success plus a deleted item count.

## Route And Template Changes

### Routes

The main index route should expose enough context for the selected box header to render the new management entry point.

New route handlers should be added for:

- box update
- box move
- box delete

### Templates

`templates/index.html` should gain:

- a visible `管理这个盒子` button when `selected_box` exists
- a box management overlay panel
- inline status text for box-management errors
- client-side handlers that call the new APIs and then reload the page

The left rail itself should not change from browse-first behavior.

## Error Handling

- blank box names return a 400 error
- duplicate box names return a 400 error
- moving beyond the top or bottom returns a 400 error
- deleting a missing box returns a 404 error
- file cleanup failures should not leave partial database state; the delete flow should complete atomically as much as practical inside the request

If an API call fails, the panel should show a readable inline error instead of silently failing.

## Testing Strategy

Add focused tests for:

- updating a box name and color
- rejecting blank names
- rejecting duplicate names
- moving a box up
- moving a box down
- rejecting invalid move directions
- rejecting out-of-range moves
- deleting a box deletes its inspirations
- deleting a box removes uploaded files for deleted inspirations
- selected-box view shows the management entry point

The implementation should continue using test-first changes for each new behavior.

## Scope

### In Scope

- management entry for the selected box
- rename box
- recolor box
- edit description
- move up and down
- destructive delete with confirmation
- delete cards inside the box
- uploaded-file cleanup on destructive delete

### Out Of Scope

- drag-sorting boxes
- bulk multi-box management screen
- soft delete or undo
- reassigning cards during delete
- editing boxes directly from the left rail

## Recommendation

Implement this in three small passes:

1. add box update and move APIs plus tests
2. add delete API with card and file cleanup plus tests
3. wire the selected-box management panel into the index page

This keeps the workbench stable while adding real management power exactly where the user needs it.
