# Build Popup

The single-hex build queue, and the markers that open it.

## Purpose

Let the player queue unit production on one hex they control, and hire mercenaries on a hex that allows it.

## Availability

Build markers appear in Strategic planning on explored hexes where the player can produce, once the map is zoomed in far enough to show them. They hide when the map is zoomed back out, and they hide again at battle-detail zoom, which also closes this popup. While the tactical battles list is open, markers and an open popup stay as they were and do not accept clicks. During Resolution playback, markers stay visible, but clicks on them and queue edits in an open popup are ignored until playback ends. The exception is while playback shows dice chips: the markers hide so they don't cover the chips, and return when the chips fade. An open popup stays open. A hover order preview does not hide the markers, but a click does not open the popup while that preview is active. Clicking a marker opens this popup when one hex is selected. Two or more selected build hexes use [multi-hex-build-popup.md](multi-hex-build-popup.md) instead. The popup closes on its close control, on Escape, on a pointer press outside it and outside its marker, when the stack callout opens, and when a tactical battle starts. See [input-map.md](input-map.md) and [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The hex name or hex code, when that lookup succeeds. Country names in the hex name carry a small flag, the same as in the [hex tooltip](hex-tooltips.md).
- Tech, under the hex name, or under the hex code when the name lookup fails, when the tech bonus is on and that hex's original urban count can produce units. A small icon and the word Basic or Advanced name the tier of units that hex produces. A hex whose live production is none still shows that original tier. The line is omitted when the tech bonus is off or the hex produces no units. The rules are in [combat rules §4.9](../combat-rules-v3.md).
- Production per turn, labeled `Production (Build)`, marked with `PRODUCTION_CAPACITY_SYMBOL`, or none when the hex has no production. The multi-hex popup keeps the label `Production`.
- Queue cost, marked with `PRODUCTION_CAPACITY_SYMBOL`, and turns to complete, or none when the queue is empty. Turns show as unknown when they cannot be estimated. Costs and prerequisites are in the [combat rules](../combat-rules-v3.md). Per-side caps are in [game size and unit caps](../game-size-unit-caps.md).
- The title "Build Queue" when the hex can build.
- One row per queued entry: unit type, count, and a remove control. The type list is infantry, armor, naval, air, and missile (`ALL_BUILD_UNIT_TYPES`), and Fortification (`FORTIFICATION_QUEUE_ITEM`) while the hex still has an intact city cell (`getAvailableBuildQueueItemTypes`, intact count above 0). That includes a hex whose city cells are all already fortified. A missile row is offered only when the hex meets that type's urban gate (`buildMinimumUrbanCells`). On the global map that gate is the Advanced count, 21. One fortification item fortifies one cell that is not yet fortified, at `fortificationCostPerCell()`. When none of those remain, the queue pauses and Keep building stays on. Fortification has no cap. Credits (`CREDITS_QUEUE_ITEM`, label `CREDITS_QUEUE_ITEM_LABEL`) is in that list when the hex has urban production. It costs `creditsItemCost()` production points and adds `CREDITS_PER_ITEM` (20) credits on every map. It has no cap. When the queue is paused because the hex is outside the home and holds none of the seat's units or fortifications, the popup shows that pause and the queue does not spend. Keep building stays on.
- A hex that can both build and hire opens on Build and Hire tabs (`BUILD_TAB_LABEL`, `HIRE_TAB_LABEL` in `src/shared/mercenaryRules.ts`). The Hire tab also stays when no raise fits one unit, so the shortage sentence remains visible (`hireAvailable`). The choice is remembered for that hex. A hex that can only hire opens the Hire panel with no Build tab. Hire markers (`hireEntryHexesForHuman`) appear at the same zoom as build markers, on explored hexes in the human snapshot's `hireHexes` that are not build hexes, and only those near the view (`HIRE_ENTRY_VIEW_MARGIN_PX`). A hire-only marker (`hire-entry-btn`) sits at the hex center, and uses the build button's lower band (`computeStrategicOverlayTextY`) when that hex has visible units or a visible airport or seaport glyph. Holding T does not move an empty hire-only marker. A hire marker's button text is that production figure only. Its tip is `Hire Units`. A build marker's tip is `Build/Hire Units` when that hex is in the human hire set, and `Build Units` otherwise.
- The Hire panel shows the hex name, then Tech when the build panel would show it, then `Production (Hire)` when raising is available. There is no Credits line, no Upkeep line, and no Hire orders line. Each shown amount is a bold label, and a 0.5em gap follows each shown line. `Production (Hire)` is the production symbol and the amount still available (`formatRaiseCapacityValue`), and it is omitted when the raise row is hidden. Tips are in [control-tooltips.md](control-tooltips.md).
  - The raise controls are a type list, a count, and a Hire button, with no Raise heading. They appear only when one type fits at count 1 on both remaining production and the balance (`oneUnitRaiseShortage` returns null), and the list contains only those types.
  - When no type fits, the panel shows `raiseShortage` in place of those controls: `All credits allocated.` when some type fits the capacity left and none fit the balance, `All production capacity allocated.` when some type fits the balance and none fit the capacity left, and `All credits and production capacity allocated.` when none fits both (`oneUnitRaiseShortage`). The sentence `Your orders here already use this turn's raise capacity.` is not shown.
  - When a type fits at count 1, no shortage sentence shows until Hire is clicked with a type and count that `hireShortageLabel` rejects. That click shows `Not enough credits.`, `Not enough production capacity.`, or `Not enough credits or production capacity.`, and does not add the order. Changing the type or the count clears that sentence.
  - Neutral units that can be rehired follow, under `Neutral Units` (`REHIRE_SECTION_TITLE`), then this turn's orders, each with its heading. The orders heading is `Hire Queue`, with a 0.5em gap above it and after each order row. A pending raise is the count, the type, and the price. A pending rehire is the unit name and the price in one phrase. A Neutral unit row uses that same phrase (`formatHireOrderLabel` in `src/shared/mercenaryRules.ts`), after the origin flag.
  - A raise price is `(⚒N + ¤M/turn)` when the fee equals one turn of upkeep. A rehire price is `(¤E + ¤M/turn)`, where E is only the amount above that one turn.
  - A blocked hex shows any other reason. The sentence `Mercenaries can be raised only where no other side has units.` (`RAISE_REASON_OCCUPIED`) is not shown. A refused raise still returns that reason. When the hire view cannot be loaded, the panel shows `HIRE_VIEW_FAILED` ("Hiring information could not be loaded.") and a close control.
