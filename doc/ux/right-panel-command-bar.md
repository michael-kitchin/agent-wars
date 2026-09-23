# Right Panel Command Bar

The game-state readout and the Ready, Ranged, and air-strike controls.

## Purpose

Show whose turn it is and give the player the buttons that end the turn or start a targeted order.

## Availability

Shown with the right panel. Ready, Ranged, and the air-strike controls follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. They are disabled or hidden in New game, Game over, and Tactical annihilation as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The heading "Selected hex".
- Game state: "Phase:" and "Turn:". With no match loaded, both lines are an em dash. Outside a battle, the phase line shows the strategic phase label and the turn line shows the strategic turn. While a battle is active, the phase line shows the tactical phase: "Phase: Tactical planning" while the player drafts a beat, and "Phase: Tactical resolution" while a beat resolves or plays back. The turn line shows the tactical turn.
- The Ready button. Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running.
- The Ranged control. Its label is "Ranged", "Cancel", or "Strike".
- While Strike targeting is on, a target-type choice: Enemy Units, Production, Airports, or Seaports, and a Cancel button for that targeting.

## Inputs and Responses

### Mouse

- When the player clicks Ready, the turn or the battle beat resolves, unless Ready is disabled. Disabled cases are in [modes-and-transitions.md](modes-and-transitions.md).
- When the player clicks Ranged, ranged targeting turns on and the label becomes Cancel. Clicking Cancel turns it off.
- When the player clicks Strike, strike targeting turns on, the Strike label hides, and the target-type choice and its Cancel button show. That Cancel turns strike targeting off and shows Strike again.
- When the player changes the target type, later strike clicks use that type.

### Keyboard

- None.

### Other

- The Ranged control hides when the selection is empty, mixed, or not entirely capable. See [selection-model.md](selection-model.md).
- A failed target click shows an error toast and keeps targeting on. The label stays Cancel for Ranged, and the target-type choice and its Cancel stay shown for Strike. See [order-lifecycle.md](order-lifecycle.md).

## States

- Ready enabled: the player may end the turn or beat.
- Ready disabled: game over, AI wait, deferred consultation, a Ready request in flight, or the annihilation dialog.
- Ranged hidden: the selection is empty, mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater.
- Ranged showing "Ranged" or "Cancel": every selected unit can make a direct ranged attack.
- Strike showing: every selected unit is air. Strike targeting replaces that label with the target-type choice and Cancel.

## Invariants

- Ready never uses the AI wait label unless Run is on and opponent orders are not ready.
- The target-type choice is never shown unless strike targeting is on.
- Strategic infantry never shows Ranged. Tactical infantry can.
- A failed target click never turns targeting off.
- During a battle, the phase line and the turn line never describe different theaters.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Turn line | Strategic turn | Tactical turn |
| Ready | Resolves the strategic turn | Commits the battle beat |
| Ranged | Types that can fire on the strategic map | Types that can fire in a battle, including infantry |
| Phase line | Strategic phase | Tactical planning or Tactical resolution |

## Related Documents

- [right-panel.md](right-panel.md)
- [selection-model.md](selection-model.md)
- [order-lifecycle.md](order-lifecycle.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [combat rules](../combat-rules-v3.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#sidebar-phase`, `#sidebar-turn`, `#ready-btn`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`)
- `src/renderer/gameplay/readyHandler.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/shared/selectionSupportButtonMode.ts`
