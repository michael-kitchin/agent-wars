# Selection Panel

The panel at the map's bottom-left that describes the selected units, their hex, and their orders.

## Purpose

Show what the player has selected, where it stands, and what it has been told to do, next to the map the player is working on, and hold the reticle that aims that selection's ranged attack, air strike, or missile launch.

## Availability

Shown in Strategic planning, Resolution playback, and Tactical planning while at least one of the player's units is selected. Hidden while nothing is selected, and hidden for the whole New game and Game over overlay. While the tactical battles list is open, and in Tactical annihilation, the panel stays as it was and does not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- Two states. Compact: the summary bar alone. Expanded: the summary bar on top and the details under it. The app opens compact (`src/renderer/gameplay/selectionPanelExpand.ts`).
- A summary bar, one 50 px row across the top of the panel in both states, that never scrolls. From left to right:
  - The expand control, the bar's full height and 32 px wide, with a chevron that points up while the panel is compact and down while it is expanded.
  - Two lines of text. Each ends in an ellipsis when it does not fit, and the controls beside them keep their size.
  - The first line: the hex code of the first selected unit's hex in parentheses, such as "(D4)", then " · " and "N selected of M". N is the number of selected units in that hex, and M is the number of the player's units there that can be selected (`summarizeSelectionPanel` in `src/shared/selectionPanelSummary.ts`). An embarked land unit cannot be selected. When exactly one unit is selected, its origin flag and name take the place of the count. When selected units also stand in other hexes, the line ends with " · +K elsewhere", where K counts them (`selectionElsewhereText` in `src/shared/selectionBarText.ts`). In a battle the code names the battle cell, such as "(E8.K3)". A code that cannot be found shows "?".
  - The second line, a hint for the next map gesture (`selectionBarHint` in `src/shared/selectionBarText.ts`). The first that applies: "Playback is running · right-click to deselect" while a turn or a battle beat plays back; "Double-click a target in range" while Ranged, Strike, or Launch targeting is on; "Missiles can't move · right-click to deselect" when every selected unit is a missile; "Missiles can't move with other units" when missiles are selected with other types; "Double-click a hex to ferry · right-click to deselect" when every selected unit is air; "Air units can't move with other units" when air units are selected with other types; otherwise "Double-click a hex to move · right-click to deselect".
  - A divider, then the air-strike target list, then the reticle, while a strike is aimed. The list is hidden otherwise, and the reticle stays next to the close control. See [console-command-bar.md](console-command-bar.md).
  - The close control, an ×, the bar's full height and 32 px wide, with a divider on its left: the expand control's mirror on the right edge.
- The details, under the bar, shown only while the panel is expanded:
  - That hex's caption, the same naming line the [hex tooltip](hex-tooltips.md) shows, with its flags. It appears once its lookup returns.
  - Chips describing that hex, in this order, each only when it applies:
    - The terrain kind, with the map key's swatch.
    - The weather, with its icon, while the weather bonus is on and the hex's weather is known.
    - The tech tier of units built there, Basic or Advanced with its icon, while the tech bonus is on and the hex can produce units. Not shown in a battle.
    - The production the hex adds each turn, such as "$94/turn", when it has urban cells and is not on the neutral border. Not shown in a battle.
    - "Home" in the viewer's home. "{short name} home" in another seat's home, for example "W. Turkey home". "Neutral" on Neutral land that is not a home. Not shown in a battle. The words come from `formatHomeChip` in `src/shared/sideLabels.ts`.
  - One row per selected unit, in selection order. Each row shows the unit type's glyph, the unit's origin flag and name, and, for a unit in a different hex, that hex's code in parentheses. The row ends with the unit's queued order, in the same words as its row on the Orders tab, followed by a cancel control (×), or "No orders". See [orders-tab.md](orders-tab.md).
  - The reason a greyed-out reticle cannot be used, when one applies.
  - The sidebar error line, which stays hidden. See [notifications-and-feedback.md](notifications-and-feedback.md).
