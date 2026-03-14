/**
 * Renderer process entry point. Sets up the canvas, view state, hex grid,
 * pan/zoom (mouse drag + wheel), and click-to-select with sidebar.
 */

import { gridDistance } from 'h3-js';
import {
  drawHexes,
  hitTest,
  cellToCube,
  getHexCanvasCenter,
  type ViewState,
} from './hexGrid';

/** Game state snapshot from main process (matches IPC payload). */
interface GameStateSnapshot {
  hexes: { h3Index: string; terrain: string }[];
  units: { id: string; player: string; unitType: string; h3Index: string }[];
  phase: string;
  turnNumber: number;
  pendingOrders: { unitId: string; toH3Index: string }[];
  gameOver?: boolean;
  winner?: string;
}

/** One executed move (human or AI) for resolution-phase fade animation. */
interface ResolutionMove {
  unitId: string;
  fromH3Index: string;
  toH3Index: string;
}

/** Ranged attack declaration (one target per unit per turn). */
interface RangedAttackOrder {
  unitId: string;
  targetH3Index: string;
}

/** Ranged range in hexes by unit type (0 = melee only). Matches combat spec. */
const RANGED_RANGE: Record<string, number> = {
  infantry: 0,
  armor: 1,
  naval: 2,
};

/** Movement range in hexes per turn by unit type. Must match main process (gameActions). */
const MOVEMENT_RANGE: Record<string, number> = {
  infantry: 1,
  armor: 2,
  naval: 2,
};

/**
 * Validates a movement order against the current game state snapshot. Used on double-click so invalid
 * orders are never added. Rules match main process: unit exists and is human, destination on map,
 * within range, terrain allows unit type (naval→water, land→land).
 */
function validateMovementOrder(
  state: GameStateSnapshot,
  unitId: string,
  toH3Index: string
): { valid: true } | { valid: false; reason: string } {
  const unit = state.units.find((u) => u.id === unitId);
  if (!unit) return { valid: false, reason: `Unit not found: ${unitId}` };
  if (unit.player !== 'human') return { valid: false, reason: 'Only human units can receive orders' };

  const mapHexSet = new Set(state.hexes.map((h) => h.h3Index));
  if (!mapHexSet.has(toH3Index)) return { valid: false, reason: 'Destination not on map' };
  if (!mapHexSet.has(unit.h3Index)) {
    return { valid: false, reason: 'Unit is on an invalid or outdated hex; start a new game.' };
  }

  let dist: number;
  try {
    dist = gridDistance(unit.h3Index, toH3Index);
  } catch {
    return { valid: false, reason: 'Invalid hex or distance; try starting a new game.' };
  }
  const range = MOVEMENT_RANGE[unit.unitType] ?? 1;
  if (dist > range) return { valid: false, reason: `${unit.unitType} can move at most ${range} hex(es)` };
  if (dist < 1) return { valid: false, reason: 'Destination must be different from current hex' };

  const destHex = state.hexes.find((h) => h.h3Index === toH3Index);
  const terrain = destHex?.terrain ?? 'land';
  if (unit.unitType === 'naval' && terrain !== 'water') return { valid: false, reason: 'Naval units must move to water' };
  if ((unit.unitType === 'infantry' || unit.unitType === 'armor') && terrain !== 'land') {
    return { valid: false, reason: 'Land units must move to land' };
  }

  return { valid: true };
}

/** Unit snapshot at death for resolution-phase display (same shape as game units). */
interface RemovedUnitSnapshot {
  id: string;
  player: string;
  unitType: string;
  h3Index: string;
}

interface ReadyResult {
  success: boolean;
  reason?: string;
  aiSkipped?: boolean;
  aiSkipReason?: string;
  aiOrderCount?: number;
  aiRangedByType?: { armor?: number; naval?: number };
  aiDropped?: number;
  aiDropReasons?: string[];
  aiMovesLog?: string[];
  aiMoves?: ResolutionMove[];
  combatHexes?: string[];
  casualtyHexes?: string[];
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: RemovedUnitSnapshot[];
  meleeCombatHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: RemovedUnitSnapshot[];
  /** Per-group tool invocation counts for the last AI turn. Keys are tool group ids. */
  toolInvocationCounts?: Record<string, number>;
  /** Cost in dollars for this turn's LLM call (when requestOrders was used). */
  cost?: number;
}

declare global {
  interface Window {
    gameApi?: {
      getGameState: () => Promise<unknown>;
      newGame: (size?: 'small' | 'medium' | 'large') => Promise<unknown>;
      submitOrders: (payload: { movementOrders: { unitId: string; toH3Index: string }[]; rangedAttacks?: RangedAttackOrder[] }) => Promise<unknown>;
      ready: (payload?: {
        enabledToolGroups?: string[];
        precomputedAiOrders?: { unitId: string; toH3Index: string }[];
        precomputedAiRangedOrders?: { unitId: string; targetH3Index: string }[];
      }) => Promise<ReadyResult>;
      requestAiOrders: (payload?: { enabledToolGroups?: string[] }) => Promise<
        | { success: true; orders: { unitId: string; toH3Index: string }[]; rangedAttacks?: RangedAttackOrder[]; strategy?: string; dropped?: number; dropReasons?: string[]; toolInvocationCounts?: Record<string, number> }
        | { success: false; error: string }
      >;
      cancelRequestAiOrders: () => Promise<void>;
      registerOpenRouterLogListener?: (callback: (payload: { line: string; isError?: boolean }) => void) => void;
      openRouter?: {
        getKey: () => Promise<{ hasKey: boolean }>;
        setKey: (key: string) => Promise<void>;
        listModels: () => Promise<{ models?: { id: string; name?: string }[]; error?: string }>;
        setSelectedModel: (modelId: string) => Promise<void>;
        getToolGroupList: () => Promise<{ id: string; label: string }[]>;
        getSelectedModel: () => Promise<string>;
      };
    };
  }
}

/** Map background (style guide: neutral, recedes). */
const BACKGROUND_COLOR = '#e0dcd4';

const UNIT_RADIUS = 20;
/** Player accents (style guide: P1 #2e5a7b, P2 #7b4a2e). */
const PLAYER_COLORS: Record<string, string> = {
  human: '#2e5a7b',
  opponent: '#7b4a2e',
};
const UNIT_TYPE_LABELS: Record<string, string> = {
  infantry: 'I',
  armor: 'A',
  naval: 'N',
};

const ORDER_LINE_COLOR = '#2e5a7b';
const ORDER_LINE_WIDTH = 2.5;
const ORDER_ARROW_SIZE = 10;
/** AI movement arrow (opponent accent). */
const AI_ORDER_LINE_COLOR = '#7b4a2e';
const RESOLUTION_FADE_MS = 1000;
/** Combat (lightning) and casualty (red X) phases each use this duration; they run before movement. */
const LIGHTNING_DURATION_MS = 1000;

/** 5-phase resolution: ranged lightning → ranged casualty → movement → melee lightning → melee casualty. */
function getResolutionPhase5(
  elapsed: number,
  hasRangedCombat: boolean,
  hasRangedCasualties: boolean,
  hasMeleeCombat: boolean,
  hasMeleeCasualties: boolean
): {
  movementStart: number;
  totalMs: number;
  moveProgress: number;
  inRangedLightning: boolean;
  inRangedCasualty: boolean;
  inMeleeLightning: boolean;
  inMeleeCasualty: boolean;
  inMovement: boolean;
} {
  const L = LIGHTNING_DURATION_MS;
  const rangedLightningEnd = hasRangedCombat ? L : 0;
  const rangedCasualtyEnd = rangedLightningEnd + (hasRangedCasualties ? L : 0);
  const movementStart = rangedCasualtyEnd;
  const movementEnd = movementStart + RESOLUTION_FADE_MS;
  const meleeLightningEnd = movementEnd + (hasMeleeCombat ? L : 0);
  const meleeCasualtyEnd = meleeLightningEnd + (hasMeleeCasualties ? L : 0);
  const totalMs = meleeCasualtyEnd;
  const moveProgress =
    elapsed < movementStart ? 0 : elapsed >= movementEnd ? 1 : (elapsed - movementStart) / RESOLUTION_FADE_MS;
  return {
    movementStart,
    totalMs,
    moveProgress,
    inRangedLightning: hasRangedCombat && elapsed < rangedLightningEnd,
    inRangedCasualty: hasRangedCasualties && elapsed >= rangedLightningEnd && elapsed < rangedCasualtyEnd,
    inMovement: elapsed >= movementStart && elapsed < movementEnd,
    inMeleeLightning: hasMeleeCombat && elapsed >= movementEnd && elapsed < meleeLightningEnd,
    inMeleeCasualty: hasMeleeCasualties && elapsed >= meleeLightningEnd && elapsed < meleeCasualtyEnd,
  };
}

