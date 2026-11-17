# Replay Panel

The panel at the map's bottom-left that steps through the match's past turns, or through a battle's past beats, and can play them forward.

## Purpose

Show the player what the map, the update dialog, and the commanders' messages looked like at the start of an earlier turn or beat, without changing the match. Replay reads what the match recorded and computes nothing again.

## Availability

The P key turns replay on and off. It starts only with a match loaded, no dialog open that needs the player's choice, and the new-game overlay closed or not open over a live match. It does not start while a turn is resolving or its playback is running, and that refusal toasts one sentence (`REPLAY_BUSY_REASON` in `src/shared/replayNavigation.ts`). It does start inside a tactical battle, where it covers that battle's beats and nothing else. A match with no recorded turn toasts `REPLAY_NO_TURNS_REASON` in `src/renderer/replay/replayMode.ts`. When the last recorded turn cannot be put on screen, P toasts `REPLAY_STEP_FAILED_REASON`, logs the failure, and leaves replay again, so the present is shown (`toggleReplay`). See [modes-and-transitions.md](modes-and-transitions.md).

The game menu's Playback… item also enters replay (`openReplay`), with the same conditions, refusals, and failure handling as P. It only enters. Opening the menu already starts leaving replay, so Playback… waits for that leave to finish and then enters on the newest recorded turn. When replay is already on, it does nothing. See [game-menu.md](game-menu.md).

## Information Displayed

- The panel takes the selection panel's place, with the same position, width, and navy face. The selection panel and the chat panel are hidden while replay is on (`static/replayChrome.css`).
- A bar, one 50 px row, from left to right: an expand control with a chevron, the follow-units toggle with a magnifying-glass icon, a label, and three buttons. The toggle is styled like the other bar buttons and shows a raised face while it is on (`aria-pressed`). The label reads "Replay · Turn N of M", where N is the shown turn and M is the last recorded turn (`replayLabel` in `src/shared/replayNavigation.ts`). Inside a battle it reads "Replay · Beat N of M", with beat numbers. The buttons are Step back, Step forward, and Play. While playback runs, Play becomes Pause: its icon is a pause glyph, its name is Pause, and its tip says it stops after this turn.
- Above the bar, while the panel is expanded: a turn field and a slider. The slider runs over the recorded turns. The panel opens compact.
- One step is one turn, or inside a battle one beat. A step shows the snapshot recorded when that turn or beat began. The last step shows the snapshot recorded at its end.
- A player with a human seat sees what that seat could see at that moment. An observer sees every side, and so does anyone after the match is over (`replayViewFor`).
- Each step shows the update dialog and the commanders' message dialog that turn showed. The update dialog is rebuilt from the recorded result with that turn's viewer and fog. The fog is what the viewer could see at the end of the step before, after any battle that turn had, as the live dialog had it (`readBeforeStep` in `src/main/replay/replayReading.ts`). When that later snapshot cannot be read, the fog of the turn's first snapshot is used, and when that cannot be read either, the dialog describes no moves; each failed read is logged and the step still shows (`readEarlierSnapshot`). A recorded strategy, message, consult, or result that cannot be read is left out and logged, and the step still shows (`listReadableMatchEventsAtStep`). For a battle beat it is shown only when the beat had movement, fire, melee, kills, air strikes, or dice, as the live beat showed it (`tacticalPlaybackNeeded`). A step shows neither dialog of the step before it.
- Control tips for the expand control, the three buttons, and Pause are in [control-tooltips.md](control-tooltips.md).

## Inputs and Responses

### Mouse

