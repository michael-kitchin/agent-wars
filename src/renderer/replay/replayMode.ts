/**
 * Entering replay, showing a recorded step, and leaving replay.
 *
 * Purpose: Replay shows past pictures of the open match. It keeps the live game's last-seen enemy markers aside, and it asks the main process only for recorded data.
 * When to use: The `p` key, Escape, the replay panel, and the game menu.
 * Expected outcome: The screen shows the chosen turn while replay is on, and the present again once it is left.
 * Exceptions: None. A failed read is shown as a sentence and replay stays where it was.
 */

import { replayMayEnter } from '../../shared/replayNavigation';
import type { ReplayStepView } from '../../shared/replayTypes';
import { chartsDialogIsOpen } from '../charts/chartsDialog';
import { syncChatPanelVisibility } from '../chat/chatPanelVisibility';
import { blockingDialogIsOpen } from '../chrome/blockingDialogGuards';
import { refreshConsoleHeader, selectConsoleTabKeepingCollapse, selectedConsoleTabId } from '../chrome/consoleFrame';
import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import { fetchMatchSnapshot } from '../core/matchSnapshotClient';
import { replaceSelection } from '../core/selection';
import { rendererSharedState as S } from '../core/state';
import { newGameOverlayIsOpen } from '../gameplay/newGameDialogCollapse';
import type { ReadyHandlerDeps } from '../gameplay/readyHandlerTypes';
import { clearSelectionLikeRightClick, type SelectionClearRefreshDeps } from '../map/mapClickSelectionPolicy';
import { syncTacticalExitButtonElementVisibility } from '../tactical/tacticalExitButtonDom';
import { clearResolutionPlaybackAnimationState } from '../tactical/tacticalUiOrchestration';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import { maybeObserveAutoAdvance } from '../gameplay/observeChrome';
import { copyBattleState, type ReplayBattleCopy } from './replayBattleCopy';
import { frameReplayStepIfFollowing } from './replayCamera';
import { showReplayStepDialogs } from './replayDialogs';
import { abandonReplay, currentReplay, nextReplaySession, registerReplayLeaver, replayActive, setReplay, setReplayLeaveRunning, waitForStepToSettle } from './replayState';

/**
 * Sentence shown when the match has no recorded turns.
 *
 * Purpose: The player learns why `p` did not open replay.
 * When to use: Entering replay with an empty timeline.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
export const REPLAY_NO_TURNS_REASON = 'This match has no recorded turns to replay yet.';

/**
 * Sentence shown when a recorded step cannot be loaded.
 *
 * Purpose: A failed read leaves replay where it was and says so.
 * When to use: A null or failed step read.
 * Expected outcome: The exact sentence.
 * Exceptions: None.
 */
export const REPLAY_STEP_FAILED_REASON = 'That turn could not be loaded.';

/**
 * What replay needs from the renderer's wiring.
 *
 * Purpose: Replay is bound at startup so it never imports the files that wire the whole renderer.
 * When to use: `bindReplayDeps`.
 * Expected outcome: Four functions the renderer already has.
 * Exceptions: None.
 */
export interface ReplayDeps {
  /**
   * Builds the Ready dependencies, whose snapshot applier replay uses.
   *
   * Contract: Same as `createReadyHandlerDeps`.
   * When to use: Applying a snapshot and showing the dialogs.
   * Expected outcome: A fresh bundle of live helpers.
   * Exceptions: None.
   */
  readonly readyDeps: () => ReadyHandlerDeps;
  /**
   * The functions that refresh the views after the selection is cleared.
   *
   * Contract: The same three functions the map's right-click uses.
   * When to use: Clearing the selection on entering replay.
   * Expected outcome: The selection views follow the cleared selection.
   * Exceptions: None.
   */
  readonly selectionDeps: SelectionClearRefreshDeps;
  /**
   * Closes the build popup.
   *
   * Contract: Same as the renderer's `hideBuildPopup`.
   * When to use: Entering replay.
   * Expected outcome: No build popup is open.
   * Exceptions: None.
   */
  readonly hideBuildPopup: () => void;
  /**
   * Closes the stack callout.
   *
   * Contract: Same as the renderer's `hideStackCallout`.
   * When to use: Entering replay.
   * Expected outcome: No stack callout is open.
   * Exceptions: None.
   */
  readonly hideStackCallout: () => void;
}

