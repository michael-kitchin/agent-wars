import type { GameApi, GameReadyIpcPayload } from '../../shared/ipcTypes';
import { READY_REQUEST_TIMEOUT_MS, TOAST_DURATION_MS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { isWaitingForPrecomputedAiOrders } from './aiPlanningState';

/**
 * Defines the `formatElapsedMmSs` function shape (export function formatElapsedMmSs(ms: number): string).

 * Purpose: Supports maintainability by documenting why `formatElapsedMmSs` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatElapsedMmSs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Defines the `setReadyButtonLabelReady` function shape (export function setReadyButtonLabelReady(readyBtn: HTMLButtonElement): void).

 * Purpose: Supports maintainability by documenting why `setReadyButtonLabelReady` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setReadyButtonLabelReady(readyBtn: HTMLButtonElement): void {
  readyBtn.textContent = 'Ready';
}

/**
 * Defines the `setReadyButtonLabelAiWait` function shape (export function setReadyButtonLabelAiWait(readyBtn: HTMLButtonElement, elapsedMs: number): void).

 * Purpose: Supports maintainability by documenting why `setReadyButtonLabelAiWait` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function setReadyButtonLabelAiWait(readyBtn: HTMLButtonElement, elapsedMs: number): void {
  readyBtn.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = 'AI: ';
  readyBtn.appendChild(strong);
  readyBtn.appendChild(document.createTextNode(formatElapsedMmSs(elapsedMs)));
}

/**
 * Defines the `updateReadyButtonState` function shape (export function updateReadyButtonState(): void).

 * Purpose: Supports maintainability by documenting why `updateReadyButtonState` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Disables the control while the game is over, while precomputed AI orders are still loading, or
 * while `readyRequestInFlight` is true for an in-progress Ready / tactical-commit pipeline; restores label/interval
 * state for the AI-wait countdown when applicable.
 * Exceptions: None.
 */
export function updateReadyButtonState(): void {
  const readyBtn = document.getElementById('ready-btn') as HTMLButtonElement | null;
  if (!readyBtn) return;
  const gameOver = S.gameState?.gameOver ?? false;
  const waitingOnAi = isWaitingForPrecomputedAiOrders();
  const tacticalAnnihilationDialogOpen = S.tacticalAnnihilationOutcomeDialog != null;
  readyBtn.disabled =
    gameOver || waitingOnAi || S.readyRequestInFlight || tacticalAnnihilationDialogOpen;

  if (waitingOnAi) {
    const now = Date.now();
    if (S.readyBtnAiWaitStartTime === null) {
      S.readyBtnAiWaitStartTime = now;
      S.readyBtnAiWaitIntervalId = setInterval(() => {
        if (S.readyBtnAiWaitStartTime === null) return;
        const btn = document.getElementById('ready-btn') as HTMLButtonElement | null;
        if (btn) setReadyButtonLabelAiWait(btn, Date.now() - S.readyBtnAiWaitStartTime);
      }, 1000);
    }
    setReadyButtonLabelAiWait(readyBtn, now - (S.readyBtnAiWaitStartTime ?? now));
  } else {
    if (S.readyBtnAiWaitIntervalId !== null) {
      clearInterval(S.readyBtnAiWaitIntervalId);
      S.readyBtnAiWaitIntervalId = null;
    }
    S.readyBtnAiWaitStartTime = null;
    setReadyButtonLabelReady(readyBtn);
  }
}

/**
 * Defines the `updateOpenRouterToolCountLabels` function shape (export function updateOpenRouterToolCountLabels(): void).

 * Purpose: Supports maintainability by documenting why `updateOpenRouterToolCountLabels` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateOpenRouterToolCountLabels(): void {
  for (const group of S.openRouterToolGroups) {
    const btn = document.querySelector(`.openrouter-tool-toggle[data-tool-group="${group.id}"]`);
    if (btn) btn.textContent = String(S.toolInvocationCounts[group.id] ?? 0);
  }
}

/**
 * Defines the `formatOpenRouterCost` function shape (export function formatOpenRouterCost(dollars: number): string).

 * Purpose: Supports maintainability by documenting why `formatOpenRouterCost` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function formatOpenRouterCost(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/**
 * Defines the `updateOpenRouterCostLabel` function shape (export function updateOpenRouterCostLabel(): void).

 * Purpose: Supports maintainability by documenting why `updateOpenRouterCostLabel` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function updateOpenRouterCostLabel(): void {
  const el = document.getElementById('openrouter-cost');
  if (el) el.textContent = formatOpenRouterCost(S.openRouterGameCost);
}

/**
 * Defines the `appendOpenRouterLog` function shape (export function appendOpenRouterLog(line: string, isError = false): void).

 * Purpose: Supports maintainability by documenting why `appendOpenRouterLog` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function appendOpenRouterLog(line: string, isError = false): void {
  const el = document.getElementById('openrouter-log');
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  const span = document.createElement('div');
  span.textContent = `${time} ${line}`;
  if (isError) span.style.color = '#a03030';
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}

/**
 * Defines the `bulletizeToastLines` function shape (export function bulletizeToastLines(message: string): string).

 * Purpose: Supports maintainability by documenting why `bulletizeToastLines` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function bulletizeToastLines(message: string): string {
  const lines = message
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return '•';
  return lines
    .map((line) => (line.startsWith('•') ? line : `• ${line}`))
    .join('\n');
}

/**
 * Defines the `showToast` function shape (function showToast().

 * Purpose: Supports maintainability by documenting why `showToast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
function showToast(
  el: HTMLElement,
  textEl: HTMLElement,
  textContentBuilder: (target: HTMLElement) => void,
  isInfo: boolean
): void {
  textEl.textContent = '';
  textContentBuilder(textEl);
  el.classList.toggle('toast-info', isInfo);
  el.classList.remove('hidden');
}

/**
 * Defines the `showMapToast` function shape (export function showMapToast(message: string, options?:).

 * Purpose: Supports maintainability by documenting why `showMapToast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function showMapToast(message: string, options?: { isError?: boolean }): void {
  if (S.toastHideTimer !== null) {
    clearTimeout(S.toastHideTimer);
    S.toastHideTimer = null;
  }
  const el = document.getElementById('map-toast');
  const textEl = document.getElementById('map-toast-text');
  if (el && textEl) {
    showToast(
      el,
      textEl,
      (target) => {
        const strong = document.createElement('strong');
        strong.textContent = 'Update: ';
        target.appendChild(strong);
        target.appendChild(document.createTextNode('\n' + bulletizeToastLines(message)));
      },
      options?.isError === false
    );
  }
  S.toastHideTimer = setTimeout(() => {
    S.toastHideTimer = null;
    hideMapToast();
  }, TOAST_DURATION_MS);
}

/**
 * Defines the `hideMapToast` function shape (export function hideMapToast(): void).

 * Purpose: Supports maintainability by documenting why `hideMapToast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hideMapToast(): void {
  if (S.toastHideTimer !== null) {
    clearTimeout(S.toastHideTimer);
    S.toastHideTimer = null;
  }
  const el = document.getElementById('map-toast');
  if (el) el.classList.add('hidden');
}

/**
 * Defines the `showAiStrategyToast` function shape (export function showAiStrategyToast(message: string, modelName?: string): void).

 * Purpose: Supports maintainability by documenting why `showAiStrategyToast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function showAiStrategyToast(message: string, modelName?: string): void {
  if (S.aiStrategyToastHideTimer !== null) {
    clearTimeout(S.aiStrategyToastHideTimer);
    S.aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  const textEl = document.getElementById('ai-strategy-toast-text');
  if (el && textEl) {
    showToast(
      el,
      textEl,
      (target) => {
        if (modelName) {
          const strong = document.createElement('strong');
          strong.textContent = modelName;
          target.appendChild(strong);
          target.appendChild(document.createTextNode(': ' + message));
        } else {
          target.appendChild(document.createTextNode(message));
        }
      },
      true
    );
  }
  S.aiStrategyToastHideTimer = setTimeout(() => {
    S.aiStrategyToastHideTimer = null;
    hideAiStrategyToast();
  }, TOAST_DURATION_MS);
}

/**
 * Defines the `hideAiStrategyToast` function shape (export function hideAiStrategyToast(): void).

 * Purpose: Supports maintainability by documenting why `hideAiStrategyToast` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export function hideAiStrategyToast(): void {
  if (S.aiStrategyToastHideTimer !== null) {
    clearTimeout(S.aiStrategyToastHideTimer);
    S.aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  if (el) el.classList.add('hidden');
}

/**
 * Defines the `callReadyWithTimeout` function shape (export async function callReadyWithTimeout().

 * Purpose: Supports maintainability by documenting why `callReadyWithTimeout` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
export async function callReadyWithTimeout(
  payload: GameReadyIpcPayload
): Promise<Awaited<ReturnType<NonNullable<GameApi['ready']>>>> {
  if (!window.gameApi?.ready) {
    throw new Error('Ready action unavailable.');
  }
  return Promise.race([
    window.gameApi.ready(payload as never),
    new Promise<never>((_resolve, reject) => {
      setTimeout(
        () => reject(new Error(`Ready request timed out after ${READY_REQUEST_TIMEOUT_MS}ms`)),
        READY_REQUEST_TIMEOUT_MS
      );
    }),
  ]);
}
