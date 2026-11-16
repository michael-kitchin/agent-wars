# Replay Panel

The panel at the map's bottom-left that steps through the match's past turns.

## Purpose

Show the player what the map, the update dialog, and the commanders' messages looked like at the start of an earlier turn, without changing the match. Replay reads what the match recorded and computes nothing again.

## Availability

The P key turns replay on and off. It starts only with a match loaded, no dialog open that needs the player's choice, and the new-game overlay closed or not open over a live match. It does not start while a turn is resolving or its playback is running, and it does not start inside a tactical battle. Each of those two refusals toasts one sentence (`REPLAY_BUSY_REASON` and `REPLAY_IN_BATTLE_REASON` in `src/shared/replayNavigation.ts`). A match with no recorded turn toasts `REPLAY_NO_TURNS_REASON` in `src/renderer/replay/replayMode.ts`. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The panel takes the selection panel's place, with the same position, width, and navy face. The selection panel and the chat panel are hidden while replay is on (`static/replayChrome.css`).
- A bar, one 50 px row, from left to right: an expand control with a chevron, a label, and three buttons. The label reads "Replay · Turn N of M", where N is the shown turn and M is the last recorded turn (`replayLabel` in `src/shared/replayNavigation.ts`). The buttons are Step back, Step forward, and Play. Play is always disabled and its tip says it will play the turns forward with their animations.
- Above the bar, while the panel is expanded: a turn field and a slider. The slider runs over the recorded turns. The panel opens compact.
- One step is one turn. A step shows the snapshot recorded when that turn began. The last turn shows the snapshot recorded at its end.
- A player with a human seat sees what that seat could see at that moment. An observer sees every side, and so does anyone after the match is over (`replayViewFor`).
- Each step shows the update dialog and the commanders' message dialog that turn showed. The update dialog is rebuilt from the recorded result with that turn's viewer and fog. A step shows neither dialog of the step before it.
- Control tips for the expand control and the three buttons are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- Clicking the expand control shows or hides the turn field and the slider, sliding the bar as the selection panel does.
- Clicking Step back or Step forward shows the previous or next recorded turn. Step back is disabled at the first turn and Step forward at the last (`canStepBack` and `canStepForward`).
- Dragging the slider moves the field as it moves. Releasing it shows that turn.
- Map clicks, double-clicks, and right-clicks do nothing. Dragging and the wheel still pan and zoom the map. The build entry buttons and the tactical entry markers are hidden.

### Keyboard

- P turns replay on, and turns it off again. Turning it off shows the present.
- Escape leaves replay and shows the present.
- In the turn field, a valid recorded turn number is accepted as it is typed, Enter and leaving the field show it, and anything else marks the field invalid with a red border (`aria-invalid`, `parseTurnEntry`). Escape in the field puts the last shown turn back and does not leave replay.
- C opens the charts dialog during replay, as it does at any other time.

### Other

- Opening the game menu leaves replay first. Starting a new match drops replay without applying anything.
- Ready is disabled and does nothing. The Orders tab is disabled, and a selected Orders tab returns after replay ends. Committed order lines are not drawn.
- A watch's automatic Ready waits during replay and presses when replay ends.
- A commander that finishes while replay is on does not open its message dialog over a past turn. Its messages are still filed in the Reports tab.
- The map toasts a step shows are not filed in the Reports tab or the activity log a second time.
- Leaving replay restores the last-seen enemy markers that replay set aside. A live snapshot never replaces the past picture while replay is on.

## States

- Off: no panel.
- On, compact: the bar alone.
- On, expanded: the bar, the turn field, and the slider.
- Busy: a step is loading. A second step request waits for it.
- Invalid entry: the turn field has a red border.

## Invariants

- Replay never changes the match, the selection that existed before it, the draft orders, or the database.
- A step recomputes no game rule. Every picture is a recorded snapshot, and every dialog is built from a recorded result.
- A player never sees through fog in replay unless the match is over or the player is an observer.

## Strategic and Tactical Differences

Replay shows the strategic map only. It does not start inside a battle, and it does not step through battle beats.

## Related Documents

- [selection-panel.md](selection-panel.md)
- [chat-panel.md](chat-panel.md)
- [resolution-playback.md](resolution-playback.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [../match-recording.md](../match-recording.md)

## Known Deviations

None.

## Open Questions

- Play is disabled. Whether it plays a turn's resolution animation, and at what pace, is not decided.
- Replay inside a tactical battle is not available.

## Code Entry Points

- `static/index.html` (`#replay-panel`, `#replay-panel-seek`, `#replay-turn-input`, `#replay-slider`, `#replay-panel-bar`, `#replay-panel-expand`, `#replay-panel-label`, `#replay-step-back`, `#replay-step-forward`, `#replay-play`)
- `static/replayChrome.css`
- `src/renderer/replay/replayPanel.ts`
- `src/renderer/replay/replayMode.ts` (`toggleReplay`, `showReplayStep`, `leaveReplay`)
- `src/renderer/replay/replayDialogs.ts` (`showReplayStepDialogs`)
- `src/renderer/replay/replayState.ts`
- `src/renderer/gameplay/resolutionPlaybackPlan.ts` (`planResolutionPlayback`)
- `src/shared/replayNavigation.ts`
- `src/shared/replayTypes.ts`
- `src/main/replay/replayReading.ts`
- `src/main/replay/replayRecording.ts`
- `src/main/ipc/replayIpcHandler.ts`