/**
 * The bound dependencies.
 *
 * Purpose: Set once at startup by `bindReplayDeps`.
 * When to use: Read through `requireDeps`.
 * Expected outcome: Null until bound.
 * Exceptions: None.
 */
let boundDeps: ReplayDeps | null = null;

/**
 * Last-seen enemy markers kept aside while replay is on.
 *
 * Purpose: Past snapshots must not leave markers behind, and the live ones come back unchanged.
 * When to use: Set on entering, read on leaving.
 * Expected outcome: Copies of the three marker maps, or null when replay is off.
 * Exceptions: None.
 */
let savedMarkers: {
  readonly observed: Map<string, { h3Index: string; lastSeenTurn: number }>;
  readonly stale: typeof S.clientStaleEnemyIntelByUnitId;
  readonly rendered: Map<string, { h3Index: string; lastSeenTurn: number }>;
} | null = null;

/**
 * The battle's own state kept aside while replay steps through its beats.
 *
 * Purpose: Replay replaces the battle view with recorded beats, and the queued sub-unit marches and the pending order lists belong to the present.
 * When to use: Set on entering replay inside a battle, read on leaving.
 * Expected outcome: Copies of the battle view, the queued marches, and the six pending order lists, or null when replay is not over a battle.
 * Exceptions: None.
 */
let savedBattle: ReplayBattleCopy | null = null;

/**
 * The unit selection that existed when replay opened.
 *
 * Purpose: Replay clears the selection so nothing present is marked over a past turn, and leaving puts it back.
 * When to use: Set on entering, read and cleared on leaving.
 * Expected outcome: The selected unit ids, which are battle sub-unit ids inside a battle. Empty outside replay.
 * Exceptions: None.
 */
let savedSelection: readonly string[] = [];

/**
 * Binds the dependencies and registers the leaver.
 *
 * Purpose: Replay is wired once, from the renderer entry file.
 * When to use: At startup, after the main map interactions are wired.
 * Expected outcome: `toggleReplay` works and `requestReplayLeave` runs `leaveReplay`.
 * Exceptions: None.
 */
export function bindReplayDeps(deps: ReplayDeps): void {
  boundDeps = deps;
  registerReplayLeaver(leaveReplay);
}

/**
 * Returns the bound dependencies.
 *
 * Purpose: Replay cannot run before the renderer wires it.
 * When to use: Inside the functions below.
 * Expected outcome: The bound dependencies.
 * Exceptions: Throws when `bindReplayDeps` has not run.
 */
function requireDeps(): ReplayDeps {
  if (boundDeps === null) throw new Error('replay dependencies are not bound');
  return boundDeps;
}

/**
 * Asks whether replay may start now.
 *
 * Purpose: The check reads the screen and nothing else.
 * When to use: Before entering, and again once the timeline has arrived.
 * Expected outcome: The decision from `replayMayEnter`.
 * Exceptions: None.
 */
function entryDecision(): ReturnType<typeof replayMayEnter> {
  return replayMayEnter({
    matchLoaded: (S.gameState?.seats?.length ?? 0) > 0,
    readyInFlight: S.readyRequestInFlight,
    playbackRunning: S.resolutionMoveAnimation != null,
    otherModalOpen: blockingDialogIsOpen() || chartsDialogIsOpen(),
    newGameOpenMidMatch: newGameOverlayIsOpen() && S.gameState?.gameOver !== true,
  });
}

/**
 * Enters replay when it may start, or leaves it when it is on.
 *
 * Purpose: The `p` key does both.
 * When to use: From the window key handler.
 * Expected outcome: Replay opens on the current step, or closes. A refusal shows its sentence when it has one. When the last step cannot be put on screen, the failure is logged, `REPLAY_STEP_FAILED_REASON` is shown, and replay is left through `leaveReplay`, so the present comes back and the next `p` can try again.
 * Exceptions: None. A failed timeline read is logged and shown as a sentence.
 */
export async function toggleReplay(): Promise<void> {
  if (replayLeaving !== null) {
    await replayLeaving;
    return;
  }
  if (replayActive()) {
    await leaveReplay();
    return;
  }
  await enterReplay();
}