- Clicking the expand control shows or hides the turn field and the slider, sliding the bar as the selection panel does.
- Clicking the follow-units toggle turns it on or off (`setReplayFollowUnits` in `src/renderer/replay/replayCamera.ts`). While it is on, the camera fits the visible units when it is turned on, after every step Step back or Step forward shows, after every step during playback, and after every step the slider or the turn field shows, drag previews included (`frameReplayStepIfFollowing`). A played step is fitted once, on its final positions: after its animation ends, or as soon as it shows when it has nothing to animate. Over a battle's beats it fits the beat's sub-units inside the battle area. The fit is the one the automatic watch uses (`fitStrategicUnitsNow` and `fitBattleUnitsNow` in `src/renderer/map/unitFrameCamera.ts`); only the gate differs, and it never counts as the watch framing a turn or beat. Turning it off leaves the camera where it is. The choice is remembered until the app closes (`S.replayFollowUnits`), is not saved, and survives leaving replay and starting a new match. The last step shown while replay is being left is not fitted.
- Clicking Step back or Step forward shows the previous or next recorded turn. Step back is disabled at the first turn and Step forward at the last (`canStepBack` and `canStepForward`).
- Dragging the slider moves the field as it moves, and the map, the top bar, and the panels follow the turn under the thumb without its dialogs. A preview starts at most every 250 ms (`REPLAY_SLIDER_PREVIEW_INTERVAL_MS` in `src/shared/replaySliderPreview.ts`), one at a time, and always moves toward the latest position; positions passed in between are skipped (`createSliderPreviewScheduler`, `previewReplayStep` in `src/renderer/replay/replayStepPreview.ts`). The thumb and the field stay where the pointer puts them while it drags, and on the released turn until that turn has shown or failed to load. Releasing it shows that turn in full: a preview in flight finishes, a waiting one is dropped, and once no step is loading the released turn is shown with its two dialogs, even when the last preview already showed it (`showReleasedReplayStep`). A drag that ends without moving the thumb, or is cancelled, puts the thumb back on the turn on screen. The slider keeps focus afterwards.
- Clicking Play plays the recorded turns forward from the one showing. Each turn shows with its two dialogs for half a second, 500 ms (`REPLAY_PLAYBACK_DWELL_MS` in `src/shared/replayNavigation.ts`). Then the animations that lead into the next turn run, built from that turn's recorded result the way the live turn built them, and playback moves to that turn. A turn with nothing to animate still shows for that half second. A past turn's order arrows are not drawn.
- Play is enabled only when a turn after the one showing exists (`canPlay`). Playback stops by itself at the last recorded turn, which leaves Play disabled.
- Clicking Pause while playback runs stops it after the turn that is animating. The turn finishes first, so a click during the half-second hold takes effect when the hold ends.
- While playback runs, Step back, Step forward, the slider, and the turn field are disabled (`canStepBack`, `canStepForward`, `canSeek`).
- While a step loads, Step back and Step forward are disabled, but the slider and the turn field stay enabled so a focused one keeps focus (`canSeek`). A focused Step back, Step forward, or Play that becomes disabled, while a step loads or at the first or last turn, hands its focus to the slider when the panel is expanded, otherwise to another enabled bar button or the expand control (`keepFocusInPanel` in `src/renderer/replay/replayPanel.ts`). Focus elsewhere is not moved. A slider release made then waits for that step to settle and then shows the released turn. A turn entry committed then is ignored and stays as typed.
- A step that cannot be loaded during playback ends playback and toasts `REPLAY_STEP_FAILED_REASON` (`That turn could not be loaded.`).
- Play does nothing while a live turn's end-of-animation notification is still queued, so a replay animation can never send it. Replay sends nothing to the main process except reads of recorded steps.
- Map clicks, double-clicks, and right-clicks do nothing. Dragging and the wheel still pan and zoom the map. The build entry buttons and the tactical entry markers are hidden.

### Keyboard

- P turns replay on, and turns it off again. Turning it off shows the present.
- Escape leaves replay and shows the present.
- P or Escape while playback runs stops it at once, cancels the animation, and leaves replay. The present is shown.
- P or Escape while a step loads waits for that step to finish loading, then leaves replay.
- Leaving shows the last recorded turn first. When that turn cannot be put on screen, the failure is logged and the present is shown anyway (`runLeaveReplay`).
- P while replay is being left waits for the leave to finish and does not turn replay on again.
- With the slider focused, the arrow keys move it one turn and show that turn, and Home, End, Page Up, and Page Down move it too. A key step counts as a drag and a release at once: the turn is previewed and then shown in full, and its dialogs open once. Every other map key still acts: P and Escape leave replay, C opens the charts dialog, and the zoom keys, W, A, S, D, and T work as they do on the map (`isRangeInputTarget` in `src/renderer/map/mapHelpers.ts`, `rangeInputOwnsKey` in `src/shared/mapKeyboardPanLogic.ts`).
- In the turn field, which takes a beat number inside a battle and is named Beat there, a valid recorded turn number is accepted as it is typed, Enter and leaving the field show it, and anything else marks the field invalid with a red border (`aria-invalid`, `parseTurnEntry`). Escape in the field puts the last shown turn back and does not leave replay.
- C opens the charts dialog during replay, as it does at any other time, including while the slider has focus.

### Other

