# Tactical Battle Controls

Exit Battle during a battle, and the annihilation dialog that can replace it.

## Purpose

Let the player leave a battle, and make a wiped side an explicit step instead of an automatic exit.

## Availability

The Exit Battle control is shown whenever a battle is active, including during a tactical Resolution playback, and hidden when no battle is active. It is enabled during Tactical planning. It is disabled from the moment a tactical Ready commits a beat until that beat's playback ends. It is hidden and disabled while the annihilation dialog is open. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- A button labeled "Exit Battle" while a battle is active and annihilation is not showing.
- The annihilation dialog: "You win!", "You lose.", or "All units destroyed.", plus an Exit Battle button.

## Inputs and Responses

### Mouse

- When the player clicks Exit Battle and it is enabled, the battle ends, stashed strategic drafts return, and Strategic planning resumes. Ready then runs, as described in [modes-and-transitions.md](modes-and-transitions.md). A failed exit shows an error toast and stays in the battle.
- When the player clicks Exit Battle on the annihilation dialog, the dialog closes and the battle ends the same way, including the Ready that follows.

### Keyboard

- None. Escape does not exit the battle.

### Other

- When a beat leaves at least one side with no units, the annihilation dialog opens, map and panel input turn off, the in-battle Exit Battle control hides, and Ready disables.
- Leaving the battle cancels in-flight opponent planning for that battle.

## States

- Hidden: no battle.
- Exit enabled: Tactical planning, with the annihilation dialog closed.
- Exit disabled: a tactical beat is resolving or playing back.
- Annihilation open: the in-battle Exit Battle control is hidden and the dialog is the only exit.

## Invariants

- The annihilation dialog never closes itself. The player must press Exit Battle, unless a new match or a strategic reconciliation tears the battle down.
- A failed exit never restores strategic drafts and never clears the battle.
- A successful exit always continues into Ready. Leaving a battle resumes the strategic turn; it is not a return to open planning.
- Exit Battle is never shown together with the annihilation dialog.
- Exit Battle never leaves the battle while a beat is resolving or playing back.

## Strategic and Tactical Differences

These controls exist only in a tactical battle. During a strategic Resolution playback they are hidden. During a tactical Resolution playback, Exit Battle stays shown and is disabled until the playback ends. After a successful exit the player is in Strategic planning, with strategic drafts restored except for units that no longer exist, and Ready runs. See the state carried across transitions in [modes-and-transitions.md](modes-and-transitions.md).

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [map-surface.md](map-surface.md)
- [tactical-entry-markers.md](tactical-entry-markers.md)
- [tactical-battles-list.md](tactical-battles-list.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#tactical-battle-hud`, `#tactical-exit-btn`, `#tactical-annihilation-overlay`, `#tactical-annihilation-message`, `#tactical-annihilation-exit-btn`)
- `src/renderer/tactical/tacticalExitButtonDom.ts`
- `src/renderer/tactical/tacticalExitFlow.ts`
- `src/renderer/tactical/tacticalAnnihilationDialog.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
- `src/renderer/tactical/applyTacticalPostBeatConsultSideEffects.ts`
