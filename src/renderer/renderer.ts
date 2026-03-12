/**
 * Renderer process entry point. Sets up the canvas, view state, hex grid,
 * pan/zoom (mouse drag + wheel), and click-to-select with sidebar.
 */

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
}

/** One executed move (human or AI) for resolution-phase fade animation. */
interface ResolutionMove {
  unitId: string;
  fromH3Index: string;
  toH3Index: string;
}

interface ReadyResult {
  success: boolean;
  reason?: string;
  aiSkipped?: boolean;
  aiSkipReason?: string;
  aiOrderCount?: number;
  aiDropped?: number;
  aiDropReasons?: string[];
  aiMovesLog?: string[];
  aiMoves?: ResolutionMove[];
}

declare global {
  interface Window {
    gameApi?: {
      getGameState: () => Promise<unknown>;
      submitOrders: (orders: { unitId: string; toH3Index: string }[]) => Promise<unknown>;
      ready: () => Promise<ReadyResult>;
      openRouter?: {
        getKey: () => Promise<{ hasKey: boolean }>;
        setKey: (key: string) => Promise<void>;
        listModels: () => Promise<{ models?: { id: string; name?: string }[]; error?: string }>;
        setSelectedModel: (modelId: string) => Promise<void>;
      };
    };
  }
}

/** Map background (style guide: neutral, recedes). */
const BACKGROUND_COLOR = '#e0dcd4';

const UNIT_RADIUS = 22;
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
const RESOLUTION_FADE_MS = 2000;

function getUnitAtHex(h3Index: string): GameStateSnapshot['units'][0] | null {
  if (!gameState) return null;
  return gameState.units.find((u) => u.h3Index === h3Index) ?? null;
}

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
let pendingOrders: { unitId: string; toH3Index: string }[] = [];
let gameState: GameStateSnapshot | null = null;
let isDragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartOffsetX = 0;
let dragStartOffsetY = 0;
const DRAG_THRESHOLD_PX = 5;
let dragDistanceSq = 0;

/** When non-null, we are animating resolution moves (human + AI): arrow + ghost, then fade out over RESOLUTION_FADE_MS. */
let resolutionMoveAnimation: { moves: ResolutionMove[]; startTime: number } | null = null;
let resolutionMoveAnimationFrameId: number | null = null;

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
  let resolutionOpacity = 1;
  if (resolutionMoveAnimation) {
    const elapsed = Date.now() - resolutionMoveAnimation.startTime;
    resolutionOpacity = Math.max(0, 1 - elapsed / RESOLUTION_FADE_MS);
    drawResolutionMoveLines(ctx, view, w, h, resolutionMoveAnimation.moves, gameState.units, hexList, resolutionOpacity);
  }
  if (pendingOrders.length > 0 && gameState.units.length && hexList) {
    drawOrderLines(ctx, view, w, h, pendingOrders, gameState.units, hexList);
  }
  if (gameState.units.length) {
    drawUnits(ctx, view, w, h, gameState.units, hexList);
  }
  if (resolutionMoveAnimation && hexList) {
    drawGhostUnits(ctx, view, w, h, resolutionMoveAnimation.moves, gameState.units, hexList, resolutionOpacity);
  }
}

/**
 * Draws unit markers on the canvas for each unit in the game state.
 * Call after drawHexes so units appear on top. Uses getHexCanvasCenter for placement.
 */
