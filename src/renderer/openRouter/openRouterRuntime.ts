import { isLikelyAbortError } from '../../shared/abortError';
import type { ModelCallCancelReason } from '../../shared/ipc/modelCallCancelTypes';
import { isNewGameOverlayOpen } from '../gameplay/newGameBanner';
import { hasAiStrategyToastContent, type AiStrategyToastFields } from '../../shared/aiStrategyToastContent';
import { rendererSharedState as S } from '../core/state';
import {
  applySuccessfulPrecomputedAiResult,
  resetPrecomputedAiState,
  unblockPrecomputedAiPlanningAfterBackgroundFailure,
} from './precomputedAiState';
import { AI_CONSULTATION_WAIT_TIMEOUT_MS } from '../../shared/aiConsultationLimits';
import { isDeferredResolutionPlaybackConsultPending, isWaitingForPrecomputedAiOrders } from './aiPlanningState';
import { toolGroupTooltipText } from '../chrome/controlTooltipText';

/**
 * Documents the module-scope binding `BACKGROUND_AI_REQUEST_TIMEOUT_MS` (BACKGROUND_AI_REQUEST_TIMEOUT_MS).

 * Purpose: Local name for `AI_CONSULTATION_WAIT_TIMEOUT_MS`. The old 75s timer cancelled the opening consult before the 90s model call could finish.
 * When to use: The `Promise.race` around background `requestAiOrders` in `startBackgroundRequestIfAllowed`.
 * Expected outcome: The renderer waits out one legal consultation, then cancels the IPC if it is still running.
 * Exceptions: None.
 */
const BACKGROUND_AI_REQUEST_TIMEOUT_MS = AI_CONSULTATION_WAIT_TIMEOUT_MS;

/**
 * Identity of the background `requestAiOrders` the renderer is willing to apply.
 *
 * Purpose: A late result must not clear the in-flight flag or restart planning after Run off, New, or a model change.
 * When to use: `startBackgroundRequestIfAllowed` increments it when a request starts. `invalidateBackgroundAiRequest` increments it again.
 * Expected outcome: Callbacks whose captured value differs return without writing renderer state.
 * Exceptions: None.
 */
let backgroundAiRequestSequence = 0;

/**
 * Retires every background request that has already started.
 *
 * Purpose: The bump is synchronous, so a caller does not have to wait for the cancel IPC before ignoring late results.
 * When to use: The first line of `stopOpponentPlanning`, and before Exit Battle's IPC.
 * Expected outcome: The sequence increases by one and `backgroundRequestInFlight` is false.
 * Exceptions: None.
 */
export function invalidateBackgroundAiRequest(): void {
  backgroundAiRequestSequence += 1;
  S.backgroundRequestInFlight = false;
}

/**
 * Stops opponent planning in the renderer and asks main to abort matching model calls.
 *
 * Purpose: Run off, a model change, New, and teardown share one path that invalidates before the first await.
 * When to use: Those player actions. Callers do not need to await it for the sequence bump.
 * Expected outcome: Late background results are ignored. Main logs a stop when it aborted work. A rejected IPC is logged.
 * Exceptions: A rejected cancel is written to the console and does not throw.
 */
export async function stopOpponentPlanning(reason: ModelCallCancelReason): Promise<void> {
  invalidateBackgroundAiRequest();
  try {
    await window.gameApi?.cancelRequestAiOrders?.({ reason });
  } catch (err) {
    console.error('stopOpponentPlanning failed', reason, err);
  }
}

/**
 * Documents the `OpenRouterRuntimeDeps` interface as a named contract surface (interface OpenRouterRuntimeDeps).

 * Purpose: Supports maintainability by documenting why `OpenRouterRuntimeDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let openRouterRuntimeDepsRef: OpenRouterRuntimeDeps | null = null;

/**
 * Cancels tactical opponent planning from the renderer when a battle session is torn down.
 *
 * Purpose: Exit Battle and reconciling a battle away must ignore a late prefetch. Main aborts tactical scopes only,
 * so a strategic consult that is still running is left alone. A second call aborts nothing and does not log again.
 * When to use: Tactical battle exit teardown, `tacticalReleaseRendererSessionForNewStrategicMatch`, and
 * `tacticalReconcileBattleAfterStrategicSnapshot`.
 * Expected outcome: The background sequence moves, main is asked to stop tactical work, and Ready is refreshed.
 * Exceptions: None. Safe when `openRouterRuntimeDepsRef` is unset.
 */