function getUnitAtHex(h3Index: string): GameStateSnapshot['units'][0] | null {
  if (!gameState) return null;
  return gameState.units.find((u) => u.h3Index === h3Index) ?? null;
}

/** Returns all units at the given hex. */
function getUnitsAtHex(h3Index: string): GameStateSnapshot['units'] {
  if (!gameState) return [];
  return gameState.units.filter((u) => u.h3Index === h3Index);
}

/** Builds stack tooltip text: counts by player and unit type (e.g. "2 human armor, 1 opponent infantry"). */
function formatStackTooltip(units: GameStateSnapshot['units']): string {
  const byKey = new Map<string, number>();
  for (const u of units) {
    const key = `${u.player} ${u.unitType}`;
    byKey.set(key, (byKey.get(key) ?? 0) + 1);
  }
  return Array.from(byKey.entries())
    .map(([key, n]) => `${n} ${key}`)
    .sort()
    .join(', ');
}

/** Hides the stack callout popover (e.g. after selecting a unit or clicking elsewhere). */
function hideStackCallout(): void {
  const el = document.getElementById('stack-callout');
  if (el) el.classList.add('hidden');
}

/**
 * Shows the stack callout at the given screen position with an alphabetized list of units.
 * Units belonging to the human player get a "Select" button to select that unit for movement or ranged fire.
 */
function showStackCallout(
  units: GameStateSnapshot['units'],
  clientX: number,
  clientY: number
): void {
  const calloutEl = document.getElementById('stack-callout');
  const listEl = document.getElementById('stack-callout-list');
  const tooltipEl = document.getElementById('hex-tooltip');
  if (!calloutEl || !listEl) return;
  tooltipEl?.classList.add('hidden');

  const sorted = [...units].sort(
    (a, b) =>
      `${a.player} ${a.unitType} ${a.id}`.localeCompare(`${b.player} ${b.unitType} ${b.id}`)
  );

  listEl.innerHTML = '';
  for (const u of sorted) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'unit-label';
    label.textContent = u.id;
    li.appendChild(label);
    if (u.player === 'human') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'unit-select';
      btn.textContent = 'Select';
      btn.addEventListener('click', () => {
        selectUnitOnMap(u.id);
        hideStackCallout();
        updateSidebar();
        updateRangedSidebar();
        redraw();
      });
      li.appendChild(btn);
    }
    listEl.appendChild(li);
  }

  calloutEl.style.left = `${clientX + TOOLTIP_OFFSET_PX}px`;
  calloutEl.style.top = `${clientY + TOOLTIP_OFFSET_PX}px`;
  calloutEl.setAttribute('aria-label', formatStackTooltip(units));
  calloutEl.classList.remove('hidden');
}

const TOOLTIP_OFFSET_PX = 12;

const MIN_SCALE = 0.2;
const MAX_SCALE = 5;
const ZOOM_FACTOR = 1.15;

const view: ViewState = {
  scale: 1,
  offsetX: 0,
  offsetY: 0,
};

let selectedHexIndex: string | null = null;
let selectedUnitId: string | null = null;
/** Unit selected at mousedown; used so double-click can issue move to an occupied hex without reselecting. */
let selectedUnitIdAtMouseDown: string | null = null;
/** Timeout for deferred single-click selection so double-click can issue move before selection runs. */
let pendingSelectTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingOrders: { unitId: string; toH3Index: string }[] = [];
let pendingRangedAttacks: RangedAttackOrder[] = [];
/** When true, next hex click sets ranged attack target for selected unit (if valid). */
let rangedModeActive = false;
let gameState: GameStateSnapshot | null = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartOffsetX = 0;
let dragStartOffsetY = 0;
const DRAG_THRESHOLD_PX = 5;
let dragDistanceSq = 0;

/** When non-null, we are animating resolution: ranged lightning → ranged casualty → movement → melee lightning → melee casualty. */
let resolutionMoveAnimation: {
  moves: ResolutionMove[];
  startTime: number;
  /** Legacy combined (for backward compat); prefer ranged/melee split. */
  combatHexes?: string[];
  casualtyHexes?: string[];
  rangedCombatHexes?: string[];
  rangedCasualtyHexes?: string[];
  rangedRemovedUnits?: RemovedUnitSnapshot[];
  meleeCombatHexes?: string[];
  meleeCasualtyHexes?: string[];
  meleeRemovedUnits?: RemovedUnitSnapshot[];
} | null = null;
let resolutionMoveAnimationFrameId: number | null = null;

/** Tool group id and label for the Tools tab. Fallback when getToolGroupList is unavailable; order matches main registry. */
const OPENROUTER_TOOL_GROUPS: { id: string; label: string }[] = [
  { id: 'planning', label: 'Planning' },
  { id: 'assessment', label: 'Assessment' },
  { id: 'estimation', label: 'Estimation' },
];

/** Current tool groups shown in the Tools tab (from main registry or fallback). */
let openRouterToolGroups: { id: string; label: string }[] = [...OPENROUTER_TOOL_GROUPS];

/** Which tool groups are enabled for the AI. Default all enabled. */
let enabledToolGroups: Set<string> = new Set(OPENROUTER_TOOL_GROUPS.map((g) => g.id));

/** Per-group invocation counts for the most recent turn. Reset on Ready click. */
let toolInvocationCounts: Record<string, number> = Object.fromEntries(OPENROUTER_TOOL_GROUPS.map((g) => [g.id, 0]));

/** Run toggle: when true, background AI planning runs and Ready enables only when orders ready; when false, Ready stays enabled (user resolves without LLM). */
let runButtonOn = false;

/** Precomputed AI movement orders from the last background request; null until request completes. Cleared on Ready click or when Run is turned off. */
let precomputedAiOrders: { unitId: string; toH3Index: string }[] | null = null;

/** Precomputed AI ranged orders from the last background request; cleared with precomputedAiOrders. */
let precomputedAiRangedOrders: { unitId: string; targetH3Index: string }[] | null = null;

/** True while a background requestAiOrders call is in flight; used to avoid duplicate requests and to guard start. */
let backgroundRequestInFlight = false;

/** Total OpenRouter API cost in dollars for the current game session. Reset on new game. */
let openRouterGameCost = 0;

/**
 * Starts one background AI orders request if conditions allow (planning phase, key and model set, no request in flight).
 * Used when Run is toggled on and after new game when Run is on. On success stores orders and enables Ready; on failure shows a user-visible error.
 */
function startBackgroundRequestIfAllowed(): void {
  if (backgroundRequestInFlight || !runButtonOn || gameState?.phase !== 'planning') return;
  const keyPromise = window.gameApi?.openRouter?.getKey?.();
  const modelPromise = window.gameApi?.openRouter?.getSelectedModel?.();
  if (!keyPromise || !modelPromise) return;
  backgroundRequestInFlight = true;
  Promise.all([keyPromise, modelPromise]).then(([keyResult, modelId]) => {
    if (!keyResult?.hasKey || !modelId?.trim()) {
      backgroundRequestInFlight = false;
      appendOpenRouterLog('Run is on but API key or model not set.', true);
      updateReadyButtonState();
      return;
    }
    if (!runButtonOn || !window.gameApi?.requestAiOrders) {
      backgroundRequestInFlight = false;
      updateReadyButtonState();
      return;
    }
    const enabledToolGroupsPayload = Array.from(enabledToolGroups);
    window.gameApi
      .requestAiOrders({ enabledToolGroups: enabledToolGroupsPayload })
      .then((result) => {
        backgroundRequestInFlight = false;
        if (runButtonOn && result.success) {
          precomputedAiOrders = result.orders;
          precomputedAiRangedOrders = result.rangedAttacks ?? [];
          if (result.toolInvocationCounts) {
            for (const [groupId, count] of Object.entries(result.toolInvocationCounts)) {
              toolInvocationCounts[groupId] = count;
            }
            updateOpenRouterToolCountLabels();
          }
          if (result.cost !== undefined) {
            openRouterGameCost += result.cost;
            updateOpenRouterCostLabel();
          }
        } else if (!result.success) {
          showSidebarError(result.error ?? 'Background AI request failed');
        }
        updateReadyButtonState();
      })
      .catch((err) => {
        backgroundRequestInFlight = false;
        showSidebarError(String(err));
        updateReadyButtonState();
      });
  });
}

