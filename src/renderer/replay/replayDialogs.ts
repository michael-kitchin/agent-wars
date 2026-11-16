/**
 * Shows the two dialogs that were shown when a recorded turn began.
 *
 * Purpose: A step shows the message dialog and the update dialog again. Neither is filed in the Reports tab or the activity log a second time.
 * When to use: After a replay step's snapshot is on screen.
 * Expected outcome: Both dialogs are hidden, then each one that had content is shown. The first recorded turn shows neither.
 * Exceptions: None. A failure to build the update text is logged by the announcer and still shows the toast.
 */

import type { ReadyResult } from '../../shared/ipcTypes';
import type { ReplayStepView, ReplayView } from '../../shared/replayTypes';
import { HUMAN_SEAT_ID } from '../../shared/seatIds';
import { currentConsoleReportTag } from '../chrome/consoleReports';
import { announceResolutionTurnUpdate } from '../gameplay/readyResolutionAnnouncements';
import type { ReadyHandlerDeps } from '../gameplay/readyHandlerTypes';
import { planResolutionPlayback } from '../gameplay/resolutionPlaybackPlan';
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
  if (view.resolution !== null) await showReplayUpdateDialog(view, replayView, deps);
  if (view.dispatches.length > 0) showCommanderMessageTabs(view.dispatches, [], { fromReplay: true });
}