export function cancelInFlightBackgroundAiRequestForRendererTeardown(): void {
  invalidateBackgroundAiRequest();
  void window.gameApi?.cancelRequestAiOrders?.({ reason: 'battle_exit' });
  unblockPrecomputedAiPlanningAfterBackgroundFailure();
  openRouterRuntimeDepsRef?.updateReadyButtonState();
}

/**
 * Cancels an in-flight tactical `requestAiOrders` prefetch when the tactical session is torn down on the renderer.
 *
 * Purpose: Exiting tactical play or reconciling the battle away must cancel main-process work so a late success cannot call `applySuccessfulPrecomputedAiResult` against a null snapshot.
 * When to use: Start of `tacticalReleaseRendererSessionForNewStrategicMatch` and `tacticalReconcileBattleAfterStrategicSnapshot` before clearing `S.tacticalBattleSnapshot`.
 * Expected outcome: Delegates to `cancelInFlightBackgroundAiRequestForRendererTeardown` with the session-ended log line.
 * Exceptions: None.
 */
export function cancelTacticalScopedBackgroundPrefetchForSessionTeardown(): void {
  cancelInFlightBackgroundAiRequestForRendererTeardown();
}

interface OpenRouterRuntimeDeps {
    /**
   * Specifies the contract for the `appendOpenRouterLog` member (appendOpenRouterLog: (line: string, isError?: boolean) => void;).

   * Contract: Describes stable behavior for callers of `appendOpenRouterLog` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
appendOpenRouterLog: (line: string, isError?: boolean) => void;
    /**
   * Specifies the contract for the `updateReadyButtonState` member (updateReadyButtonState: () => void;).

   * Contract: Describes stable behavior for callers of `updateReadyButtonState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateReadyButtonState: () => void;
    /**
   * Specifies the contract for the `updateOpenRouterToolCountLabels` member (updateOpenRouterToolCountLabels: () => void;).

   * Contract: Describes stable behavior for callers of `updateOpenRouterToolCountLabels` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateOpenRouterToolCountLabels: () => void;
    /**
   * Specifies the contract for the `updateOpenRouterCostLabel` member (updateOpenRouterCostLabel: () => void;).

   * Contract: Describes stable behavior for callers of `updateOpenRouterCostLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateOpenRouterCostLabel: () => void;
    /**
   * Specifies the contract for the `showSidebarError` member (showSidebarError: (message: string) => void;).

   * Contract: Describes stable behavior for callers of `showSidebarError` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
  showSidebarError: (message: string) => void;
    /**
   * Specifies the contract for the `showAiStrategyToast` member (showAiStrategyToast: (content: AiStrategyToastFields) => void;).

   * Contract: Displays Message and Strategy sections from a background `requestAiOrders` during tactical planning.
   * When to use: After a successful tactical background request when either field is present.
   * Expected outcome: Non-empty fields become visible until timeout or dismiss.
   * Exceptions: None.
   */
  showAiStrategyToast: (content: AiStrategyToastFields) => void;
    /**
   * Specifies the contract for the `requestRedraw` member (requestRedraw?: () => void;).

   * Contract: Optional canvas refresh after AI results that only touch renderer state (e.g. tactical snapshot updates).
   * When to use: Wired from the main renderer so background `requestAiOrders` can repaint the tactical map.
   * Expected outcome: No-op when omitted; invoked after `applySuccessfulPrecomputedAiResult` when `tacticalBattle` is present.
   * Exceptions: None.
   */
requestRedraw?: () => void;
}

/**
 * Defines the `syncEventDrivenFromTools` function shape (export function syncEventDrivenFromTools(): void).

 * Purpose: Supports maintainability by documenting why `syncEventDrivenFromTools` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function syncEventDrivenFromTools(): void {
  S.useEventDrivenConsultation = S.enabledToolGroups.has('events');
}

/**
 * True when a background `requestAiOrders` is allowed for the current strategic phase or tactical overlay.
 *
 * Purpose: `startBackgroundRequestIfAllowed` originally required strategic `planning`, which blocked tactical
 * opponent fetches while the enclosing turn stayed in `resolution` (melee intercept → tactical). Event-driven mode
 * must not block tactical-only consultations: opponent draft requests use tactical state, not strategic pending orders.
 * When to use: First gate inside `startBackgroundRequestIfAllowed` after `isWaitingForPrecomputedAiOrders`.
 * Expected outcome: Tactical planning with an active tactical snapshot always permits the fetch; strategic play still
 * requires `planning` when not in tactical UI.
 * Exceptions: None.
 */
function strategicPhaseAllowsBackgroundAi(): boolean {
  if (S.gameState?.phase === 'planning') return true;
  return !!(S.tacticalBattleSnapshot && S.tacticalPhasePlanning);
}

