import { isLikelyAbortError } from '../../shared/abortError';
import { buildTacticalHumanDraftPrefetchFingerprint } from '../../shared/tacticalHumanDraftPrefetchFingerprint';
import { rendererSharedState as S } from '../core/state';
import {
  applySuccessfulPrecomputedAiResult,
  resetPrecomputedAiState,
  unblockPrecomputedAiPlanningAfterBackgroundFailure,
} from './precomputedAiState';
import { isDeferredResolutionPlaybackConsultPending, isWaitingForPrecomputedAiOrders } from './aiPlanningState';

/**
 * Documents the module-scope binding `BACKGROUND_AI_REQUEST_TIMEOUT_MS` (BACKGROUND_AI_REQUEST_TIMEOUT_MS).

 * Purpose: Supports maintainability by documenting why `BACKGROUND_AI_REQUEST_TIMEOUT_MS` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
const BACKGROUND_AI_REQUEST_TIMEOUT_MS = 75_000;

/**
 * Documents the `OpenRouterRuntimeDeps` interface as a named contract surface (interface OpenRouterRuntimeDeps).

 * Purpose: Supports maintainability by documenting why `OpenRouterRuntimeDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
let openRouterRuntimeDepsRef: OpenRouterRuntimeDeps | null = null;

/**
 * Builds the Phase 4 tactical human-draft fingerprint from live renderer shared state.
 *
 * Purpose: Keeps fingerprint construction next to prefetch lifecycle without importing `S` into shared pure helpers.
 * When to use: Only from `startBackgroundRequestIfAllowed` / stale checks in this module.
 * Expected outcome: Same string as `buildTacticalHumanDraftPrefetchFingerprint` on current `S` draft slices.
 * Exceptions: None.
 */
function tacticalHumanDraftFingerprintNow(): string {
  return buildTacticalHumanDraftPrefetchFingerprint({
    tacticalPendingMarches: S.tacticalPendingMarches,
    pendingRangedAttacks: S.pendingRangedAttacks,
    pendingAirStrikes: S.pendingAirStrikes,
    pendingFerryOrders: S.pendingFerryOrders,
    pendingEmbarkOrders: S.pendingEmbarkOrders,
  });
}

/**
 * Aborts an in-flight tactical prefetch when the human’s draft rows changed after the request started.
 *
 * Purpose: Phase 4 — avoids applying an opponent plan computed from obsolete human orders; pairs with response-time
 * fingerprint checks for races where cancel arrives too late.
 * When to use: After any mutation to tactical pending marches, ranged, air, ferry, or embark lists while Run prefetch may be active.
 * Expected outcome: `cancelRequestAiOrders` runs only when fingerprint differs from the value captured at request start.
 * Exceptions: None when `startBackgroundRequestIfAllowed` has not run yet (`openRouterRuntimeDepsRef` unset).
 */
export function invalidateTacticalPrefetchIfHumanDraftChangedSinceRequestStart(): void {
  if (!S.backgroundRequestInFlight) return;
  if (!S.tacticalBattleSnapshot || !S.tacticalPhasePlanning) return;
  const started = S.tacticalPrefetchFingerprintWhenRequestStarted;
  if (started === null) return;
  if (tacticalHumanDraftFingerprintNow() === started) return;
  window.gameApi?.cancelRequestAiOrders?.();
  openRouterRuntimeDepsRef?.appendOpenRouterLog('Tactical AI prefetch cancelled (human draft changed).', false);
}

/**
 * Runs synchronous tactical human-draft list mutations, then applies prefetch invalidation in one place.
 *
 * Purpose: Keeps `invalidateTacticalPrefetchIfHumanDraftChangedSinceRequestStart` co-located with every mutation path so new draft edits cannot forget the trailing check.
 * When to use: Wrap only code that mutates `S.tacticalPendingMarches`, `S.pendingRangedAttacks`, `S.pendingAirStrikes`, `S.pendingFerryOrders`, or `S.pendingEmbarkOrders` during tactical planning.
 * Expected outcome: Same cancel/log behavior as calling `invalidateTacticalPrefetchIfHumanDraftChangedSinceRequestStart` immediately after `run` completes.
 * Exceptions: None.
 */
export function withTacticalHumanDraftPrefetchInvalidation(run: () => void): void {
  run();
  invalidateTacticalPrefetchIfHumanDraftChangedSinceRequestStart();
}

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
 * Purpose: `cancelTacticalScopedBackgroundPrefetchForSessionTeardown` previously skipped cancellation when
 * `tacticalPrefetchFingerprintWhenRequestStarted` was null, leaving strategic prefetch running during tactical teardown.
 * Exit battle and session reconciliation must always abort main-process AI work and unblock Ready-equivalent latches.
 * When to use: Tactical battle exit, `tacticalReleaseRendererSessionForNewStrategicMatch`, `tacticalReconcileBattleAfterStrategicSnapshot`, and other renderer teardown that must not apply late AI results.
 * Expected outcome: No-op when no background request; otherwise `cancelRequestAiOrders`, cleared in-flight flags, log line, `unblockPrecomputedAiPlanningAfterBackgroundFailure`, and Ready UI refresh.
 * Exceptions: None; safe when `openRouterRuntimeDepsRef` is unset (still cancels on main).
 */
