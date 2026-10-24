import type { ModelCallCancelReason } from '../../shared/ipc/modelCallCancelTypes';
import type { AiStrategyToastFields } from '../../shared/aiStrategyToastContent';
import { rendererSharedState as S } from '../core/state';
import { startCommanderPlanningIfAllowed, stopCommanderPlanningFromScreen } from './commanderPoolClient';
import { toolGroupTooltipText } from '../chrome/controlTooltipText';

/**
 * Stops the tactical consult when a battle session is torn down.
 *
 * Purpose: Exit Battle must not apply a late battle plan. A strategic consult keeps running.
 * When to use: Before Exit Battle's IPC, and when a battle is reconciled away.
 * Expected outcome: The pool stops tactical planning. A rejected stop is logged.
 * Exceptions: None.
 */
export function invalidateBackgroundAiRequest(): void {
  void stopCommanderPlanningFromScreen('battle_exit');
}

/**
 * Stops commander planning.
 *
 * Purpose: Run off, a model change, New, and teardown share one stop.
 * When to use: Those player actions.
 * Expected outcome: The pool aborts the matching consults. A rejected stop is logged and does not throw.
 * Exceptions: None.
 */
export async function stopOpponentPlanning(reason: ModelCallCancelReason): Promise<void> {
  await stopCommanderPlanningFromScreen(reason);
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
  openRouterRuntimeDepsRef?.updateReadyButtonState();
}

/**
 * Stops the tactical consult when the tactical session is torn down on the renderer.
 *
 * Purpose: Exiting tactical play or reconciling the battle away must stop the tactical consult so a late plan cannot land on a closed battle.
 * When to use: Start of `tacticalReleaseRendererSessionForNewStrategicMatch` and `tacticalReconcileBattleAfterStrategicSnapshot` before clearing `S.tacticalBattleSnapshot`.
 * Expected outcome: Delegates to `cancelInFlightBackgroundAiRequestForRendererTeardown` with the session-ended log line.
 * Exceptions: None.
 */
export function cancelTacticalScopedBackgroundPrefetchForSessionTeardown(): void {
  cancelInFlightBackgroundAiRequestForRendererTeardown();
}

interface OpenRouterRuntimeDeps {
    /**
   * Specifies the contract for the `appendOpenRouterLog` member (appendOpenRouterLog: (line: string, isError?: boolean, seatId?: string) => void;).

   * Contract: Describes stable behavior for callers of `appendOpenRouterLog` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
appendOpenRouterLog: (line: string, isError?: boolean, seatId?: string) => void;
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

   * Contract: Displays Message and Strategy sections from a finished commander consult.
   * When to use: After a drained dispatch or a consultation push that has either field.
   * Expected outcome: Non-empty fields become visible until timeout or dismiss.
   * Exceptions: None.
   */
  showAiStrategyToast: (content: AiStrategyToastFields) => void;
    /**
   * Specifies the contract for the `requestRedraw` member (requestRedraw?: () => void;).

   * Contract: Optional canvas refresh after AI results that only touch renderer state (e.g. tactical snapshot updates).
   * When to use: Wired from the main renderer so a finished consult can repaint the tactical map.
   * Expected outcome: No-op when omitted.
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
 * Starts commander planning when the match can take a consult.
 *
 * Purpose: Run on, a new match, and a finished turn share one start.
 * When to use: After Run is on and the match is in planning, including inside a battle.
 * Expected outcome: The pool starts the matching consult. The argument is unused; the screen controls are bound separately.
 * Exceptions: A rejected start is logged and does not throw.
 */
export function startBackgroundRequestIfAllowed(deps: OpenRouterRuntimeDeps): void {
  openRouterRuntimeDepsRef = deps;
  void startCommanderPlanningIfAllowed();
}

/**
 * Restarts planning when the Events tool changes whether consultations wait for the next turn.
 *
 * Purpose: A mode change while Run is on must drop the consult that was started for the other mode.
 * When to use: The Events toggle.
 * Expected outcome: Planning stops, then starts again for the current mode.
 * Exceptions: None.
 */
function handleEventDrivenModeTransition(_deps: OpenRouterRuntimeDeps, wasEventDriven: boolean): void {
  if (!S.runButtonOn || wasEventDriven === S.useEventDrivenConsultation) return;
  void stopOpponentPlanning('teardown').then(() => startCommanderPlanningIfAllowed());
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
