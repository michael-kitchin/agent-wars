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
import { refreshConsoleHeader, showConsoleTab } from '../chrome/consoleFrame';
import { currentRendererMatchEpoch, rendererMatchEpochCurrent } from '../core/matchEpoch';
import { fetchMatchSnapshot } from '../core/matchSnapshotClient';
import { rendererSharedState as S } from '../core/state';
import { newGameOverlayIsOpen } from '../gameplay/newGameDialogCollapse';
import type { ReadyHandlerDeps } from '../gameplay/readyHandlerTypes';
import { clearSelectionLikeRightClick, type SelectionClearRefreshDeps } from '../map/mapClickSelectionPolicy';
import { syncTacticalExitButtonElementVisibility } from '../tactical/tacticalExitButtonDom';
import { clearResolutionPlaybackAnimationState } from '../tactical/tacticalUiOrchestration';
import { showMapToast } from '../openRouter/openRouterUiHelpers';
import { maybeObserveAutoAdvance } from '../gameplay/observeChrome';
import { showReplayStepDialogs } from './replayDialogs';
import { currentReplay, nextReplaySession, registerReplayLeaver, replayActive, setReplay, waitForReplayIdle } from './replayState';

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
let savedBattle: {
  readonly snapshot: typeof S.tacticalBattleSnapshot;
  readonly marches: typeof S.tacticalPendingMarches;
  readonly rangedAttacks: typeof S.pendingRangedAttacks;
  readonly airStrikes: typeof S.pendingAirStrikes;
  readonly airDrops: typeof S.pendingAirDrops;
  readonly missileLaunches: typeof S.pendingMissileLaunches;
  readonly ferryOrders: typeof S.pendingFerryOrders;
  readonly embarkOrders: typeof S.pendingEmbarkOrders;
} | null = null;

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
 * Expected outcome: Replay opens on the current step, or closes. A refusal shows its sentence when it has one.
 * Exceptions: None. A failed timeline read is logged and shown as a sentence.
 */