/**
 * Enters replay on the newest recorded step from the present.
 *
 * Purpose: One entry path for the `p` key and the game menu's Playback… item.
 * When to use: From `toggleReplay` and `openReplay`, only when replay is off and not leaving.
 * Expected outcome: Replay opens on the last step, or a refusal or failure shows its sentence, as `toggleReplay` describes.
 * Exceptions: None. A failed timeline read or a failed first step is logged and shown as a sentence.
 */
async function enterReplay(): Promise<void> {
  const decision = entryDecision();
  if (!decision.ok) {
    if (decision.reason !== null) showMapToast(decision.reason, { isError: false, skipReport: true });
    return;
  }
  const epoch = currentRendererMatchEpoch();
  let timeline;
  try {
    timeline = await window.gameApi!.readReplayTimeline();
  } catch (error) {
    console.error('readReplayTimeline failed', error);
    showMapToast(REPLAY_NO_TURNS_REASON, { isError: false, skipReport: true });
    return;
  }
  if (!rendererMatchEpochCurrent(epoch) || replayActive() || replayLeaving !== null || !entryDecision().ok) return;
  if ((timeline.scope === 'tactical') !== (S.tacticalBattleSnapshot != null)) return;
  if (timeline.steps.length === 0) {
    showMapToast(REPLAY_NO_TURNS_REASON, { isError: false, skipReport: true });
    return;
  }
  const deps = requireDeps();
  deps.hideBuildPopup();
  deps.hideStackCallout();
  savedSelection = [...S.selectedUnitIds];
  clearSelectionLikeRightClick(deps.selectionDeps);
  setAsideLastSeenMarkers();
  savedBattle = timeline.scope === 'tactical' ? copyBattleState() : null;
  ordersTabWasSelected = selectedConsoleTabId() === ORDERS_TAB_ID;
  const last = timeline.steps.length - 1;
  setReplay({ timeline, index: last, busy: false, matchEpoch: epoch, playing: false, stopRequested: false, session: nextReplaySession() });
  document.body.dataset.replay = 'on';
  refreshConsoleHeader();
  syncTacticalExitButtonElementVisibility();
  try {
    await showReplayStep(last);
  } catch (error) {
    console.error('entering replay could not show the last recorded step', error);
    showMapToast(REPLAY_STEP_FAILED_REASON, { isError: false, skipReport: true });
    await leaveReplay();
  }
}

/**
 * Enters replay, first waiting for a leave that is running.
 *
 * Purpose: The game menu's Playback… checkbox. A leave started by `p`, Escape, or the replay panel may still be running when the player checks it, so this waits for that leave and then enters.
 * When to use: From the game menu, through the action `renderer.ts` passes to `wireGameMenu`.
 * Expected outcome: Replay opens on the newest step, as `toggleReplay` enters. Does nothing when replay is already on.
 * Exceptions: None, as `enterReplay`.
 */
export async function openReplay(): Promise<void> {
  if (replayLeaving !== null) await replayLeaving;
  if (replayActive()) return;
  await enterReplay();
}

/**
 * Copies the last-seen enemy markers and clears them.
 *
 * Purpose: No live marker may be drawn over a past turn.
 * When to use: On entering replay.
 * Expected outcome: The copies are kept and the three live maps are empty.
 * Exceptions: None.
 */
function setAsideLastSeenMarkers(): void {
  savedMarkers = {
    observed: new Map(S.lastObservedEnemyByUnitId),
    stale: new Map(S.clientStaleEnemyIntelByUnitId),
    rendered: new Map(S.lastRenderedVisibleEnemyByUnitId),
  };
  S.lastObservedEnemyByUnitId.clear();
  S.clientStaleEnemyIntelByUnitId.clear();
  S.lastRenderedVisibleEnemyByUnitId.clear();
}

/**
 * Puts the battle's own state back.
 *
 * Purpose: Leaving replay shows the current beat with its queued marches and pending orders.
 * When to use: On leaving replay, before the live state is applied.
 * Expected outcome: The battle view, the queued marches, and the pending order lists hold the copies. Nothing changes when none were kept.
 * Exceptions: None.
 */
function restoreBattleState(): void {
  if (savedBattle === null) return;
  S.tacticalBattleSnapshot = savedBattle.snapshot;
  S.tacticalPendingMarches = savedBattle.marches;
  S.pendingRangedAttacks = savedBattle.rangedAttacks;
  S.pendingAirStrikes = savedBattle.airStrikes;
  S.pendingAirDrops = savedBattle.airDrops;
  S.pendingMissileLaunches = savedBattle.missileLaunches;
  S.pendingFerryOrders = savedBattle.ferryOrders;
  S.pendingEmbarkOrders = savedBattle.embarkOrders;
  savedBattle = null;
}

