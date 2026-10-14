# Right Panel Selection and Orders

The three order groups on the Orders tab. The selected units are shown in the [selection panel](selection-panel.md).

## Purpose

Show which drafts are queued, and let the player select a queued order's unit or cancel the order from the list.

## Availability

Shown on the right panel's Orders tab while the panel is expanded. The player can use the lists in Strategic planning and Tactical planning, and they follow the active theater. While the tactical battles list is open, the lists stay visible while the panel is expanded and do not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md). In New game and Game over the panel is absent, so these lists are absent with it.

## Information Displayed

- Three groups, each with a heading and the number of orders in it: "Movement", "Ranged attacks", and "Air strikes". An empty group shows "None".
- Each row shows the unit's name on its first line. Its second line shows an arrow, the target hex's code, a dot, and the distance in hexes, for example "→ E5 · 1h". A ferry adds "· Ferry". An air strike adds its target type as the target-type list names it, for example "→ GK · 2h · Airports". In a battle the code names the battle cell, for example "→ E8.K3 · 2h". A code or a distance that cannot be found shows "?". The codes are the ones the [hex tooltip](hex-tooltips.md) shows in parentheses (`orderTargetHexCode` in `src/shared/orderTargetHexCode.ts`). A strategic march's distance is the hexes its route has left.
- A row whose unit is selected is highlighted and marked with a gold dot.
- Each row ends with a cancel control (×).

Each row's unit name is preceded by the unit's origin flag, under the same rules as the [stack callout](stack-callout.md), including a battle unit using the strategic unit it came from. A unit with no recorded origin shows no flag.

Strategic movement rows include standing movement and ferries. Tactical movement rows include pending marches and ferries. Sealift assignments are not pending orders and are not listed. See [order-lifecycle.md](order-lifecycle.md).

## Inputs and Responses

### Mouse

- When the player clicks a row, a plain click calls `replaceSelection` with that row's unit, and Shift toggles it. See [selection-model.md](selection-model.md).
- When the player clicks a row's cancel control, that order is removed and the list refreshes. Other orders stay.

### Keyboard

- None.

### Other

- The lists refresh when a draft is added, cancelled, committed, stashed, or restored.
- The row highlight follows every selection change, including one made on the map.
- The header's subtitle and the Orders tab's count follow the lists. See [right-panel.md](right-panel.md).
- The [selection panel](selection-panel.md) shows each selected unit's order with the same words, read from these lists.

## States

- Empty group: the group shows "None" and the count 0.
- Rows present: one row per queued order of that kind.
- Row selected: the row's unit is in the current selection; the row is highlighted and marked with a gold dot.

## Invariants

- Cancel on one row never removes a different unit's order.
- An empty group never hides its heading. It shows "None".
- A group's count always equals its number of rows.
- Strategic drafts are not shown in these lists during Tactical planning. They return when the battle ends.
- Every draft that the next Ready will submit has a row in one of these lists.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Movement rows | Standing movement and ferries | Battle marches and ferries |
| Target codes | World hex, such as `E5` | Battle cell, such as `E8.K3` |
| Ranged and air rows | Strategic drafts | Battle drafts |
| After Ready | Submitted drafts clear | Submitted drafts clear, and march continuations can return |

## Related Documents

- [right-panel.md](right-panel.md)
- [selection-panel.md](selection-panel.md)
- [order-lifecycle.md](order-lifecycle.md)
- [selection-model.md](selection-model.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#pending-orders-list`, `#pending-orders-count`, `#ranged-attacks-list`, `#ranged-attacks-count`, `#air-strikes-list`, `#air-strikes-count`)
- `static/consoleChrome.css`
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/gameplay/sidebarOrderRow.ts`
- `src/renderer/gameplay/queuedOrderRows.ts`
- `src/renderer/core/unitOriginFlags.ts`
- `src/renderer/gameplay/orderLabelFormatting.ts`
- `src/shared/orderRowDetail.ts`
- `src/shared/orderTargetHexCode.ts`
- `src/shared/pendingMovementSidebarLabels.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/core/uiState.ts` (`updateSidebar`)
