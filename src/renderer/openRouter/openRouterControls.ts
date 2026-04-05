import { rendererSharedState as S } from '../core/state';

interface OpenRouterUiDeps {
  appendOpenRouterLog: (line: string, isError?: boolean) => void;
  updateOpenRouterCostLabel: () => void;
  renderOpenRouterToolsList: () => void;
  syncEventDrivenFromTools: () => void;
  hideMapToast: () => void;
  hideAiStrategyToast: () => void;
  openNewGameOverlayFromModelTab: () => void;
  startBackgroundRequestIfAllowed: () => void;
  updateReadyButtonState: () => void;
  syncOpenRouterRunToggleInteractable: () => Promise<void>;
}

export function initOpenRouterUI(deps: OpenRouterUiDeps): void {
  const api = window.gameApi?.openRouter;
  if (!api) return;

  window.gameApi?.registerOpenRouterLogListener?.((p) => deps.appendOpenRouterLog(p.line, p.isError ?? false));
  deps.updateOpenRouterCostLabel();

  const tabTools = document.getElementById('openrouter-tab-tools');
  const tabModel = document.getElementById('openrouter-tab-model');
  const panelTools = document.getElementById('openrouter-tools-panel');
  const panelModel = document.getElementById('openrouter-model-panel');

  function setActiveTab(active: 'tools' | 'model'): void {
    if (active === 'model') {
      tabTools?.setAttribute('aria-selected', 'false');
      tabModel?.setAttribute('aria-selected', 'true');
      panelTools?.classList.remove('active');
      panelTools?.setAttribute('hidden', '');
      panelModel?.classList.add('active');
      panelModel?.removeAttribute('hidden');
    } else {
      tabTools?.setAttribute('aria-selected', 'true');
      tabModel?.setAttribute('aria-selected', 'false');
      panelTools?.classList.add('active');
      panelTools?.removeAttribute('hidden');
      panelModel?.classList.remove('active');
      panelModel?.setAttribute('hidden', '');
    }
  }

  tabTools?.addEventListener('click', () => setActiveTab('tools'));
  tabModel?.addEventListener('click', () => setActiveTab('model'));
  setActiveTab('model');

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
  let modelRefreshInFlight = false;
  let startupModelRetryTimer: ReturnType<typeof setTimeout> | null = null;

  function clearStartupModelRetryTimer(): void {
    if (startupModelRetryTimer !== null) {
      clearTimeout(startupModelRetryTimer);
      startupModelRetryTimer = null;
    }
  }

  function scheduleStartupModelRetry(): void {
    if (startupModelRetryTimer !== null) return;
    startupModelRetryTimer = setTimeout(() => {
      startupModelRetryTimer = null;
      refreshModels(true);
    }, 2000);
  }

  function refreshModels(retryOnFailure = false): void {
    if (modelRefreshInFlight) return;
    modelRefreshInFlight = true;
    api.listModels().then((result) => {
      if (!modelSelect) return;
      const kept = modelSelect.value;
      modelSelect.innerHTML = '<option value="">— Select model —</option>';
      if ('error' in result && result.error) {
        deps.appendOpenRouterLog(`Models: ${result.error}`, true);
        if (retryOnFailure) scheduleStartupModelRetry();
        void deps.syncOpenRouterRunToggleInteractable();
        return;
      }
      const models = 'models' in result ? result.models ?? [] : [];
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name ?? m.id;
        modelSelect.appendChild(opt);
      }
      const targetModelId = kept || persistedSelectedModelId;
      if (targetModelId && Array.from(modelSelect.options).some((o) => o.value === targetModelId)) {
        modelSelect.value = targetModelId;
      }
      clearStartupModelRetryTimer();
      void deps.syncOpenRouterRunToggleInteractable();
    }).catch((err) => {
      deps.appendOpenRouterLog(`Models: ${String(err)}`, true);
      if (retryOnFailure) scheduleStartupModelRetry();
      void deps.syncOpenRouterRunToggleInteractable();
    }).finally(() => {
      modelRefreshInFlight = false;
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
    }
    refreshModels(true);
  }).catch(() => refreshModels(true));

  if (keyInput) {
    api.getKey().then((keyResult) => {
      if (keyResult?.hasKey && !keyInput.value.trim()) {
        keyInput.placeholder = 'Saved API key';
        lastPersistedApiKeyValue = '';
        refreshModels(true);
      }
    });
    const persistApiKey = (): void => {
      const value = keyInput.value.trim();
      if (value === lastPersistedApiKeyValue) return;
      lastPersistedApiKeyValue = value;
      api.setKey(value).then(() => {
        if (!value) {
          keyInput.placeholder = '';
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
      api.setSelectedModel(modelSelect.value);
      if (modelSelect.value) deps.hideMapToast();
      void deps.syncOpenRouterRunToggleInteractable();
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
        document.getElementById('openrouter-tab-tools')?.click();
        S.precomputedAiOrders = null;
        S.precomputedAiRangedOrders = null;
        S.precomputedAiStrategy = null;
        if (S.useEventDrivenConsultation) S.eventDrivenInitialConsultationDone = false;
        deps.updateReadyButtonState();
        deps.startBackgroundRequestIfAllowed();
      } else {
        window.gameApi?.cancelRequestAiOrders?.();
        S.precomputedAiOrders = null;
        S.precomputedAiRangedOrders = null;
        S.precomputedAiStrategy = null;
        S.eventDrivenInitialConsultationDone = false;
        deps.updateReadyButtonState();
      }
    });
  }

  document.getElementById('map-toast-dismiss')?.addEventListener('click', deps.hideMapToast);
  document.getElementById('ai-strategy-toast-dismiss')?.addEventListener('click', deps.hideAiStrategyToast);
  void deps.syncOpenRouterRunToggleInteractable();
}