/**
 * Renders or updates the Tools tab list: 2-column grid; each cell has label and count (toggle button).
 * Toggle click flips enabled state. Does not call main or Ready.
 */
function renderOpenRouterToolsList(): void {
  const container = document.getElementById('openrouter-tools-list');
  if (!container) return;
  container.innerHTML = '';
  for (const group of openRouterToolGroups) {
    const cell = document.createElement('div');
    cell.className = 'openrouter-tool-cell';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'openrouter-tool-toggle';
    btn.setAttribute('data-tool-group', group.id);
    btn.setAttribute('aria-pressed', enabledToolGroups.has(group.id) ? 'true' : 'false');
    btn.textContent = String(toolInvocationCounts[group.id] ?? 0);
    btn.addEventListener('click', () => {
      if (enabledToolGroups.has(group.id)) {
        enabledToolGroups.delete(group.id);
      } else {
        enabledToolGroups.add(group.id);
      }
      btn.setAttribute('aria-pressed', enabledToolGroups.has(group.id) ? 'true' : 'false');
      btn.textContent = String(toolInvocationCounts[group.id] ?? 0);
    });
    cell.appendChild(btn);
    const label = document.createElement('span');
    label.className = 'openrouter-tool-label';
    label.textContent = group.label;
    cell.appendChild(label);
    container.appendChild(cell);
  }
}

/**
 * Single source of truth for Ready button enabled state. Run off ⇒ Ready enabled (unless game over).
 * Run on ⇒ Ready enabled only when precomputed AI orders are available. Call after load, new game,
 * Run toggle, background result, Ready click start, and whenever game state is applied.
 */
function updateReadyButtonState(): void {
  const readyBtn = document.getElementById('ready-btn') as HTMLButtonElement | null;
  if (!readyBtn) return;
  const gameOver = gameState?.gameOver ?? false;
  readyBtn.disabled = gameOver || (runButtonOn && precomputedAiOrders === null);
}

/**
 * Updates only the count labels on the tool toggles (e.g. after Ready or background result).
 * Call after toolInvocationCounts has been updated.
 */
function updateOpenRouterToolCountLabels(): void {
  for (const group of openRouterToolGroups) {
    const btn = document.querySelector(`.openrouter-tool-toggle[data-tool-group="${group.id}"]`);
    if (btn) btn.textContent = String(toolInvocationCounts[group.id] ?? 0);
  }
}

