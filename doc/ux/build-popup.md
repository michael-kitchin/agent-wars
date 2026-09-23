# Build Popup

The single-hex build queue, and the markers that open it.

## Purpose

Let the player queue unit production on one hex they control.

## Availability

Build markers appear in Strategic planning on explored hexes where the player can produce, once the map is zoomed in far enough to show them. They hide when the map is zoomed back out, and they hide again at battle-detail zoom, which also closes this popup. While the tactical battles list is open, markers and an open popup stay as they were and do not accept clicks. During Resolution playback, markers stay visible, but clicks on them and queue edits in an open popup are ignored until playback ends. The current code differs; see Known Deviations in [resolution-playback.md](resolution-playback.md). A hover order preview does not hide the markers, but a click does not open the popup while that preview is active. Clicking a marker opens this popup when one hex is selected. Two or more selected build hexes use [multi-hex-build-popup.md](multi-hex-build-popup.md) instead. The popup closes on its close control, on Escape, on a pointer press outside it and outside its marker, when the stack callout opens, and when a tactical battle starts. See [input-map.md](input-map.md) and [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The hex name or hex code, when that lookup succeeds.
- Production per turn, or none when the hex has no production.
- Queue cost and turns to complete, or none when the queue is empty. Turns show as unknown when they cannot be estimated. Costs and prerequisites are in the [combat rules](../combat-rules-v3.md). Per-side caps are in [game size and unit caps](../game-size-unit-caps.md).
- The title "Build Queue" when the hex can build.
- One row per queued entry: unit type, count, and a remove control.
- A Keep building checkbox when the queue can arm it.
- When the hex cannot build, the reason, or "This hex cannot build units."
- A hex the player does not control shows the production summary and no queue editor.

## Inputs and Responses

### Mouse

- When the player clicks a build marker without Shift, that hex becomes the only selected build hex and this popup opens. Clicking that same marker again while the popup is open closes it.
- When the player Shift-clicks a marker, that hex toggles in the build selection. Dropping to zero hexes closes the popup. Dropping to one hex returns to this popup. Adding a second hex switches to the multi-hex popup.
- When the player clicks the add control, a new queue row is added for the first available unit type.
- When the player changes a row's unit type or count, that row updates. A failure shows an error toast and leaves the previous queue.
- When the player clicks a row's remove control, that row is removed.
- When the player changes Keep building, that flag updates. A failure shows "Failed to update Keep building."
- When the player clicks the close control, the popup closes.

### Keyboard

- When the count field is focused, only digits and the usual edit keys are accepted. Other keys are ignored.
- Escape closes the popup, except while the tactical battles list is open. See [input-map.md](input-map.md).

### Other

- None.

## States

- Markers hidden: zoomed out, battle-detail zoom, New game, Game over, or Tactical planning. A hover order preview leaves the markers visible and ignores clicks.
- Popup closed: no build hex is being edited.
- Popup open: one build hex is selected and the editor or the cannot-build notice is showing.

## Invariants

- A hex the player does not control never accepts queue edits.
- A failed update never clears the rest of the queue.
- Shift-click never opens this popup for two hexes. Two hexes use the multi-hex popup.

## Strategic and Tactical Differences

Build markers and this popup are a strategic-planning surface. Entering Tactical planning closes the popup. The battle map does not open it.

## Related Documents

- [multi-hex-build-popup.md](multi-hex-build-popup.md)
- [map-surface.md](map-surface.md)
- [input-map.md](input-map.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [combat rules](../combat-rules-v3.md)
- [game size and unit caps](../game-size-unit-caps.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#build-entry-layer`, `#build-popup`, `#build-popup-body`)
- `src/renderer/gameplay/buildQueuePopup.ts`
- `src/renderer/gameplay/buildQueuePopupFormatting.ts`
- `src/renderer/gameplay/buildQueueKeepBuilding.ts`
- `src/renderer/gameplay/productionOverlayHelpers.ts`
- `src/renderer/map/initCore.ts`
