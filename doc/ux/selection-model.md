# Selection Model

How the player selects human units, and what clears or keeps that selection.

## Purpose

One selection drives the right-panel readout, ranged and strike targeting, and double-click orders. Hex clicks also record the hex under the pointer for orders, which is separate from the unit selection.

## What Can Be Selected

- Human units whose icon the pointer hits. A plain click on a hex with exactly one stationary selectable human unit replaces the selection with that unit after a short delay, so a double-click can still apply to the units selected when the gesture started.
- Shift-click on a unit icon whose hex has one selectable human unit toggles that unit immediately and does not open the stack callout. A unit that is absent joins the selection. A unit that is already selected leaves it. Shift-click on an icon with two or more selectable human units, or with none, does not toggle a unit from the icon.
- Enemy units are not added to the selection. A plain click on a unit icon opens the stack callout, except when that hex has exactly one stationary unit and that unit is a selectable human. That click sole-selects the unit and starts movement planning. A Shift-click does not open it when the hex has exactly one selectable human unit. A Shift-click with two or more selectable human units, or with none, opens it when a plain click on that icon would. Hovering a single-unit icon shows that unit's Bonuses tooltip and does not select it. See [stack-callout.md](stack-callout.md).
- A land unit that is embarked is not selectable.
- While a hover order preview is in progress, a click that would replace the selection, or toggle a unit into it, is ignored. Toggling a unit out stays allowed.
- While Ranged or Strike targeting is on, a click does not change the selection, open the stack callout, or record a new selected hex. The double-click places the attack. See [order-lifecycle.md](order-lifecycle.md).
- During Resolution playback, map clicks do not replace or toggle the selection. Right-click still clears it. See [resolution-playback.md](resolution-playback.md).
- Build hexes use a separate selection owned by [build-popup.md](build-popup.md) and [multi-hex-build-popup.md](multi-hex-build-popup.md).

## Selecting

- When Ranged and Strike targeting are off and the player clicks, without Shift, a hex with exactly one stationary selectable human unit, the selection becomes that unit after a short delay. A second click on that icon before the delay ends selects that unit immediately. The second press of a double-click does not. The stack callout stays closed, and movement planning starts once that selection applies. A plain click on any other unit icon still opens the stack callout.
- When Ranged and Strike targeting are off and the player Shift-clicks a unit icon whose hex has one selectable human unit, that unit toggles in the selection and the delayed single-select is cancelled. The stack callout does not open. While a hover order preview is active, toggling the unit into the selection stays blocked, toggling it out stays allowed, and an already-open callout stays open. The second press of a double-click does not toggle the unit and does not cancel a callout the first press scheduled.
- When that hex has two or more selectable human units, or none, Shift-click schedules the callout and does not toggle a unit from the icon. A plain click on a unit icon still schedules the callout, except a hex with exactly one stationary selectable human unit. Releasing Shift closes an open callout, including one that is scheduled but not open yet. Sidebar Shift-click and a callout row's Shift toggle still toggle. See [input-map.md](input-map.md).
- When the click is the second press of a double-click on the same spot, the click does not retarget the selection. The order is planned for the units selected at the start of the gesture.
- When Ranged and Strike targeting are off and the player clicks a unit icon, and no hover order preview is already active, the stack callout opens after the same delay, except a Shift-click on one selectable human unit, and except a plain click on a hex with exactly one stationary selectable human unit. The preview that then appears because the pointer is still on the selected units' hex does not cancel or close that callout. A later click while that preview remains active does not open it again. Moving the pointer onto another hex while a preview is active does. The second press of a double-click on that spot does not schedule another callout. A double-click that plans an order cancels the one already scheduled.
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
- Choosing Ranged or Strike does not change which units are selected. A successful target double-click then clears the selection. A single click while targeting is on does not.
- Leaving the mode by Cancel turns the targeting mode off and keeps the selection. A failed target double-click keeps both the selection and the targeting mode. See [order-lifecycle.md](order-lifecycle.md).
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
- `src/shared/soleSelectableHumanUnit.ts`
- `src/renderer/map/mapDoubleClickHandler.ts`
- `src/shared/mapPlanningGesture.ts`
- `src/shared/selectionSupportButtonMode.ts`
- `src/shared/selectionUnitIdSets.ts`
