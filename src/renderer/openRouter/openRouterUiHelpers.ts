import type { GameApi, GameReadyIpcPayload } from '../../shared/ipcTypes';
import { READY_REQUEST_TIMEOUT_MS, TOAST_DURATION_MS } from '../core/constants';
import { rendererSharedState as S } from '../core/state';
import { isWaitingForPrecomputedAiOrders } from './aiPlanningState';

export function formatElapsedMmSs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function setReadyButtonLabelReady(readyBtn: HTMLButtonElement): void {
  readyBtn.textContent = 'Ready';
}

export function setReadyButtonLabelAiWait(readyBtn: HTMLButtonElement, elapsedMs: number): void {
  readyBtn.textContent = '';
  const strong = document.createElement('strong');
  strong.textContent = 'AI: ';
  readyBtn.appendChild(strong);
  readyBtn.appendChild(document.createTextNode(formatElapsedMmSs(elapsedMs)));
}

export function updateReadyButtonState(): void {
  const readyBtn = document.getElementById('ready-btn') as HTMLButtonElement | null;
  if (!readyBtn) return;
  const gameOver = S.gameState?.gameOver ?? false;
  const waitingOnAi = isWaitingForPrecomputedAiOrders();
  readyBtn.disabled = gameOver || waitingOnAi;

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

export function updateOpenRouterToolCountLabels(): void {
  for (const group of S.openRouterToolGroups) {
    const btn = document.querySelector(`.openrouter-tool-toggle[data-tool-group="${group.id}"]`);
    if (btn) btn.textContent = String(S.toolInvocationCounts[group.id] ?? 0);
  }
}

export function formatOpenRouterCost(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export function updateOpenRouterCostLabel(): void {
  const el = document.getElementById('openrouter-cost');
  if (el) el.textContent = formatOpenRouterCost(S.openRouterGameCost);
}

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

export function hideMapToast(): void {
  if (S.toastHideTimer !== null) {
    clearTimeout(S.toastHideTimer);
    S.toastHideTimer = null;
  }
  const el = document.getElementById('map-toast');
  if (el) el.classList.add('hidden');
}

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

export function hideAiStrategyToast(): void {
  if (S.aiStrategyToastHideTimer !== null) {
    clearTimeout(S.aiStrategyToastHideTimer);
    S.aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  if (el) el.classList.add('hidden');
}

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
