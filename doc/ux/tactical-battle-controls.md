# Tactical Battle Controls

Exit Battle in the battle header, and the annihilation dialog that can replace it.

## Purpose

Let the player leave a battle, and make a wiped side an explicit step instead of an automatic exit.

## Availability

Exit Battle sits in the battle header, the top bar's form during a battle, beside Settings. See [top-bar.md](top-bar.md). It is shown whenever a battle is active, including during a tactical Resolution playback, and hidden when no battle is active. The button hides when the battle snapshot is cleared, before the header returns to the match status. It is enabled during Tactical planning. It is disabled from the moment a tactical Ready commits a beat until that beat's playback ends. It is hidden and disabled while the annihilation dialog is open. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- A button with an exit icon and the label "Exit Battle", in the battle header, while a battle is active and annihilation is not showing. It uses the shared button colors, and the dimmed teal while it is disabled.
- The annihilation dialog: "You win!", "You lose.", or "All units destroyed.", plus an Exit Battle button. An AI-only result uses the same overlay. Its button reads Ok. The sentences are "{home name} wins the battle.", "All units destroyed.", "The commanders left the battle.", "The battle ended with no orders left to carry out.", "The battle reached its maximum of {N} beats." ({N} is the beats completed), and, for the header control, "The battle was left." A missing home name uses the seat id. Ok returns to the world map and does not press Ready. Escape does not close it. While the observe checkbox is on, the header control leaves immediately and then starts the next strategic turn, and a finished beat does the same without the dialog. While the observe checkbox is on, a battle that reached its beat limit still opens this overlay. The overlay opens after that beat's playback and closes itself after 3 seconds (`AI_ONLY_BEAT_LIMIT_NOTICE_MS`), then the battle ends and the next strategic turn starts. Ok skips the wait. If the checkbox is unticked before the 3 seconds pass, the overlay waits for Ok, and Ok does not press Ready.
- Control tips for both Exit Battle buttons are in [control-tooltips.md](control-tooltips.md).
- A cell fortified by the other side cannot be entered. Hovering it says "Blocked: Fortified". The controller's units start on fortified core cells, one each, after missiles. The first hit on those units removes the ticks at the end of the beat and the unit stays. A fortified cell in the outer rings blocks movement and is never hit.

## Inputs and Responses

### Mouse

- When the player clicks Exit Battle and it is enabled, a human battle ends, stashed strategic drafts return, and Strategic planning resumes. Ready then runs, as described in [modes-and-transitions.md](modes-and-transitions.md). On an AI-only battle with the observe checkbox off, the click opens Ok with "The battle was left." and stays in the battle until Ok. With the checkbox on, the battle ends immediately and the next strategic turn starts. A failed exit shows an error toast and stays in the battle.
- When the player clicks Exit Battle on a human annihilation dialog, the dialog closes and the battle ends the same way, including the Ready that follows. Ok on an AI-only result closes the overlay and does not press Ready, except Ok on the beat-limit notice while the observe checkbox is on, which starts the next strategic turn.

### Keyboard

- None. Escape does not exit the battle.

### Other

- When a human beat leaves at least one side with no units, the annihilation dialog opens, map and panel input turn off, the in-battle Exit Battle control hides, and Ready disables. An AI-only beat that ends while the observe checkbox is off opens the same overlay with Ok, including an idle ending, a commander exit, and a beat limit. While that checkbox is on, the battle leaves without the overlay, except a beat limit, which opens the overlay and closes it after 3 seconds.
- Leaving the battle cancels in-flight opponent planning for that battle, including a post-beat consult that has not finished. Exit Battle stays enabled during a model call. It is still disabled while a beat is resolving or playing back, and hidden while the annihilation dialog is open. A strategic consult from the world-map turn keeps running.

## States

- Hidden: no battle.
- Exit enabled: Tactical planning, with the annihilation dialog closed.
- Exit disabled: a tactical beat is resolving or playing back.
- Annihilation open: the in-battle Exit Battle control is hidden and the dialog is the only exit.

## Invariants

- The annihilation dialog never closes itself, except the beat-limit notice while the observe checkbox is on. That notice closes after 3 seconds (`AI_ONLY_BEAT_LIMIT_NOTICE_MS`). Every other result waits for Exit Battle on a human result, or Ok on an AI-only result, unless a new match or a strategic reconciliation tears the battle down.
- A failed exit never restores strategic drafts and never clears the battle.
- A human exit continues into Ready, so that strategic turn resumes. An AI-only Ok returns to strategic planning and does not press Ready, except Ok on the beat-limit notice while the observe checkbox is on, which starts the next strategic turn. While that checkbox is on, an ended AI-only battle leaves without the dialog and starts the next strategic turn, except a beat limit, which shows its notice first.
- Exit Battle is never shown together with the annihilation dialog.
- Exit Battle never leaves the battle while a beat is resolving or playing back.

## Strategic and Tactical Differences

These controls exist only in a tactical battle. During a strategic Resolution playback they are hidden. During a tactical Resolution playback, Exit Battle stays shown and is disabled until the playback ends. After a human exit the player is in Strategic planning, with strategic drafts restored except for units that no longer exist, and Ready runs. An AI-only Ok does not press Ready, except Ok on the beat-limit notice while the observe checkbox is on. See the state carried across transitions in [modes-and-transitions.md](modes-and-transitions.md).

## Related Documents

- [modes-and-transitions.md](modes-and-transitions.md)
- [top-bar.md](top-bar.md)
- [map-surface.md](map-surface.md)
- [tactical-entry-markers.md](tactical-entry-markers.md)
- [tactical-battles-list.md](tactical-battles-list.md)

## Known Deviations

None.

## Open Questions

None.

## Code Entry Points

- `static/index.html` (`#tactical-exit-host`, `#tactical-exit-btn`, `#tactical-annihilation-overlay`, `#tactical-annihilation-message`, `#tactical-annihilation-exit-btn`)
- `static/frameChrome.css` (`.battle-header-exit`, `.battle-exit-btn`)
- `src/renderer/tactical/tacticalExitButtonDom.ts`
- `src/renderer/tactical/tacticalExitFlow.ts`
- `src/renderer/tactical/tacticalAnnihilationDialog.ts`
- `src/renderer/tactical/aiOnlyResultAutoClose.ts`
- `src/shared/aiOnlyBeatLimit.ts`
- `src/renderer/tactical/tacticalUiOrchestration.ts`
- `src/main/tacticalBattle/tacticalFortificationPlacement.ts` (`orderParentsForFortifiedPlacement`, `takeFortifiedCellForDefender`)
- `src/main/tacticalBattle/tacticalFortificationSoak.ts` (`createTacticalFortificationHooks`)
- `src/shared/tacticalFortificationMovement.ts` (`tacticalMarchSetForMover`)
- `src/renderer/rendering/tacticalBattleTerrainPaint.ts`
- `src/renderer/tactical/applyTacticalPostBeatConsultSideEffects.ts`