/** Formats dollars for display (e.g. $0.02, $1,234.56). Supports up to $9,999.99. */
function formatOpenRouterCost(dollars: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

/** Updates the API cost label to the current game total. */
function updateOpenRouterCostLabel(): void {
  const el = document.getElementById('openrouter-cost');
  if (el) el.textContent = formatOpenRouterCost(openRouterGameCost);
}

/** OpenRouter status log: append a line with optional error styling. */
function appendOpenRouterLog(line: string, isError = false): void {
  const el = document.getElementById('openrouter-log');
  if (!el) return;
  const time = new Date().toLocaleTimeString();
  const span = document.createElement('div');
  span.textContent = `${time} ${line}`;
  if (isError) span.style.color = '#a03030';
  el.appendChild(span);
  el.scrollTop = el.scrollHeight;
}

/** Toast: show message for a readable duration, then auto-hide; can dismiss early. */
const TOAST_DURATION_MS = 8000;
let toastHideTimer: ReturnType<typeof setTimeout> | null = null;
let aiStrategyToastHideTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Shows a toast message over the map. Auto-hides after TOAST_DURATION_MS unless dismissed.
 * Use for errors (red border) or info e.g. AI moves (blue border).
 */
function showMapToast(message: string, options?: { isError?: boolean }): void {
  if (toastHideTimer !== null) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  const el = document.getElementById('map-toast');
  const textEl = document.getElementById('map-toast-text');
  if (el && textEl) {
    textEl.textContent = message;
    el.classList.toggle('toast-info', options?.isError === false);
    el.classList.remove('hidden');
  }
  toastHideTimer = setTimeout(() => {
    toastHideTimer = null;
    hideMapToast();
  }, TOAST_DURATION_MS);
}

function hideMapToast(): void {
  if (toastHideTimer !== null) {
    clearTimeout(toastHideTimer);
    toastHideTimer = null;
  }
  const el = document.getElementById('map-toast');
  if (el) el.classList.add('hidden');
}

/**
 * Shows the AI strategy toast (upper-left). Same duration and dismiss behavior as the map toast.
 */
function showAiStrategyToast(message: string): void {
  if (aiStrategyToastHideTimer !== null) {
    clearTimeout(aiStrategyToastHideTimer);
    aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  const textEl = document.getElementById('ai-strategy-toast-text');
  if (el && textEl) {
    textEl.textContent = message;
    el.classList.add('toast-info');
    el.classList.remove('hidden');
  }
  aiStrategyToastHideTimer = setTimeout(() => {
    aiStrategyToastHideTimer = null;
    hideAiStrategyToast();
  }, TOAST_DURATION_MS);
}

function hideAiStrategyToast(): void {
  if (aiStrategyToastHideTimer !== null) {
    clearTimeout(aiStrategyToastHideTimer);
    aiStrategyToastHideTimer = null;
  }
  const el = document.getElementById('ai-strategy-toast');
  if (el) el.classList.add('hidden');
}

/**
 * Resizes the canvas to match its container (including devicePixelRatio) and redraws the hex grid.
 */
function resizeAndRedraw(): void {
  const container = document.getElementById('canvas-container');
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  if (!container || !canvas) return;

  const dpr = window.devicePixelRatio ?? 1;
  const rect = container.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (!gameState) {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#666';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading…', w / 2, h / 2);
    return;
  }

  drawHexes(ctx, view, w, h, BACKGROUND_COLOR, selectedHexIndex, gameState.hexes);
  const hexList = gameState.hexes.map((h) => h.h3Index);
  let moveProgress = 1;
  let unitsToDraw: GameStateSnapshot['units'] = gameState.units;
  let movingIds: Set<string> | undefined;
  const anim = resolutionMoveAnimation;
  if (anim) {
    const elapsed = Date.now() - anim.startTime;
    const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
    const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
    const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
    const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
    const phase = getResolutionPhase5(
      elapsed,
      hasRangedCombat,
      hasRangedCasualties,
      hasMeleeCombat,
      hasMeleeCasualties
    );
    moveProgress = phase.moveProgress;
    const rangedRemovedIds = new Set((anim.rangedRemovedUnits ?? []).map((u) => u.id));
    if (phase.inRangedLightning || phase.inRangedCasualty) {
      const preMoveSurvivors = gameState.units
        .filter((u) => !rangedRemovedIds.has(u.id))
        .map((u) => {
          const move = anim.moves.find((m) => m.unitId === u.id);
          return move ? { ...u, h3Index: move.fromH3Index } : u;
        });
      unitsToDraw = [...preMoveSurvivors, ...(anim.rangedRemovedUnits ?? [])];
      movingIds = undefined;
    } else if (phase.inMovement) {
      unitsToDraw = gameState.units;
      movingIds = moveProgress < 1 ? new Set(anim.moves.map((m) => m.unitId)) : undefined;
    } else if (phase.inMeleeLightning || phase.inMeleeCasualty) {
      unitsToDraw = [...gameState.units, ...(anim.meleeRemovedUnits ?? [])];
      movingIds = undefined;
    }
    if (elapsed >= phase.movementStart) {
      drawResolutionMoveLines(ctx, view, w, h, anim.moves, gameState.units, hexList, 1);
    }
  } else {
    movingIds = undefined;
  }
  if (pendingOrders.length > 0 && gameState.units.length && hexList) {
    drawOrderLines(ctx, view, w, h, pendingOrders, gameState.units, hexList);
  }
  if (pendingRangedAttacks.length > 0 && gameState.units.length && hexList) {
    drawRangedAttackLines(ctx, view, w, h, pendingRangedAttacks, gameState.units, hexList);
  }
  if (unitsToDraw.length) {
    drawUnits(ctx, view, w, h, unitsToDraw, hexList, movingIds);
  }
  if (anim && hexList && moveProgress < 1) {
    drawMovingUnits(ctx, view, w, h, anim.moves, gameState.units, hexList, moveProgress);
  }
  if (anim && hexList) {
    const elapsed = Date.now() - anim.startTime;
    const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
    const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
    const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
    const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
    const phase = getResolutionPhase5(
      elapsed,
      hasRangedCombat,
      hasRangedCasualties,
      hasMeleeCombat,
      hasMeleeCasualties
    );
    const combatHexes = phase.inRangedLightning ? (anim.rangedCombatHexes ?? anim.combatHexes) : phase.inMeleeLightning ? anim.meleeCombatHexes : undefined;
    if (combatHexes?.length) {
      const pulseOpacity = 0.5 + 0.5 * Math.sin(elapsed * 0.008);
      drawCombatLightning(ctx, view, w, h, combatHexes, hexList, pulseOpacity);
    }
    const casualtyHexes = phase.inRangedCasualty ? (anim.rangedCasualtyHexes ?? anim.casualtyHexes) : phase.inMeleeCasualty ? anim.meleeCasualtyHexes : undefined;
    if (casualtyHexes?.length) {
      const casualtyElapsed = phase.inRangedCasualty ? elapsed - (hasRangedCombat ? LIGHTNING_DURATION_MS : 0) : elapsed - (phase.movementStart + RESOLUTION_FADE_MS + (hasMeleeCombat ? LIGHTNING_DURATION_MS : 0));
      const pulseOpacity = 0.5 + 0.5 * Math.sin(casualtyElapsed * 0.008);
      drawCasualtyOverlay(ctx, view, w, h, casualtyHexes, hexList, pulseOpacity);
    }
  }
}

const STACK_OFFSET_X = 7;
const STACK_OFFSET_Y = -4;
const COUNT_BADGE_OFFSET = 18;
const MULTI_PLAYER_FILL = '#b0b0b0';
const MULTI_PLAYER_STROKE = '#000';

/**
 * Draws one unit marker (circle + label) at (x, y). Used by drawUnits and drawMovingUnits.
 */
function drawOneUnitMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  label: string,
  strokeColor: string = '#fff'
): void {
  ctx.beginPath();
  ctx.arc(x, y, UNIT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 18px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y);
}

/**
 * Draws unit markers with stacking: grouped by hex, layered icon + count badge when count > 1,
 * asterisk for mixed types, light grey + black border for multi-player stacks.
 * When movingUnitIds is provided, units in that set are omitted (drawn elsewhere at interpolated positions).
 */
function drawUnits(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined,
  movingUnitIds?: Set<string>
): void {
  if (!hexList || units.length === 0) return;
  const byHex = new Map<string, GameStateSnapshot['units']>();
  for (const u of units) {
    if (movingUnitIds?.has(u.id)) continue;
    const list = byHex.get(u.h3Index) ?? [];
    list.push(u);
    byHex.set(u.h3Index, list);
  }
  for (const [h3Index, hexUnits] of byHex) {
    const { x, y } = getHexCanvasCenter(h3Index, view, canvasWidth, canvasHeight, hexList);
    const count = hexUnits.length;
    const types = new Set(hexUnits.map((u) => u.unitType));
    const players = new Set(hexUnits.map((u) => u.player));
    const mixedType = types.size > 1;
    const multiPlayer = players.size > 1;
    const fillColor = multiPlayer ? MULTI_PLAYER_FILL : (PLAYER_COLORS[hexUnits[0]!.player] ?? '#333');
    const strokeColor = multiPlayer ? MULTI_PLAYER_STROKE : '#fff';
    const label = mixedType ? '*' : (UNIT_TYPE_LABELS[hexUnits[0]!.unitType] ?? '?');

    drawOneUnitMarker(ctx, x, y, fillColor, label, strokeColor);
    if (count > 1) {
      drawOneUnitMarker(ctx, x + STACK_OFFSET_X, y + STACK_OFFSET_Y, fillColor, label, strokeColor);
      const badgeX = x + COUNT_BADGE_OFFSET;
      const badgeY = y + COUNT_BADGE_OFFSET;
      ctx.font = 'bold 13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.strokeText(String(count), badgeX, badgeY);
      ctx.fillStyle = '#000';
      ctx.fillText(String(count), badgeX, badgeY);
    }
  }
}

const LIGHTNING_COLOR = '#f0d000';

/**
 * Draws a hex-sized yellow pulsing lightning bolt at each combat hex. Call after units so it sits on top.
 * opacity in [0, 1]; combine with pulse for visibility during resolution.
 */
function drawCombatLightning(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  combatHexes: string[],
  hexList: string[],
  opacity: number
): void {
  if (combatHexes.length === 0 || opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const h = 18;
  for (const h3Index of combatHexes) {
    const { x, y } = getHexCanvasCenter(h3Index, view, canvasWidth, canvasHeight, hexList);
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + 6, y - 4);
    ctx.lineTo(x - 4, y + 6);
    ctx.lineTo(x + 5, y + h);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = LIGHTNING_COLOR;
    ctx.lineWidth = 3;
    ctx.stroke();
  }
  ctx.restore();
}

const CASUALTY_X_COLOR = '#c03030';

/**
 * Draws a pulsing red X at each casualty hex (unit lost). Call after lightning fades for LIGHTNING_DURATION_MS.
 */
function drawCasualtyOverlay(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  casualtyHexes: string[],
  hexList: string[],
  opacity: number
): void {
  if (casualtyHexes.length === 0 || opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.lineCap = 'round';
  const size = 20;
  for (const h3Index of casualtyHexes) {
    const { x, y } = getHexCanvasCenter(h3Index, view, canvasWidth, canvasHeight, hexList);
    ctx.beginPath();
    ctx.moveTo(x - size, y - size);
    ctx.lineTo(x + size, y + size);
    ctx.moveTo(x + size, y - size);
    ctx.lineTo(x - size, y + size);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.strokeStyle = CASUALTY_X_COLOR;
    ctx.lineWidth = 4;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws ranged attack indicators: line from unit to target hex. Style distinct from movement (dashed, accent color).
 */
function drawRangedAttackLines(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  ranged: RangedAttackOrder[],
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined
): void {
  if (ranged.length === 0 || !hexList) return;
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#a06020';
  ctx.lineWidth = ORDER_LINE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const r of ranged) {
    const unit = units.find((u) => u.id === r.unitId);
    if (!unit) continue;
    const from = getHexCanvasCenter(unit.h3Index, view, canvasWidth, canvasHeight, hexList);
    const to = getHexCanvasCenter(r.targetH3Index, view, canvasWidth, canvasHeight, hexList);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws movement order indicators: a line with arrowhead from each unit's current hex to its staged destination.
 * Drawn after hexes, before units, so arrows sit under unit markers. Style aligned with strategy/wargame convention.
 */
function drawOrderLines(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  orders: { unitId: string; toH3Index: string }[],
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined
): void {
  if (orders.length === 0 || !hexList) return;

  for (const order of orders) {
    const unit = units.find((u) => u.id === order.unitId);
    if (!unit) continue;
    const from = getHexCanvasCenter(unit.h3Index, view, canvasWidth, canvasHeight, hexList);
    const to = getHexCanvasCenter(order.toH3Index, view, canvasWidth, canvasHeight, hexList);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const inset = UNIT_RADIUS + ORDER_ARROW_SIZE;
    const endX = to.x - ux * inset;
    const endY = to.y - uy * inset;

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = ORDER_LINE_COLOR;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    const ax = endX + ux * ORDER_ARROW_SIZE;
    const ay = endY + uy * ORDER_ARROW_SIZE;
    const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
    const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.closePath();
    ctx.fillStyle = ORDER_LINE_COLOR;
    ctx.fill();
    ctx.strokeStyle = ORDER_LINE_COLOR;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.stroke();
  }
}

/**
 * Draws resolution-phase movement arrows (from → to) with optional opacity. Color by player (human vs opponent).
 * Call after hexes, before units. opacity in [0, 1].
 */
function drawResolutionMoveLines(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  moves: ResolutionMove[],
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined,
  opacity: number
): void {
  if (moves.length === 0 || !hexList || opacity <= 0) return;
  ctx.save();
  ctx.globalAlpha = opacity;
  for (const move of moves) {
    const unit = units.find((u) => u.id === move.unitId);
    if (!unit) continue;
    const lineColor = unit.player === 'human' ? ORDER_LINE_COLOR : AI_ORDER_LINE_COLOR;
    const from = getHexCanvasCenter(move.fromH3Index, view, canvasWidth, canvasHeight, hexList);
    const to = getHexCanvasCenter(move.toH3Index, view, canvasWidth, canvasHeight, hexList);
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const inset = UNIT_RADIUS + ORDER_ARROW_SIZE;
    const endX = to.x - ux * inset;
    const endY = to.y - uy * inset;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    const ax = endX + ux * ORDER_ARROW_SIZE;
    const ay = endY + uy * ORDER_ARROW_SIZE;
    const perpX = -uy * (ORDER_ARROW_SIZE * 0.6);
    const perpY = ux * (ORDER_ARROW_SIZE * 0.6);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(endX - perpX, endY - perpY);
    ctx.lineTo(endX + perpX, endY + perpY);
    ctx.closePath();
    ctx.fillStyle = lineColor;
    ctx.fill();
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = ORDER_LINE_WIDTH;
    ctx.stroke();
  }
  ctx.restore();
}

/**
 * Draws moving units at interpolated positions (from + progress * (to - from)) over the resolution animation.
 * One icon per unit; no stacking. Call when progress < 1; when progress >= 1 units are drawn at destinations via drawUnits.
 */
function drawMovingUnits(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  moves: ResolutionMove[],
  units: GameStateSnapshot['units'],
  hexList: string[],
  progress: number
): void {
  if (moves.length === 0 || progress >= 1) return;
  for (const move of moves) {
    const unit = units.find((u) => u.id === move.unitId);
    if (!unit) continue;
    const from = getHexCanvasCenter(move.fromH3Index, view, canvasWidth, canvasHeight, hexList);
    const to = getHexCanvasCenter(move.toH3Index, view, canvasWidth, canvasHeight, hexList);
    const x = from.x + progress * (to.x - from.x);
    const y = from.y + progress * (to.y - from.y);
    const color = PLAYER_COLORS[unit.player] ?? '#333';
    const label = UNIT_TYPE_LABELS[unit.unitType] ?? '?';
    drawOneUnitMarker(ctx, x, y, color, label, '#fff');
  }
}

/** Redraws the hex grid without resizing the canvas. Use after pan/zoom or selection change. */
function redraw(): void {
  const container = document.getElementById('canvas-container');
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  if (!container || !canvas) return;

  const rect = container.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width));
  const h = Math.max(1, Math.floor(rect.height));

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const dpr = window.devicePixelRatio ?? 1;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);

  if (!gameState) {
    ctx.fillStyle = BACKGROUND_COLOR;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#666';
    ctx.font = '14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading…', w / 2, h / 2);
    return;
  }

  drawHexes(ctx, view, w, h, BACKGROUND_COLOR, selectedHexIndex, gameState.hexes);
  const hexList = gameState.hexes.map((h) => h.h3Index);
  let moveProgress = 1;
  let unitsToDraw: GameStateSnapshot['units'] = gameState.units;
  let movingIds: Set<string> | undefined;
  const anim = resolutionMoveAnimation;
  if (anim) {
    const elapsed = Date.now() - anim.startTime;
    const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
    const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
    const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
    const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
    const phase = getResolutionPhase5(
      elapsed,
      hasRangedCombat,
      hasRangedCasualties,
      hasMeleeCombat,
      hasMeleeCasualties
    );
    moveProgress = phase.moveProgress;
    const rangedRemovedIds = new Set((anim.rangedRemovedUnits ?? []).map((u) => u.id));
    if (phase.inRangedLightning || phase.inRangedCasualty) {
      const preMoveSurvivors = gameState.units
        .filter((u) => !rangedRemovedIds.has(u.id))
        .map((u) => {
          const move = anim.moves.find((m) => m.unitId === u.id);
          return move ? { ...u, h3Index: move.fromH3Index } : u;
        });
      unitsToDraw = [...preMoveSurvivors, ...(anim.rangedRemovedUnits ?? [])];
      movingIds = undefined;
    } else if (phase.inMovement) {
      unitsToDraw = gameState.units;
      movingIds = moveProgress < 1 ? new Set(anim.moves.map((m) => m.unitId)) : undefined;
    } else if (phase.inMeleeLightning || phase.inMeleeCasualty) {
      unitsToDraw = [...gameState.units, ...(anim.meleeRemovedUnits ?? [])];
      movingIds = undefined;
    }
    if (elapsed >= phase.movementStart) {
      drawResolutionMoveLines(ctx, view, w, h, anim.moves, gameState.units, hexList, 1);
    }
  } else {
    movingIds = undefined;
  }
  if (pendingOrders.length > 0 && gameState.units.length && hexList) {
    drawOrderLines(ctx, view, w, h, pendingOrders, gameState.units, hexList);
  }
  if (pendingRangedAttacks.length > 0 && gameState.units.length && hexList) {
    drawRangedAttackLines(ctx, view, w, h, pendingRangedAttacks, gameState.units, hexList);
  }
  if (unitsToDraw.length) {
    drawUnits(ctx, view, w, h, unitsToDraw, hexList, movingIds);
  }
  if (anim && hexList && moveProgress < 1) {
    drawMovingUnits(ctx, view, w, h, anim.moves, gameState.units, hexList, moveProgress);
  }
  if (anim && hexList) {
    const elapsed = Date.now() - anim.startTime;
    const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
    const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
    const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
    const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
    const phase = getResolutionPhase5(
      elapsed,
      hasRangedCombat,
      hasRangedCasualties,
      hasMeleeCombat,
      hasMeleeCasualties
    );
    const combatHexes = phase.inRangedLightning ? (anim.rangedCombatHexes ?? anim.combatHexes) : phase.inMeleeLightning ? anim.meleeCombatHexes : undefined;
    if (combatHexes?.length) {
      const pulseOpacity = 0.5 + 0.5 * Math.sin(elapsed * 0.008);
      drawCombatLightning(ctx, view, w, h, combatHexes, hexList, pulseOpacity);
    }
    const casualtyHexes = phase.inRangedCasualty ? (anim.rangedCasualtyHexes ?? anim.casualtyHexes) : phase.inMeleeCasualty ? anim.meleeCasualtyHexes : undefined;
    if (casualtyHexes?.length) {
      const casualtyElapsed = phase.inRangedCasualty ? elapsed - (hasRangedCombat ? LIGHTNING_DURATION_MS : 0) : elapsed - (phase.movementStart + RESOLUTION_FADE_MS + (hasMeleeCombat ? LIGHTNING_DURATION_MS : 0));
      const pulseOpacity = 0.5 + 0.5 * Math.sin(casualtyElapsed * 0.008);
      drawCasualtyOverlay(ctx, view, w, h, casualtyHexes, hexList, pulseOpacity);
    }
  }
}

function tickResolutionMoveAnimation(): void {
  if (!resolutionMoveAnimation) return;
  const anim = resolutionMoveAnimation;
  const elapsed = Date.now() - anim.startTime;
  const hasRangedCombat = (anim.rangedCombatHexes?.length ?? 0) > 0 || (anim.combatHexes?.length ?? 0) > 0;
  const hasRangedCasualties = (anim.rangedCasualtyHexes?.length ?? 0) > 0 || (anim.casualtyHexes?.length ?? 0) > 0;
  const hasMeleeCombat = (anim.meleeCombatHexes?.length ?? 0) > 0;
  const hasMeleeCasualties = (anim.meleeCasualtyHexes?.length ?? 0) > 0;
  const { totalMs } = getResolutionPhase5(
    elapsed,
    hasRangedCombat,
    hasRangedCasualties,
    hasMeleeCombat,
    hasMeleeCasualties
  );
  redraw();
  if (elapsed < totalMs) {
    resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
  } else {
    resolutionMoveAnimation = null;
    resolutionMoveAnimationFrameId = null;
    redraw();
  }
}

/** Updates the sidebar with the selected hex's H3 index, cube coordinates, and selected unit, or placeholders. */
function updateSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const h3El = document.getElementById('sidebar-h3');
  const cubeEl = document.getElementById('sidebar-cube');
  const selectedUnitEl = document.getElementById('sidebar-selected-unit');

  if (selectedUnitEl) {
    selectedUnitEl.textContent = selectedUnitId ?? '—';
  }

  if (selectedHexIndex === null) {
    if (h3El) h3El.textContent = '—';
    if (cubeEl) cubeEl.textContent = '—';
    return;
  }

  if (h3El) h3El.textContent = selectedHexIndex;
  if (cubeEl) {
    const origin = gameState?.hexes?.[0]?.h3Index;
    const cube = cellToCube(selectedHexIndex, origin);
    cubeEl.textContent = `(${cube.x}, ${cube.y}, ${cube.z})`;
  }
}

