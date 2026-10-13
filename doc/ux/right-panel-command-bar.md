# Right Panel Command Bar

Ready, in the right panel's footer, and the Ranged and air-strike controls on the Orders tab. The game-state readout is the date block in the [top bar](top-bar.md).

## Purpose

Give the player the buttons that end the turn or start a targeted order.

## Availability

Ready shows whenever the right panel does. Ranged and the air-strike controls show while the Orders tab is selected and the panel is expanded. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the panel is absent, so these controls are absent with it. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The Ready button, across the width of the right panel's footer. Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running. While the right panel is collapsed, Ready narrows to the tab rail's width and the "AI:" label takes two lines.
- The Ranged control, on the Orders tab under the selected-unit readout. The row takes no space while Ranged, the target list, and Cancel are all hidden. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
- While Strike targeting is on, a target-type choice: Enemy Units, Production, Airports, or Seaports, and a Cancel button for that targeting.
- Control tips for Ready, Ranged, Strike, the target-type list, and Cancel are in [control-tooltips.md](control-tooltips.md).

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
- A failed target double-click shows an error toast and keeps targeting on. The label stays Cancel for Ranged, and the target-type choice and its Cancel stay shown for Strike. See [order-lifecycle.md](order-lifecycle.md).

## States

- Ready enabled: the player may end the turn or beat.
- Ready disabled: game over, AI wait, deferred consultation, a Ready request in flight, or the annihilation dialog.
- Ranged hidden: the selection is empty, mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater.
- Ranged showing "Ranged" or "Cancel": every selected unit can make a direct ranged attack.
- Strike showing: every selected unit is air. Strike targeting replaces that label with the target-type choice and Cancel.

## Invariants

- Ready never uses the AI wait label unless opponent planning is outstanding: Run is on and opponent orders are not ready, or a deferred consultation is running after playback. Turning Run off stops that consultation, so the label stops counting. When a battle is already in planning, the label keeps counting until the battle's opponent plan is buffered or the player stops planning.
- The target-type choice is never shown unless strike targeting is on.
- Strategic infantry never shows Ranged. Tactical infantry can.
- A failed target double-click never turns targeting off.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Ready | Resolves the strategic turn | Commits the battle beat |
| Ranged | Types that can fire on the strategic map | Types that can fire in a battle, including infantry |

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

- `static/index.html` (`#console-footer`, `#ready-btn`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`)
- `src/renderer/gameplay/readyHandler.ts`
- `src/renderer/gameplay/readyTacticalCommit.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/shared/selectionSupportButtonMode.ts`
