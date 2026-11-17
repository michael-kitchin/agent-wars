# Replay Panel

The panel at the map's bottom-left that steps through the match's past turns, or through a battle's past beats, and can play them forward.

## Purpose

Show the player what the map, the update dialog, and the commanders' messages looked like at the start of an earlier turn or beat, without changing the match. Replay reads what the match recorded and computes nothing again.

## Availability

The P key turns replay on and off. It starts only with a match loaded, no dialog open that needs the player's choice, and the new-game overlay closed or not open over a live match. It does not start while a turn is resolving or its playback is running, and that refusal toasts one sentence (`REPLAY_BUSY_REASON` in `src/shared/replayNavigation.ts`). It does start inside a tactical battle, where it covers that battle's beats and nothing else. A match with no recorded turn toasts `REPLAY_NO_TURNS_REASON` in `src/renderer/replay/replayMode.ts`. See [modes-and-transitions.md](modes-and-transitions.md).

## Information Displayed

- The panel takes the selection panel's place, with the same position, width, and navy face. The selection panel and the chat panel are hidden while replay is on (`static/replayChrome.css`).
- A bar, one 50 px row, from left to right: an expand control with a chevron, a label, and three buttons. The label reads "Replay · Turn N of M", where N is the shown turn and M is the last recorded turn (`replayLabel` in `src/shared/replayNavigation.ts`). Inside a battle it reads "Replay · Beat N of M", with beat numbers. The buttons are Step back, Step forward, and Play. While playback runs, Play becomes Pause: its icon is a pause glyph, its name is Pause, and its tip says it stops after this turn.
- Above the bar, while the panel is expanded: a turn field and a slider. The slider runs over the recorded turns. The panel opens compact.
- One step is one turn, or inside a battle one beat. A step shows the snapshot recorded when that turn or beat began. The last step shows the snapshot recorded at its end.
- A player with a human seat sees what that seat could see at that moment. An observer sees every side, and so does anyone after the match is over (`replayViewFor`).
- Each step shows the update dialog and the commanders' message dialog that turn showed. The update dialog is rebuilt from the recorded result with that turn's viewer and fog. For a battle beat it is shown only when the beat had movement, fire, melee, kills, air strikes, or dice, as the live beat showed it (`tacticalPlaybackNeeded`). A step shows neither dialog of the step before it.
- Control tips for the expand control, the three buttons, and Pause are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- Clicking the expand control shows or hides the turn field and the slider, sliding the bar as the selection panel does.
- Clicking Step back or Step forward shows the previous or next recorded turn. Step back is disabled at the first turn and Step forward at the last (`canStepBack` and `canStepForward`).
- Dragging the slider moves the field as it moves. Releasing it shows that turn.
- Clicking Play plays the recorded turns forward from the one showing. Each turn shows with its two dialogs for one second (`REPLAY_PLAYBACK_DWELL_MS` in `src/shared/replayNavigation.ts`). Then the animations that lead into the next turn run, built from that turn's recorded result the way the live turn built them, and playback moves to that turn. A turn with nothing to animate still shows for that second. A past turn's order arrows are not drawn.
- Play is enabled only when a turn after the one showing exists (`canPlay`). Playback stops by itself at the last recorded turn, which leaves Play disabled.
- Clicking Pause while playback runs stops it after the turn that is animating. The turn finishes first, so a click during the one-second hold takes effect when the hold ends.
- While playback runs, Step back, Step forward, the slider, and the turn field are disabled (`canStepBack`, `canStepForward`, `canSeek`).
- A step that cannot be loaded during playback ends playback and toasts `REPLAY_STEP_FAILED_REASON` (`That turn could not be loaded.`).
- Play does nothing while a live turn's end-of-animation notification is still queued, so a replay animation can never send it. Replay sends nothing to the main process except reads of recorded steps.
- Map clicks, double-clicks, and right-clicks do nothing. Dragging and the wheel still pan and zoom the map. The build entry buttons and the tactical entry markers are hidden.

### Keyboard

- P turns replay on, and turns it off again. Turning it off shows the present.
- Escape leaves replay and shows the present.
- P or Escape while playback runs stops it at once, cancels the animation, and leaves replay. The present is shown.
- P or Escape while a step loads waits for that step to finish loading, then leaves replay.
- In the turn field, which takes a beat number inside a battle and is named Beat there, a valid recorded turn number is accepted as it is typed, Enter and leaving the field show it, and anything else marks the field invalid with a red border (`aria-invalid`, `parseTurnEntry`). Escape in the field puts the last shown turn back and does not leave replay.
- C opens the charts dialog during replay, as it does at any other time.

