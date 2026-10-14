import type { PostResolutionConsultationPushPayload } from '../../shared/ipcTypes';
import type { AiStrategyToastFields } from '../../shared/aiStrategyToastContent';
import type { OpenRouterModel } from '../../shared/ipc/openRouterTypes';
import { formatModelOptionLabel } from '../../shared/openRouterModelDisplay';
import { rendererSharedState as S } from '../core/state';
import {
  readTacticalBattlesInterceptPromptEnabled,
  writeTacticalBattlesInterceptPromptEnabled,
} from '../gameplay/tacticalBattlePromptPreference';
import { applyTacticalPostBeatConsultSideEffects } from '../tactical/applyTacticalPostBeatConsultSideEffects';
import { renderOpponentStatus, updateOpenRouterCostLabel } from './openRouterUiHelpers';
import { attachModelDescriptionTooltip } from './modelDescriptionTooltip';
import { attachReasoningEffortSelect } from './reasoningEffortSelect';
import { resetPrecomputedAiState } from './precomputedAiState';
import { isDeferredResolutionPlaybackConsultPending } from './aiPlanningState';
import { stopOpponentPlanning } from './openRouterRuntime';
import { isNewGameOverlayOpen } from '../gameplay/newGameBanner';

/**
 * Documents the `OpenRouterUiDeps` interface as a named contract surface (interface OpenRouterUiDeps).

 * Purpose: Supports maintainability by documenting why `OpenRouterUiDeps` exists.
 * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
 * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
 * Exceptions: None.
 */
interface OpenRouterUiDeps {
    /**
   * Specifies the contract for the `appendOpenRouterLog` member (appendOpenRouterLog: (line: string, isError?: boolean) => void;).

   * Contract: Describes stable behavior for callers of `appendOpenRouterLog` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
appendOpenRouterLog: (line: string, isError?: boolean) => void;
    /**
   * Specifies the contract for the `updateOpenRouterCostLabel` member (updateOpenRouterCostLabel: () => void;).

   * Contract: Describes stable behavior for callers of `updateOpenRouterCostLabel` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateOpenRouterCostLabel: () => void;
    /**
   * Specifies the contract for the `renderOpenRouterToolsList` member (renderOpenRouterToolsList: () => void;).

   * Contract: Describes stable behavior for callers of `renderOpenRouterToolsList` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
renderOpenRouterToolsList: () => void;
    /**
   * Specifies the contract for the `syncEventDrivenFromTools` member (syncEventDrivenFromTools: () => void;).

   * Contract: Describes stable behavior for callers of `syncEventDrivenFromTools` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
syncEventDrivenFromTools: () => void;
    /**
   * Specifies the contract for the `hideMapToast` member (hideMapToast: () => void;).

   * Contract: Describes stable behavior for callers of `hideMapToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideMapToast: () => void;
    /**
   * Specifies the contract for the `hideAiStrategyToast` member (hideAiStrategyToast: () => void;).

   * Contract: Describes stable behavior for callers of `hideAiStrategyToast` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
hideAiStrategyToast: () => void;
    /**
   * Specifies the contract for the `openNewGameOverlayFromModelTab` member (openNewGameOverlayFromModelTab: () => void;).

   * Contract: Describes stable behavior for callers of `openNewGameOverlayFromModelTab` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
openNewGameOverlayFromModelTab: () => void;
    /**
   * Specifies the contract for the `startBackgroundRequestIfAllowed` member (startBackgroundRequestIfAllowed: () => void;).

   * Contract: Describes stable behavior for callers of `startBackgroundRequestIfAllowed` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
startBackgroundRequestIfAllowed: () => void;
    /**
   * Specifies the contract for the `showAiStrategyToast` member (showAiStrategyToast: (content: AiStrategyToastFields) => void;).

   * Contract: Displays Message and Strategy sections from consultation IPC when either field is present.
   * When to use: Strategic Ready handler, tactical Ready handler, or deferred consultation listeners.
   * Expected outcome: Non-empty fields become visible until timeout or dismiss; both empty hides a stale toast.
   * Exceptions: None.
   */
showAiStrategyToast: (content: AiStrategyToastFields) => void;
    /**
   * Specifies the contract for the `updateOpenRouterToolCountLabels` member (updateOpenRouterToolCountLabels: () => void;).

   * Contract: Refreshes per-tool invocation count labels after consultation telemetry merges.
   * When to use: After merging `toolInvocationCounts` from Ready or tactical commit results.
   * Expected outcome: Sidebar counts match the latest consultation pass.
   * Exceptions: None.
   */
updateOpenRouterToolCountLabels: () => void;
    /**
   * Specifies the contract for the `requestRedraw` member (requestRedraw: () => void;).

   * Contract: Repaints the map after opponent draft hydration from AI planning flows.
   * When to use: After consultation or precompute merges that change tactical glyphs.
   * Expected outcome: Tactical glyphs reflect updated opponent rows when present.
   * Exceptions: None.
   */
requestRedraw: () => void;
    /**
   * Specifies the contract for the `updateReadyButtonState` member (updateReadyButtonState: () => void;).

   * Contract: Describes stable behavior for callers of `updateReadyButtonState` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
updateReadyButtonState: () => void;
    /**
   * Specifies the contract for the `syncOpenRouterRunToggleInteractable` member (syncOpenRouterRunToggleInteractable: () => Promise<void>;).

   * Contract: Describes stable behavior for callers of `syncOpenRouterRunToggleInteractable` in this codebase.
   * When to use: Use per team conventions when this declaration is the correct extension point for the current task.
   * Expected outcome: Callers and maintainers can rely on the described behavior without reading the full implementation.
   * Exceptions: None.
   */
syncOpenRouterRunToggleInteractable: () => Promise<void>;
}

