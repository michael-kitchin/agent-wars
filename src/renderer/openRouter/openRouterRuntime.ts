import { isLikelyAbortError } from '../../shared/abortError';
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
 * Documents the `OpenRouterRuntimeDeps` interface as a named contract surface (interface OpenRouterRuntimeDeps).

 * Purpose: Supports maintainability by documenting why `OpenRouterRuntimeDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let openRouterRuntimeDepsRef: OpenRouterRuntimeDeps | null = null;

/**
 * Log line when background `requestAiOrders` is cancelled because the main/renderer tactical session ended (reconcile, new game).
 *
 * Purpose: Single source for grep and copy used by `cancelTacticalScopedBackgroundPrefetchForSessionTeardown`.
 * When to use: Pass to `cancelInFlightBackgroundAiRequestForRendererTeardown`; do not concatenate ad hoc at call sites.
 * Expected outcome: Matches prior user-visible OpenRouter log wording.
 * Exceptions: None.
 */
export const OPEN_ROUTER_LOG_BACKGROUND_AI_CANCEL_SESSION_ENDED =
  'Tactical AI prefetch cancelled (tactical session ended).';

/**
 * Log line when background `requestAiOrders` is cancelled because the player exited tactical combat voluntarily.
 *
 * Purpose: Single source for `tacticalBattleExitTeardownTransientRendererState` in `tacticalUiOrchestration.ts`.
 * When to use: Pass to `cancelInFlightBackgroundAiRequestForRendererTeardown` from tactical exit teardown only.
 * Expected outcome: Matches prior user-visible OpenRouter log wording.
 * Exceptions: None.
 */
export const OPEN_ROUTER_LOG_BACKGROUND_AI_CANCEL_TACTICAL_BATTLE_EXIT =
  'Background AI request cancelled (exiting tactical battle).';

/**
 * Cancels any in-flight `requestAiOrders` work from the renderer (tactical prefetch or strategic background planning).
 *
 * Purpose: Battle exit, session reconciliation, and similar teardown must abort main-process AI work and release the
 * Ready latch so a late result is never applied to a torn-down session.
 * When to use: Tactical battle exit, `tacticalReleaseRendererSessionForNewStrategicMatch`, `tacticalReconcileBattleAfterStrategicSnapshot`, and other renderer teardown that must not apply late AI results.
 * Expected outcome: No-op when no background request; otherwise `cancelRequestAiOrders`, cleared in-flight flags, log line, `unblockPrecomputedAiPlanningAfterBackgroundFailure`, and Ready UI refresh.
 * Exceptions: None; safe when `openRouterRuntimeDepsRef` is unset (still cancels on main).
 */
export function cancelInFlightBackgroundAiRequestForRendererTeardown(logLine: string): void {
  if (!S.backgroundRequestInFlight) return;
  void window.gameApi?.cancelRequestAiOrders?.();
  S.backgroundRequestInFlight = false;
  openRouterRuntimeDepsRef?.appendOpenRouterLog(logLine, false);
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
  cancelInFlightBackgroundAiRequestForRendererTeardown(OPEN_ROUTER_LOG_BACKGROUND_AI_CANCEL_SESSION_ENDED);
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
  if (isDeferredResolutionPlaybackConsultPending()) return;
  if (S.backgroundRequestInFlight || !isWaitingForPrecomputedAiOrders() || !strategicPhaseAllowsBackgroundAi()) return;
  openRouterRuntimeDepsRef = deps;
  const keyPromise = window.gameApi?.openRouter?.getKey?.();
  const modelPromise = window.gameApi?.openRouter?.getSelectedModel?.();
  if (!keyPromise || !modelPromise) return;
  S.backgroundRequestInFlight = true;
  Promise.all([keyPromise, modelPromise]).then(([keyResult, modelId]) => {
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
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      setTimeout(() => reject(new Error(`AI planning timed out after ${BACKGROUND_AI_REQUEST_TIMEOUT_MS}ms`)), BACKGROUND_AI_REQUEST_TIMEOUT_MS);
    });
    Promise.race([requestPromise, timeoutPromise])
      .then((result) => {
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
        const msg = String(err);
        const isAbort = isLikelyAbortError(err);
        if (!isAbort) {
          window.gameApi?.cancelRequestAiOrders?.();
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
  window.gameApi?.cancelRequestAiOrders?.();
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