/**
 * Puts the kept last-seen enemy markers back.
 *
 * Purpose: Replay must leave the live markers exactly as they were.
 * When to use: On leaving replay, before the live state is applied.
 * Expected outcome: The three live maps hold the copies. Nothing changes when none were kept.
 * Exceptions: None.
 */
function restoreLastSeenMarkers(): void {
  if (savedMarkers === null) return;
  S.lastObservedEnemyByUnitId.clear();
  S.clientStaleEnemyIntelByUnitId.clear();
  S.lastRenderedVisibleEnemyByUnitId.clear();
  for (const [key, value] of savedMarkers.observed) S.lastObservedEnemyByUnitId.set(key, value);
  for (const [key, value] of savedMarkers.stale) S.clientStaleEnemyIntelByUnitId.set(key, value);
  for (const [key, value] of savedMarkers.rendered) S.lastRenderedVisibleEnemyByUnitId.set(key, value);
  savedMarkers = null;
}

/**
 * Puts the selection from before replay back.
 *
 * Purpose: Replay must not change the selection that existed before it.
 * When to use: On leaving replay, after the live snapshot is applied.
 * Expected outcome: The selection holds the kept ids that still name a living unit of the player, through `replaceSelection`, and the selection views and the map follow. Nothing happens when nothing was selected.
 * Exceptions: None.
 */
function restoreSelection(unitIds: readonly string[]): void {
  if (unitIds.length === 0) return;
  replaceSelection([...unitIds]);
  const { updateSidebar, updateRangedSidebar, redraw } = requireDeps().selectionDeps;
  updateSidebar();
  updateRangedSidebar();
  redraw();
}

/**
 * Builds the Ready dependencies from the bound replay dependencies.
 *
 * Purpose: The play loop needs the animation frame tick and the visibility helpers the live turn uses.
 * When to use: From the play loop, once replay is bound.
 * Expected outcome: A fresh dependency bundle.
 * Exceptions: Throws when `bindReplayDeps` has not run.
 */
export function replayReadyDeps(): ReadyHandlerDeps {
  return requireDeps().readyDeps();
}

/**
 * Reads one recorded step from the main process.
 *
 * Purpose: Stepping and playback load a step the same way, and a reply for a replay that ended is dropped.
 * When to use: With an index into the timeline, while no other step is loading.
 * Expected outcome: The view, with the busy flag cleared again. Null when the step is unknown, replay is off, another step is loading, or the match or replay changed while waiting. A reply for a replaced match still clears the flag of the replay that asked, so a leave waiting on it can finish. A failed read shows a sentence and keeps the old step.
 * Exceptions: None. A rejected read is logged.
 */
export async function loadReplayStep(index: number): Promise<ReplayStepView | null> {
  const state = currentReplay();
  const ref = state?.timeline.steps[index];
  if (!state || state.busy || !ref) return null;
  setReplay({ ...state, busy: true });
  let view = null;
  try {
    view = await window.gameApi!.readReplayStep({ recordId: ref.recordId });
  } catch (error) {
    console.error('readReplayStep failed', error);
  }
  const waiting = currentReplay();
  if (!waiting || waiting.session !== state.session) return null;
  setReplay({ ...waiting, busy: false });
  if (!rendererMatchEpochCurrent(state.matchEpoch)) return null;
  if (!view) showMapToast(REPLAY_STEP_FAILED_REASON, { isError: false, skipReport: true });
  return view;
}

/**
 * What presenting a loaded step needs besides the step.
 *
 * Purpose: Stepping, slider previews, and playback present a step the same way except for when the map is redrawn and whether the dialogs open.
 * When to use: The third argument of `presentReplayStep`.
 * Expected outcome: Two flags.
 * Exceptions: None.
 */
