import { rendererSharedState as S } from '../core/state';
import { applySuccessfulPrecomputedAiResult, resetPrecomputedAiState } from './precomputedAiState';
import { isWaitingForPrecomputedAiOrders } from './aiPlanningState';

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
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function startBackgroundRequestIfAllowed(deps: OpenRouterRuntimeDeps): void {
  if (S.backgroundRequestInFlight || !isWaitingForPrecomputedAiOrders() || !strategicPhaseAllowsBackgroundAi()) return;
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
          deps.appendOpenRouterLog(`Background planning failed: ${result.error ?? 'Unknown error'}`, true);
          deps.showSidebarError(result.error ?? 'Background AI request failed');
          resetPrecomputedAiState('null');
        }
        deps.updateReadyButtonState();
      })
      .catch((err) => {
        window.gameApi?.cancelRequestAiOrders?.();
        S.backgroundRequestInFlight = false;
        deps.appendOpenRouterLog(`Background planning request rejected: ${String(err)}`, true);
        deps.showSidebarError(String(err));
        resetPrecomputedAiState('null');
        deps.updateReadyButtonState();
      });
  }).catch((err) => {
    S.backgroundRequestInFlight = false;
    deps.showSidebarError(String(err));
    resetPrecomputedAiState('null');
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
