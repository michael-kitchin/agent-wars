# Console Command Bar

Ready, in the console's footer, and the reticle and the air-strike target list in the [selection panel](selection-panel.md). A missile launch uses the same reticle and does not show that list. The game-state readout is the date block in the [top bar](top-bar.md), or the battle header's status line in a battle.

## Purpose

Give the player the buttons that end the turn or start a targeted order.

## Availability

Ready shows whenever the console does. The reticle and the air-strike target list show in the selection panel, which shows while units are selected. All of them follow the rules below in Strategic planning and Tactical planning. While the tactical battles list is open, the bar stays visible and does not receive pointer input. In New game and Game over the console and the selection panel are absent, so these controls are absent with them. In Tactical annihilation they are disabled or hidden as stated in [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The Ready button, across the width of the footer, under the opponent status line. Its label is a check mark and "Ready", enabled or disabled, or "AI: {m:ss} (x{n})", with no check mark, while any commander is still planning. `{n}` is how many commanders are still planning. The time and the count use the button's type and share one line (`setReadyButtonLabelAiWait` in `src/renderer/openRouter/readyButtonLabel.ts`). While the console is collapsed, the status line is hidden, Ready narrows to the tab rail's width, the Ready label shows only its check mark, and the "AI:" label wraps at that space onto two lines. The word stays as the button's accessible name (`setReadyButtonLabelReady` in the same file). The status line's own rules are in [console.md](console.md).
- The reticle, in the selection panel's summary bar, shown whenever the selection panel is: one square button with a target reticle icon and no text. It aims a ranged attack when every selected unit can fire, an air strike when every selected unit is air, and a missile launch when every selected unit is a missile and the match is not in a battle. It never offers more than one of those. Its accessible name is "Ranged attack", "Air strike", or "Missile launch" (`SUPPORT_BUTTON_NAMES` in `src/renderer/gameplay/tacticalOrders.ts`, from `selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`, and `updateRangedSidebar`). The air-strike target list uses the same height. A launch does not show that list.
- While an attack or a launch is aimed, the reticle reads as pressed (`aria-pressed`), its face in that order's color: the ranged amber, the strike purple, or the missile crimson (`--order-missile`), the same color as the selection panel's border.
- While the selection cannot use it, the reticle is greyed out. Its name is "Missile launch" when the selection has a missile, "Air strike" when the selection has an air unit and no missile, and "Ranged attack" otherwise. Its reason is its tip, and also shows in the selection panel's details under the unit rows: "Missiles cannot fire or launch during a battle." during a battle, "A launch needs a selection of missiles only." when missiles are mixed with other types, "Infantry can't fire on the world map." when a world-map selection includes infantry and no air unit, or "Strike needs a selection of air units only." when air units are selected with other types (`selectionSupportAction` in `src/shared/selectionSupportButtonMode.ts`).
- While Strike targeting is on, a target-type choice to the left of the pressed reticle: Enemy Units, Production, Airports, or Seaports.
- Control tips for Ready, the reticle, and the target-type list are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- When the player clicks Ready, the turn or the battle beat resolves, unless Ready is disabled. Disabled cases are in [modes-and-transitions.md](modes-and-transitions.md).
- When the player clicks the reticle for a selection that can fire, ranged targeting turns on and the reticle reads as pressed. Clicking the pressed reticle turns it off.
- When the player clicks the reticle for an all-air selection, strike targeting turns on, the reticle reads as pressed, and the target-type choice shows to its left. Clicking the pressed reticle turns strike targeting off and hides the choice.
- When the player clicks the reticle for a selection of only missiles, outside a battle, launch targeting turns on and the reticle reads as pressed. There is no target-type list and no reach outline. Clicking the pressed reticle turns launch targeting off. Launches already queued stay queued.
- When the player changes the target type, later strike clicks use that type.

### Keyboard

- None.

### Other

- The reticle greys out when the selection mixes air with other types, mixes missiles with other types, includes a missile during a battle, or includes a unit that cannot make a direct ranged attack in the current theater. It is not on screen while nothing is selected, because the selection panel is hidden. See [selection-model.md](selection-model.md).
- A failed target double-click shows an error toast and keeps targeting on. The reticle stays pressed, and for a strike the target-type choice stays shown. See [order-lifecycle.md](order-lifecycle.md).

## States

- Ready enabled: the player may end the turn or beat.
- Ready disabled: game over, AI wait, deferred consultation, a Ready request in flight, or the annihilation dialog.
- Reticle greyed out: the selection mixes air with other types, or includes a unit that cannot make a direct ranged attack in the current theater. When one of the two sentences applies, it is the control's tip and shows in the selection panel's details.
- Reticle for a ranged attack: every selected unit can make a direct ranged attack. Pressed while ranged targeting is on.
- Reticle for an air strike: every selected unit is air. Pressed while strike targeting is on, with the target-type choice to its left.

## Invariants

- Ready never uses the AI wait label unless opponent planning is outstanding: the button reads Stop and opponent orders are not ready, or a deferred consultation is running after playback. Clicking Stop stops that consultation, so the label stops counting. When a battle is already in planning, the label keeps counting until the battle's opponent plan is buffered or the player stops planning.
- The target-type choice is never shown unless strike targeting is on.
- A world-map selection with infantry never enables the reticle. Tactical infantry can fire.
- A greyed-out reticle never starts targeting.
- The reticle is pressed exactly while ranged or strike targeting is on.
- A failed target double-click never turns targeting off.

## Strategic and Tactical Differences

| Aspect | Strategic | Tactical |
| --- | --- | --- |
| Ready | Resolves the strategic turn | Commits the battle beat |
| Reticle for a ranged attack | Types that can fire on the strategic map | Types that can fire in a battle, including infantry |

## Related Documents

- [console.md](console.md)
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

- `static/index.html` (`#console-footer`, `#ready-btn`, `#air-strike-target-type`, `#ranged-attack-tip-host`, `#ranged-attack-btn`, `#selection-panel-action-note`)
- `static/frameChrome.css` (`#ready-btn .ready-btn-ai-label`)
- `src/shared/selectionSupportButtonMode.ts`
- `src/renderer/gameplay/tacticalOrders.ts` (`updateRangedSidebar`)
- `src/renderer/gameplay/readyHandler.ts`
- `src/renderer/gameplay/readyTacticalCommit.ts`
- `src/renderer/gameplay/tacticalOrders.ts`
- `src/renderer/gameplay/sidebarSupport.ts`
- `src/renderer/map/initCore.ts`
- `src/renderer/core/uiState.ts`
- `src/renderer/openRouter/openRouterUiHelpers.ts`
- `src/renderer/openRouter/readyButtonLabel.ts`
- `src/shared/selectionSupportButtonMode.ts`