export interface PresentReplayStepOptions {
  /**
   * Whether the step is applied under an animation that is about to start.
   *
   * Contract: True applies the snapshot without redrawing, as the live turn does before its animation, so the end positions do not flash before the units move. False redraws.
   * When to use: Playback passes true for a step whose resolution it animates. Stepping passes false.
   * Expected outcome: The map draws the snapshot at once when false.
   * Exceptions: None.
   */
  readonly forPlayback: boolean;
  /**
   * Whether the step's turn update and battle result dialogs are shown.
   *
   * Contract: True shows them as the live turn did. False only applies the snapshot, for a slider preview while the thumb moves.
   * When to use: Stepping, the released slider, and playback pass true. `previewReplayStep` passes false.
   * Expected outcome: No dialog opens when false.
   * Exceptions: None.
   */
  readonly showDialogs: boolean;
}

/**
 * Puts a loaded step on screen, with both of its dialogs unless it is a preview.
 *
 * Purpose: Stepping, the slider, the turn field, and playback all show a step through here.
 * When to use: With the view `loadReplayStep` returned for `index`.
 * Expected outcome: The snapshot is applied, the dialogs are shown when `options.showDialogs` is true, and the step becomes the current one. The busy flag is set until then, and is cleared even when applying or showing throws, so a leave waiting on the step can finish.
 * Exceptions: Rethrows a failure from applying the snapshot or showing the dialogs, after the busy flag is cleared and with the old step kept as current. Nothing is shown when replay was left while the view was loading.
 */
export async function presentReplayStep(index: number, view: ReplayStepView, options: PresentReplayStepOptions): Promise<void> {
  const state = currentReplay();
  if (!state) return;
  setReplay({ ...state, busy: true });
  let shown = false;
  try {
    await requireDeps().readyDeps().applyGameStateSnapshot(view.snapshot, {
      refreshStandingOrders: false,
      updateGameStateSidebarUi: true,
      updateSelectionUi: false,
      updateGameOverUi: false,
      updateReadyButton: true,
      refreshBuildPopup: false,
      redraw: !options.forPlayback,
      replay: 'step',
    });
    if (options.showDialogs) await showReplayStepDialogs(view, state.timeline.view, requireDeps().readyDeps());
    shown = true;
  } finally {
    const applied = currentReplay();
    if (applied && applied.session === state.session) setReplay({ ...applied, ...(shown ? { index } : {}), busy: false });
  }
}

/**
 * Shows one recorded step.
 *
 * Purpose: Stepping, the slider, and the turn field all move through here.
 * When to use: With an index into the timeline. Does nothing while a step is loading or Play is running.
 * Expected outcome: The top bar and the map show that turn, both dialogs for it are shown, and the step becomes the current one once they are. With follow-units on, the camera then fits the step's units, except while replay is being left. A failed read shows a sentence and keeps the old step.
 * Exceptions: None. A reply that arrives after replay ended or the match changed is dropped.
 */
export async function showReplayStep(index: number): Promise<void> {
  if (currentReplay()?.playing) return;
  const view = await loadReplayStep(index);
  if (!view) return;
  await presentReplayStep(index, view, { forPlayback: false, showDialogs: true });
  if (replayLeaving === null) frameReplayStepIfFollowing();
}

/**
 * The console tab that holds queued orders.
 *
 * Purpose: Replay disables this tab, so entering moves the console to Commanders and leaving puts it back.
 * When to use: `toggleReplay` and `leaveReplay`.
 * Expected outcome: The id of the Orders tab button.
 * Exceptions: None.
 */
const ORDERS_TAB_ID = 'console-tab-orders';

/**
 * Whether the Orders tab was the selected tab when replay opened.
 *
 * Purpose: Leaving replay returns the console to the tab the player was using. It reads the console's own state, so a collapsed console on Orders counts, and leaving keeps it collapsed.
 * When to use: Set on entry, read and cleared on leave, and cleared when a new match drops replay.
 * Expected outcome: False outside replay.
 * Exceptions: None.
 */
let ordersTabWasSelected = false;

/**
 * The leave that is running, if any.
 *
 * Purpose: Leaving turns replay off before it reads and applies the live match. A `p` in that gap must not open a new replay that the old leave would then overwrite with the live state, the old selection, and the old console tab.
 * When to use: Set and cleared by `leaveReplay`. `toggleReplay` waits for it and does not enter while it is set. `openReplay` waits for it and then enters.
 * Expected outcome: Null unless a leave is running.
 * Exceptions: None.
 */
let replayLeaving: Promise<void> | null = null;