/**
 * Starts the battle opponent-plan request once a deferred strategic consult is no longer holding the gate.
 *
 * Purpose: Entering a battle from melee Fight skips that request while the post-resolution consult is outstanding.
 * When to use: After a strategic consult push clears `pendingDeferredStrategicPostResolutionConsult`, including a stale
 * push that only clears the latch.
 * Expected outcome: No-op outside tactical planning. Inside a battle, `startBackgroundRequestIfAllowed` still declines
 * when a plan is buffered, Run is off, no opponent units remain, another deferred consult is pending, or a request is
 * already in flight. Otherwise one background `requestAiOrders` for the battle.
 * Exceptions: None.
 */
function startTacticalOpponentPlanAfterStrategicConsult(deps: OpenRouterUiDeps): void {
  if (!S.tacticalBattleSnapshot || !S.tacticalPhasePlanning) return;
  deps.startBackgroundRequestIfAllowed();
}

/**
 * Wires main-process pushes for deferred strategic/tactical LLM consultation into renderer shared state.
 *
 * Purpose: Centralizes listener registration next to OpenRouter UI bootstrap so prefetch + Ready gates stay aligned.
 * When to use: Once from `initOpenRouterUI`.
 * Expected outcome: Push payloads apply strategy toasts and tool counts. A successful strategic consult does not start
 * another strategic `requestAiOrders`; those orders are already pending for the next Ready. When a tactical battle is
 * already in planning, the battle's opponent-plan request starts then, because it was held while this consult ran.
 * Exceptions: Stale `planningTurnNumber` merges log, clear the strategic latch, and still start that battle request.
 * `abandoned` pushes unlatch and resume Run prefetch without applying a plan; the player-visible skip line is sent on
 * `openRouter:log`.
 */