- A Keep building checkbox when the queue can arm it.
- When the hex cannot build, the reason, or "This hex cannot build units."
- A hex the player does not control shows the production summary and no queue editor.
- Control tips for a build marker, the queue controls, Keep building, the close control, each row's remove control, and the Build and Hire tabs are in [control-tooltips.md](control-tooltips.md).
- The popup opens `TOOLTIP_OFFSET_PX` (12) below and to the right of the click, then shifts so it stays inside the window (`placeAnchoredPopup`). It may cover the top bar, the console, or the minimap. A popup taller or wider than the window sits against the top and left and may still be clipped. Growing the queue, or switching between Build and Hire, moves it again without hiding it.

## Inputs and Responses

### Mouse

- When the player clicks a build marker without Shift, that hex becomes the only selected build hex and this popup opens. Clicking that same marker again while the popup is open closes it.
- When the player Shift-clicks a build marker, that hex toggles in the build selection. Dropping to zero hexes closes the popup. Dropping to one hex returns to this popup. Adding a second hex switches to the multi-hex popup. Shift on a Hire marker, or on a build marker while a Hire popup is open, acts as a plain click. A Hire hex is never part of a selection of two or more.
- Hire, a raise count, a rehire row, and an order's remove control call `placeHireOrder` or `removeHireOrder`. A failure shows that reason. Success refreshes the panel. Playback ignores those clicks.
- When the player clicks the add control, a new queue row is added for the first available unit type.
- When the player changes a row's unit type or count, that row updates. A failure shows an error toast and leaves the previous queue.
- When the player clicks a row's remove control, that row is removed.
- When the player changes Keep building, that flag updates. A failure shows "Failed to update Keep building."
- When the player clicks the close control, the popup closes.

### Keyboard

- When the count field is focused, only digits and the usual edit keys are accepted. Other keys are ignored.
- Escape closes the popup, except while the tactical battles list is open. See [input-map.md](input-map.md).

### Other

- A confirmed dismiss refreshes an open Hire tab (`refreshGameStateAfterMercenaryDismiss`). A unit that became Neutral is offered for rehire when the existing rehire rules allow it, and that order still fills at the end of the turn. A loaded ship and a unit aboard a ship are not offered. See [selection-panel.md](selection-panel.md).

## States

- Markers hidden: zoomed out, battle-detail zoom, New game, Game over, Tactical planning, or while Resolution playback shows dice chips. A hover order preview leaves the markers visible and ignores clicks.
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
- `src/shared/fortificationRules.ts` (`FORTIFICATION_QUEUE_ITEM`, `FORTIFICATION_QUEUE_ITEM_LABEL`)
- `src/main/productionRules.ts` (`getAvailableBuildQueueItemTypes`)
- `src/renderer/chrome/controlTooltipText.ts` (`KEEP_BUILDING_FORTIFICATION_NOTE`)
- `src/shared/anchoredPopupPlacement.ts` (`placeAnchoredPopup`)
- `src/renderer/chrome/placeAnchoredPopup.ts` (`placeOpenBuildPopup`)
- `src/shared/queueItemTooltipText.ts` (`queueItemTooltipText`)
- `src/shared/popupControlTooltipText.ts`
- `src/renderer/gameplay/buildQueuePopupFormatting.ts`
- `src/renderer/gameplay/buildQueueKeepBuilding.ts`
- `src/renderer/gameplay/productionOverlayHelpers.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/gameplay/buildHirePopup.ts` (`renderBuildOrHirePopupIntoMount`)
- `src/renderer/gameplay/hirePanel.ts`
- `src/shared/economySymbols.ts` (`PRODUCTION_CAPACITY_SYMBOL`, `CREDITS_SYMBOL`, `formatCompactHireCost`, `formatCompactRaiseCost`)
- `src/renderer/gameplay/hireEntryMarkers.ts`
- `src/main/ipc/mercenaryIpcHandler.ts` (`getHexHireView`, `placeHireOrder`, `removeHireOrder`)
- `src/renderer/core/stateSnapshot.ts` (`refreshGameStateAfterMercenaryDismiss`)