/**
 * Tells whether a leave is running.
 *
 * Purpose: A slider preview or a released slider must not show a step once leaving has begun, or it would compete with the leave for the screen.
 * When to use: `replayStepPreview.ts`, before it shows a step.
 * Expected outcome: True from the start of `leaveReplay` until that leave settles.
 * Exceptions: None.
 */
export function replayIsLeaving(): boolean {
  return replayLeaving !== null;
}

/**
 * Leaves replay and brings the present back, once at a time.
 *
 * Purpose: `p`, Escape, and the game menu can ask to leave while a leave is already running. They share the one that is running.
 * When to use: `p`, Escape, and the game menu.
 * Expected outcome: Resolves when the running or new leave finishes. See `runLeaveReplay`.
 * Exceptions: None. Failures inside the leave are logged there.
 */
export function leaveReplay(): Promise<void> {
  if (replayLeaving !== null) return replayLeaving;
  const leaving = runLeaveReplay().finally(() => {
    replayLeaving = null;
    setReplayLeaveRunning(false);
  });
  replayLeaving = leaving;
  setReplayLeaveRunning(true);
  return leaving;
}

/**
 * Drops replay because a new match replaced the one it belongs to.
 *
 * Purpose: The new match's state is already applied, so nothing from the old match is put back. Playback that was animating must stop, or its frames keep running and its end runs the watch's listeners over the new match. The console and Exit Battle must stop treating replay as on.
 * When to use: Where a new match's state is applied, before it is installed.
 * Expected outcome: Nothing when replay is off. Otherwise the resolution animation is cancelled, replay is off, the kept selection and console tab are forgotten, the Orders tab is enabled again through `refreshConsoleHeader`, and Exit Battle follows.
 * Exceptions: None.
 */
export function abandonReplayForNewMatch(): void {
  if (!replayActive()) return;
  clearResolutionPlaybackAnimationState();
  abandonReplay();
  savedSelection = [];
  ordersTabWasSelected = false;
  refreshConsoleHeader();
  syncTacticalExitButtonElementVisibility();
}

/**
 * Leaves replay and brings the present back.
 *
 * Purpose: Leaving shows the current turn as if the player had stepped forward to it, then applies the live state. Playback that is running is stopped and its animation cancelled first, and a step that is loading is allowed to settle.
 * When to use: Only through `leaveReplay`, so two leaves never run together.
 * Expected outcome: Replay is off, the last-seen markers and, over a battle, the battle's own state are back, the selection from before replay is back without the units that no longer exist, the console shows the Orders tab again when it was selected on entry and stays collapsed or expanded as it is, the live snapshot is on screen, and a watch that was waiting presses Ready.
 * Exceptions: None. A last step that cannot be put on screen is logged and the leave goes on to the live snapshot, so a step that always fails cannot keep replay on. A failed live read is logged and the last recorded step stays on screen.
 */
async function runLeaveReplay(): Promise<void> {
  let state = currentReplay();
  if (state?.playing) {
    setReplay({ ...state, playing: false, stopRequested: true });
    clearResolutionPlaybackAnimationState();
  }
  if (state?.busy || state?.playing) {
    await waitForStepToSettle();
    state = currentReplay();
  }
  if (!state) return;
  if (rendererMatchEpochCurrent(state.matchEpoch)) {
    try {
      await showReplayStep(state.timeline.steps.length - 1);
    } catch (error) {
      console.error('leaving replay could not show the last recorded step', error);
    }
  }
  if (!replayActive()) return;
  setReplay(null);
  delete document.body.dataset.replay;
  restoreLastSeenMarkers();
  restoreBattleState();
  const selection = savedSelection;
  savedSelection = [];
  try {
    const live = await fetchMatchSnapshot();
    await requireDeps().readyDeps().applyGameStateSnapshot(live, {
      refreshStandingOrders: true,
      updateGameStateSidebarUi: true,
      updateSelectionUi: true,
      updateGameOverUi: false,
      updateReadyButton: true,
      refreshBuildPopup: false,
      redraw: true,
      replay: 'leave',
    });
  } catch (error) {
    console.error('leaving replay could not read the live match', error);
  }
  restoreSelection(selection);
  refreshConsoleHeader();
  syncTacticalExitButtonElementVisibility();
  if (ordersTabWasSelected) selectConsoleTabKeepingCollapse(ORDERS_TAB_ID);
  ordersTabWasSelected = false;
  syncChatPanelVisibility();
  void maybeObserveAutoAdvance();
}