function initDeferredResolutionPlaybackPushListeners(deps: OpenRouterUiDeps): void {
  window.gameApi?.registerPostResolutionConsultationListener?.((payload: PostResolutionConsultationPushPayload) => {
    if (isNewGameOverlayOpen()) {
      S.pendingDeferredStrategicPostResolutionConsult = false;
      deps.updateReadyButtonState();
      return;
    }
    if (payload.abandoned === true) {
      applyAbandonedDeferredConsultRecovery('strategic', deps);
      return;
    }
    if (!S.gameState || payload.planningTurnNumber !== S.gameState.turnNumber) {
      deps.appendOpenRouterLog('Ignored stale post-resolution consultation push.', false);
      S.pendingDeferredStrategicPostResolutionConsult = false;
      startTacticalOpponentPlanAfterStrategicConsult(deps);
      deps.updateReadyButtonState();
      return;
    }
    S.pendingDeferredStrategicPostResolutionConsult = false;
    deps.showAiStrategyToast({ message: payload.aiMessage, strategy: payload.aiStrategy });
    if (payload.toolInvocationCounts) {
      S.toolInvocationCounts = { ...S.toolInvocationCounts, ...payload.toolInvocationCounts };
      deps.updateOpenRouterToolCountLabels();
    }
    if (typeof payload.cost === 'number' && Number.isFinite(payload.cost)) {
      S.openRouterGameCost += payload.cost;
      updateOpenRouterCostLabel();
    }
    deps.appendOpenRouterLog('Post-resolution consultation applied.', false);
    if (S.useEventDrivenConsultation) S.eventDrivenInitialConsultationDone = true;
    deps.requestRedraw();
    startTacticalOpponentPlanAfterStrategicConsult(deps);
    deps.updateReadyButtonState();
  });
  window.gameApi?.registerPostTacticalBeatConsultationListener?.((fields) => {
    if (isNewGameOverlayOpen()) {
      S.pendingDeferredTacticalPostBeatConsult = false;
      deps.updateReadyButtonState();
      return;
    }
    if (fields.abandoned === true) {
      applyAbandonedDeferredConsultRecovery('tactical', deps);
      return;
    }
    if (
      fields.kind !== 'tactical' ||
      fields.battleId !== S.tacticalBattleSnapshot?.battleId
    ) {
      deps.appendOpenRouterLog('Ignored stale tactical post-beat consultation push.', false);
      S.pendingDeferredTacticalPostBeatConsult = false;
      deps.updateReadyButtonState();
      return;
    }
    S.pendingDeferredTacticalPostBeatConsult = false;
    applyTacticalPostBeatConsultSideEffects(fields, {
      startBackgroundRequestIfAllowed: deps.startBackgroundRequestIfAllowed,
      showAiStrategyToast: deps.showAiStrategyToast,
      hideAiStrategyToast: deps.hideAiStrategyToast,
      updateOpenRouterToolCountLabels: deps.updateOpenRouterToolCountLabels,
      appendOpenRouterLog: deps.appendOpenRouterLog,
      redraw: deps.requestRedraw,
      updateReadyButtonState: deps.updateReadyButtonState,
    });
  });
}

/**
 * Unlatches deferred consultation and restarts Run prefetch after main abandons a mismatched playback notify.
 *
 * Purpose: The AI-planning latch must clear even when consultation did not run, or Ready stays disabled.
 * When to use: `abandoned` strategic/melee or tactical consult pushes.
 * Expected outcome: Matching latch false; tactical opponent draft cleared; prefetch starts when Run is on.
 * Strategic abandon also clears `eventDrivenInitialConsultationDone` so that prefetch is not suppressed by the event-driven wait gate.
 * Exceptions: None.
 */
function applyAbandonedDeferredConsultRecovery(kind: 'strategic' | 'tactical', deps: OpenRouterUiDeps): void {
  if (kind === 'tactical') {
    S.pendingDeferredTacticalPostBeatConsult = false;
    S.tacticalOpponentDraft = null;
    const oppAlive = S.tacticalBattleSnapshot?.subUnits.some((u) => u.player === 'opponent') ?? false;
    if (S.runButtonOn && oppAlive) deps.startBackgroundRequestIfAllowed();
  } else {
    S.pendingDeferredStrategicPostResolutionConsult = false;
    S.eventDrivenInitialConsultationDone = false;
    if (S.runButtonOn) deps.startBackgroundRequestIfAllowed();
  }
  deps.requestRedraw();
  deps.updateReadyButtonState();
}

/**
 * Wires the OpenRouter panel and the deferred-consultation push listeners.
 *
 * Purpose: One bootstrap for the Opponent tab's controls plus the pushes that release Ready after a deferred consult.
 * When to use: Once during renderer startup.
 * Expected outcome: The Opponent tab's controls, the model list, and the consultation listeners are registered.
 * Exceptions: None; a missing OpenRouter API leaves the listeners that were registered and returns.
 */