function getCanvasAndSize(): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} | null {
  const container = document.getElementById('canvas-container');
  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  if (!container || !canvas) return null;
  const rect = container.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  return { canvas, width, height };
}

function updateGameStateSidebar(state: GameStateSnapshot | null): void {
  const phaseEl = document.getElementById('sidebar-phase');
  const turnEl = document.getElementById('sidebar-turn');
  if (phaseEl) phaseEl.textContent = state ? `Phase: ${state.phase}` : '—';
  if (turnEl) turnEl.textContent = state ? `Turn: ${state.turnNumber}` : '—';
}

/**
 * Shows the new-game overlay when there is no game yet (empty hexes) or when the game is over.
 * Sets message and button label accordingly; caller ensures size selector is visible in both cases.
 */
function updateGameOverUI(state: GameStateSnapshot | null): void {
  const overlay = document.getElementById('game-over-overlay');
  const messageEl = document.getElementById('game-over-message');
  const newGameBtn = document.getElementById('new-game-btn');
  const rangedBtn = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;

  const noGame = !state || state.hexes.length === 0;
  const gameOver = !!state?.gameOver;
  const showOverlay = noGame || gameOver;

  if (!showOverlay) {
    overlay?.classList.add('hidden');
    if (rangedBtn) rangedBtn.disabled = false;
    updateReadyButtonState();
    return;
  }

  overlay?.classList.remove('hidden');
  if (messageEl) {
    if (gameOver) {
      messageEl.textContent = state!.winner === 'human' ? 'You win!' : 'You lose.';
      messageEl.style.display = '';
    } else {
      messageEl.textContent = 'Choose map size and start.';
      messageEl.style.display = '';
    }
  }
  if (newGameBtn) {
    newGameBtn.textContent = noGame ? 'Start game' : 'New game';
  }
  if (rangedBtn) rangedBtn.disabled = true;
  updateReadyButtonState();
}