### Other

- Opening the game menu leaves replay first. Starting a new match drops replay without applying anything.
- Ready is disabled and does nothing. The Orders tab is disabled, and a selected Orders tab returns after replay ends. Committed order lines are not drawn, and neither are the draft orders: queued battle marches, the march hover preview, and pending ranged, air strike, air drop, missile, and ferry lines (`shouldDrawPendingOrderOverlays` in `src/renderer/rendering/canvasPreviewPolicy.ts`).
- The commander cards on the Commanders tab are inert. Their summary buttons are disabled, so no commander popover opens and no commander is saved. A seat-cost refresh leaves the past snapshot's seats alone. Leaving replay applies the live match, seats included.
- Entering replay clears the unit selection. Leaving puts it back, without any unit that no longer exists in the present.
- A watch's automatic Ready waits during replay and presses when replay ends. The end of a replay animation does not move the watch camera or count as framing a turn or beat.
- A commander that finishes while replay is on does not open its message dialog over a past turn. Its messages are still filed in the Reports tab.
- The map toasts a step shows are not filed in the Reports tab or the activity log a second time.
- Inside a battle, Exit Battle is disabled while replay is on, and it is enabled again when replay is left. The battle view, the queued sub-unit marches, and the pending order lists are copied when replay starts and put back when it ends, so leaving shows the current beat with its queued marches and its dialogs. Stepping does not re-frame the battle view.
- Leaving replay restores the last-seen enemy markers that replay set aside. A live snapshot never replaces the past picture while replay is on.

## States

- Off: no panel.
- On, compact: the bar alone.
- On, expanded: the bar, the turn field, and the slider.
- Busy: a step is loading. A step request made while it loads is ignored. P or Escape waits for the load and then leaves.
- Playing: Play shows as Pause. Every other control except the expand control is disabled.
- Invalid entry: the turn field has a red border.

## Invariants

- Replay never changes the match, the selection that existed before it, the draft orders, or the database.
- A step recomputes no game rule. Every picture is a recorded snapshot, and every dialog is built from a recorded result.
- A player never sees through fog in replay unless the match is over or the player is an observer.

## Strategic and Tactical Differences

Replay covers one level. In the strategic game its steps are the strategic turns, and it never shows a battle, so the turn in which a battle was fought shows the strategic map. Inside a battle its steps are that battle's beats and nothing else. The label and the turn field read Beat there, Play plays the beats with their animations, and the sub-units move from where they stood before each beat. Leaving returns to the current beat.

## Related Documents

- [selection-panel.md](selection-panel.md)
- [chat-panel.md](chat-panel.md)
- [resolution-playback.md](resolution-playback.md)
- [tactical-battle-controls.md](tactical-battle-controls.md)
- [notifications-and-feedback.md](notifications-and-feedback.md)
- [../match-recording.md](../match-recording.md)

## Known Deviations

None.

## Open Questions


## Code Entry Points

- `static/index.html` (`#replay-panel`, `#replay-panel-seek`, `#replay-turn-input`, `#replay-slider`, `#replay-panel-bar`, `#replay-panel-expand`, `#replay-panel-label`, `#replay-step-back`, `#replay-step-forward`, `#replay-play`)
- `static/replayChrome.css`
- `src/renderer/replay/replayPanel.ts`
- `src/renderer/replay/replayMode.ts` (`toggleReplay`, `loadReplayStep`, `presentReplayStep`, `showReplayStep`, `leaveReplay`)
- `src/renderer/replay/replayPlayback.ts` (`startReplayPlayback`, `requestReplayPlaybackStop`)
- `src/renderer/gameplay/resolutionAnimationStart.ts` (`buildStrategicResolutionAnimation`, `startResolutionAnimationFrames`)
- `src/renderer/gameplay/tacticalAnimationStart.ts` (`tacticalPlaybackNeeded`, `buildTacticalResolutionAnimation`)
- `src/renderer/replay/replayDialogs.ts` (`showReplayStepDialogs`)
- `src/renderer/replay/replayState.ts`
- `src/renderer/gameplay/resolutionPlaybackPlan.ts` (`planResolutionPlayback`)
- `src/shared/replayNavigation.ts`
- `src/shared/replayTypes.ts`
- `src/main/replay/replayReading.ts`
- `src/main/replay/replayRecording.ts`
- `src/main/ipc/replayIpcHandler.ts`
