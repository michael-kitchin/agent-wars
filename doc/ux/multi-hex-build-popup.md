# Multi-Hex Build Popup

The build queue editor used when several build hexes are selected together.

## Purpose

Apply one queue template to every selected build hex, and show which hexes can actually build each type.

## Availability

Opens in Strategic planning when two or more build hexes are selected. It stays build-only. A Hire marker is never part of that selection. Shift on a Hire marker, or on a build marker while a Hire popup is open, acts as a plain click. Selection rules are in [build-popup.md](build-popup.md): a plain click keeps one hex, and Shift-click adds or removes build hexes. Closing, Escape, and outside presses use the same rules as the single-hex popup. While the tactical battles list is open, an open popup stays as it was and does not accept clicks. During Resolution playback, queue edits are ignored until playback ends, the same as the single-hex popup.

## Information Displayed

- The selected hex codes.
- Tech, under the hex codes, when the tech bonus is on and at least one selected hex's original urban count can produce units. Each tier appears once, Basic then Advanced, with the same small icon and word as the [single-hex popup](build-popup.md). A hex that produces no units adds nothing. The line is omitted when the tech bonus is off or no selected hex produces units. The rules are in [combat rules §4.9](../combat-rules-v3.md).
- Production per turn for the selected hexes added together, under Tech when that line is shown and under the hex codes when it is not.
- A combined queue summary: cost and turns for the template as applied to those hexes.
- The title "Build Queue".
- One template row per queued entry. Each unit-type choice says whether it applies to all selected hexes, to one hex, or to a count of hexes. The types are infantry, armor, naval, air, and missile, Fortification while a selected hex still has an intact city cell, and Credits (`CREDITS_QUEUE_ITEM`) while a selected hex has urban production. A hex that does not meet the missile urban gate (`buildMinimumUrbanCells`) skips a missile row. A hex with no intact city cell skips a fortification row. A hex whose city cells are all already fortified still takes the row, and that queue pauses when it is spent. A hex with no urban production skips a credits row. Credits has no cap. It costs `creditsItemCost()` and adds `CREDITS_PER_ITEM` (20) on every map.
- A Keep building checkbox. It shows as checked only when every selected hex has Keep building on. It can be changed only when every selected hex can arm it.
- If the queues fail to load, "Failed to load build queues for the selected hexes." That failure shows no Tech line.
- Control tips for the queue controls, Keep building, the close control, and each row's remove control are in [control-tooltips.md](control-tooltips.md).
- The popup uses the same window placement as the [single-hex popup](build-popup.md). Growing the template moves it again without hiding it (`placeAnchoredPopup`).

Shared row editing is the same as [build-popup.md](build-popup.md). Costs and caps stay in the [combat rules](../combat-rules-v3.md) and [game size and unit caps](../game-size-unit-caps.md).

## Inputs and Responses

### Mouse

- When the player adds a template row, changes a type, changes a count, or removes a row, the template is written to every selected hex. A hex that cannot build a type skips that type.
- When the first extra hex is added, the template is seeded from the hex that was already open. If that seed fails, the new hex is not kept and an error toast says the template failed to load.
- When a further hex is added, the current template is applied to that hex.
- When the player changes Keep building, the flag is set or cleared on every selected hex.
- When the player clicks the close control, the popup closes.

### Keyboard

- Count fields accept the same keys as the single-hex popup.
- Escape closes the popup, except while the tactical battles list is open.

### Other

- None.

## States

- Open for two or more hexes: the template editor is showing.
- Dropped to one hex: the single-hex popup replaces this one and the template is cleared.
- Closed: no build hexes remain selected, or the player dismissed the popup.

## Invariants

- The template never claims a type is available on all hexes unless every selected hex can build it.
- Keep building is never shown as checked unless every selected hex has it on.
- A failed seed never leaves the failed hex in the selection.

## Strategic and Tactical Differences

This popup is strategic only. Tactical planning closes it with the rest of the build UI.

## Related Documents

- [build-popup.md](build-popup.md)
- [map-surface.md](map-surface.md)
- [combat rules](../combat-rules-v3.md)
- [game size and unit caps](../game-size-unit-caps.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#build-popup`, `#build-popup-body`)
- `src/renderer/gameplay/buildQueueMultiPopup.ts`
- `src/shared/anchoredPopupPlacement.ts` (`placeAnchoredPopup`)
- `src/renderer/chrome/placeAnchoredPopup.ts` (`placeOpenBuildPopup`)
- `src/shared/queueItemTooltipText.ts` (`queueItemTooltipText`)
- `src/shared/popupControlTooltipText.ts`
- `src/renderer/gameplay/buildQueuePopupFormatting.ts`
- `src/renderer/gameplay/buildQueueMultiSelect.ts`
- `src/renderer/gameplay/buildQueuePopup.ts`
- `src/renderer/gameplay/buildQueueKeepBuilding.ts`
- `src/main/productionRules.ts` (`getAvailableBuildQueueItemTypes`)
- `src/shared/fortificationRules.ts` (`FORTIFICATION_QUEUE_ITEM`)
- `src/shared/creditsRules.ts` (`CREDITS_QUEUE_ITEM`, `creditsItemCost`, `CREDITS_PER_ITEM`)