function initNewGameButton(): void {
  document.getElementById('new-game-btn')?.addEventListener('click', async () => {
    if (!window.gameApi?.newGame) return;
    const sizeEl = document.getElementById('new-game-size') as HTMLSelectElement | null;
    const size = (sizeEl?.value ?? 'small') as 'small' | 'medium' | 'large';
    try {
      const state = (await window.gameApi.newGame(size)) as GameStateSnapshot;
      gameState = state;
      pendingOrders = [];
      pendingRangedAttacks = [];
      rangedModeActive = false;
      selectedUnitId = null;
      selectedHexIndex = null;
      hideStackCallout();
      precomputedAiOrders = null;
      precomputedAiRangedOrders = null;
      backgroundRequestInFlight = false;
      openRouterGameCost = 0;
      updateOpenRouterCostLabel();
      updateGameStateSidebar(state);
      updatePendingOrdersSidebar();
      updateRangedSidebar();
      updateSidebar();
      updateGameOverUI(state);
      updateReadyButtonState();
      if (runButtonOn) startBackgroundRequestIfAllowed();
      redraw();
    } catch (err) {
      console.error('newGame failed:', err);
    }
  });
}

function cancelOrderForUnit(unitId: string): void {
  pendingOrders = pendingOrders.filter((o) => o.unitId !== unitId);
  updatePendingOrdersSidebar();
  redraw();
}

/** Selects a unit on the map by id; sets selectedUnitId and selectedHexIndex from current game state and redraws. */
function selectUnitOnMap(unitId: string): void {
  const unit = gameState?.units.find((u) => u.id === unitId);
  if (!unit) return;
  selectedUnitId = unit.id;
  selectedHexIndex = unit.h3Index;
  updateSidebar();
  updateRangedSidebar();
  redraw();
}

function cancelRangedForUnit(unitId: string): void {
  pendingRangedAttacks = pendingRangedAttacks.filter((r) => r.unitId !== unitId);
  rangedModeActive = false;
  updateRangedSidebar();
  redraw();
}

function updateRangedSidebar(): void {
  const listEl = document.getElementById('ranged-attacks-list');
  const btnEl = document.getElementById('ranged-attack-btn') as HTMLButtonElement | null;
  if (!listEl) return;

  listEl.innerHTML = '';
  if (pendingRangedAttacks.length === 0) {
    const span = document.createElement('span');
    span.textContent = 'None';
    span.style.color = '#666';
    listEl.appendChild(span);
  } else {
    for (const r of pendingRangedAttacks) {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '0.5rem';
      row.style.marginBottom = '0.35rem';
      const label = document.createElement('span');
      label.textContent = `${r.unitId} → ${r.targetH3Index}`;
      label.style.flex = '1';
      label.style.fontSize = '0.9em';
      const selectBtn = document.createElement('button');
      selectBtn.type = 'button';
      selectBtn.textContent = 'Select';
      selectBtn.style.flexShrink = '0';
      selectBtn.style.fontSize = '0.8em';
      selectBtn.addEventListener('click', () => selectUnitOnMap(r.unitId));
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.style.flexShrink = '0';
      cancelBtn.style.fontSize = '0.8em';
      cancelBtn.addEventListener('click', () => cancelRangedForUnit(r.unitId));
      row.appendChild(label);
      row.appendChild(selectBtn);
      row.appendChild(cancelBtn);
      listEl.appendChild(row);
    }
  }

  if (btnEl) {
    const unit = selectedUnitId && gameState?.units.find((u) => u.id === selectedUnitId);
    const range = unit ? (RANGED_RANGE[unit.unitType] ?? 0) : 0;
    if (range >= 1) {
      btnEl.style.display = 'inline-block';
      btnEl.textContent = rangedModeActive ? 'Cancel ranged mode' : 'Ranged attack (click target hex)';
    } else {
      btnEl.style.display = 'none';
      rangedModeActive = false;
    }
  }
}

function updatePendingOrdersSidebar(): void {
  const container = document.getElementById('pending-orders-list');
  if (!container) return;
  container.innerHTML = '';
  if (pendingOrders.length === 0) {
    const span = document.createElement('span');
    span.textContent = 'None';
    span.style.color = '#666';
    container.appendChild(span);
    return;
  }
  for (const order of pendingOrders) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.gap = '0.5rem';
    row.style.marginBottom = '0.35rem';
    const label = document.createElement('span');
    label.textContent = `${order.unitId} → ${order.toH3Index}`;
    label.style.flex = '1';
    label.style.fontSize = '0.9em';
    const selectBtn = document.createElement('button');
    selectBtn.type = 'button';
    selectBtn.textContent = 'Select';
    selectBtn.style.flexShrink = '0';
    selectBtn.style.fontSize = '0.8em';
    selectBtn.addEventListener('click', () => selectUnitOnMap(order.unitId));
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.flexShrink = '0';
    cancelBtn.style.fontSize = '0.8em';
    cancelBtn.addEventListener('click', () => cancelOrderForUnit(order.unitId));
    row.appendChild(label);
    row.appendChild(selectBtn);
    row.appendChild(cancelBtn);
    container.appendChild(row);
  }
}

/** Reports a user-facing error to the floating log (map toast, lower-left) and clears any sidebar error. */
function showSidebarError(message: string): void {
  showMapToast(message, { isError: true });
  clearSidebarError();
}

function clearSidebarError(): void {
  const el = document.getElementById('sidebar-error');
  if (el) el.style.display = 'none';
}