export async function toggleReplay(): Promise<void> {
  if (replayActive()) {
    await leaveReplay();
    return;
  }
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
  if (!rendererMatchEpochCurrent(epoch) || replayActive() || !entryDecision().ok) return;
  if ((timeline.scope === 'tactical') !== (S.tacticalBattleSnapshot != null)) return;
  if (timeline.steps.length === 0) {
    showMapToast(REPLAY_NO_TURNS_REASON, { isError: false, skipReport: true });
    return;
  }
  const deps = requireDeps();
  deps.hideBuildPopup();
  deps.hideStackCallout();
  clearSelectionLikeRightClick(deps.selectionDeps);
  setAsideLastSeenMarkers();
  if (timeline.scope === 'tactical') setAsideBattleState();
  ordersTabWasSelected = document.getElementById(ORDERS_TAB_ID)?.getAttribute('aria-selected') === 'true';
  const last = timeline.steps.length - 1;
  setReplay({ timeline, index: last, busy: false, matchEpoch: epoch, playing: false, stopRequested: false, session: nextReplaySession() });
  document.body.dataset.replay = 'on';
  refreshConsoleHeader();
  syncTacticalExitButtonElementVisibility();
  await showReplayStep(last);
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
 * Copies the battle's own state and keeps it aside.
 *
 * Purpose: Replaying a battle's beats must leave the queued marches and the pending orders as they were.
 * When to use: On entering replay while a battle is open.
 * Expected outcome: The battle view, the queued marches, and the pending order lists are copied. The live values stay where they are.
 * Exceptions: None.
 */
function setAsideBattleState(): void {
  savedBattle = {
    snapshot: S.tacticalBattleSnapshot,
    marches: S.tacticalPendingMarches.map((row) => ({ ...row })),
    rangedAttacks: [...S.pendingRangedAttacks],
    airStrikes: [...S.pendingAirStrikes],
    airDrops: [...S.pendingAirDrops],
    missileLaunches: [...S.pendingMissileLaunches],
    ferryOrders: [...S.pendingFerryOrders],
    embarkOrders: [...S.pendingEmbarkOrders],
  };
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
 * Expected outcome: The view, with the busy flag cleared again. Null when the step is unknown, replay is off, another step is loading, or the match or replay changed while waiting. A failed read shows a sentence and keeps the old step.
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
  if (!waiting || waiting.session !== state.session || !rendererMatchEpochCurrent(state.matchEpoch)) return null;
  setReplay({ ...waiting, busy: false });
  if (!view) showMapToast(REPLAY_STEP_FAILED_REASON, { isError: false, skipReport: true });
  return view;
}

/**
 * What presenting a loaded step needs besides the step.
 *
 * Purpose: Stepping and playback present a step the same way except for when the map is redrawn.
 * When to use: The third argument of `presentReplayStep`.
 * Expected outcome: One flag.
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
}

/**
 * Puts a loaded step on screen with both of its dialogs.
 *
 * Purpose: Stepping, the slider, the turn field, and playback all show a step through here.
 * When to use: With the view `loadReplayStep` returned for `index`.
 * Expected outcome: The snapshot is applied, the dialogs are shown, and the step becomes the current one. The busy flag is set until then.
 * Exceptions: None. Nothing is shown when replay was left while the view was loading.
 */
export async function presentReplayStep(index: number, view: ReplayStepView, options: PresentReplayStepOptions): Promise<void> {
  const state = currentReplay();
  if (!state) return;
  setReplay({ ...state, busy: true });
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
  await showReplayStepDialogs(view, state.timeline.view, requireDeps().readyDeps());
  const applied = currentReplay();
  if (applied && applied.session === state.session) setReplay({ ...applied, index, busy: false });
}

/**
 * Shows one recorded step.
 *
 * Purpose: Stepping, the slider, and the turn field all move through here.
 * When to use: With an index into the timeline. Does nothing while a step is loading or Play is running.
 * Expected outcome: The top bar and the map show that turn, both dialogs for it are shown, and the step becomes the current one once they are. A failed read shows a sentence and keeps the old step.
 * Exceptions: None. A reply that arrives after replay ended or the match changed is dropped.
 */
export async function showReplayStep(index: number): Promise<void> {
  if (currentReplay()?.playing) return;
  const view = await loadReplayStep(index);
  if (view) await presentReplayStep(index, view, { forPlayback: false });
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
 * Purpose: Leaving replay returns the console to the tab the player was using.
 * When to use: Set on entry, read and cleared on leave.
 * Expected outcome: False outside replay.
 * Exceptions: None.
 */
let ordersTabWasSelected = false;

/**
 * Leaves replay and brings the present back.
 *
 * Purpose: Leaving shows the current turn as if the player had stepped forward to it, then applies the live state. Playback that is running is stopped and its animation cancelled first.
 * When to use: `p`, Escape, the game menu, and a new match.
 * Expected outcome: Replay is off, the last-seen markers and, over a battle, the battle's own state are back, the console shows the Orders tab again when it was selected on entry, the live snapshot is on screen, and a watch that was waiting presses Ready.
 * Exceptions: None. A failed live read is logged and the last recorded step stays on screen.
 */
export async function leaveReplay(): Promise<void> {
  let state = currentReplay();
  if (state?.playing) {
    setReplay({ ...state, playing: false, stopRequested: true });
    clearResolutionPlaybackAnimationState();
    await waitForReplayIdle();
    state = currentReplay();
  }
  if (!state || state.busy) return;
  await showReplayStep(state.timeline.steps.length - 1);
  if (!replayActive()) return;
  setReplay(null);
  delete document.body.dataset.replay;
  restoreLastSeenMarkers();
  restoreBattleState();
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
  refreshConsoleHeader();
  syncTacticalExitButtonElementVisibility();
  if (ordersTabWasSelected) showConsoleTab(ORDERS_TAB_ID);
  ordersTabWasSelected = false;
  syncChatPanelVisibility();
  void maybeObserveAutoAdvance();
}