- While Ranged targeting is on, the panel's border is the ranged amber, while Strike targeting is on, the strike purple, and while Launch targeting is on, the missile crimson (`--order-ranged`, `--order-strike`, and `--order-missile` in `static/shellChrome.css`, from `data-aim` on `#selection-panel`). The pressed reticle's face takes the same color. Launch targeting draws no reach outline.
- A resize grip at the top-right corner, shown only while the panel is expanded. It sits over the close control's top-right corner, clear of the ×, so a press there resizes the panel and does not clear the selection.
- The panel opens 440 px wide, 12 px in from the map's left and bottom edges, and is never wider than the map minus 24 px; both states share that width. Compact, it is the bar's height. Expanded, its height fits the bar and the details, up to half the map's height; past that the unit rows scroll. When the panel is shorter than the bar, the caption, the chips, and one row, the details scroll as a whole. Where it overlaps the terrain legend, the map scale, the zoom buttons, or the minimap panel, it draws above them. Where it meets the update toast, the toast draws above the panel, so a wide toast on a narrow map can cover the close control. A click there hits the toast. See [notifications-and-feedback.md](notifications-and-feedback.md).
- Control tips for the expand control, the close control, the grip, and the reticle are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks the expand control, the panel switches between compact and expanded. Its bottom-left corner stays put, so expanding slides the bar up as the details open under it, and collapsing slides it back down, over 150 ms. When the system asks for reduced motion, the change is immediate. A click during a slide sends the panel back the other way from where it is.
- When the player clicks the close control, the selection clears exactly as a right-click on the map clears it. Queued orders stay. See [selection-model.md](selection-model.md).
- When the player clicks an order's cancel control, that order is cancelled exactly as its Orders tab row's cancel control does.
- When the player drags the grip, which shows only while the panel is expanded, the panel resizes. Its bottom-left corner stays put. The width stays from 400 to 640 px and the height from 140 px to the map's height minus 24 px (`clampSelectionPanelSize` in `src/shared/selectionPanelSize.ts`). A dragged width applies to both states. A dragged height applies while the panel is expanded and replaces the half-the-map limit.
- Clicks on a unit row do nothing else.

### Keyboard

- Enter or Space on the focused expand control switches the panel, as a click does. There is no other key.

### Other

- The panel follows every selection change, every snapshot, and every change to the queued orders. The hint and the border also follow Ranged and Strike targeting, and playback, as they start and stop (`renderSelectionBarState` in `src/renderer/gameplay/selectionBar.ts`).
- The state the player picks, compact or expanded, lasts until the app closes: across selection changes, while the panel is hidden, and in and out of battles. It is not saved. If the panel hides during a slide, it keeps the state the last click chose.
- A dragged size lasts until the app closes, including while the panel is hidden or compact. It is not saved.
- `aria-expanded` and the expand control's name and tip change on the click; the chevron turns when the slide ends.
- Moving the pointer onto the panel hides the hex tooltip, the effects tooltip, and the blocked tooltip.

## States

- Hidden: nothing is selected, or the new-game overlay is open.
- Compact: the summary bar alone. The app opens in this state.
- Expanded: the summary bar and the details, with the grip.
- One hex: every selected unit stands in the described hex.
- Several hexes: the first line ends with "+K elsewhere", and rows for units in other hexes show their hex code.
- Resized: the panel keeps the size the player dragged it to.

## Invariants

- The panel never shows while nothing is selected.
- An order shown in the panel always reads the same as its row on the Orders tab.
- The panel's close control never cancels a queued order.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Units | Strategic units | Battle sub-units |
| Codes on the first line | World hex, such as "(D4)" | Battle cell, such as "(E8.K3)" |
| Chips | Terrain, weather, tech tier, production, home | Terrain and weather |

## Related Documents

- [selection-model.md](selection-model.md)
- [console-command-bar.md](console-command-bar.md)
- [orders-tab.md](orders-tab.md)
- [map-surface.md](map-surface.md)
- [hex-tooltips.md](hex-tooltips.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#selection-panel`, `#selection-panel-grip`, `#selection-panel-bar`, `#selection-panel-expand`, `#sidebar-selected-unit`, `#selection-panel-hint`, `#air-strike-target-type`, `#ranged-attack-tip-host`, `#ranged-attack-btn`, `#selection-panel-close`, `#selection-panel-details`, `#selection-panel-caption`, `#selection-panel-chips`, `#selection-panel-units`, `#selection-panel-action-note`, `#sidebar-error`)
- `static/selectionChrome.css`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/renderer/gameplay/selectionBar.ts`
- `src/renderer/gameplay/selectionPanelExpand.ts`
- `src/renderer/chrome/panelSlideHelpers.ts` (`startPanelHeightSlide`: the 150 ms height slide and the reduced-motion rule)
- `src/shared/selectionBarText.ts`
- `src/renderer/gameplay/selectionPanelResize.ts`
- `src/shared/selectionPanelSummary.ts`
- `src/shared/selectionPanelSize.ts`
- `src/shared/orderTargetHexCode.ts`
- `src/renderer/gameplay/queuedOrderRows.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts` (`clearSelectionLikeRightClick`)
- `src/renderer/core/uiState.ts` (`updateSidebar`)