function drawUnits(
  ctx: CanvasRenderingContext2D,
  view: ViewState,
  canvasWidth: number,
  canvasHeight: number,
  units: GameStateSnapshot['units'],
  hexList: string[] | undefined
): void {
  for (const unit of units) {
    const { x, y } = getHexCanvasCenter(
      unit.h3Index,
      view,
      canvasWidth,
      canvasHeight,
      hexList
    );
    const color = PLAYER_COLORS[unit.player] ?? '#333';
    const label = UNIT_TYPE_LABELS[unit.unitType] ?? '?';

    ctx.beginPath();
    ctx.arc(x, y, UNIT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  }
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
 * Draws ghost (duplicate) units at their pre-move positions with optional opacity for fade-out.
 * units are the current game state (post-move); moves give fromH3Index for each unit to draw as ghost.
 */
function drawGhostUnits(
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
    const { x, y } = getHexCanvasCenter(move.fromH3Index, view, canvasWidth, canvasHeight, hexList);
    const color = PLAYER_COLORS[unit.player] ?? '#333';
    const label = UNIT_TYPE_LABELS[unit.unitType] ?? '?';
    ctx.beginPath();
    ctx.arc(x, y, UNIT_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  }
  ctx.restore();
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
  let resolutionOpacity = 1;
  if (resolutionMoveAnimation) {
    const elapsed = Date.now() - resolutionMoveAnimation.startTime;
    resolutionOpacity = Math.max(0, 1 - elapsed / RESOLUTION_FADE_MS);
    drawResolutionMoveLines(ctx, view, w, h, resolutionMoveAnimation.moves, gameState.units, hexList, resolutionOpacity);
  }
  if (pendingOrders.length > 0 && gameState.units.length && hexList) {
    drawOrderLines(ctx, view, w, h, pendingOrders, gameState.units, hexList);
  }
  if (gameState.units.length) {
    drawUnits(ctx, view, w, h, gameState.units, hexList);
  }
  if (resolutionMoveAnimation && hexList) {
    drawGhostUnits(ctx, view, w, h, resolutionMoveAnimation.moves, gameState.units, hexList, resolutionOpacity);
  }
}

function tickResolutionMoveAnimation(): void {
  if (!resolutionMoveAnimation) return;
  const elapsed = Date.now() - resolutionMoveAnimation.startTime;
  redraw();
  if (elapsed < RESOLUTION_FADE_MS) {
    resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
  } else {
    resolutionMoveAnimation = null;
    resolutionMoveAnimationFrameId = null;
    redraw();
  }
}

/** Updates the sidebar with the selected hex's H3 index and cube coordinates, or a placeholder. */
function updateSidebar(): void {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;

  const h3El = document.getElementById('sidebar-h3');
  const cubeEl = document.getElementById('sidebar-cube');

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

function cancelOrderForUnit(unitId: string): void {
  pendingOrders = pendingOrders.filter((o) => o.unitId !== unitId);
  updatePendingOrdersSidebar();
  redraw();
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
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.flexShrink = '0';
    cancelBtn.style.fontSize = '0.8em';
    cancelBtn.addEventListener('click', () => cancelOrderForUnit(order.unitId));
    row.appendChild(label);
    row.appendChild(cancelBtn);
    container.appendChild(row);
  }
}

function showSidebarError(message: string): void {
  const el = document.getElementById('sidebar-error');
  if (el) {
    el.textContent = message;
    el.style.display = 'block';
  }
}

function clearSidebarError(): void {
  const el = document.getElementById('sidebar-error');
  if (el) el.style.display = 'none';
}

function initOpenRouterUI(): void {
  const api = window.gameApi?.openRouter;
  if (!api) return;

  const keyInput = document.getElementById('openrouter-key') as HTMLInputElement | null;
  const keyHint = document.getElementById('openrouter-key-hint');
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

  api.getKey().then((r) => {
    if (keyHint) keyHint.textContent = r.hasKey ? 'Saved' : 'Not set';
  });
  refreshModels();

  if (keyInput) {
    keyInput.addEventListener('blur', () => {
      const v = keyInput.value.trim();
      api!.setKey(v).then(() => {
        if (keyHint) keyHint.textContent = v ? 'Saved' : 'Not set';
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

  document.getElementById('map-toast-dismiss')?.addEventListener('click', hideMapToast);
}

function init(): void {
  resizeAndRedraw();
  updateSidebar();
  updateGameStateSidebar(null);
  updatePendingOrdersSidebar();
  initOpenRouterUI();

  if (window.gameApi) {
    window.gameApi
      .getGameState()
      .then((raw) => {
        const state = raw as GameStateSnapshot;
        gameState = state;
        updateGameStateSidebar(state);
        updateSidebar();
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

    if (hit) {
      const unit = getUnitAtHex(hit);
      if (unit?.player === 'human') {
        // Click on a friendly unit: select that unit (do not add an order). Lets you start a new order for another unit.
        selectedUnitId = unit.id;
      } else if (selectedUnitId && hit !== gameState?.units.find((u) => u.id === selectedUnitId)?.h3Index) {
        // Click on empty or enemy hex with a unit selected: add or replace movement order to this hex.
        const idx = pendingOrders.findIndex((o) => o.unitId === selectedUnitId);
        const newOrder = { unitId: selectedUnitId, toH3Index: hit };
        if (idx >= 0) pendingOrders[idx] = newOrder;
        else pendingOrders.push(newOrder);
        updatePendingOrdersSidebar();
      } else {
        selectedUnitId = null;
      }
    } else {
      selectedUnitId = null;
    }

    updateSidebar();
    redraw();
  });

  const readyBtn = document.getElementById('ready-btn');
  if (readyBtn) {
    readyBtn.addEventListener('click', async () => {
      if (!window.gameApi) return;
      clearSidebarError();
      try {
        const submitResult = (await window.gameApi.submitOrders(pendingOrders)) as { success: boolean; reason?: string };
        if (!submitResult.success) {
          showSidebarError(submitResult.reason ?? 'Submit failed');
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
        appendOpenRouterLog('Requesting AI orders…');
        const readyResult = await window.gameApi.ready();
        if (!readyResult.success) {
          showSidebarError(readyResult.reason ?? 'Ready failed');
          appendOpenRouterLog(`Ready failed: ${readyResult.reason ?? 'Unknown'}`, true);
          showMapToast(readyResult.reason ?? 'Ready failed. See panel on the right.', { isError: true });
          return;
        }
        if (readyResult.aiSkipped) {
          appendOpenRouterLog(readyResult.aiSkipReason ?? 'AI skipped.', true);
          showMapToast(readyResult.aiSkipReason ?? 'Set your OpenRouter API key and select a model in the panel on the right.', { isError: true });
        } else if (readyResult.aiOrderCount !== undefined && readyResult.aiOrderCount > 0) {
          const dropped = readyResult.aiDropped ?? 0;
          const dropReasons = readyResult.aiDropReasons ?? [];
          appendOpenRouterLog(`AI orders applied: ${readyResult.aiOrderCount}${dropped > 0 ? `, ${dropped} dropped` : ''}.`);
          let toastText =
            readyResult.aiMovesLog && readyResult.aiMovesLog.length > 0
              ? 'AI moves:\n' + readyResult.aiMovesLog.join('\n')
              : `AI applied ${readyResult.aiOrderCount} order(s).`;
          if (dropReasons.length > 0) {
            toastText += '\n\nValidation issues (dropped): ' + dropReasons.join('; ');
          }
          showMapToast(toastText, { isError: dropReasons.length > 0 });
        } else if (readyResult.aiOrderCount === 0) {
          appendOpenRouterLog('Turn resolved (no AI orders).');
          hideMapToast();
        } else {
          appendOpenRouterLog('Turn resolved.');
          hideMapToast();
        }
        const state = (await window.gameApi.getGameState()) as GameStateSnapshot;
        gameState = state;
        selectedUnitId = null;
        const aiMoves = readyResult.aiMoves ?? [];
        const resolutionMoves: ResolutionMove[] = [...humanMoves, ...aiMoves];
        if (resolutionMoves.length > 0) {
          if (resolutionMoveAnimationFrameId !== null) cancelAnimationFrame(resolutionMoveAnimationFrameId);
          resolutionMoveAnimation = { moves: resolutionMoves, startTime: Date.now() };
          resolutionMoveAnimationFrameId = requestAnimationFrame(tickResolutionMoveAnimation);
        }
        pendingOrders = [];
        updateGameStateSidebar(state);
        updatePendingOrdersSidebar();
        updateSidebar();
        redraw();
      } catch (err) {
        showSidebarError(String(err));
        appendOpenRouterLog(String(err), true);
        showMapToast('Error: ' + String(err), { isError: true });
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