export function initOpenRouterUI(deps: OpenRouterUiDeps): void {
  initDeferredResolutionPlaybackPushListeners(deps);
  const api = window.gameApi?.openRouter;
  if (!api) return;

  window.gameApi?.registerOpenRouterLogListener?.((p) => deps.appendOpenRouterLog(p.line, p.isError ?? false));
  deps.updateOpenRouterCostLabel();

  (async () => {
    try {
      const list = await window.gameApi?.openRouter?.getToolGroupList?.();
      if (list?.length) {
        const withEvents = [...list];
        const precomputationIdx = withEvents.findIndex((g) => g.id === 'precomputation');
        if (!withEvents.some((g) => g.id === 'events')) {
          const insertAt = precomputationIdx >= 0 ? precomputationIdx + 1 : 1;
          withEvents.splice(insertAt, 0, { id: 'events', label: 'Events' });
        }
        S.openRouterToolGroups = withEvents;
        S.enabledToolGroups = new Set(withEvents.map((g) => g.id));
        S.toolInvocationCounts = Object.fromEntries(withEvents.map((g) => [g.id, 0]));
        deps.syncEventDrivenFromTools();
      }
    } finally {
      deps.renderOpenRouterToolsList();
    }
  })();

  const keyInput = document.getElementById('openrouter-key') as HTMLInputElement | null;
  const modelSelect = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  const refreshBtn = document.getElementById('openrouter-refresh-models');
  const newBtn = document.getElementById('openrouter-new-btn');
  let persistedSelectedModelId = '';
  let lastPersistedApiKeyValue = '';
  /**
   * True when the key field is empty because a saved key is hidden, not because the player cleared typed text.
   *
   * When to use: Set only after `getKey()` reports `hasKey` and the input is still empty. An empty blur then calls `setKey('')`.
   * Expected outcome: A later empty blur clears the saved key and restores the unsaved placeholder. Typed text never sets this flag.
   * Exceptions: None.
   */
  let savedKeyHiddenInEmptyField = false;
  let modelRefreshInFlight = false;
  let startupModelRetryTimer: ReturnType<typeof setTimeout> | null = null;
  let startupModelRetryConsumed = false;
  /**
   * Latest successful model list keyed by id for labels and the description tooltip.

   * Purpose: Lets the closed-select tooltip resolve trimmed descriptions without another IPC round-trip.
   * When to use: Rebuilt on each successful `listModels`; cleared on refresh errors.
   * Expected outcome: `get` returns the mapped `OpenRouterModel` for a selected id when known.
   * Exceptions: None.
   */
  const modelsById = new Map<string, OpenRouterModel>();
  const modelDescriptionTooltip = modelSelect
    ? attachModelDescriptionTooltip({
        select: modelSelect,
        getDescriptionForModelId: (modelId) => {
          const description = modelsById.get(modelId)?.description;
          if (typeof description !== 'string') return null;
          const trimmed = description.trim();
          return trimmed || null;
        },
      })
    : null;
  /**
   * Saved reasoning-effort override for the selected model; `''` means the model default.
   *
   * Purpose: Lets model-list refreshes restore the player's reasoning choice without another IPC round trip.
   * When to use: Read when rebuilding the reasoning dropdown; written on load, on effort change, and (to `''`) on model change.
   * Expected outcome: Mirrors the main-process value after startup.
   * Exceptions: None.
   */
  let persistedReasoningEffort = '';
  /**
   * True once the player has picked a model in this session.
   *
   * Purpose: A slow startup effort load must not restore the previous model's effort onto a newly picked model.
   * When to use: Checked when `getSelectedReasoningEffort` resolves.
   * Expected outcome: Late startup results are ignored after a player model change.
   * Exceptions: None.
   */
  let playerChangedModel = false;
  const reasoningEffortSelectEl = document.getElementById('openrouter-reasoning-effort') as HTMLSelectElement | null;
  const reasoningEffortSelect = reasoningEffortSelectEl
    ? attachReasoningEffortSelect({
        select: reasoningEffortSelectEl,
        onEffortChange: (persistedEffort) => {
          persistedReasoningEffort = persistedEffort;
          api.setSelectedReasoningEffort(persistedEffort).catch((err) => {
            deps.appendOpenRouterLog(`Reasoning effort: ${String(err)}`, true);
          });
        },
      })
    : null;

  /**
   * Rebuilds the reasoning dropdown for whatever model is selected now.
   *
   * Purpose: One call site for every event that can change the selected model or the saved effort.
   * When to use: After model lists load or fail, after the saved effort loads, and after a model change.
   * Expected outcome: The dropdown shows the selected model's levels, or a disabled "model default" when unknown.
   * Exceptions: None.
   */
  function showReasoningEffortForSelectedModel(): void {
    reasoningEffortSelect?.showForModel(modelsById.get(modelSelect?.value ?? ''), persistedReasoningEffort);
  }

  function clearStartupModelRetryTimer(): void {
    if (startupModelRetryTimer !== null) {
      clearTimeout(startupModelRetryTimer);
      startupModelRetryTimer = null;
    }
  }

  function scheduleStartupModelRetry(): void {
    if (startupModelRetryTimer !== null || startupModelRetryConsumed) return;
    startupModelRetryConsumed = true;
    startupModelRetryTimer = setTimeout(() => {
      startupModelRetryTimer = null;
      refreshModels(true);
    }, 2000);
  }

  function shouldRetryStartupModelFetch(errorMessage: string): boolean {
    if (errorMessage === 'No API key set') return false;
    if (errorMessage === 'Invalid API key') return false;
    if (errorMessage.startsWith('API error: 4')) return false;
    return true;
  }

  function refreshModels(retryOnFailure = false): void {
    if (modelRefreshInFlight) return;
    modelRefreshInFlight = true;
    modelDescriptionTooltip?.clear();
    api.listModels().then((result) => {
      if (!modelSelect) return;
      const kept = modelSelect.value;
      modelSelect.innerHTML = '<option value="">— Select model —</option>';
      modelsById.clear();
      modelDescriptionTooltip?.clear();
      if ('error' in result && result.error) {
        deps.appendOpenRouterLog(`Models: ${result.error}`, true);
        if (retryOnFailure && shouldRetryStartupModelFetch(result.error)) scheduleStartupModelRetry();
        showReasoningEffortForSelectedModel();
        void deps.syncOpenRouterRunToggleInteractable();
        return;
      }
      const models = 'models' in result ? result.models ?? [] : [];
      for (const m of models) {
        modelsById.set(m.id, m);
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = formatModelOptionLabel(m);
        modelSelect.appendChild(opt);
      }
      const targetModelId = kept || persistedSelectedModelId;
      if (targetModelId && Array.from(modelSelect.options).some((o) => o.value === targetModelId)) {
        modelSelect.value = targetModelId;
      }
      showReasoningEffortForSelectedModel();
      clearStartupModelRetryTimer();
      void deps.syncOpenRouterRunToggleInteractable();
    }).catch((err) => {
      modelsById.clear();
      modelDescriptionTooltip?.clear();
      const message = String(err);
      deps.appendOpenRouterLog(`Models: ${message}`, true);
      if (retryOnFailure && shouldRetryStartupModelFetch(message)) scheduleStartupModelRetry();
      showReasoningEffortForSelectedModel();
      void deps.syncOpenRouterRunToggleInteractable();
    }).finally(() => {
      modelRefreshInFlight = false;
      renderOpponentStatus();
    });
  }

  api.getSelectedModel().then((modelId) => {
    persistedSelectedModelId = modelId;
    if (modelSelect && modelId && !Array.from(modelSelect.options).some((o) => o.value === modelId)) {
      const opt = document.createElement('option');
      opt.value = modelId;
      opt.textContent = modelId;
      modelSelect.appendChild(opt);
      modelSelect.value = modelId;
      renderOpponentStatus();
    }
    refreshModels(true);
  }).catch(() => refreshModels(true));
  api.getSelectedReasoningEffort().then((effort) => {
    if (playerChangedModel) return;
    persistedReasoningEffort = effort;
    showReasoningEffortForSelectedModel();
  }).catch((err) => {
    deps.appendOpenRouterLog(`Reasoning effort: ${String(err)}`, true);
  });

  if (keyInput) {
    api.getKey().then((keyResult) => {
      if (keyResult?.hasKey && !keyInput.value.trim()) {
        keyInput.placeholder = 'Saved API key';
        lastPersistedApiKeyValue = '';
        savedKeyHiddenInEmptyField = true;
        refreshModels(true);
      }
    });
    /**
     * Saves the key field when its text changed, and clears a hidden saved key when the empty field blurs.
     *
     * When to use: Blur, change, or Enter on `#openrouter-key`.
     * Expected outcome: `setKey` runs only after the value actually changed, or when an empty field still hides a saved key. The placeholder updates after `setKey` resolves.
     * Exceptions: None. A rejected `setKey` leaves the placeholder unchanged.
     */
    const persistApiKey = (): void => {
      const value = keyInput.value.trim();
      if (value === '' && savedKeyHiddenInEmptyField) {
        savedKeyHiddenInEmptyField = false;
        lastPersistedApiKeyValue = '';
        api.setKey('').then(() => {
          keyInput.placeholder = 'Set key and blur to save';
          deps.hideMapToast();
          void deps.syncOpenRouterRunToggleInteractable();
        });
        return;
      }
      if (value === lastPersistedApiKeyValue) return;
      lastPersistedApiKeyValue = value;
      api.setKey(value).then(() => {
        if (!value) {
          keyInput.placeholder = 'Set key and blur to save';
          deps.hideMapToast();
          void deps.syncOpenRouterRunToggleInteractable();
          return;
        }
        keyInput.placeholder = 'Saved API key';
        refreshModels(true);
        void deps.syncOpenRouterRunToggleInteractable();
      });
    };
    keyInput.addEventListener('blur', persistApiKey);
    keyInput.addEventListener('change', persistApiKey);
    keyInput.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') persistApiKey();
    });
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      renderOpponentStatus();
      void (async () => {
        try {
          await api.setSelectedModel(modelSelect.value);
          playerChangedModel = true;
          persistedReasoningEffort = '';
          showReasoningEffortForSelectedModel();
          if (modelSelect.value) deps.hideMapToast();
          else modelDescriptionTooltip?.clear();
          if (S.runButtonOn && (S.backgroundRequestInFlight || isDeferredResolutionPlaybackConsultPending())) {
            await stopOpponentPlanning('model_changed');
            deps.startBackgroundRequestIfAllowed();
          }
          void deps.syncOpenRouterRunToggleInteractable();
        } catch (err) {
          console.error('model change failed', err);
        }
      })();
    });
  }

  const tacticalBattlesCb = document.getElementById('openrouter-tactical-battles') as HTMLInputElement | null;
  if (tacticalBattlesCb) {
    tacticalBattlesCb.checked = readTacticalBattlesInterceptPromptEnabled();
    tacticalBattlesCb.addEventListener('change', () => {
      writeTacticalBattlesInterceptPromptEnabled(tacticalBattlesCb.checked);
    });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', () => refreshModels(false));
  if (newBtn) newBtn.addEventListener('click', deps.openNewGameOverlayFromModelTab);

  const runBtn = document.getElementById('openrouter-run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      if ((runBtn as HTMLButtonElement).disabled) return;
      S.runButtonOn = !S.runButtonOn;
      runBtn.setAttribute('aria-pressed', S.runButtonOn ? 'true' : 'false');
      if (S.runButtonOn) {
        resetPrecomputedAiState('null');
        if (S.useEventDrivenConsultation) S.eventDrivenInitialConsultationDone = false;
        deps.updateReadyButtonState();
        deps.startBackgroundRequestIfAllowed();
      } else {
        void stopOpponentPlanning('run_off');
        resetPrecomputedAiState('null');
        S.precomputedAiEmbarkOrders = null;
        S.precomputedAiStrategy = null;
        S.precomputedAiMessage = null;
        S.eventDrivenInitialConsultationDone = false;
        deps.updateReadyButtonState();
      }
    });
  }

  document.getElementById('map-toast-dismiss')?.addEventListener('click', deps.hideMapToast);
  document.getElementById('ai-strategy-toast-dismiss')?.addEventListener('click', deps.hideAiStrategyToast);
  void deps.syncOpenRouterRunToggleInteractable();
}