function initOpenRouterUI(): void {
  const api = window.gameApi?.openRouter;
  if (!api) return;

  window.gameApi?.registerOpenRouterLogListener?.((p) => appendOpenRouterLog(p.line, p.isError ?? false));
  updateOpenRouterCostLabel();

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
        openRouterToolGroups = list;
        enabledToolGroups = new Set(list.map((g) => g.id));
        toolInvocationCounts = Object.fromEntries(list.map((g) => [g.id, 0]));
      }
    } finally {
      renderOpenRouterToolsList();
    }
  })();

  const keyInput = document.getElementById('openrouter-key') as HTMLInputElement | null;
  const modelSelect = document.getElementById('openrouter-model') as HTMLSelectElement | null;
  const refreshBtn = document.getElementById('openrouter-refresh-models');

  function refreshModels(): void {
    api!.listModels().then((result) => {
      if (!modelSelect) return;
      const kept = modelSelect.value;
      modelSelect.innerHTML = '<option value="">— Select model —</option>';
      if ('error' in result && result.error) {
        appendOpenRouterLog(`Models: ${result.error}`, true);
        return;
      }
      const models = 'models' in result ? result.models ?? [] : [];
      for (const m of models) {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = m.name ?? m.id;
        modelSelect.appendChild(opt);
      }
      if (kept && Array.from(modelSelect.options).some((o) => o.value === kept)) {
        modelSelect.value = kept;
      }
    });
  }

  refreshModels();

  if (keyInput) {
    keyInput.addEventListener('blur', () => {
      const v = keyInput.value.trim();
      api!.setKey(v).then(() => {
        if (!v) hideMapToast();
      });
    });
  }

  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      api!.setSelectedModel(modelSelect.value);
      if (modelSelect.value) hideMapToast();
    });
  }

  if (refreshBtn) refreshBtn.addEventListener('click', refreshModels);

  /** Run toggle: on ⇒ switch to Tools tab, clear precomputed, start background request; off ⇒ cancel in-flight, clear precomputed. */
  const runBtn = document.getElementById('openrouter-run-btn');
  if (runBtn) {
    runBtn.addEventListener('click', () => {
      runButtonOn = !runButtonOn;
      runBtn.setAttribute('aria-pressed', runButtonOn ? 'true' : 'false');
      if (runButtonOn) {
        document.getElementById('openrouter-tab-tools')?.click();
        precomputedAiOrders = null;
        precomputedAiRangedOrders = null;
        updateReadyButtonState();
        startBackgroundRequestIfAllowed();
      } else {
        window.gameApi?.cancelRequestAiOrders?.();
        precomputedAiOrders = null;
        precomputedAiRangedOrders = null;
        updateReadyButtonState();
      }
    });
  }

  document.getElementById('map-toast-dismiss')?.addEventListener('click', hideMapToast);
  document.getElementById('ai-strategy-toast-dismiss')?.addEventListener('click', hideAiStrategyToast);
}