/**
 * Starts the background opponent-planning request when Ready is waiting on it.
 *
 * Purpose: Starts at most one background `requestAiOrders` when Run is on and Ready is waiting on an opponent plan
 * (strategic precompute or tactical opponent draft).
 * When to use: After any state change that may leave Ready waiting on AI planning: Run on, a new game, a successful
 * Ready or beat commit, the Events toggle.
 * Expected outcome: Applies a successful result to the precomputed buffers; on failure or cancel, restarts once if still
 * waiting, otherwise releases Ready with an empty plan. No request while the annihilation dialog is open or a deferred
 * consult is pending. Editing the player's draft never affects an in-flight request.
 * Exceptions: None; failures are logged to the activity log and the sidebar.
 */
export function startBackgroundRequestIfAllowed(deps: OpenRouterRuntimeDeps): void {
  if (S.tacticalAnnihilationOutcomeDialog != null) return;
  if (isNewGameOverlayOpen()) return;
  if (isDeferredResolutionPlaybackConsultPending()) return;
  if (S.backgroundRequestInFlight || !isWaitingForPrecomputedAiOrders() || !strategicPhaseAllowsBackgroundAi()) return;
  openRouterRuntimeDepsRef = deps;
  const keyPromise = window.gameApi?.openRouter?.getKey?.();
  const modelPromise = window.gameApi?.openRouter?.getSelectedModel?.();
  if (!keyPromise || !modelPromise) return;
  const requestSequence = ++backgroundAiRequestSequence;
  S.backgroundRequestInFlight = true;
  Promise.all([keyPromise, modelPromise]).then(([keyResult, modelId]) => {
    if (requestSequence !== backgroundAiRequestSequence) return;
    if (!keyResult?.hasKey || !modelId?.trim()) {
      S.backgroundRequestInFlight = false;
      deps.appendOpenRouterLog('Run is on but API key or model not set.', true);
      deps.updateReadyButtonState();
      return;
    }
    if (!S.runButtonOn || !window.gameApi?.requestAiOrders) {
      S.backgroundRequestInFlight = false;
      deps.updateReadyButtonState();
      return;
    }
    const enabledToolGroupsPayload = Array.from(S.enabledToolGroups).filter((id) => id !== 'events');
    const requestPromise = window.gameApi.requestAiOrders({ enabledToolGroups: enabledToolGroupsPayload });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`AI planning timed out after ${BACKGROUND_AI_REQUEST_TIMEOUT_MS}ms`)),
        BACKGROUND_AI_REQUEST_TIMEOUT_MS
      );
    });
    const settleTimer = (): void => {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
    Promise.race([requestPromise, timeoutPromise])
      .then((result) => {
        settleTimer();
        if (requestSequence !== backgroundAiRequestSequence) return;
        S.backgroundRequestInFlight = false;
        if (S.useEventDrivenConsultation && !S.eventDrivenInitialConsultationDone) {
          S.eventDrivenInitialConsultationDone = true;
        }
        if (S.runButtonOn && result.success) {
          if (!S.tacticalBattleSnapshot && (result.tacticalBattle != null || result.tacticalOpponentPlan != null)) {
            deps.appendOpenRouterLog('Discarded tactical prefetch (tactical session no longer active).', false);
            deps.updateReadyButtonState();
            return;
          }
          applySuccessfulPrecomputedAiResult(result);
          if (
            S.tacticalBattleSnapshot &&
            S.tacticalPhasePlanning &&
            hasAiStrategyToastContent({ message: result.message, strategy: result.strategy })
          ) {
            deps.showAiStrategyToast({ message: result.message, strategy: result.strategy });
          }
          if (result.tacticalBattle) {
            deps.requestRedraw?.();
          }
          if (result.toolInvocationCounts) {
            S.precomputedToolInvocationCounts = { ...result.toolInvocationCounts };
            for (const [groupId, count] of Object.entries(result.toolInvocationCounts)) {
              S.toolInvocationCounts[groupId] = count;
            }
            deps.updateOpenRouterToolCountLabels();
          } else {
            S.precomputedToolInvocationCounts = null;
          }
          if (result.cost !== undefined) {
            S.openRouterGameCost += result.cost;
            deps.updateOpenRouterCostLabel();
          }
        } else if (!result.success) {
          if (result.error === 'Cancelled') {
            // A deliberate cancel (Run off, Events toggled, key or model removed, session teardown) ends here, so no
            // error toast. Restart before releasing the Ready latch: unblocking first installs an empty tactical draft,
            // which makes isWaitingForPrecomputedAiOrders false and makes the restart decline. When nothing restarts,
            // unblock so Ready is not stuck.
            startBackgroundRequestIfAllowed(deps);
            if (!S.backgroundRequestInFlight) {
              if (S.runButtonOn) {
                deps.appendOpenRouterLog(
                  'AI planning did not restart after the cancel; this beat proceeds without opponent orders.',
                  true
                );
              }
              unblockPrecomputedAiPlanningAfterBackgroundFailure();
            }
          } else {
            deps.appendOpenRouterLog(`Background planning failed: ${result.error ?? 'Unknown error'}`, true);
            deps.showSidebarError(result.error ?? 'Background AI request failed');
            unblockPrecomputedAiPlanningAfterBackgroundFailure();
          }
        }
        deps.updateReadyButtonState();
      })
      .catch((err) => {
        settleTimer();
        if (requestSequence !== backgroundAiRequestSequence) return;
        const msg = String(err);
        const isAbort = isLikelyAbortError(err);
        if (!isAbort) {
          void stopOpponentPlanning('teardown');
        }
        S.backgroundRequestInFlight = false;
        if (isAbort && S.tacticalBattleSnapshot && S.tacticalPhasePlanning) {
          deps.appendOpenRouterLog('Tactical AI prefetch aborted.', false);
          deps.updateReadyButtonState();
          if (isWaitingForPrecomputedAiOrders()) {
            startBackgroundRequestIfAllowed(deps);
          }
          return;
        }
        deps.appendOpenRouterLog(`Background planning request rejected: ${msg}`, true);
        deps.showSidebarError(msg);
        unblockPrecomputedAiPlanningAfterBackgroundFailure();
        deps.updateReadyButtonState();
      });
  }).catch((err) => {
    if (requestSequence !== backgroundAiRequestSequence) return;
    S.backgroundRequestInFlight = false;
    deps.showSidebarError(String(err));
    unblockPrecomputedAiPlanningAfterBackgroundFailure();
    deps.updateReadyButtonState();
  });
}

