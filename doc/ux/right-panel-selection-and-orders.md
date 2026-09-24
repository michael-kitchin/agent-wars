# Right Panel Selection and Orders

The selected-unit readout and the three order lists.

## Purpose

Show which units are selected and which drafts are queued, and let the player select or cancel a queued order from the list.

## Availability

Shown with the right panel. The player can use the lists in Strategic planning and Tactical planning, and they follow the active theater. While the tactical battles list is open, the lists stay visible and do not receive pointer input. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- "Selected unit" and either an em dash, one unit name, or that name plus a count of the other selected units.
- "Movement orders". Each row names the unit and then shows the distance in hexes plus the status, target type, or `ferry`. An empty list shows "None".
- "Ranged attacks". Each row names the unit and then shows the distance in hexes plus the status, target type, or `ferry`. An empty list shows "None".
- "Air strikes". Each row names the unit and then shows the distance in hexes plus the status, target type, or `ferry`. An empty list shows "None".
- The sidebar error line, which stays hidden. Errors use the map toast only. See [notifications-and-feedback.md](notifications-and-feedback.md).

Strategic movement rows include standing movement and ferries. Tactical movement rows include pending marches and ferries. Sealift assignments are not pending orders and are not listed. See [order-lifecycle.md](order-lifecycle.md).

## Inputs and Responses

### Mouse

- When the player clicks a row's select control, a plain click calls `replaceSelection` with that unit, and Shift toggles it. See [selection-model.md](selection-model.md).
- When the player clicks a row's cancel control, that order is removed and the list refreshes. Other orders stay.

### Keyboard

- None.

### Other

- The lists refresh when a draft is added, cancelled, committed, stashed, or restored.

## States

- Empty list: the list shows "None".
- Rows present: one row per queued order of that kind.
- Row selected: the row's unit is in the current selection.

## Invariants

- Cancel on one row never removes a different unit's order.
- An empty list never hides its heading. It shows "None".
- Strategic drafts are not shown in these lists during Tactical planning. They return when the battle ends.
- Every draft that the next Ready will submit has a row in one of these lists.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Movement rows | Standing movement and ferries | Battle marches and ferries |
| Ranged and air rows | Strategic drafts | Battle drafts |
| After Ready | Submitted drafts clear | Submitted drafts clear, and march continuations can return |

## Related Documents

- [right-panel.md](right-panel.md)
- [order-lifecycle.md](order-lifecycle.md)
- [selection-model.md](selection-model.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#sidebar-selected-unit`, `#pending-orders-list`, `#ranged-attacks-list`, `#air-strikes-list`, `#sidebar-error`)
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/gameplay/orderLabelFormatting.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/core/uiState.ts`
