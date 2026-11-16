/**
 * Shows the two dialogs that were shown when a recorded turn began.
 *
 * Purpose: A step shows the message dialog and the update dialog again. Neither is filed in the Reports tab or the activity log a second time.
 * When to use: After a replay step's snapshot is on screen.
 * Expected outcome: Both dialogs are hidden, then each one that had content is shown. The first recorded turn shows neither.
 * Exceptions: None. A failure to build the update text is logged by the announcer and still shows the toast.
 */

import type { CommitHumanTacticalDraftOrdersIpcResult, ReadyResult } from '../../shared/ipcTypes';
import type { ReplayStepView, ReplayView } from '../../shared/replayTypes';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { currentConsoleReportTag } from '../chrome/consoleReports';
import {
  announceResolutionTurnUpdate,
  buildTacticalCommitReadyResultForToast,
  deriveCombatVisibilityClassification,
  reportViewerSeatId,
} from '../gameplay/readyResolutionAnnouncements';
import type { ReadyHandlerDeps } from '../gameplay/readyHandlerTypes';
import { planResolutionPlayback } from '../gameplay/resolutionPlaybackPlan';
import { buildTacticalSubUnitKillLabelOverlay } from '../gameplay/sidebarSupport';
import { tacticalPlaybackNeeded } from '../gameplay/tacticalAnimationStart';
import { showCommanderMessageTabs } from '../openRouter/commanderMessageTabsUi';
import { hideMapToast } from '../openRouter/openRouterUiHelpers';
import { replayActive } from './replayState';

/**
 * Shows the update dialog for a step's resolution.
 *
 * Purpose: The live turn showed the update when the turn had movement or combat, or opened a battle. Replay applies the same rule to the recorded result, with the viewer and the fog of that turn.
 * When to use: From `showReplayStepDialogs`, for a step that has a recorded result.
 * Expected outcome: One update dialog when there is text. Nothing is filed in the Reports tab or the activity log.
 * Exceptions: None.
 */
async function showReplayUpdateDialog(view: ReplayStepView, replayView: ReplayView, deps: ReadyHandlerDeps): Promise<void> {
  const result = view.resolution as ReadyResult;
  const plan = planResolutionPlayback({
    readyResult: result,
    state: view.snapshot,
    humanMoves: result.humanMoves ?? [],
    visibleHexesBeforeTurn: new Set(view.visibleHexesBefore ?? []),
    deps,
  });
  if (!(plan.needsCombatOrMovementAnimation || Boolean(result.tacticalAutoStartH3Index))) return;
  const killToastFormatter = deps.buildKillToastFormatterBundle(
    view.snapshot,
    result.removedUnits,
    undefined,
    result.killLabelUnits
  );
  await announceResolutionTurnUpdate(
    {
      readySlice: result,
      visibility: plan.visibility,
      missileLaunches: plan.visibleMissileLaunches,
      visibleHexes: plan.visibleHexes,
      killToastFormatter,
      reportTag: currentConsoleReportTag(),
      holdForBattle: false,
      destroyedParents: [],
      viewerSeatId: replayView === 'player' ? HUMAN_SEAT_ID : null,
      seats: view.snapshot.seats ?? [],
      exploredHexes: new Set(view.snapshot.exploredHexes ?? []),
    },
    {
      showMapToast: (message, options) => deps.showMapToast(message, { ...options, skipReport: true }),
      appendOpenRouterLog: () => {},
      formatUnknownBattleAnnouncement: deps.formatUnknownBattleAnnouncement,
    }
  );
}

/**
 * Shows the update dialog for a battle beat's resolution.
 *
 * Purpose: The live beat announced only when its playback had something to show, and a battle has no fog, so every cell of the battle is visible to the report. Replay applies the same rule to the recorded beat, with the sub-units from before it.
 * When to use: From `showReplayStepDialogs`, for a tactical step that has a recorded result.
 * Expected outcome: One update dialog when the beat's playback needed an animation and there is text. Nothing is filed in the Reports tab or the activity log.
 * Exceptions: None.
 */
async function showReplayBeatDialog(view: ReplayStepView, replayView: ReplayView, deps: ReadyHandlerDeps): Promise<void> {
  const result = view.resolution as CommitHumanTacticalDraftOrdersIpcResult;
  const playback = result.tacticalResolutionPlayback;
  if (!playback || !tacticalPlaybackNeeded(playback)) return;
  const slice = buildTacticalCommitReadyResultForToast(playback);
  const battle = result.tacticalBattle ?? view.snapshot.tacticalBattleSession ?? null;
  const battleCells = battle?.tacticalChildH3Indexes ?? [];
  const visibleHexes = new Set([...deps.getVisibleHexSet(view.snapshot), ...battleCells]);
  const visibility = deriveCombatVisibilityClassification(slice, visibleHexes, reportViewerSeatId());
  const killToastFormatter = deps.buildKillToastFormatterBundle(
    view.snapshot,
    slice.removedUnits,
    buildTacticalSubUnitKillLabelOverlay({
      subUnitsBeforeCommit: view.subUnitsBefore ?? undefined,
      subUnitsAfterCommit: view.snapshot.tacticalBattleSession?.subUnits,
      removedUnits: slice.removedUnits,
    })
  );
  await announceResolutionTurnUpdate(
    {
      readySlice: slice,
      visibility,
      killToastFormatter,
      reportTag: currentConsoleReportTag(),
      extraKills: { killsByMelee: playback.killsByMelee, killsByAirStrike: playback.killsByAirStrike },
      hexCodeBattle: battle,
      destroyedParents: [],
      viewerSeatId: replayView === 'player' ? HUMAN_SEAT_ID : null,
      seats: view.snapshot.seats ?? [],
      exploredHexes: new Set([...(view.snapshot.exploredHexes ?? []), ...battleCells]),
    },
    {
      showMapToast: (message, options) => deps.showMapToast(message, { ...options, skipReport: true }),
      appendOpenRouterLog: () => {},
      formatUnknownBattleAnnouncement: deps.formatUnknownBattleAnnouncement,
    }
  );
}

/**
 * Shows both dialogs for one replay step.
 *
 * Purpose: A step never shows the dialogs of the step before it.
 * When to use: After a step's snapshot is applied. `replayView` is the timeline's view.
 * Expected outcome: The update dialog when the step has a recorded result that had something to show, and the message dialog when the step has dispatches. The first recorded turn shows neither.
 * Exceptions: None.
 */
export async function showReplayStepDialogs(
  view: ReplayStepView,
  replayView: ReplayView,
  deps: ReadyHandlerDeps
): Promise<void> {
  hideMapToast();
  deps.hideAiStrategyToast();
  if (!replayActive()) return;
  if (view.resolution !== null) {
    if (view.ref.scope === 'tactical') await showReplayBeatDialog(view, replayView, deps);
    else await showReplayUpdateDialog(view, replayView, deps);
  }
  if (view.dispatches.length > 0) showCommanderMessageTabs(view.dispatches, [], { fromReplay: true });
}
