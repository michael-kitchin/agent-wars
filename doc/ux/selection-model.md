# Selection Model

How the player selects human units, and what clears or keeps that selection.

## Purpose

One selection drives the right-panel readout, ranged and strike targeting, and double-click orders. Hex clicks also record the hex under the pointer for orders, which is separate from the unit selection.

## What Can Be Selected

- Human units whose icon the pointer hits. A single click replaces the selection with that unit after a short delay, so a double-click can still apply to the units selected when the gesture started.
- Shift-click toggles one human unit in or out of the selection immediately.
- Enemy units are not added to the selection. A stack, or a lone enemy unit, opens the stack callout instead. See [stack-callout.md](stack-callout.md).
- A land unit that is embarked is not selectable.
- While a hover order preview is in progress, a click that would replace or toggle the selection is ignored.
- During Resolution playback, map clicks do not replace or toggle the selection. Right-click still clears it. See [resolution-playback.md](resolution-playback.md).
- Build hexes use a separate selection owned by [build-popup.md](build-popup.md) and [multi-hex-build-popup.md](multi-hex-build-popup.md).

## Selecting

- When the player clicks a human unit icon without Shift, the selection becomes that unit after a short delay. A second click on a human unit icon before the delay ends selects that unit immediately.
- When the player Shift-clicks a human unit icon, that unit toggles in the selection and the delayed single-select is cancelled.
- When the click is the second press of a double-click on the same spot, the click does not retarget the selection. The order is planned for the units selected at the start of the gesture.
- When the player clicks a stack or a lone enemy icon, and no hover order preview is active, the stack callout opens after the same delay. The second press of a double-click on that spot does not schedule another callout.
- The selected-unit readout shows one unit name, or that name plus a count of the other selected units. It shows an em dash when nothing is selected.

## Clearing and Keeping a Selection

- When the player right-clicks the map while units are selected or a hover preview is showing, the selection, the gesture snapshot, the selected hex, the hover preview, and both targeting modes clear. Orders already queued stay queued.
- When the player right-clicks with nothing selected and no hover preview, only the gesture snapshot clears.
- When a ranged attack or air strike is accepted, the selection clears and that targeting mode turns off.
- When a grouped march or ferry is committed, the selection clears. See [order-lifecycle.md](order-lifecycle.md).
- Clicking a different hex does not clear an existing unit selection. Clicking the selected unit's hex but missing the icon does not clear it either.
- Entering New game or Game over clears the selection. Entering Tactical planning reconciles the selection to units that exist in the battle, which is usually empty. See [modes-and-transitions.md](modes-and-transitions.md).

## Selection and Targeting Modes

- The support control is hidden when the selection is empty, when the selection mixes air with other types, or when any selected unit cannot make a direct ranged attack in the current theater.
- When every selected unit is air, the control offers Strike.
- When every selected unit can make a direct ranged attack and none is air, the control offers Ranged. While that targeting mode is on, the label is Cancel.
- Choosing Ranged or Strike does not change which units are selected. A successful target click then clears the selection.
- Leaving the mode by Cancel turns the targeting mode off and keeps the selection. A failed target click keeps both the selection and the targeting mode. See [order-lifecycle.md](order-lifecycle.md).
- An empty selection hides the control and turns both targeting modes off.
- Strategic and tactical theaters use the same control. Which unit types count as ranged-capable follows the [combat rules](../combat-rules-v3.md) for the active theater. Strategic infantry does not show Ranged. Tactical infantry does.

## Strategic and Tactical Differences

The click, Shift-click, delay, and right-click rules are the same in both theaters. In Tactical planning, clicks outside the battle area do not change the selection; they show an error toast. Embarked land units stay unselectable in both theaters.

## Invariants

- A double-click never plans an order for a unit the player only hovered on the second press. It uses the selection from the start of the gesture.
- Right-click never discards queued orders.
- Enemy units never become the selected units.
- A left click on another hex never clears the unit selection. Right-click is the map gesture that clears it.
- Shift is the only selection modifier. Control, Alt, and Meta never toggle a unit in or out of the selection.
- Air mixed with any other type never shows Ranged or Strike.

## Open Questions

None.

## Code Entry Points

- `src/renderer/core/selection.ts`
- `src/renderer/map/mapClickSelectionPolicy.ts`
- `src/renderer/map/mainMapInteractions.ts`
- `src/renderer/map/mapDoubleClickHandler.ts`
- `src/shared/mapPlanningGesture.ts`
- `src/shared/selectionSupportButtonMode.ts`
- `src/shared/selectionUnitIdSets.ts`
