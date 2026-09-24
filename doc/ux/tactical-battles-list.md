# Tactical Battles List

The dialog that lists melee hexes after Ready, where the player chooses Fight or Ignore.

## Purpose

Let the player pick one contested hex to fight as a tactical battle, or ignore melee for the turn.

## Availability

Opens in the Tactical battles list mode, after Ready reports melee candidates and the Tactical battles checkbox is checked. The dialog covers the window. The map and the right panel stay visible underneath and do not receive pointer input. Markers that were already on the map are not refreshed until the dialog closes. When that checkbox is unchecked, the dialog does not open and the turn continues as Ignore. See [modes-and-transitions.md](modes-and-transitions.md) and [right-panel-model-tab.md](right-panel-model-tab.md).

## Information Displayed

- The title "Tactical Battles (N)", where N is the number of rows.
- One row per candidate hex: a choice, the hex information used by the hex tooltip, a human unit summary, and an AI unit summary. An empty summary shows an em dash.
- Fight, disabled until a row is chosen.
- Ignore.

## Inputs and Responses

### Mouse

- When the player chooses a row, Fight becomes enabled. Only one row is chosen.
- When the player clicks Fight, the dialog closes, the strategic turn finishes, and a tactical battle starts on that hex.
- When the player clicks Ignore, or clicks the dimmed backdrop, the dialog closes and melee resolves without a battle.
- When the hex information for a row fails to load, that cell shows the hex id instead.

### Keyboard

- When the player presses Escape, the dialog closes as Ignore. That keypress does nothing else: a build popup or stack callout under the dialog stays as it is. See [input-map.md](input-map.md).

### Other

- None.

## States

- Closed: not waiting on a melee choice.
- Open, no row chosen: Fight is disabled.
- Open, row chosen: Fight is enabled.

## Invariants

- Fight never starts a battle without a chosen row.
- Ignore never starts a tactical battle.
- The dialog never opens while the Tactical battles checkbox is unchecked.
- Escape on this dialog never closes another popup.

## Strategic and Tactical Differences

The dialog is a strategic Ready step. Fight is what enters Tactical planning. The battle itself is specified in [tactical-battle-controls.md](tactical-battle-controls.md) and [map-surface.md](map-surface.md).

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [hex-tooltips.md](hex-tooltips.md)
- [right-panel-model-tab.md](right-panel-model-tab.md)
- [tactical-entry-markers.md](tactical-entry-markers.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `src/renderer/gameplay/meleeInterceptModal.ts`
- `src/renderer/gameplay/meleeInterceptHexTooltip.ts`
- `src/renderer/gameplay/readyHandler.ts`
- `src/renderer/gameplay/tacticalBattlePromptPreference.ts`