export function cancelInFlightBackgroundAiRequestForRendererTeardown(logLine: string): void {
  if (!S.backgroundRequestInFlight) {
    S.tacticalPrefetchFingerprintWhenRequestStarted = null;
    return;
  }
  void window.gameApi?.cancelRequestAiOrders?.();
  S.backgroundRequestInFlight = false;
  S.tacticalPrefetchFingerprintWhenRequestStarted = null;
  openRouterRuntimeDepsRef?.appendOpenRouterLog(logLine, false);
  unblockPrecomputedAiPlanningAfterBackgroundFailure();
  openRouterRuntimeDepsRef?.updateReadyButtonState();
}

/**
 * Cancels an in-flight tactical `requestAiOrders` prefetch when the res4 tactical session is torn down on the renderer.
 *
 * Purpose: `invalidateTacticalPrefetchIfHumanDraftChangedSinceRequestStart` only runs while `S.tacticalBattleSnapshot` and planning are true; exiting tactical or reconciling away the battle must still cancel main work so a late success cannot call `applySuccessfulPrecomputedAiResult` against a null snapshot.
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
   * Specifies the contract for the `showAiStrategyToast` member (showAiStrategyToast: (content: string) => void;).

   * Contract: Displays the same LLM strategy toast used after strategic Ready when the model returns a `strategy` field.
   * When to use: After a successful tactical background `requestAiOrders` when `result.strategy` is present and the player is in tactical planning.
   * Expected outcome: Non-empty strategy text becomes visible until timeout or dismiss.
   * Exceptions: None.
   */
  showAiStrategyToast: (content: string) => void;
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
 * Expected outcome: Tactical planning with an active res4 snapshot always permits the fetch; strategic play still
 * requires `planning` when not in tactical UI.
 * Exceptions: None.
 */
function strategicPhaseAllowsBackgroundAi(): boolean {
  if (S.gameState?.phase === 'planning') return true;
  return !!(S.tacticalBattleSnapshot && S.tacticalPhasePlanning);
}

/**
 * Defines the `startBackgroundRequestIfAllowed` function shape (export function startBackgroundRequestIfAllowed(deps: OpenRouterRuntimeDeps): void).

 * Purpose: Supports maintainability by documenting why `startBackgroundRequestIfAllowed` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: No `requestAiOrders` while the tactical annihilation game-over modal is open.
 * Exceptions: None.
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
      S.tacticalPrefetchFingerprintWhenRequestStarted = null;
      deps.appendOpenRouterLog('Run is on but API key or model not set.', true);
      deps.updateReadyButtonState();
      return;
    }
    if (!S.runButtonOn || !window.gameApi?.requestAiOrders) {
      S.backgroundRequestInFlight = false;
      S.tacticalPrefetchFingerprintWhenRequestStarted = null;
      deps.updateReadyButtonState();
      return;
    }
    const enabledToolGroupsPayload = Array.from(S.enabledToolGroups).filter((id) => id !== 'events');
    if (S.tacticalBattleSnapshot && S.tacticalPhasePlanning) {
      S.tacticalPrefetchFingerprintWhenRequestStarted = tacticalHumanDraftFingerprintNow();
    } else {
      S.tacticalPrefetchFingerprintWhenRequestStarted = null;
    }
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
        const startedFp = S.tacticalPrefetchFingerprintWhenRequestStarted;
        const tacticalPlanningCtx = !!(S.tacticalBattleSnapshot && S.tacticalPhasePlanning);
        const nowFp = tacticalPlanningCtx ? tacticalHumanDraftFingerprintNow() : null;
        const staleTacticalPrefetch =
          result.success &&
          tacticalPlanningCtx &&
          startedFp !== null &&
          nowFp !== null &&
          nowFp !== startedFp &&
          'tacticalOpponentPlan' in result &&
          result.tacticalOpponentPlan != null;
        if (staleTacticalPrefetch) {
          S.tacticalPrefetchFingerprintWhenRequestStarted = null;
          deps.appendOpenRouterLog(
            'Discarded stale tactical prefetch (human draft changed during AI request).',
            false
          );
          deps.updateReadyButtonState();
          startBackgroundRequestIfAllowed(deps);
          return;
        }
        S.tacticalPrefetchFingerprintWhenRequestStarted = null;
        if (S.runButtonOn && result.success) {
          if (!S.tacticalBattleSnapshot && (result.tacticalBattle != null || result.tacticalOpponentPlan != null)) {
            deps.appendOpenRouterLog('Discarded tactical prefetch (tactical session no longer active).', false);
            deps.updateReadyButtonState();
            return;
          }
          applySuccessfulPrecomputedAiResult(result);
          if (S.tacticalBattleSnapshot && S.tacticalPhasePlanning && result.strategy) {
            deps.showAiStrategyToast(result.strategy);
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
            // Intentional cancel triggered by a human draft change; invalidateTacticalPrefetchIfHumanDraftChangedSinceRequestStart
            // already logged the event — no error toast needed. Restart against the new draft before releasing the
            // Ready latch: unblocking first installs an empty tactical draft, which makes isWaitingForPrecomputedAiOrders
            // false and causes the restart to decline, leaving the beat with no opponent orders at all.
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
        S.tacticalPrefetchFingerprintWhenRequestStarted = null;
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
    S.tacticalPrefetchFingerprintWhenRequestStarted = null;
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
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'openrouter-tool-toggle';
    btn.setAttribute('data-tool-group', group.id);
    btn.setAttribute('aria-pressed', S.enabledToolGroups.has(group.id) ? 'true' : 'false');
    if (group.id === 'precomputation') {
      btn.title = "When on, run assess_unit, assess_hex, and estimate_combat before the LLM and inject the Commander's Briefing into the prompt.";
    } else if (group.id === 'events') {
      btn.title = 'When on, use event-driven consultation (pending orders or standing-order-only; no background AI request).';
    }
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
