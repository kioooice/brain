# Desktop Floating Ball Simple Mode Design

## Goal

Replace the current always-on-top simple-mode strip entry with a draggable floating ball. Entering simple mode should show only the floating ball. Clicking the ball expands the existing simple-mode panel in its current fixed sidebar position. Clicking the same affordance again collapses back to the floating ball. Exiting simple mode returns to the normal main window.

## State

- Keep `panelState.simpleMode` as the top-level mode switch.
- Add `panelState.simpleModeView` with values `ball` or `panel`.
- Add persisted floating-ball bounds so the ball reopens where the user last dragged it.
- Keep the existing fixed simple-panel bounds logic for the expanded panel.

## Window Behavior

- `main`: existing normal desktop window.
- `simple-ball`: frameless, always-on-top, draggable floating ball window.
- `simple-panel`: existing simple-mode strip window, still always-on-top, still anchored to the fixed simple-mode position.
- Switching `main -> simple` starts in `simple-ball`.
- Switching `simple-ball -> simple-panel` ignores ball position and uses the fixed simple-panel bounds.
- Switching `simple-panel -> simple-ball` restores the saved floating-ball bounds, clamped to the active display work area.
- Switching `simple -> main` resets `simpleModeView` to `ball` for the next entry.

## Renderer Behavior

- In simple mode with `simpleModeView = ball`, render only a floating-ball control.
- In simple mode with `simpleModeView = panel`, render the current simple-mode box rail and footer actions, except the always-on-top toggle is removed because the floating-ball mode is always-on-top by definition.
- The ball click toggles between `ball` and `panel`.
- Existing simple-mode paste-to-selected-box behavior stays active only in `panel`.

## Error Handling

- If saved floating-ball bounds are off-screen, clamp them into the nearest display work area.
- If no saved floating-ball bounds exist, place the ball at the bottom-right of the active display.

## Testing

- Store tests for `simpleModeView` defaults and reset behavior.
- Window-bounds tests for ball default placement and bounds clamping.
- Renderer tests for ball-only render, expand, and collapse behavior.
- App-level regression test to ensure simple-mode image paste still targets the highlighted box only in panel view.
