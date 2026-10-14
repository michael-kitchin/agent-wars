# Selection Panel

The panel at the map's bottom-left that describes the selected units, their hex, and their orders.

## Purpose

Show what the player has selected, where it stands, and what it has been told to do, next to the map the player is working on, and hold the Ranged and Strike controls for that selection.

## Availability

Shown in Strategic planning, Resolution playback, and Tactical planning while at least one of the player's units is selected. Hidden while nothing is selected, and hidden for the whole New game and Game over overlay. While the tactical battles list is open, and in Tactical annihilation, the panel stays as it was and does not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- A header with the hex code of the first selected unit's hex in parentheses, such as "(D4)", then that hex's caption, the same naming line the [hex tooltip](hex-tooltips.md) shows, with its flags. In a battle the code names the battle cell, such as "(E8.K3)". The caption appears once its lookup returns; until then the header shows the code alone.
- A close control (×) at the header's right.
- Chips describing that hex, in this order, each only when it applies:
  - The terrain kind, with the map key's swatch.
  - The weather, with its icon, while the weather bonus is on and the hex's weather is known.
  - The tech tier of units built there, Basic or Advanced with its icon, while the tech bonus is on and the hex can produce units. Not shown in a battle.
  - The production the hex adds each turn, such as "$94/turn", when it has urban cells and is not on the neutral border. Not shown in a battle.
  - "Home" in the player's home region, or "Enemy home" in the opponent's. Not shown in a battle.
- A count line, "N selected of M": N is the number of selected units in that hex, and M is the number of the player's units there that can be selected (`summarizeSelectionPanel` in `src/shared/selectionPanelSummary.ts`). An embarked land unit cannot be selected.
- One row per selected unit, in selection order. Each row shows the unit type's glyph, the unit's origin flag and name, and, for a unit in a different hex, that hex's code in parentheses. The row ends with the unit's queued order, in the same words as its row on the Orders tab, followed by a cancel control (×), or "No orders". See [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md).
- The sidebar error line, which stays hidden. See [notifications-and-feedback.md](notifications-and-feedback.md).
- The Ranged and Strike controls. See [right-panel-command-bar.md](right-panel-command-bar.md).
- The panel is 400 px wide, 12 px in from the map's left and bottom edges. Its height fits its rows, up to half the map's height; past that the unit rows scroll. Where it overlaps the terrain legend or the map scale, it draws above them.
- A control tip for the close control is in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks the close control, the selection clears exactly as a right-click on the map clears it. Queued orders stay. See [selection-model.md](selection-model.md).
- When the player clicks an order's cancel control, that order is cancelled exactly as its Orders tab row's cancel control does.
- Clicks on a unit row do nothing else.

### Keyboard

- None.

### Other

- The panel follows every selection change, every snapshot, and every change to the queued orders.
- Moving the pointer onto the panel hides the hex tooltip, the effects tooltip, and the blocked tooltip.

## States

- Hidden: nothing is selected, or the new-game overlay is open.
- One hex: every selected unit stands in the described hex.
- Several hexes: rows for units in other hexes show their hex code.

## Invariants

- The panel never shows while nothing is selected.
- An order shown in the panel always reads the same as its row on the Orders tab.
- The panel's close control never cancels a queued order.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Units | Strategic units | Battle sub-units |
| Codes | World hex, such as "(D4)" | Battle cell, such as "(E8.K3)" |
| Chips | Terrain, weather, tech tier, production, home | Terrain and weather |

## Related Documents

- [selection-model.md](selection-model.md)
- [right-panel-command-bar.md](right-panel-command-bar.md)
- [right-panel-selection-and-orders.md](right-panel-selection-and-orders.md)
- [map-surface.md](map-surface.md)
- [hex-tooltips.md](hex-tooltips.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#selection-panel`, `#sidebar-selected-unit`, `#selection-panel-close`, `#selection-panel-chips`, `#selection-panel-count`, `#selection-panel-units`, `#sidebar-error`)
- `static/selectionChrome.css`
- `src/renderer/gameplay/selectionPanel.ts`
- `src/shared/selectionPanelSummary.ts`
- `src/shared/orderTargetHexCode.ts`
- `src/renderer/gameplay/queuedOrderRows.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts` (`clearSelectionLikeRightClick`)
- `src/renderer/core/uiState.ts` (`updateSidebar`)
