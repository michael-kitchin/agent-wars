# Stack Callout

The list of units in one hex.

## Purpose

Let the player see the units in a hex and change which human units in that hex are selected. A plain click on a hex with exactly one stationary selectable human unit does not open this list.

## Availability

Opens in Strategic planning and Tactical planning after a plain click on a unit icon once a short delay elapses, except a hex with exactly one stationary selectable human unit. A plain click on an enemy-only token, an embarked-only token, or two or more stationary units still opens the list. A Shift-click on an icon whose hex has one selectable human unit does not open the list. Hovering that icon shows the unit's Bonuses tooltip instead of this list, as described under Information Displayed. A lone human unit that can be selected is still selected by a plain click on its icon, and Shift-toggled by a Shift-click. An embarked land unit stays unselected. The list does not open while a hover order preview is already active, while strategic units are hidden because the map is zoomed to battle detail, or during Resolution playback. The preview that starts because a stack click selected a unit on the hex under the pointer does not cancel the scheduled callout and does not close it after it opens. A later click while that preview remains active does not open the callout again. Moving the pointer onto another hex while a preview is active does close it. It also closes when the player dismisses it, presses Escape, clicks outside it, starts a gesture that hides it, or when the new-game overlay opens. See [input-map.md](input-map.md) and [selection-model.md](selection-model.md).

## Information Displayed

- One row per unit in the hex, sorted by side, type, and name. Each row shows the unit name, preceded by the unit's origin flag for both human and enemy units. In a match of three or more seats, a unit that is not the viewer's reads "{short side name} · {name}" (`formatUnitNameForViewer` in `src/shared/sideLabels.ts`). A two-seat match keeps the plain name. A Neutral unit uses that same plain name. On the global map the flag is the national flag of the birth country. On a regional map it is the subdivision flag when that origin's ISO 3166-2 code has a file, and otherwise the national flag of the origin's country. A battle unit shows the flag of the strategic unit it came from. A unit whose origin has no flag file shows a gray placeholder flag, and a unit with no recorded origin shows no flag.
- Hovering a unit flag, or the map token of a hex that holds one stationary unit, shows a tooltip one second after the pointer arrives. Moving on that flag or token does not start the wait again. The token hover does not open this list and does not select the unit. That tooltip hides when the pointer leaves the token. A token whose unit has no recorded origin keeps the hex tooltip. A stack token does not show that tooltip; the list still opens from a click. The flag tooltip appears on every surface that shows a unit flag, including loss toasts. The label beside the flag is unchanged, including a selected-unit count or a pending order. The tooltip hides when that flag is no longer visible.
  - The tooltip starts with `Unit:` and the same flag and display name shown beside the flag, then `DOB:` and the date that strategic unit was formed. After those lines, `mercenaryTooltipValue` may add bold `Mercenary:` (`MERCENARY_TOOLTIP_LABEL`). The current player's mercenary, the human seat from `findHumanSeat`, shows `formatMercenaryTooltipValue` (`¤N/turn`, `CREDITS_SYMBOL`). Another side's mercenary shows that side's short name (`abbreviatedSideName`), such as `N. America`. A Neutral unit shows `For Hire` (`MERCENARY_TOOLTIP_FOR_HIRE`) when `neutralUnitOfferedForRehire` accepts it: a hireable type, not aboard a ship, not carrying cargo, and not in a hex another side has fortified. A loss-toast flag has no Mercenary line. A missing name omits the Unit line, and a missing formation turn omits the DOB line. When any identity line is present, a blank line follows.
  - A global date reads `November, Year 3`, and a regional date reads `November 22nd, Year 1`. Opening units are formed on turn 1. A unit built when the turn resolves is formed on the following turn. A battle unit uses its parent unit's formation date.
  - The next line is `Bonuses:`. Origin, Terrain, and Weather lines follow, in that order, for each option selected for the match that this unit was born with. A Tech line follows Weather when the match tech bonus is on and the unit's tech tier is known, with that tier's icon and the word Basic or Advanced; it is omitted when the tier is missing or the tech bonus is off ([combat rules §4.9](../combat-rules-v3.md)). A selected option the unit does not have is omitted. When no bonus option is selected, or the unit has none of the selected bonuses, the block is `Bonuses:` and then `None`, with no category lines. The bonus lines do not change when the unit moves, and they do not say whether a bonus is active on the hex where it stands now.
  - Origin shows the birth area's flag and the place label. A country-level origin shows the country once. A subdivision shows the brief area name, then the country, as in Colorado, United States of America. That country is the English name of the origin's country code, not the birth cell's country. When that name is missing, the line is the brief area name alone. A unit with no birth area omits the line.
  - Terrain shows the birth terrain name, preceded by that kind's map-key swatch at flag size. Weather shows an icon and name for each acclimation tag, in the order snow, rain, heat. A unit with no birth terrain, or no tags, omits that line.
  - A destroyed unit keeps the same lines, with the weather tags it had.