- Opening the game menu leaves replay first. Starting a new match drops replay without applying anything. Replay can be on over a finished match's standings, so it is dropped as soon as Start game is clicked, and a start that fails leaves replay off. A replay animation that is running stops, and the Orders tab and Exit Battle are enabled again (`abandonReplayForNewMatch`).
- Ready is disabled and does nothing. The Orders tab is disabled, and a selected Orders tab returns after replay ends. A collapsed console stays collapsed when replay starts and when it ends. Committed order lines are not drawn, and neither are the draft orders: queued battle marches, the march hover preview, and pending ranged, air strike, air drop, missile, and ferry lines (`shouldDrawPendingOrderOverlays` in `src/renderer/rendering/canvasPreviewPolicy.ts`).
- The commander cards on the Commanders tab are inert. Their summary buttons are disabled, so no commander popover opens and no commander is saved. A seat-cost refresh leaves the past snapshot's seats alone. Leaving replay applies the live match, seats included.
- Entering replay clears the unit selection. Leaving puts it back, without any unit that no longer exists in the present.
- A watch's automatic Ready waits during replay and presses when replay ends. The end of a replay animation does not move the watch camera or count as framing a turn or beat.
- A commander that finishes while replay is on does not open its message dialog over a past turn. Its messages are still filed in the Reports tab.
- The map toasts a step shows are not filed in the Reports tab or the activity log a second time.
- Inside a battle, Exit Battle is disabled while replay is on, and it is enabled again when replay is left. The battle view, the queued sub-unit marches, and the pending order lists are copied when replay starts and put back when it ends, so leaving shows the current beat with its queued marches and its dialogs. Stepping does not re-frame the battle view unless follow units is on.
- Leaving replay restores the last-seen enemy markers that replay set aside. A live snapshot never replaces the past picture while replay is on.

## States

- Off: no panel.
- On, compact: the bar alone.
- On, expanded: the bar, the turn field, and the slider.
- Busy: a step is loading. A step request made while it loads is ignored, except a slider release, which waits for it. A slider preview asked for meanwhile waits too, and none starts once replay is being left. P or Escape waits for the load and then leaves.
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

- `static/index.html` (`#replay-panel`, `#replay-panel-seek`, `#replay-turn-input`, `#replay-slider`, `#replay-panel-bar`, `#replay-panel-expand`, `#replay-follow-units`, `#replay-panel-label`, `#replay-step-back`, `#replay-step-forward`, `#replay-play`)
- `static/replayChrome.css`
- `src/renderer/replay/replayPanel.ts` (`renderReplayPanel`, the slider's drag and preview wiring)
- `src/renderer/replay/replayStepPreview.ts` (`previewReplayStep`, `showReleasedReplayStep`)
- `src/shared/replaySliderPreview.ts` (`createSliderPreviewScheduler`, `REPLAY_SLIDER_PREVIEW_INTERVAL_MS`)
- `src/renderer/replay/replayMode.ts` (`toggleReplay`, `openReplay`, `loadReplayStep`, `presentReplayStep`, `showReplayStep`, `replayIsLeaving`, `leaveReplay`, `abandonReplayForNewMatch`)
- `src/renderer/chrome/gameMenu.ts` (the Playback… item, through `GameMenuActions`)
- `src/renderer/chrome/consoleFrame.ts` (`selectedConsoleTabId`, `selectConsoleTabKeepingCollapse`)
- `src/renderer/replay/replayPlayback.ts` (`startReplayPlayback`, `requestReplayPlaybackStop`)
- `src/renderer/gameplay/resolutionAnimationStart.ts` (`buildStrategicResolutionAnimation`, `startResolutionAnimationFrames`)
- `src/renderer/gameplay/tacticalAnimationStart.ts` (`tacticalPlaybackNeeded`, `buildTacticalResolutionAnimation`)
- `src/renderer/replay/replayDialogs.ts` (`showReplayStepDialogs`)
- `src/renderer/replay/replayState.ts` (`waitForStepToSettle`)
- `src/renderer/replay/replayCamera.ts` (`frameReplayStepIfFollowing`, `setReplayFollowUnits`)
- `src/renderer/map/unitFrameCamera.ts` (`fitStrategicUnitsNow`, `fitBattleUnitsNow`)
- `src/renderer/replay/replayBattleCopy.ts` (`copyBattleState`)
- `src/renderer/gameplay/resolutionPlaybackPlan.ts` (`planResolutionPlayback`)
- `src/shared/replayNavigation.ts`
- `src/shared/replayTypes.ts`
- `src/main/replay/replayReading.ts`
- `src/main/replay/replayRecording.ts`
- `src/main/ipc/replayIpcHandler.ts`