function init(): void {
  resizeAndRedraw();
  updateSidebar();
  updateGameStateSidebar(null);
  updatePendingOrdersSidebar();
  initOpenRouterUI();
  updateRangedSidebar();
  initNewGameButton();
  updateReadyButtonState();

  document.getElementById('ranged-attack-btn')?.addEventListener('click', () => {
    if (rangedModeActive) {
      rangedModeActive = false;
    } else if (selectedUnitId && gameState) {
      const unit = gameState.units.find((u) => u.id === selectedUnitId);
      const range = unit ? (RANGED_RANGE[unit.unitType] ?? 0) : 0;
      if (range >= 1) rangedModeActive = true;
    }
    updateRangedSidebar();
    redraw();
  });

  if (window.gameApi) {
    window.gameApi
      .getGameState()
      .then((raw) => {
        const state = raw as GameStateSnapshot;
        gameState = state;
        updateGameStateSidebar(state);
        updateRangedSidebar();
        updateSidebar();
        updateGameOverUI(state);
        updateReadyButtonState();
        redraw();
      })
      .catch((err) => console.error('getGameState failed:', err));
  }

  window.addEventListener('resize', resizeAndRedraw);

  const canvas = document.getElementById('canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const info = getCanvasAndSize();
    if (!info) return;

    const { width, height } = info;
    const mouseX = e.clientX - canvas.getBoundingClientRect().left;
    const mouseY = e.clientY - canvas.getBoundingClientRect().top;
    const canvasCenterX = width / 2;
    const canvasCenterY = height / 2;

    const factor = e.deltaY > 0 ? 1 / ZOOM_FACTOR : ZOOM_FACTOR;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));

    const dx = mouseX - canvasCenterX - view.offsetX;
    const dy = mouseY - canvasCenterY - view.offsetY;
    view.offsetX = mouseX - canvasCenterX - (dx * newScale) / view.scale;
    view.offsetY = mouseY - canvasCenterY - (dy * newScale) / view.scale;
    view.scale = newScale;

    redraw();
  }, { passive: false });

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    selectedUnitIdAtMouseDown = selectedUnitId;
    isDragging = true;
    dragDistanceSq = 0;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartOffsetX = view.offsetX;
    dragStartOffsetY = view.offsetY;
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    dragDistanceSq = dx * dx + dy * dy;
    view.offsetX = dragStartOffsetX + dx;
    view.offsetY = dragStartOffsetY + dy;
    redraw();
  });

  canvas.addEventListener('mouseleave', () => {
    document.getElementById('hex-tooltip')?.classList.add('hidden');
  });

  window.addEventListener('mouseup', (e) => {
    if (e.button !== 0) return;
    isDragging = false;
  });

  canvas.addEventListener('click', (e) => {
    if (dragDistanceSq > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
    const info = getCanvasAndSize();
    if (!info) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hexList = gameState?.hexes?.map((h) => h.h3Index);
    const hit = hitTest(x, y, view, info.width, info.height, hexList);
    selectedHexIndex = hit;
    clearSidebarError();

    if (hit && rangedModeActive && selectedUnitId && gameState) {
      const unit = gameState.units.find((u) => u.id === selectedUnitId);
      if (!unit || unit.player !== 'human') {
        rangedModeActive = false;
        updateRangedSidebar();
      } else {
        const range = RANGED_RANGE[unit.unitType] ?? 0;
        if (range < 1) {
          rangedModeActive = false;
          updateRangedSidebar();
        } else {
          let dist: number;
          try {
            dist = gridDistance(unit.h3Index, hit);
          } catch {
            showMapToast('Invalid target hex.', { isError: true });
            return;
          }
          if (dist < 1 || dist > range) {
            showMapToast(`Target out of range (${unit.unitType} range ${range}).`, { isError: true });
            return;
          }
          const enemiesAtTarget = gameState.units.filter((u) => u.h3Index === hit && u.player !== unit.player);
          if (enemiesAtTarget.length === 0) {
            showMapToast('Target hex has no enemy units.', { isError: true });
            return;
          }
          pendingRangedAttacks = pendingRangedAttacks.filter((r) => r.unitId !== selectedUnitId);
          pendingRangedAttacks.push({ unitId: selectedUnitId, targetH3Index: hit });
          rangedModeActive = false;
          showMapToast(`Ranged attack set: ${unit.id} → ${hit}`);
          updateRangedSidebar();
        }
      }
      hideStackCallout();
      updateSidebar();
      redraw();
      return;
    }

    const unitsAtHit = hit ? getUnitsAtHex(hit) : [];
    const isStack = unitsAtHit.length >= 2;
    const isLoneAi = unitsAtHit.length === 1 && unitsAtHit[0]?.player !== 'human';
    if (hit && (isStack || isLoneAi)) {
      showStackCallout(unitsAtHit, e.clientX, e.clientY);
      updateSidebar();
      updateRangedSidebar();
      redraw();
      return;
    }

    hideStackCallout();
    if (hit) {
      const unit = getUnitAtHex(hit);
      if (unit?.player === 'human') {
        if (pendingSelectTimeout !== null) {
          clearTimeout(pendingSelectTimeout);
          pendingSelectTimeout = null;
          /* Second click of a double-click; do not select so dblclick can issue move to this hex. */
        } else {
          const unitIdToSelect = unit.id;
          pendingSelectTimeout = setTimeout(() => {
            selectedUnitId = unitIdToSelect;
            pendingSelectTimeout = null;
            updateSidebar();
            updateRangedSidebar();
            redraw();
          }, 250);
        }
      } else if (selectedUnitId && hit !== gameState?.units.find((u) => u.id === selectedUnitId)?.h3Index) {
        /* Movement orders are issued on double-click so the player can move to an occupied hex. */
        if (pendingSelectTimeout !== null) {
          clearTimeout(pendingSelectTimeout);
          pendingSelectTimeout = null;
        }
      } else {
        if (pendingSelectTimeout !== null) {
          clearTimeout(pendingSelectTimeout);
          pendingSelectTimeout = null;
        }
        selectedUnitId = null;
      }
    } else {
      if (pendingSelectTimeout !== null) {
        clearTimeout(pendingSelectTimeout);
        pendingSelectTimeout = null;
      }
      selectedUnitId = null;
    }

    updateSidebar();
    updateRangedSidebar();
    redraw();
  });

  canvas.addEventListener('dblclick', (e) => {
    if (pendingSelectTimeout !== null) {
      clearTimeout(pendingSelectTimeout);
      pendingSelectTimeout = null;
    }
    if (dragDistanceSq > DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
    const info = getCanvasAndSize();
    if (!info || !gameState) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const hexList = gameState.hexes?.map((h) => h.h3Index);
    const hit = hitTest(x, y, view, info.width, info.height, hexList ?? []);
    if (!hit || !selectedUnitIdAtMouseDown) return;

    const unit = gameState.units.find((u) => u.id === selectedUnitIdAtMouseDown);
    if (!unit || unit.player !== 'human' || unit.h3Index === hit) return;

    const validation = validateMovementOrder(gameState, selectedUnitIdAtMouseDown, hit);
    if (!validation.valid) {
      showMapToast(validation.reason, { isError: true });
      return;
    }

    const idx = pendingOrders.findIndex((o) => o.unitId === selectedUnitIdAtMouseDown);
    const newOrder = { unitId: selectedUnitIdAtMouseDown, toH3Index: hit };
    if (idx >= 0) pendingOrders[idx] = newOrder;
    else pendingOrders.push(newOrder);
    updatePendingOrdersSidebar();
    updateSidebar();
    redraw();
  });

  const readyBtn = document.getElementById('ready-btn');
  if (readyBtn) {
    readyBtn.addEventListener('click', async () => {
      if (!window.gameApi) return;
      if (gameState?.gameOver) return;
      clearSidebarError();
      updateReadyButtonState();
      try {
        const submitResult = (await window.gameApi.submitOrders({
          movementOrders: pendingOrders,
          rangedAttacks: pendingRangedAttacks,
        })) as { success: boolean; reason?: string };
        if (!submitResult.success) {
          showSidebarError(submitResult.reason ?? 'Submit failed');
          updateReadyButtonState();
          return;
        }
        const humanMoves: ResolutionMove[] =
          gameState && pendingOrders.length > 0
            ? pendingOrders
                .map((o) => {
                  const from = gameState.units.find((u) => u.id === o.unitId)?.h3Index;
                  if (!from || from === o.toH3Index) return null;
                  return { unitId: o.unitId, fromH3Index: from, toH3Index: o.toH3Index };
                })
                .filter((m): m is ResolutionMove => m !== null)
            : [];
        const enabledToolGroupsPayload = Array.from(enabledToolGroups);
        const usePrecomputed = runButtonOn && precomputedAiOrders !== null;
        const readyPayload = {
          enabledToolGroups: enabledToolGroupsPayload,
          precomputedAiOrders: usePrecomputed ? precomputedAiOrders! : [],
          precomputedAiRangedOrders: usePrecomputed ? (precomputedAiRangedOrders ?? []) : [],
        };
        const readyResult = await window.gameApi!.ready(readyPayload);
        if (!readyResult.success) {
          showSidebarError(readyResult.reason ?? 'Ready failed');
          updateReadyButtonState();
          return;
        }
        precomputedAiOrders = null;
        precomputedAiRangedOrders = null;
        if (readyResult.toolInvocationCounts) {
          for (const [groupId, count] of Object.entries(readyResult.toolInvocationCounts)) {
            toolInvocationCounts[groupId] = count;
          }
          updateOpenRouterToolCountLabels();
        }
        if (readyResult.cost !== undefined) {
          openRouterGameCost += readyResult.cost;
          updateOpenRouterCostLabel();
        }
        if (readyResult.aiSkipped) {
          appendOpenRouterLog(readyResult.aiSkipReason ?? 'AI skipped.', true);
          hideAiStrategyToast();
          showMapToast(readyResult.aiSkipReason ?? 'Set your OpenRouter API key and select a model in the panel on the right.', { isError: true });
        } else if (
          (readyResult.aiOrderCount !== undefined && readyResult.aiOrderCount > 0) ||
          (readyResult.aiRangedByType && ((readyResult.aiRangedByType.armor ?? 0) + (readyResult.aiRangedByType.naval ?? 0) > 0))
        ) {
          appendOpenRouterLog(`AI movements: ${readyResult.aiOrderCount ?? 0}.`);
          const ranged = readyResult.aiRangedByType;
          if (ranged && (ranged.armor ?? 0) + (ranged.naval ?? 0) > 0) {
            const parts: string[] = [];
            if (ranged.armor) parts.push(`${ranged.armor} armor`);
            if (ranged.naval) parts.push(`${ranged.naval} naval`);
            appendOpenRouterLog(`AI ranged: ${parts.join(', ')}.`);
          }
          const dropReasons = readyResult.aiDropReasons ?? [];
          let toastText = `AI movements: ${readyResult.aiOrderCount ?? 0}.`;
          if (ranged && (ranged.armor ?? 0) + (ranged.naval ?? 0) > 0) {
            const parts: string[] = [];
            if (ranged.armor) parts.push(`${ranged.armor} armor`);
            if (ranged.naval) parts.push(`${ranged.naval} naval`);
            toastText += ` Ranged: ${parts.join(', ')}.`;
          }
          if (dropReasons.length > 0) {
            toastText += '\n\nDropped: ' + dropReasons.join('; ');
          }
          showMapToast(toastText, { isError: dropReasons.length > 0 });
          if (readyResult.aiStrategy) {
            showAiStrategyToast(readyResult.aiStrategy);
          }
        } else if (readyResult.aiOrderCount === 0) {
          appendOpenRouterLog('Turn resolved (no AI orders).');
          hideMapToast();
          hideAiStrategyToast();
        } else {
          appendOpenRouterLog('Turn resolved.');
          hideMapToast();
          hideAiStrategyToast();
        }
        const state = (await window.gameApi.getGameState()) as GameStateSnapshot;
        gameState = state;
        selectedUnitId = null;
        const aiMoves = readyResult.aiMoves ?? [];
        const resolutionMoves: ResolutionMove[] = [...humanMoves, ...aiMoves];
        const hasRanged = (readyResult.rangedCombatHexes?.length ?? 0) > 0 || (readyResult.rangedCasualtyHexes?.length ?? 0) > 0 || (readyResult.rangedRemovedUnits?.length ?? 0) > 0;
        const hasMelee = (readyResult.meleeCombatHexes?.length ?? 0) > 0 || (readyResult.meleeCasualtyHexes?.length ?? 0) > 0 || (readyResult.meleeRemovedUnits?.length ?? 0) > 0;
        const hasLegacy = (readyResult.combatHexes?.length ?? 0) > 0 || (readyResult.casualtyHexes?.length ?? 0) > 0;
        const needsAnimation = resolutionMoves.length > 0 || hasRanged || hasMelee || hasLegacy;
        if (needsAnimation) {
          if (resolutionMoveAnimationFrameId !== null) cancelAnimationFrame(resolutionMoveAnimationFrameId);
          resolutionMoveAnimation = {
            moves: resolutionMoves,
            startTime: Date.now(),
            combatHexes: readyResult.combatHexes?.length ? readyResult.combatHexes : undefined,
            casualtyHexes: readyResult.casualtyHexes?.length ? readyResult.casualtyHexes : undefined,
            rangedCombatHexes: readyResult.rangedCombatHexes?.length ? readyResult.rangedCombatHexes : undefined,
            rangedCasualtyHexes: readyResult.rangedCasualtyHexes?.length ? readyResult.rangedCasualtyHexes : undefined,
            rangedRemovedUnits: readyResult.rangedRemovedUnits?.length ? readyResult.rangedRemovedUnits : undefined,
            meleeCombatHexes: readyResult.meleeCombatHexes?.length ? readyResult.meleeCombatHexes : undefined,
            meleeCasualtyHexes: readyResult.meleeCasualtyHexes?.length ? readyResult.meleeCasualtyHexes : undefined,
            meleeRemovedUnits: readyResult.meleeRemovedUnits?.length ? readyResult.meleeRemovedUnits : undefined,
          };
          const kills = readyResult.kills;
          if (kills?.length) {
            const killLines = kills.map(
              (k) => `${k.victimId} destroyed by ${k.killerIds.join(', ')}`
            );
            showMapToast(killLines.join('\n'), { isError: false });
          }
          resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
        }
        pendingOrders = [];
        pendingRangedAttacks = [];
        rangedModeActive = false;
        updateGameStateSidebar(state);
        updatePendingOrdersSidebar();
        updateRangedSidebar();
        updateSidebar();
        updateGameOverUI(state);
        updateReadyButtonState();
        if (runButtonOn) startBackgroundRequestIfAllowed();
        redraw();
      } catch (err) {
        showSidebarError(String(err));
        updateReadyButtonState();
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