- Human rows include a toggle that shows whether that unit is in the selection.
- When the hex has human units and Shift is not held, a "+ All" control selects the selectable human units.
- When Shift is held and the hex has human units, "+ All" adds them and "- All" removes them.
- A close control. Control tips for the close control, the row toggles, and the All controls are in [control-tooltips.md](control-tooltips.md).
- The callout opens `TOOLTIP_OFFSET_PX` (12) below and to the right of the click, then shifts so it stays inside the window (`placeAnchoredPopup`). It may cover the top bar, the console, or the minimap. A callout taller or wider than the window sits against the top and left and may still be clipped. Appending or removing the sealift section moves it again without hiding it.
- A sealift section when the hex has a sealift action. See [order-lifecycle.md](order-lifecycle.md). Each fleet label carries the ship's origin flag. The embark option lists have no flags. Control tips for a slot list and its debark button are in [control-tooltips.md](control-tooltips.md).

Enemy rows have no selection toggle.

## Inputs and Responses

### Mouse

- When the player clicks a human row's toggle, a plain click on an unselected row replaces the selection with that unit and closes the callout, a plain click on a selected row removes that unit and closes the callout, and Shift toggles the unit and leaves the callout open.
- When the player clicks "+ All" without Shift, the selectable human units in the hex become the selection and the callout closes.
- When Shift is held and the player clicks "+ All", those units are added. "- All" removes them.
- When the player clicks the close control, the callout closes.
- When the player presses outside the callout, it closes. A press on the same spot as the opening click is left for the double-click handler.

### Keyboard

- When the player presses Escape and the build popup is closed, the callout closes. A callout that is scheduled but not open yet is cancelled too. While the tactical battles list is open, Escape leaves the callout alone. See [input-map.md](input-map.md).

### Other

- Opening the callout closes the build popup and the hex tooltip.
- A confirmed dismiss refreshes an open list (`reloadAfterMercenaryDismiss`). A unit that became Neutral uses that plain name and has no select toggle. See [selection-panel.md](selection-panel.md).
- A double-click that plans an order cancels a scheduled callout. A double-click that does not plan an order still lets the scheduled callout open.

## States

- Scheduled: a click on a unit icon asked for the callout, and the delay has not elapsed.
- Open: the list is visible.
- Closed: hidden. This is the start state.

## Invariants

- Enemy units in the callout never become selected.
- Select-all and add-all both read "+ All". They are never shown at the same time: Shift decides which one is showing.
- A Shift-click on one selectable human unit does not schedule the callout. A Shift-click with two or more selectable human units, or with none, schedules it when a plain click on that icon would.
- A plain click on one stationary selectable human unit does not schedule the callout. A plain click on two or more stationary units, or on one unselectable unit, schedules it when the hover-preview and double-click rules allow.
- The callout does not open while a hover order preview is already active. A preview of the hex the selected units already occupy, started by the click that opened the callout, does not cancel or close it. A later click while that preview remains active does not open the callout again.
- Embarked land units stay unselectable from the callout, the same as from the map.

## Strategic and Tactical Differences

The rows, All controls, and toggles work the same in both theaters. In Tactical planning the callout lists battle units. A sealift section can appear in either theater when that hex has sealift capacity. Changing a slot or pressing debark applies immediately in both theaters. That change hides or shows the embarked unit's selection toggle on the open list, and a toggle that is shown again matches whether that unit is selected. The unit rows stay on screen while the sealift section is replaced. A rejected change restores the slot list to the cargo it showed before the click and shows an error toast. In Tactical planning a successful change also drops pending marches for the units involved. At battle-detail zoom on the strategic map, the callout does not open.

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
- `src/renderer/map/stackCallout.ts`
- `src/renderer/wiredEntryCallbacks.ts` (`reloadAfterMercenaryDismiss`)
- `src/shared/anchoredPopupPlacement.ts` (`placeAnchoredPopup`)
- `src/renderer/chrome/placeAnchoredPopup.ts` (`placeOpenStackCallout`)
- `src/shared/popupControlTooltipText.ts`
- `src/renderer/map/stackCalloutHost.ts`
- `src/renderer/map/stackCalloutSelectionToggles.ts`
- `src/renderer/map/stackCalloutSealift.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts`
- `src/shared/soleSelectableHumanUnit.ts`
- `src/renderer/map/singleUnitHoverCallout.ts`
- `src/shared/singleUnitHoverCallout.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/core/unitOriginFlags.ts`
- `src/shared/seatRoster.ts` (`findHumanSeat`)
- `src/shared/sideLabels.ts` (`abbreviatedSideName`)
- `src/renderer/core/unitOriginTooltip.ts`
- `src/renderer/rendering/canvasPreviewPolicy.ts`
- `src/shared/unitOriginTooltipText.ts`
- `src/shared/mercenaryRules.ts` (`MERCENARY_TOOLTIP_LABEL`, `MERCENARY_TOOLTIP_FOR_HIRE`, `formatMercenaryTooltipValue`, `mercenaryTooltipValue`, `neutralUnitOfferedForRehire`)
- `src/shared/economySymbols.ts` (`CREDITS_SYMBOL`)
- `src/shared/terrainSwatchHtml.ts`
- `src/shared/weatherIcons.ts`
- `src/shared/featureIconHtml.ts`
