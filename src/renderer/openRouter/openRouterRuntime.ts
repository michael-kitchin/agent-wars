import { rendererSharedState as S } from '../core/state';
import { applySuccessfulPrecomputedAiResult, resetPrecomputedAiState } from './precomputedAiState';
import { isWaitingForPrecomputedAiOrders } from './aiPlanningState';

interface OpenRouterRuntimeDeps {
  appendOpenRouterLog: (line: string, isError?: boolean) => void;
  updateReadyButtonState: () => void;
  updateOpenRouterToolCountLabels: () => void;
  updateOpenRouterCostLabel: () => void;
  showSidebarError: (message: string) => void;
}

/**
 * Synchronizes event-driven mode from the Tools tab "Events" toggle state.
 */
export function syncEventDrivenFromTools(): void {
  S.useEventDrivenConsultation = S.enabledToolGroups.has('events');
}

/**
 * Starts one background AI orders request if conditions allow (planning phase, key and model set, no request in flight).
 * Used when Run is toggled on and after new game when Run is on. On success stores orders and enables Ready; on failure shows a user-visible error.
 */
export function startBackgroundRequestIfAllowed(deps: OpenRouterRuntimeDeps): void {
  if (S.backgroundRequestInFlight || !isWaitingForPrecomputedAiOrders() || S.gameState?.phase !== 'planning') return;
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
    window.gameApi
      .requestAiOrders({ enabledToolGroups: enabledToolGroupsPayload })
      .then((result) => {
        S.backgroundRequestInFlight = false;
        if (S.useEventDrivenConsultation && !S.eventDrivenInitialConsultationDone) {
          S.eventDrivenInitialConsultationDone = true;
        }
        if (S.runButtonOn && result.success) {
          applySuccessfulPrecomputedAiResult(result);
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
          deps.showSidebarError(result.error ?? 'Background AI request failed');
          resetPrecomputedAiState('null');
        }
        deps.updateReadyButtonState();
      })
      .catch((err) => {
        S.backgroundRequestInFlight = false;
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
 * Use this to apply the full side effects when the Events toggle changes while Run is active.
 * It keeps cancellation/reset/restart behavior in one place for maintainable mode transitions.
 */
function handleEventDrivenModeTransition(deps: OpenRouterRuntimeDeps, wasEventDriven: boolean): void {
  if (!S.runButtonOn || wasEventDriven === S.useEventDrivenConsultation) return;
  window.gameApi?.cancelRequestAiOrders?.();
  resetPrecomputedAiState('null');
  S.eventDrivenInitialConsultationDone = false;
  startBackgroundRequestIfAllowed(deps);
}

/**
 * Renders or updates the Tools tab list: 2-column grid; each cell has label and count (toggle button).
 * Toggle click flips enabled state. Does not call main or Ready.
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
