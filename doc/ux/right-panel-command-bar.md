# Right Panel Command Bar

Ready, in the right panel's footer, and the Ranged and air-strike controls in the [selection panel](selection-panel.md). The game-state readout is the date block in the [top bar](top-bar.md), or the battle header's status line in a battle.

## Purpose

Give the player the buttons that end the turn or start a targeted order.

## Availability

Ready shows whenever the right panel does. Ranged and the air-strike controls show in the selection panel, which shows while units are selected. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the right panel and the selection panel are absent, so these controls are absent with them. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The Ready button, across the width of the footer, under the opponent status line. Its label is "Ready", or "AI:" plus the elapsed wait, while opponent planning is still running. While the right panel is collapsed, the status line is hidden, Ready narrows to the tab rail's width, and the "AI:" label takes two lines. The status line's own rules are in [right-panel.md](right-panel.md).
- The Ranged control, in the selection panel's last row, shown whenever the selection panel is. Its label is "Ranged", "Cancel", or "Strike". The air-strike target list and its Cancel button use that same height.
- While the selection cannot use it, the control is greyed out. Its label is "Strike" when the selection has an air unit and "Ranged" otherwise, and a reason shows beside it: "Infantry can't fire on the world map." when a world-map selection includes infantry and no air unit, or "Strike needs a selection of air units only." when air units are selected with other types (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`).
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

- Ranged or Strike greys out when the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. It is not on screen while nothing is selected, because the selection panel is hidden. See [selection-model.md](selection-model.md).
- A failed target double-click shows an error toast and keeps targeting on. The label stays Cancel for Ranged, and the target-type choice and its Cancel stay shown for Strike. See [order-lifecycle.md](order-lifecycle.md).

## States

- Ready enabled: the player may end the turn or beat.
- Ready disabled: game over, AI wait, deferred consultation, a Ready request in flight, or the annihilation dialog.
- Ranged or Strike greyed out: the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. The reason shows beside it when one of the two sentences applies.
- Ranged showing "Ranged" or "Cancel": every selected unit can make a direct ranged attack.
- Strike showing: every selected unit is air. Strike targeting replaces that label with the target-type choice and Cancel.

## Invariants

- Ready never uses the AI wait label unless opponent planning is outstanding: Run is on and opponent orders are not ready, or a deferred consultation is running after playback. Turning Run off stops that consultation, so the label stops counting. When a battle is already in planning, the label keeps counting until the battle's opponent plan is buffered or the player stops planning.
- The target-type choice is never shown unless strike targeting is on.
- A world-map selection with infantry never enables Ranged. Tactical infantry can fire.
- A greyed-out control never starts targeting.
- A failed target double-click never turns targeting off.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Ready | Resolves the strategic turn | Commits the battle beat |
| Ranged | Types that can fire on the strategic map | Types that can fire in a battle, including infantry |

## Related Documents

- [right-panel.md](right-panel.md)
- [selection-panel.md](selection-panel.md)
- [selection-model.md](selection-model.md)
- [order-lifecycle.md](order-lifecycle.md)
- [modes-and-transitions.md](modes-and-transitions.md)
- [combat rules](../combat-rules-v3.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#console-footer`, `#ready-btn`, `#ranged-attack-btn`, `#air-strike-target-type`, `#air-strike-cancel-btn`, `#selection-panel-action-note`)
- `src/shared/selectionSupportButtonMode.ts`
- `src/renderer/gameplay/tacticalOrders.ts` (`updateRangedSidebar`)
- `src/renderer/gameplay/readyHandler.ts`
- `src/renderer/gameplay/readyTacticalCommit.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/shared/selectionSupportButtonMode.ts`
