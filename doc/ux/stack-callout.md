# Stack Callout

The list of units in one hex.

## Purpose

Let the player see the units in a hex, including a single unit, and change which human units in that hex are selected.

## Availability

Opens in Strategic planning and Tactical planning after a click on a unit icon, including a single human unit, once a short delay elapses. A lone human unit that can be selected is still selected, or Shift-toggled, by that same click. An embarked land unit stays unselected. It does not open while a hover order preview is already active, while strategic units are hidden because the map is zoomed to battle detail, or during Resolution playback. The preview that starts because this click selected a unit on the hex under the pointer does not cancel the scheduled callout and does not close it after it opens. A later click while that preview is still active does not open the callout again. Moving the pointer onto another hex while a preview is active does close it. It also closes when the player dismisses it, presses Escape, clicks outside it, or starts a gesture that hides it. See [input-map.md](input-map.md) and [selection-model.md](selection-model.md).

## Information Displayed

- One row per unit in the hex, sorted by side, type, and name. Each row shows the unit name, preceded by the unit's country-of-origin flag for both human and enemy units. A battle unit shows the flag of the strategic unit it came from. A unit whose origin country is unknown shows a gray placeholder flag, and a unit with no recorded origin shows no flag.
- Hovering a unit flag shows a tooltip after the same short dwell as the hex tooltip, with two lines: `Origin: <country> (<XX>)` and `Terrain: <terrain>`. `<XX>` is the code of the world hex where the unit was built, including for an enemy unit, and it is omitted when that hex has no code. An unknown country reads `Origin: Unknown`, with the hex code in parentheses when there is one. `<terrain>` is the birth cell's terrain, the world hex's terrain when the unit has no birth cell, or `Unknown` when neither is known. When an origin bonus applies to the unit where it stands now, a third line reads `Bonus: +1 (country)`, `Bonus: +1 (terrain)`, or `Bonus: +1 (country, terrain)` ([combat rules §4.9](../combat-rules-v3.md)). The line is computed when the label is built, so it can lag one refresh behind a move. The tooltip hides when that flag is no longer visible.
- Human rows include a toggle that shows whether that unit is in the selection.
- When the hex has human units and Shift is not held, a "+ All" control selects the selectable human units.
- When Shift is held and the hex has human units, "+ All" adds them and "- All" removes them.
- A close control.
- A sealift section when the hex has a sealift action. See [order-lifecycle.md](order-lifecycle.md). Each fleet label carries the ship's origin flag. The embark option lists have no flags.

Enemy rows have no selection toggle.

## Inputs and Responses

### Mouse

- When the player clicks a human row's toggle, a plain click on an unselected row replaces the selection with that unit and closes the callout, a plain click on a selected row removes that unit, and Shift toggles the unit and leaves the callout open.
- When the player clicks "+ All" without Shift, the selectable human units in the hex become the selection.
- When Shift is held and the player clicks "+ All", those units are added. "- All" removes them.
- When the player clicks the close control, the callout closes.
- When the player presses outside the callout, it closes. A press on the same spot as the opening click is left for the double-click handler.

### Keyboard

- When the player presses Escape and the build popup is closed, the callout closes. A callout that is scheduled but not open yet is cancelled too. While the tactical battles list is open, Escape leaves the callout alone. See [input-map.md](input-map.md).

### Other

- Opening the callout closes the build popup and the hex tooltip.
- A double-click that plans an order cancels a scheduled callout. A double-click that does not plan an order still lets the scheduled callout open.

## States

- Scheduled: a click asked for the callout, and the delay has not elapsed.
- Open: the list is visible.
- Closed: hidden. This is the start state.

## Invariants

- Enemy units in the callout never become selected.
- Select-all and add-all both read "+ All". They are never shown at the same time: Shift decides which one is showing.
- The callout does not open while a hover order preview is already active. A preview of the hex the selected units already occupy, started by the click that opened the callout, does not cancel or close it. A later click while that preview remains active does not open the callout again.
- Embarked land units stay unselectable from the callout, the same as from the map.

## Strategic and Tactical Differences

The rows, All controls, and toggles work the same in both theaters. In Tactical planning the callout lists battle units. A sealift section can appear in either theater when that hex has sealift capacity. Changing a slot applies immediately in both theaters. In Tactical planning that change also drops pending marches for the units involved. At battle-detail zoom on the strategic map, the callout does not open.

## Related Documents

- [selection-model.md](selection-model.md)
- [input-map.md](input-map.md)
- [map-surface.md](map-surface.md)
- [order-lifecycle.md](order-lifecycle.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#stack-callout`, `#stack-callout-list`, `#unit-origin-tooltip`)
- `src/renderer/renderer.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/core/unitOriginFlags.ts`
- `src/renderer/core/unitOriginTooltip.ts`
- `src/renderer/rendering/canvasPreviewPolicy.ts`
- `src/shared/unitOriginTooltipText.ts`