/**
 * Defines the `handleEventDrivenModeTransition` function shape (function handleEventDrivenModeTransition(deps: OpenRouterRuntimeDeps, wasEventDriven: boolean): void).

 * Purpose: Supports maintainability by documenting why `handleEventDrivenModeTransition` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function handleEventDrivenModeTransition(deps: OpenRouterRuntimeDeps, wasEventDriven: boolean): void {
  if (!S.runButtonOn || wasEventDriven === S.useEventDrivenConsultation) return;
  void stopOpponentPlanning('teardown');
  resetPrecomputedAiState('null');
  S.eventDrivenInitialConsultationDone = false;
  startBackgroundRequestIfAllowed(deps);
}

/**
 * Defines the `renderOpenRouterToolsList` function shape (export function renderOpenRouterToolsList(deps: OpenRouterRuntimeDeps): void).

 * Purpose: Supports maintainability by documenting why `renderOpenRouterToolsList` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function renderOpenRouterToolsList(deps: OpenRouterRuntimeDeps): void {
  const container = document.getElementById('openrouter-tools-list');
  if (!container) return;
  container.innerHTML = '';
  for (const group of S.openRouterToolGroups) {
    const cell = document.createElement('div');
    cell.className = 'openrouter-tool-cell';
    const tip = toolGroupTooltipText(group.id);
    if (tip) cell.setAttribute('data-control-tooltip', tip);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'openrouter-tool-toggle';
    btn.setAttribute('data-tool-group', group.id);
    btn.setAttribute('aria-pressed', S.enabledToolGroups.has(group.id) ? 'true' : 'false');
    btn.textContent = String(S.toolInvocationCounts[group.id] ?? 0);
    btn.addEventListener('click', () => {
      if (S.enabledToolGroups.has(group.id)) {
        S.enabledToolGroups.delete(group.id);
      } else {
        S.enabledToolGroups.add(group.id);
      }
      btn.setAttribute('aria-pressed', S.enabledToolGroups.has(group.id) ? 'true' : 'false');
      btn.textContent = String(S.toolInvocationCounts[group.id] ?? 0);
      if (group.id === 'events') {
        const wasEventDriven = S.useEventDrivenConsultation;
        syncEventDrivenFromTools();
        handleEventDrivenModeTransition(deps, wasEventDriven);
        deps.updateReadyButtonState();
      }
    });
    cell.appendChild(btn);
    const label = document.createElement('span');
    label.className = 'openrouter-tool-label';
    label.textContent = group.label;
    cell.appendChild(label);
    container.appendChild(cell);
  }
}
